<!-- banners -->
<p align="center">
  <img src="https://img.shields.io/badge/Foundry_Local-Streaming_Validation-0078D4?style=for-the-badge&logo=microsoft&logoColor=white" alt="Foundry Local Streaming Validation">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Microsoft-AI_Foundry-00A4EF?style=for-the-badge&logo=microsoft&logoColor=white" alt="Microsoft AI Foundry">
  <img src="https://img.shields.io/badge/Foundry_Local-v0.5+-blueviolet?style=for-the-badge" alt="Foundry Local v0.5+">
</p>

<!-- badges -->
<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?logo=node.js&logoColor=white" alt="Node.js ≥ 18"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white" alt="TypeScript strict"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/openai"><img src="https://img.shields.io/badge/openai--sdk-4.x-blueviolet?logo=openai&logoColor=white" alt="OpenAI SDK 4.x"></a>
  <a href="https://www.npmjs.com/package/@prathikrao/foundry-local-sdk"><img src="https://img.shields.io/badge/foundry--local--sdk-0.0.12-teal?logo=npm&logoColor=white" alt="Foundry Local SDK"></a>
  <a href="#"><img src="https://img.shields.io/badge/SSE_parser-hand--rolled-orange" alt="Hand-rolled SSE"></a>
  <a href="#"><img src="https://img.shields.io/badge/proxy%2Finterceptor-none-critical" alt="No Proxy"></a>
  <a href="SECURITY.md"><img src="https://img.shields.io/badge/security-policy-informational?logo=shield" alt="Security Policy"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/changelog-v1.1.0-yellow" alt="Changelog"></a>
</p>

<h1 align="center">🔍 Foundry Local Streaming Validation</h1>

<p align="center">
  Diagnose and validate <strong>Foundry Local</strong> OpenAI-compatible streaming endpoints — using raw HTTP, the OpenAI SDK, and the official <strong>Foundry Local SDK</strong>.<br>
  Features <strong>automatic port detection</strong>, <strong>5 independent probes</strong>, <strong>multi-model benchmark</strong>, and a <strong>web-based dashboard</strong>.
</p>

---

## Overview

This tool validates **Foundry Local**'s OpenAI-compatible `/v1/chat/completions` endpoint using **five independent probes** across three integration strategies — raw HTTP, the OpenAI SDK, and the official **[Foundry Local SDK](https://www.npmjs.com/package/@prathikrao/foundry-local-sdk)**:

| # | Probe | Method | What it tests |
|---|---|---|---|
| 1 | **Non-streaming** | `fetch` · `stream: false` | Baseline — proves the endpoint is reachable and returns valid JSON |
| 2 | **Raw streaming** | `fetch` + hand-rolled SSE parser · `stream: true` | Direct SSE test with byte-level TTFB and first-event timing |
| 3 | **Copilot SDK BYOK** | `openai` npm package · `stream: true` | Reproduces the code path GitHub Copilot BYOK uses for OpenAI-compatible endpoints |
| 4a | **Foundry SDK** | `@prathikrao/foundry-local-sdk` + `fetch` · `stream: false` | SDK-powered model resolution with HTTP inference (non-streaming) |
| 4b | **Foundry SDK Stream** | `@prathikrao/foundry-local-sdk` + SSE parser · `stream: true` | SDK-powered model resolution with HTTP streaming inference |

### 🧩 Foundry Local SDK integration

