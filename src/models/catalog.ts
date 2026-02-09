/**
 * Foundry Local model catalog – fetches available models from /v1/models
 * and provides an interactive terminal picker.
 */

export interface FoundryModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
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
