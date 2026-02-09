/**
 * Foundry Local model catalog – fetches available models from /v1/models
 * and provides an interactive terminal picker.
 *
 * Two strategies:
 *   1. **SDK-based** – uses FoundryLocalManager.catalog.getModels()
 *   2. **HTTP-based** (fallback) – raw fetch to /v1/models
 */

export interface FoundryModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
  /** Present when the model was fetched via SDK */
  sdkAlias?: string;
  /** Whether the model is cached (downloaded) locally */
  isCached?: boolean;
}

interface ModelsListResponse {
  object: string;
  data: FoundryModel[];
}

/**
 * Fetch the list of available models from the Foundry Local /v1/models endpoint.
 */
export async function fetchModelCatalog(
  baseUrl: string,
  apiKey: string,
  timeoutMs: number = 10_000,
): Promise<FoundryModel[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("CATALOG_TIMEOUT"), timeoutMs);

  const url = `${baseUrl}/models`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GET ${url} returned ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as ModelsListResponse;

    if (!json.data || !Array.isArray(json.data)) {
      throw new Error("Unexpected response shape – missing data[] array");
    }

    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Format the model list into a numbered table for display.
 */
export function formatModelTable(models: FoundryModel[]): string {
  const lines: string[] = [];
  const pad = (s: string, n: number) => s.padEnd(n);

  lines.push("");
  lines.push("  #   Model ID                          Owner");
  lines.push("  " + "─".repeat(60));

  models.forEach((m, i) => {
    const num = String(i + 1).padStart(3);
    const id = pad(m.id, 34);
    const owner = m.owned_by ?? "unknown";
    lines.push(`  ${num}  ${id}${owner}`);
  });

  lines.push("");
  return lines.join("\n");
}

// ── SDK-based catalog ────────────────────────────────────

/**
 * Fetch the model catalog via the Foundry Local SDK.
 * Maps the SDK's Model objects to the common FoundryModel interface.
 */
export async function fetchModelCatalogSDK(): Promise<FoundryModel[]> {
  try {
    const { getSDKModels } = await import("../sdk/foundry-local");
    const sdkModels = await getSDKModels();

    return sdkModels.map((m) => ({
      id: m.id ?? m.alias,
      object: "model",
      owned_by: "foundry-local",
      sdkAlias: m.alias,
      isCached: m.isCached,
    }));
  } catch (err) {
    console.warn(
      `[catalog] SDK catalog failed, reason: ${err instanceof Error ? err.message : err}`,
    );
    throw err;
  }
}

/**
 * Fetch only cached (downloaded) models via the Foundry Local SDK.
 * These are models that exist locally on the machine.
 */
export async function fetchCachedModelCatalogSDK(): Promise<FoundryModel[]> {
  try {
    const { getSDKCachedModels } = await import("../sdk/foundry-local");
    const sdkModels = await getSDKCachedModels();

    return sdkModels.map((m) => ({
      id: m.id ?? m.alias,
      object: "model",
      owned_by: "foundry-local",
      sdkAlias: m.alias,
      isCached: true,
    }));
  } catch (err) {
    console.warn(
      `[catalog] SDK cached catalog failed, reason: ${err instanceof Error ? err.message : err}`,
    );
    throw err;
  }
}

/**
 * Auto-fetch catalog – uses HTTP /v1/models endpoint to get loaded models.
 * The HTTP endpoint returns only models that are loaded and ready for inference.
 * 
 * Note: The SDK's getCachedModels() doesn't reliably detect CLI-cached models,
 * so we prefer the HTTP endpoint which shows actually available models.
 */
export async function autoFetchModelCatalog(
  baseUrl: string,
  apiKey: string,
  timeoutMs: number = 10_000,
): Promise<FoundryModel[]> {
  console.log("  ℹ  Fetching loaded models via HTTP /v1/models");
  return fetchModelCatalog(baseUrl, apiKey, timeoutMs);
}
