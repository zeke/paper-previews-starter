import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateSync, crc32 } from "node:zlib";
import { sync, slug } from "../src/sync.mjs";
import worker from "../src/worker.mjs";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
const chunk = (type, data) => {
  const t = Buffer.from(type),
    size = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([size, t, data, crc]);
};
const ihdr = Buffer.from("00000001000000010802000000", "hex");
const bluePNG = Buffer.concat([
  png.subarray(0, 8),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(Buffer.from([0, 0, 0, 255]))),
  chunk("IEND", Buffer.alloc(0)),
]);
test("atomic updates, no-op dedup, rename stability, scope and partial-edit protection", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "paper-preview-test-"));
  let content = "one",
    name = "Board one",
    exports = 0,
    calls = [],
    failExport = false;
  const paper = {
    call: async (tool, args) => {
      calls.push(args);
      assert.equal(args.fileId, "selected");
      if (tool === "get_basic_info")
        return {
          pages: [{ type: "page", id: "page" }],
          fileName: "Test",
          pageName: "Page",
          tokens: {},
          artboards: [{ id: "board", name, width: 1, height: 1 }],
        };
      if (tool === "get_jsx") return content;
      if (tool === "export") {
        if (failExport) return { exports: [] };
        exports++;
        const filePath = path.join(root, `native-${exports}.png`);
        await writeFile(filePath, content === "two" ? bluePNG : png);
        return { exports: [{ nodeId: "board", filePath }] };
      }
      throw Error(tool);
    },
  };
  const options = {
    root,
    paper,
    config: {
      title: "Test",
      files: [{ fileId: "selected" }],
      settleMs: 0,
      pollSeconds: 300,
    },
    pause: async () => {},
  };
  try {
    const a = await sync(options);
    assert.equal(a.changed, true);
    assert.equal(exports, 1);
    const b = await sync(options);
    assert.equal(b.changed, false);
    assert.equal(exports, 1);
    const id = a.manifest.boards[0].id;
    content = "two";
    name = "Renamed <script>";
    const c = await sync(options);
    assert.equal(c.manifest.boards[0].id, id);
    assert.equal(exports, 2);
    assert.notEqual(
      c.manifest.boards[0].imageHash,
      a.manifest.boards[0].imageHash,
    );
    name = "Second rename";
    const renamed = await sync(options);
    assert.equal(renamed.manifest.boards[0].id, id);
    assert.equal(exports, 3);
    assert.equal(
      renamed.manifest.boards[0].imageHash,
      c.manifest.boards[0].imageHash,
    );
    const last = await readFile(path.join(root, ".state/release.json"), "utf8");
    failExport = true;
    content = "three";
    await assert.rejects(sync(options), /no export/);
    assert.equal(
      await readFile(path.join(root, ".state/release.json"), "utf8"),
      last,
    );
    failExport = false;
    await assert.rejects(
      sync({
        ...options,
        pause: async () => {
          content = "in flight";
        },
      }),
      /still changing/,
    );
    assert.equal(
      await readFile(path.join(root, ".state/release.json"), "utf8"),
      last,
    );
    const release = JSON.parse(last);
    const pub = await readFile(
      path.join(release.directory, "g", release.galleryId, "manifest.json"),
      "utf8",
    );
    assert.ok(!pub.includes("fileId"));
    assert.ok(!pub.includes("nodeId"));
    assert.ok(!pub.includes("selected"));
    assert.match(id, /^[0-9a-f-]{36}$/);
    assert.equal(slug("Café · A / Public"), "cafe-a-public");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("empty inventory and missing scope cannot replace a valid release", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "paper-preview-test-"));
  let calls = 0;
  const paper = {
    call: async () => {
      calls++;
      return { pages: [{ type: "page", id: "p" }], artboards: [] };
    },
  };
  try {
    await assert.rejects(
      sync({ root, paper, config: { files: [] }, pause: async () => {} }),
      /allow-list/,
    );
    assert.equal(calls, 0);
    await assert.rejects(
      sync({
        root,
        paper,
        config: { files: [{ fileId: "selected" }] },
        pause: async () => {},
      }),
      /No boards/,
    );
    await assert.rejects(
      readFile(path.join(root, ".state/release.json")),
      /ENOENT/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("failed export preserves previous release", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "paper-preview-test-"));
  const paper = {
    call: async (tool) =>
      tool === "get_basic_info"
        ? {
            pages: [{ type: "page", id: "p" }],
            artboards: [{ id: "b", name: "B" }],
          }
        : tool === "get_jsx"
          ? "a"
          : { exports: [] },
  };
  await assert.rejects(
    sync({
      root,
      paper,
      config: { files: [{ fileId: "f" }], settleMs: 0 },
      pause: async () => {},
    }),
    /no export/,
  );
  await assert.rejects(
    readFile(path.join(root, ".state/release.json")),
    /ENOENT/,
  );
  await rm(root, { recursive: true, force: true });
});

