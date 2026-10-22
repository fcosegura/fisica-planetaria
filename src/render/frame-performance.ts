/** Render cadence only, not solver throughput; long background gaps reset the window. */
export class FramePerformance {
  private previous: number | undefined;
  private samples: number[] = [];
  private workSamples: number[] = [];
  private lastReport = -Infinity;

  reset(): void {
    this.previous = undefined;
    this.samples = [];
    this.workSamples = [];
    this.lastReport = -Infinity;
  }

  completeFrame(workMs: number): void {
    this.workSamples.push(workMs);
    if (this.workSamples.length > 120) this.workSamples.shift();
  }

  record(nowMs: number): { fps: number; p95FrameMs: number; p95WorkMs: number } | undefined {
    const elapsed = this.previous === undefined ? 0 : nowMs - this.previous;
    this.previous = nowMs;
    if (elapsed > 250 || elapsed < 0) { this.samples = []; this.workSamples = []; return; }
    if (elapsed > 0) this.samples.push(elapsed);
    if (this.samples.length > 120) this.samples.shift();
    if (this.samples.length < 20 || nowMs - this.lastReport < 1000) return;
    this.lastReport = nowMs;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const work = [...this.workSamples].sort((a, b) => a - b);
    return {
      fps: 1000 * this.samples.length / this.samples.reduce((sum, value) => sum + value, 0),
      p95FrameMs: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
      p95WorkMs: work[Math.ceil(work.length * 0.95) - 1] ?? 0,
    };
  }
}
