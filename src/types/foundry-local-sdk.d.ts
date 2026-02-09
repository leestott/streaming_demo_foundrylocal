/**
 * Ambient type declarations for @prathikrao/foundry-local-sdk
 *
 * The SDK ships as ESM-only JavaScript with no .d.ts files.
 * These declarations cover the public API surface we use.
 */

declare module "@prathikrao/foundry-local-sdk" {
  // ── Configuration ───────────────────────────────────────
  export interface FoundryLocalConfiguration {
    /** Required: application name used for logging / telemetry. */
    appName: string;
    /** Optional: directory for app-specific data. */
    appDataDir?: string;
    /** Optional: directory to cache model files. */
    modelCacheDir?: string;
    /** Optional: directory for log files. */
    logsDir?: string;
    /** Optional: log level string. */
    logLevel?: string;
    /** Optional: explicit web-service URLs. */
    webServiceUrls?: string[];
    /** Optional: explicit service endpoint URL. */
    serviceEndpoint?: string;
    /** Optional: path to the native library. */
    libraryPath?: string;
    /** Optional: additional key-value settings. */
    additionalSettings?: Record<string, string>;
  }

  // ── DeviceType enum ─────────────────────────────────────
  export enum DeviceType {
    Invalid = 0,
    CPU = 1,
    GPU = 2,
    NPU = 3,
  }

  // ── ChatClient ──────────────────────────────────────────

  export interface ChatMessage {
    role: string;
    content: string;
  }

  export interface ChatClientSettings {
    /** Maximum tokens to generate. */
    maxTokens?: number;
    /** Temperature for sampling. */
    temperature?: number;
    /** Top-p (nucleus) sampling. */
    topP?: number;
    /** Stop sequences. */
    stop?: string[];
    /** Frequency penalty. */
    frequencyPenalty?: number;
    /** Presence penalty. */
    presencePenalty?: number;
  }

  export interface ChatCompletionChoice {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }

  export interface ChatCompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: ChatCompletionChoice[];
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  }

  export interface StreamingChunk {
    id?: string;
    object?: string;
    created?: number;
    model?: string;
    choices?: Array<{
      index: number;
      delta: {
        role?: string;
        content?: string;
      };
      finish_reason?: string | null;
    }>;
  }

  export class ChatClient {
    readonly modelId: string;
    /** Chat completion settings (maxTokens, temperature, etc.). */
    settings: ChatClientSettings;

    /**
     * @internal – use Model.createChatClient() or ModelVariant.createChatClient() instead.
     * The second argument is the native coreInterop handle.
     */
    constructor(modelId: string, coreInterop: unknown);

    /**
     * Send a non-streaming chat completion request.
     * @returns Parsed completion response.
     */
    completeChat(messages: ChatMessage[]): Promise<ChatCompletionResponse>;

    /**
     * Send a streaming chat completion request.
     * The callback is invoked with each SSE chunk.
     * @returns The full concatenated response text.
     */
    completeStreamingChat(
      messages: ChatMessage[],
      callback: (chunk: StreamingChunk) => void,
    ): Promise<string>;
  }

  // ── ModelVariant ────────────────────────────────────────

  export interface ModelInfo {
    uri?: string;
    providerType?: string;
    [key: string]: unknown;
  }

  export class ModelVariant {
    readonly id: string;
    readonly alias: string;
    readonly modelInfo: ModelInfo;
    readonly isCached: boolean;

    isLoaded(): Promise<boolean>;
    load(device?: DeviceType): Promise<void>;
    unload(): Promise<void>;
    download(): Promise<void>;
    createChatClient(): ChatClient;
  }

  // ── Model ───────────────────────────────────────────────

  export class Model {
    readonly alias: string;
    readonly id: string;
    readonly selectedVariant: ModelVariant;
    readonly variants: ModelVariant[];
    readonly isCached: boolean;

    isLoaded(): Promise<boolean>;
    load(): Promise<void>;
    unload(): Promise<void>;
    selectVariant(modelId: string): void;
    createChatClient(): ChatClient;
    createAudioClient(settings?: Record<string, unknown>): unknown;
  }

  // ── Catalog ─────────────────────────────────────────────

  export class Catalog {
    /** List all models known to the service. */
    getModels(): Promise<Model[]>;
    /** Get a model by its alias. */
    getModel(alias: string): Promise<Model>;
    /** Get a specific model variant by full model ID. */
    getModelVariant(modelId: string): Promise<ModelVariant>;
    /** List only cached (downloaded) models. */
    getCachedModels(): Promise<Model[]>;
    /** List only currently loaded models. */
    getLoadedModels(): Promise<Model[]>;
  }

  // ── FoundryLocalManager ─────────────────────────────────

  export class FoundryLocalManager {
    /** The model catalog. */
    readonly catalog: Catalog;
    /** Web-service URL(s) the manager detected or started. */
    readonly urls: string[];

    /**
     * Create and initialise a FoundryLocalManager.
     * This is the primary entry point for the SDK.
     */
    static create(config: FoundryLocalConfiguration): Promise<FoundryLocalManager>;

    /** Start the Foundry Local web service (native). */
    startWebService(): Promise<void>;
    /** Stop the Foundry Local web service (native). */
    stopWebService(): Promise<void>;
  }
}
