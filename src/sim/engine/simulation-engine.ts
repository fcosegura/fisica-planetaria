import { DEFAULT_SIM_CONFIG, G } from '../constants';
import { MergeCollisionPolicy } from '../collision/merge';
import { IgnoreCollisionPolicy } from '../collision/ignore';
import type { CollisionPolicy } from '../collision/collision-policy';
import { computeConservationSnapshot } from '../diagnostics/conservation';
import type { SimulationDocument } from '../document/simulation-document';
import { LeapfrogKDKIntegrator } from '../integrator/leapfrog-kdk';
import type { Integrator } from '../integrator/integrator';
import { PhysicsState } from '../state/physics-state';
import { DirectNBodySolver } from '../solver/direct-nbody';
import type { GravitySolver } from '../solver/gravity-solver';
import type {
  CelestialBody,
  ConservationSnapshot,
  EngineCompatibility,
  EngineKind,
  SimConfig,
  SimSnapshot,
  TimeScaleStatus,
  CollisionEvent,
} from '../types';
import type { SimulationRuntime } from './runtime';

function emptyTimeScaleStatus(config: SimConfig): TimeScaleStatus {
  return {
    requestedTimeScale: config.simulationTimeScale,
    effectiveTimeScale: 0,
    physicsDt: config.physicsDt,
    substepsRequested: 0,
    substepsExecuted: 0,
    isCapped: false,
    capReason: null,
  };
}

export interface SimulationEngineOptions {
  document: SimulationDocument;
  solver?: GravitySolver;
  integrator?: Integrator;
  collision?: CollisionPolicy;
  /** Clock offset when rebuilding from a live snapshot. Default 0. */
  initialTime?: number;
}

const NBODY_COMPATIBLE: EngineCompatibility = {
  compatible: true,
  code: 'ok',
  reason: null,
};

function createCollisionPolicy(mode: SimConfig['collisionMode']): CollisionPolicy {
  return mode === 'merge' ? new MergeCollisionPolicy() : new IgnoreCollisionPolicy();
}

function createSolver(config: SimConfig): GravitySolver {
  return new DirectNBodySolver(config.gravityConstant ?? G, config.softening);
}

export class SimulationEngine implements SimulationRuntime {
  private state: PhysicsState;
  private config: SimConfig;
  private solver: GravitySolver;
  private integrator: Integrator;
  private collision: CollisionPolicy;
  private simTime = 0;
  private stepCount = 0;
  private initialMetrics: ConservationSnapshot;
  private lastTimeScale: TimeScaleStatus = emptyTimeScaleStatus(DEFAULT_SIM_CONFIG);
  private lastCollisionEvent: CollisionEvent | null = null;

  constructor(options: SimulationEngineOptions) {
    this.config = { ...options.document.config };
    this.state = new PhysicsState();
    this.state.loadBodies(options.document.bodies);
    this.solver = options.solver ?? createSolver(this.config);
    this.integrator = options.integrator ?? new LeapfrogKDKIntegrator();
    this.collision = options.collision ?? createCollisionPolicy(this.config.collisionMode);
    this.integrator.bootstrap(this.state, this.solver);
    this.initialMetrics = computeConservationSnapshot(this.state, this.config.gravityConstant ?? G);
    this.lastTimeScale = emptyTimeScaleStatus(this.config);
    this.simTime = options.initialTime ?? 0;
  }

  getEngineKind(): EngineKind {
    return 'nbody';
  }

  getCompatibility(): EngineCompatibility {
    return { ...NBODY_COMPATIBLE };
  }

  getConfig(): SimConfig {
    return { ...this.config, engineKind: 'nbody' };
  }

  getSnapshot(): SimSnapshot {
    const snap = this.state.toSnapshot(
      this.simTime,
      this.stepCount,
      this.initialMetrics,
      this.lastTimeScale,
      this.config.gravityConstant ?? G,
    );
    return {
      ...snap,
      engineKind: 'nbody',
      engineCompatibility: { ...NBODY_COMPATIBLE },
      collisionEvent: this.lastCollisionEvent,
    };
  }

  getBodies(): CelestialBody[] {
    return this.state.toBodies();
  }

