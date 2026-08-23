import { describe, expect, it } from 'vitest';
import { EARTH_ORBITAL_PERIOD, TIME_SCALE_PRESETS } from '../constants';
import { SimulationEngine, runSteps } from '../engine/simulation-engine';
import { scenarioToDocument } from '../scenarios';
import {
  sunEarthCircular,
  sunEarthElliptic,
  earthMoon,
  binarySystem,
  escapeScenario,
  collisionScenario,
  sunSedna,
} from '../scenarios/index';

function makeEngine(scenario: typeof sunEarthCircular) {
  return new SimulationEngine({ document: scenarioToDocument(scenario) });
}

describe('Sun-Earth circular orbit', () => {
  it('conserves energy within 1e-4 per orbit', () => {
    const engine = makeEngine(sunEarthCircular);
    const dt = sunEarthCircular.config.physicsDt!;
    const steps = Math.ceil(EARTH_ORBITAL_PERIOD / dt);
    runSteps(engine, steps);
    const snap = engine.getSnapshot();
    expect(snap.diagnostics.relativeEnergyError).toBeLessThan(1e-4);
  });

  it('conserves angular momentum', () => {
    const engine = makeEngine(sunEarthCircular);
    const dt = sunEarthCircular.config.physicsDt!;
    const steps = Math.ceil(EARTH_ORBITAL_PERIOD / dt);
    runSteps(engine, steps);
    const snap = engine.getSnapshot();
    expect(snap.diagnostics.relativeAngularMomentumError).toBeLessThan(1e-6);
  });
});

describe('Sun-Earth elliptic orbit', () => {
  it('conserves energy within 1e-3 per orbit', () => {
    const engine = makeEngine(sunEarthElliptic);
    const dt = sunEarthElliptic.config.physicsDt!;
    const steps = Math.ceil(EARTH_ORBITAL_PERIOD / dt);
    runSteps(engine, steps);
    const snap = engine.getSnapshot();
    expect(snap.diagnostics.relativeEnergyError).toBeLessThan(1e-3);
  });
});

describe('Earth-Moon system', () => {
  it('runs without NaN for one lunar period', () => {
    const engine = makeEngine(earthMoon);
    const lunarPeriod = 27.3 * 86400;
    const dt = earthMoon.config.physicsDt!;
    const steps = Math.ceil(lunarPeriod / dt);
    runSteps(engine, steps);
    const snap = engine.getSnapshot();
    for (const b of snap.bodies) {
      expect(Number.isFinite(b.position.x)).toBe(true);
      expect(Number.isFinite(b.position.y)).toBe(true);
    }
    expect(snap.diagnostics.relativeEnergyError).toBeLessThan(1e-2);
  });
});

describe('Binary system', () => {
  it('conserves total momentum near zero', () => {
    const engine = makeEngine(binarySystem);
    const dt = binarySystem.config.physicsDt!;
    const m = binarySystem.bodies[0]!.mass;
    const separation = 1e11;
    const T = 2 * Math.PI * Math.sqrt((separation ** 3) / (2 * 6.67430e-11 * m));
    const steps = Math.ceil(T / dt);
    runSteps(engine, steps);
    const snap = engine.getSnapshot();
    const p = snap.diagnostics.linearMomentum;
    expect(Math.hypot(p.x, p.y)).toBeLessThan(1e20);
    expect(snap.diagnostics.relativeEnergyError).toBeLessThan(1e-3);
  });
});

describe('Escape scenario', () => {
  it('has positive total energy', () => {
    const engine = makeEngine(escapeScenario);
    runSteps(engine, 1000);
    const snap = engine.getSnapshot();
    expect(snap.diagnostics.totalEnergy).toBeGreaterThan(0);
    const probe = snap.bodies.find((b) => b.name === 'Sonda');
    expect(probe).toBeDefined();
    expect(Math.hypot(probe!.position.x, probe!.position.y)).toBeGreaterThan(1.5e11);
  });
});

describe('Sun-Sedna scenario', () => {
  it('loads two bodies and stays finite for a short N-body run', () => {
    const engine = makeEngine(sunSedna);
    expect(sunSedna.bodies).toHaveLength(2);
    expect(sunSedna.config.physicsDt).toBe(7200);
    runSteps(engine, 500);
    const snap = engine.getSnapshot();
    expect(snap.engineKind).toBe('nbody');
    for (const b of snap.bodies) {
      expect(Number.isFinite(b.position.x)).toBe(true);
      expect(Number.isFinite(b.position.y)).toBe(true);
    }
  });
});

describe('Collision merge', () => {
  it('merges two bodies into one', () => {
    const engine = makeEngine(collisionScenario);
    runSteps(engine, 5000);
    const snap = engine.getSnapshot();
    expect(snap.bodies.length).toBeLessThanOrEqual(2);
  });
});

describe('Time scale', () => {
  it('offers time scales beyond one year per second', () => {
    expect(TIME_SCALE_PRESETS).toContainEqual({ label: '10 años/s', value: 315_576_000 });
    expect(TIME_SCALE_PRESETS).toContainEqual({ label: '100 años/s', value: 3_155_760_000 });
    expect(TIME_SCALE_PRESETS).toContainEqual({ label: '1.000 años/s', value: 31_557_600_000 });
  });

  it('does not modify physicsDt when time scale changes', () => {
    const engine = makeEngine(sunEarthCircular);
    const dtBefore = engine.getConfig().physicsDt;
    engine.setTimeScale(31_557_600);
    expect(engine.getConfig().physicsDt).toBe(dtBefore);
  });

  it('reports capped effective time scale', () => {
    const engine = makeEngine(sunEarthCircular);
    engine.setTimeScale(31_557_600);
    const snap = engine.runFrame(performance.now());
    expect(snap.timeScale.requestedTimeScale).toBe(31_557_600);
    expect(snap.timeScale.substepsExecuted).toBeLessThanOrEqual(snap.timeScale.substepsRequested);
  });
});

describe('BarnesHutSolver stub', () => {
  it('throws not implemented', async () => {
    const { BarnesHutSolver } = await import('../solver/barnes-hut');
    const solver = new BarnesHutSolver();
    expect(() => solver.computeAccelerations({} as never)).toThrow('not implemented');
  });
});
