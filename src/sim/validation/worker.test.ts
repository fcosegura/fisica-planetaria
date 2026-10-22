import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSimulationRuntime } from '../engine/create-runtime';
import { createDocument } from '../document/simulation-document';
import { scenarioToDocument, sunEarthCircular, solarSystemFull } from '../scenarios';
import type { EngineKind, SimSnapshot } from '../types';
import { SimulationWorkerRunner } from '../worker/worker-runner';
import { packSnapshot, unpackSnapshot, type WorkerRequest, type WorkerResponse } from '../worker/protocol';
import { WorkerSimulationSession, type SimulationWorkerPort } from '../../runtime/worker-session';
import { interpolateSnapshot } from '../../render/interpolate-snapshot';
import { FramePerformance } from '../../render/frame-performance';
import { MAX_TRAIL_SAMPLES } from '../worker/trail-sampler';
import { latestSnapshot, useSimulationStore } from '../../store/simulation-store';

class DelayedWorker implements SimulationWorkerPort {
  onmessage: SimulationWorkerPort['onmessage'] = null;
  onerror: SimulationWorkerPort['onerror'] = null;
  onmessageerror: SimulationWorkerPort['onmessageerror'] = null;
  requests: WorkerRequest[] = [];
  terminated = false;
  runner = new SimulationWorkerRunner();
  postMessage(message: WorkerRequest) { this.requests.push(structuredClone(message)); }
  terminate() { this.terminated = true; }
  flush(): WorkerResponse {
    const request = this.requests.shift()!;
    const response = this.runner.handle(request);
    // Exercise the actual transferable representation, including detached buffers.
    const transfer = response.type === 'state' ? [response.packed.kinematics.buffer as ArrayBuffer] : [];
    if (response.type === 'state' && response.packed.trails) transfer.push(response.packed.trails.positions.buffer as ArrayBuffer);
    const copy = structuredClone(response, { transfer });
    this.onmessage?.({ data: copy } as MessageEvent<WorkerResponse>);
    return copy;
  }
}

function fixture(kind: EngineKind = 'nbody') {
  const document = scenarioToDocument(sunEarthCircular);
  document.config = { ...document.config, engineKind: kind, frameBudgetMs: 1e6, simulationTimeScale: document.config.physicsDt * 60 * 3 };
  return document;
}

