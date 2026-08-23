import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '../engine/simulation-engine';
import { createDocument } from '../document/simulation-document';
import { MergeCollisionPolicy } from '../collision/merge';
import { createPhysicsStateFromBodies } from '../state/physics-state';
import { displayRadiusFromPhysical } from '../visual/display-radius';
import { M_EARTH } from '../constants';
import type { CelestialBody } from '../types';

describe('Critical Physics Fixes', () => {
  it('uses custom gravityConstant in diagnostics and snapshots', () => {
    const customG = 1.0;
    const bodies: CelestialBody[] = [
      {
        id: 'b1',
        name: 'Body 1',
        mass: 100,
        radius: 10,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        state: 'dynamic',
        visual: { color: '#fff', displayRadius: 10, showTrail: false, trailLength: 10 },
      },
      {
        id: 'b2',
        name: 'Body 2',
        mass: 200,
        radius: 10,
        position: { x: 100, y: 0 },
        velocity: { x: 0, y: 0 },
        state: 'dynamic',
        visual: { color: '#fff', displayRadius: 10, showTrail: false, trailLength: 10 },
      },
    ];

    const doc = createDocument('test-custom-g', bodies, { gravityConstant: customG });
    const engine = new SimulationEngine({ document: doc });
    const snap = engine.getSnapshot();

    // Potential energy U = - G * m1 * m2 / r = - 1.0 * 100 * 200 / 100 = -200
    expect(snap.diagnostics.potentialEnergy).toBeCloseTo(-200, 5);
    expect(snap.diagnostics.totalEnergy).toBeCloseTo(-200, 5);
  });

  it('updates displayRadius and mass correctly on collision merge', () => {
    const bodies: CelestialBody[] = [
      {
        id: 'b1',
        name: 'Body 1',
        mass: M_EARTH,
        radius: 6.371e6,
        position: { x: 0, y: 0 },
        velocity: { x: 100, y: 0 },
        state: 'dynamic',
        visual: { color: '#3b82f6', displayRadius: 8, showTrail: false, trailLength: 10 },
      },
      {
        id: 'b2',
        name: 'Body 2',
        mass: M_EARTH,
        radius: 6.371e6,
        position: { x: 1000, y: 0 }, // touching / within radius
        velocity: { x: -100, y: 0 },
        state: 'dynamic',
        visual: { color: '#ef4444', displayRadius: 8, showTrail: false, trailLength: 10 },
      },
    ];

    const state = createPhysicsStateFromBodies(bodies);
    const policy = new MergeCollisionPolicy();
    const didMerge = policy.resolve(state, 1.0);

    expect(didMerge).toBe(true);
    expect(state.count).toBe(1);
    expect(state.mass[0]).toBeCloseTo(2 * M_EARTH);
    // Linear momentum conservation: (M * 100 + M * -100) / 2M = 0
    expect(state.velocity[0]).toBeCloseTo(0);

    const originalDisplayRadius = displayRadiusFromPhysical(6.371e6);
    const mergedBodies = state.toBodies();
    expect(mergedBodies[0]!.name).toBe('Body 1+Body 2');
    expect(mergedBodies[0]!.radius).toBeCloseTo(Math.cbrt(2) * 6.371e6);
    expect(mergedBodies[0]!.visual.displayRadius).toBeGreaterThan(originalDisplayRadius);
  });

  it('returns false from collision policy when no bodies collide', () => {
    const bodies: CelestialBody[] = [
      {
        id: 'b1',
        name: 'Body 1',
        mass: M_EARTH,
        radius: 6.371e6,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        state: 'dynamic',
        visual: { color: '#3b82f6', displayRadius: 8, showTrail: false, trailLength: 10 },
      },
      {
        id: 'b2',
        name: 'Body 2',
        mass: M_EARTH,
        radius: 6.371e6,
        position: { x: 1e9, y: 0 },
        velocity: { x: 0, y: 0 },
        state: 'dynamic',
        visual: { color: '#ef4444', displayRadius: 8, showTrail: false, trailLength: 10 },
      },
    ];

    const state = createPhysicsStateFromBodies(bodies);
    const policy = new MergeCollisionPolicy();
    const didMerge = policy.resolve(state, 1.0);

    expect(didMerge).toBe(false);
    expect(state.count).toBe(2);
  });
});