  reset(document: SimulationDocument, initialTime = 0): void {
    this.config = { ...document.config, engineKind: 'nbody' };
    this.state.loadBodies(document.bodies);
    this.solver = createSolver(this.config);
    this.collision = createCollisionPolicy(this.config.collisionMode);
    this.integrator.bootstrap(this.state, this.solver);
    this.simTime = initialTime;
    this.stepCount = 0;
    this.initialMetrics = computeConservationSnapshot(this.state, this.config.gravityConstant ?? G);
    this.lastTimeScale = emptyTimeScaleStatus(this.config);
    this.lastCollisionEvent = null;
  }

  setTimeScale(scale: number): void {
    this.config = { ...this.config, simulationTimeScale: scale };
    this.lastTimeScale = {
      ...this.lastTimeScale,
      requestedTimeScale: scale,
      physicsDt: this.config.physicsDt,
      // Keep last measured effective; mark capped if it cannot meet the new request.
      isCapped:
        this.lastTimeScale.effectiveTimeScale > 0 &&
        this.lastTimeScale.effectiveTimeScale < scale * 0.99,
      capReason:
        this.lastTimeScale.effectiveTimeScale > 0 &&
        this.lastTimeScale.effectiveTimeScale < scale * 0.99
          ? this.lastTimeScale.capReason ?? 'budget'
          : this.lastTimeScale.effectiveTimeScale > 0
            ? null
            : this.lastTimeScale.capReason,
    };
  }

  setCollisionMode(mode: SimConfig['collisionMode']): void {
    this.config = { ...this.config, collisionMode: mode };
    this.collision = createCollisionPolicy(mode);
  }

  stepOnce(): SimSnapshot {
    this.lastCollisionEvent = null;
    this.integrator.step(this.state, this.solver, this.config.physicsDt);
    const didMerge = this.collision.resolve(this.state, this.config.mergeThresholdFactor);
    if (didMerge) {
      this.lastCollisionEvent = this.detectMergeEvent();
      this.solver.computeAccelerations(this.state);
    }
    this.simTime += this.config.physicsDt;
    this.stepCount += 1;
    return this.getSnapshot();
  }

  computeSubstepsNeeded(): number {
    const targetAdvance = this.config.simulationTimeScale / this.config.targetFps;
    return Math.ceil(targetAdvance / this.config.physicsDt);
  }

  runFrame(nowMs?: number): SimSnapshot {
    const start = nowMs ?? performance.now();
    const budget = this.config.frameBudgetMs;
    const maxSteps = this.config.maxSubstepsPerFrame;
    const needed = this.computeSubstepsNeeded();
    let executed = 0;
    this.lastCollisionEvent = null;

    while (executed < needed && executed < maxSteps) {
      if (nowMs !== undefined && performance.now() - start >= budget) break;
      this.integrator.step(this.state, this.solver, this.config.physicsDt);
      const didMerge = this.collision.resolve(this.state, this.config.mergeThresholdFactor);
      if (didMerge) {
        this.lastCollisionEvent = this.detectMergeEvent();
        this.solver.computeAccelerations(this.state);
      }
      executed++;
      this.simTime += this.config.physicsDt;
      this.stepCount += 1;
    }

    this.solver.computeAccelerations(this.state);

    const simAdvance = executed * this.config.physicsDt;
    const effectiveTimeScale = simAdvance * this.config.targetFps;
    const isCapped = effectiveTimeScale < this.config.simulationTimeScale * 0.99;

    this.lastTimeScale = {
      requestedTimeScale: this.config.simulationTimeScale,
      effectiveTimeScale,
      physicsDt: this.config.physicsDt,
      substepsRequested: needed,
      substepsExecuted: executed,
      isCapped,
      capReason: isCapped
        ? executed >= maxSteps
          ? 'maxSubsteps'
          : 'budget'
        : null,
    };

    return this.getSnapshot();
  }

  private detectMergeEvent(): CollisionEvent | null {
    const mergedBody = this.state.toBodies().find((body) => body.name.includes('+'));
    if (!mergedBody) return null;

    return {
      type: 'merge',
      position: { ...mergedBody.position },
      radius: mergedBody.radius,
      bodyNames: mergedBody.name.split('+'),
    };
  }
}

/** Headless runner for tests — no frame budget */
export function runSteps(
  engine: Pick<SimulationRuntime, 'stepOnce' | 'getSnapshot'>,
  n: number,
): SimSnapshot {
  for (let i = 0; i < n; i++) {
    engine.stepOnce();
  }
  return engine.getSnapshot();
}
