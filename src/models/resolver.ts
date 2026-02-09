/**
 * Model alias resolution – maps user-friendly aliases (e.g. "phi-4-mini")
 * to the full variant IDs required by the HTTP API (e.g. "Phi-4-mini-instruct-cuda-gpu:5").
 *
 * The Foundry Local HTTP /v1/chat/completions endpoint only accepts
 * full variant IDs as listed by /v1/models. This utility bridges the gap
 * when users provide catalog aliases.
 */

import type { FoundryModel } from "./catalog";

/**
 * Resolve a model identifier to the best matching model ID from the catalog.
 *
 * Strategies (in order):
 *   1. Exact match on model ID
 *   2. Case-insensitive match on model ID
 *   3. Alias prefix match (e.g. "phi-4-mini" matches "Phi-4-mini-instruct-cuda-gpu:5")
 *   4. Return the original identifier (let the server reject it if invalid)
 */
export function resolveModelId(
  modelIdentifier: string,
  models: FoundryModel[],
): { resolvedId: string; wasResolved: boolean } {
  if (!models.length || !modelIdentifier) {
    return { resolvedId: modelIdentifier, wasResolved: false };
  }

  // Strategy 1: Exact match
  const exact = models.find((m) => m.id === modelIdentifier);
  if (exact) return { resolvedId: exact.id, wasResolved: false };

  // Strategy 2: Case-insensitive match
  const ciMatch = models.find(
    (m) => m.id.toLowerCase() === modelIdentifier.toLowerCase(),
  );
  if (ciMatch) return { resolvedId: ciMatch.id, wasResolved: true };

  // Strategy 3: SDK alias match (if models were fetched via SDK)
  const aliasMatch = models.find(
    (m) => m.sdkAlias?.toLowerCase() === modelIdentifier.toLowerCase(),
  );
  if (aliasMatch) return { resolvedId: aliasMatch.id, wasResolved: true };

  // Strategy 4: Alias prefix match – the alias is typically a prefix of the
  // variant ID after lowercasing and removing the instruct/cuda/etc. parts.
  // e.g. "phi-4-mini" should match "Phi-4-mini-instruct-cuda-gpu:5"
  const idLower = modelIdentifier.toLowerCase().replace(/[_\s]/g, "-");
  const prefixMatches = models.filter((m) => {
    const mLower = m.id.toLowerCase().replace(/[_\s]/g, "-");
    return mLower.startsWith(idLower + "-") || mLower.startsWith(idLower + ":");
  });

  if (prefixMatches.length > 0) {
    // Prefer GPU variants over CPU variants
    const gpuMatch = prefixMatches.find((m) =>
      m.id.toLowerCase().includes("gpu"),
    );
    return {
      resolvedId: gpuMatch?.id ?? prefixMatches[0].id,
      wasResolved: true,
    };
  }

  // Strategy 5: Fuzzy – check if any model contains the alias as a substring
  const containsMatch = models.find((m) =>
    m.id.toLowerCase().includes(idLower),
  );
  if (containsMatch) {
    return { resolvedId: containsMatch.id, wasResolved: true };
  }

  // No match found – return original and let the server deal with it
  return { resolvedId: modelIdentifier, wasResolved: false };
}
