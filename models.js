function tokenLimit(...values) {
  return values.find((value) => Number.isSafeInteger(value) && value > 0);
}

function contextLimit(model) {
  return tokenLimit(
    model.meta?.n_ctx,
    model.loaded_context_length,
    model.context_length,
    model.max_model_len,
    model.max_context_length,
    model.max_input_tokens,
  );
}

export function createModels(list, existingModels = {}) {
  const models = {};
  for (const model of list) {
    const id = model.id || model.name;
    if (!id) continue;

    const existing = existingModels[id];
    const reportedContext = contextLimit(model);
    const context = reportedContext ?? tokenLimit(existing?.limit?.context) ?? 65536;
    const output = Math.min(context, tokenLimit(
      model.meta?.max_output_length,
      model.max_output_tokens,
      existing?.limit?.output,
    ) ?? 8192);
    const input = tokenLimit(model.max_input_tokens)
      ?? (reportedContext === undefined ? tokenLimit(existing?.limit?.input) : undefined);
    const limit = { ...existing?.limit, context, output };
    delete limit.input;
    if (input !== undefined) limit.input = Math.min(input, context);

    models[id] = { ...existing, id, name: model.name || existing?.name || id, limit };
  }
  return models;
}

async function fetchJson(url, headers, timeout) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.json();
}

export async function fetchModelsFromUrl(baseURL, apiKey, existingModels = {}, timeout = 3000) {
  const cleanBase = baseURL.replace(/\/+$/, "");
  const modelsURL = cleanBase.endsWith("/models") ? cleanBase : `${cleanBase}/models`;
  const headers = { Accept: "application/json" };
  if (apiKey && apiKey !== "dummy" && apiKey !== "none") {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const data = await fetchJson(modelsURL, headers, timeout);
  let list = Array.isArray(data) ? data : data.data;
  if (!Array.isArray(list) || !list.length) throw new Error("No models returned from endpoint");

  if (list.some((model) => contextLimit(model) === undefined) && /\/v1\/models$/.test(modelsURL)) {
    try {
      const metadataURL = modelsURL.replace(/\/v1\/models$/, "/api/v1/models");
      const metadata = await fetchJson(metadataURL, headers, timeout);
      if (Array.isArray(metadata.models)) {
        list = list.map((model) => {
          if (contextLimit(model) !== undefined) return model;
          const details = metadata.models.find((entry) => entry.key === model.id
            || entry.loaded_instances?.some((instance) => instance.id === model.id));
          if (!details) return model;
          const instances = details.loaded_instances ?? [];
          const instance = instances.find((entry) => entry.id === model.id)
            ?? (instances.length === 1 ? instances[0] : undefined);
          const context = tokenLimit(instance?.config?.context_length, details.max_context_length);
          return { ...model, context_length: context };
        });
      }
    } catch {}
  }

  const models = createModels(list, existingModels);
  if (!Object.keys(models).length) throw new Error("No valid models returned from endpoint");
  return models;
}