const sessions: WorkerSimulationSession[] = [];
function session() {
  const port = new DelayedWorker();
  const engine = new WorkerSimulationSession(fixture(), 0, () => port);
  sessions.push(engine);
  return { engine, port };
}
afterEach(() => { sessions.splice(0).forEach((s) => s.dispose()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe.each(['nbody', 'orbital'] as const)('%s Worker numerical parity', (kind) => {
  it('matches direct runtime after frames, scale changes and an acknowledged step', () => {
    const document = fixture(kind);
    const direct = createSimulationRuntime({ document });
    const runner = new SimulationWorkerRunner();
    let id = 0;
    let current = direct.getSnapshot();
    const send = (command: WorkerRequest['command']) => {
      const response = runner.handle({ id: ++id, generation: 1, command });
      expect(response.type).toBe('state');
      if (response.type !== 'state') throw new Error(response.message);
      current = unpackSnapshot(structuredClone(response.packed), current);
      return current;
    };
    send({ type: 'init', document, initialTime: 0 });
    for (let i = 0; i < 120; i++) {
      const nowMs = 1000 + i * 16.67;
      direct.runFrame(nowMs);
      expect(send({ type: 'frame', nowMs }).bodies).toEqual(direct.getSnapshot().bodies);
    }
    direct.setTimeScale(1000);
    send({ type: 'scale', scale: 1000 });
    direct.stepOnce();
    expect(send({ type: 'step' })).toEqual(direct.getSnapshot());
  });
});

it('matches the 114-body reference including conservation metrics', () => {
  const document = scenarioToDocument(solarSystemFull);
  document.config = { ...document.config, frameBudgetMs: 1e6, simulationTimeScale: 120 * 60 * 8 };
  expect(document.bodies).toHaveLength(114);
  const direct = createSimulationRuntime({ document });
  const runner = new SimulationWorkerRunner();
  let response = runner.handle({ id: 0, generation: 1, command: { type: 'init', document, initialTime: 0 } });
  for (let i = 0; i < 20; i++) {
    direct.runFrame(1000 + i * 20);
    response = runner.handle({ id: i + 1, generation: 1, command: { type: 'frame', nowMs: 1000 + i * 20 } });
    expect(response.type).toBe('state');
  }
  response = runner.handle({ id: 100, generation: 1, command: { type: 'snapshot' } });
  if (response.type !== 'state') throw new Error(response.message);
  expect(unpackSnapshot(response.packed, direct.getSnapshot())).toEqual(direct.getSnapshot());
});

it('transfers Float64 state and updates metadata after a collision', () => {
  const base = fixture();
  const bodies = base.bodies.map((body, i) => ({ ...body, radius: 1e11, position: { x: i * 1e8, y: 0 }, velocity: { x: 0, y: 0 } }));
  const runner = new SimulationWorkerRunner();
  const direct = createSimulationRuntime({ document: createDocument('merge', bodies, base.config) });
  runner.handle({ id: 1, generation: 1, command: { type: 'init', document: createDocument('merge', bodies, base.config), initialTime: 0 } });
  const response = runner.handle({ id: 2, generation: 1, command: { type: 'step' } });
  direct.stepOnce();
  if (response.type !== 'state') throw new Error(response.message);
  expect(response.packed.metadata).toHaveLength(1);
  expect(unpackSnapshot(response.packed, direct.getSnapshot())).toEqual(direct.getSnapshot());
});

it('keeps one frame in flight and orders pause/step after it', async () => {
  const { engine, port } = session();
  port.flush(); // initialization
  for (let i = 0; i < 100; i++) engine.runFrame(1000 + i);
  expect(port.requests).toHaveLength(1);
  const pause = engine.pause();
  const step = engine.stepOnce();
  expect(port.requests.map((r) => r.command.type)).toEqual(['frame', 'snapshot', 'step']);
  port.flush();
  port.flush();
  const paused = await pause;
  port.flush();
  const stepped = await step;
  expect(stepped.step).toBe(paused.step + 1);
  expect(stepped.time).toBe(paused.time + engine.getConfig().physicsDt);
});

it('discards stale replies after reset without unlocking a newer frame', async () => {
  const { engine, port } = session();
  port.flush();
  engine.runFrame(1000);
  const oldPause = engine.pause().catch((error: Error) => error.name);
  const document = fixture();
  document.bodies[1]!.mass *= 2;
  engine.reset(document, 1234);
  engine.runFrame(2000);
  expect(await oldPause).toBe('AbortError');
  port.flush(); // obsolete frame
  port.flush(); // obsolete pause
  expect(engine.getSnapshot().time).toBe(1234);
  port.flush(); // new init
  port.flush(); // new frame
  expect(engine.getSnapshot().bodies[1]!.mass).toBe(document.bodies[1]!.mass);
  expect(engine.getSnapshot().time).toBeGreaterThan(1234);
});

it('reports errors and timeouts while preserving the last confirmed state', () => {
  vi.useFakeTimers();
  const { engine, port } = session();
  port.flush();
  const confirmed = engine.getSnapshot();
  const failed = vi.fn();
  engine.onFailure = failed;
  engine.runFrame(1000);
  vi.advanceTimersByTime(5001);
  expect(failed).toHaveBeenCalledOnce();
  expect(port.terminated).toBe(true);
  expect(engine.getSnapshot()).toBe(confirmed);
});

it('publishes only states with fresh diagnostics while rendering newer positions', async () => {
  const { engine, port } = session();
  port.flush();
  engine.runFrame(1000); port.flush();
  await Promise.resolve(); await Promise.resolve();
  const published = engine.getPublishedSnapshot();
  engine.runFrame(1020); port.flush();
  expect(engine.getSnapshot().time).toBeGreaterThan(published.time);
  expect(engine.getPublishedSnapshot()).toBe(published);
  const pause = engine.pause(); port.flush(); await pause;
  expect(engine.getPublishedSnapshot()).toBe(engine.getSnapshot());
});

it('marks a newly requested higher scale as limited while its acknowledgment is pending', () => {
  const { engine, port } = session();
  port.flush();
  engine.runFrame(1000); port.flush();
  engine.setTimeScale(31_557_600);
  expect(engine.getPublishedSnapshot().timeScale.requestedTimeScale).toBe(31_557_600);
  expect(engine.getPublishedSnapshot().timeScale.isCapped).toBe(true);
  port.flush();
  expect(engine.getSnapshot().timeScale.requestedTimeScale).toBe(31_557_600);
});

it('bounds actual trail samples and marks discarded history as discontinuous', () => {
  const document = fixture();
  document.config.simulationTimeScale = document.config.physicsDt * 60 * 2000;
  const runner = new SimulationWorkerRunner();
  runner.handle({ id: 1, generation: 1, command: { type: 'init', document, initialTime: 0 } });
  const response = runner.handle({ id: 2, generation: 1, command: { type: 'frame', nowMs: 1000 } });
  if (response.type !== 'state') throw new Error(response.message);
  expect(response.packed.trails!.count).toBe(MAX_TRAIL_SAMPLES);
  expect(response.packed.trails!.truncated).toBe(true);
  expect(response.packed.trails!.positions.length).toBe(MAX_TRAIL_SAMPLES * 2 * document.bodies.length);
});

it('keeps lunar trail samples relative to their parent', () => {
  const document = scenarioToDocument(solarSystemFull);
  document.config = { ...document.config, frameBudgetMs: 1e6, simulationTimeScale: 120 * 60 * 8 };
  const runner = new SimulationWorkerRunner();
  runner.handle({ id: 1, generation: 1, command: { type: 'init', document, initialTime: 0 } });
  const response = runner.handle({ id: 2, generation: 1, command: { type: 'frame', nowMs: 1000 } });
  if (response.type !== 'state') throw new Error(response.message);
  const state = unpackSnapshot(response.packed, createSimulationRuntime({ document }).getSnapshot());
  const moonIndex = state.bodies.findIndex((b) => b.name === 'Luna');
  const moon = state.bodies[moonIndex]!;
  const earth = state.bodies.find((b) => b.id === moon.parentId)!;
  const samples = response.packed.trails!;
  const offset = ((samples.count - 1) * samples.ids.length + moonIndex) * 2;
  expect(samples.positions[offset]).toBe(moon.position.x - earth.position.x);
  expect(samples.positions[offset + 1]).toBe(moon.position.y - earth.position.y);
});

it('cuts orbital trails when a frame skips a large part of an orbit', () => {
  const document = fixture('orbital');
  document.config.simulationTimeScale = 31_557_600 * 100;
  const runner = new SimulationWorkerRunner();
  runner.handle({ id: 1, generation: 1, command: { type: 'init', document, initialTime: 0 } });
  const response = runner.handle({ id: 2, generation: 1, command: { type: 'frame', nowMs: 1000 } });
  if (response.type !== 'state') throw new Error(response.message);
  expect(response.packed.trails?.count).toBe(1);
  expect(response.packed.trails?.truncated).toBe(true);
});

it('applies collision policy changes sent during a Worker session', async () => {
  const base = fixture();
  const bodies = base.bodies.map((body, i) => ({
    ...body,
    radius: 1e11,
    position: { x: i * 1e8, y: 0 },
    velocity: { x: 0, y: 0 },
  }));
  const document = createDocument('worker-collision-switch', bodies, {
    ...base.config,
    collisionMode: 'merge',
  });
  const port = new DelayedWorker();
  const engine = new WorkerSimulationSession(document, 0, () => port);
  sessions.push(engine);
  port.flush();

  engine.setCollisionMode('ignore');
  port.flush();
  const ignoredStep = engine.stepOnce();
  port.flush();
  expect((await ignoredStep).bodies).toHaveLength(2);

  engine.setCollisionMode('merge');
  port.flush();
  const mergedStep = engine.stepOnce();
  port.flush();
  expect((await mergedStep).bodies).toHaveLength(1);
});

it('keeps the interpolated Worker frame as latestSnapshot when the store publishes', () => {
  const document = fixture('orbital');
  const port = new DelayedWorker();
  const engine = new WorkerSimulationSession(document, 0, () => port);
  sessions.push(engine);
  const previous = useSimulationStore.getState();
  const render = vi.fn();
  const renderer = { render };
  const clock = vi.spyOn(performance, 'now')
    .mockReturnValueOnce(1000) // init acknowledgment
    .mockReturnValueOnce(1010) // first frame acknowledgment
    .mockReturnValueOnce(1012) // store tick start
    .mockReturnValueOnce(1013); // store tick end
  try {
    port.flush();
    engine.runFrame(1000);
    port.flush();
    const published = engine.getPublishedSnapshot();
    expect(published.time).toBeGreaterThan(0);

    useSimulationStore.setState({
      engine,
      executionMode: 'worker',
      snapshot: published,
      playing: true,
      renderer: renderer as never,
    });
    const rendered = engine.getRenderSnapshot(1012);
    expect(rendered.bodies[1]!.position).not.toEqual(published.bodies[1]!.position);

    useSimulationStore.getState().tick(1012);

    expect(render).toHaveBeenCalledOnce();
    expect(latestSnapshot()!.bodies).toEqual(rendered.bodies);
    expect(latestSnapshot()!.bodies[1]!.position).not.toEqual(published.bodies[1]!.position);
  } finally {
    clock.mockRestore();
    useSimulationStore.setState(previous, true);
  }
});

it('switches transport without changing physical state, then acknowledges store pause and step', async () => {
  const ports: DelayedWorker[] = [];
  vi.stubGlobal('Worker', class extends DelayedWorker { constructor() { super(); ports.push(this); } });
  const previous = useSimulationStore.getState();
  const direct = createSimulationRuntime({ document: fixture() });
  direct.stepOnce();
  const before = direct.getSnapshot();
  useSimulationStore.setState({ engine: direct, snapshot: before, executionMode: 'main', playing: false });
  try {
    useSimulationStore.getState().setExecutionMode('worker');
    const worker = useSimulationStore.getState().engine as WorkerSimulationSession;
    sessions.push(worker);
    const port = ports[0]!;
    port.flush();
    expect(worker.getBodies()).toEqual(direct.getBodies());
    expect(worker.getSnapshot().time).toBe(before.time);
    useSimulationStore.getState().stepForward();
    port.flush();
    await Promise.resolve();
    expect(useSimulationStore.getState().snapshot!.time).toBe(before.time + before.timeScale.physicsDt);
    worker.runFrame(1000);
    useSimulationStore.getState().setPlaying(false);
    port.flush(); // outstanding frame
    port.flush(); // acknowledged pause
    await Promise.resolve();
    expect(useSimulationStore.getState().snapshot).toEqual(worker.getSnapshot());
    const confirmed = worker.getSnapshot();
    useSimulationStore.getState().setExecutionMode('main');
    expect(port.terminated).toBe(true);
    expect(useSimulationStore.getState().engine!.getBodies()).toEqual(confirmed.bodies);
    expect(useSimulationStore.getState().snapshot!.time).toBe(confirmed.time);
  } finally {
    const engine = useSimulationStore.getState().engine;
    if (engine instanceof WorkerSimulationSession) engine.dispose();
    useSimulationStore.setState(previous, true);
  }
});

it('displays Worker failure in the store and permits explicit recovery', async () => {
  const ports: DelayedWorker[] = [];
  vi.stubGlobal('Worker', class extends DelayedWorker { constructor() { super(); ports.push(this); } });
  const previous = useSimulationStore.getState();
  try {
    useSimulationStore.getState().setExecutionMode('worker');
    const worker = useSimulationStore.getState().engine as WorkerSimulationSession;
    sessions.push(worker);
    ports[0]!.flush();
    const before = worker.getBodies();
    ports[0]!.onerror?.({} as ErrorEvent);
    expect(useSimulationStore.getState().workerError).toMatch(/Worker/);
    expect(useSimulationStore.getState().playing).toBe(false);
    useSimulationStore.getState().setExecutionMode('main');
    expect(useSimulationStore.getState().workerError).toBeNull();
    expect(useSimulationStore.getState().engine!.getBodies()).toEqual(before);
  } finally { useSimulationStore.setState(previous, true); }
});

it('reports an immediate postMessage startup failure instead of silently freezing', async () => {
  vi.stubGlobal('Worker', class extends DelayedWorker { postMessage() { throw new Error('blocked'); } });
  const previous = useSimulationStore.getState();
  try {
    useSimulationStore.getState().setExecutionMode('worker');
    const engine = useSimulationStore.getState().engine as WorkerSimulationSession;
    sessions.push(engine);
    await Promise.resolve();
    expect(useSimulationStore.getState().workerError).toMatch(/Worker/);
    expect(useSimulationStore.getState().playing).toBe(false);
  } finally { useSimulationStore.setState(previous, true); }
});

it('interpolates only short render displacements without modifying physics or diagnostics', () => {
  const initial = createSimulationRuntime({ document: fixture() }).getSnapshot();
  const current: SimSnapshot = {
    ...initial,
    bodies: initial.bodies.map((b, i) => i === 1 ? { ...b, position: { x: b.position.x, y: 1e8 } } : b),
  };
  const rendered = interpolateSnapshot(initial, current, 0.5);
  expect(rendered.bodies[1]!.position.y).toBe(5e7);
  expect(current.bodies[1]!.position.y).toBe(1e8);
  expect(rendered.diagnostics).toBe(current.diagnostics);
  const far = { ...current, bodies: current.bodies.map((b, i) => i === 1 ? { ...b, position: { x: -b.position.x, y: 0 } } : b) };
  expect(interpolateSnapshot(initial, far, 0.5).bodies[1]!.position).toEqual(far.bodies[1]!.position);
});

it('measures render cadence and clears background gaps', () => {
  const monitor = new FramePerformance();
  let stats;
  for (let i = 0; i < 120; i++) stats = monitor.record(i * 1000 / 60) ?? stats;
  expect(stats!.fps).toBeCloseTo(60, 5);
  expect(monitor.record(10_000)).toBeUndefined();
});

it('round-trips a packed snapshot without mutation', () => {
  const snapshot = createSimulationRuntime({ document: fixture() }).getSnapshot();
  const packed = packSnapshot(snapshot, true);
  expect(packed.kinematics).toBeInstanceOf(Float64Array);
  expect(unpackSnapshot(packed, snapshot)).toEqual(snapshot);
});
