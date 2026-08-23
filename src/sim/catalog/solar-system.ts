import { AU, G, M_EARTH, M_MOON, M_SUN } from '../constants';
import type { CelestialBody, BodyVisual } from '../types';
import { displayRadiusFromPhysical } from '../visual/display-radius';

export type BodyParentId =
  | 'sun'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto';

export type CatalogCategory =
  | 'planet'
  | 'moon'
  | 'dwarf'
  | 'asteroid'
  | 'kbo'
  | 'comet';

export interface PlanetTemplate {
  id: string;
  name: string;
  category: CatalogCategory;
  mass: number;
  radius: number;
  /** Semi-major axis from parent (m). */
  orbitRadius: number;
  /**
   * Orbital eccentricity from published mean elements (J2000 / JPL).
   * 0 = circular. Bodies with e > 0 are placed at periapsis with vis-viva speed.
   * Inclination is omitted: the lab is 2D.
   */
  eccentricity?: number;
  color: string;
  parent: BodyParentId;
  /** True for retrograde orbits (e.g. Triton) */
  retrograde?: boolean;
  /** Optional description / astronomical notes */
  description?: string;
}

export const SUN_TEMPLATE: PlanetTemplate = {
  id: 'sun',
  name: 'Sol',
  category: 'planet',
  mass: M_SUN,
  radius: 6.9634e8,
  orbitRadius: 0,
  color: '#fbbf24',
  parent: 'sun',
  description: 'Estrella central del Sistema Solar',
};

/** 8 Major Planets */
export const PLANETS_CATALOG: PlanetTemplate[] = [
  {
    id: 'mercury',
    name: 'Mercurio',
    category: 'planet',
    mass: 3.3011e23,
    radius: 2.4397e6,
    orbitRadius: 0.387098 * AU,
    eccentricity: 0.20563,
    color: '#a8a29e',
    parent: 'sun',
    description: 'Planeta rocoso más interior',
  },
  {
    id: 'venus',
    name: 'Venus',
    category: 'planet',
    mass: 4.8675e24,
    radius: 6.0518e6,
    orbitRadius: 0.723332 * AU,
    eccentricity: 0.00677,
    color: '#eab308',
    parent: 'sun',
    description: 'Segundo planeta, atmósfera densa de CO2',
  },
  {
    id: 'earth',
    name: 'Tierra',
    category: 'planet',
    mass: M_EARTH,
    radius: 6.371e6,
    orbitRadius: 1.0 * AU,
    eccentricity: 0.01671,
    color: '#3b82f6',
    parent: 'sun',
    description: 'Tercer planeta, hogar de la humanidad',
  },
  {
    id: 'mars',
    name: 'Marte',
    category: 'planet',
    mass: 6.4171e23,
    radius: 3.3895e6,
    orbitRadius: 1.523679 * AU,
    eccentricity: 0.09341,
    color: '#ef4444',
    parent: 'sun',
    description: 'Planeta rojo, vecino exterior',
  },
  {
    id: 'jupiter',
    name: 'Júpiter',
    category: 'planet',
    mass: 1.8982e27,
    radius: 6.9911e7,
    orbitRadius: 5.2044 * AU,
    eccentricity: 0.04839,
    color: '#f59e0b',
    parent: 'sun',
    description: 'Gigante gaseoso, planeta más masivo',
  },
  {
    id: 'saturn',
    name: 'Saturno',
    category: 'planet',
    mass: 5.6834e26,
    radius: 5.8232e7,
    orbitRadius: 9.53707 * AU,
    eccentricity: 0.05415,
    color: '#fcd34d',
    parent: 'sun',
    description: 'Gigante de los anillos',
  },
  {
    id: 'uranus',
    name: 'Urano',
    category: 'planet',
    mass: 8.681e25,
    radius: 2.5362e7,
    orbitRadius: 19.19126 * AU,
    eccentricity: 0.04717,
    color: '#67e8f9',
    parent: 'sun',
    description: 'Gigante de hielo inclinado',
  },
  {
    id: 'neptune',
    name: 'Neptuno',
    category: 'planet',
    mass: 1.02413e26,
    radius: 2.4622e7,
    orbitRadius: 30.06896 * AU,
    eccentricity: 0.00859,
    color: '#2563eb',
    parent: 'sun',
    description: 'Gigante de hielo más lejano',
  },
];

