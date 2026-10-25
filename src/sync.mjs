import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  copyFile,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { creationTimestamp, orderDesigns, ORDERING_VERSION } from "./order.mjs";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const slug = (name) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "design";
export async function readJSON(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}
export async function atomicJSON(file, value) {
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2));
  await rename(`${file}.tmp`, file);
}
export function pngSize(bytes) {
  if (
    bytes.length < 24 ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  )
    throw Error("Invalid PNG");
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (!width || !height) throw Error("Empty PNG");
  return { width, height };
}
export async function inventory(paper, config) {
  if (
    !Array.isArray(config.files) ||
    !config.files.length ||
    config.files.some((f) => typeof f.fileId !== "string" || !f.fileId.trim())
  )
    throw Error("Explicit nonempty file ID allow-list required");
  const boards = [];
  for (const { fileId } of config.files) {
    const basic = await paper.call("get_basic_info", { fileId });
    for (const page of basic.pages.filter((p) => p.type === "page")) {
      const info = await paper.call("get_basic_info", {
        fileId,
        pageId: page.id,
      });
      for (const board of info.artboards) {
        const jsx = await paper.call("get_jsx", {
          fileId,
          nodeId: board.id,
          includeNodeIds: false,
        });
        const meta = {
          fileId,
          nodeId: board.id,
          pageId: page.id,
          fileName: info.fileName,
          pageName: info.pageName,
          name: board.name,
          sourceCreatedAt: creationTimestamp(board.createdAt),
        };
        // Token metadata participates: JSX may reference CSS variables.
        const sourceHash = hash(
          JSON.stringify({
            jsx,
            tokens: info.tokens,
            name: board.name,
            page: info.pageName,
            width: board.width,
            height: board.height,
            exportScale: config.exportScale ?? "1x",
          }),
        );
        boards.push({ ...meta, sourceHash });
      }
    }
  }
  return boards;
}
export async function sync({
  paper,
  config,
  root = ".",
  refreshIds = [],
  pause = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const stateDir = path.resolve(root, ".state");
  await mkdir(path.join(stateDir, "objects"), { recursive: true });
  const prior = await readJSON(path.join(stateDir, "manifest.json"), {
    galleryId: randomUUID(),
    boards: [],
  });
  const staged = await readJSON(path.join(stateDir, "staged.json"), {});
  const first = await inventory(paper, config);
  await pause(config.settleMs);
  const second = await inventory(paper, config);
  if (!second.length)
    throw Error("No boards returned; previous release preserved");
  const signature = (rows) =>
    JSON.stringify(rows.map((b) => [b.fileId, b.nodeId, b.sourceHash]));
  if (signature(first) !== signature(second))
    throw Error("Design still changing; previous release preserved");
  const next = [];
  let nextSequence = Math.max(
    0,
    ...prior.boards.map((board) => board.createdSequence ?? 0),
  );
  let changed =
    prior.boards.length !== second.length ||
    prior.title !== config.title ||
    prior.pollSeconds !== config.pollSeconds;
  for (const board of second) {
    const old = prior.boards.find(
      (b) => b.fileId === board.fileId && b.nodeId === board.nodeId,
    );
    const refresh = old && refreshIds.includes(old.id);
    const chronology = {
      createdSequence: old?.createdSequence ?? ++nextSequence,
      sourceCreatedAt: board.sourceCreatedAt ?? old?.sourceCreatedAt ?? null,
    };
    if (old?.sourceHash === board.sourceHash && !refresh) {
      next.push({ ...old, ...chronology });
      continue;
    }
    changed = true;
    const key = `${board.fileId}/${board.nodeId}`;
    if (staged[key]?.sourceHash === board.sourceHash && !refresh) {
      next.push({ ...staged[key], ...chronology });
      continue;
    }
    let result, exported;
    for (let attempt = 0; attempt < 2; attempt++) {
      result = await paper.call("export", {
        fileId: board.fileId,
        pageId: board.pageId,
        nodes: {
          [board.nodeId]: [
            { format: "png", scale: config.exportScale ?? "1x" },
          ],
        },
      });
      exported = result.exports?.find(
        (e) => e.nodeId === board.nodeId,
      )?.filePath;
      if (exported) break;
      await pause(1000);
    }
    if (!exported)
      throw Error(
        `Paper returned no export for ${board.name}: ${JSON.stringify(result)}`,
      );
    // Only read the exact path returned by this export, never scan Downloads.
    const bytes = await readFile(exported);
    const size = pngSize(bytes);
    const imageHash = hash(bytes);
    await writeFile(path.join(stateDir, "objects", imageHash + ".png"), bytes);
    // Paper creates a fresh suffixed filename. Clean only this call's returned file.
    await unlink(exported);
    const entry = {
      ...board,
      ...chronology,
      ...size,
      id: old?.id ?? randomUUID(),
      imageHash,
      updatedAt: new Date().toISOString(),
    };
    next.push(entry);
    staged[key] = entry;
    await atomicJSON(path.join(stateDir, "staged.json"), staged);
  }
  const ordered = orderDesigns(next);
  changed ||=
    prior.orderingVersion !== ORDERING_VERSION ||
    prior.orderingBasis !== ordered.basis ||
    prior.boards.map((board) => board.id).join() !==
      ordered.boards.map((board) => board.id).join();
  // Reject a partial edit even if it happened during native image rendering.
  if (
    changed &&
    signature(second) !== signature(await inventory(paper, config))
  )
    throw Error("Design changed during export; previous release preserved");
  if (!changed) return { changed: false, manifest: prior };
  const now = new Date().toISOString();
  const manifest = {
    galleryId: prior.galleryId,
    title: config.title,
    pollSeconds: config.pollSeconds,
    revision: randomUUID(),
    updatedAt: now,
    orderingVersion: ORDERING_VERSION,
    orderingBasis: ordered.basis,
    boards: ordered.boards,
  };
  // Complete immutable release before making it eligible for publishing.
  const release = path.resolve(root, "releases", manifest.revision);
  await mkdir(release, { recursive: true });
  const publicBoards = [];
  for (const board of manifest.boards) {
    const relative = `g/${manifest.galleryId}/images/${board.id}/${board.imageHash}/${slug(board.name)}.png`;
    const dest = path.join(release, relative);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(
      path.join(stateDir, "objects", board.imageHash + ".png"),
      dest,
    );
    // Do not publish native IDs, file URLs, JSX, or unrelated inventory.
    publicBoards.push({
      id: board.id,
      name: board.name,
      pageName: board.pageName,
      width: board.width,
      height: board.height,
      updatedAt: board.updatedAt,
      image: `/${relative}`,
      revision: board.imageHash,
    });
  }
  const publicManifest = {
    title: manifest.title,
    galleryId: manifest.galleryId,
    revision: manifest.revision,
    updatedAt: now,
    pollSeconds: config.pollSeconds,
    ordering: "newest-design-first",
    orderingBasis: ordered.basis,
    boards: publicBoards,
  };
  await mkdir(path.join(release, "g", manifest.galleryId), { recursive: true });
  await writeFile(
    path.join(release, "g", manifest.galleryId, "manifest.json"),
    JSON.stringify(publicManifest),
  );
  await atomicJSON(path.join(stateDir, "manifest.json"), manifest);
  await atomicJSON(path.join(stateDir, "release.json"), {
    directory: release,
    galleryId: manifest.galleryId,
    revision: manifest.revision,
  });
  return { changed: true, manifest };
}
