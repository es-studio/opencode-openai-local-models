#!/usr/bin/env node

/**
 * opencode-openai-local-models
 * 
 * 1. 기본 실행:
 *    node sync.js
 *    ~/.config/opencode/opencode.jsonc 에 등록된 모든 OpenAI 호환 provider의
 *    /models 를 조회하여 현재 로드된 모델 목록을 opencode.jsonc 에 자동 동기화합니다.
 * 
 * 2. 신규 엔드포인트 바로 추가:
 *    node sync.js add http://192.168.136.188:8080/v1 [apiKey] [providerName]
 *    지정한 URL의 모델을 즉시 감지하여 opencode.jsonc 에 provider 로 자동 등록합니다.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { fetchModelsFromUrl } from "./models.js";

const CONFIG_PATH = path.join(os.homedir(), ".config/opencode/opencode.jsonc");

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Error: Config file not found at ${CONFIG_PATH}`);
    process.exit(1);
  }

  const rawText = fs.readFileSync(CONFIG_PATH, "utf-8");
  const cleanJsonText = rawText.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, "$1");
  
  let config;
  try {
    config = JSON.parse(cleanJsonText);
  } catch (err) {
    console.error("Error parsing opencode.jsonc:", err.message);
    process.exit(1);
  }

  config.provider = config.provider || {};
  config.enabled_providers = config.enabled_providers || [];

  const args = process.argv.slice(2);

  // [기능 2] 신규 URL 추가 모드: node sync.js add <url> [apiKey] [name]
  if (args[0] === "add") {
    const url = args[1];
    if (!url) {
      console.error("Usage: node sync.js add <baseURL> [apiKey] [providerName]");
      process.exit(1);
    }
    const apiKey = args[2] || "dummy";
    let providerName = args[3];
    if (!providerName) {
      try {
        const u = new URL(url);
        providerName = `${u.hostname}:${u.port || (u.protocol === 'https:' ? 443 : 80)}`;
      } catch {
        providerName = "custom-openai";
      }
    }

    console.log(`Adding new provider [${providerName}] from ${url}...`);
    try {
      const models = await fetchModelsFromUrl(url, apiKey, config.provider[providerName]?.models);
      config.provider[providerName] = {
        npm: "@ai-sdk/openai-compatible",
        name: providerName,
        options: {
          baseURL: url,
          apiKey: apiKey,
        },
        models: models,
      };

      if (!config.enabled_providers.includes(providerName)) {
        config.enabled_providers.push(providerName);
      }

      console.log(`[OK] Successfully registered ${Object.keys(models).length} model(s): ${Object.keys(models).join(", ")}`);
    } catch (e) {
      console.error(`[Error] Failed to fetch models: ${e.message}`);
      process.exit(1);
    }
  } 
  // [기능 1] 전체 기존 provider 동기화 모드
  else {
    for (const [providerId, prov] of Object.entries(config.provider)) {
      const isCompatible = prov.npm === "@ai-sdk/openai-compatible" || prov.api === "openai-compatible";
      const baseURL = prov.options?.baseURL;
      if (!isCompatible || !baseURL) continue;

      const apiKey = prov.options?.apiKey;
      process.stdout.write(`Syncing ${providerId} (${baseURL})... `);

      try {
        const models = await fetchModelsFromUrl(baseURL, apiKey, prov.models);
        prov.models = models;
        console.log(`[OK] Loaded ${Object.keys(models).length} model(s): ${Object.keys(models).join(", ")}`);
      } catch (err) {
        console.log(`[Offline/Skip: ${err.message}] Kept existing.`);
      }
    }
  }

  // 저장 및 리로드
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  console.log(`\nUpdated ${CONFIG_PATH}`);

  try {
    execSync("opencode reload", { stdio: "pipe" });
    console.log("OpenCode configuration reloaded successfully!");
  } catch {}
}

main().catch(console.error);