/** Major Moons of Planets */
export const MOONS_CATALOG: PlanetTemplate[] = [
  // Earth
  {
    id: 'moon',
    name: 'Luna',
    category: 'moon',
    mass: M_MOON,
    radius: 1.7374e6,
    orbitRadius: 3.844e8,
    eccentricity: 0.0554,
    color: '#94a3b8',
    parent: 'earth',
    description: 'Satélite natural de la Tierra',
  },
  // Mars
  {
    id: 'phobos',
    name: 'Fobos',
    category: 'moon',
    mass: 1.0659e16,
    radius: 1.1267e4,
    orbitRadius: 9.376e6,
    eccentricity: 0.0151,
    color: '#a3a3a3',
    parent: 'mars',
    description: 'Luna interior de Marte',
  },
  {
    id: 'deimos',
    name: 'Deimos',
    category: 'moon',
    mass: 1.4762e15,
    radius: 6.2e3,
    orbitRadius: 2.3463e7,
    eccentricity: 0.0002,
    color: '#d4d4d4',
    parent: 'mars',
    description: 'Luna exterior de Marte',
  },
  // Jupiter (Galilean + Amalthea)
  {
    id: 'amalthea',
    name: 'Amaltea',
    category: 'moon',
    mass: 2.08e18,
    radius: 8.35e4,
    orbitRadius: 1.814e8,
    eccentricity: 0.003,
    color: '#f87171',
    parent: 'jupiter',
    description: 'Luna rojiza interior de Júpiter',
  },
  {
    id: 'io',
    name: 'Ío',
    category: 'moon',
    mass: 8.9319e22,
    radius: 1.8216e6,
    orbitRadius: 4.217e8,
    eccentricity: 0.004,
    color: '#facc15',
    parent: 'jupiter',
    description: 'Mundo volcánico galileano',
  },
  {
    id: 'europa_moon',
    name: 'Europa (Luna)',
    category: 'moon',
    mass: 4.8e22,
    radius: 1.5608e6,
    orbitRadius: 6.709e8,
    eccentricity: 0.009,
    color: '#e2e8f0',
    parent: 'jupiter',
    description: 'Océano subsuperficial bajo corteza de hielo',
  },
  {
    id: 'ganymede',
    name: 'Ganimedes',
    category: 'moon',
    mass: 1.4819e23,
    radius: 2.6341e6,
    orbitRadius: 1.0704e9,
    eccentricity: 0.0013,
    color: '#9ca3af',
    parent: 'jupiter',
    description: 'La luna más grande del Sistema Solar',
  },
  {
    id: 'callisto',
    name: 'Calisto',
    category: 'moon',
    mass: 1.0759e23,
    radius: 2.4103e6,
    orbitRadius: 1.8827e9,
    eccentricity: 0.007,
    color: '#6b7280',
    parent: 'jupiter',
    description: 'Luna fuertemente craterizada',
  },
  // Saturn
  {
    id: 'mimas',
    name: 'Mimas',
    category: 'moon',
    mass: 3.75e19,
    radius: 1.982e5,
    orbitRadius: 1.855e8,
    eccentricity: 0.02,
    color: '#cbd5e1',
    parent: 'saturn',
    description: 'Luna del gran cráter Herschel',
  },
  {
    id: 'enceladus',
    name: 'Encélado',
    category: 'moon',
    mass: 1.08e20,
    radius: 2.521e5,
    orbitRadius: 2.38e8,
    eccentricity: 0.005,
    color: '#f8fafc',
    parent: 'saturn',
    description: 'Géiseres criovolcánicos de agua',
  },
  {
    id: 'tethys',
    name: 'Tetis',
    category: 'moon',
    mass: 6.17e20,
    radius: 5.33e5,
    orbitRadius: 2.946e8,
    eccentricity: 0.001,
    color: '#e2e8f0',
    parent: 'saturn',
    description: 'Luna helada de Saturno',
  },
  {
    id: 'dione',
    name: 'Dione',
    category: 'moon',
    mass: 1.095e21,
    radius: 5.614e5,
    orbitRadius: 3.774e8,
    eccentricity: 0.002,
    color: '#cbd5e1',
    parent: 'saturn',
    description: 'Luna con acantilados de hielo',
  },
  {
    id: 'rhea',
    name: 'Rea',
    category: 'moon',
    mass: 2.307e21,
    radius: 7.638e5,
    orbitRadius: 5.27e8,
    eccentricity: 0.001,
    color: '#d1d5db',
    parent: 'saturn',
    description: 'Segunda luna mayor de Saturno',
  },
  {
    id: 'titan',
    name: 'Titán',
    category: 'moon',
    mass: 1.3452e23,
    radius: 2.5747e6,
    orbitRadius: 1.22187e9,
    eccentricity: 0.0288,
    color: '#fb923c',
    parent: 'saturn',
    description: 'Atmósfera densa y lagos de hidrocarburos',
  },
  {
    id: 'hyperion',
    name: 'Hiperión',
    category: 'moon',
    mass: 5.6e18,
    radius: 1.35e5,
    orbitRadius: 1.481e9,
    eccentricity: 0.105,
    color: '#fdba74',
    parent: 'saturn',
    description: 'Luna esponjosa con rotación caótica',
  },
  {
    id: 'iapetus',
    name: 'Jápeto',
    category: 'moon',
    mass: 1.805e21,
    radius: 7.345e5,
    orbitRadius: 3.5613e9,
    eccentricity: 0.028,
    color: '#78716c',
    parent: 'saturn',
    description: 'Luna de dos tonos contrastados',
  },
  // Uranus
  {
    id: 'miranda',
    name: 'Miranda',
    category: 'moon',
    mass: 6.59e19,
    radius: 2.358e5,
    orbitRadius: 1.294e8,
    eccentricity: 0.001,
    color: '#e2e8f0',
    parent: 'uranus',
    description: 'Luna con cañones escarpados',
  },
  {
    id: 'ariel',
    name: 'Ariel',
    category: 'moon',
    mass: 1.353e21,
    radius: 5.789e5,
    orbitRadius: 1.91e8,
    eccentricity: 0.001,
    color: '#cbd5e1',
    parent: 'uranus',
    description: 'Luna brillante de Urano',
  },
  {
    id: 'umbriel',
    name: 'Umbriel',
    category: 'moon',
    mass: 1.172e21,
    radius: 5.847e5,
    orbitRadius: 2.66e8,
    eccentricity: 0.004,
    color: '#94a3b8',
    parent: 'uranus',
    description: 'Luna oscura de Urano',
  },
  {
    id: 'titania',
    name: 'Titania',
    category: 'moon',
    mass: 3.527e21,
    radius: 7.884e5,
    orbitRadius: 4.359e8,
    eccentricity: 0.002,
    color: '#cbd5e1',
    parent: 'uranus',
    description: 'Mayor luna de Urano',
  },
  {
    id: 'oberon',
    name: 'Oberón',
    category: 'moon',
    mass: 3.014e21,
    radius: 7.614e5,
    orbitRadius: 5.835e8,
    eccentricity: 0.002,
    color: '#9ca3af',
    parent: 'uranus',
    description: 'Segunda luna mayor de Urano',
  },
  // Neptune
  {
    id: 'proteus',
    name: 'Proteo',
    category: 'moon',
    mass: 4.4e19,
    radius: 2.1e5,
    orbitRadius: 1.176e8,
    eccentricity: 0,
    color: '#94a3b8',
    parent: 'neptune',
    description: 'Mayor luna irregular de Neptuno',
  },
  {
    id: 'triton',
    name: 'Tritón',
    category: 'moon',
    mass: 2.14e22,
    radius: 1.3534e6,
    orbitRadius: 3.5476e8,
    eccentricity: 0,
    color: '#bae6fd',
    parent: 'neptune',
    retrograde: true,
    description: 'Gran luna retrógrada con géiseres de N2',
  },
  {
    id: 'nereid',
    name: 'Nereida',
    category: 'moon',
    mass: 3.1e19,
    radius: 1.7e5,
    orbitRadius: 5.5134e9,
    eccentricity: 0.751,
    color: '#7dd3fc',
    parent: 'neptune',
    description: 'Luna de órbita excéntrica',
  },
  // Pluto
  {
    id: 'charon',
    name: 'Caronte',
    category: 'moon',
    mass: 1.586e21,
    radius: 6.06e5,
    orbitRadius: 1.957e7,
    eccentricity: 0,
    color: '#a8a29e',
    parent: 'pluto',
    description: 'Compañero binario de Plutón',
  },
];

