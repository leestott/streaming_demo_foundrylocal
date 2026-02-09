/**
 * Foundry Local service discovery – detects the dynamic port.
 *
 * Two strategies are available:
 *   1. **SDK-based** (preferred) – uses FoundryLocalManager from
 *      @prathikrao/foundry-local-sdk which talks to the native
 *      Microsoft.AI.Foundry.Local.Core library via FFI.
 *   2. **CLI-based** (fallback) – runs `foundry service status` and
 *      regex-parses the output to extract the port.
 *
 * The `detectFoundryService()` export tries the SDK first; if it fails
 * (e.g. native binary missing) it falls back to the CLI approach.
 */

import { execSync } from "node:child_process";

export interface FoundryServiceInfo {
  /** Whether the service is running */
  running: boolean;
  /** The full status URL reported by foundry (e.g. http://127.0.0.1:51995/openai/status) */
  statusUrl?: string;
  /** The detected host (e.g. 127.0.0.1) */
  host?: string;
  /** The detected port */
  port?: number;
  /** Constructed OpenAI-compatible base URL (e.g. http://127.0.0.1:51995/v1) */
  baseUrl?: string;
  /** Raw stdout from foundry service status */
  rawOutput: string;
  /** Detection method used: "sdk" or "cli" */
  detectedVia?: "sdk" | "cli";
}

// ── SDK-based detection (async) ──────────────────────────

/**
 * Detect Foundry Local service via the SDK's FoundryLocalManager.
 * Returns the same FoundryServiceInfo shape as the CLI-based approach.
 */
export async function detectFoundryServiceSDK(): Promise<FoundryServiceInfo> {
  try {
    const { detectServiceViaSDK } = await import("../sdk/foundry-local");
    const result = await detectServiceViaSDK();

    if (result.running && result.baseUrl) {
      const parsed = new URL(result.baseUrl.replace("/v1", ""));
      return {
        running: true,
        host: parsed.hostname,
        port: parseInt(parsed.port, 10) || undefined,
        baseUrl: result.baseUrl,
        rawOutput: `SDK detected URLs: ${result.urls.join(", ")}`,
        detectedVia: "sdk",
      };
    }

    return {
      running: false,
      rawOutput: "SDK: No service URLs available.",
      detectedVia: "sdk",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      running: false,
      rawOutput: `SDK detection failed: ${msg}`,
    };
  }
}

// ── CLI-based detection (sync) ───────────────────────────

/**
 * Run `foundry service status` and parse the output to detect the port.
 *
 * @param timeoutMs  Max time to wait for the CLI (default 10 s)
 * @returns Parsed service info
 */
export function detectFoundryService(timeoutMs: number = 10_000): FoundryServiceInfo {
  let rawOutput: string;
  try {
    rawOutput = execSync("foundry service status", {
      encoding: "utf-8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    // If the command fails, foundry CLI may not be installed or service is down
    const msg = err instanceof Error ? (err as NodeJS.ErrnoException).message : String(err);
    return {
      running: false,
      rawOutput: msg,
    };
  }

  // Look for a URL in the output
  // Pattern: http://host:port/...
  const urlMatch = rawOutput.match(/https?:\/\/[\w.\-]+:\d+[^\s]*/i);
  if (!urlMatch) {
    // Service may be stopped – check for explicit indicators
    const isRunning = rawOutput.includes("running");
    return {
      running: isRunning,
      rawOutput,
    };
  }

  try {
    const parsed = new URL(urlMatch[0]);
    const host = parsed.hostname;
    const port = parseInt(parsed.port, 10);
    const baseUrl = `${parsed.protocol}//${host}:${port}/v1`;

    return {
      running: true,
      statusUrl: urlMatch[0],
      host,
      port,
      baseUrl,
      rawOutput,
      detectedVia: "cli",
    };
  } catch {
    return {
      running: rawOutput.includes("running"),
      rawOutput,
      detectedVia: "cli",
    };
  }
}

/**
 * Auto-detect using SDK first, falling back to CLI.
 * This is the recommended async entry point.
 */
export async function autoDetectFoundryService(
  timeoutMs: number = 10_000,
): Promise<FoundryServiceInfo> {
  // Try SDK first
  const sdkResult = await detectFoundryServiceSDK();
  if (sdkResult.running && sdkResult.baseUrl) {
    console.log("  ℹ  Detected via Foundry Local SDK (native)");
    return sdkResult;
  }

  // Fall back to CLI
  console.log("  ℹ  SDK detection unavailable – falling back to CLI");
  const cliResult = detectFoundryService(timeoutMs);
  return cliResult;
}

/**
 * Pretty-print the service detection result for the console.
 */
export function formatServiceInfo(info: FoundryServiceInfo): string {
  const lines: string[] = [];

  if (info.running) {
    lines.push(`  🟢  Foundry Local is running`);
    if (info.detectedVia) {
      lines.push(`       Detected   : via ${info.detectedVia}`);
    }
    if (info.port) {
      lines.push(`       Port       : ${info.port}`);
      lines.push(`       Status URL : ${info.statusUrl}`);
      lines.push(`       Base URL   : ${info.baseUrl}`);
    }
  } else {
    lines.push(`  🔴  Foundry Local is NOT running`);
    lines.push(`       Run 'foundry service start' to start it.`);
  }

  return lines.join("\n");
}
