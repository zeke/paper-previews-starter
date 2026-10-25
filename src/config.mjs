import { readFile } from "node:fs/promises";
import path from "node:path";

export function validateConfig(value) {
  if (
    !value ||
    !Array.isArray(value.files) ||
    !value.files.length ||
    value.files.some(
      (file) => typeof file.fileId !== "string" || !file.fileId.trim(),
    )
  ) {
    throw Error(
      "config.json needs a nonempty files allow-list with explicit fileId values",
    );
  }
  const config = {
    title: "Paper previews",
    settleMs: 5000,
    pollSeconds: 300,
    publish: false,
    paperUrl: "http://127.0.0.1:29979/mcp",
    deploymentConfig: "wrangler.local.jsonc",
    exportScale: "1x",
    agentLabel: "dev.paper-previews.updater",
    ...value,
  };
  if (typeof config.title !== "string" || !config.title.trim())
    throw Error("title must be a nonempty string");
  if (typeof config.publish !== "boolean")
    throw Error("publish must be true or false");
  if (!Number.isInteger(config.settleMs) || config.settleMs < 1000)
    throw Error("settleMs must be at least 1000");
  if (!Number.isInteger(config.pollSeconds) || config.pollSeconds < 60)
    throw Error("pollSeconds must be at least 60");
  if (!/^\d+(\.\d+)?(x|w|h|p)$/.test(config.exportScale))
    throw Error("exportScale must be a Paper scale, for example 1x or 1440w");
  if (typeof config.deploymentConfig !== "string" || !config.deploymentConfig)
    throw Error(
      "deploymentConfig must name a local Wrangler JSON configuration",
    );
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+$/.test(config.agentLabel))
    throw Error(
      "agentLabel must contain only letters, digits, dots and hyphens",
    );
  const url = new URL(config.paperUrl);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw Error("paperUrl must be an unauthenticated local HTTP MCP endpoint");
  return config;
}

export async function loadConfig(root) {
  let value;
  try {
    value = JSON.parse(await readFile(path.join(root, "config.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT")
      throw Error(
        "Copy config.example.json to config.json and select your Paper file IDs first",
      );
    throw error;
  }
  return validateConfig(value);
}
