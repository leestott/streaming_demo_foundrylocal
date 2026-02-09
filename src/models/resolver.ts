/**
 * Model alias resolver - maps short model names to full variant IDs.
 * Queries the Foundry Local /v1/models endpoint to find matching models.
 */

interface ModelEntry {
  id: string;
  owned_by?: string;
}

/**
 * Resolves a model alias (e.g., "phi-4-mini") to a full variant ID
 * (e.g., "Phi-4-mini-instruct-cuda-gpu:5") by querying available models.
 *
 * Resolution strategy:
 * 1. If the model ID exactly matches an available model, return as-is
 * 2. If the model alias is contained in an available model ID (case-insensitive), return that
 * 3. Otherwise return the original (will likely fail at API call time)
 */
export async function resolveModelId(
  baseUrl: string,
  modelAlias: string,
  apiKey?: string,
  timeoutMs: number = 10000
): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    // Handle base URL that may or may not include /v1
    let modelsUrl = baseUrl;
    if (modelsUrl.endsWith("/v1")) {
      modelsUrl = modelsUrl + "/models";
    } else if (modelsUrl.endsWith("/v1/")) {
      modelsUrl = modelsUrl + "models";
    } else {
      modelsUrl = modelsUrl.replace(/\/$/, "") + "/v1/models";
    }

    const response = await fetch(modelsUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`  ⚠  Could not fetch models for resolution (HTTP ${response.status}), using alias as-is`);
      return modelAlias;
    }

    const data = await response.json() as { data?: ModelEntry[] };
    const models = data.data || [];

    if (models.length === 0) {
      return modelAlias;
    }

    // Check for exact match first
    const exactMatch = models.find((m) => m.id === modelAlias);
    if (exactMatch) {
      return exactMatch.id;
    }

    // Check for case-insensitive partial match
    const aliasLower = modelAlias.toLowerCase();
    const partialMatch = models.find((m) => 
      m.id.toLowerCase().includes(aliasLower)
    );

    if (partialMatch) {
      console.log(`  ℹ  Resolved model alias "${modelAlias}" → "${partialMatch.id}"`);
      return partialMatch.id;
    }

    // No match found, return original
    console.warn(`  ⚠  No model matching alias "${modelAlias}" found, using as-is`);
    return modelAlias;
  } catch (err) {
    console.warn(`  ⚠  Error resolving model alias: ${err instanceof Error ? err.message : err}`);
    return modelAlias;
  }
}
