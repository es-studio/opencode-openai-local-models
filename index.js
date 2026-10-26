/**
 * opencode-openai-local-models
 * 
 * OpenCode 플러그인 규격 준수:
 * export default { id: string, setup(ctx) { ... } }
 */

import fs from "fs";
import os from "os";
import path from "path";
import { fetchModelsFromUrl } from "./models.js";

const CONFIG_PATH = path.join(os.homedir(), ".config/opencode/opencode.jsonc");

async function syncLocalModels(ctx) {
  if (!fs.existsSync(CONFIG_PATH)) return;

  let rawText;
  try {
    rawText = fs.readFileSync(CONFIG_PATH, "utf-8");
  } catch {
    return;
  }

  const cleanJsonText = rawText.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, "$1");
  let config;
  try {
    config = JSON.parse(cleanJsonText);
  } catch {
    return;
  }

  if (!config.provider) return;
  let changed = false;

  const entries = Object.entries(config.provider);
  await Promise.allSettled(
    entries.map(async ([providerId, prov]) => {
      const isCompatible = prov.npm === "@ai-sdk/openai-compatible" || prov.api === "openai-compatible";
      const baseURL = prov.options?.baseURL;
      if (!isCompatible || !baseURL) return;

      try {
        const newModels = await fetchModelsFromUrl(baseURL, prov.options?.apiKey, prov.models, 2000);
        if (ctx.model?.transform) {
          await ctx.model.transform((editor) => {
            for (const [modelId, model] of Object.entries(newModels)) {
              if (!editor.get(providerId, modelId)) continue;
              editor.update(providerId, modelId, (draft) => {
                draft.limit = model.limit;
              });
            }
          });
        }

        // 기존 models 와 다른 경우에만 업데이트
        if (JSON.stringify(prov.models) !== JSON.stringify(newModels)) {
          prov.models = newModels;
          changed = true;
        }
      } catch {
        // 서버 오프라인 시 무시
      }
    })
  );

  if (changed) {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
    } catch {}
  }
}

export default {
  id: "opencode.openai-local-models",
  async setup(ctx) {
    await syncLocalModels(ctx);
  },
};
