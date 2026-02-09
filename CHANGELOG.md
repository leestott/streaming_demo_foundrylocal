# Changelog

All notable changes to the **Foundry Local Streaming Validation** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.1.0] – 2026-02-09

### Added — Foundry Local SDK Integration

This release integrates the official [`@prathikrao/foundry-local-sdk`](https://www.npmjs.com/package/@prathikrao/foundry-local-sdk) (v0.0.12) into the validation tool, adding two new probes and enriching service/model discovery with native FFI capabilities.

#### New dependencies

- **`@prathikrao/foundry-local-sdk ^0.0.12`** — Official Foundry Local SDK; uses `koffi` FFI to interface with `Microsoft.AI.Foundry.Local.Core.dll`.

#### New files

| File | Purpose |
|---|---|
| `src/types/foundry-local-sdk.d.ts` | Ambient TypeScript declarations for the SDK (ships with no `.d.ts`) |
| `src/sdk/foundry-local.ts` | SDK wrapper module — ESM↔CJS bridge, lazy singleton manager, model resolution |
| `src/probes/foundry-sdk.ts` | Probes 4a (non-streaming) and 4b (streaming) using hybrid SDK+HTTP architecture |

#### New probes

| Probe | Name | Description |
|---|---|---|
| **4a** | `foundry-sdk` | SDK-powered model resolution + HTTP `fetch` non-streaming completion |
| **4b** | `foundry-sdk-streaming` | SDK-powered model resolution + HTTP SSE streaming with hand-rolled parser |

Both probes use a **hybrid architecture**:
- **SDK** for catalog discovery and model alias → variant ID resolution (via native FFI)
- **HTTP** for chat completions against the CLI-started Foundry Local service

This approach is necessary because the SDK's native `ChatClient` operates through its own FFI process and cannot share models loaded by the separately-started Foundry Local CLI service.

#### SDK model resolution

The `resolveModel()` function implements a 5-strategy cascade:

1. **Alias lookup** — `catalog.getModel("phi-4-mini")`
2. **Exact variant ID** — `catalog.getModelVariant("Phi-4-mini-instruct-cuda-gpu:5")`
3. **Platform normalization** — maps `cuda-gpu` / `directml` / `vulkan` → `generic-gpu`
4. **Fuzzy base-name matching** — strips platform segment and version, matches across all variants
5. **Alias prefix match** — checks if the identifier starts with a known alias

#### Enhanced service detection

- `src/service/detect.ts` — New `autoDetectFoundryService()` async function tries SDK-based detection first (`FoundryLocalManager.urls`), falls back to CLI (`foundry service status`)
- Added `detectedVia` field (`"sdk"` | `"cli"`) to `FoundryServiceInfo` for observability

#### Enhanced model catalog

- `src/models/catalog.ts` — New `autoFetchModelCatalog()` tries SDK native catalog first (accesses 23+ models via FFI), falls back to HTTP `/v1/models`
- Added `sdkAlias` field to `FoundryModel` interface

#### ESM ↔ CJS interop

The SDK is ESM-only (`"type": "module"`) while this project uses CommonJS. Solved with a native `import()` bridge:

```typescript
const nativeImport = new Function("specifier", "return import(specifier)");
```

This prevents TypeScript from transforming `import()` into `require()`, which would fail for ESM packages.

### Changed

- **`src/types.ts`** — `ProbeResult.probe` union extended with `"foundry-sdk"` and `"foundry-sdk-streaming"`
- **`src/index.ts`** — CLI entry now runs 5 probes (added 4a and 4b); uses `autoDetectFoundryService` and `autoFetchModelCatalog`
- **`src/web/server.ts`** — All API endpoints updated:
  - `POST /api/probes/all` runs all 5 probes
  - `POST /api/probe/foundry-sdk` and `POST /api/probe/foundry-sdk-streaming` added
  - Service detection and catalog use async auto-detect flow (SDK-first)
- **`src/web/public/index.html`** — Two new probe buttons: "Foundry SDK" and "Foundry SDK Stream"
- **`src/web/public/app.js`** — Updated probe display names, added button handling for SDK probes, "Detected Via" display in service status
- **`src/benchmark/index.ts`** — Uses `autoDetectFoundryService` and `autoFetchModelCatalog`
- **`package.json`** — Added `probe:foundry-sdk` script; added `@prathikrao/foundry-local-sdk` dependency

### Technical notes

- **SDK catalog vs HTTP**: The SDK reads from the local catalog via native FFI, which includes all registered models (typically 23+). The HTTP endpoint at `/v1/models` only returns models currently loaded in the service.
- **Model ID mismatch**: The HTTP endpoint uses platform-specific variant IDs (e.g., `Phi-4-mini-instruct-cuda-gpu:5`) while the SDK catalog uses generic IDs (e.g., `Phi-4-mini-instruct-generic-gpu:5`). The `resolveModel()` function bridges this gap.
- **Native ChatClient limitation**: The SDK's `ChatClient` uses `coreInterop.executeCommand("chat_completions", ...)` which goes to the native DLL, not HTTP. Models must be loaded in the SDK's own process. This is why the hybrid approach was chosen over pure-SDK inference.

---

## [1.0.0] – 2026-02-08

### Added — Initial release

#### Core probes

| Probe | Name | Description |
|---|---|---|
| **1** | `non-streaming` | `fetch` with `stream: false` — baseline endpoint validation |
| **2** | `raw-streaming` | `fetch` + hand-rolled SSE async generator with `stream: true` |
| **3** | `copilot-sdk-streaming` | OpenAI SDK (`openai` npm) with `stream: true` — Copilot BYOK code path |

#### Infrastructure

- **Automatic port detection** via `foundry service status` CLI parsing
- **Interactive model picker** — queries `/v1/models`, presents numbered list, supports typed input
- **Three-layer timeout system**: `REQUEST_TIMEOUT_MS`, `FIRST_BYTE_TIMEOUT_MS`, `FIRST_EVENT_TIMEOUT_MS`
- **Hand-rolled SSE parser** — minimal async generator, no external SSE libraries
- **SHA-256 payload hashing** — logs request payloads as hash prefixes (no secrets)
- **TypeScript strict mode** — zero `any` leaks, full type coverage
- **JSON report** — `report.json` with full timing metrics per probe

#### Web dashboard

- **Express 5** dark-themed SPA at `http://localhost:3000`
- Service detection, model selection, probe execution, and benchmark control via REST API
- Responsive dark GitHub-style UI with real-time result rendering

#### Multi-model benchmark

- Tests every model in catalog for streaming support
- Produces `benchmark-report.json` with per-model verdicts (`BOTH_OK`, `STREAM_ONLY_FAIL`, etc.)
- Summary table output in terminal

#### Scripts

- `run-all.ps1` (PowerShell) and `run-all.sh` (Bash) — auto-detect, build, and run
- npm scripts for individual probes, benchmark, web server, dev mode

#### Documentation

- Comprehensive `README.md` with Mermaid architecture diagrams
- `.env.example` with all configuration options
- `docs/screenshots/` — Playwright-captured dashboard screenshots
