/**
 * Foundry Local service discovery – detects the dynamic port
 * by running `foundry service status` and parsing the output.
 *
 * Example output from the CLI:
 *   🟢 Model management service is running on http://127.0.0.1:51995/openai/status
 *
 * We extract the URL, pull the host:port, and construct the OpenAI-compatible
 * base URL at http://127.0.0.1:{port}/v1
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
}

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
    };
  } catch {
    return {
      running: rawOutput.includes("running"),
      rawOutput,
    };
  }
}

/**
 * Pretty-print the service detection result for the console.
 */
export function formatServiceInfo(info: FoundryServiceInfo): string {
  const lines: string[] = [];

  if (info.running) {
    lines.push(`  🟢  Foundry Local is running`);
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
