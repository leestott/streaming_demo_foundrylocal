/**
 * Lightweight timer for capturing probe timing metrics.
 */

import type { ProbeTimings } from "../types";

export class Timer {
  private readonly start: number;
  private end: number | undefined;
  private ttfb: number | undefined;
  private firstEvent: number | undefined;

  constructor() {
    this.start = Date.now();
  }

  /** Mark time-to-first-byte (response headers received) */
  markTTFB(): void {
    if (this.ttfb === undefined) {
      this.ttfb = Date.now() - this.start;
    }
  }

  /** Mark time-to-first-SSE-event */
  markFirstEvent(): void {
    if (this.firstEvent === undefined) {
      this.firstEvent = Date.now() - this.start;
    }
  }

  /** Finalize the timer */
  stop(): void {
    if (this.end === undefined) {
      this.end = Date.now();
    }
  }

  /** Return a ProbeTimings snapshot (stops timer if not yet stopped) */
  toTimings(): ProbeTimings {
    this.stop();
    return {
      startMs: this.start,
      endMs: this.end!,
      totalMs: this.end! - this.start,
      ttfbMs: this.ttfb,
      firstEventMs: this.firstEvent,
    };
  }
}
