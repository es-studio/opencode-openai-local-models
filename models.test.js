import assert from "node:assert/strict";
import { test } from "node:test";
import { createModels, fetchModelsFromUrl } from "./models.js";

test("reads input and output limits returned by the office endpoint", () => {
  const models = createModels([{ id: "qwen", max_input_tokens: 262144, max_output_tokens: 81920 }]);
  assert.deepEqual(models.qwen.limit, { context: 262144, input: 262144, output: 81920 });
});

test("reads server context fields without imposing a synthetic input limit", () => {
  for (const metadata of [
    { meta: { n_ctx: 32768 } },
    { context_length: 32768 },
    { max_model_len: 32768 },
    { max_context_length: 32768 },
    { loaded_context_length: 32768, max_context_length: 262144 },
  ]) {
    const models = createModels([{ id: "local", ...metadata }]);
    assert.deepEqual(models.local.limit, { context: 32768, output: 8192 });
  }
});

test("preserves existing settings when the server provides no limits", () => {
  const existing = { local: { name: "My model", options: { temperature: 0.5 }, limit: {
    context: 131072, input: 120000, output: 16384,
  } } };
  const models = createModels([{ id: "local" }], existing);
  assert.deepEqual(models.local, { ...existing.local, id: "local" });
});

test("updates stale limits and clamps output to a smaller context", () => {
  const models = createModels([{ id: "local", context_length: 4096 }], {
    local: { limit: { context: 65536, input: 58982, output: 8192 } },
  });
  assert.deepEqual(models.local.limit, { context: 4096, output: 4096 });
});

test("ignores invalid limits and uses defaults only for unknown models", () => {
  const models = createModels([{ id: "local", meta: { n_ctx: -1 }, context_length: "32768",
    max_model_len: 0, max_context_length: 32768, max_output_tokens: Infinity }]);
  assert.deepEqual(models.local.limit, { context: 32768, output: 8192 });
  assert.deepEqual(createModels([{ id: "unknown" }]).unknown.limit, { context: 65536, output: 8192 });
});

test("fetches LM Studio metadata and prefers the loaded instance context", async (t) => {
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    urls.push(url);
    assert.equal(options.headers.Authorization, "Bearer test-key");
    if (url.endsWith("/api/v1/models")) {
      return Response.json({ models: [{ key: "local", max_context_length: 262144,
        loaded_instances: [{ id: "custom-alias", config: { context_length: 32768 } }] }] });
    }
    return Response.json({ data: [{ id: "custom-alias" }] });
  });
  const models = await fetchModelsFromUrl("http://localhost:1234/v1/", "test-key");
  assert.equal(models["custom-alias"].limit.context, 32768);
  assert.deepEqual(urls, ["http://localhost:1234/v1/models", "http://localhost:1234/api/v1/models"]);
});

test("uses LM Studio model maximum for an unloaded model", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => Response.json(url.endsWith("/api/v1/models")
    ? { models: [{ key: "local", max_context_length: 131072, loaded_instances: [] }] }
    : { data: [{ id: "local" }] }));
  assert.equal((await fetchModelsFromUrl("http://localhost/v1")).local.limit.context, 131072);
});

test("keeps existing limits if the optional metadata endpoint is unavailable", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.endsWith("/api/v1/models")) throw new Error("Offline");
    return Response.json({ data: [{ id: "local" }] });
  });
  const models = await fetchModelsFromUrl("http://localhost/v1", "dummy", {
    local: { limit: { context: 32768, output: 4096 } },
  });
  assert.deepEqual(models.local.limit, { context: 32768, output: 4096 });
});

test("rejects empty model lists and failed primary requests", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: [] }));
  await assert.rejects(fetchModelsFromUrl("http://localhost/v1"), /No models/);
  globalThis.fetch = async () => new Response(null, { status: 503 });
  await assert.rejects(fetchModelsFromUrl("http://localhost/v1"), /HTTP 503/);
});
