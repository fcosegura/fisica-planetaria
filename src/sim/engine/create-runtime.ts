import type { SimulationDocument } from '../document/simulation-document';
import { OrbitalEngine } from './orbital-engine';
import type { SimulationRuntime } from './runtime';
import { SimulationEngine } from './simulation-engine';

export interface CreateRuntimeOptions {
  document: SimulationDocument;
  initialTime?: number;
}

/**
 * Instantiates the engine named in `document.config.engineKind`.
 * Default / omitted → N-body reference engine (unchanged physics).
 */
export function createSimulationRuntime(options: CreateRuntimeOptions): SimulationRuntime {
  const kind = options.document.config.engineKind ?? 'nbody';
  if (kind === 'orbital') {
    return new OrbitalEngine(options);
  }
  return new SimulationEngine({
    document: options.document,
    initialTime: options.initialTime,
  });
}
