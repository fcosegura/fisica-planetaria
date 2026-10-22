import { createSimulationRuntime } from '../engine/create-runtime';
import type { SimulationRuntime } from '../engine/runtime';
import type { ConservationMetrics } from '../types';
import { packSnapshot, type WorkerRequest, type WorkerResponse } from './protocol';
import { PhysicsTrailSampler } from './trail-sampler';

/** Pure message handler shared by the real browser Worker and headless tests. */
export class SimulationWorkerRunner {
  private engine: SimulationRuntime | null = null;
  private generation = -1;
  private bodyCount = -1;
  private diagnostics: ConservationMetrics | undefined;
  private lastDiagnosticsMs = -Infinity;
  private lastTime = 0;

  handle(request: WorkerRequest): WorkerResponse {
    const { id, generation, command } = request;
    try {
      let trails;
      let diagnosticsFresh = true;
      if (command.type === 'init') {
        this.engine = createSimulationRuntime({ document: command.document, initialTime: command.initialTime });
        this.generation = generation;
        this.bodyCount = -1;
        this.diagnostics = undefined;
        this.lastDiagnosticsMs = -Infinity;
      }
      if (!this.engine || this.generation !== generation) throw new Error('Generación del Worker incorrecta');
      const engine = this.engine;
      let snapshot;
      if (command.type === 'frame') {
        const sample = new PhysicsTrailSampler();
        const refresh = command.nowMs - this.lastDiagnosticsMs >= 100;
        diagnosticsFresh = refresh;
        snapshot = engine.runFrame(command.nowMs, {
          cachedDiagnostics: refresh ? undefined : this.diagnostics,
          onStep: sample.observe,
        });
        trails = sample.finish(snapshot, snapshot.time - this.lastTime);
        if (refresh) this.lastDiagnosticsMs = command.nowMs;
      } else if (command.type === 'step') snapshot = engine.stepOnce();
      else {
        if (command.type === 'scale') engine.setTimeScale(command.scale);
        if (command.type === 'collision') engine.setCollisionMode(command.mode);
        snapshot = engine.getSnapshot();
      }
      this.diagnostics = snapshot.diagnostics;
      this.lastTime = snapshot.time;
      const packed = packSnapshot(snapshot, this.bodyCount !== snapshot.bodies.length);
      this.bodyCount = snapshot.bodies.length;
      packed.trails = trails;
      packed.diagnosticsFresh = diagnosticsFresh;
      return { type: 'state', id, generation, packed };
    } catch (error) {
      return { type: 'error', id, generation, message: error instanceof Error ? error.message : String(error) };
    }
  }
}
