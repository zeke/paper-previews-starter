import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  cp,
  symlink,
  writeFile,
  readFile,
  rm,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("pause stops the updater before config, Paper reads or deployment", async () => {
  const source = fileURLToPath(new URL("../", import.meta.url));
  const root = await mkdtemp(path.join(os.tmpdir(), "paper-pause-test-"));
  try {
    for (const directory of ["src", "scripts"])
      await cp(path.join(source, directory), path.join(root, directory), {
        recursive: true,
      });
    await symlink(
      path.join(source, "node_modules"),
      path.join(root, "node_modules"),
      "dir",
    );
    await mkdir(path.join(root, ".state"));
    await writeFile(
      path.join(root, ".state/manifest.json"),
      "last complete snapshot",
    );
    const pause = spawnSync(
      process.execPath,
      [path.join(root, "scripts/pause.mjs")],
      { encoding: "utf8", timeout: 5000 },
    );
    assert.equal(pause.status, 0, pause.stderr);
    const update = spawnSync(
      process.execPath,
      [path.join(root, "scripts/update.mjs")],
      { encoding: "utf8", timeout: 5000 },
    );
    assert.equal(update.status, 0, update.stderr);
    assert.match(update.stdout, /"event":"paused"/);
    assert.equal(
      await readFile(path.join(root, ".state/manifest.json"), "utf8"),
      "last complete snapshot",
    );
    await assert.rejects(
      readFile(path.join(root, ".state/lock/owner.json")),
      /ENOENT/,
    );
    const resume = spawnSync(
      process.execPath,
      [path.join(root, "scripts/pause.mjs"), "resume"],
      { encoding: "utf8", timeout: 5000 },
    );
    assert.equal(resume.status, 0, resume.stderr);
    await assert.rejects(
      readFile(path.join(root, ".state/pause.json")),
      /ENOENT/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
