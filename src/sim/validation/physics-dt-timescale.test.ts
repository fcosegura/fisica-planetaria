import { describe, expect, it } from 'vitest';
import { SimulationEngine, runSteps } from '../engine/simulation-engine';
import { scenarioToDocument } from '../scenarios';
import {
  earthMoon,
  kuiperBeltScenario,
  solarSystemWithMoons,
  sunEarthCircular,
} from '../scenarios/index';
import { createDocument } from '../document/simulation-document';
import {
  PHYSICS_DT_KUIPER,
  PHYSICS_DT_MOON_SYSTEM,
  hasCloseSatellites,
  resolvePhysicsDt,
} from '../config/physics-dt';
import { buildTimeScaleDisplay, formatEffectiveTimeScale } from '../time-scale/format';
import { bodyAroundParent, MOONS_CATALOG } from '../catalog/solar-system';
import type { CelestialBody } from '../types';

function makeEngine(scenario: typeof sunEarthCircular) {
  return new SimulationEngine({ document: scenarioToDocument(scenario) });
}

describe('physicsDt by scenario composition', () => {
  it('uses 7200 s for Kuiper without moons', () => {
    const engine = makeEngine(kuiperBeltScenario);
    expect(engine.getConfig().physicsDt).toBe(PHYSICS_DT_KUIPER);
    expect(hasCloseSatellites(kuiperBeltScenario.bodies)).toBe(false);
    expect(resolvePhysicsDt(kuiperBeltScenario.bodies, PHYSICS_DT_KUIPER)).toBe(
      PHYSICS_DT_KUIPER,
    );
  });

  it('keeps Earth–Moon at 300 s', () => {
    const engine = makeEngine(earthMoon);
    expect(engine.getConfig().physicsDt).toBe(300);
    expect(hasCloseSatellites(earthMoon.bodies)).toBe(true);
    expect(resolvePhysicsDt(earthMoon.bodies, 300)).toBe(300);
  });

  it('keeps moon-bearing solar system at 120 s', () => {
    const engine = makeEngine(solarSystemWithMoons);
    expect(engine.getConfig().physicsDt).toBe(PHYSICS_DT_MOON_SYSTEM);
    expect(hasCloseSatellites(solarSystemWithMoons.bodies)).toBe(true);
  });

  it('tightens Kuiper preferred dt when Charon is added', () => {
    const pluto = kuiperBeltScenario.bodies.find((b) => b.name === 'Plutón');
    expect(pluto).toBeDefined();
    const charonTpl = MOONS_CATALOG.find((m) => m.id === 'charon');
    expect(charonTpl).toBeDefined();
    const charon = bodyAroundParent(charonTpl!, pluto!, 0);
    const withMoon: CelestialBody[] = [...kuiperBeltScenario.bodies, charon];
    expect(hasCloseSatellites(withMoon)).toBe(true);
    expect(resolvePhysicsDt(withMoon, PHYSICS_DT_KUIPER)).toBe(PHYSICS_DT_MOON_SYSTEM);
  });
});

