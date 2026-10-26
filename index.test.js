import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

test("setup awaits discovery and updates both runtime limits and saved configuration", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-models-test-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  t.mock.method(os, "homedir", () => home);
  const configDirectory = path.join(home, ".config/opencode");
  fs.mkdirSync(configDirectory, { recursive: true });
  const configPath = path.join(configDirectory, "opencode.jsonc");
  const originalLimit = { context: 65536, input: 58982, output: 8192 };
  const config = { provider: {
    office: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://office/v1" },
      models: { qwen: { id: "qwen", limit: originalLimit } } },
    offline: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://offline/v1" },
      models: { local: { id: "local", limit: originalLimit } } },
  } };
  fs.writeFileSync(configPath, JSON.stringify(config));
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.startsWith("http://offline")) throw new Error("Offline");
    return Response.json({ data: [{ id: "qwen", max_input_tokens: 262144, max_output_tokens: 81920 }] });
  });
  const runtimeModel = { limit: originalLimit };
  let registered = false;
  const { default: plugin } = await import("./index.js");
  await plugin.setup({ model: { transform: async (callback) => {
    registered = true;
    callback({
      get: (providerId, modelId) => providerId === "office" && modelId === "qwen" ? runtimeModel : undefined,
      update: (providerId, modelId, update) => update(runtimeModel),
    });
  } } });
  assert.equal(registered, true);
  assert.deepEqual(runtimeModel.limit, { context: 262144, output: 81920, input: 262144 });
  const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.deepEqual(saved.provider.office.models.qwen.limit, runtimeModel.limit);
  assert.deepEqual(saved.provider.offline, config.provider.offline);
});
