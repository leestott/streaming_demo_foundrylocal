/**
 * Minimal SSE (Server-Sent Events) parser for ReadableStream<Uint8Array>.
 * No external SSE libraries used – hand-rolled per spec requirements.
 */

export interface SSEEvent {
  /** Raw data payload (text after "data: ") */
  data: string;
  /** Epoch ms when this event was yielded */
  timestamp: number;
}

/**
 * Async generator that reads a ReadableStream and yields SSE events.
 * Respects an optional AbortSignal; throws on abort.
 */
export async function* parseSSE(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("SSE parsing aborted", "AbortError");
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are delimited by blank lines (\n\n).
      // Split on that boundary; the last element is the incomplete tail.
      const segments = buffer.split(/\n\n/);
      buffer = segments.pop() ?? "";

      for (const segment of segments) {
        const trimmed = segment.trim();
        if (!trimmed) continue;

        const lines = trimmed.split(/\n/);
        for (const line of lines) {
          if (line.startsWith("data:")) {
            // "data: payload" or "data:payload" are both valid
            const payload = line.slice(5).trimStart();
            yield { data: payload, timestamp: Date.now() };
          }
          // Ignore comment lines (":"), event:, id:, retry: per SSE spec
        }
      }
    }

    // Flush any remaining buffer content
    if (buffer.trim()) {
      const lines = buffer.trim().split(/\n/);
      for (const line of lines) {
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trimStart();
          yield { data: payload, timestamp: Date.now() };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
