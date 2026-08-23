import { describe, expect, it } from 'vitest';
import { AU, M_EARTH, M_SUN } from '../constants';
import {
  computeCircularOrbitVelocity,
  computeGravitationalAcceleration,
  makeBodyAtPosition,
} from '../orbit/compute-orbit';
import {
  bodyFromSunOrbit,
  circularOrbitSpeed,
  makeSunBody,
  makeVisual,
  nextCatalogBodyId,
  SOLAR_SYSTEM_CATALOG,
} from '../catalog/solar-system';

describe('computeCircularOrbitVelocity', () => {
  it('matches heliocentric circular speed with only the Sun present', () => {
    const sun = makeSunBody();
    const position = { x: AU, y: 0 };
    const { velocity, speed } = computeCircularOrbitVelocity(position, [sun]);

    const expected = circularOrbitSpeed(M_SUN, AU);
    expect(speed).toBeCloseTo(expected, 0);
    expect(velocity.x).toBeCloseTo(0, 0);
    expect(velocity.y).toBeCloseTo(expected, 0);
  });

  it('includes Earth velocity when placing near Earth', () => {
    const sun = makeSunBody();
    const earth = bodyFromSunOrbit(SOLAR_SYSTEM_CATALOG.find((p) => p.id === 'earth')!);
    const moonDistance = 3.844e8;
    const position = {
      x: earth.position.x + moonDistance,
      y: earth.position.y,
    };

    const { velocity, attractor } = computeCircularOrbitVelocity(position, [sun, earth]);
    expect(attractor?.name).toBe('Tierra');

    const relVx = velocity.x - earth.velocity.x;
    const relVy = velocity.y - earth.velocity.y;
    const relSpeed = Math.hypot(relVx, relVy);
    const expectedRel = circularOrbitSpeed(M_EARTH, moonDistance);
    expect(relSpeed).toBeCloseTo(expectedRel, -2);
  });

  it('produces finite acceleration in a multi-body field', () => {
    const bodies = [makeSunBody(), bodyFromSunOrbit(SOLAR_SYSTEM_CATALOG.find((p) => p.id === 'jupiter')!)];
    const g = computeGravitationalAcceleration({ x: 2 * AU, y: 0 }, bodies);
    expect(Number.isFinite(g.x)).toBe(true);
    expect(Number.isFinite(g.y)).toBe(true);
    expect(Math.hypot(g.x, g.y)).toBeGreaterThan(0);
  });
});

describe('makeBodyAtPosition', () => {
  it('rejects placement inside another body', () => {
    const sun = makeSunBody();
    const body = makeBodyAtPosition(
      { x: 0, y: 0 },
      [sun],
      () => nextCatalogBodyId('custom'),
      (color, r) => makeVisual(color, r),
    );
    expect(body).toBeNull();
  });

  it('creates a body with orbital velocity at a free point', () => {
    const sun = makeSunBody();
    const body = makeBodyAtPosition(
      { x: 1.5 * AU, y: 0.2 * AU },
      [sun],
      () => nextCatalogBodyId('custom'),
      (color, r) => makeVisual(color, r),
    );
    expect(body).not.toBeNull();
    expect(body!.mass).toBe(M_EARTH);
    expect(Math.hypot(body!.velocity.x, body!.velocity.y)).toBeGreaterThan(0);
  });
});
