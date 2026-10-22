/** Real bundled Worker via Node worker_threads. Measures UI-side blocking, not Canvas FPS. */
import { Worker as NodeWorker } from 'node:worker_threads';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpus } from 'node:os';
import { WorkerSimulationSession, type SimulationWorkerPort } from '../src/runtime/worker-session';
import { createSimulationRuntime } from '../src/sim/engine/create-runtime';
import { scenarioToDocument, solarSystemFull } from '../src/sim/scenarios';
import { PhysicsTrailSampler } from '../src/sim/worker/trail-sampler';
import type { WorkerRequest, WorkerResponse } from '../src/sim/worker/protocol';

const filename = (await readdir('dist/assets')).find((name) => /^simulation\.worker-.*\.js$/.test(name));
if (!filename) throw new Error('Run npm run build first');
const workerUrl = pathToFileURL(resolve('dist/assets', filename)).href;

class NodePort implements SimulationWorkerPort {
  onmessage: SimulationWorkerPort['onmessage'] = null;
  onerror: SimulationWorkerPort['onerror'] = null;
  onmessageerror: SimulationWorkerPort['onmessageerror'] = null;
  private thread = new NodeWorker(`
    const { parentPort, workerData } = require('node:worker_threads');
    globalThis.self = { onmessage: null, postMessage: (data, transfer) => parentPort.postMessage(data, transfer) };
    import(workerData).then(() => parentPort.on('message', data => self.onmessage({ data })));
  `, { eval: true, workerData: workerUrl });
  constructor() {
    this.thread.on('message', (data: WorkerResponse) => this.onmessage?.({ data } as MessageEvent<WorkerResponse>));
    this.thread.on('error', () => this.onerror?.({} as ErrorEvent));
    this.thread.on('messageerror', () => this.onmessageerror?.({} as MessageEvent));
  }
  postMessage(request: WorkerRequest) { this.thread.postMessage(request); }
  terminate() { void this.thread.terminate(); }
}

function percentile(values: number[], p: number): number {
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]!;
}

console.log(`Real Worker bundle | Node ${process.version} | ${process.platform} ${process.arch} | ${cpus()[0]?.model}`);
console.log('114 bodies, dt=120s, requested 1y/s, budget=12ms, runs=3, warmup=5, samples=40/run. No Canvas/React.');
const rows = [];
for (const mode of ['main', 'worker'] as const) {
  const medians: number[] = [];
  const tails: number[] = [];
  const roundtrips: number[] = [];
  for (let run = 0; run < 3; run++) {
    const document = scenarioToDocument(solarSystemFull);
    document.config.simulationTimeScale = 31_557_600;
    const engine = mode === 'main' ? createSimulationRuntime({ document }) : new WorkerSimulationSession(document, 0, () => new NodePort());
    const blocking: number[] = [];
    const elapsed: number[] = [];
    try {
      if (engine instanceof WorkerSimulationSession) await engine.pause();
      for (let i = 0; i < 45; i++) {
        const start = performance.now();
        const now = 1000 + i * 1000 / 60;
        if (engine instanceof WorkerSimulationSession) {
          engine.runFrame(now);
          engine.getRenderSnapshot(performance.now());
          engine.drainTrails();
          if (i >= 5) blocking.push(performance.now() - start);
          await engine.pause(); // barrier: frame finished; no overlapping or queued frames
        } else {
          const samples = new PhysicsTrailSampler();
          const state = engine.runFrame(now, { onStep: samples.observe });
          samples.finish(state);
          if (i >= 5) blocking.push(performance.now() - start);
        }
        if (i >= 5) elapsed.push(performance.now() - start);
        if (!Number.isFinite(engine.getSnapshot().diagnostics.totalEnergy)) throw new Error('Nonfinite energy');
        await new Promise<void>((done) => setImmediate(done));
      }
      medians.push(percentile(blocking, 0.5));
      tails.push(percentile(blocking, 0.95));
      roundtrips.push(percentile(elapsed, 0.5));
    } finally { if (engine instanceof WorkerSimulationSession) engine.dispose(); }
  }
  rows.push({
    mode,
    uiBlockingMedianMs: Number(percentile(medians, 0.5).toFixed(3)),
    uiBlockingP95Ms: Number(percentile(tails, 0.5).toFixed(3)),
    completedFrameMedianMs: Number(percentile(roundtrips, 0.5).toFixed(3)),
  });
}
console.table(rows);
console.log('Worker leaves physics work on another thread. A shorter UI call is not a claim of faster physical integration or browser FPS.');