/** Dwarf Planets / Planetoids */
export const DWARF_PLANETS_CATALOG: PlanetTemplate[] = [
  {
    id: 'ceres',
    name: 'Ceres',
    category: 'dwarf',
    mass: 9.3835e20,
    radius: 4.697e5,
    orbitRadius: 2.767 * AU,
    eccentricity: 0.079,
    color: '#d6d3d1',
    parent: 'sun',
    description: 'Planeta enano del cinturón de asteroides',
  },
  {
    id: 'pluto',
    name: 'Plutón',
    category: 'dwarf',
    mass: 1.303e22,
    radius: 1.1883e6,
    orbitRadius: 39.482 * AU,
    eccentricity: 0.2488,
    color: '#e2e8f0',
    parent: 'sun',
    description: 'Planeta enano del Cinturón de Kuiper',
  },
  {
    id: 'haumea',
    name: 'Haumea',
    category: 'dwarf',
    mass: 4.006e21,
    radius: 7.8e5,
    orbitRadius: 43.218 * AU,
    eccentricity: 0.191,
    color: '#f1f5f9',
    parent: 'sun',
    description: 'Planeta enano elongado y rotación rápida',
  },
  {
    id: 'makemake',
    name: 'Makemake',
    category: 'dwarf',
    mass: 3.1e21,
    radius: 7.15e5,
    orbitRadius: 45.56 * AU,
    eccentricity: 0.158,
    color: '#fed7aa',
    parent: 'sun',
    description: 'Planeta enano clásico del Cinturón de Kuiper',
  },
  {
    id: 'eris',
    name: 'Eris',
    category: 'dwarf',
    mass: 1.66e22,
    radius: 1.163e6,
    orbitRadius: 67.86 * AU,
    eccentricity: 0.441,
    color: '#f8fafc',
    parent: 'sun',
    description: 'Planeta enano masivo del disco disperso',
  },
  {
    id: 'gonggong',
    name: 'Gonggong',
    category: 'dwarf',
    mass: 1.75e21,
    radius: 6.15e5,
    orbitRadius: 67.49 * AU,
    eccentricity: 0.503,
    color: '#f87171',
    parent: 'sun',
    description: 'Planetoide rojizo del disco disperso',
  },
  {
    id: 'quaoar',
    name: 'Quaoar',
    category: 'dwarf',
    mass: 1.2e21,
    radius: 5.45e5,
    orbitRadius: 43.69 * AU,
    eccentricity: 0.04,
    color: '#fdba74',
    parent: 'sun',
    description: 'Objeto del cinturón de Kuiper con anillo',
  },
  {
    id: 'sedna',
    name: 'Sedna',
    category: 'dwarf',
    mass: 1.0e21,
    radius: 4.98e5,
    orbitRadius: 506.8 * AU,
    eccentricity: 0.855,
    color: '#fca5a5',
    parent: 'sun',
    description: 'Sednoide de órbita muy elíptica (perihelio ~73 AU, afelio ~940 AU, periodo ~11 400 años)',
  },
  {
    id: 'orcus',
    name: 'Orcus',
    category: 'dwarf',
    mass: 6.4e20,
    radius: 4.58e5,
    orbitRadius: 39.4 * AU,
    eccentricity: 0.22,
    color: '#cbd5e1',
    parent: 'sun',
    description: 'Plutino con superficie de hielo',
  },
  {
    id: 'varuna',
    name: 'Varuna',
    category: 'dwarf',
    mass: 3.7e20,
    radius: 3.34e5,
    orbitRadius: 42.9 * AU,
    eccentricity: 0.051,
    color: '#e2e8f0',
    parent: 'sun',
    description: 'KBO alargado',
  },
  {
    id: 'salacia',
    name: 'Salacia',
    category: 'dwarf',
    mass: 4.5e20,
    radius: 4.23e5,
    orbitRadius: 42.18 * AU,
    eccentricity: 0.106,
    color: '#94a3b8',
    parent: 'sun',
    description: 'Objeto transneptuniano de baja densidad',
  },
];

