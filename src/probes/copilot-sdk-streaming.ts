/**
 * Probe 3 – Copilot SDK BYOK streaming via the OpenAI Node SDK.
 *
 * The GitHub Copilot BYOK (Bring Your Own Key) feature with
 * provider type "openai" and wire_api "completions" delegates to the
 * standard OpenAI chat completions wire protocol. The official
 * `openai` npm package is therefore the faithful SDK representation
 * of what Copilot does under the hood.
 *
 * This probe:
 *   1. Creates an OpenAI client pointed at FOUNDRY_BASE_URL with FOUNDRY_API_KEY.
 *   2. Calls chat.completions.create({ stream: true }).
 *   3. Iterates the async stream and records timing + tokens.
 *   4. Hard-timeboxes the entire operation. If no first event arrives
 *      within FIRST_EVENT_TIMEOUT_MS, it terminates and reports NO_FIRST_EVENT.
 */

import OpenAI from "openai";
import type { AppConfig } from "../config";
import type { ProbeResult } from "../types";
import { Timer } from "../utils/timing";
import { hashPayload } from "../utils/hash";
import { PROBE_MESSAGES } from "./non-streaming";

export async function runCopilotSdkStreamingProbe(cfg: AppConfig): Promise<ProbeResult> {
  const timer = new Timer();

  // AbortController for hard timebox
  const controller = new AbortController();

  let firstEventReceived = false;

  const requestTimer = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort("REQUEST_TIMEOUT");
  }, cfg.requestTimeoutMs);

  const firstEventTimer = setTimeout(() => {
    if (!firstEventReceived && !controller.signal.aborted) {
      controller.abort("FIRST_EVENT_TIMEOUT");
    }
  }, cfg.firstEventTimeoutMs);

  const payload = {
    model: cfg.foundryModel,
    messages: [...PROBE_MESSAGES],
    stream: true as const,
    max_tokens: 256,
  };
  const pHash = hashPayload(payload);

  console.log(
    `[copilot-sdk] OpenAI SDK streaming via ${cfg.foundryBaseUrl}  ` +
      `provider=${cfg.copilotByokProviderType}  wire=${cfg.copilotWireApi}  ` +
      `(payload hash: ${pHash})`,
  );

  // ── Create OpenAI client pointed at Foundry Local ─────────
  const client = new OpenAI({
    apiKey: cfg.foundryApiKey,
    baseURL: cfg.foundryBaseUrl,
    timeout: cfg.requestTimeoutMs,
    maxRetries: 0,
  });

  let chunkCount = 0;
  let doneReceived = false;
  const tokenParts: string[] = [];
  let httpStatus: number | undefined;
  let headers: Record<string, string> | undefined;

  try {
    const stream = await client.chat.completions.create(
      {
        ...payload,
        stream: true,
      },
      {
        signal: controller.signal,
      },
    );

    // The SDK resolves this promise once headers arrive
    timer.markTTFB();

    // Access the underlying response if available (not always typed)
    const rawResponse = (stream as unknown as { response?: Response }).response;
    if (rawResponse) {
      httpStatus = rawResponse.status;
      headers = extractHeadersFromResponse(rawResponse);
    }

    console.log(
      `[copilot-sdk] Stream object obtained (TTFB ${timer.toTimings().ttfbMs} ms)`,
    );

    for await (const chunk of stream) {
      chunkCount++;

      if (!firstEventReceived) {
        firstEventReceived = true;
        clearTimeout(firstEventTimer);
        timer.markFirstEvent();
        console.log(
          `[copilot-sdk] First chunk at ${timer.toTimings().firstEventMs} ms`,
        );
      }

      // Extract token content
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        tokenParts.push(delta.content);
      }

      // Check finish reason
      const finishReason = chunk.choices?.[0]?.finish_reason;
      if (finishReason === "stop") {
        doneReceived = true;
      }
    }

    // After iterator exhausts, [DONE] has been received
    if (!doneReceived && chunkCount > 0) {
      doneReceived = true; // Iterator completing means [DONE] was processed by SDK
    }

    timer.stop();
    const timings = timer.toTimings();

    const outcome = doneReceived ? "OK" : chunkCount > 0 ? "FAIL" : "NO_FIRST_EVENT";

    console.log(
      `[copilot-sdk] Done. outcome=${outcome}  chunks=${chunkCount}  ` +
        `tokens=${tokenParts.length}  total=${timings.totalMs} ms`,
    );

    return {
      probe: "copilot-sdk-streaming",
      outcome,
      httpStatus,
      headers,
      timings,
      chunkCount,
      doneReceived,
      tokenPreview: tokenParts.join("").slice(0, 200),
      payloadHash: pHash,
    };
  } catch (err: unknown) {
    timer.stop();
    const msg = err instanceof Error ? err.message : String(err);

    let outcome: ProbeResult["outcome"] = "ERROR";
    if (msg.includes("FIRST_EVENT_TIMEOUT") || msg.includes("NO_FIRST_EVENT")) {
      outcome = "NO_FIRST_EVENT";
    } else if (msg.includes("REQUEST_TIMEOUT")) {
      outcome = "TIMEOUT";
    } else if (msg.includes("AbortError") || msg.includes("aborted") || msg.includes("abort")) {
      outcome = chunkCount === 0 ? "HANG" : "TIMEOUT";
    } else if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
      outcome = "FAIL";
    }

    console.error(`[copilot-sdk] ${outcome}: ${msg}`);

    return {
      probe: "copilot-sdk-streaming",
      outcome,
      httpStatus,
      headers,
      timings: timer.toTimings(),
      chunkCount: chunkCount > 0 ? chunkCount : undefined,
      doneReceived,
      error: msg,
      payloadHash: pHash,
    };
  } finally {
    clearTimeout(requestTimer);
    clearTimeout(firstEventTimer);
  }
}

function extractHeadersFromResponse(res: Response): Record<string, string> {
  const keep = [
    "content-type",
    "transfer-encoding",
    "x-request-id",
    "server",
    "connection",
  ];
  const out: Record<string, string> = {};
  for (const key of keep) {
    const val = res.headers.get(key);
    if (val) out[key] = val;
  }
  return out;
}