Probes 4a and 4b use the official [`@prathikrao/foundry-local-sdk`](https://www.npmjs.com/package/@prathikrao/foundry-local-sdk) in a **hybrid architecture**:

- **SDK for catalog & model resolution** — the SDK's native FFI accesses the local model catalog directly (via `Microsoft.AI.Foundry.Local.Core.dll`), providing richer metadata than the HTTP API (e.g., aliases, variant mappings, download status)
- **HTTP for chat completions** — inference requests go through the standard `/v1/chat/completions` endpoint served by the CLI-started Foundry Local service

This hybrid approach is necessary because the SDK's native `ChatClient` operates through its own FFI process and cannot share models loaded by the separately-started Foundry Local CLI service. The SDK catalog, however, works independently and adds value through intelligent model resolution (alias → variant ID mapping, platform-specific normalization).

> **Model ID resolution**: The SDK resolves model identifiers using a 5-strategy cascade: alias lookup → exact variant match → platform normalization (e.g., `cuda-gpu` → `generic-gpu`) → fuzzy base-name matching → prefix match. This means you can use friendly aliases like `phi-4-mini` and the SDK will resolve them to the correct variant ID.

### 🖥️ Web Dashboard

In addition to the CLI, a **browser-based dashboard** lets you interact with every feature visually — detect the service, browse models, run probes, and execute benchmarks right from your browser.

<p align="center">
  <img src="docs/screenshots/04-service-models.png" alt="Dashboard – Service Status & Model Selection" width="720"><br>
  <em>Service auto-detection and model catalog with one-click selection</em>
</p>

<p align="center">
  <img src="docs/screenshots/02-probes-all-passed.png" alt="Dashboard – All Probes Passed" width="720"><br>
  <em>Full-page view: all five probes passing with OK status, timing metrics, and streamed token preview</em>
</p>

<p align="center">
  <img src="docs/screenshots/03-probe-results-detail.png" alt="Probe Results Detail" width="720"><br>
  <em>Detailed probe results showing TTFB, first-event timing, chunk counts, and [DONE] confirmation</em>
</p>

Start the dashboard with:

```bash
npm run web        # production (requires build first)
npm run web:dev    # development (via ts-node)
```

Then open **http://localhost:3000** in your browser.

### 🌐 Automatic port detection

Foundry Local starts on a **dynamic port** each time. This tool automatically detects the port by running `foundry service status`:

```
🔍  Detecting Foundry Local service...
🟢 Model management service is running on http://127.0.0.1:51995/openai/status

✔  Detected Foundry Local on port 51995
   Auto-set FOUNDRY_BASE_URL = http://127.0.0.1:51995/v1
```

- If `FOUNDRY_BASE_URL` is **not set** in `.env`, the tool auto-detects the port at startup
- If `FOUNDRY_BASE_URL` **is set**, the configured value is used as-is
- Works in both the scripts (`run-all.ps1` / `run-all.sh`) and the Node.js entry point

### ✨ Interactive model selection

If `FOUNDRY_MODEL` is not set in `.env`, the tool **automatically queries** the Foundry Local model catalog at `/v1/models` and presents an interactive picker in your terminal:

```
  #   Model ID                          Owner
  ────────────────────────────────────────────────────────────
    1  phi-4-mini                        Microsoft
    2  phi-4                             Microsoft
    3  mistral-7b-instruct               Mistral

  Select a model [1-3]: _
```

You can also type a model name directly. In non-interactive mode (CI/piped), the first available model is auto-selected.

### 🏁 Multi-model streaming benchmark

The new **benchmark** mode tests **every model** in your Foundry Local catalog for streaming support:

```bash
npm run benchmark
# or
.\scripts\run-all.ps1 -Benchmark
bash scripts/run-all.sh --benchmark
```

It produces a summary table and a `benchmark-report.json`:

<p align="center">
  <img src="docs/screenshots/05-results.png" alt="Results – Service Status & Model Selection" width="720"><br>
  <em>Service auto-detection and model catalog with one-click selection</em>
</p>

### 🔑 Key design principles

- ❌ **No proxies, interceptors, or SSE re-encoding** — every probe talks directly to Foundry Local
- ❌ **No external SSE libraries** — the parser is a minimal hand-rolled async generator
- 🔒 **No secrets logged** — request payloads appear only as SHA-256 hash prefixes
- ⏱️ **Three-layer timeouts** (`REQUEST_TIMEOUT_MS`, `FIRST_BYTE_TIMEOUT_MS`, `FIRST_EVENT_TIMEOUT_MS`) ensure the tool **never hangs**
- ✅ **TypeScript strict mode** throughout

---

## Quick start

### Prerequisites

| Requirement | Details |
|---|---|
| **Node.js** | ≥ 18 (native `fetch` required) |
| **Foundry Local** | Running (`foundry service status` should show 🟢) |
| **Foundry Local SDK** | Installed automatically via `npm install` ([`@prathikrao/foundry-local-sdk`](https://www.npmjs.com/package/@prathikrao/foundry-local-sdk)) |

### 1. Clone & install

```bash
git clone <repo-url> foundry-local-streaming-validation
cd foundry-local-streaming-validation
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Configure (optional)

```bash
cp .env.example .env
```

> **All settings are optional.** The tool auto-detects the Foundry Local port and prompts you to pick a model. Edit `.env` only if you want to override behaviour.

```env
# FOUNDRY_BASE_URL=http://127.0.0.1:5272/v1   # auto-detected if omitted
# FOUNDRY_MODEL=phi-4-mini                     # interactive picker if omitted
FOUNDRY_API_KEY=unused
REQUEST_TIMEOUT_MS=30000
FIRST_BYTE_TIMEOUT_MS=10000
FIRST_EVENT_TIMEOUT_MS=15000
```

### 4. Run

```bash
# ── CLI Mode ──
# All probes via script (recommended)
.\scripts\run-all.ps1          # PowerShell (Windows)
bash scripts/run-all.sh        # Bash (Linux / macOS / WSL)

# Or directly
npm start

# Multi-model benchmark
npm run benchmark
.\scripts\run-all.ps1 -Benchmark
bash scripts/run-all.sh --benchmark

# ── Web Dashboard ──
npm run web           # http://localhost:3000
npm run web:dev       # dev mode via ts-node
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `FOUNDRY_BASE_URL` | — | *(auto-detected)* | Foundry Local base URL including `/v1`. If omitted, detected via `foundry service status` |
| `FOUNDRY_MODEL` | — | *(interactive picker)* | Model ID. If empty, fetches catalog and prompts |
| `FOUNDRY_API_KEY` | — | `unused` | API key (Foundry Local typically ignores this) |
| `COPILOT_BYOK_PROVIDER_TYPE` | — | `openai` | Provider type for the SDK probe |
| `COPILOT_WIRE_API` | — | `completions` | Wire API for the SDK probe |
| `REQUEST_TIMEOUT_MS` | — | `30000` | Hard overall request timeout (ms) |
| `FIRST_BYTE_TIMEOUT_MS` | — | `10000` | Max wait for HTTP response headers (ms) |
| `FIRST_EVENT_TIMEOUT_MS` | — | `15000` | Max wait for first SSE `data:` event (ms) |
| `WEB_PORT` | — | `3000` | Port for the web dashboard server |

---

## curl repro commands

Use these to independently verify Foundry Local behaviour from the command line.

### Detect the port first

```bash
foundry service status
# 🟢 Model management service is running on http://127.0.0.1:51995/openai/status
# → use port 51995 in the URLs below
```

### List available models

```bash
curl -s http://127.0.0.1:51995/v1/models \
  -H "Authorization: Bearer unused" | python -m json.tool
```

### Non-streaming (should work ✅)

```bash
curl -s -X POST http://127.0.0.1:51995/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer unused" \
  -d '{
    "model": "phi-4-mini",
    "messages": [{"role": "user", "content": "Say hello in one sentence."}],
    "stream": false,
    "max_tokens": 64
  }'
```

### Streaming (expected to hang on Foundry Local v0.5 ⏱️)

```bash
curl -v -N --max-time 15 -X POST http://127.0.0.1:51995/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "Authorization: Bearer unused" \
  -d '{
    "model": "phi-4-mini",
    "messages": [{"role": "user", "content": "Say hello in one sentence."}],
    "stream": true,
    "max_tokens": 64
  }'
```

> **Tip:** `--max-time 15` prevents curl from hanging indefinitely,  
> and remember to replace the port with the one from `foundry service status`.

### PowerShell equivalents

```powershell
# Non-streaming
Invoke-RestMethod -Uri "http://127.0.0.1:51995/v1/chat/completions" `
  -Method POST -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer unused" } `
  -Body '{"model":"phi-4-mini","messages":[{"role":"user","content":"Say hello in one sentence."}],"stream":false,"max_tokens":64}'

# List models
Invoke-RestMethod -Uri "http://127.0.0.1:51995/v1/models" `
  -Headers @{ Authorization = "Bearer unused" }
```

---

## How to interpret `report.json`

After each run, `report.json` is written to the project root. Structure:

```jsonc
{
  "timestamp": "2026-02-09T14:30:00.000Z",
  "config": {
    "foundryBaseUrl": "http://127.0.0.1:51995/v1",   // ← auto-detected port
    "foundryModel": "phi-4-mini",                     // ← selected model
    "requestTimeoutMs": 30000,
    "firstByteTimeoutMs": 10000,
    "firstEventTimeoutMs": 15000
  },
  "probes": [
    {
      "probe": "non-streaming",
      "outcome": "OK",
      "httpStatus": 200,
      "timings": { "totalMs": 1234, "ttfbMs": 456 },
      "payloadHash": "a1b2c3d4..."
    },
    {
      "probe": "raw-streaming",
      "outcome": "NO_FIRST_EVENT",
      "httpStatus": 200,
      "timings": {
        "totalMs": 15000,
        "ttfbMs": 120,
        "firstEventMs": undefined
      },
      "chunkCount": 0,
      "doneReceived": false,
      "error": "FIRST_EVENT_TIMEOUT"
    },
    {
      "probe": "copilot-sdk-streaming",
      "outcome": "NO_FIRST_EVENT",
      "timings": { "totalMs": 15000 },
      "chunkCount": 0,
      "error": "FIRST_EVENT_TIMEOUT"
    },
    {
      "probe": "foundry-sdk",
      "outcome": "OK",
      "httpStatus": 200,
      "timings": { "totalMs": 14110, "ttfbMs": 13800 },
      "payloadHash": "e5f6a7b8..."
    },
    {
      "probe": "foundry-sdk-streaming",
      "outcome": "OK",
      "httpStatus": 200,
      "timings": { "totalMs": 5481, "ttfbMs": 230, "firstEventMs": 520 },
      "chunkCount": 54,
      "doneReceived": true
    }
  ]
}
```

## How to interpret `benchmark-report.json`

The benchmark writes a separate report with results for **every model**:

```jsonc
{
  "timestamp": "2026-02-09T14:35:00.000Z",
  "foundryBaseUrl": "http://127.0.0.1:51995/v1",
  "totalModels": 3,
  "modelsWithStreaming": 2,
  "results": [
    {
      "model": "phi-4-mini",
      "supportsStreaming": true,
      "verdict": "BOTH_OK",
      "nonStreaming": {
        "outcome": "OK",
        "httpStatus": 200,
        "timings": { "totalMs": 980, "ttfbMs": 320 }
      },
      "streaming": {
        "outcome": "OK",
        "httpStatus": 200,
        "chunkCount": 42,
        "timings": { "totalMs": 2100, "ttfbMs": 120, "firstEventMs": 340 }
      }
    }
  ]
}
```

### Verdict codes

| Verdict | Meaning |
|---|---|
| `BOTH_OK` | Non-streaming and streaming both work |
| `STREAM_ONLY_FAIL` | Non-streaming works, streaming fails or times out |
| `NON_STREAM_FAIL` | Non-streaming fails (model may be misconfigured) |
| `BOTH_FAIL` | Both modes fail |

### Outcome codes

| Outcome | Meaning |
|---|---|
| `OK` | Probe completed successfully |
| `FAIL` | Server responded but with an error or invalid data |
| `TIMEOUT` | Overall `REQUEST_TIMEOUT_MS` elapsed |
| `NO_FIRST_BYTE` | No HTTP response headers within `FIRST_BYTE_TIMEOUT_MS` |
| `NO_FIRST_EVENT` | Headers received but no SSE `data:` event within `FIRST_EVENT_TIMEOUT_MS` |
| `HANG` | SDK probe couldn't be aborted cleanly — hard-timeboxed |
| `ERROR` | Unexpected error (network, DNS, etc.) |

### Diagnostic decision tree

```
non-streaming = OK?
├── YES → raw-streaming = OK?
│   ├── YES → copilot-sdk = OK?
│   │   ├── YES → foundry-sdk = OK?
│   │   │   ├── YES → foundry-sdk-streaming = OK?
│   │   │   │   ├── YES → 🎉 All working
│   │   │   │   └── NO  → SDK streaming issue (check model resolution)
│   │   │   └── NO  → SDK model resolution issue (check alias / variant mapping)
│   │   └── NO  → OpenAI SDK-layer issue
│   └── NO (NO_FIRST_EVENT) → ⚠️ Foundry Local streaming hang confirmed
└── NO → Server issue (check URL, model, connectivity)
```

---

## Project structure

```
foundry-local-streaming-validation/
├── .env.example                          # Sample env config (all optional)
├── .gitignore
├── package.json
├── tsconfig.json                         # strict: true
├── README.md
├── docs/
│   └── screenshots/                      # Playwright-captured screenshots
├── scripts/
│   ├── run-all.sh                        # Bash runner (--benchmark flag)
│   └── run-all.ps1                       # PowerShell runner (-Benchmark switch)
└── src/
    ├── index.ts                          # CLI entry – detect → pick model → probes → report
    ├── config.ts                         # Env loading (all connection settings optional)
    ├── types.ts                          # Shared type definitions
    ├── report.ts                         # JSON report + console summary
    ├── types/
    │   └── foundry-local-sdk.d.ts        # Ambient type declarations for the SDK
    ├── sdk/
    │   └── foundry-local.ts              # SDK wrapper: ESM↔CJS bridge, model resolution, catalog
    ├── service/
    │   └── detect.ts                     # Auto-detect port via `foundry service status` + SDK
    ├── models/
    │   ├── catalog.ts                    # GET /v1/models + SDK native catalog + formatting
    │   └── picker.ts                     # Interactive terminal model selector
    ├── sse/
    │   └── parser.ts                     # Hand-rolled SSE parser (async generator)
    ├── utils/
    │   ├── hash.ts                       # SHA-256 payload hashing
    │   └── timing.ts                     # Timer with TTFB + first-event marks
    ├── probes/
    │   ├── non-streaming.ts              # Probe 1: stream:false baseline
    │   ├── raw-streaming.ts              # Probe 2: fetch + SSE
    │   ├── copilot-sdk-streaming.ts      # Probe 3: OpenAI SDK (Copilot BYOK)
    │   └── foundry-sdk.ts               # Probes 4a+4b: SDK model resolution + HTTP inference
    ├── benchmark/
    │   ├── index.ts                      # Benchmark entry – test all models → report
    │   ├── runner.ts                     # Per-model streaming/non-streaming test
    │   └── types.ts                      # Benchmark result types
    └── web/
        ├── server.ts                     # Express 5 API server + SPA host
        └── public/
            ├── index.html                # Dashboard SPA (5 probe buttons)
            ├── style.css                 # Dark GitHub-style theme
            └── app.js                    # Client-side API logic
```

---

## Architecture

```mermaid
flowchart TD
    A[Start] --> SD{FOUNDRY_BASE_URL set?}
    SD -->|Yes| D2[Use configured URL]
    SD -->|No| SD1[foundry service status]
    SD1 --> SD2[Parse dynamic port]
    SD2 --> D2
    D2 --> B{FOUNDRY_MODEL set?}
    B -->|Yes| D[Use configured model]
    B -->|No| C[GET /v1/models]
    C --> C1[Interactive picker]
    C1 --> D
    D --> P1[Probe 1: Non-streaming]
    P1 --> P2[Probe 2: Raw SSE streaming]
    P2 --> P3[Probe 3: OpenAI SDK streaming]
    P3 --> P4a[Probe 4a: Foundry SDK non-streaming]
    P4a --> P4b[Probe 4b: Foundry SDK streaming]
    P4b --> R[Generate report.json]
    R --> S[Print console summary]
    S --> E{All OK?}
    E -->|Yes| E1[exit 0]
    E -->|No| E2[exit 1]
```

### Foundry SDK probe flow

```mermaid
flowchart TD
    S1[Start SDK Probe] --> S2[Import SDK via ESM bridge]
    S2 --> S3[Get FoundryLocalManager singleton]
    S3 --> S4[Catalog: resolveModel]
    S4 --> S5{Resolution strategy}
    S5 -->|Alias| S6["catalog.getModel('phi-4-mini')"]
    S5 -->|Exact variant| S7[catalog.getModelVariant]
    S5 -->|Normalize platform| S8["cuda-gpu → generic-gpu"]
    S5 -->|Fuzzy match| S9[Base-name matching]
    S5 -->|Prefix match| S10[Alias prefix search]
    S6 & S7 & S8 & S9 & S10 --> S11[Resolved model metadata]
    S11 --> S12["HTTP fetch /v1/chat/completions"]
    S12 --> S13{Streaming?}
    S13 -->|No| S14[Parse JSON response]
    S13 -->|Yes| S15[SSE parser + chunk counter]
    S14 & S15 --> S16[Return ProbeResult]
```

### Benchmark flow

```mermaid
flowchart TD
    B1[Start benchmark] --> B2[Auto-detect service]
    B2 --> B3[GET /v1/models]
    B3 --> B4[For each model]
    B4 --> B5[Test non-streaming]
    B5 --> B6[Test streaming]
    B6 --> B7{More models?}
    B7 -->|Yes| B4
    B7 -->|No| B8[Write benchmark-report.json]
    B8 --> B9[Print summary table]
    B9 --> B10{All stream?}
    B10 -->|Yes| B11[exit 0]
    B10 -->|No| B12[exit 1]
```

### Web Dashboard architecture

```mermaid
flowchart LR
    Browser["Browser<br>:3000"] -->|REST API| Express["Express 5<br>Server"]
    Express -->|GET /api/status| Detect["Service<br>Detector"]
    Express -->|GET /api/models| Catalog["Model<br>Catalog"]
    Express -->|POST /api/probes/*| Probes["Probe<br>Runner"]
    Express -->|POST /api/benchmark| Bench["Benchmark<br>Runner"]
    Detect --> FL["Foundry Local<br>(dynamic port)"]
    Catalog --> FL
    Catalog --> SDK["Foundry Local<br>SDK (FFI)"]
    Probes --> FL
    Probes --> SDK
    Bench --> FL
```

---

## npm scripts

| Script | Description |
|---|---|
| `npm run build` | Compile TypeScript → `dist/` and copy static web assets |
| `npm start` | Run all probes via CLI (requires build first) |
| `npm run dev` | Run CLI via ts-node (no build needed) |
| `npm run probe:non-streaming` | Run only the non-streaming probe |
| `npm run probe:raw-streaming` | Run only the raw SSE streaming probe |
| `npm run probe:copilot-sdk` | Run only the Copilot SDK BYOK probe |
| `npm run probe:foundry-sdk` | Run only the Foundry Local SDK probes (4a + 4b) |
| `npm run benchmark` | Run multi-model streaming benchmark |
| `npm run web` | Start the web dashboard on port 3000 (requires build first) |
| `npm run web:dev` | Start the web dashboard via ts-node (no build needed) |
| `npm run clean` | Remove `dist/`, `report.json`, and `benchmark-report.json` |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ECONNREFUSED` | Foundry Local not running | Run `foundry service start` |
| `Could not detect Foundry Local service` | `foundry` CLI not in PATH | Install Foundry Local or set `FOUNDRY_BASE_URL` manually |
| Port changes between runs | Normal — Foundry Local uses dynamic ports | Let the tool auto-detect, or re-run `foundry service status` |
| `No models found` | Server up but no models loaded | Load a model: `foundry model load phi-4-mini` |
| Non-streaming OK, streaming hangs | **Known v0.5 bug** | Update Foundry Local or use `stream: false` |
| All probes timeout | Firewall / wrong port | Check `foundry service status` and firewall rules |
| SDK probe hangs longer | OpenAI SDK internal retry | Set `REQUEST_TIMEOUT_MS` lower |
| Benchmark shows `STREAM_ONLY_FAIL` | Model doesn't support streaming | Expected for some models — check the report for details |
| Web dashboard probes fail after restart | Foundry port changed | Dashboard auto-re-detects — click "Detect Service" to refresh |
| Port 3000 in use | Another server on :3000 | Set `WEB_PORT=3001` in your `.env` or environment |
| SDK probes fail, others OK | SDK model resolution mismatch | The SDK uses generic variant IDs while the CLI uses platform-specific ones; check the SDK logs for the resolved model ID |
| `Failed to import foundry-local-sdk` | SDK not installed or native FFI issue | Run `npm install` and ensure the `koffi` native module built successfully |
| SDK shows more models than HTTP | Normal — SDK reads full local catalog | SDK accesses the native catalog via FFI; HTTP only shows loaded/available models |

---

## Contributing

1. Fork & clone
2. `npm install`
3. Make changes in `src/`
4. `npm run build` — must compile with zero errors (strict mode)
5. Test against a running Foundry Local instance
6. Submit a PR

Please read [SECURITY.md](SECURITY.md) before reporting vulnerabilities.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Security

See [SECURITY.md](SECURITY.md) for our security policy, vulnerability reporting process, and the security design principles applied in this project.
