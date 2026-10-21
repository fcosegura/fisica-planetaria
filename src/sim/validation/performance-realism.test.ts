import { describe, expect, it } from 'vitest';
import { AU, G, M_SUN } from '../constants';
import { SimulationEngine } from '../engine/simulation-engine';
import { OrbitalEngine } from '../engine/orbital-engine';
import { MAX_FRAME_WALL_SECONDS } from '../engine/frame-clock';
import { createDocument } from '../document/simulation-document';
import { MergeCollisionPolicy } from '../collision/merge';
import { DirectNBodySolver } from '../solver/direct-nbody';
import { createPhysicsStateFromBodies, type PhysicsState } from '../state/physics-state';
import {
  applySatelliteRecoil,
  bodyAroundParent,
  bodyFromSunOrbit,
  makeSunBody,
  MOONS_CATALOG,
  DWARF_PLANETS_CATALOG,
  PLANETS_CATALOG,
} from '../catalog/solar-system';
import {
  earthMoon,
  scenarioToDocument,
  solarSystemFull,
  solarSystemWithMoons,
  sunEarthCircular,
  sunSedna,
} from '../scenarios';
import { generatePhotoDiscPixels } from '../../render/body-textures';
import type { CelestialBody, ScenarioPreset, SimConfig } from '../types';

function docWith(scenario: ScenarioPreset, config: Partial<SimConfig>) {
  const base = scenarioToDocument(scenario);
  return createDocument(base.name, base.bodies, { ...base.config, ...config });
}

function body(id: string, mass: number, x: number, y: number, state: 'dynamic' | 'fixed' = 'dynamic'): CelestialBody {
  return {
    id,
    name: id,
    mass,
    radius: 1e6,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    state,
    visual: { color: '#fff', displayRadius: 3, showTrail: false, trailLength: 10 },
  };
}

/** Reference i/j loop equal to the pre-optimisation solver. */
function naiveAccelerations(state: PhysicsState, Gc = G): Float64Array {
  const out = new Float64Array(state.count * 2);
  for (let i = 0; i < state.count; i++) {
    if (state.meta[i]!.state === 'fixed') continue;
    for (let j = 0; j < state.count; j++) {
      if (i === j || !(state.mass[j]! > 0)) continue;
      const dx = state.position[j * 2]! - state.position[i * 2]!;
      const dy = state.position[j * 2 + 1]! - state.position[i * 2 + 1]!;
      const r2 = dx * dx + dy * dy;
      const invR3 = 1 / (r2 * Math.sqrt(r2));
      out[i * 2] += Gc * state.mass[j]! * dx * invR3;
      out[i * 2 + 1] += Gc * state.mass[j]! * dy * invR3;
    }
  }
  return out;
}

/** Osculating two-body eccentricity of `sat` about `parent` with μ = G(M + m). */
function relativeEccentricity(sat: CelestialBody, parent: CelestialBody): number {
  const rx = sat.position.x - parent.position.x;
  const ry = sat.position.y - parent.position.y;
  const vx = sat.velocity.x - parent.velocity.x;
  const vy = sat.velocity.y - parent.velocity.y;
  const mu = G * (sat.mass + parent.mass);
  const r = Math.hypot(rx, ry);
  const rv = rx * vx + ry * vy;
  const v2 = vx * vx + vy * vy;
  const ex = ((v2 - mu / r) * rx - rv * vx) / mu;
  const ey = ((v2 - mu / r) * ry - rv * vy) / mu;
  return Math.hypot(ex, ey);
}

describe('time scale follows real elapsed time', () => {
  it('honours low time scales instead of forcing one physicsDt per frame', () => {
    // dt = 120 s: the old loop advanced ≥ 120 s every frame → 7200× at "1×".
    const engine = new SimulationEngine({
      document: docWith(solarSystemWithMoons, { simulationTimeScale: 100 }),
    });
    const frames = 600; // 10 s of nominal 60 fps frames
    for (let i = 0; i < frames; i++) engine.runFrame();
    const snap = engine.getSnapshot();
    expect(snap.time).toBeGreaterThanOrEqual(1000 - 120);
    expect(snap.time).toBeLessThanOrEqual(1000);
    expect(snap.timeScale.isCapped).toBe(false);
    expect(snap.timeScale.effectiveTimeScale).toBe(100);
  });

  it('advances by measured frame time, independent of refresh rate', () => {
    const scale = 86_400;
    const run = (hz: number) => {
      const engine = new SimulationEngine({
        document: docWith(sunEarthCircular, { simulationTimeScale: scale }),
      });
      const t0 = 1_000;
      for (let i = 0; i <= hz; i++) engine.runFrame(t0 + (i * 1000) / hz);
      return engine.getSnapshot().time;
    };
    const dt = sunEarthCircular.config.physicsDt!;
    // One second of frames ≈ one simulated day (+ the nominal first frame).
    const expected = scale + scale / 60;
    expect(Math.abs(run(60) - expected)).toBeLessThanOrEqual(dt);
    expect(Math.abs(run(144) - expected)).toBeLessThanOrEqual(dt);
  });

  it('clamps long gaps (background tab, resume) instead of jumping ahead', () => {
    const scale = 31_557_600;
    const engine = new SimulationEngine({
      document: docWith(sunEarthCircular, { simulationTimeScale: scale }),
    });
    engine.runFrame(1_000);
    const before = engine.getSnapshot().time;
    engine.runFrame(11_000); // 10 s later
    const advanced = engine.getSnapshot().time - before;
    expect(advanced).toBeLessThanOrEqual(scale * MAX_FRAME_WALL_SECONDS);
  });

  it('orbital engine advances timeScale × elapsed wall time', () => {
    const scale = 31_557_600;
    const engine = new OrbitalEngine({
      document: docWith(sunSedna, { engineKind: 'orbital', simulationTimeScale: scale }),
    });
    engine.runFrame(1_000);
    const before = engine.getSnapshot().time;
    engine.runFrame(1_050);
    expect(engine.getSnapshot().time - before).toBeCloseTo(scale * 0.05, 3);
  });
});