/** Major Asteroid Belt Objects */
export const ASTEROIDS_CATALOG: PlanetTemplate[] = [
  {
    id: 'vesta',
    name: 'Vesta',
    category: 'asteroid',
    mass: 2.59e20,
    radius: 2.627e5,
    orbitRadius: 2.362 * AU,
    eccentricity: 0.089,
    color: '#e5e5e5',
    parent: 'sun',
    description: 'Segundo asteroide más masivo',
  },
  {
    id: 'pallas',
    name: 'Palas',
    category: 'asteroid',
    mass: 2.04e20,
    radius: 2.56e5,
    orbitRadius: 2.773 * AU,
    eccentricity: 0.23,
    color: '#d4d4d8',
    parent: 'sun',
    description: 'Gran asteroide de tipo B',
  },
  {
    id: 'hygiea',
    name: 'Higía',
    category: 'asteroid',
    mass: 8.67e19,
    radius: 2.15e5,
    orbitRadius: 3.139 * AU,
    eccentricity: 0.12,
    color: '#a1a1aa',
    parent: 'sun',
    description: 'Cuarto asteroide en tamaño, forma casi esférica',
  },
  {
    id: 'interamnia',
    name: 'Interamnia',
    category: 'asteroid',
    mass: 3.5e19,
    radius: 1.53e5,
    orbitRadius: 3.06 * AU,
    eccentricity: 0.154,
    color: '#71717a',
    parent: 'sun',
    description: 'Asteroide masivo de tipo F',
  },
  {
    id: 'europa_asteroid',
    name: 'Asteroide Europa',
    category: 'asteroid',
    mass: 2.4e19,
    radius: 1.52e5,
    orbitRadius: 3.09 * AU,
    eccentricity: 0.102,
    color: '#78716c',
    parent: 'sun',
    description: '52 Europa, gran asteroide de carbono',
  },
  {
    id: 'davida',
    name: 'Davida',
    category: 'asteroid',
    mass: 3.8e19,
    radius: 1.45e5,
    orbitRadius: 3.16 * AU,
    eccentricity: 0.187,
    color: '#a8a29e',
    parent: 'sun',
    description: 'Gran asteroide de tipo C',
  },
  {
    id: 'sylvia',
    name: 'Silvia',
    category: 'asteroid',
    mass: 1.48e19,
    radius: 1.43e5,
    orbitRadius: 3.49 * AU,
    eccentricity: 0.08,
    color: '#d6d3d1',
    parent: 'sun',
    description: 'Asteroide del cinturón exterior con lunas',
  },
  {
    id: 'eunomia',
    name: 'Eunomia',
    category: 'asteroid',
    mass: 3.0e19,
    radius: 1.34e5,
    orbitRadius: 2.64 * AU,
    eccentricity: 0.187,
    color: '#e4e4e7',
    parent: 'sun',
    description: 'Mayor asteroide rocoso de tipo S',
  },
  {
    id: 'juno',
    name: 'Juno',
    category: 'asteroid',
    mass: 2.67e19,
    radius: 1.27e5,
    orbitRadius: 2.67 * AU,
    eccentricity: 0.255,
    color: '#d4d4d8',
    parent: 'sun',
    description: 'Tercer asteroide descubierto',
  },
  {
    id: 'psyche',
    name: 'Psique',
    category: 'asteroid',
    mass: 2.29e19,
    radius: 1.11e5,
    orbitRadius: 2.92 * AU,
    eccentricity: 0.134,
    color: '#f59e0b',
    parent: 'sun',
    description: 'Asteroide metálico de hierro y níquel',
  },
];

