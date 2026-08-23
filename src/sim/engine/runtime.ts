import type { SimulationDocument } from '../document/simulation-document';
import type {
  CelestialBody,
  CollisionMode,
  EngineCompatibility,
  EngineKind,
  SimConfig,
  SimSnapshot,
} from '../types';

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
  runFrame(nowMs?: number): SimSnapshot;
}

export function runRuntimeSteps(engine: SimulationRuntime, n: number): SimSnapshot {
  for (let i = 0; i < n; i++) {
    engine.stepOnce();
  }
  return engine.getSnapshot();
}
