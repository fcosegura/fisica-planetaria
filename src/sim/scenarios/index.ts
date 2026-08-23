import { AU, G, M_EARTH, M_SUN } from '../constants';
import type { CelestialBody, ScenarioPreset } from '../types';
import { createDocument } from '../document/simulation-document';
import {
  bodyFromSunOrbit,
  bodyMoonAroundEarth,
  createAsteroidBeltSwarm,
  createEverythingKnownSolarSystem,
  createKuiperBeltSwarm,
  createSolarSystemBodies,
  makeSunBody,
  makeVisual,
  ASTEROIDS_CATALOG,
  DWARF_PLANETS_CATALOG,
  KBOS_CATALOG,
  MOONS_CATALOG,
  PLANETS_CATALOG,
  SOLAR_SYSTEM_CATALOG,
  bodyAroundParent,
} from '../catalog/solar-system';

let bodyIdCounter = 0;
export function nextBodyId(prefix = 'body'): string {
  bodyIdCounter += 1;
  return `${prefix}-${bodyIdCounter}`;
}

export function resetBodyIdCounter(): void {
  bodyIdCounter = 0;
}

export const sunEarthCircular: ScenarioPreset = {
  id: 'sun-earth-circular',
  name: 'Sol — Tierra (circular)',
  description: 'Órbita circular a 1 AU',
  config: { physicsDt: 3600, simulationTimeScale: 86_400 },
  bodies: [
    makeSunBody(),
    bodyFromSunOrbit({
      ...SOLAR_SYSTEM_CATALOG.find((p) => p.id === 'earth')!,
      eccentricity: 0,
    }),
  ],
};

export const sunEarthElliptic: ScenarioPreset = {
  id: 'sun-earth-elliptic',
  name: 'Sol — Tierra (elíptica)',
  description: 'Órbita elíptica con v = 0.9 × v_circular',
  config: { physicsDt: 1800, simulationTimeScale: 86_400 },
  bodies: (() => {
    const sun = makeSunBody();
    const earth = bodyFromSunOrbit({
      ...SOLAR_SYSTEM_CATALOG.find((p) => p.id === 'earth')!,
      eccentricity: 0,
    });
    earth.velocity.x *= 0.9;
    earth.velocity.y *= 0.9;
    return [sun, earth];
  })(),
};

export const earthMoon: ScenarioPreset = {
  id: 'earth-moon',
  name: 'Tierra — Luna',
  description: 'Sistema jerárquico Sol-Tierra-Luna',
  config: { physicsDt: 300, simulationTimeScale: 86_400 },
  bodies: (() => {
    const sun = makeSunBody();
    const earth = bodyFromSunOrbit(SOLAR_SYSTEM_CATALOG.find((p) => p.id === 'earth')!);
    const moon = bodyMoonAroundEarth(earth);
    return [sun, earth, moon];
  })(),
};

export const solarSystem: ScenarioPreset = {
  id: 'solar-system',
  name: 'Sistema solar (8 planetas)',
  description: 'Sol + 8 planetas en órbitas keplerianas (semieje y excentricidad reales)',
  config: { physicsDt: 3600, simulationTimeScale: 2_592_000 },
  bodies: createSolarSystemBodies(false),
};

export const solarSystemFull: ScenarioPreset = {
  id: 'solar-system-full',
  name: '🌟 Sistema solar completo (todo lo conocido)',
  description: 'Sol, 8 planetas, lunas principales, planetas enanos, asteroides, KBOs, cometas y cinturones',
  config: { physicsDt: 120, simulationTimeScale: 2_592_000 },
  bodies: createEverythingKnownSolarSystem({
    includeMoons: true,
    includeDwarfPlanets: true,
    includeAsteroids: true,
    includeAsteroidSwarm: true,
    includeKBOs: true,
    includeKuiperSwarm: true,
    includeComets: true,
  }),
};

export const solarSystemWithMoons: ScenarioPreset = {
  id: 'solar-system-moons',
  name: 'Sistema solar con lunas principales',
  description: 'Sol + 8 planetas + lunas principales (Luna, Galileanas, Titán, Tritón...)',
  config: { physicsDt: 120, simulationTimeScale: 864_000 },
  bodies: (() => {
    const sun = makeSunBody();
    const planets = PLANETS_CATALOG.map((p, i) =>
      bodyFromSunOrbit(p, (i * Math.PI) / 4.5),
    );
    const bodies: CelestialBody[] = [sun, ...planets];

    for (const p of planets) {
      const parentId = p.name === 'Tierra'
        ? 'earth'
        : p.name === 'Marte'
          ? 'mars'
          : p.name === 'Júpiter'
            ? 'jupiter'
            : p.name === 'Saturno'
              ? 'saturn'
              : p.name === 'Urano'
                ? 'uranus'
                : p.name === 'Neptuno'
                  ? 'neptune'
                  : '';
      if (!parentId) continue;

      const moonsForPlanet = MOONS_CATALOG.filter((m) => m.parent === parentId);
      moonsForPlanet.forEach((m, idx) => {
        const phase = (idx * Math.PI) / 3;
        bodies.push(bodyAroundParent(m, p, phase));
      });
    }

    return bodies;
  })(),
};

