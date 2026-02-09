/**
 * Shared type definitions for probe results and the final report.
 */

/** Outcome of a single probe run */
export type ProbeOutcome = "OK" | "FAIL" | "TIMEOUT" | "NO_FIRST_BYTE" | "NO_FIRST_EVENT" | "HANG" | "ERROR";

/** Timing metrics captured during a probe */
export interface ProbeTimings {
  /** Wall-clock start (epoch ms) */
  startMs: number;
  /** Wall-clock end (epoch ms) */
  endMs: number;
  /** Elapsed ms overall */
  totalMs: number;
  /** Time to first byte / response headers (ms), undefined if never received */
  ttfbMs?: number;
  /** Time to first SSE data event (ms), undefined if never received */
  firstEventMs?: number;
}

/** Result from any probe */
export interface ProbeResult {
  probe: "non-streaming" | "raw-streaming" | "copilot-sdk-streaming";
  outcome: ProbeOutcome;
  /** HTTP status code, if a response was received */
  httpStatus?: number;
  /** Selected response headers (lowercase keys) */
  headers?: Record<string, string>;
  /** Timing metrics */
  timings: ProbeTimings;
  /** Number of SSE chunks received (streaming probes only) */
  chunkCount?: number;
  /** Whether data:[DONE] was received */
  doneReceived?: boolean;
  /** Concatenated token text from streaming (for SDK probe) */
  tokenPreview?: string;
  /** Error message (safe – no secrets) */
  error?: string;
  /** SHA-256 hash prefix of the request payload (for auditing) */
  payloadHash: string;
}

/** Final diagnostic report written to report.json */
export interface DiagnosticReport {
  /** ISO timestamp of the run */
  timestamp: string;
  /** Configuration snapshot (secrets redacted) */
  config: {
    foundryBaseUrl: string;
    foundryModel: string;
    copilotByokProviderType: string;
    copilotWireApi: string;
    requestTimeoutMs: number;
    firstByteTimeoutMs: number;
    firstEventTimeoutMs: number;
  };
  probes: ProbeResult[];
}

/** Standard chat completion request body */
export interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream: boolean;
  max_tokens?: number;
}
