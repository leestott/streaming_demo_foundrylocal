/**
 * Report generation – writes report.json and prints a human-readable console summary.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DiagnosticReport, ProbeResult } from "./types";
import type { AppConfig } from "./config";

const REPORT_PATH = resolve(process.cwd(), "report.json");

/** Persist the full diagnostic report to disk */
export function writeReport(config: AppConfig, probes: ProbeResult[]): DiagnosticReport {
  const report: DiagnosticReport = {
    timestamp: new Date().toISOString(),
    config: {
      foundryBaseUrl: config.foundryBaseUrl,
      foundryModel: config.foundryModel,
      copilotByokProviderType: config.copilotByokProviderType,
      copilotWireApi: config.copilotWireApi,
      requestTimeoutMs: config.requestTimeoutMs,
      firstByteTimeoutMs: config.firstByteTimeoutMs,
      firstEventTimeoutMs: config.firstEventTimeoutMs,
    },
    probes,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n✅  Report written to ${REPORT_PATH}\n`);
  return report;
}

/** Print a readable summary table to stdout */
export function printSummary(report: DiagnosticReport): void {
  const sep = "═".repeat(78);
  const thin = "─".repeat(78);

  console.log(sep);
  console.log("  FOUNDRY LOCAL STREAMING VALIDATION REPORT");
  console.log(`  ${report.timestamp}`);
  console.log(`  Model: ${report.config.foundryModel}   Base: ${report.config.foundryBaseUrl}`);
  console.log(sep);

  for (const p of report.probes) {
    const icon = p.outcome === "OK" ? "✅" : p.outcome === "TIMEOUT" || p.outcome === "HANG" ? "⏱️ " : "❌";
    console.log(thin);
    console.log(`  ${icon}  ${p.probe}`);
    console.log(`      Outcome       : ${p.outcome}`);
    if (p.httpStatus !== undefined) console.log(`      HTTP Status   : ${p.httpStatus}`);
    console.log(`      Total time    : ${p.timings.totalMs} ms`);
    if (p.timings.ttfbMs !== undefined) console.log(`      TTFB          : ${p.timings.ttfbMs} ms`);
    if (p.timings.firstEventMs !== undefined)
      console.log(`      First event   : ${p.timings.firstEventMs} ms`);
    if (p.chunkCount !== undefined) console.log(`      Chunks        : ${p.chunkCount}`);
    if (p.doneReceived !== undefined) console.log(`      [DONE] recv'd : ${p.doneReceived}`);
    if (p.tokenPreview) console.log(`      Token preview : "${p.tokenPreview.slice(0, 80)}…"`);
    if (p.error) console.log(`      Error         : ${p.error.slice(0, 120)}`);
    console.log(`      Payload hash  : ${p.payloadHash}`);
  }

  console.log(sep);

  // Overall verdict
  const allOk = report.probes.every((p) => p.outcome === "OK");
  const streamingProbes = report.probes.filter((p) => p.probe !== "non-streaming");
  const nonStreamOk = report.probes.find((p) => p.probe === "non-streaming")?.outcome === "OK";
  const streamHang = streamingProbes.some(
    (p) => p.outcome === "HANG" || p.outcome === "NO_FIRST_EVENT" || p.outcome === "TIMEOUT",
  );

  if (allOk) {
    console.log("  🎉  ALL PROBES PASSED – streaming and non-streaming both work.");
  } else if (nonStreamOk && streamHang) {
    console.log("  ⚠️   STREAMING HANG DETECTED – non-streaming works but streaming hangs.");
    console.log("       This reproduces the known Foundry Local v0.5 streaming issue.");
  } else {
    console.log("  ❌  Some probes failed. See details above and report.json.");
  }

  console.log(sep);
}