/** Kuiper Belt Objects */
export const KBOS_CATALOG: PlanetTemplate[] = [
  {
    id: 'arrokoth',
    name: 'Arrokoth',
    category: 'kbo',
    mass: 1.0e14,
    radius: 1.8e4,
    orbitRadius: 44.58 * AU,
    eccentricity: 0.049,
    color: '#dc2626',
    parent: 'sun',
    description: 'KBO binario de contacto visitado por New Horizons',
  },
];

/** Comets and Centaurs */
export const COMETS_CATALOG: PlanetTemplate[] = [
  {
    id: 'halley',
    name: 'Cometa Halley',
    category: 'comet',
    mass: 2.2e14,
    radius: 5.5e3,
    orbitRadius: 17.8 * AU,
    eccentricity: 0.967,
    color: '#60a5fa',
    parent: 'sun',
    description: 'Cometa periódico más famoso (1P/Halley)',
  },
  {
    id: 'chiron',
    name: 'Quirón (Centauro)',
    category: 'comet',
    mass: 4.0e18,
    radius: 1.09e5,
    orbitRadius: 13.67 * AU,
    eccentricity: 0.382,
    color: '#94a3b8',
    parent: 'sun',
    description: '2060 Chiron, centauro entre Saturno y Urano',
  },
  {
    id: 'encke',
    name: 'Cometa Encke',
    category: 'comet',
    mass: 1.0e13,
    radius: 2.4e3,
    orbitRadius: 2.22 * AU,
    eccentricity: 0.848,
    color: '#93c5fd',
    parent: 'sun',
    description: 'Cometa de período más corto del Sistema Solar',
  },
];

/** Combined catalog containing all individual templates */
export const SOLAR_SYSTEM_CATALOG: PlanetTemplate[] = [
  ...PLANETS_CATALOG,
  ...MOONS_CATALOG,
  ...DWARF_PLANETS_CATALOG,
  ...ASTEROIDS_CATALOG,
  ...KBOS_CATALOG,
  ...COMETS_CATALOG,
];

export function circularOrbitSpeed(centralMass: number, radius: number): number {
  return Math.sqrt((G * centralMass) / radius);
}

/** Clamp eccentricity to a bound elliptical orbit. */
export function clampEccentricity(eccentricity: number | undefined): number {
  if (eccentricity === undefined || !Number.isFinite(eccentricity) || eccentricity <= 0) return 0;
  return Math.min(eccentricity, 0.999);
}

/** Perihelion distance a(1 − e). Equals `a` when e = 0. */
export function perihelionRadius(semiMajorAxis: number, eccentricity: number | undefined): number {
  return semiMajorAxis * (1 - clampEccentricity(eccentricity));
}

/**
 * Speed at perihelion from vis-viva: √(GM (1+e) / (a(1−e))).
 * Equals circular speed when e = 0.
 */