export const asteroidBeltScenario: ScenarioPreset = {
  id: 'asteroid-belt',
  name: 'Cinturón de asteroides',
  description: 'Sol, planetas interiores, Júpiter, asteroides principales (Ceres, Vesta...) y enjambre',
  config: { physicsDt: 3600, simulationTimeScale: 2_592_000 },
  bodies: (() => {
    const sun = makeSunBody();
    const interiorAndJup = PLANETS_CATALOG.filter((p) =>
      ['mercury', 'venus', 'earth', 'mars', 'jupiter'].includes(p.id),
    ).map((p, i) => bodyFromSunOrbit(p, (i * Math.PI) / 3));

    const majorAsteroids = ASTEROIDS_CATALOG.map((a, i) =>
      bodyFromSunOrbit(a, (i * Math.PI) / 4 + 0.5),
    );
    const ceres = bodyFromSunOrbit(
      DWARF_PLANETS_CATALOG.find((d) => d.id === 'ceres')!,
      0.2,
    );

    return [
      sun,
      ...interiorAndJup,
      ceres,
      ...majorAsteroids,
      ...createAsteroidBeltSwarm(40),
    ];
  })(),
};

export const kuiperBeltScenario: ScenarioPreset = {
  id: 'kuiper-belt',
  name: 'Cinturón de Kuiper y planetas enanos',
  description: 'Sol, gigantes exteriores, Plutón, Eris, Haumea, Makemake, Sedna (órbita elíptica) y enjambre KBO',
  config: { physicsDt: 7200, simulationTimeScale: 31_557_600 },
  bodies: (() => {
    const sun = makeSunBody();
    const giants = PLANETS_CATALOG.filter((p) =>
      ['jupiter', 'saturn', 'uranus', 'neptune'].includes(p.id),
    ).map((p, i) => bodyFromSunOrbit(p, (i * Math.PI) / 2.5));

    const dwarfs = DWARF_PLANETS_CATALOG.filter((d) => d.id !== 'ceres').map((d, i) =>
      bodyFromSunOrbit(d, (i * Math.PI) / 4 + 0.3),
    );

    const kbos = KBOS_CATALOG.map((k, i) =>
      bodyFromSunOrbit(k, (i * Math.PI) / 2 + 1),
    );

    return [
      sun,
      ...giants,
      ...dwarfs,
      ...kbos,
      ...createKuiperBeltSwarm(30),
    ];
  })(),
};

export const sunSedna: ScenarioPreset = {
  id: 'sun-sedna',
  name: 'Sol — Sedna',
  description:
    'Órbita kepleriana de Sedna (a ≈ 506.8 AU, e ≈ 0.855, periodo ≈ 11 400 años). Validación del motor orbital.',
  config: { physicsDt: 7200, simulationTimeScale: 31_557_600 },
  bodies: [
    makeSunBody(),
    bodyFromSunOrbit(DWARF_PLANETS_CATALOG.find((d) => d.id === 'sedna')!),
  ],
};

export const binarySystem: ScenarioPreset = {
  id: 'binary',
  name: 'Sistema binario',
  description: 'Dos estrellas de masa igual en órbita alrededor del CM',
  config: { physicsDt: 600, simulationTimeScale: 1000 },
  bodies: (() => {
    const m = M_SUN;
    const separation = 1e11;
    const halfSep = separation / 2;
    const v = Math.sqrt((G * m) / (4 * halfSep));
    return [
      {
        id: nextBodyId('star-a'),
        name: 'Estrella A',
        mass: m,
        radius: 6.96e8,
        position: { x: -halfSep, y: 0 },
        velocity: { x: 0, y: -v },
        state: 'dynamic',
        visual: makeVisual('#fde047', 6.96e8, true),
      },
      {
        id: nextBodyId('star-b'),
        name: 'Estrella B',
        mass: m,
        radius: 6.96e8,
        position: { x: halfSep, y: 0 },
        velocity: { x: 0, y: v },
        state: 'dynamic',
        visual: makeVisual('#fb923c', 6.96e8, true),
      },
    ] satisfies CelestialBody[];
  })(),
};

