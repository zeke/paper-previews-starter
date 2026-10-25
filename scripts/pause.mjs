import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicJSON } from "../src/sync.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const state = path.join(root, ".state");
await mkdir(state, { recursive: true });
if (process.argv[2] === "resume") {
  await rm(path.join(state, "pause.json"), { force: true });
  console.log(
    "Polling resumes on the next scheduled run. Use npm run update to check now.",
  );
} else {
  await atomicJSON(path.join(state, "pause.json"), {
    reason: "Design edits in progress",
    pausedAt: new Date().toISOString(),
  });
  console.log(
    "Polling paused. The last published gallery stays online. Use npm run resume when edits are complete.",
  );
}