export function perihelionSpeed(
  centralMass: number,
  semiMajorAxis: number,
  eccentricity: number | undefined,
): number {
  const e = clampEccentricity(eccentricity);
  return Math.sqrt((G * centralMass * (1 + e)) / (semiMajorAxis * (1 - e)));
}

export function makeVisual(
  color: string,
  physicalRadius: number,
  isStar = false,
  customTrailLength = 400,
): BodyVisual {
  return {
    color,
    displayRadius: displayRadiusFromPhysical(physicalRadius, isStar),
    showTrail: true,
    trailLength: customTrailLength,
  };
}

let catalogIdCounter = 0;

export function nextCatalogBodyId(prefix: string): string {
  catalogIdCounter += 1;
  return `${prefix}-${catalogIdCounter}-${Date.now().toString(36)}`;
}

/**
 * Place a heliocentric body at perihelion of its catalog orbit, then rotate
 * that perihelion by `phaseRad` (0 = +x axis). Circular templates (e = 0)
 * keep the previous behaviour: distance = `orbitRadius`, v = √(GM/a).
 */
export function bodyFromSunOrbit(
  template: PlanetTemplate,
  phaseRad = 0,
  centralMass = M_SUN,
): CelestialBody {
  const a = template.orbitRadius;
  const r = perihelionRadius(a, template.eccentricity);
  const v = perihelionSpeed(centralMass, a, template.eccentricity);
  const c = Math.cos(phaseRad);
  const s = Math.sin(phaseRad);

  return {
    id: nextCatalogBodyId(template.id),
    name: template.name,
    mass: template.mass,
    radius: template.radius,
    position: { x: r * c, y: r * s },
    // Tangential velocity for counterclockwise orbit
    velocity: { x: -v * s, y: v * c },
    state: 'dynamic',
    visual: makeVisual(template.color, template.radius),
  };
}

/**
 * Place a secondary body (moon / satellite) around a parent body in the simulation.
 */
export function bodyAroundParent(
  template: PlanetTemplate,
  parentBody: CelestialBody,
  phaseRad = 0,
): CelestialBody {
  const a = template.orbitRadius;
  const r = perihelionRadius(a, template.eccentricity);
  const dir = template.retrograde ? -1 : 1;
  const vRel = perihelionSpeed(parentBody.mass, a, template.eccentricity) * dir;
  const c = Math.cos(phaseRad);
  const s = Math.sin(phaseRad);

  return {
    id: nextCatalogBodyId(template.id),
    name: template.name,
    mass: template.mass,
    radius: template.radius,
    position: {
      x: parentBody.position.x + r * c,
      y: parentBody.position.y + r * s,
    },
    velocity: {
      x: parentBody.velocity.x - vRel * s,
      y: parentBody.velocity.y + vRel * c,
    },
    state: 'dynamic',
    visual: makeVisual(template.color, template.radius, false, 250),
  };
}

/** Backwards-compatible helper for the Earth-Moon pair */
export function bodyMoonAroundEarth(earth: CelestialBody, phaseRad = 0): CelestialBody {
  const moon = MOONS_CATALOG.find((p) => p.id === 'moon')!;
  return bodyAroundParent(moon, earth, phaseRad);
}

export function makeSunBody(): CelestialBody {
  return {
    id: nextCatalogBodyId('sun'),
    name: SUN_TEMPLATE.name,
    mass: SUN_TEMPLATE.mass,
    radius: SUN_TEMPLATE.radius,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    state: 'fixed',
    visual: makeVisual(SUN_TEMPLATE.color, SUN_TEMPLATE.radius, true),
  };
}

/** Base solar system (Sun fixed + 8 planets, optional moon). */
export function createSolarSystemBodies(includeMoon = false): CelestialBody[] {
  const sun = makeSunBody();
  const planets = PLANETS_CATALOG.map((p, i) =>
    // Spread phases so they don't all start on the +x axis
    bodyFromSunOrbit(p, (i * Math.PI) / 5),
  );

  if (!includeMoon) return [sun, ...planets];

  const earth = planets.find((b) => b.name === 'Tierra');
  if (!earth) return [sun, ...planets];
  return [sun, ...planets, bodyMoonAroundEarth(earth)];
}

/**
 * Deterministic generator for representative Asteroid Belt particles (2.1–3.3 AU)
 */