describe('DirectNBodySolver pair-symmetric loop', () => {
  it('matches the naive i/j accelerations (fixed and massless bodies included)', () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    const bodies = [body('sun', M_SUN, 0, 0, 'fixed'), body('probe', 0, 3e10, -2e10)];
    for (let i = 0; i < 40; i++) {
      bodies.push(body(`b${i}`, 1e20 + rand() * 1e25, (rand() - 0.5) * 1e12, (rand() - 0.5) * 1e12));
    }
    const state = createPhysicsStateFromBodies(bodies);
    new DirectNBodySolver().computeAccelerations(state);
    const ref = naiveAccelerations(state);

    expect(state.acceleration[0]).toBe(0);
    expect(state.acceleration[1]).toBe(0);
    for (let k = 0; k < ref.length; k++) {
      const scale = Math.max(Math.abs(ref[k]!), 1e-30);
      expect(Math.abs(state.acceleration[k]! - ref[k]!) / scale).toBeLessThan(1e-10);
    }
  });
});

describe('MergeCollisionPolicy squared-distance test', () => {
  it('never merges a body whose position is NaN', () => {
    const state = createPhysicsStateFromBodies([body('a', 1e24, 0, 0), body('b', 1e24, Number.NaN, 0)]);
    expect(new MergeCollisionPolicy().resolve(state, 1)).toBe(false);
    expect(state.count).toBe(2);
  });

  it('still merges overlapping bodies', () => {
    const state = createPhysicsStateFromBodies([body('a', 1e24, 0, 0), body('b', 1e24, 1.5e6, 0)]);
    expect(new MergeCollisionPolicy().resolve(state, 1)).toBe(true);
    expect(state.count).toBe(1);
  });
});

describe('satellite initial conditions', () => {
  it('starts moons with their catalog eccentricity (μ = G(M + m))', () => {
    const bodies = solarSystemFull.bodies;
    const byName = (n: string) => bodies.find((b) => b.name === n)!;
    // Charon/Pluto ≈ 0.12: with μ = GM_Pluto the "circular" orbit started at e ≈ 0.11.
    expect(relativeEccentricity(byName('Caronte'), byName('Plutón'))).toBeLessThan(1e-6);
    expect(relativeEccentricity(byName('Luna'), byName('Tierra'))).toBeCloseTo(0.0554, 4);
    expect(relativeEccentricity(byName('Ío'), byName('Júpiter'))).toBeCloseTo(0.004, 4);
  });

  it('keeps the planet–moon barycentre on the planet’s original orbit', () => {
    const earthTpl = PLANETS_CATALOG.find((p) => p.id === 'earth')!;
    const earth = bodyFromSunOrbit(earthTpl);
    const moon = bodyAroundParent(MOONS_CATALOG.find((m) => m.id === 'moon')!, earth);
    const [, e2, m2] = applySatelliteRecoil([makeSunBody(), earth, moon]);
    const M = e2!.mass + m2!.mass;
    const cmvx = (e2!.mass * e2!.velocity.x + m2!.mass * m2!.velocity.x) / M;
    const cmvy = (e2!.mass * e2!.velocity.y + m2!.mass * m2!.velocity.y) / M;
    const cmx = (e2!.mass * e2!.position.x + m2!.mass * m2!.position.x) / M;
    expect(cmvx).toBeCloseTo(earth.velocity.x, 6);
    expect(cmvy).toBeCloseTo(earth.velocity.y, 6);
    expect(cmx).toBeCloseTo(earth.position.x, 0);
    // The relative orbit is untouched.
    expect(relativeEccentricity(m2!, e2!)).toBeCloseTo(relativeEccentricity(moon, earth), 12);
  });

  it('applies recoil once per satellite and never moves a fixed parent', () => {
    const pluto = bodyFromSunOrbit(DWARF_PLANETS_CATALOG.find((d) => d.id === 'pluto')!);
    const charon = bodyAroundParent(MOONS_CATALOG.find((m) => m.id === 'charon')!, pluto);
    const once = applySatelliteRecoil([pluto, charon]);
    const again = applySatelliteRecoil(once, new Set());
    expect(again[0]!.velocity).toEqual(once[0]!.velocity);

    const fixedPluto = { ...pluto, state: 'fixed' as const };
    const [p] = applySatelliteRecoil([fixedPluto, { ...charon, parentId: fixedPluto.id }]);
    expect(p!.velocity).toEqual(pluto.velocity);
  });

  it('Earth–Moon preset keeps the Earth near its 1 AU orbit after a year', () => {
    const engine = new SimulationEngine({ document: scenarioToDocument(earthMoon) });
    const steps = Math.round((365.25 * 86400) / earthMoon.config.physicsDt!);
    for (let i = 0; i < steps; i++) engine.stepOnce();
    const bodies = engine.getSnapshot().bodies;
    const earth = bodies.find((b) => b.name === 'Tierra')!;
    const moon = bodies.find((b) => b.name === 'Luna')!;
    const rAu = Math.hypot(earth.position.x, earth.position.y) / AU;
    expect(rAu).toBeGreaterThan(0.97);
    expect(rAu).toBeLessThan(1.03);
    // Solar tides perturb the lunar orbit, but it stays bound and near-circular.
    expect(relativeEccentricity(moon, earth)).toBeLessThan(0.1);
  });
});

