/**
 * Express web server – exposes the Foundry Local streaming validation
 * functionality via a browser-based dashboard.
 *
 * API Routes:
 *   GET  /api/status          – Detect Foundry Local service
 *   GET  /api/models          – List available models
 *   POST /api/probes/all      – Run all three probes for a model
 *   POST /api/probe/:name     – Run a single probe
 *   POST /api/benchmark       – Run multi-model benchmark
 *   GET  /api/report          – Latest probe report
 *   GET  /api/benchmark-report – Latest benchmark report
 *
 * Usage:
 *   node dist/web/server.js           (after build)
 *   npx ts-node src/web/server.ts     (dev)
 */

import express from "express";
import { resolve, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { loadConfig, type AppConfig } from "../config";
import { detectFoundryService, formatServiceInfo } from "../service/detect";
import { fetchModelCatalog, type FoundryModel } from "../models/catalog";
import { runNonStreamingProbe } from "../probes/non-streaming";
import { runRawStreamingProbe } from "../probes/raw-streaming";
import { runCopilotSdkStreamingProbe } from "../probes/copilot-sdk-streaming";
import { writeReport, printSummary } from "../report";
import { testNonStreaming, testStreaming } from "../benchmark/runner";
import type { ProbeResult } from "../types";
import type { ModelBenchmarkEntry, BenchmarkReport } from "../benchmark/types";
import { writeFileSync } from "node:fs";

const app = express();
app.use(express.json());

// Serve static files from src/web/public (dev) or dist/web/public (built)
const publicDir = existsSync(join(__dirname, "public"))
  ? join(__dirname, "public")
  : resolve(__dirname, "../../src/web/public");
app.use(express.static(publicDir));

const PORT = parseInt(process.env.WEB_PORT ?? "3000", 10);
const REPORT_PATH = resolve(process.cwd(), "report.json");
const BENCHMARK_PATH = resolve(process.cwd(), "benchmark-report.json");

/** Shared config – loaded once, mutated when auto-detect fills in URL */
let cfg: AppConfig;

// ── Helpers ──────────────────────────────────────────────

function ensureConfig(): AppConfig {
  if (!cfg) cfg = loadConfig();
  return cfg;
}

async function ensureBaseUrl(): Promise<string> {
  const c = ensureConfig();

  // Always re-detect – service port can change after restart
  const svc = detectFoundryService(c.requestTimeoutMs);
  if (svc.running && svc.baseUrl) {
    c.foundryBaseUrl = svc.baseUrl;
    return c.foundryBaseUrl;
  }

  // Fall back to any previously configured URL
  if (c.foundryBaseUrl) return c.foundryBaseUrl;

  throw new Error("Foundry Local not detected. Start it or set FOUNDRY_BASE_URL.");
}

// ── API: Service status ──────────────────────────────────

app.get("/api/status", (_req, res) => {
  try {
    const c = ensureConfig();
    const svc = detectFoundryService(c.requestTimeoutMs);

    if (svc.running && svc.baseUrl && !c.foundryBaseUrl) {
      c.foundryBaseUrl = svc.baseUrl;
    }

    res.json({
      ...svc,
      configuredBaseUrl: c.foundryBaseUrl,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── API: Model catalog ───────────────────────────────────

app.get("/api/models", async (_req, res) => {
  try {
    const baseUrl = await ensureBaseUrl();
    const c = ensureConfig();
    const models = await fetchModelCatalog(baseUrl, c.foundryApiKey, c.requestTimeoutMs);
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── API: Run all probes ──────────────────────────────────

app.post("/api/probes/all", async (req, res) => {
  try {
    const { model } = req.body as { model?: string };
    if (!model) return res.status(400).json({ error: "model is required" });

    await ensureBaseUrl();
    const c = ensureConfig();
    c.foundryModel = model;

    const results: ProbeResult[] = [];

    // Probe 1
    try {
      results.push(await runNonStreamingProbe(c));
    } catch (err) {
      results.push({
        probe: "non-streaming",
        outcome: "ERROR",
        timings: { startMs: Date.now(), endMs: Date.now(), totalMs: 0 },
        error: String(err),
        payloadHash: "unknown",
      });
    }

    // Probe 2
    try {
      results.push(await runRawStreamingProbe(c));
    } catch (err) {
      results.push({
        probe: "raw-streaming",
        outcome: "ERROR",
        timings: { startMs: Date.now(), endMs: Date.now(), totalMs: 0 },
        error: String(err),
        payloadHash: "unknown",
      });
    }

    // Probe 3
    try {
      results.push(await runCopilotSdkStreamingProbe(c));
    } catch (err) {
      results.push({
        probe: "copilot-sdk-streaming",
        outcome: "ERROR",
        timings: { startMs: Date.now(), endMs: Date.now(), totalMs: 0 },
        error: String(err),
        payloadHash: "unknown",
      });
    }

    const report = writeReport(c, results);
    printSummary(report);

    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── API: Run single probe ────────────────────────────────

app.post("/api/probe/:name", async (req, res) => {
  try {
    const { model } = req.body as { model?: string };
    if (!model) return res.status(400).json({ error: "model is required" });

    await ensureBaseUrl();
    const c = ensureConfig();
    c.foundryModel = model;

    let result: ProbeResult;
    const name = req.params.name;

    switch (name) {
      case "non-streaming":
        result = await runNonStreamingProbe(c);
        break;
      case "raw-streaming":
        result = await runRawStreamingProbe(c);
        break;
      case "copilot-sdk":
        result = await runCopilotSdkStreamingProbe(c);
        break;
      default:
        return res.status(400).json({ error: `Unknown probe: ${name}` });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── API: Benchmark ───────────────────────────────────────

app.post("/api/benchmark", async (_req, res) => {
  try {
    const baseUrl = await ensureBaseUrl();
    const c = ensureConfig();

    const models = await fetchModelCatalog(baseUrl, c.foundryApiKey, c.requestTimeoutMs);
    if (models.length === 0) {
      return res.status(404).json({ error: "No models found in catalog" });
    }

    const entries: ModelBenchmarkEntry[] = [];

    for (const m of models) {
      const nsResult = await testNonStreaming(c, m.id);
      const sResult = await testStreaming(c, m.id);

      const nsOk = nsResult.outcome === "OK";
      const sOk = sResult.outcome === "OK";
      let verdict: ModelBenchmarkEntry["verdict"];
      if (nsOk && sOk) verdict = "BOTH_OK";
      else if (nsOk && !sOk) verdict = "STREAM_ONLY_FAIL";
      else if (!nsOk && sOk) verdict = "NON_STREAM_FAIL";
      else verdict = "BOTH_FAIL";

      entries.push({
        model: m.id,
        nonStreaming: nsResult,
        streaming: sResult,
        supportsStreaming: sOk,
        verdict,
      });
    }

    const report: BenchmarkReport = {
      timestamp: new Date().toISOString(),
      foundryBaseUrl: c.foundryBaseUrl,
      totalModels: entries.length,
      modelsWithStreaming: entries.filter((e) => e.supportsStreaming).length,
      modelsWithoutStreaming: entries.filter((e) => !e.supportsStreaming).length,
      entries,
    };

    writeFileSync(BENCHMARK_PATH, JSON.stringify(report, null, 2), "utf-8");
    console.log(`✅ Benchmark report written to ${BENCHMARK_PATH}`);

    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── API: Read reports from disk ──────────────────────────

app.get("/api/report", (_req, res) => {
  if (!existsSync(REPORT_PATH)) {
    return res.status(404).json({ error: "No report.json found. Run probes first." });
  }
  const data = JSON.parse(readFileSync(REPORT_PATH, "utf-8"));
  res.json(data);
});

app.get("/api/benchmark-report", (_req, res) => {
  if (!existsSync(BENCHMARK_PATH)) {
    return res.status(404).json({ error: "No benchmark-report.json found. Run benchmark first." });
  }
  const data = JSON.parse(readFileSync(BENCHMARK_PATH, "utf-8"));
  res.json(data);
});

// ── Fallback to index.html for SPA ──────────────────────

app.get("/{*path}", (_req, res) => {
  res.sendFile(join(publicDir, "index.html"));
});

// ── Start server ─────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🌐  Foundry Local Streaming Validation – Web UI`);
  console.log(`    http://localhost:${PORT}\n`);
});
