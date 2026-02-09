/**
 * Main entry point – runs all three probes sequentially and produces a report.
 *
 * If FOUNDRY_MODEL is not set in .env, the tool fetches the Foundry Local
 * model catalog from /v1/models and presents an interactive picker.
 *
 * Usage:
 *   npx ts-node src/index.ts          (dev)
 *   node dist/index.js                (after build)
 */

import { loadConfig } from "./config";
import { detectFoundryService, autoDetectFoundryService, formatServiceInfo } from "./service/detect";
import { fetchModelCatalog, autoFetchModelCatalog } from "./models/catalog";
import { resolveModelId } from "./models/resolver";
import { pickModel } from "./models/picker";
import { runNonStreamingProbe } from "./probes/non-streaming";
import { runRawStreamingProbe } from "./probes/raw-streaming";
import { runCopilotSdkStreamingProbe } from "./probes/copilot-sdk-streaming";
import { runFoundrySDKProbe, runFoundrySDKStreamingProbe } from "./probes/foundry-sdk";
import { writeReport, printSummary } from "./report";
import { getVersionInfo, formatVersionInfo } from "./utils/version";
import type { ProbeResult } from "./types";

async function main(): Promise<void> {
  console.log("─── Foundry Local Streaming Validation ───\n");

  const cfg = loadConfig();

  // ── Version info ────────────────────────────────────────
  const versionInfo = getVersionInfo();
  console.log("  Version Information:");
  console.log(formatVersionInfo(versionInfo));
  console.log();

  // ── Service discovery (auto-detect port) ────────────────
  if (!cfg.foundryBaseUrl) {
    console.log("  ℹ  FOUNDRY_BASE_URL not set – auto-detecting Foundry Local service...\n");
    const svc = await autoDetectFoundryService(cfg.requestTimeoutMs);
    console.log(formatServiceInfo(svc));
    console.log();

    if (!svc.running || !svc.baseUrl) {
      console.error("  ❌  Could not detect Foundry Local service.");
      console.error("     Start it with 'foundry service start' or set FOUNDRY_BASE_URL in .env.");
      process.exit(1);
    }

    cfg.foundryBaseUrl = svc.baseUrl;
    console.log(`  ✔  Auto-detected base URL: ${cfg.foundryBaseUrl}`);
    console.log(`  ✔  Detection method: ${svc.detectedVia?.toUpperCase() ?? "unknown"}\n`);
  }

  // ── Model selection ─────────────────────────────────────
  if (!cfg.foundryModel) {
    console.log("  ℹ  FOUNDRY_MODEL not set – fetching model catalog...\n");
    try {
      const models = await autoFetchModelCatalog(
        cfg.foundryBaseUrl,
        cfg.foundryApiKey,
        cfg.requestTimeoutMs,
      );
      if (models.length === 0) {
        console.error("  ❌  No models found in Foundry Local catalog. Is the server running?");
        process.exit(1);
      }
      cfg.foundryModel = await pickModel(models);
    } catch (err) {
      console.error(`  ❌  Failed to fetch model catalog: ${err instanceof Error ? err.message : err}`);
      console.error("     Set FOUNDRY_MODEL in .env to skip catalog lookup.");
      process.exit(1);
    }
  }

  // ── Model alias resolution ──────────────────────────────
  // The HTTP endpoint requires full variant IDs (e.g. "Phi-4-mini-instruct-cuda-gpu:5")
  // but users typically provide aliases (e.g. "phi-4-mini"). Resolve using HTTP models
  // (which only lists loaded/available variants).
  try {
    const httpModels = await fetchModelCatalog(
      cfg.foundryBaseUrl,
      cfg.foundryApiKey,
      cfg.requestTimeoutMs,
    );
    const { resolvedId, wasResolved } = resolveModelId(cfg.foundryModel, httpModels);
    if (wasResolved) {
      console.log(`  ℹ  Resolved model alias "${cfg.foundryModel}" → "${resolvedId}"`);
      cfg.foundryModel = resolvedId;
    }
  } catch {
    console.log(`  ⚠  Could not resolve model alias – using "${cfg.foundryModel}" as-is`);
  }

  console.log(`  Base URL           : ${cfg.foundryBaseUrl}`);
  console.log(`  Model              : ${cfg.foundryModel}`);
  console.log(`  Request timeout    : ${cfg.requestTimeoutMs} ms`);
  console.log(`  First-byte timeout : ${cfg.firstByteTimeoutMs} ms`);
  console.log(`  First-event timeout: ${cfg.firstEventTimeoutMs} ms`);
  console.log(`  BYOK provider      : ${cfg.copilotByokProviderType}`);
  console.log(`  Wire API           : ${cfg.copilotWireApi}\n`);

  const results: ProbeResult[] = [];

  // ── Probe 1: Non-streaming ────────────────────────────────
  console.log("\n═══ Probe 1: Non-streaming (stream: false) ═══\n");
  try {
    const r = await runNonStreamingProbe(cfg);
    results.push(r);
  } catch (err) {
    console.error("[non-streaming] Unhandled error:", err);
    results.push({
      probe: "non-streaming",
      outcome: "ERROR",
      timings: { startMs: Date.now(), endMs: Date.now(), totalMs: 0 },
      error: String(err),
      payloadHash: "unknown",
    });
  }

  // ── Probe 2: Raw streaming (fetch + SSE) ──────────────────
  console.log("\n═══ Probe 2: Raw streaming (fetch + SSE parser) ═══\n");
  try {
    const r = await runRawStreamingProbe(cfg);
    results.push(r);
  } catch (err) {
    console.error("[raw-streaming] Unhandled error:", err);
    results.push({
      probe: "raw-streaming",
      outcome: "ERROR",
      timings: { startMs: Date.now(), endMs: Date.now(), totalMs: 0 },
      error: String(err),
      payloadHash: "unknown",
    });
  }

  // ── Probe 3: Copilot SDK BYOK streaming ───────────────────
  console.log("\n═══ Probe 3: Copilot SDK BYOK streaming (OpenAI SDK) ═══\n");
  try {
    const r = await runCopilotSdkStreamingProbe(cfg);
    results.push(r);
  } catch (err) {
    console.error("[copilot-sdk] Unhandled error:", err);
    results.push({
      probe: "copilot-sdk-streaming",
      outcome: "ERROR",
      timings: { startMs: Date.now(), endMs: Date.now(), totalMs: 0 },
      error: String(err),
      payloadHash: "unknown",
    });
  }

  // ── Probe 4a: Foundry Local SDK (non-streaming) ──────────
  console.log("\n═══ Probe 4a: Foundry Local SDK (completeChat) ═══\n");
  try {
    const r = await runFoundrySDKProbe(cfg);
    results.push(r);
  } catch (err) {
    console.error("[foundry-sdk] Unhandled error:", err);
    results.push({
      probe: "foundry-sdk",
      outcome: "ERROR",
      timings: { startMs: Date.now(), endMs: Date.now(), totalMs: 0 },
      error: String(err),
      payloadHash: "unknown",
    });
  }

  // ── Probe 4b: Foundry Local SDK (streaming) ──────────────
  console.log("\n═══ Probe 4b: Foundry Local SDK (completeStreamingChat) ═══\n");
  try {
    const r = await runFoundrySDKStreamingProbe(cfg);
    results.push(r);
  } catch (err) {
    console.error("[foundry-sdk-stream] Unhandled error:", err);
    results.push({
      probe: "foundry-sdk-streaming",
      outcome: "ERROR",
      timings: { startMs: Date.now(), endMs: Date.now(), totalMs: 0 },
      error: String(err),
      payloadHash: "unknown",
    });
  }

  // ── Report ────────────────────────────────────────────────
  const report = writeReport(cfg, results);
  printSummary(report);

  // Exit with non-zero if any probe failed
  const allOk = results.every((r) => r.outcome === "OK");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
