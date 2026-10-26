# opencode-openai-local-models

OpenAI 호환 API 주소(`baseURL`)만 넣으면 로컬 LLM 서버(Strata, vLLM, LM Studio, Ollama 등)의 모델 목록(`/v1/models`)을 자동 감지하여 OpenCode 설정(`~/.config/opencode/opencode.jsonc`)에 즉시 등록 및 동기화해주는 도구입니다.

## 기능
1. **주소만 넣으면 알아서 등록**:
   - `node sync.js add <baseURL> [apiKey] [이름]` 명령 한 줄로 엔드포인트의 모델을 자동 로드하여 OpenCode provider로 등록
2. **원클릭 전체 동기화**:
   - `node sync.js` 실행 시 등록된 모든 로컬/원격 LLM 서버를 순회하며 현재 로드된 모델을 실시간 자동 갱신
3. **OpenCode 즉시 리로드**:
   - 파일 수정 후 `opencode reload`를 자동 호출하여 재시작 없이 즉시 반영

## 모델 한도 동기화

- 서버의 `meta.n_ctx`, `loaded_context_length`, `context_length`, `max_model_len`, `max_context_length`, `max_input_tokens`를 읽어 context 한도를 반영합니다.
- `max_input_tokens`와 `max_output_tokens`가 제공되면 입력·출력 한도를 각각 반영합니다. 입력 한도를 context의 90%로 임의 설정하지 않습니다.
- LM Studio는 `/api/v1/models`에서 로드된 인스턴스의 `config.context_length`를 우선 조회합니다. 로드되지 않은 모델은 `max_context_length`를 사용하므로 실제 로드 설정에 따라 사용 가능한 context가 더 작을 수 있습니다.
- 서버가 한도를 제공하지 않으면 기존 모델 설정을 유지합니다. 기존 값도 없는 경우에만 context `65536`, output `8192`를 기본값으로 사용합니다.
- 플러그인은 시작 시 동기화를 기다리고, OpenCode의 model transform API가 제공되면 실행 중인 모델 한도에도 적용합니다.

## 사용법

### 1. 새 엔드포인트 추가 (주소만 넣기)
```bash
node ~/dev/opencode-openai-local-models/sync.js add http://192.168.136.188:8080/v1 sk-strata-xxx
```

### 2. 전체 로컬 모델 자동 갱신
```bash
node ~/dev/opencode-openai-local-models/sync.js
```
