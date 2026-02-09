/**
 * Probe 1 – Non-streaming chat completion (stream: false).
 *
 * Sends a single POST to {base}/chat/completions with stream:false.
 * Must succeed or fail fast with error details.
 */

import type { AppConfig } from "../config";
import type { ChatCompletionRequest, ProbeResult } from "../types";
import { Timer } from "../utils/timing";
import { hashPayload } from "../utils/hash";

/** The prompt used across all probes – designed to elicit multi-token output */
export const PROBE_MESSAGES = [
  {
    role: "user",
    content:
      "Explain the Fibonacci sequence in exactly three sentences. Be concise but complete.",
  },
] as const;

export async function runNonStreamingProbe(cfg: AppConfig): Promise<ProbeResult> {
  const timer = new Timer();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("REQUEST_TIMEOUT"), cfg.requestTimeoutMs);

  const url = `${cfg.foundryBaseUrl}/chat/completions`;
  const body: ChatCompletionRequest = {
    model: cfg.foundryModel,
    messages: [...PROBE_MESSAGES],
    stream: false,
    max_tokens: 256,
  };
  const pHash = hashPayload(body);

  console.log(`[non-streaming] POST ${url}  (payload hash: ${pHash})`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.foundryApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    timer.markTTFB();

    const headersObj = extractHeaders(res.headers);
    const status = res.status;

    if (!res.ok) {
      const errText = await res.text().catch(() => "(unable to read body)");
      timer.stop();
      return {
        probe: "non-streaming",
        outcome: "FAIL",
        httpStatus: status,
        headers: headersObj,
        timings: timer.toTimings(),
        error: `HTTP ${status}: ${errText.slice(0, 500)}`,
        payloadHash: pHash,
      };
    }

    // Consume body to measure full round-trip
    const json: unknown = await res.json();
    timer.stop();

    // Basic shape check
    const hasChoices =
      typeof json === "object" &&
      json !== null &&
      "choices" in json &&
      Array.isArray((json as Record<string, unknown>).choices);

    console.log(
      `[non-streaming] ${status} OK – choices present: ${hasChoices}  (${timer.toTimings().totalMs} ms)`,
    );

    return {
      probe: "non-streaming",
      outcome: hasChoices ? "OK" : "FAIL",
      httpStatus: status,
      headers: headersObj,
      timings: timer.toTimings(),
      error: hasChoices ? undefined : "Response JSON missing 'choices' array",
      payloadHash: pHash,
    };
  } catch (err: unknown) {
    timer.stop();
    const msg = err instanceof Error ? err.message : String(err);
    const outcome = msg.includes("REQUEST_TIMEOUT") ? "TIMEOUT" : "ERROR";
    console.error(`[non-streaming] ${outcome}: ${msg}`);
    return {
      probe: "non-streaming",
      outcome,
      timings: timer.toTimings(),
      error: msg,
      payloadHash: pHash,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Extract a safe subset of response headers */
function extractHeaders(headers: Headers): Record<string, string> {
  const keep = [
    "content-type",
    "transfer-encoding",
    "x-request-id",
    "x-ratelimit-remaining",
    "server",
    "connection",
  ];
  const out: Record<string, string> = {};
  for (const key of keep) {
    const val = headers.get(key);
    if (val) out[key] = val;
  }
  return out;
}
