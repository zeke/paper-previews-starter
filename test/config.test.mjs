import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../src/config.mjs";
import { Paper } from "../src/paper.mjs";

test("configuration defaults to local exports and explicit file scope", () => {
  const value = validateConfig({ files: [{ fileId: "selected-file" }] });
  assert.equal(value.publish, false);
  assert.equal(value.pollSeconds, 300);
  assert.equal(value.exportScale, "1x");
  assert.equal(value.deploymentConfig, "wrangler.local.jsonc");
  for (const files of [[], [{}], [{ fileId: " " }], null])
    assert.throws(() => validateConfig({ files }), /allow-list/);
});

test("configuration rejects remote Paper endpoints and unsafe option values", () => {
  const valid = { files: [{ fileId: "selected-file" }] };
  for (const patch of [
    { publish: "true" },
    { pollSeconds: 0 },
    { settleMs: 0 },
    { exportScale: "../../file" },
    { agentLabel: "<bad>" },
    { paperUrl: "https://example.com/mcp" },
    { paperUrl: "http://secret@localhost/mcp" },
  ])
    assert.throws(() => validateConfig({ ...valid, ...patch }));
  assert.throws(() => new Paper("https://example.com/mcp"), /local HTTP/);
  assert.throws(() => new Paper("http://secret@localhost/mcp"), /local HTTP/);
  assert.doesNotThrow(() => new Paper("http://127.0.0.1:29979/mcp"));
});