test("new boards are discovered only within the allowed file and keep existing links", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "paper-discovery-test-"));
  const boards = [{ id: "first", name: "First board" }];
  let exports = 0;
  const paper = {
    call: async (tool, args) => {
      assert.equal(args.fileId, "selected-file");
      if (tool === "get_basic_info")
        return {
          pages: [{ type: "page", id: "page" }],
          pageName: "Page",
          artboards: [...boards],
        };
      if (tool === "get_jsx") return args.nodeId;
      if (tool === "export") {
        exports++;
        const nodeId = Object.keys(args.nodes)[0];
        const filePath = path.join(root, `export-${exports}.png`);
        await writeFile(filePath, png);
        return { exports: [{ nodeId, filePath }] };
      }
      throw Error(tool);
    },
  };
  const options = {
    root,
    paper,
    config: {
      title: "Test",
      files: [{ fileId: "selected-file" }],
      settleMs: 0,
      pollSeconds: 300,
    },
    pause: async () => {},
  };
  try {
    const before = await sync(options);
    boards.push({ id: "second", name: "New completed board" });
    const after = await sync(options);
    assert.equal(after.manifest.boards.length, 2);
    assert.equal(after.manifest.boards[0].id, before.manifest.boards[0].id);
    assert.equal(exports, 2);
    const release = await readFile(
      path.join(root, ".state/release.json"),
      "utf8",
    );
    await assert.rejects(
      sync({
        ...options,
        pause: async () => {
          boards.push({ id: "in-flight", name: "Still being created" });
        },
      }),
      /still changing/,
    );
    assert.equal(
      await readFile(path.join(root, ".state/release.json"), "utf8"),
      release,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Worker root stays neutral, routes opaque links and preserves full-height images", async () => {
  const galleryId = "11111111-1111-4111-8111-111111111111",
    id = "22222222-2222-4222-8222-222222222222";
  const data = {
    galleryId,
    title: "Test",
    revision: "abcd1234-rest",
    updatedAt: "now",
    pollSeconds: 300,
    boards: [
      {
        id,
        name: "<script>alert(1)</script>",
        pageName: "Page",
        width: 1440,
        height: 3742,
        updatedAt: "now",
        image: `/g/${galleryId}/images/${id}/hash/board.png`,
      },
    ],
  };
  const env = {
    GALLERY_ID: galleryId,
    ASSETS: { fetch: async () => Response.json(data) },
  };
  const get = (p) => worker.fetch(new Request("https://preview.test" + p), env);
  const landing = await get("/");
  assert.equal(landing.status, 200);
  const landingHTML = await landing.text();
  assert.match(landingHTML, /complete preview link/);
  assert.ok(!landingHTML.includes(galleryId));
  assert.ok(!landingHTML.includes(id));
  assert.equal(
    (await get("/g/33333333-3333-4333-8333-333333333333/")).status,
    404,
  );
  const response = await get(`/g/${galleryId}/b/${id}`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes("<script>alert"));
  assert.match(html, /height:auto/);
  assert.match(html, /height="3742"/);
  assert.equal(
    (await get(`/g/${galleryId}/b/44444444-4444-4444-8444-444444444444`))
      .status,
    404,
  );
  const image = await get(data.boards[0].image);
  assert.match(image.headers.get("cache-control"), /immutable/);
});
