/**
 * Benchmark entry point – discovers all models from the Foundry Local catalog,
 * tests each for non-streaming and streaming support, and produces
 * benchmark-report.json + a console summary table.
 *
 * Usage:
 *   node dist/benchmark/index.js       (after build)
 *   npx ts-node src/benchmark/index.ts (dev)
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../config";
import { detectFoundryService, autoDetectFoundryService, formatServiceInfo } from "../service/detect";
import { fetchModelCatalog, autoFetchModelCatalog } from "../models/catalog";
import { testNonStreaming, testStreaming } from "./runner";
import type { BenchmarkReport, ModelBenchmarkEntry } from "./types";

const REPORT_PATH = resolve(process.cwd(), "benchmark-report.json");

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  FOUNDRY LOCAL STREAMING BENCHMARK");
  console.log("  Tests every model for streaming & non-streaming support");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const cfg = loadConfig();

  // ── Auto-detect service if no URL configured ───────────
  if (!cfg.foundryBaseUrl) {
    console.log("  ℹ  Auto-detecting Foundry Local service...\n");
    const svc = await autoDetectFoundryService(cfg.requestTimeoutMs);
    console.log(formatServiceInfo(svc));
    console.log();

    if (!svc.running || !svc.baseUrl) {
      console.error("  ❌  Foundry Local not detected. Start it or set FOUNDRY_BASE_URL.");
      process.exit(1);
    }
    cfg.foundryBaseUrl = svc.baseUrl;
  }

  console.log(`  Base URL: ${cfg.foundryBaseUrl}\n`);

  // ── Fetch model catalog ────────────────────────────────
  console.log("  📋  Fetching model catalog...\n");
  let modelIds: string[];
  try {
    const models = await autoFetchModelCatalog(
      cfg.foundryBaseUrl,
      cfg.foundryApiKey,
      cfg.requestTimeoutMs,
    );

    if (models.length === 0) {
      console.error("  ❌  No models found. Load models into Foundry Local first.");
      process.exit(1);
    }

    modelIds = models.map((m) => m.id);
    console.log(`  Found ${modelIds.length} model(s): ${modelIds.join(", ")}\n`);
  } catch (err) {
    console.error(`  ❌  Failed to fetch catalog: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // ── Benchmark each model ───────────────────────────────
  const entries: ModelBenchmarkEntry[] = [];

  for (let i = 0; i < modelIds.length; i++) {
    const modelId = modelIds[i];
    const label = `[${i + 1}/${modelIds.length}] ${modelId}`;

    console.log(`\n─── ${label} ───────────────────────────────────────\n`);

    // Non-streaming test
    console.log(`  ▸ Testing non-streaming (stream:false)...`);
    const nsResult = await testNonStreaming(cfg, modelId);
    const nsIcon = nsResult.outcome === "OK" ? "✅" : "❌";
    console.log(
      `    ${nsIcon} ${nsResult.outcome}  (${nsResult.timings.totalMs} ms)` +
        (nsResult.tokenPreview ? `  "${nsResult.tokenPreview.slice(0, 60)}…"` : ""),
    );

    // Streaming test
    console.log(`  ▸ Testing streaming (stream:true)...`);
    const sResult = await testStreaming(cfg, modelId);
    const sIcon = sResult.outcome === "OK" ? "✅" : "❌";
    console.log(
      `    ${sIcon} ${sResult.outcome}  (${sResult.timings.totalMs} ms)` +
        (sResult.chunkCount !== undefined ? `  chunks=${sResult.chunkCount}` : "") +
        (sResult.doneReceived !== undefined ? `  done=${sResult.doneReceived}` : "") +
        (sResult.tokenPreview ? `  "${sResult.tokenPreview.slice(0, 60)}…"` : ""),
    );

    // Determine verdict
    const nsOk = nsResult.outcome === "OK";
    const sOk = sResult.outcome === "OK";
    let verdict: ModelBenchmarkEntry["verdict"];
    if (nsOk && sOk) verdict = "BOTH_OK";
    else if (nsOk && !sOk) verdict = "STREAM_ONLY_FAIL";
    else if (!nsOk && sOk) verdict = "NON_STREAM_FAIL";
    else verdict = "BOTH_FAIL";

    entries.push({
      model: modelId,
      nonStreaming: nsResult,
      streaming: sResult,
      supportsStreaming: sOk,
      verdict,
    });
  }

  // ── Build report ───────────────────────────────────────
  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    foundryBaseUrl: cfg.foundryBaseUrl,
    totalModels: entries.length,
    modelsWithStreaming: entries.filter((e) => e.supportsStreaming).length,
    modelsWithoutStreaming: entries.filter((e) => !e.supportsStreaming).length,
    entries,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n✅  Benchmark report written to ${REPORT_PATH}\n`);

  // ── Console summary table ──────────────────────────────
  printBenchmarkSummary(report);

  // Exit 0 if all support streaming, 1 otherwise
  const allStream = entries.every((e) => e.supportsStreaming);
  process.exit(allStream ? 0 : 1);
}

function printBenchmarkSummary(report: BenchmarkReport): void {
  const sep = "═".repeat(90);
  const thin = "─".repeat(90);

  console.log(sep);
  console.log("  BENCHMARK SUMMARY");
  console.log(`  ${report.timestamp}    Base: ${report.foundryBaseUrl}`);
  console.log(sep);
  console.log();

  // Table header
  const pad = (s: string, n: number) => s.padEnd(n);
  const rpad = (s: string, n: number) => s.padStart(n);

  console.log(
    `  ${pad("Model", 30)} ${pad("Non-Stream", 14)} ${pad("Streaming", 14)} ${pad("Chunks", 8)} ${pad("TTFB", 8)} ${pad("1st Evt", 8)} Verdict`,
  );
  console.log("  " + thin.slice(2));

  for (const e of report.entries) {
    const nsStatus = e.nonStreaming.outcome === "OK" ? "✅ OK" : `❌ ${e.nonStreaming.outcome}`;
    const sStatus = e.streaming.outcome === "OK" ? "✅ OK" : `❌ ${e.streaming.outcome}`;
    const chunks = e.streaming.chunkCount !== undefined ? String(e.streaming.chunkCount) : "–";
    const ttfb = e.streaming.timings.ttfbMs !== undefined ? `${e.streaming.timings.ttfbMs}ms` : "–";
    const firstEvt =
      e.streaming.timings.firstEventMs !== undefined
        ? `${e.streaming.timings.firstEventMs}ms`
        : "–";

    let verdictIcon: string;
    switch (e.verdict) {
      case "BOTH_OK":
        verdictIcon = "🎉 BOTH_OK";
        break;
      case "STREAM_ONLY_FAIL":
        verdictIcon = "⚠️  STREAM_FAIL";
        break;
      case "BOTH_FAIL":
        verdictIcon = "💀 BOTH_FAIL";
        break;
      case "NON_STREAM_FAIL":
        verdictIcon = "🔧 NS_FAIL";
        break;
    }

    console.log(
      `  ${pad(e.model, 30)} ${pad(nsStatus, 14)} ${pad(sStatus, 14)} ${rpad(chunks, 6)}  ${rpad(ttfb, 7)} ${rpad(firstEvt, 7)}  ${verdictIcon}`,
    );
  }

  console.log();
  console.log(thin);
  console.log(
    `  Total: ${report.totalModels} models | ` +
      `✅ Streaming OK: ${report.modelsWithStreaming} | ` +
      `❌ Streaming FAIL: ${report.modelsWithoutStreaming}`,
  );

  if (report.modelsWithoutStreaming > 0) {
    console.log();
    console.log("  ⚠️  Models WITHOUT streaming support:");
    for (const e of report.entries) {
      if (!e.supportsStreaming) {
        console.log(`       • ${e.model}: ${e.streaming.outcome} – ${e.streaming.error ?? "no SSE events"}`);
      }
    }
  }

  console.log(sep);
}

main().catch((err) => {
  console.error("Fatal benchmark error:", err);
  process.exit(2);
});
