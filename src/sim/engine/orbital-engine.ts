import { DEFAULT_SIM_CONFIG, G } from '../constants';
import { computeConservationSnapshot } from '../diagnostics/conservation';
import type { SimulationDocument } from '../document/simulation-document';
import { PhysicsState } from '../state/physics-state';
import type {
  CelestialBody,
  ConservationSnapshot,
  EngineCompatibility,
  EngineKind,
  SimConfig,
  SimSnapshot,
  TimeScaleStatus,
} from '../types';
import {
  cartesianToKepler,
  keplerToCartesian,
  type Keplerian2D,
} from '../orbit/kepler-2d';
import { assessOrbitalCompatibility } from '../orbit/orbital-compatibility';
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

export interface OrbitalEngineOptions {
  document: SimulationDocument;
  initialTime?: number;
}

interface StoredOrbit {
  index: number;
  elements: Keplerian2D;
}

/**
 * Experimental Kepler engine: O(N) evaluation of two-body ellipses about a
 * dominant primary. Does not apply CollisionPolicy or N-body perturbations.
 */
export class OrbitalEngine implements SimulationRuntime {
  private state: PhysicsState;
  private config: SimConfig;
  private simTime = 0;
  private epochTime = 0;
  private stepCount = 0;
  private initialMetrics: ConservationSnapshot;
  private lastTimeScale: TimeScaleStatus = emptyTimeScaleStatus(DEFAULT_SIM_CONFIG);
  private compatibility: EngineCompatibility;
  private primaryIndex = 0;
  private primaryFixed = true;
  private orbits: StoredOrbit[] = [];
  private primaryEpoch = { x: 0, y: 0, vx: 0, vy: 0 };
  private twoBodyBarycenter = false;
  private cmEpoch = { x: 0, y: 0, vx: 0, vy: 0 };

  constructor(options: OrbitalEngineOptions) {
    this.config = { ...options.document.config, engineKind: 'orbital' };
    this.state = new PhysicsState();
    this.initialMetrics = {
      kineticEnergy: 0,
      potentialEnergy: 0,
      totalEnergy: 0,
      linearMomentum: { x: 0, y: 0 },
      angularMomentum: 0,
    };
    this.compatibility = { compatible: false, code: 'too_few_bodies', reason: null };
    this.rebuild(options.document, options.initialTime ?? 0);
  }

  getEngineKind(): EngineKind {
    return 'orbital';
  }

  getCompatibility(): EngineCompatibility {
    return { ...this.compatibility };
  }

