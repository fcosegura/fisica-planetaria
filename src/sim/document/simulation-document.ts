import { DEFAULT_SIM_CONFIG } from '../constants';
import type { CelestialBody, SimConfig, SimulationDocument } from '../types';

export type { SimulationDocument };

export function createDocument(
  name: string,
  bodies: CelestialBody[],
  configOverrides: Partial<SimConfig> = {},
): SimulationDocument {
  return {
    id: crypto.randomUUID?.() ?? `doc-${Date.now()}`,
    name,
    config: { ...DEFAULT_SIM_CONFIG, ...configOverrides },
    bodies: bodies.map((b) => ({ ...b, visual: { ...b.visual } })),
  };
}

export function updateBody(document: SimulationDocument, body: CelestialBody): SimulationDocument {
  return {
    ...document,
    bodies: document.bodies.map((b) => (b.id === body.id ? { ...body, visual: { ...body.visual } } : b)),
  };
}

export function addBody(document: SimulationDocument, body: CelestialBody): SimulationDocument {
  return {
    ...document,
    bodies: [...document.bodies, { ...body, visual: { ...body.visual } }],
  };
}

export function removeBody(document: SimulationDocument, id: string): SimulationDocument {
  return {
    ...document,
    bodies: document.bodies.filter((b) => b.id !== id),
  };
}