describe('photo disc lighting is rotation-equivariant', () => {
  it('disc at light angle θ equals the θ = 0 disc rotated by θ', () => {
    const width = 128;
    const height = 64;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        pixels[idx] = 128 + 100 * Math.sin((x / width) * Math.PI * 2);
        pixels[idx + 1] = 128 + 100 * Math.cos((y / height) * Math.PI);
        pixels[idx + 2] = 90;
        pixels[idx + 3] = 255;
      }
    }
    const tex = { path: 'synthetic', width, height, pixels };
    const size = 64;
    const theta = 1.1;
    const lit = generatePhotoDiscPixels(tex, theta, false, size);
    const base = generatePhotoDiscPixels(tex, 0, false, size);
    const R = size / 2;

    let compared = 0;
    let maxDiff = 0;
    for (let y = 4; y < size - 4; y += 3) {
      for (let x = 4; x < size - 4; x += 3) {
        const dx = x - R + 0.5;
        const dy = y - R + 0.5;
        if (dx * dx + dy * dy > (R - 3) ** 2) continue;
        // Math coords (y up): rotate the normal by −θ to find the source pixel.
        const u = dx;
        const v = -dy;
        const su = u * Math.cos(theta) + v * Math.sin(theta);
        const sv = -u * Math.sin(theta) + v * Math.cos(theta);
        const sx = Math.floor(su + R);
        const sy = Math.floor(-sv + R);
        const a = (y * size + x) * 4;
        const b = (sy * size + sx) * 4;
        maxDiff = Math.max(maxDiff, Math.abs(lit[a]! - base[b]!), Math.abs(lit[a + 1]! - base[b + 1]!));
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(100);
    // Only pixel-grid resampling differs.
    expect(maxDiff).toBeLessThan(30);
  });
});

describe('MergeCollisionPolicy sweep-and-prune broad phase', () => {
  it('finds an overlap separated in x-order by a non-overlapping body', () => {
    // Sorted by x − r: big (−10), far (4.9), small (9.4). big–small overlap.
    const big = { ...body('big', 1e24, 0, 0), radius: 10 };
    const far = { ...body('far', 1e20, 5, 100), radius: 0.1 };
    const small = { ...body('small', 1e20, 9.5, 0), radius: 0.1 };
    const state = createPhysicsStateFromBodies([small, far, big]);
    expect(new MergeCollisionPolicy().resolve(state, 1)).toBe(true);
    expect(state.count).toBe(2);
  });

  it('agrees with a brute-force overlap test on random layouts', () => {
    let seed = 99;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    const policy = new MergeCollisionPolicy();
    for (let trial = 0; trial < 200; trial++) {
      const bodies = Array.from({ length: 12 }, (_, i) => ({
        ...body(`r${i}`, 1e20, rand() * 100, rand() * 100),
        radius: rand() * 6,
      }));
      let expected = false;
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const d = Math.hypot(
            bodies[i]!.position.x - bodies[j]!.position.x,
            bodies[i]!.position.y - bodies[j]!.position.y,
          );
          if (d < bodies[i]!.radius + bodies[j]!.radius) expected = true;
        }
      }
      const state = createPhysicsStateFromBodies(bodies);
      expect(policy.resolve(state, 1)).toBe(expected);
    }
  });
});
