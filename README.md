# opencode-openai-local-models

Give it an OpenAI-compatible API address (`baseURL`) and it discovers the model list (`/v1/models`) from a local LLM server (Strata, vLLM, LM Studio, Ollama, and others), then registers and syncs those models into the OpenCode config (`~/.config/opencode/opencode.jsonc`).

## Features
1. **Register from an address**:
   - `node sync.js add <baseURL> [apiKey] [name]` loads the endpoint's models and registers them as an OpenCode provider
2. **Sync everything in one step**:
   - `node sync.js` walks every registered local or remote LLM server and refreshes the models that are currently loaded
3. **Reload OpenCode immediately**:
   - After the config file changes, it runs `opencode reload` so the update applies without a restart

## Model limit sync

- Context limits are taken from `meta.n_ctx`, `loaded_context_length`, `context_length`, `max_model_len`, `max_context_length`, and `max_input_tokens`.
- When `max_input_tokens` and `max_output_tokens` are present, input and output limits are set from those values. The input limit is not guessed as 90% of the context.
- For LM Studio, a loaded instance's `config.context_length` from `/api/v1/models` is preferred. Unloaded models fall back to `max_context_length`, so the usable context can be smaller than that value once the model is actually loaded.
- If the server does not report a limit, the existing model setting is kept. Only when there is no existing value does it fall back to context `65536` and output `8192`.
- The plugin waits for sync on startup. When OpenCode's model transform API is available, it also applies the limits to models that are already running.

## Usage

### 1. Add an endpoint (address only)
```bash
node ~/dev/opencode-openai-local-models/sync.js add http://192.168.136.188:8080/v1 sk-strata-xxx
```

### 2. Refresh all local models
```bash
node ~/dev/opencode-openai-local-models/sync.js
```
