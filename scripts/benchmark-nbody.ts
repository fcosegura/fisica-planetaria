/** Actual production modules; deterministic fixtures, warm-up, median and p95.
 * Headless CPU measurements, excluding Canvas/React and frame-budget limiting.
 * No FPS or browser speed claims can be inferred from these tables.
 */
import { cpus } from 'node:os';
import { AU, G, M_SUN } from '../src/sim/constants';
import { createDocument } from '../src/sim/document/simulation-document';
import { computeConservationSnapshot } from '../src/sim/diagnostics/conservation';
import { createSimulationRuntime } from '../src/sim/engine/create-runtime';
import { LeapfrogKDKIntegrator } from '../src/sim/integrator/leapfrog-kdk';
import { MergeCollisionPolicy } from '../src/sim/collision/merge';
import { DirectNBodySolver } from '../src/sim/solver/direct-nbody';
import { createPhysicsStateFromBodies } from '../src/sim/state/physics-state';
import type { CelestialBody, EngineKind } from '../src/sim/types';

const RUNS = 5;
const SAMPLES = 120;
const WARMUP = 60;
const DT = 120;
const NS = [10, 50, 100, 200, 500, 1000];

function bodies(n: number): CelestialBody[] {
  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  return Array.from({ length: n }, (_, i) => {
    const r = (2 + i * 0.1) * AU;
    const angle = random() * 2 * Math.PI;
    const speed = Math.sqrt(G * M_SUN / r);
    return {
      id: `b${i}`, name: `b${i}`, mass: i === 0 ? M_SUN : 1e18,
      radius: i === 0 ? 6.96e8 : 1e3,
      position: i === 0 ? { x: 0, y: 0 } : { x: r * Math.cos(angle), y: r * Math.sin(angle) },
      velocity: i === 0 ? { x: 0, y: 0 } : { x: -speed * Math.sin(angle), y: speed * Math.cos(angle) },
      state: i === 0 ? 'fixed' : 'dynamic',
      visual: { color: '#fff', displayRadius: 3, showTrail: false, trailLength: 100 },
    };
  });
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * p) - 1]!;
}

function measure(make: () => () => void) {
  const medians: number[] = [];
  const tails: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    const step = make();
    for (let i = 0; i < WARMUP; i++) step();
    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const start = performance.now();
      step();
      samples.push(performance.now() - start);
    }
    medians.push(percentile(samples, 0.5));
    tails.push(percentile(samples, 0.95));
  }
  return {
    medianMs: Number(percentile(medians, 0.5).toFixed(5)),
    p95Ms: Number(percentile(tails, 0.5).toFixed(5)),
  };
}

console.log(`Production modules | Node ${process.version} | ${process.platform} ${process.arch} | ${cpus()[0]?.model}`);
console.log(`seed=42, warmup=${WARMUP}, samples=${SAMPLES}, runs=${RUNS}, dt=${DT}s; no Canvas/React`);
const phases: Array<Record<string, string | number>> = [];
for (const n of NS) {
  for (const phase of ['integration', 'collision-no-overlap', 'diagnostics', 'snapshot'] as const) {
    const timing = measure(() => {
      const state = createPhysicsStateFromBodies(bodies(n));
      const solver = new DirectNBodySolver();
      const integrator = new LeapfrogKDKIntegrator();
      const collision = new MergeCollisionPolicy();
      integrator.bootstrap(state, solver);
      const initial = computeConservationSnapshot(state);
      if (phase === 'integration') return () => integrator.step(state, solver, DT);
      if (phase === 'collision-no-overlap') return () => { collision.resolve(state, 1); };
      if (phase === 'diagnostics') return () => { computeConservationSnapshot(state); };
      return () => {
        state.toSnapshot(0, 0, initial, {
          physicsDt: DT, requestedTimeScale: 0, effectiveTimeScale: 0,
          substepsRequested: 0, substepsExecuted: 0, isCapped: false, capReason: null,
        });
      };
    });
    phases.push({ n, phase, ...timing });
  }
}
console.table(phases);

// Same physical work in both modes: one N-body step/frame (or one Kepler epoch).
// Batch timing includes all six frames: a median of individual frames would
// hide the periodic diagnostics cost of the publication frame.
const frames: Array<Record<string, string | number>> = [];
for (const n of [100, 500, 1000]) {
  for (const kind of ['nbody', 'orbital'] as EngineKind[]) {
    for (const mode of ['every-frame', 'publish-every-6-frames'] as const) {
      const timing = measure(() => {
        const engine = createSimulationRuntime({ document: createDocument('benchmark', bodies(n), {
          engineKind: kind, physicsDt: DT, simulationTimeScale: DT * 60,
          collisionMode: 'merge', maxSubstepsPerFrame: 100,
        }) });
        if (!engine.getCompatibility().compatible) throw new Error('Incompatible benchmark fixture');
        let snapshot = engine.getSnapshot();
        return () => {
          for (let i = 0; i < 6; i++) {
            snapshot = engine.runFrame(undefined,
              mode === 'every-frame' || i === 0 ? undefined : { cachedDiagnostics: snapshot.diagnostics });
          }
          if (!Number.isFinite(snapshot.diagnostics.totalEnergy)) throw new Error('Nonfinite diagnostics');
        };
      });
      frames.push({ n, engine: kind, mode, medianMsPer6Frames: timing.medianMs, p95MsPer6Frames: timing.p95Ms });
      console.log(`[frames] N=${n} ${kind} ${mode}: ${timing.medianMs} ms / six frames (median)`);
    }
  }
}
console.log('Full runtime frames: identical physics, metrics every frame vs one publication per six frames (10 Hz at 60 Hz).');
console.table(frames);
