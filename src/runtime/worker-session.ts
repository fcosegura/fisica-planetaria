import { createSimulationRuntime } from '../sim/engine/create-runtime';
import type { FrameSnapshotOptions } from '../sim/engine/runtime';
import type { SimulationDocument, SimConfig, SimSnapshot, CollisionMode } from '../sim/types';
import { interpolateSnapshot } from '../render/interpolate-snapshot';
import { unpackSnapshot, type WorkerCommand, type WorkerRequest, type WorkerResponse, type TrailSamples } from '../sim/worker/protocol';

export interface SimulationWorkerPort {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: WorkerRequest): void;
  terminate(): void;
}

export function cancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Asynchronous UI session, deliberately not a synchronous SimulationRuntime.
 * Getters return the last confirmed state; step/pause are acknowledged barriers.
 * Only initialization/edit validation uses a local runtime, never frame integration.
 */
export class WorkerSimulationSession {
  readonly executionMode = 'worker';
  private worker: SimulationWorkerPort;
  private snapshot: SimSnapshot;
  private published: SimSnapshot;
  private previous: SimSnapshot;
  private config: SimConfig;
  private generation = 0;
  private nextId = 0;
  private frameBusy = false;
  private disposed = false;
  private failed = false;
  private failureMessage: string | null = null;
  private receivedMs = 0;
  private intervalMs = 16.67;
  private trails: TrailSamples[] = [];
  private pending = new Map<number, {
    resolve: (snapshot: SimSnapshot) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  onFailure: ((message: string) => void) | null = null;

  constructor(document: SimulationDocument, initialTime = 0, factory: () => SimulationWorkerPort = () =>
    new Worker(new URL('../sim/worker/simulation.worker.ts', import.meta.url), { type: 'module' })) {
    const initial = createSimulationRuntime({ document, initialTime });
    this.snapshot = initial.getSnapshot();
    this.published = this.snapshot;
    this.previous = this.snapshot;
    this.config = initial.getConfig();
    this.worker = factory();
    this.worker.onmessage = ({ data }) => this.receive(data);
    this.worker.onerror = () => this.fail('El Worker no pudo ejecutar la simulación. Puedes usar Hilo principal.');
    this.worker.onmessageerror = () => this.fail('No se pudo recibir el estado del Worker.');
    void this.request({ type: 'init', document, initialTime }).catch(() => {});
  }

  getEngineKind() { return this.config.engineKind; }
  getCompatibility() { return this.snapshot.engineCompatibility; }
  getConfig() { return { ...this.config }; }
  getError() { return this.failureMessage; }
  getSnapshot(): SimSnapshot { return this.snapshot; }
  getPublishedSnapshot(): SimSnapshot { return this.published; }
  getBodies() {
    return this.snapshot.bodies.map((body) => ({
      ...body, position: { ...body.position }, velocity: { ...body.velocity }, visual: { ...body.visual },
    }));
  }

  reset(document: SimulationDocument, initialTime = 0): void {
    const local = createSimulationRuntime({ document, initialTime });
    this.generation++;
    this.abortPending();
    this.frameBusy = false;
    this.snapshot = local.getSnapshot();
    this.published = this.snapshot;
    this.previous = this.snapshot;
    this.config = local.getConfig();
    this.trails = [];
    void this.request({ type: 'init', document, initialTime }).catch(() => {});
  }

  setTimeScale(scale: number): void {
    this.config = { ...this.config, simulationTimeScale: scale };
    this.snapshot = this.withRequestedScale(this.snapshot);
    this.published = this.withRequestedScale(this.published);
    void this.request({ type: 'scale', scale }).catch(() => {});
  }

  setCollisionMode(mode: CollisionMode): void {
    this.config = { ...this.config, collisionMode: mode };
    void this.request({ type: 'collision', mode }).catch(() => {});
  }

  stepOnce(): Promise<SimSnapshot> { return this.request({ type: 'step' }); }
  pause(): Promise<SimSnapshot> { return this.request({ type: 'snapshot' }); }

  runFrame(nowMs = performance.now(), _options?: FrameSnapshotOptions): SimSnapshot {
    if (!this.frameBusy && !this.failed && !this.disposed) {
      this.frameBusy = true;
      const generation = this.generation;
      void this.request({ type: 'frame', nowMs }).finally(() => {
        if (generation === this.generation) this.frameBusy = false;
      }).catch(() => {});
    }
    return this.snapshot;
  }

  getRenderSnapshot(nowMs: number): SimSnapshot {
    return interpolateSnapshot(this.previous, this.snapshot, (nowMs - this.receivedMs) / this.intervalMs);
  }

  drainTrails(): TrailSamples[] {
    const result = this.trails;
    this.trails = [];
    return result;
  }

  dispose(): void {
    this.disposed = true;
    this.abortPending();
    this.worker.terminate();
  }

  private request(command: WorkerCommand): Promise<SimSnapshot> {
    if (this.disposed || this.failed) return Promise.reject(new Error('Worker detenido'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail('El Worker no responde. Puedes usar Hilo principal.'), 5000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.worker.postMessage({ id, generation: this.generation, command }); }
      catch { this.fail('No se pudo enviar el estado al Worker.'); }
    });
  }

  private receive(response: WorkerResponse): void {
    if (response.generation !== this.generation || this.disposed || this.failed) return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    if (response.type === 'error') { this.fail(response.message); return; }
    try {
      const next = unpackSnapshot(response.packed, this.snapshot);
      const now = performance.now();
      this.intervalMs = Math.max(8, Math.min(100, now - this.receivedMs));
      this.receivedMs = now;
      this.previous = this.snapshot;
      this.snapshot = this.withRequestedScale(next);
      if (response.packed.diagnosticsFresh) this.published = this.snapshot;
      if (response.packed.trails) {
        this.trails.push(response.packed.trails);
        if (this.trails.length > 2) { this.trails.shift(); this.trails[0]!.truncated = true; }
      }
      clearTimeout(pending.timer);
      this.pending.delete(response.id);
      pending.resolve(this.snapshot);
    } catch (error) { this.fail(error instanceof Error ? error.message : String(error)); }
  }

  private abortPending(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      const error = new Error('Simulación reemplazada');
      error.name = 'AbortError';
      pending.reject(error);
    }
    this.pending.clear();
  }

  private withRequestedScale(snapshot: SimSnapshot): SimSnapshot {
    const scale = this.config.simulationTimeScale;
    if (snapshot.timeScale.requestedTimeScale === scale) return snapshot;
    const status = snapshot.timeScale;
    const isCapped = status.effectiveTimeScale > 0 ? status.effectiveTimeScale < scale * 0.99 : status.isCapped;
    return {
      ...snapshot,
      timeScale: { ...status, requestedTimeScale: scale, isCapped, capReason: isCapped ? status.capReason ?? 'budget' : null },
    };
  }

  private fail(message: string): void {
    this.failed = true;
    this.failureMessage = message;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pending.clear();
    this.worker.terminate();
    this.onFailure?.(message);
  }
}
