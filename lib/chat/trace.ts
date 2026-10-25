/** Records real processing steps with timestamps and durations for the request log and progress stream. */

export interface TraceStep {
  name: string;
  at: string;
  durationMs: number | null;
  status: "ok" | "error" | "info";
  detail?: string;
}

export class Trace {
  readonly steps: TraceStep[] = [];
  readonly toolDurations: Record<string, number> = {};
  readonly cache: { hits: number; misses: number } = { hits: 0, misses: 0 };
  readonly startedAt = Date.now();
  model: string | null = null;
  tokens = { prompt: 0, output: 0, total: 0 };
  validation: "PASSED" | "PASSED_AFTER_RETRY" | "FALLBACK" | "NOT_RUN" = "NOT_RUN";

  constructor(public onStep?: (step: TraceStep) => void) {}

  mark(name: string, detail?: string, status: TraceStep["status"] = "info") {
    this.push({ name, at: new Date().toISOString(), durationMs: null, status, detail });
  }

  async step<T>(name: string, fn: () => Promise<T>, toolKey?: string): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.finish(name, start, "ok", toolKey);
      return result;
    } catch (error) {
      this.finish(name, start, "error", toolKey);
      throw error;
    }
  }

  elapsedMs() {
    return Date.now() - this.startedAt;
  }

  private finish(name: string, start: number, status: TraceStep["status"], toolKey?: string) {
    const durationMs = Date.now() - start;
    if (toolKey) this.toolDurations[toolKey] = (this.toolDurations[toolKey] ?? 0) + durationMs;
    this.push({ name, at: new Date(start).toISOString(), durationMs, status });
  }

  private push(step: TraceStep) {
    this.steps.push(step);
    this.onStep?.(step);
  }
}
