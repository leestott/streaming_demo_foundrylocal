/**
 * Application configuration loaded from environment variables.
 */

import { config as loadDotenv } from "dotenv";

export interface AppConfig {
  /** Base URL for Foundry Local (e.g. http://127.0.0.1:5272/v1) */
  foundryBaseUrl: string;
  /** Model identifier to use in requests (may be set later via picker) */
  foundryModel: string;
  /** API key (typically "unused" for local) */
  foundryApiKey: string;
  /** Copilot BYOK provider type – always "openai" here */
  copilotByokProviderType: string;
  /** Copilot wire API – "completions" */
  copilotWireApi: string;
  /** Hard overall request timeout (ms) */
  requestTimeoutMs: number;
  /** Max time to wait for HTTP response headers (ms) */
  firstByteTimeoutMs: number;
  /** Max time to wait for first SSE data: event (ms) */
  firstEventTimeoutMs: number;
}

export function loadConfig(): AppConfig {
  loadDotenv();

  // FOUNDRY_BASE_URL is now optional – if absent, auto-detect via `foundry service status`
  const foundryBaseUrl = process.env.FOUNDRY_BASE_URL ?? "";

  // FOUNDRY_MODEL is now optional – if absent, the interactive picker will be used
  const foundryModel = process.env.FOUNDRY_MODEL ?? "";

  return {
    foundryBaseUrl: foundryBaseUrl.replace(/\/+$/, ""),
    foundryModel,
    foundryApiKey: process.env.FOUNDRY_API_KEY ?? "unused",
    copilotByokProviderType: process.env.COPILOT_BYOK_PROVIDER_TYPE ?? "openai",
    copilotWireApi: process.env.COPILOT_WIRE_API ?? "completions",
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS ?? "30000", 10),
    firstByteTimeoutMs: parseInt(process.env.FIRST_BYTE_TIMEOUT_MS ?? "10000", 10),
    firstEventTimeoutMs: parseInt(process.env.FIRST_EVENT_TIMEOUT_MS ?? "15000", 10),
  };
}