export const threeBodyLagrange: ScenarioPreset = {
  id: 'three-body',
  name: 'Tres cuerpos (equilátero)',
  description: 'Configuración equilátera rotante (aproximación)',
  config: { physicsDt: 120, simulationTimeScale: 100 },
  bodies: (() => {
    const m = M_SUN;
    const side = 1e11;
    const h = (side * Math.sqrt(3)) / 2;
    const cx = side / 2;
    const cy = h / 3;
    const omega = Math.sqrt((G * m) / side ** 3);
    const positions = [
      { x: 0, y: 0 },
      { x: side, y: 0 },
      { x: side / 2, y: h },
    ];
    const colors = ['#ef4444', '#22c55e', '#8b5cf6'];
    return positions.map((p, i) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const r = Math.hypot(dx, dy);
      const v = r * omega;
      return {
        id: nextBodyId(`body-${i}`),
        name: `Cuerpo ${i + 1}`,
        mass: m,
        radius: 1e8,
        position: p,
        velocity: { x: (-dy / r) * v, y: (dx / r) * v },
        state: 'dynamic' as const,
        visual: makeVisual(colors[i]!, 1e8),
      };
    });
  })(),
};

export const escapeScenario: ScenarioPreset = {
  id: 'escape',
  name: 'Escape',
  description: 'Velocidad superior a la de escape',
  config: { physicsDt: 600, simulationTimeScale: 10_000 },
  bodies: (() => {
    const vEsc = Math.sqrt((2 * G * M_SUN) / AU);
    return [
      makeSunBody(),
      {
        id: nextBodyId('probe'),
        name: 'Sonda',
        mass: 1e22,
        radius: 1e6,
        position: { x: AU, y: 0 },
        velocity: { x: 0, y: vEsc * 1.1 },
        state: 'dynamic' as const,
        visual: makeVisual('#f472b6', 1e6),
      },
    ];
  })(),
};

export const radialFall: ScenarioPreset = {
  id: 'radial-fall',
  name: 'Caída radial',
  description: 'Cuerpo en reposo cayendo hacia el Sol',
  config: { physicsDt: 60, simulationTimeScale: 1000, collisionMode: 'merge' },
  bodies: [
    makeSunBody(),
    {
      id: nextBodyId('probe'),
      name: 'Sonda',
      mass: 1e22,
      radius: 1e6,
      position: { x: AU, y: 0 },
      velocity: { x: 0, y: 0 },
      state: 'dynamic',
      visual: makeVisual('#a78bfa', 1e6),
    },
  ],
};

export const collisionScenario: ScenarioPreset = {
  id: 'collision',
  name: 'Colisión',
  description: 'Dos cuerpos en encuentro frontal',
  config: { physicsDt: 10, simulationTimeScale: 100, collisionMode: 'merge' },
  bodies: [
    {
      id: nextBodyId('a'),
      name: 'Cuerpo A',
      mass: M_EARTH,
      radius: 6.371e6,
      position: { x: -1e7, y: 0 },
      velocity: { x: 500, y: 0 },
      state: 'dynamic',
      visual: makeVisual('#3b82f6', 6.371e6),
    },
    {
      id: nextBodyId('b'),
      name: 'Cuerpo B',
      mass: M_EARTH,
      radius: 6.371e6,
      position: { x: 1e7, y: 0 },
      velocity: { x: -500, y: 0 },
      state: 'dynamic',
      visual: makeVisual('#ef4444', 6.371e6),
    },
  ],
};

export const sandboxScenario: ScenarioPreset = {
  id: 'sandbox',
  name: 'Sandbox',
  description: 'Solo el Sol — añade planetas desde el catálogo',
  config: { physicsDt: 3600, simulationTimeScale: 86_400 },
  bodies: [makeSunBody()],
};

export const ALL_SCENARIOS: ScenarioPreset[] = [
  solarSystemFull,
  solarSystem,
  solarSystemWithMoons,
  asteroidBeltScenario,
  kuiperBeltScenario,
  sunSedna,
  sunEarthCircular,
  sunEarthElliptic,
  earthMoon,
  binarySystem,
  threeBodyLagrange,
  escapeScenario,
  radialFall,
  collisionScenario,
  sandboxScenario,
];

export function scenarioToDocument(scenario: ScenarioPreset) {
  return createDocument(scenario.name, scenario.bodies, scenario.config);
}

