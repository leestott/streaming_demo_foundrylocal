/**
 * Benchmark types – result shapes for the multi-model streaming benchmark.
 */

import type { ProbeOutcome, ProbeTimings } from "../types";

/** Result of testing one model with one mode (streaming or non-streaming) */
export interface ModelTestResult {
  model: string;
  mode: "streaming" | "non-streaming";
  outcome: ProbeOutcome;
  httpStatus?: number;
  timings: ProbeTimings;
  chunkCount?: number;
  doneReceived?: boolean;
  tokenPreview?: string;
  error?: string;
}

/** Aggregated benchmark result for a single model */
export interface ModelBenchmarkEntry {
  model: string;
  nonStreaming: ModelTestResult;
  streaming: ModelTestResult;
  supportsStreaming: boolean;
  verdict: "BOTH_OK" | "STREAM_ONLY_FAIL" | "BOTH_FAIL" | "NON_STREAM_FAIL";
}

/** The full benchmark report */
export interface BenchmarkReport {
  timestamp: string;
  foundryBaseUrl: string;
  totalModels: number;
  modelsWithStreaming: number;
  modelsWithoutStreaming: number;
  entries: ModelBenchmarkEntry[];
}
