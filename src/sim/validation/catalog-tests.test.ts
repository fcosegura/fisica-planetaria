import { describe, expect, it } from 'vitest';
import { AU, M_SUN } from '../constants';
import {
  ASTEROIDS_CATALOG,
  COMETS_CATALOG,
  DWARF_PLANETS_CATALOG,
  MOONS_CATALOG,
  PLANETS_CATALOG,
  SOLAR_SYSTEM_CATALOG,
  bodyAroundParent,
  bodyFromSunOrbit,
  circularOrbitSpeed,
  perihelionRadius,
  perihelionSpeed,
  createAsteroidBeltSwarm,
  createEverythingKnownSolarSystem,
  createKuiperBeltSwarm,
  createMoonsForPlanets,
  createSolarSystemBodies,
  findFreeOrbitRadius,
  makeCustomBodyAtOrbit,
  makeSunBody,
} from '../catalog/solar-system';
import { displayRadiusFromPhysical } from '../visual/display-radius';
import { SimulationEngine, runSteps } from '../engine/simulation-engine';
import { createDocument } from '../document/simulation-document';
import { scenarioToDocument, solarSystem, solarSystemFull, asteroidBeltScenario, kuiperBeltScenario } from '../scenarios';

describe('Solar system catalog', () => {
  it('places heliocentric bodies at perihelion with vis-viva speed', () => {
    for (const p of SOLAR_SYSTEM_CATALOG.filter((x) => x.parent === 'sun')) {
      const body = bodyFromSunOrbit(p, 0);
      const q = perihelionRadius(p.orbitRadius, p.eccentricity);
      expect(Math.hypot(body.position.x, body.position.y)).toBeCloseTo(q, -3);
      expect(Math.hypot(body.velocity.x, body.velocity.y)).toBeCloseTo(
        perihelionSpeed(M_SUN, p.orbitRadius, p.eccentricity),
        0,
      );
      expect(body.mass).toBeGreaterThan(0);
      expect(body.radius).toBeGreaterThan(0);
    }
  });

  it('stores published eccentricities for every orbiting catalog body', () => {
    for (const p of SOLAR_SYSTEM_CATALOG) {
      expect(p.eccentricity, p.id).toBeTypeOf('number');
      expect(p.eccentricity!, p.id).toBeGreaterThanOrEqual(0);
      expect(p.eccentricity!, p.id).toBeLessThan(1);
    }
    expect(PLANETS_CATALOG.find((p) => p.id === 'mercury')!.eccentricity).toBeCloseTo(0.20563, 4);
    expect(PLANETS_CATALOG.find((p) => p.id === 'earth')!.eccentricity).toBeCloseTo(0.01671, 4);
    expect(DWARF_PLANETS_CATALOG.find((d) => d.id === 'pluto')!.eccentricity).toBeCloseTo(0.2488, 3);
    expect(MOONS_CATALOG.find((m) => m.id === 'nereid')!.eccentricity).toBeCloseTo(0.751, 3);
    expect(COMETS_CATALOG.find((c) => c.id === 'halley')!.eccentricity).toBeCloseTo(0.967, 3);
  });

  it('places Sedna at perihelion of a highly eccentric ellipse', () => {
    const sednaTpl = DWARF_PLANETS_CATALOG.find((d) => d.id === 'sedna')!;
    expect(sednaTpl.eccentricity).toBeGreaterThan(0.8);
    expect(sednaTpl.orbitRadius / AU).toBeCloseTo(506.8, 1);

    const body = bodyFromSunOrbit(sednaTpl, 0);
    const r = Math.hypot(body.position.x, body.position.y);
    const perihelion = sednaTpl.orbitRadius * (1 - sednaTpl.eccentricity!);
    const aphelion = sednaTpl.orbitRadius * (1 + sednaTpl.eccentricity!);
    expect(r / AU).toBeCloseTo(perihelion / AU, 1);
    expect(r).toBeLessThan(80 * AU);
    expect(aphelion).toBeGreaterThan(900 * AU);

    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    expect(speed).toBeCloseTo(perihelionSpeed(M_SUN, sednaTpl.orbitRadius, sednaTpl.eccentricity), 0);
    expect(speed).toBeGreaterThan(circularOrbitSpeed(M_SUN, perihelion));
  });

  it('creates base solar system with 9 bodies (sun + 8)', () => {
    const bodies = createSolarSystemBodies(false);
    expect(bodies).toHaveLength(9);
    expect(bodies[0]!.name).toBe('Sol');
    expect(bodies[0]!.state).toBe('fixed');
  });

  it('contains expected categories and elements in sub-catalogs', () => {
    expect(PLANETS_CATALOG.length).toBe(8);
    expect(MOONS_CATALOG.length).toBeGreaterThanOrEqual(20);
    expect(DWARF_PLANETS_CATALOG.length).toBeGreaterThanOrEqual(10);
    expect(ASTEROIDS_CATALOG.length).toBeGreaterThanOrEqual(10);
    expect(COMETS_CATALOG.length).toBeGreaterThanOrEqual(3);
  });

  it('places moons around parent bodies correctly', () => {
    const jupiterTpl = PLANETS_CATALOG.find((p) => p.id === 'jupiter')!;
    const jupiter = bodyFromSunOrbit(jupiterTpl, 0);
    const ioTpl = MOONS_CATALOG.find((m) => m.id === 'io')!;
    const io = bodyAroundParent(ioTpl, jupiter, 0);

    // Distance to Jupiter should match Io orbit radius
    const distToJupiter = Math.hypot(io.position.x - jupiter.position.x, io.position.y - jupiter.position.y);
    expect(distToJupiter).toBeCloseTo(perihelionRadius(ioTpl.orbitRadius, ioTpl.eccentricity), -3);

    const relVx = io.velocity.x - jupiter.velocity.x;
    const relVy = io.velocity.y - jupiter.velocity.y;
    const relSpeed = Math.hypot(relVx, relVy);
    expect(relSpeed).toBeCloseTo(perihelionSpeed(jupiter.mass, ioTpl.orbitRadius, ioTpl.eccentricity), -1);
  });

  it('handles retrograde orbits correctly (e.g. Triton)', () => {
    const neptuneTpl = PLANETS_CATALOG.find((p) => p.id === 'neptune')!;
    const neptune = bodyFromSunOrbit(neptuneTpl, 0);
    const tritonTpl = MOONS_CATALOG.find((m) => m.id === 'triton')!;
    expect(tritonTpl.retrograde).toBe(true);

    const triton = bodyAroundParent(tritonTpl, neptune, 0);
    // At phase 0 (on +x axis), a prograde body has +vy rel; retrograde has -vy rel
    const relVy = triton.velocity.y - neptune.velocity.y;
    expect(relVy).toBeLessThan(0);
  });

  it('generates deterministic asteroid belt and Kuiper belt swarms', () => {
    const astSwarm = createAsteroidBeltSwarm(30);
    expect(astSwarm).toHaveLength(30);
    for (const a of astSwarm) {
      const rAu = Math.hypot(a.position.x, a.position.y) / AU;
      expect(rAu).toBeGreaterThanOrEqual(2.1);
      expect(rAu).toBeLessThanOrEqual(3.3);
      expect(Number.isFinite(a.velocity.x)).toBe(true);
      expect(Number.isFinite(a.velocity.y)).toBe(true);
    }

    const kuiperSwarm = createKuiperBeltSwarm(20);
    expect(kuiperSwarm).toHaveLength(20);
    for (const k of kuiperSwarm) {
      const rAu = Math.hypot(k.position.x, k.position.y) / AU;
      expect(rAu).toBeGreaterThanOrEqual(30.0);
      expect(rAu).toBeLessThanOrEqual(49.0);
    }
  });

  it('createMoonsForPlanets adds moons for all existing planets', () => {
    const earth = bodyFromSunOrbit(PLANETS_CATALOG.find((p) => p.id === 'earth')!);
    const jupiter = bodyFromSunOrbit(PLANETS_CATALOG.find((p) => p.id === 'jupiter')!);
    const moons = createMoonsForPlanets([earth, jupiter]);

    const moonNames = moons.map((m) => m.name);
    expect(moonNames).toContain('Luna');
    expect(moonNames).toContain('Ío');
    expect(moonNames).toContain('Europa (Luna)');
    expect(moonNames).toContain('Ganimedes');
    expect(moonNames).toContain('Calisto');
  });

  it('creates full known solar system with all categories populated', () => {
    const everything = createEverythingKnownSolarSystem();
    expect(everything.length).toBeGreaterThanOrEqual(80);

    const names = new Set(everything.map((b) => b.name));
    // Check Sun, planets
    expect(names.has('Sol')).toBe(true);
    expect(names.has('Tierra')).toBe(true);
    expect(names.has('Júpiter')).toBe(true);
    // Check Moons
    expect(names.has('Luna')).toBe(true);
    expect(names.has('Titán')).toBe(true);
    expect(names.has('Tritón')).toBe(true);
    // Check Dwarf planets
    expect(names.has('Plutón')).toBe(true);
    expect(names.has('Ceres')).toBe(true);
    expect(names.has('Eris')).toBe(true);
    expect(names.has('Sedna')).toBe(true);
    // Check Asteroids
    expect(names.has('Vesta')).toBe(true);
    expect(names.has('Palas')).toBe(true);
    // Check Comets
    expect(names.has('Cometa Halley')).toBe(true);

    for (const b of everything) {
      expect(Number.isFinite(b.position.x)).toBe(true);
      expect(Number.isFinite(b.position.y)).toBe(true);
      expect(Number.isFinite(b.velocity.x)).toBe(true);
      expect(Number.isFinite(b.velocity.y)).toBe(true);
      expect(b.mass).toBeGreaterThan(0);
      expect(b.radius).toBeGreaterThan(0);
    }
  });

  it('anchors added moons to the existing parent bodies', () => {
    const existingBodies = createSolarSystemBodies(false);
    const existingJupiter = existingBodies.find((b) => b.name === 'Júpiter')!;
    existingJupiter.position.x += 0.25 * AU;
    existingJupiter.position.y -= 0.1 * AU;
    existingJupiter.velocity.x += 1_250;
    existingJupiter.velocity.y -= 800;

    const allKnown = createEverythingKnownSolarSystem({
      includeMoons: true,
      includeDwarfPlanets: true,
      includeAsteroids: false,
      includeAsteroidSwarm: false,
      includeKBOs: false,
      includeKuiperSwarm: false,
      includeComets: false,
      anchorBodies: existingBodies,
    });
    const io = allKnown.find((b) => b.name === 'Ío')!;
    const ioTemplate = MOONS_CATALOG.find((m) => m.id === 'io')!;

    expect(Math.hypot(io.position.x - existingJupiter.position.x, io.position.y - existingJupiter.position.y))
      .toBeCloseTo(perihelionRadius(ioTemplate.orbitRadius, ioTemplate.eccentricity), -3);
    expect(Math.hypot(io.velocity.x - existingJupiter.velocity.x, io.velocity.y - existingJupiter.velocity.y))
      .toBeCloseTo(perihelionSpeed(existingJupiter.mass, ioTemplate.orbitRadius, ioTemplate.eccentricity), -1);
  });

  it('custom body finds a free orbit not at 1 AU if Earth is present', () => {
    const earth = bodyFromSunOrbit(PLANETS_CATALOG.find((p) => p.id === 'earth')!);
    const custom = makeCustomBodyAtOrbit([makeSunBody(), earth]);
    const rAu = Math.hypot(custom.position.x, custom.position.y) / AU;
    expect(Math.abs(rAu - 1)).toBeGreaterThan(0.1);
  });

  it('findFreeOrbitRadius skips occupied slots', () => {
    const occupied = [makeSunBody(), bodyFromSunOrbit(PLANETS_CATALOG.find((p) => p.id === 'earth')!)];
    const r = findFreeOrbitRadius(occupied, 0.5, 0.5);
    expect(Math.abs(r / AU - 1)).toBeGreaterThan(0.1);
  });
});