describe('requested vs effective time scale', () => {
  it('keeps requestedTimeScale and effectiveTimeScale as distinct fields', () => {
    const engine = makeEngine(sunEarthCircular);
    engine.setTimeScale(31_557_600_000);
    const snap = engine.runFrame(performance.now());
    expect(snap.timeScale.requestedTimeScale).toBe(31_557_600_000);
    expect(snap.timeScale.effectiveTimeScale).not.toBe(snap.timeScale.requestedTimeScale);
    expect(snap.timeScale.isCapped).toBe(true);
    expect(snap.timeScale.physicsDt).toBe(engine.getConfig().physicsDt);
  });

  it('does not mutate physicsDt when changing time scale or running frames', () => {
    const engine = makeEngine(kuiperBeltScenario);
    const dtBefore = engine.getConfig().physicsDt;
    engine.setTimeScale(3_155_760_000);
    engine.runFrame(performance.now());
    engine.runFrame(performance.now());
    expect(engine.getConfig().physicsDt).toBe(dtBefore);
    expect(engine.getSnapshot().timeScale.physicsDt).toBe(dtBefore);
  });

  it('reports capped when maxSubstepsPerFrame limits the frame', () => {
    const base = scenarioToDocument(sunEarthCircular);
    const doc = createDocument(base.name, base.bodies, {
      ...base.config,
      maxSubstepsPerFrame: 2,
      simulationTimeScale: 31_557_600,
    });
    const engine = new SimulationEngine({ document: doc });
    const snap = engine.runFrame();
    expect(snap.timeScale.isCapped).toBe(true);
    expect(snap.timeScale.capReason).toBe('maxSubsteps');
    expect(snap.timeScale.effectiveTimeScale).toBeLessThan(snap.timeScale.requestedTimeScale);
    expect(snap.timeScale.substepsExecuted).toBe(2);
  });

  it('updates requestedTimeScale immediately on setTimeScale', () => {
    const engine = makeEngine(sunEarthCircular);
    engine.setTimeScale(315_576_000);
    const snap = engine.getSnapshot();
    expect(snap.timeScale.requestedTimeScale).toBe(315_576_000);
    expect(snap.timeScale.physicsDt).toBe(engine.getConfig().physicsDt);
  });
});

describe('determinism', () => {
  it('produces identical positions for the same inputs', () => {
    const a = makeEngine(kuiperBeltScenario);
    const b = makeEngine(kuiperBeltScenario);
    runSteps(a, 50);
    runSteps(b, 50);
    const sa = a.getSnapshot();
    const sb = b.getSnapshot();
    expect(sa.bodies.length).toBe(sb.bodies.length);
    for (let i = 0; i < sa.bodies.length; i++) {
      expect(sa.bodies[i]!.position.x).toBe(sb.bodies[i]!.position.x);
      expect(sa.bodies[i]!.position.y).toBe(sb.bodies[i]!.position.y);
      expect(sa.bodies[i]!.velocity.x).toBe(sb.bodies[i]!.velocity.x);
      expect(sa.bodies[i]!.velocity.y).toBe(sb.bodies[i]!.velocity.y);
    }
  });
});

describe('TimeScale UI honesty', () => {
  it('does not present requested as achieved when capped', () => {
    const display = buildTimeScaleDisplay({
      requestedTimeScale: 31_557_600_000,
      effectiveTimeScale: 1_000_000,
      isCapped: true,
      capReason: 'budget',
    });
    expect(display.objectiveLine).toContain('Objetivo:');
    expect(display.objectiveLine).toContain('1.000 años/s');
    expect(display.realLine).toContain('Real:');
    expect(display.realLine).not.toContain('1.000 años/s');
    expect(display.realLine).toBe(
      `Real: ${formatEffectiveTimeScale(31_557_600_000, 1_000_000)}`,
    );
    expect(display.status).toBe('capped');
    expect(display.warning).toMatch(/LIMITADO/);
  });

  it('does not claim reached while idle (effective = 0)', () => {
    const display = buildTimeScaleDisplay({
      requestedTimeScale: 31_557_600,
      effectiveTimeScale: 0,
      isCapped: false,
      capReason: null,
    });
    expect(display.status).toBe('idle');
    expect(display.realLine).toBe('Real: —');
    expect(display.warning).toBeNull();
  });
});

describe('document rebuild uses resolvePhysicsDt', () => {
  it('applies moon-safe dt when rebuilding a Kuiper document with Charon', () => {
    const pluto = kuiperBeltScenario.bodies.find((b) => b.name === 'Plutón')!;
    const charon = bodyAroundParent(MOONS_CATALOG.find((m) => m.id === 'charon')!, pluto, 0);
    const bodies = [...kuiperBeltScenario.bodies, charon];
    const dt = resolvePhysicsDt(bodies, PHYSICS_DT_KUIPER);
    const base = scenarioToDocument(kuiperBeltScenario);
    const doc = createDocument('kuiper-with-charon', bodies, {
      ...base.config,
      physicsDt: dt,
    });
    const engine = new SimulationEngine({ document: doc });
    expect(engine.getConfig().physicsDt).toBe(PHYSICS_DT_MOON_SYSTEM);
  });
});
