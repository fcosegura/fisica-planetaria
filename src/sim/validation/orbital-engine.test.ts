import { describe, expect, it } from 'vitest';
import { AU, EARTH_ORBITAL_PERIOD, G, M_SUN } from '../constants';
import { createSimulationRuntime } from '../engine/create-runtime';
import { OrbitalEngine } from '../engine/orbital-engine';
import { SimulationEngine, runSteps } from '../engine/simulation-engine';
import {
  KEPLER_ABS_TOL_E,
  cartesianToKepler,
  keplerPeriod,
  keplerToCartesian,
  solveKeplerEquation,
} from '../orbit/kepler-2d';
import { assessOrbitalCompatibility } from '../orbit/orbital-compatibility';
import {
  binarySystem,
  collisionScenario,
  earthMoon,
  escapeScenario,
  kuiperBeltScenario,
  sandboxScenario,
  scenarioToDocument,
  sunEarthCircular,
  sunEarthElliptic,
  sunSedna,
} from '../scenarios';
import type { ScenarioPreset } from '../types';

/**
 * |Δr|/a after a Kepler evaluation.
 * |ΔE| < 1e-14 rad ⇒ |Δr| ≲ a·1e-14. 1e-10 leaves ~10⁴ of margin for trig.
 */
const POSITION_REL_TOL = 1e-10;

function withOrbital(scenario: ScenarioPreset, extra: Record<string, number> = {}) {
  const base = scenarioToDocument(scenario);
  return {
    ...base,
    config: { ...base.config, engineKind: 'orbital' as const, ...extra },
  };
}

function named(
  engine: { getSnapshot: () => { bodies: readonly { name: string; position: { x: number; y: number }; velocity: { x: number; y: number } }[] } },
  name: string,
) {
  const body = engine.getSnapshot().bodies.find((b) => b.name === name);
  expect(body).toBeDefined();
  return body!;
}

function dist(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return Math.hypot(ax - bx, ay - by);
}