describe('Display radius', () => {
  it('orders sizes Moon < Earth < Jupiter < Sun', () => {
    const moon = displayRadiusFromPhysical(1.737e6);
    const earth = displayRadiusFromPhysical(6.371e6);
    const jupiter = displayRadiusFromPhysical(6.991e7);
    const sun = displayRadiusFromPhysical(6.96e8, true);
    expect(moon).toBeLessThan(earth);
    expect(earth).toBeLessThan(jupiter);
    expect(jupiter).toBeLessThan(sun);
  });
});

describe('Solar system scenarios', () => {
  it('runs standard solar system without NaN for 500 steps', () => {
    const engine = new SimulationEngine({ document: scenarioToDocument(solarSystem) });
    runSteps(engine, 500);
    const snap = engine.getSnapshot();
    expect(snap.bodies.length).toBe(9);
    for (const b of snap.bodies) {
      expect(Number.isFinite(b.position.x)).toBe(true);
      expect(Number.isFinite(b.position.y)).toBe(true);
    }
  });

  it('runs full solar system scenario without NaN for 200 steps', () => {
    const engine = new SimulationEngine({ document: scenarioToDocument(solarSystemFull) });
    runSteps(engine, 200);
    const snap = engine.getSnapshot();
    expect(snap.bodies.length).toBeGreaterThanOrEqual(80);
    for (const b of snap.bodies) {
      expect(Number.isFinite(b.position.x)).toBe(true);
      expect(Number.isFinite(b.position.y)).toBe(true);
    }
    expect(Number.isFinite(snap.diagnostics.totalEnergy)).toBe(true);
  });

  it('runs asteroid belt scenario without NaN', () => {
    const engine = new SimulationEngine({ document: scenarioToDocument(asteroidBeltScenario) });
    runSteps(engine, 200);
    const snap = engine.getSnapshot();
    expect(snap.bodies.length).toBeGreaterThan(40);
    for (const b of snap.bodies) {
      expect(Number.isFinite(b.position.x)).toBe(true);
    }
  });

  it('runs Kuiper belt scenario without NaN', () => {
    const engine = new SimulationEngine({ document: scenarioToDocument(kuiperBeltScenario) });
    runSteps(engine, 200);
    const snap = engine.getSnapshot();
    expect(snap.bodies.length).toBeGreaterThan(30);
    for (const b of snap.bodies) {
      expect(Number.isFinite(b.position.x)).toBe(true);
    }
  });

  it('keeps Galilean moons stably bound around Jupiter with appropriate physicsDt', () => {
    const sun = makeSunBody();
    const jupiterTpl = PLANETS_CATALOG.find((p) => p.id === 'jupiter')!;
    const jupiter = bodyFromSunOrbit(jupiterTpl, 0);
    const ioTpl = MOONS_CATALOG.find((m) => m.id === 'io')!;
    const europaTpl = MOONS_CATALOG.find((m) => m.id === 'europa_moon')!;
    const ganymedeTpl = MOONS_CATALOG.find((m) => m.id === 'ganymede')!;
    const callistoTpl = MOONS_CATALOG.find((m) => m.id === 'callisto')!;

    const io = bodyAroundParent(ioTpl, jupiter, 0);
    const europa = bodyAroundParent(europaTpl, jupiter, Math.PI / 2);
    const ganymede = bodyAroundParent(ganymedeTpl, jupiter, Math.PI);
    const callisto = bodyAroundParent(callistoTpl, jupiter, (3 * Math.PI) / 2);

    const doc = createDocument('jupiter-system', [sun, jupiter, io, europa, ganymede, callisto], {
      physicsDt: 120,
    });
    const engine = new SimulationEngine({ document: doc });
    // 5 days = 5 * 86400 / 120 = 3600 steps
    runSteps(engine, 3600);
    const snap = engine.getSnapshot();
    const jupNow = snap.bodies.find((b) => b.name === 'Júpiter')!;
    const ioNow = snap.bodies.find((b) => b.name === 'Ío')!;
    const dist = Math.hypot(ioNow.position.x - jupNow.position.x, ioNow.position.y - jupNow.position.y);
    expect(dist).toBeGreaterThan(ioTpl.orbitRadius * 0.9);
    expect(dist).toBeLessThan(ioTpl.orbitRadius * 1.1);
  });
});