export function createAsteroidBeltSwarm(count = 45): CelestialBody[] {
  const asteroids: CelestialBody[] = [];
  const minAu = 2.15;
  const maxAu = 3.28;
  const goldenRatio = 1.618033988749895;

  for (let i = 0; i < count; i++) {
    const fraction = (i * goldenRatio) % 1;
    const rAu = minAu + fraction * (maxAu - minAu);
    const phase = (i * 2.399963229728653) % (Math.PI * 2);
    const r = rAu * AU;
    const v = circularOrbitSpeed(M_SUN, r);
    const c = Math.cos(phase);
    const s = Math.sin(phase);

    const sizeVariation = 0.5 + ((i * 7) % 10) * 0.1;
    const radius = 2.5e4 * sizeVariation;
    const mass = 5e16 * (sizeVariation ** 3);

    asteroids.push({
      id: nextCatalogBodyId(`ast-belt-${i}`),
      name: `Asteroide ${(i + 1).toString().padStart(2, '0')}`,
      mass,
      radius,
      position: { x: r * c, y: r * s },
      velocity: { x: -v * s, y: v * c },
      state: 'dynamic',
      visual: {
        color: i % 3 === 0 ? '#a1a1aa' : i % 3 === 1 ? '#71717a' : '#9ca3af',
        displayRadius: 3,
        showTrail: false,
        trailLength: 60,
      },
    });
  }

  return asteroids;
}

/**
 * Deterministic generator for representative Kuiper Belt particles (30–48 AU)
 */
export function createKuiperBeltSwarm(count = 25): CelestialBody[] {
  const kbos: CelestialBody[] = [];
  const minAu = 30.5;
  const maxAu = 48.0;
  const goldenRatio = 1.618033988749895;

  for (let i = 0; i < count; i++) {
    const fraction = (i * goldenRatio) % 1;
    const rAu = minAu + fraction * (maxAu - minAu);
    const phase = (i * 2.399963229728653 + 1.2) % (Math.PI * 2);
    const r = rAu * AU;
    const v = circularOrbitSpeed(M_SUN, r);
    const c = Math.cos(phase);
    const s = Math.sin(phase);

    const sizeVariation = 0.6 + ((i * 5) % 8) * 0.1;
    const radius = 3.5e4 * sizeVariation;
    const mass = 1e17 * (sizeVariation ** 3);

    kbos.push({
      id: nextCatalogBodyId(`kbo-belt-${i}`),
      name: `KBO ${(i + 1).toString().padStart(2, '0')}`,
      mass,
      radius,
      position: { x: r * c, y: r * s },
      velocity: { x: -v * s, y: v * c },
      state: 'dynamic',
      visual: {
        color: i % 2 === 0 ? '#7dd3fc' : '#fca5a5',
        displayRadius: 3,
        showTrail: false,
        trailLength: 60,
      },
    });
  }

  return kbos;
}

/**
 * Generates all moons for planets currently present in `existingBodies`.
 */
export function createMoonsForPlanets(existingBodies: CelestialBody[]): CelestialBody[] {
  const moons: CelestialBody[] = [];
  const existingNames = new Set(existingBodies.map((b) => b.name));

  for (const moonTemplate of MOONS_CATALOG) {
    if (existingNames.has(moonTemplate.name)) continue;

    const parentTemplate = SOLAR_SYSTEM_CATALOG.find((p) => p.id === moonTemplate.parent);
    const parentName = parentTemplate?.name ?? (moonTemplate.parent === 'earth' ? 'Tierra' : moonTemplate.parent);
    const parentBody = existingBodies.find(
      (b) => b.name.toLowerCase() === parentName.toLowerCase() || b.id.startsWith(moonTemplate.parent),
    );

    if (parentBody) {
      const moonIdx = MOONS_CATALOG.filter((m) => m.parent === moonTemplate.parent).indexOf(moonTemplate);
      const phase = (moonIdx * Math.PI) / 3;
      moons.push(bodyAroundParent(moonTemplate, parentBody, phase));
    }
  }

  return moons;
}

export interface SolarSystemBuildOptions {
  includeMoons?: boolean;
  includeDwarfPlanets?: boolean;
  includeAsteroids?: boolean;
  includeAsteroidSwarm?: boolean;
  includeKBOs?: boolean;
  includeKuiperSwarm?: boolean;
  includeComets?: boolean;
  /**
   * Existing bodies to use as orbital anchors when adding catalog objects to
   * an already-running simulation. This keeps new moons attached to the
   * current parent position and velocity instead of a newly generated phase.
   */
  anchorBodies?: readonly CelestialBody[];
}

/**
 * Creates a comprehensive system with all known objects of the Solar System.
 */