describe('Kepler equation solver', () => {
  it('is exact for circular orbits (e = 0)', () => {
    expect(solveKeplerEquation(1.234, 0)).toBeCloseTo(1.234, 15);
  });

  it('converges for Sedna-like eccentricity with |ΔE| policy 1e-14', () => {
    expect(KEPLER_ABS_TOL_E).toBe(1e-14);
    const e = 0.855;
    for (const M of [0, 0.1, 1, Math.PI, -2, 3.5]) {
      const E = solveKeplerEquation(M, e);
      let residual = E - e * Math.sin(E) - M;
      residual = ((residual + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      expect(Math.abs(residual)).toBeLessThan(1e-13);
    }
  });
});

describe('engine selection', () => {
  it('defaults to the N-body reference engine', () => {
    const runtime = createSimulationRuntime({ document: scenarioToDocument(sunEarthCircular) });
    expect(runtime.getEngineKind()).toBe('nbody');
    expect(runtime).toBeInstanceOf(SimulationEngine);
  });

  it('constructs the orbital engine when engineKind is orbital', () => {
    const runtime = createSimulationRuntime({ document: withOrbital(sunEarthCircular) });
    expect(runtime.getEngineKind()).toBe('orbital');
    expect(runtime).toBeInstanceOf(OrbitalEngine);
  });

  it('leaves N-body two-body energy conservation unchanged', () => {
    const engine = new SimulationEngine({ document: scenarioToDocument(sunEarthCircular) });
    const dt = sunEarthCircular.config.physicsDt!;
    runSteps(engine, Math.ceil(EARTH_ORBITAL_PERIOD / dt));
    expect(engine.getSnapshot().diagnostics.relativeEnergyError).toBeLessThan(1e-4);
    expect(engine.getEngineKind()).toBe('nbody');
  });
});

describe('orbital two-body circular', () => {
  it('returns to the initial state after one analytical period', () => {
    const engine = new OrbitalEngine({ document: withOrbital(sunEarthCircular) });
    const earth0 = named(engine, 'Tierra');
    const sun = named(engine, 'Sol');
    const kep = cartesianToKepler(
      earth0.position.x - sun.position.x,
      earth0.position.y - sun.position.y,
      earth0.velocity.x - sun.velocity.x,
      earth0.velocity.y - sun.velocity.y,
      G * M_SUN,
    );
    expect('error' in kep).toBe(false);
    if ('error' in kep) return;
    expect(kep.e).toBeLessThan(1e-6);
    engine.advanceBy(kep.period);
    const earth1 = named(engine, 'Tierra');
    expect(dist(earth1.position.x, earth1.position.y, earth0.position.x, earth0.position.y) / kep.a).toBeLessThan(
      POSITION_REL_TOL,
    );
  });

  it('matches closed-form cartesian state at a quarter period', () => {
    const engine = new OrbitalEngine({ document: withOrbital(sunEarthCircular) });
    const earth0 = named(engine, 'Tierra');
    const sun = named(engine, 'Sol');
    const kep = cartesianToKepler(
      earth0.position.x - sun.position.x,
      earth0.position.y - sun.position.y,
      earth0.velocity.x - sun.velocity.x,
      earth0.velocity.y - sun.velocity.y,
      G * M_SUN,
    );
    expect('error' in kep).toBe(false);
    if ('error' in kep) return;
    const dt = kep.period / 4;
    const expected = keplerToCartesian(kep, dt);
    engine.advanceBy(dt);
    const earth1 = named(engine, 'Tierra');
    const sun1 = named(engine, 'Sol');
    expect(
      dist(earth1.position.x - sun1.position.x, earth1.position.y - sun1.position.y, expected.rx, expected.ry) / kep.a,
    ).toBeLessThan(POSITION_REL_TOL);
  });
});

describe('orbital two-body elliptic', () => {
  it('conserves a, e and returns after one period', () => {
    const engine = new OrbitalEngine({ document: withOrbital(sunEarthElliptic) });
    const earth0 = named(engine, 'Tierra');
    const sun0 = named(engine, 'Sol');
    const mu = G * M_SUN;
    const kep0 = cartesianToKepler(
      earth0.position.x - sun0.position.x,
      earth0.position.y - sun0.position.y,
      earth0.velocity.x - sun0.velocity.x,
      earth0.velocity.y - sun0.velocity.y,
      mu,
    );
    expect('error' in kep0).toBe(false);
    if ('error' in kep0) return;
    expect(kep0.e).toBeGreaterThan(0.01);

    engine.advanceBy(kep0.period);
    const earth1 = named(engine, 'Tierra');
    const sun1 = named(engine, 'Sol');
    const kep1 = cartesianToKepler(
      earth1.position.x - sun1.position.x,
      earth1.position.y - sun1.position.y,
      earth1.velocity.x - sun1.velocity.x,
      earth1.velocity.y - sun1.velocity.y,
      mu,
    );
    expect('error' in kep1).toBe(false);
    if ('error' in kep1) return;
    expect(Math.abs(kep1.a - kep0.a) / kep0.a).toBeLessThan(1e-12);
    expect(Math.abs(kep1.e - kep0.e)).toBeLessThan(1e-12);
    expect(dist(earth1.position.x, earth1.position.y, earth0.position.x, earth0.position.y) / kep0.a).toBeLessThan(
      POSITION_REL_TOL,
    );
  });

  it('returns to the initial cartesian state after +Δt then −Δt', () => {
    const engine = new OrbitalEngine({ document: withOrbital(sunEarthElliptic) });
    const earth0 = named(engine, 'Tierra');
    const dt = 0.37 * EARTH_ORBITAL_PERIOD;
    engine.advanceBy(dt);
    engine.advanceBy(-dt);
    const earth1 = named(engine, 'Tierra');
    expect(dist(earth1.position.x, earth1.position.y, earth0.position.x, earth0.position.y) / AU).toBeLessThan(
      POSITION_REL_TOL,
    );
  });

  it('is deterministic', () => {
    const a = new OrbitalEngine({ document: withOrbital(sunEarthElliptic) });
    const b = new OrbitalEngine({ document: withOrbital(sunEarthElliptic) });
    a.advanceBy(1e8);
    b.advanceBy(1e8);
    const pa = named(a, 'Tierra').position;
    const pb = named(b, 'Tierra').position;
    expect(pa.x).toBe(pb.x);
    expect(pa.y).toBe(pb.y);
  });
});

describe('N-body vs orbital comparison (two-body)', () => {
  it('orbital matches analytical Kepler more tightly than leapfrog N-body', () => {
    const nbody = new SimulationEngine({ document: scenarioToDocument(sunEarthCircular) });
    const orbital = new OrbitalEngine({ document: withOrbital(sunEarthCircular) });
    const earth0 = named(orbital, 'Tierra');
    const sun0 = named(orbital, 'Sol');
    const kep = cartesianToKepler(
      earth0.position.x - sun0.position.x,
      earth0.position.y - sun0.position.y,
      earth0.velocity.x - sun0.velocity.x,
      earth0.velocity.y - sun0.velocity.y,
      G * M_SUN,
    );
    expect('error' in kep).toBe(false);
    if ('error' in kep) return;

    const dt = 0.25 * kep.period;
    orbital.advanceBy(dt);
    runSteps(nbody, Math.ceil(dt / sunEarthCircular.config.physicsDt!));

    const expected = keplerToCartesian(kep, dt);
    const oEarth = named(orbital, 'Tierra');
    const oSun = named(orbital, 'Sol');
    const nEarth = named(nbody, 'Tierra');
    const nSun = named(nbody, 'Sol');
    const orbitalErr =
      dist(oEarth.position.x - oSun.position.x, oEarth.position.y - oSun.position.y, expected.rx, expected.ry) / kep.a;
    const nbodyErr =
      dist(nEarth.position.x - nSun.position.x, nEarth.position.y - nSun.position.y, expected.rx, expected.ry) / kep.a;
    expect(orbitalErr).toBeLessThan(POSITION_REL_TOL);
    expect(nbodyErr).toBeGreaterThan(orbitalErr);
    expect(nbodyErr).toBeLessThan(1e-2);
  });
});

describe('Sedna Keplerian scenario', () => {
  it('is compatible with the orbital engine', () => {
    expect(assessOrbitalCompatibility(sunSedna.bodies).compatible).toBe(true);
    const engine = new OrbitalEngine({ document: withOrbital(sunSedna) });
    expect(engine.getCompatibility().compatible).toBe(true);
  });

  it('has a period near 11400 years from its own elements', () => {
    const sedna = sunSedna.bodies.find((b) => b.name === 'Sedna')!;
    const sun = sunSedna.bodies.find((b) => b.name === 'Sol')!;
    const kep = cartesianToKepler(
      sedna.position.x - sun.position.x,
      sedna.position.y - sun.position.y,
      sedna.velocity.x - sun.velocity.x,
      sedna.velocity.y - sun.velocity.y,
      G * M_SUN,
    );
    expect('error' in kep).toBe(false);
    if ('error' in kep) return;
    const years = kep.period / (365.25 * 86400);
    expect(years).toBeGreaterThan(10_000);
    expect(years).toBeLessThan(13_000);
    expect(kep.e).toBeGreaterThan(0.8);
    expect(kep.a / AU).toBeCloseTo(506.8, 0);
    expect(keplerPeriod(kep.a, G * M_SUN)).toBeCloseTo(kep.period, 6);
  });

  it('returns near the initial state after one period and a 10000-year jump', () => {
    const engine = new OrbitalEngine({ document: withOrbital(sunSedna) });
    const s0 = named(engine, 'Sedna');
    const sun = named(engine, 'Sol');
    const kep = cartesianToKepler(
      s0.position.x - sun.position.x,
      s0.position.y - sun.position.y,
      s0.velocity.x - sun.velocity.x,
      s0.velocity.y - sun.velocity.y,
      G * M_SUN,
    );
    expect('error' in kep).toBe(false);
    if ('error' in kep) return;

    engine.advanceBy(kep.period);
    const s1 = named(engine, 'Sedna');
    expect(dist(s1.position.x, s1.position.y, s0.position.x, s0.position.y) / kep.a).toBeLessThan(POSITION_REL_TOL);

    const jump = 10_000 * 365.25 * 86400;
    engine.advanceBy(jump - kep.period);
    const s2 = named(engine, 'Sedna');
    const expected = keplerToCartesian(kep, jump);
    const sun2 = named(engine, 'Sol');
    expect(
      dist(s2.position.x - sun2.position.x, s2.position.y - sun2.position.y, expected.rx, expected.ry) / kep.a,
    ).toBeLessThan(POSITION_REL_TOL);
    expect(Number.isFinite(s2.position.x)).toBe(true);
  });
});

describe('orbital compatibility', () => {
  it('accepts Sun–Earth, Sun–Sedna and Kuiper (no moons)', () => {
    expect(assessOrbitalCompatibility(sunEarthCircular.bodies).code).toBe('ok');
    expect(assessOrbitalCompatibility(sunSedna.bodies).code).toBe('ok');
    expect(assessOrbitalCompatibility(kuiperBeltScenario.bodies).code).toBe('ok');
  });

  it('rejects hierarchical moons, binaries, escape, collisions and sandbox', () => {
    expect(assessOrbitalCompatibility(earthMoon.bodies).code).toBe('hierarchy');
    expect(assessOrbitalCompatibility(binarySystem.bodies).code).toBe('no_dominant');
    expect(assessOrbitalCompatibility(escapeScenario.bodies).code).toBe('not_ellipse');
    expect(assessOrbitalCompatibility(collisionScenario.bodies).code).toBe('no_dominant');
    expect(assessOrbitalCompatibility(sandboxScenario.bodies).code).toBe('too_few_bodies');
  });

  it('does not advance an incompatible orbital run', () => {
    const engine = new OrbitalEngine({ document: withOrbital(earthMoon) });
    const before = engine.getSnapshot();
    engine.runFrame();
    engine.stepOnce();
    const after = engine.getSnapshot();
    expect(after.time).toBe(before.time);
    expect(after.engineCompatibility.compatible).toBe(false);
    expect(after.timeScale.capReason).toBe('incompatible');
    expect(after.timeScale.effectiveTimeScale).toBe(0);
  });
});

describe('orbital time scale', () => {
  it('reports effectiveTimeScale equal to requestedTimeScale when compatible', () => {
    const engine = new OrbitalEngine({
      document: withOrbital(sunSedna, { simulationTimeScale: 31_557_600_000 }),
    });
    const snap = engine.runFrame();
    expect(snap.timeScale.requestedTimeScale).toBe(31_557_600_000);
    expect(snap.timeScale.effectiveTimeScale).toBe(31_557_600_000);
    expect(snap.timeScale.isCapped).toBe(false);
    expect(snap.timeScale.substepsExecuted).toBe(1);
  });
});
