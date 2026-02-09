/**
 * Benchmark runner – tests each model in the Foundry Local catalog
 * for both non-streaming and streaming support.
 *
 * For each model:
 *   1) POST /chat/completions with stream:false → records outcome + timing
 *   2) POST /chat/completions with stream:true  → records outcome + timing + chunks
 *
 * Uses strict timeouts so no single model test can hang.
 */

import type { AppConfig } from "../config";
import type { ChatCompletionRequest, ProbeTimings } from "../types";
import type { ModelTestResult } from "./types";
import { Timer } from "../utils/timing";
import { hashPayload } from "../utils/hash";
import { parseSSE } from "../sse/parser";

const BENCHMARK_MESSAGES = [
  {
    role: "user" as const,
    content: "Count from 1 to 10, one number per line.",
  },
];

/**
 * Test a single model with stream:false.
 */
export async function testNonStreaming(
  cfg: AppConfig,
  model: string,
): Promise<ModelTestResult> {
  const timer = new Timer();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("REQUEST_TIMEOUT"), cfg.requestTimeoutMs);

  const url = `${cfg.foundryBaseUrl}/chat/completions`;
  const body: ChatCompletionRequest = {
    model,
    messages: BENCHMARK_MESSAGES,
    stream: false,
    max_tokens: 128,
  };

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
    const status = res.status;

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      timer.stop();
      return {
        model,
        mode: "non-streaming",
        outcome: "FAIL",
        httpStatus: status,
        timings: timer.toTimings(),
        error: `HTTP ${status}: ${errText.slice(0, 300)}`,
      };
    }

    const json: unknown = await res.json();
    timer.stop();

    const hasChoices =
      typeof json === "object" &&
      json !== null &&
      "choices" in json &&
      Array.isArray((json as Record<string, unknown>).choices);

    // Extract content for preview
    let preview = "";
    if (hasChoices) {
      const choices = (json as { choices: Array<{ message?: { content?: string } }> }).choices;
      preview = choices[0]?.message?.content?.slice(0, 200) ?? "";
    }

    return {
      model,
      mode: "non-streaming",
      outcome: hasChoices ? "OK" : "FAIL",
      httpStatus: status,
      timings: timer.toTimings(),
      tokenPreview: preview,
      error: hasChoices ? undefined : "Missing choices array",
    };
  } catch (err: unknown) {
    timer.stop();
    const msg = err instanceof Error ? err.message : String(err);
    return {
      model,
      mode: "non-streaming",
      outcome: msg.includes("TIMEOUT") ? "TIMEOUT" : "ERROR",
      timings: timer.toTimings(),
      error: msg,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Test a single model with stream:true via raw fetch + SSE.
 */
export async function testStreaming(
  cfg: AppConfig,
  model: string,
): Promise<ModelTestResult> {
  const timer = new Timer();
  const controller = new AbortController();

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
    model,
    messages: BENCHMARK_MESSAGES,
    stream: true,
    max_tokens: 128,
  };

  let httpStatus: number | undefined;

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

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      timer.stop();
      return {
        model,
        mode: "streaming",
        outcome: "FAIL",
        httpStatus,
        timings: timer.toTimings(),
        error: `HTTP ${httpStatus}: ${errText.slice(0, 300)}`,
      };
    }

    if (!res.body) {
      timer.stop();
      return {
        model,
        mode: "streaming",
        outcome: "FAIL",
        httpStatus,
        timings: timer.toTimings(),
        error: "Response body is null",
      };
    }

    let chunkCount = 0;
    let doneReceived = false;
    const tokenParts: string[] = [];

    for await (const evt of parseSSE(res.body, controller.signal)) {
      chunkCount++;

      if (!firstEventReceived) {
        firstEventReceived = true;
        clearTimeout(firstEventTimer);
        timer.markFirstEvent();
      }

      if (evt.data === "[DONE]") {
        doneReceived = true;
        break;
      }

      try {
        const parsed = JSON.parse(evt.data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) tokenParts.push(content);
      } catch {
        // skip
      }
    }

    timer.stop();

    const outcome = doneReceived ? "OK" : chunkCount > 0 ? "FAIL" : "NO_FIRST_EVENT";

    return {
      model,
      mode: "streaming",
      outcome,
      httpStatus,
      timings: timer.toTimings(),
      chunkCount,
      doneReceived,
      tokenPreview: tokenParts.join("").slice(0, 200),
    };
  } catch (err: unknown) {
    timer.stop();
    const msg = err instanceof Error ? err.message : String(err);

    let outcome: ModelTestResult["outcome"] = "ERROR";
    if (msg.includes("FIRST_BYTE_TIMEOUT")) outcome = "NO_FIRST_BYTE";
    else if (msg.includes("FIRST_EVENT_TIMEOUT")) outcome = "NO_FIRST_EVENT";
    else if (msg.includes("REQUEST_TIMEOUT")) outcome = "TIMEOUT";
    else if (msg.includes("AbortError") || msg.includes("aborted")) outcome = "TIMEOUT";

    return {
      model,
      mode: "streaming",
      outcome,
      httpStatus,
      timings: timer.toTimings(),
      error: msg,
    };
  } finally {
    clearTimeout(requestTimer);
    clearTimeout(firstByteTimer);
    clearTimeout(firstEventTimer);
  }
}
