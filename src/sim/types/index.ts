export interface Vec2 {
  x: number;
  y: number;
}

export interface BodyVisual {
  color: string;
  displayRadius: number;
  showTrail: boolean;
  trailLength: number;
}

export interface CelestialBody {
  id: string;
  /** Immediate orbital parent for local trail rendering (e.g. a moon → Saturn). */
  parentId?: string;
  name: string;
  mass: number;
  radius: number;
  position: Vec2;
  velocity: Vec2;
  state: 'dynamic' | 'fixed';
  visual: BodyVisual;
}

export type CollisionMode = 'merge' | 'ignore';

/** Runtime simulation engine. Distinct from GravitySolver (`direct` / future BH). */
export type EngineKind = 'nbody' | 'orbital';

export type EngineCompatibilityCode =
  | 'ok'
  | 'too_few_bodies'
  | 'no_orbiter'
  | 'no_dominant'
  | 'hierarchy'
  | 'not_ellipse'
  | 'degenerate';

export interface EngineCompatibility {
  compatible: boolean;
  code: EngineCompatibilityCode;
  /** Spanish UI reason, or null when compatible. */
  reason: string | null;
}

export interface SimConfig {
  physicsDt: number;
  softening: number;
  gravityConstant: number;
  collisionMode: CollisionMode;
  mergeThresholdFactor: number;
  solver: 'direct' | 'barnes-hut' | 'gpu';
  integrator: 'leapfrog-kdk';
  maxSubstepsPerFrame: number;
  frameBudgetMs: number;
  simulationTimeScale: number;
  targetFps: number;
  /**
   * Which simulation engine to instantiate. Default `nbody`.
   * Additive: omitted in older documents → DEFAULT_SIM_CONFIG.engineKind.
   */
  engineKind: EngineKind;
}

export interface ConservationSnapshot {
  kineticEnergy: number;
  potentialEnergy: number;
  totalEnergy: number;
  linearMomentum: Vec2;
  angularMomentum: number;
}

export interface ConservationMetrics extends ConservationSnapshot {
  initial: ConservationSnapshot;
  relativeEnergyError: number;
  relativeMomentumError: number;
  relativeAngularMomentumError: number;
}

export interface TimeScaleStatus {
  requestedTimeScale: number;
  effectiveTimeScale: number;
  physicsDt: number;
  substepsRequested: number;
  substepsExecuted: number;
  isCapped: boolean;
  capReason: 'budget' | 'maxSubsteps' | 'incompatible' | null;
}

export interface CollisionEvent {
  type: 'merge';
  position: Vec2;
  radius: number;
  bodyNames: string[];
}

export interface SnapshotBody {
  id: string;
  parentId?: string;
  name: string;
  position: Vec2;
  velocity: Vec2;
  mass: number;
  radius: number;
  visual: BodyVisual;
  state: 'dynamic' | 'fixed';
}

export interface SimSnapshot {
  time: number;
  step: number;
  bodies: ReadonlyArray<SnapshotBody>;
  diagnostics: ConservationMetrics;
  timeScale: TimeScaleStatus;
  engineKind: EngineKind;
  engineCompatibility: EngineCompatibility;
  /** Event produced during the most recent physics advance, if any. */
  collisionEvent?: CollisionEvent | null;
}

export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  config: Partial<SimConfig>;
  bodies: CelestialBody[];
}

export interface SimulationDocument {
  id: string;
  name: string;
  config: SimConfig;
  bodies: CelestialBody[];
}
