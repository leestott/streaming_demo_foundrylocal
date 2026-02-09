/**
 * SDK wrapper for @prathikrao/foundry-local-sdk
 *
 * Handles the ESM ↔ CJS bridge (the SDK is ESM-only, this project is CJS)
 * and provides a typed, lazy-singleton façade over the SDK's FoundryLocalManager.
 *
 * Exported functions:
 *   - getManager()          – singleton FoundryLocalManager
 *   - getSDKBaseUrl()       – start service + get URL
 *   - detectServiceViaSDK() – lightweight service detection
 *   - getSDKModels()        – full model catalog via native FFI
 *   - resolveModel()        – map model ID/alias to SDK catalog entry
 *   - createSDKChatClient() – native FFI ChatClient (requires model loaded)
 *   - resetManager()        – clear singleton cache
 */

import type {
  FoundryLocalManager,
  FoundryLocalConfiguration,
  Model,
  ChatClient,
  ChatClientSettings,
} from "@prathikrao/foundry-local-sdk";

// ── ESM dynamic-import helper ────────────────────────────
// TypeScript with `module: "commonjs"` would transform `import()` into
// `require()`, which cannot load ESM packages.  The Function constructor
// creates a *native* dynamic `import()` that Node.js executes at runtime.
const nativeImport = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<typeof import("@prathikrao/foundry-local-sdk")>;

import { execSync } from "node:child_process";

let _sdk: typeof import("@prathikrao/foundry-local-sdk") | null = null;
let _manager: FoundryLocalManager | null = null;
let _detectedUrl: string | null = null;

/**
 * Lazily load the ESM SDK module.
 */
async function loadSDK(): Promise<typeof import("@prathikrao/foundry-local-sdk")> {
  if (!_sdk) {
    _sdk = await nativeImport("@prathikrao/foundry-local-sdk");
  }
  return _sdk;
}

/**
 * Detect if a Foundry service is already running via CLI.
 * Returns the base URL if found, null otherwise.
 */
