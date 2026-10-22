import type { SimulationDocument, SimSnapshot, SnapshotBody, CollisionMode } from '../types';

export type WorkerCommand =
  | { type: 'init'; document: SimulationDocument; initialTime: number }
  | { type: 'frame'; nowMs: number }
  | { type: 'step' }
  | { type: 'snapshot' }
  | { type: 'scale'; scale: number }
  | { type: 'collision'; mode: CollisionMode };

export interface WorkerRequest {
  id: number;
  generation: number;
  command: WorkerCommand;
}

/** Sample-major XY positions, already relative to each moon's parent. */
export interface TrailSamples {
  ids: string[];
  positions: Float64Array;
  count: number;
  truncated: boolean;
}

type BodyMetadata = Omit<SnapshotBody, 'position' | 'velocity'>;
export interface PackedSnapshot {
  diagnosticsFresh: boolean;
  snapshot: Omit<SimSnapshot, 'bodies'>;
  metadata?: BodyMetadata[];
  kinematics: Float64Array;
  trails?: TrailSamples;
}

export type WorkerResponse = {
  id: number;
  generation: number;
} & ({ type: 'state'; packed: PackedSnapshot } | { type: 'error'; message: string });

export function packSnapshot(snapshot: SimSnapshot, includeMetadata: boolean): PackedSnapshot {
  const { bodies, ...rest } = snapshot;
  const kinematics = new Float64Array(bodies.length * 4);
  bodies.forEach((body, i) => {
    kinematics.set([body.position.x, body.position.y, body.velocity.x, body.velocity.y], i * 4);
  });
  return {
    snapshot: rest, kinematics, diagnosticsFresh: true,
    metadata: includeMetadata ? bodies.map(({ position: _p, velocity: _v, ...meta }) => meta) : undefined,
  };
}

export function unpackSnapshot(packed: PackedSnapshot, previous: SimSnapshot): SimSnapshot {
  const metadata = packed.metadata ?? previous.bodies;
  if (packed.kinematics.length !== metadata.length * 4) throw new Error('Estado del Worker incompleto');
  return {
    ...packed.snapshot,
    bodies: metadata.map((meta, i) => ({
      ...meta,
      position: { x: packed.kinematics[i * 4]!, y: packed.kinematics[i * 4 + 1]! },
      velocity: { x: packed.kinematics[i * 4 + 2]!, y: packed.kinematics[i * 4 + 3]! },
    })),
  };
}

