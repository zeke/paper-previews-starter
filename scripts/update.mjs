import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, printParseErrorCode } from "jsonc-parser";
import { Paper } from "../src/paper.mjs";
import { loadConfig } from "../src/config.mjs";
import { sync, readJSON, atomicJSON, hash } from "../src/sync.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
await mkdir(".state", { recursive: true });
const pause = await readJSON(".state/pause.json", null);
if (pause) {
  console.log(
    JSON.stringify({
      event: "paused",
      reason: pause.reason ?? "Publishing paused",
    }),
  );
  process.exit(0);
}
try {
  await mkdir(".state/lock");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  const owner = await readJSON(".state/lock/owner.json", {});
  if (!owner.pid) {
    console.log("Lock pending; inspect .state/lock before retrying");
    process.exit(0);
  }
  let alive = true;
  try {
    process.kill(owner.pid, 0);
  } catch (failure) {
    if (failure.code === "ESRCH") alive = false;
  }
  if (alive) {
    console.log("Update already running; skipping");
    process.exit(0);
  }
  await rm(".state/lock", { recursive: true, force: true });
  await mkdir(".state/lock");
}
await atomicJSON(".state/lock/owner.json", { pid: process.pid });

try {
  const config = await loadConfig(root);
  const refreshIndex = process.argv.indexOf("--refresh-board");
  const refreshIds = refreshIndex < 0 ? [] : [process.argv[refreshIndex + 1]];
  if (refreshIndex >= 0 && !/^[0-9a-f-]{36}$/.test(refreshIds[0] ?? ""))
    throw Error("--refresh-board requires the stable public board UUID");
  console.log(
    JSON.stringify({
      event: "checking",
      time: new Date().toISOString(),
      files: config.files.length,
    }),
  );
  const result = await sync({
    paper: await new Paper(config.paperUrl).connect(),
    config,
    root,
    refreshIds,
  });
  const release = await readJSON(".state/release.json");
  const published = await readJSON(".state/published.json", {});
  let publicOrigin = published.publicOrigin;

  if (config.publish) {
    const deploymentSource = await readFile(
      path.resolve(root, config.deploymentConfig),
      "utf8",
    );
    const errors = [];
    const wrangler = parse(deploymentSource, errors, {
      allowTrailingComma: true,
    });
    if (errors.length)
      throw Error(
        `Invalid deployment config: ${errors.map((e) => printParseErrorCode(e.error)).join(", ")}`,
      );
    if (!wrangler || !/^[a-z0-9][a-z0-9-]*$/.test(wrangler.name ?? ""))
      throw Error(
        "Set a unique lowercase Worker name in your local Wrangler config",
      );
    if (wrangler.routes?.length)
      throw Error(
        "Configure custom domains separately in Cloudflare; unattended deployment must not override DNS",
      );
    const codeHash = hash(
      (await readFile("src/worker.mjs", "utf8")) + deploymentSource,
    );
    if (
      published.revision !== release.revision ||
      published.codeHash !== codeHash
    ) {
      wrangler.assets = {
        directory: release.directory,
        binding: "ASSETS",
        run_worker_first: true,
      };
      wrangler.vars = { ...wrangler.vars, GALLERY_ID: release.galleryId };
      wrangler.main = path.join(root, "src/worker.mjs");
      await writeFile(".state/deploy.json", JSON.stringify(wrangler, null, 2));
      const executable = path.join(root, "node_modules/.bin/wrangler");
      const deployment = spawnSync(
        executable,
        ["deploy", "--config", path.join(root, ".state/deploy.json")],
        {
          encoding: "utf8",
          timeout: 180000,
          env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
        },
      );
      process.stdout.write(deployment.stdout ?? "");
      process.stderr.write(deployment.stderr ?? "");
      if (deployment.error || deployment.status !== 0)
        throw Error(
          "Deployment failed; the staged release will retry next run",
        );
      publicOrigin =
        deployment.stdout?.match(
          /https:\/\/[a-z0-9.-]+\.workers\.dev\b/,
        )?.[0] ?? publicOrigin;
      await atomicJSON(".state/published.json", {
        ...release,
        codeHash,
        publicOrigin,
      });
    }
  }
  const galleryPath = `/g/${release.galleryId}/`;
  console.log(
    JSON.stringify({
      changed: result.changed,
      boards: result.manifest.boards.length,
      gallery: publicOrigin ? publicOrigin + galleryPath : galleryPath,
      revision: release.revision,
      publishing: config.publish,
    }),
  );
} finally {
  await rm(".state/lock", { recursive: true, force: true });
}
