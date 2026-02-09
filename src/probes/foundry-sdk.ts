/**
 * Probe 4 – Foundry Local SDK-powered probe.
 *
 * Uses the @prathikrao/foundry-local-sdk for:
 *   • Model catalog discovery (23+ models via native FFI)
 *   • Model alias → variant ID resolution
 *   • Service lifecycle management
 *
 * Chat completions are sent via HTTP to the Foundry service because the
 * SDK's native ChatClient (coreInterop) requires models loaded within its
 * own process, which conflicts with the CLI-managed service and
 * platform-specific model variants (e.g. CUDA vs generic-gpu).
 *
 * Records:
 *   • Total elapsed time
 *   • Time to first streaming chunk (streaming sub-probe)
 *   • Number of chunks and [DONE] receipt (streaming sub-probe)
 *   • Token preview from the response
 *   • SDK-resolved model metadata
 */

import type { ProbeResult } from "../types";
import type { AppConfig } from "../config";
import type { ChatMessage } from "@prathikrao/foundry-local-sdk";
import { Timer } from "../utils/timing";
import { hashPayload } from "../utils/hash";
import { parseSSE } from "../sse/parser";

export const SDK_PROBE_MESSAGES: ChatMessage[] = [
  { role: "system", content: "You are a helpful assistant. Reply concisely." },
  { role: "user", content: "Explain what Foundry Local is in two sentences." },
];

/**
 * Dynamically import the SDK wrapper.
 */
async function loadSDKWrapper() {
  return await import("../sdk/foundry-local");
}

/**
 * Use the SDK to resolve a model identifier to catalog metadata.
 * Returns the alias and best variant ID for logging.
 */
async function resolveModelViaSDK(modelIdentifier: string): Promise<{
  alias?: string;
  resolvedId?: string;
  variantCount?: number;
}> {
  try {
    const sdk = await loadSDKWrapper();
    const resolved = await sdk.resolveModel(modelIdentifier);
    return resolved ?? {};
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────
// Probe 4a – Non-streaming via SDK catalog + HTTP completion
// ─────────────────────────────────────────────────────────

export async function runFoundrySDKProbe(cfg: AppConfig): Promise<ProbeResult> {
  const timer = new Timer();

  const payload = {
    model: cfg.foundryModel,
    messages: [...SDK_PROBE_MESSAGES],
    stream: false,
    max_tokens: 256,
  };
  const pHash = hashPayload(payload);

  console.log(
    `[foundry-sdk] SDK-powered chat completion – model=${cfg.foundryModel}  (payload hash: ${pHash})`,
  );

  try {
    // Phase 1: SDK model resolution
    const resolved = await resolveModelViaSDK(cfg.foundryModel);
    if (resolved.alias) {
      console.log(
        `[foundry-sdk] SDK resolved: alias="${resolved.alias}" id="${resolved.resolvedId}" variants=${resolved.variantCount}`,
      );
    }

    timer.markTTFB();

    // Phase 2: HTTP chat completion against Foundry service
    const url = `${cfg.foundryBaseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.foundryApiKey ? { Authorization: `Bearer ${cfg.foundryApiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(cfg.requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    timer.stop();

    const timings = timer.toTimings();
    const choices = data?.choices as Array<{message?: {content?: string}}> | undefined;
    const content = choices?.[0]?.message?.content ?? "";

    console.log(
      `[foundry-sdk] Done. outcome=OK  total=${timings.totalMs} ms` +
        (content ? `  "${content.slice(0, 60)}…"` : ""),
    );

    return {
      probe: "foundry-sdk",
      outcome: "OK",
      httpStatus: response.status,
      timings,
      tokenPreview: content.slice(0, 200),
      payloadHash: pHash,
    };
  } catch (err: unknown) {
    timer.stop();
    const msg = err instanceof Error ? err.message : String(err);

    let outcome: ProbeResult["outcome"] = "ERROR";
    if (msg.includes("TIMEOUT") || msg.includes("timeout")) outcome = "TIMEOUT";
    else if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) outcome = "FAIL";

    console.error(`[foundry-sdk] ${outcome}: ${msg}`);

    return {
      probe: "foundry-sdk",
      outcome,
      timings: timer.toTimings(),
      error: msg,
      payloadHash: pHash,
    };
  }
}

// ─────────────────────────────────────────────────────────
// Probe 4b – Streaming via SDK catalog + HTTP SSE
// ─────────────────────────────────────────────────────────

export async function runFoundrySDKStreamingProbe(cfg: AppConfig): Promise<ProbeResult> {
  const timer = new Timer();

  const payload = {
    model: cfg.foundryModel,
    messages: [...SDK_PROBE_MESSAGES],
    stream: true,
    max_tokens: 256,
  };
  const pHash = hashPayload(payload);

  console.log(
    `[foundry-sdk-stream] SDK-powered streaming – model=${cfg.foundryModel}  (payload hash: ${pHash})`,
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);

  try {
    // Phase 1: SDK model resolution
    const resolved = await resolveModelViaSDK(cfg.foundryModel);
    if (resolved.alias) {
      console.log(
        `[foundry-sdk-stream] SDK resolved: alias="${resolved.alias}" id="${resolved.resolvedId}" variants=${resolved.variantCount}`,
      );
    }

    timer.markTTFB();

    // Phase 2: HTTP SSE streaming against Foundry service
    const url = `${cfg.foundryBaseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.foundryApiKey ? { Authorization: `Bearer ${cfg.foundryApiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("No response body for streaming request.");
    }

    let chunkCount = 0;
    let firstEventReceived = false;
    let doneReceived = false;
    const tokenParts: string[] = [];

    for await (const event of parseSSE(response.body, controller.signal)) {
      chunkCount++;

      if (!firstEventReceived) {
        firstEventReceived = true;
        timer.markFirstEvent();
        console.log(
          `[foundry-sdk-stream] First chunk at ${timer.toTimings().firstEventMs} ms`,
        );
      }

      if (event.data === "[DONE]") {
        doneReceived = true;
        break;
      }

      try {
        const parsed = JSON.parse(event.data);
        const content = parsed?.choices?.[0]?.delta?.content;
        if (content) tokenParts.push(content);

        const finishReason = parsed?.choices?.[0]?.finish_reason;
        if (finishReason === "stop") doneReceived = true;
      } catch {
        // Non-JSON chunk — skip
      }
    }

    timer.stop();
    clearTimeout(timeoutId);

    const timings = timer.toTimings();
    const outcome = doneReceived ? "OK" : chunkCount > 0 ? "FAIL" : "NO_FIRST_EVENT";
    const preview = tokenParts.join("");

    console.log(
      `[foundry-sdk-stream] Done. outcome=${outcome}  chunks=${chunkCount}  ` +
        `total=${timings.totalMs} ms`,
    );

    return {
      probe: "foundry-sdk-streaming",
      outcome,
      httpStatus: response.status,
      timings,
      chunkCount,
      doneReceived,
      tokenPreview: preview.slice(0, 200),
      payloadHash: pHash,
    };
  } catch (err: unknown) {
    timer.stop();
    clearTimeout(timeoutId);

    const msg = err instanceof Error ? err.message : String(err);

    let outcome: ProbeResult["outcome"] = "ERROR";
    if (msg.includes("TIMEOUT") || msg.includes("timeout")) outcome = "TIMEOUT";
    else if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) outcome = "FAIL";

    console.error(`[foundry-sdk-stream] ${outcome}: ${msg}`);

    return {
      probe: "foundry-sdk-streaming",
      outcome,
      timings: timer.toTimings(),
      error: msg,
      payloadHash: pHash,
    };
  }
}
