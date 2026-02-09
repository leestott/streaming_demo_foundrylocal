/**
 * Probe 2 – Raw streaming chat completion (stream: true) via fetch + manual SSE parsing.
 *
 * Records:
 *   • TTFB (time to response headers)
 *   • Time to first SSE "data:" event
 *   • Number of chunks
 *   • Whether data:[DONE] is received
 *
 * Enforces FIRST_BYTE_TIMEOUT_MS, FIRST_EVENT_TIMEOUT_MS, and REQUEST_TIMEOUT_MS
 * using AbortController so the demo never hangs.
 */

import type { AppConfig } from "../config";
import type { ChatCompletionRequest, ProbeResult } from "../types";
import { Timer } from "../utils/timing";
import { hashPayload } from "../utils/hash";
import { parseSSE } from "../sse/parser";
import { PROBE_MESSAGES } from "./non-streaming";

export async function runRawStreamingProbe(cfg: AppConfig): Promise<ProbeResult> {
  const timer = new Timer();
  const controller = new AbortController();

  // ── Timeout guards ────────────────────────────────────────
  let headersReceived = false;
  let firstEventReceived = false;

  const requestTimer = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort("REQUEST_TIMEOUT");
  }, cfg.requestTimeoutMs);

  const firstByteTimer = setTimeout(() => {
    if (!headersReceived && !controller.signal.aborted) {
      controller.abort("FIRST_BYTE_TIMEOUT");
    }
  }, cfg.firstByteTimeoutMs);

  const firstEventTimer = setTimeout(() => {
    if (!firstEventReceived && !controller.signal.aborted) {
      controller.abort("FIRST_EVENT_TIMEOUT");
    }
  }, cfg.firstEventTimeoutMs);

  const url = `${cfg.foundryBaseUrl}/chat/completions`;
  const body: ChatCompletionRequest = {
    model: cfg.foundryModel,
    messages: [...PROBE_MESSAGES],
    stream: true,
    max_tokens: 256,
  };
  const pHash = hashPayload(body);

  console.log(`[raw-streaming] POST ${url}  stream:true  (payload hash: ${pHash})`);

  let httpStatus: number | undefined;
  let headers: Record<string, string> | undefined;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${cfg.foundryApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    headersReceived = true;
    clearTimeout(firstByteTimer);
    timer.markTTFB();
    httpStatus = res.status;
    headers = extractHeaders(res.headers);

    console.log(
      `[raw-streaming] Headers received: ${httpStatus}  content-type=${headers["content-type"] ?? "n/a"}  (TTFB ${timer.toTimings().ttfbMs} ms)`,
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "(unable to read body)");
      timer.stop();
      return {
        probe: "raw-streaming",
        outcome: "FAIL",
        httpStatus,
        headers,
        timings: timer.toTimings(),
        error: `HTTP ${httpStatus}: ${errText.slice(0, 500)}`,
        payloadHash: pHash,
      };
    }

    if (!res.body) {
      timer.stop();
      return {
        probe: "raw-streaming",
        outcome: "FAIL",
        httpStatus,
        headers,
        timings: timer.toTimings(),
        error: "Response body is null – cannot stream",
        payloadHash: pHash,
      };
    }

    // ── Parse SSE events ──────────────────────────────────
    let chunkCount = 0;
    let doneReceived = false;
    const tokenParts: string[] = [];

    for await (const evt of parseSSE(res.body, controller.signal)) {
      chunkCount++;

      if (!firstEventReceived) {
        firstEventReceived = true;
        clearTimeout(firstEventTimer);
        timer.markFirstEvent();
        console.log(
          `[raw-streaming] First SSE event at ${timer.toTimings().firstEventMs} ms`,
        );
      }

      if (evt.data === "[DONE]") {
        doneReceived = true;
        console.log(`[raw-streaming] Received [DONE] after ${chunkCount} chunks`);
        break;
      }

      // Attempt to extract delta content for a token preview
      try {
        const parsed = JSON.parse(evt.data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) tokenParts.push(content);
      } catch {
        // non-JSON data line – skip
      }
    }

    timer.stop();
    const timings = timer.toTimings();

    const outcome = doneReceived ? "OK" : chunkCount > 0 ? "FAIL" : "NO_FIRST_EVENT";

    console.log(
      `[raw-streaming] Done. outcome=${outcome}  chunks=${chunkCount}  done=${doneReceived}  total=${timings.totalMs} ms`,
    );

    return {
      probe: "raw-streaming",
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
    if (msg.includes("FIRST_BYTE_TIMEOUT")) outcome = "NO_FIRST_BYTE";
    else if (msg.includes("FIRST_EVENT_TIMEOUT")) outcome = "NO_FIRST_EVENT";
    else if (msg.includes("REQUEST_TIMEOUT")) outcome = "TIMEOUT";
    else if (msg.includes("AbortError") || msg.includes("aborted")) outcome = "TIMEOUT";

    console.error(`[raw-streaming] ${outcome}: ${msg}`);

    return {
      probe: "raw-streaming",
      outcome,
      httpStatus,
      headers,
      timings: timer.toTimings(),
      error: msg,
      payloadHash: pHash,
    };
  } finally {
    clearTimeout(requestTimer);
    clearTimeout(firstByteTimer);
    clearTimeout(firstEventTimer);
  }
}

function extractHeaders(h: Headers): Record<string, string> {
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
    const val = h.get(key);
    if (val) out[key] = val;
  }
  return out;
}