function detectExistingServiceViaCLI(): string | null {
  try {
    const output = execSync("foundry service status", {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

    const urlMatch = output.match(/https?:\/\/[\w.\-]+:\d+/i);
    if (urlMatch) {
      return urlMatch[0];
    }
  } catch {
    // CLI not available or service not running
  }
  return null;
}

/**
 * Get (or create) the singleton FoundryLocalManager.
 * If a service is already running (detected via CLI), the SDK will connect to it.
 */
export async function getManager(
  config?: Partial<FoundryLocalConfiguration>,
): Promise<FoundryLocalManager> {
  if (_manager) return _manager;

  const sdk = await loadSDK();
  
  // Check if a service is already running via CLI
  const existingUrl = detectExistingServiceViaCLI();
  if (existingUrl) {
    console.log(`  ℹ  SDK: Connecting to existing service at ${existingUrl}`);
    _detectedUrl = existingUrl;
  }

  _manager = await sdk.FoundryLocalManager.create({
    appName: "foundry-local-streaming-validation",
    // If an existing service is running, provide its URL as serviceEndpoint
    ...(existingUrl ? { serviceEndpoint: existingUrl } : {}),
    ...config,
  });
  return _manager;
}

/**
 * Ensure the Foundry Local web service is running and return its base URL.
 * Attempts to start the service if not already running.
 *
 * @returns OpenAI-compatible base URL, e.g. "http://127.0.0.1:5272/v1"
 */
export async function getSDKBaseUrl(): Promise<string> {
  const manager = await getManager();

  // Try to pick up existing URLs first
  let urls = manager.urls;
  if (!urls || urls.length === 0) {
    // Start the service if needed
    await manager.startWebService();
    urls = manager.urls;
  }

  if (!urls || urls.length === 0) {
    throw new Error("SDK: No web-service URLs available after starting service.");
  }

  // The SDK returns full endpoint URLs (like http://127.0.0.1:5272)
  // Append /v1 for OpenAI-compatible requests
  let baseUrl = urls[0].replace(/\/+$/, "");
  if (!baseUrl.endsWith("/v1")) {
    baseUrl += "/v1";
  }
  return baseUrl;
}

/**
 * Detect service info via the SDK, starting the service if needed.
 * If a service is already running (CLI-managed), the SDK will connect to it.
 * Returns { running, urls, baseUrl } with the service URL.
 */
export async function detectServiceViaSDK(): Promise<{
  running: boolean;
  urls: string[];
  baseUrl?: string;
}> {
  try {
    const manager = await getManager();
    
    // Check if service is already running (either from SDK or pre-existing CLI service)
    let urls = manager.urls ?? [];
    
    // If no URLs from SDK, check if we detected an existing service
    if (urls.length === 0 && _detectedUrl) {
      urls = [_detectedUrl];
    }
    
    // If still no URLs, try to start the web service
    if (urls.length === 0) {
      console.log("  ℹ  SDK: Starting Foundry Local web service...");
      await manager.startWebService();
      urls = manager.urls ?? [];
    }
    
    const running = urls.length > 0;

    let baseUrl: string | undefined;
    if (running && urls[0]) {
      baseUrl = urls[0].replace(/\/+$/, "");
      if (!baseUrl.endsWith("/v1")) baseUrl += "/v1";
    }

    return { running, urls, baseUrl };
  } catch (err) {
    console.warn("[sdk] Failed to detect service via SDK:", err);
    return { running: false, urls: [] };
  }
}

/**
 * Fetch the model catalog via the SDK's native API.
 */
export async function getSDKModels(): Promise<Model[]> {
  const manager = await getManager();
  return manager.catalog.getModels();
}

/**
 * Fetch only cached (downloaded) models via the SDK's native API.
 * These are models that exist locally on the machine.
 */
export async function getSDKCachedModels(): Promise<Model[]> {
  const manager = await getManager();
  return manager.catalog.getCachedModels();
}

/**
 * Fetch only loaded models via the SDK's native API.
 * These are models currently loaded in memory and ready for inference.
 */
export async function getSDKLoadedModels(): Promise<Model[]> {
  const manager = await getManager();
  return manager.catalog.getLoadedModels();
}

/**
 * Resolve a model identifier (alias, variant ID, or HTTP model ID) to
 * SDK catalog metadata.  Returns `null` if not found.
 *
 * This is useful for the hybrid probes that use SDK for discovery +
 * HTTP for inference.
 */
export async function resolveModel(
  modelIdentifier: string,
): Promise<{ alias: string; resolvedId: string; variantCount: number } | null> {
  const manager = await getManager();

  // Strategy 1: Alias
  try {
    const model = await manager.catalog.getModel(modelIdentifier);
    if (model) {
      return {
        alias: model.alias,
        resolvedId: model.id,
        variantCount: model.variants.length,
      };
    }
  } catch { /* next */ }

  // Strategy 2: Exact variant ID
  try {
    const variant = await manager.catalog.getModelVariant(modelIdentifier);
    if (variant) {
      return { alias: variant.alias, resolvedId: variant.id, variantCount: 1 };
    }
  } catch { /* next */ }

  // Strategy 3: Normalize platform → generic
  const normalized = modelIdentifier.replace(
    /-(cuda|directml|vulkan|webgpu|npu|qnn|openvino)-/i,
    "-generic-",
  );
  if (normalized !== modelIdentifier) {
    try {
      const variant = await manager.catalog.getModelVariant(normalized);
      if (variant) {
        return { alias: variant.alias, resolvedId: variant.id, variantCount: 1 };
      }
    } catch { /* next */ }
  }

  // Strategy 4: Fuzzy via base name
  const models = await manager.catalog.getModels();
  const baseName = modelIdentifier.replace(/:\d+$/, "").toLowerCase();
  for (const m of models) {
    for (const v of m.variants) {
      const vBase = v.id.replace(/:\d+$/, "").toLowerCase();
      const vNorm = vBase.replace(/-(cuda|directml|vulkan|webgpu|npu|qnn|openvino|generic)-/i, "-");
      const iNorm = baseName.replace(/-(cuda|directml|vulkan|webgpu|npu|qnn|openvino|generic)-/i, "-");
      if (vNorm === iNorm) {
        return { alias: m.alias, resolvedId: v.id, variantCount: m.variants.length };
      }
    }
  }

  // Strategy 5: Prefix match on alias
  const idLower = modelIdentifier.toLowerCase();
  for (const m of models) {
    if (idLower.startsWith(m.alias.toLowerCase())) {
      return { alias: m.alias, resolvedId: m.id, variantCount: m.variants.length };
    }
  }

  return null;
}

/**
 * Helper: ensure a variant is loaded, then create a ChatClient from it.
 */
async function ensureLoadedAndCreateClient(
  variant: import("@prathikrao/foundry-local-sdk").ModelVariant,
  settings?: ChatClientSettings,
): Promise<ChatClient> {
  const loaded = await variant.isLoaded();
  if (!loaded) {
    console.log(`[sdk] Loading variant "${variant.id}" …`);
    await variant.load();
    console.log(`[sdk] Variant "${variant.id}" loaded.`);
  }
  const client = variant.createChatClient();
  if (settings) Object.assign(client.settings, settings);
  return client;
}

/**
 * Create a ChatClient for the given model via the SDK.
 *
 * The SDK's ChatClient uses native FFI (coreInterop), NOT HTTP, so it
 * must be created via Model.createChatClient() / ModelVariant.createChatClient().
 *
 * The identifier coming from the HTTP endpoint (e.g. "Phi-4-mini-instruct-cuda-gpu:5")
 * differs from the SDK's generic IDs ("Phi-4-mini-instruct-generic-gpu:5").
 * We attempt multiple lookup strategies to bridge this gap.
 *
 * Strategy order:
 *   1. catalog.getModel(alias) – works when identifier is an alias like "phi-4-mini"
 *   2. catalog.getModelVariant(id) – works when ID matches exactly
 *   3. Normalize ID (replace platform-specific segment with "generic") and retry
 *   4. Fuzzy search across all catalog models / variants
 *
 * @param modelIdentifier  Model alias, variant ID, or HTTP model ID
 * @param settings         Optional chat client settings (applied after creation)
 */
export async function createSDKChatClient(
  modelIdentifier: string,
  settings?: ChatClientSettings,
): Promise<ChatClient> {
  const manager = await getManager();

  // Strategy 1: Try as model alias (e.g. "phi-4-mini")
  try {
    const model = await manager.catalog.getModel(modelIdentifier);
    if (model) {
      return await ensureLoadedAndCreateClient(model.selectedVariant, settings);
    }
  } catch {
    // Not found as alias – try next
  }

  // Strategy 2: Try as exact variant ID
  try {
    const variant = await manager.catalog.getModelVariant(modelIdentifier);
    if (variant) {
      return await ensureLoadedAndCreateClient(variant, settings);
    }
  } catch {
    // Not found – try next
  }

  // Strategy 3: Normalize platform-specific ID to generic
  // e.g. "Phi-4-mini-instruct-cuda-gpu:5" → "Phi-4-mini-instruct-generic-gpu:5"
  const normalized = modelIdentifier.replace(
    /-(cuda|directml|vulkan|webgpu|npu|qnn|openvino)-/i,
    "-generic-",
  );
  if (normalized !== modelIdentifier) {
    try {
      const variant = await manager.catalog.getModelVariant(normalized);
      if (variant) {
        console.log(`[sdk] Normalized ID "${modelIdentifier}" → "${normalized}"`);
        return await ensureLoadedAndCreateClient(variant, settings);
      }
    } catch {
      // Not found – try next
    }
  }

  // Strategy 4: Fuzzy search – scan all models for best match
  const models = await manager.catalog.getModels();
  const idLower = modelIdentifier.toLowerCase();

  // Try to find a variant whose id starts with the same base (before the colon)
  const baseName = modelIdentifier.replace(/:\d+$/, "").toLowerCase();
  for (const m of models) {
    for (const v of m.variants) {
      const vBase = v.id.replace(/:\d+$/, "").toLowerCase();
      // Match if the base names are equivalent modulo the platform segment
      const vNorm = vBase.replace(/-(cuda|directml|vulkan|webgpu|npu|qnn|openvino|generic)-/i, "-");
      const iNorm = baseName.replace(/-(cuda|directml|vulkan|webgpu|npu|qnn|openvino|generic)-/i, "-");
      if (vNorm === iNorm) {
        console.log(`[sdk] Fuzzy matched "${modelIdentifier}" → variant "${v.id}"`);
        return await ensureLoadedAndCreateClient(v, settings);
      }
    }
  }

  // Last resort: try the model alias derived by lowercasing and simplifying
  // e.g. "Phi-4-mini-instruct-cuda-gpu:5" → check aliases for "phi-4-mini"
  for (const m of models) {
    if (idLower.startsWith(m.alias.toLowerCase())) {
      console.log(`[sdk] Prefix-matched alias "${m.alias}" for "${modelIdentifier}"`);
      return await ensureLoadedAndCreateClient(m.selectedVariant, settings);
    }
  }

  throw new Error(
    `SDK: Model "${modelIdentifier}" not found in catalog via alias, variant ID, or fuzzy match.`,
  );
}

/**
 * Reset the cached manager – useful when the service restarts on a new port.
 */
export function resetManager(): void {
  _manager = null;
}
