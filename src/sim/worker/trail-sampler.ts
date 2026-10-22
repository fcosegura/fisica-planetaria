import type { PhysicsState } from '../state/physics-state';
import type { TrailSamples } from './protocol';
import type { SimSnapshot } from '../types';

const STRIDE = 8;
export const MAX_TRAIL_SAMPLES = 128;

/** Bounded samples of actual integrated states; never interpolate orbital paths. */
export class PhysicsTrailSampler {
  private steps = 0;
  private ids: string[] = [];
  private parents: number[] = [];
  private positions = new Float64Array(0);
  private written = 0;
  private truncated = false;
  private state: PhysicsState | null = null;

  observe = (state: PhysicsState): void => {
    this.state = state;
    if (++this.steps % STRIDE === 0) this.capture(state);
  };

  private capture(state: PhysicsState): void {
    if (this.ids.length !== state.count) {
      if (this.ids.length > 0) this.truncated = true;
      this.ids = state.ids.slice(0, state.count);
      const indices = new Map(this.ids.map((id, i) => [id, i]));
      this.parents = state.meta.slice(0, state.count).map((m) => m.parentId ? indices.get(m.parentId) ?? -1 : -1);
      this.positions = new Float64Array(MAX_TRAIL_SAMPLES * state.count * 2);
      this.written = 0;
    }
    const offset = (this.written % MAX_TRAIL_SAMPLES) * state.count * 2;
    for (let i = 0; i < state.count; i++) {
      const parent = this.parents[i]!;
      this.positions[offset + i * 2] = state.position[i * 2]! - (parent >= 0 ? state.position[parent * 2]! : 0);
      this.positions[offset + i * 2 + 1] = state.position[i * 2 + 1]! - (parent >= 0 ? state.position[parent * 2 + 1]! : 0);
    }
    this.written++;
    if (this.written > MAX_TRAIL_SAMPLES) this.truncated = true;
  }

  finish(snapshot?: SimSnapshot, elapsed = 0): TrailSamples | undefined {
    if (!this.state) return undefined;
    if (this.steps % STRIDE !== 0) this.capture(this.state);
    const count = Math.min(this.written, MAX_TRAIL_SAMPLES);
    const width = this.ids.length * 2;
    const out = new Float64Array(count * width);
    const start = Math.max(0, this.written - MAX_TRAIL_SAMPLES);
    for (let i = 0; i < count; i++) {
      const offset = ((start + i) % MAX_TRAIL_SAMPLES) * width;
      out.set(this.positions.subarray(offset, offset + width), i * width);
    }
    if (snapshot?.engineKind === 'orbital') {
      const primary = snapshot.bodies.reduce((a, b) => a.mass > b.mass ? a : b, snapshot.bodies[0]);
      for (const body of snapshot.bodies) {
        if (!primary || body.id === primary.id) continue;
        const rx = body.position.x - primary.position.x;
        const ry = body.position.y - primary.position.y;
        const vx = body.velocity.x - primary.velocity.x;
        const vy = body.velocity.y - primary.velocity.y;
        const r2 = rx * rx + ry * ry;
        if (r2 > 0 && Math.abs(elapsed * (rx * vy - ry * vx) / r2) > 0.25) this.truncated = true;
      }
    }
    return { ids: this.ids, positions: out, count, truncated: this.truncated };
  }
}
