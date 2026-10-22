import type { SimSnapshot } from '../sim/types';

/** Render-only interpolation, never fed back into the solver or diagnostics. */
export function interpolateSnapshot(previous: SimSnapshot, current: SimSnapshot, alpha: number): SimSnapshot {
  if (alpha >= 1 || previous.bodies.length !== current.bodies.length || current.collisionEvent) return current;
  const a = Math.max(0, alpha);
  const byId = new Map(previous.bodies.map((body) => [body.id, body]));
  const primary = current.bodies.reduce((largest, body) => body.mass > largest.mass ? body : largest, current.bodies[0]);
  return {
    ...current,
    bodies: current.bodies.map((body) => {
      const before = byId.get(body.id);
      if (!before) return body;
      const dx = body.position.x - before.position.x;
      const dy = body.position.y - before.position.y;
      const parent = current.bodies.find((p) => p.id === body.parentId) ?? primary;
      const rx = body.position.x - (parent?.position.x ?? 0);
      const ry = body.position.y - (parent?.position.y ?? 0);
      // Long chords across an orbit would suggest motion through the primary.
      if (dx * dx + dy * dy > (rx * rx + ry * ry) * 0.0625) return body;
      return { ...body, position: {
        x: before.position.x + dx * a,
        y: before.position.y + dy * a,
      } };
    }),
  };
}
