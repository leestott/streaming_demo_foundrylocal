/**
 * Version information utilities.
 *
 * Collects version strings for:
 *   - This application (from package.json)
 *   - Foundry Local CLI (`foundry --version`)
 *   - Foundry Local SDK (@prathikrao/foundry-local-sdk)
 *   - Node.js runtime
 *   - OpenAI SDK
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

export interface VersionInfo {
  /** Application version from package.json */
  app: string;
  /** Node.js runtime version */
  node: string;
  /** Foundry Local CLI version (or null if not installed) */
  foundryCli: string | null;
  /** Foundry Local SDK version (or null if not installed) */
  foundrySDK: string | null;
  /** OpenAI SDK version */
  openaiSDK: string | null;
  /** Detection method used for service discovery */
  detectionMethod: "sdk" | "cli" | "unknown";
}

/**
 * Get the application version from package.json.
 */
function getAppVersion(): string {
  try {
    // Try multiple paths (dev vs built)
    const candidates = [
      resolve(__dirname, "../../package.json"),
      resolve(__dirname, "../../../package.json"),
      resolve(process.cwd(), "package.json"),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        const pkg = JSON.parse(readFileSync(p, "utf-8"));
        return pkg.version || "unknown";
      }
    }
  } catch { /* ignore */ }
  return "unknown";
}

/**
 * Get the Foundry Local CLI version by running `foundry --version`.
 */
function getFoundryCLIVersion(): string | null {
  try {
    const output = execSync("foundry --version", {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

    // Output may be just a version string like "0.5.1" or "foundry 0.5.1"
    const match = output.match(/(\d+\.\d+\.\d+[\w.-]*)/);
    return match ? match[1] : output || null;
  } catch {
    return null;
  }
}

/**
 * Get the installed version of an npm package from its package.json.
 */
function getInstalledPackageVersion(packageName: string): string | null {
  try {
    const candidates = [
      resolve(process.cwd(), "node_modules", packageName, "package.json"),
      resolve(__dirname, "../../node_modules", packageName, "package.json"),
      resolve(__dirname, "../../../node_modules", packageName, "package.json"),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        const pkg = JSON.parse(readFileSync(p, "utf-8"));
        return pkg.version || null;
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Collect all version information.
 */
export function getVersionInfo(detectionMethod: "sdk" | "cli" | "unknown" = "unknown"): VersionInfo {
  return {
    app: getAppVersion(),
    node: process.version.replace(/^v/, ""),
    foundryCli: getFoundryCLIVersion(),
    foundrySDK: getInstalledPackageVersion("@prathikrao/foundry-local-sdk"),
    openaiSDK: getInstalledPackageVersion("openai"),
    detectionMethod,
  };
}

/**
 * Format version info for console output.
 */
export function formatVersionInfo(info: VersionInfo): string {
  const lines: string[] = [];
  lines.push(`  App version        : ${info.app}`);
  lines.push(`  Node.js            : ${info.node}`);
  lines.push(`  Foundry CLI        : ${info.foundryCli ?? "not found"}`);
  lines.push(`  Foundry SDK        : ${info.foundrySDK ?? "not installed"}`);
  lines.push(`  OpenAI SDK         : ${info.openaiSDK ?? "not installed"}`);
  lines.push(`  Detection method   : ${info.detectionMethod}`);
  return lines.join("\n");
}
