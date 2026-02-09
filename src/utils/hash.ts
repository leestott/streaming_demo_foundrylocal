/**
 * Hashing utility – used to log a safe hash of request payloads
 * instead of raw content (to avoid leaking secrets/PII).
 */

import { createHash } from "node:crypto";

/**
 * Returns the first 16 hex chars of the SHA-256 digest of `payload`.
 */
export function hashPayload(payload: unknown): string {
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}