export function createEverythingKnownSolarSystem(
  options: SolarSystemBuildOptions = {
    includeMoons: true,
    includeDwarfPlanets: true,
    includeAsteroids: true,
    includeAsteroidSwarm: true,
    includeKBOs: true,
    includeKuiperSwarm: true,
    includeComets: true,
  },
): CelestialBody[] {
  const sun = makeSunBody();
  const bodies: CelestialBody[] = [sun];

  // 1. Planets
  const planets = PLANETS_CATALOG.map((p, i) =>
    bodyFromSunOrbit(p, (i * Math.PI) / 4.5),
  );
  bodies.push(...planets);

  // 2. Dwarf Planets (including Pluto, Ceres, Eris, Haumea, etc.)
  let plutoBody: CelestialBody | null = null;
  if (options.includeDwarfPlanets ?? true) {
    DWARF_PLANETS_CATALOG.forEach((d, i) => {
      const dwarf = bodyFromSunOrbit(d, ((i + 1) * Math.PI) / 5.5 + 0.3);
      bodies.push(dwarf);
      if (d.id === 'pluto') {
        plutoBody = dwarf;
      }
    });
  }

  // 3. Moons for all planets & Pluto
  if (options.includeMoons ?? true) {
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
      const anchorParent = options.anchorBodies?.find(
        (b) => b.name.toLowerCase() === p.name.toLowerCase(),
      );
      const moonParent = anchorParent ?? p;
      moonsForPlanet.forEach((m, idx) => {
        const phase = (idx * Math.PI) / 3.2;
        bodies.push(bodyAroundParent(m, moonParent, phase));
      });
    }

    if (plutoBody) {
      const charon = MOONS_CATALOG.find((m) => m.id === 'charon');
      if (charon) {
        const anchorPluto = options.anchorBodies?.find(
          (b) => b.name.toLowerCase() === 'plutón',
        );
        bodies.push(bodyAroundParent(charon, anchorPluto ?? plutoBody, 0));
      }
    }
  }

  // 4. Major Asteroids
  if (options.includeAsteroids ?? true) {
    ASTEROIDS_CATALOG.forEach((a, i) => {
      bodies.push(bodyFromSunOrbit(a, (i * Math.PI) / 5 + 0.8));
    });
  }

  // 5. Asteroid Belt Swarm
  if (options.includeAsteroidSwarm ?? true) {
    bodies.push(...createAsteroidBeltSwarm(35));
  }

  // 6. KBOs
  if (options.includeKBOs ?? true) {
    KBOS_CATALOG.forEach((k, i) => {
      bodies.push(bodyFromSunOrbit(k, (i * Math.PI) / 3 + 1.5));
    });
  }

  // 7. Kuiper Belt Swarm
  if (options.includeKuiperSwarm ?? true) {
    bodies.push(...createKuiperBeltSwarm(20));
  }

  // 8. Comets
  if (options.includeComets ?? true) {
    COMETS_CATALOG.forEach((c, i) => {
      bodies.push(bodyFromSunOrbit(c, (i * Math.PI) / 2 + 0.5));
    });
  }

  return bodies;
}

/**
 * Find the next free heliocentric orbit slot for a custom body,
 * starting from `startAu` and stepping outward.
 */
export function findFreeOrbitRadius(existing: CelestialBody[], startAu = 0.5, stepAu = 0.4): number {
  const occupied = existing
    .filter((b) => b.mass < M_SUN * 0.1)
    .map((b) => Math.hypot(b.position.x, b.position.y));

  let au = startAu;
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = au * AU;
    const free = occupied.every((d) => Math.abs(d - r) / AU > 0.15);
    if (free) return r;
    au += stepAu;
  }
  return startAu * AU;
}

export function makeCustomBodyAtOrbit(
  existing: CelestialBody[],
  options?: { mass?: number; radius?: number; name?: string; color?: string; phaseRad?: number },
): CelestialBody {
  const r = findFreeOrbitRadius(existing);
  const mass = options?.mass ?? M_EARTH;
  const radius = options?.radius ?? 6.371e6;
  const v = circularOrbitSpeed(M_SUN, r);
  // Deterministic phase from body count (avoid Math.random in sim path)
  const phase = options?.phaseRad ?? (existing.length * 1.7) % (Math.PI * 2);
  const c = Math.cos(phase);
  const s = Math.sin(phase);

  return {
    id: nextCatalogBodyId('custom'),
    name: options?.name ?? 'Nuevo cuerpo',
    mass,
    radius,
    position: { x: r * c, y: r * s },
    velocity: { x: -v * s, y: v * c },
    state: 'dynamic',
    visual: makeVisual(options?.color ?? '#10b981', radius),
  };
}

export function catalogBodyAlreadyPresent(existing: CelestialBody[], template: PlanetTemplate): boolean {
  return existing.some(
    (b) => b.name.toLowerCase() === template.name.toLowerCase() || b.id.startsWith(template.id),
  );
}
