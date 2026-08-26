import { FLAG_ACTIVE, FLAG_FIXED, G } from '../constants';
import type { CelestialBody, ConservationMetrics, SimSnapshot, SnapshotBody, TimeScaleStatus } from '../types';
import { computeConservationMetrics } from '../diagnostics/conservation';

export interface BodyMeta {
  id: string;
  parentId?: string;
  name: string;
  radius: number;
  visual: CelestialBody['visual'];
  state: 'dynamic' | 'fixed';
}

export class PhysicsState {
  count = 0;
  ids: string[] = [];
  meta: BodyMeta[] = [];
  mass = new Float64Array(0);
  position = new Float64Array(0);
  velocity = new Float64Array(0);
  acceleration = new Float64Array(0);
  flags = new Uint8Array(0);

  resize(n: number): void {
    this.count = n;
    this.mass = new Float64Array(n);
    this.position = new Float64Array(n * 2);
    this.velocity = new Float64Array(n * 2);
    this.acceleration = new Float64Array(n * 2);
    this.flags = new Uint8Array(n);
    this.ids = new Array(n);
    this.meta = new Array(n);
  }

  loadBodies(bodies: CelestialBody[]): void {
    this.resize(bodies.length);
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i]!;
      this.ids[i] = b.id;
      this.meta[i] = {
        id: b.id,
        parentId: b.parentId,
        name: b.name,
        radius: b.radius,
        visual: { ...b.visual },
        state: b.state,
      };
      this.mass[i] = b.mass;
      this.position[i * 2] = b.position.x;
      this.position[i * 2 + 1] = b.position.y;
      this.velocity[i * 2] = b.velocity.x;
      this.velocity[i * 2 + 1] = b.velocity.y;
      this.flags[i] = FLAG_ACTIVE | (b.state === 'fixed' ? FLAG_FIXED : 0);
    }
  }

  toBodies(): CelestialBody[] {
    const out: CelestialBody[] = [];
    for (let i = 0; i < this.count; i++) {
      const m = this.meta[i]!;
      out.push({
        id: m.id,
        parentId: m.parentId,
        name: m.name,
        mass: this.mass[i]!,
        radius: m.radius,
        position: { x: this.position[i * 2]!, y: this.position[i * 2 + 1]! },
        velocity: { x: this.velocity[i * 2]!, y: this.velocity[i * 2 + 1]! },
        state: m.state,
        visual: { ...m.visual },
      });
    }
    return out;
  }

  toSnapshot(
    time: number,
    step: number,
    initialMetrics: ConservationMetrics['initial'],
    timeScale: TimeScaleStatus,
    gravityConstant: number = G,
  ): SimSnapshot {
    const bodies: SnapshotBody[] = [];
    for (let i = 0; i < this.count; i++) {
      const m = this.meta[i]!;
      bodies.push({
        id: m.id,
        parentId: m.parentId,
        name: m.name,
        mass: this.mass[i]!,
        radius: m.radius,
        position: { x: this.position[i * 2]!, y: this.position[i * 2 + 1]! },
        velocity: { x: this.velocity[i * 2]!, y: this.velocity[i * 2 + 1]! },
        state: m.state,
        visual: { ...m.visual },
      });
    }

    const diagnostics = computeConservationMetrics(this, gravityConstant, initialMetrics);

    return {
      time,
      step,
      bodies,
      diagnostics,
      timeScale,
      engineKind: 'nbody',
      engineCompatibility: { compatible: true, code: 'ok', reason: null },
    };
  }

  removeBody(index: number): void {
    const n = this.count - 1;
    if (index < 0 || index >= this.count) return;

    for (let i = index; i < n; i++) {
      this.ids[i] = this.ids[i + 1]!;
      this.meta[i] = this.meta[i + 1]!;
      this.mass[i] = this.mass[i + 1]!;
      this.flags[i] = this.flags[i + 1]!;
      this.position[i * 2] = this.position[(i + 1) * 2]!;
      this.position[i * 2 + 1] = this.position[(i + 1) * 2 + 1]!;
      this.velocity[i * 2] = this.velocity[(i + 1) * 2]!;
      this.velocity[i * 2 + 1] = this.velocity[(i + 1) * 2 + 1]!;
      this.acceleration[i * 2] = this.acceleration[(i + 1) * 2]!;
      this.acceleration[i * 2 + 1] = this.acceleration[(i + 1) * 2 + 1]!;
    }

    this.count = n;
    this.ids.pop();
    this.meta.pop();
  }
}

export function createPhysicsStateFromBodies(bodies: CelestialBody[]): PhysicsState {
  const state = new PhysicsState();
  state.loadBodies(bodies);
  return state;
}
