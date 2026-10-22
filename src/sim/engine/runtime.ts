import type { SimulationDocument } from '../document/simulation-document';
import type { PhysicsState } from '../state/physics-state';
import type {
  CelestialBody,
  CollisionMode,
  ConservationMetrics,
  EngineCompatibility,
  EngineKind,
  SimConfig,
  SimSnapshot,
} from '../types';

export interface FrameSnapshotOptions {
  /**
   * Reuse the last published metrics for a render-only frame. Positions and
   * velocities remain current. Omit when publishing to UI or reading physics.
   */
  cachedDiagnostics?: ConservationMetrics;
  /** Optional observer of completed physical steps, for bounded trail sampling. */
  onStep?: (state: PhysicsState) => void;
}

/**
 * Shared surface of N-body (`SimulationEngine`) and Kepler (`OrbitalEngine`).
 * Intentionally small: store, renderer and tests should not depend on solvers.
 */
export interface SimulationRuntime {
  getEngineKind(): EngineKind;
  getCompatibility(): EngineCompatibility;
  getConfig(): SimConfig;
  getSnapshot(): SimSnapshot;
  getBodies(): CelestialBody[];
  reset(document: SimulationDocument, initialTime?: number): void;
  setTimeScale(scale: number): void;
  setCollisionMode(mode: CollisionMode): void;
  stepOnce(): SimSnapshot;
  runFrame(nowMs?: number, options?: FrameSnapshotOptions): SimSnapshot;
}

export function runRuntimeSteps(engine: SimulationRuntime, n: number): SimSnapshot {
  for (let i = 0; i < n; i++) {
    engine.stepOnce();
  }
  return engine.getSnapshot();
}