  getConfig(): SimConfig {
    return { ...this.config };
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
      engineKind: 'orbital',
      engineCompatibility: { ...this.compatibility },
    };
  }

  getBodies(): CelestialBody[] {
    return this.state.toBodies();
  }

  reset(document: SimulationDocument, initialTime = 0): void {
    this.config = { ...document.config, engineKind: 'orbital' };
    this.rebuild(document, initialTime);
  }

  setTimeScale(scale: number): void {
    this.config = { ...this.config, simulationTimeScale: scale };
    this.lastTimeScale = {
      ...this.lastTimeScale,
      requestedTimeScale: scale,
      physicsDt: this.config.physicsDt,
      isCapped:
        !this.compatibility.compatible ||
        (this.lastTimeScale.effectiveTimeScale > 0 &&
          this.lastTimeScale.effectiveTimeScale < scale * 0.99),
      capReason: !this.compatibility.compatible
        ? 'incompatible'
        : this.lastTimeScale.effectiveTimeScale > 0 &&
            this.lastTimeScale.effectiveTimeScale < scale * 0.99
          ? this.lastTimeScale.capReason ?? 'budget'
          : this.lastTimeScale.effectiveTimeScale > 0
            ? null
            : this.lastTimeScale.capReason,
    };
  }

  setCollisionMode(mode: SimConfig['collisionMode']): void {
    // Stored for round-trip to N-body; orbital engine never applies merge.
    this.config = { ...this.config, collisionMode: mode };
  }

  stepOnce(): SimSnapshot {
    if (!this.compatibility.compatible) {
      return this.freezeIncompatible();
    }
    this.simTime += this.config.physicsDt;
    this.stepCount += 1;
    this.evaluate();
    return this.getSnapshot();
  }

  /**
   * Advance the epoch by `deltaSeconds` (may be negative) and evaluate once.
   * Used by tests and the comparative benchmark — not by N-body.
   */
  advanceBy(deltaSeconds: number): SimSnapshot {
    if (!this.compatibility.compatible) {
      return this.freezeIncompatible();
    }
    this.simTime += deltaSeconds;
    this.stepCount += 1;
    this.evaluate();
    this.lastTimeScale = {
      requestedTimeScale: this.config.simulationTimeScale,
      effectiveTimeScale: this.config.simulationTimeScale,
      physicsDt: this.config.physicsDt,
      substepsRequested: 1,
      substepsExecuted: 1,
      isCapped: false,
      capReason: null,
    };
    return this.getSnapshot();
  }

  runFrame(_nowMs?: number): SimSnapshot {
    if (!this.compatibility.compatible) {
      return this.freezeIncompatible();
    }

    const delta = this.config.simulationTimeScale / this.config.targetFps;
    this.simTime += delta;
    this.stepCount += 1;
    this.evaluate();

    this.lastTimeScale = {
      requestedTimeScale: this.config.simulationTimeScale,
      effectiveTimeScale: this.config.simulationTimeScale,
      physicsDt: this.config.physicsDt,
      substepsRequested: 1,
      substepsExecuted: 1,
      isCapped: false,
      capReason: null,
    };
    return this.getSnapshot();
  }

  private freezeIncompatible(): SimSnapshot {
    this.lastTimeScale = {
      requestedTimeScale: this.config.simulationTimeScale,
      effectiveTimeScale: 0,
      physicsDt: this.config.physicsDt,
      substepsRequested: 0,
      substepsExecuted: 0,
      isCapped: true,
      capReason: 'incompatible',
    };
    return this.getSnapshot();
  }

  private rebuild(document: SimulationDocument, initialTime: number): void {
    this.state.loadBodies(document.bodies);
    this.simTime = initialTime;
    this.epochTime = initialTime;
    this.stepCount = 0;
    this.orbits = [];
    this.twoBodyBarycenter = false;

    const assessed = assessOrbitalCompatibility(document.bodies, this.config.gravityConstant ?? G);
    this.compatibility = {
      compatible: assessed.compatible,
      code: assessed.code,
      reason: assessed.reason,
    };
    this.primaryIndex = assessed.primaryIndex;
    this.primaryFixed = assessed.primaryFixed;
    this.lastTimeScale = emptyTimeScaleStatus(this.config);

    if (!assessed.compatible) {
      this.initialMetrics = computeConservationSnapshot(
        this.state,
        this.config.gravityConstant ?? G,
      );
      this.lastTimeScale.capReason = 'incompatible';
      this.lastTimeScale.isCapped = true;
      return;
    }

    this.captureEpoch(document.bodies);
    this.evaluate();
    this.initialMetrics = computeConservationSnapshot(
      this.state,
      this.config.gravityConstant ?? G,
    );
  }

  private captureEpoch(bodies: readonly CelestialBody[]): void {
    const primary = bodies[this.primaryIndex]!;
    this.primaryEpoch = {
      x: primary.position.x,
      y: primary.position.y,
      vx: this.primaryFixed ? 0 : primary.velocity.x,
      vy: this.primaryFixed ? 0 : primary.velocity.y,
    };

    const orbiters = bodies.map((_, i) => i).filter((i) => i !== this.primaryIndex);

    this.twoBodyBarycenter = !this.primaryFixed && orbiters.length === 1;

    if (this.twoBodyBarycenter) {
      const sat = bodies[orbiters[0]!]!;
      const M = primary.mass;
      const m = sat.mass;
      const tot = M + m;
      this.cmEpoch = {
        x: (M * primary.position.x + m * sat.position.x) / tot,
        y: (M * primary.position.y + m * sat.position.y) / tot,
        vx: (M * primary.velocity.x + m * sat.velocity.x) / tot,
        vy: (M * primary.velocity.y + m * sat.velocity.y) / tot,
      };
    }

    const G0 = this.config.gravityConstant ?? G;
    for (const index of orbiters) {
      const body = bodies[index]!;
      const rx = body.position.x - primary.position.x;
      const ry = body.position.y - primary.position.y;
      const vx = body.velocity.x - primary.velocity.x;
      const vy = body.velocity.y - primary.velocity.y;
      const mu = this.primaryFixed ? G0 * primary.mass : G0 * (primary.mass + body.mass);
      const kep = cartesianToKepler(rx, ry, vx, vy, mu);
      if ('error' in kep) {
        this.compatibility = {
          compatible: false,
          code: 'degenerate',
          reason: 'Hay órbitas degeneradas (caída radial o estado no finito).',
        };
        this.orbits = [];
        return;
      }
      this.orbits.push({ index, elements: kep });
    }
  }

  private evaluate(): void {
    if (!this.compatibility.compatible || this.orbits.length === 0) return;

    const dt = this.simTime - this.epochTime;
    const p = this.primaryIndex;
    const Mp = this.state.mass[p]!;

    let px: number;
    let py: number;
    let pvx: number;
    let pvy: number;

    if (this.twoBodyBarycenter && this.orbits.length === 1) {
      const orb = this.orbits[0]!;
      const rel = keplerToCartesian(orb.elements, dt);
      const m = this.state.mass[orb.index]!;
      const tot = Mp + m;
      const cx = this.cmEpoch.x + this.cmEpoch.vx * dt;
      const cy = this.cmEpoch.y + this.cmEpoch.vy * dt;
      const cvx = this.cmEpoch.vx;
      const cvy = this.cmEpoch.vy;
      px = cx - (m / tot) * rel.rx;
      py = cy - (m / tot) * rel.ry;
      pvx = cvx - (m / tot) * rel.vx;
      pvy = cvy - (m / tot) * rel.vy;
      this.writeBody(p, px, py, pvx, pvy);
      this.writeBody(
        orb.index,
        cx + (Mp / tot) * rel.rx,
        cy + (Mp / tot) * rel.ry,
        cvx + (Mp / tot) * rel.vx,
        cvy + (Mp / tot) * rel.vy,
      );
      return;
    }

    if (this.primaryFixed) {
      px = this.primaryEpoch.x;
      py = this.primaryEpoch.y;
      pvx = 0;
      pvy = 0;
    } else {
      px = this.primaryEpoch.x + this.primaryEpoch.vx * dt;
      py = this.primaryEpoch.y + this.primaryEpoch.vy * dt;
      pvx = this.primaryEpoch.vx;
      pvy = this.primaryEpoch.vy;
    }
    this.writeBody(p, px, py, pvx, pvy);

    for (const orb of this.orbits) {
      const rel = keplerToCartesian(orb.elements, dt);
      this.writeBody(orb.index, px + rel.rx, py + rel.ry, pvx + rel.vx, pvy + rel.vy);
    }
  }

  private writeBody(index: number, x: number, y: number, vx: number, vy: number): void {
    this.state.position[index * 2] = x;
    this.state.position[index * 2 + 1] = y;
    this.state.velocity[index * 2] = vx;
    this.state.velocity[index * 2 + 1] = vy;
  }
}
