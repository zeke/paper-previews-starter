import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadConfig } from "../src/config.mjs";

if (process.platform !== "darwin")
  throw Error("Automatic native exports require Paper Desktop on macOS");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = await loadConfig(root);
const label = config.agentLabel;
const protectedFolders = ["Documents", "Desktop", "Downloads"].map(
  (name) => path.join(os.homedir(), name) + path.sep,
);
if (protectedFolders.some((folder) => root.startsWith(folder)))
  throw Error(
    "Install from a persistent directory outside Documents, Desktop and Downloads, such as ~/.local/share/paper-previews",
  );
const target = `gui/${process.getuid()}`;
const existing = spawnSync("/bin/launchctl", ["print", `${target}/${label}`], {
  encoding: "utf8",
});
if (existing.status === 0)
  throw Error(
    "This agent label is already installed; inspect or unload that job before replacing it",
  );
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const node = escape(process.execPath);
const executablePath = escape(
  path.dirname(process.execPath) +
    ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
);
const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${escape(label)}</string><key>ProgramArguments</key><array><string>${node}</string><string>${escape(root)}/scripts/update.mjs</string></array><key>WorkingDirectory</key><string>${escape(root)}</string><key>StartInterval</key><integer>${config.pollSeconds}</integer><key>RunAtLoad</key><true/><key>ProcessType</key><string>Background</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>${executablePath}</string><key>WRANGLER_SEND_METRICS</key><string>false</string></dict><key>StandardOutPath</key><string>${escape(root)}/.state/service.log</string><key>StandardErrorPath</key><string>${escape(root)}/.state/service-error.log</string></dict></plist>`;
await mkdir(path.join(root, ".state"), { recursive: true });
const folder = path.join(os.homedir(), "Library/LaunchAgents");
await mkdir(folder, { recursive: true });
const file = path.join(folder, label + ".plist");
await writeFile(file, plist, { flag: "wx" });
const result = spawnSync("/bin/launchctl", ["bootstrap", target, file], {
  stdio: "inherit",
});
if (result.status !== 0)
  throw Error(`Agent file saved but bootstrap failed (${result.status})`);
console.log(
  `Installed ${label}; checks every ${config.pollSeconds} seconds while logged in`,
);
