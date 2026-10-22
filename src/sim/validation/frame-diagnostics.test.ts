import { afterEach, describe, expect, it, vi } from 'vitest';
import * as conservation from '../diagnostics/conservation';
import { createSimulationRuntime } from '../engine/create-runtime';
import { earthMoon, scenarioToDocument, sunEarthCircular } from '../scenarios';
import type { EngineKind } from '../types';
import { latestSnapshot, useSimulationStore } from '../../store/simulation-store';
import type { CanvasRenderer } from '../../render/canvas-renderer';

function runtime(kind: EngineKind) {
  const document = scenarioToDocument(sunEarthCircular);
  document.config = {
    ...document.config,
    engineKind: kind,
    simulationTimeScale: document.config.physicsDt * 60,
    frameBudgetMs: 1e6,
  };
  return createSimulationRuntime({ document });
}

afterEach(() => vi.restoreAllMocks());

it('also skips redundant diagnostics while an incompatible orbital scenario stays frozen', () => {
  const document = scenarioToDocument(earthMoon);
  document.config.engineKind = 'orbital';
  const engine = createSimulationRuntime({ document });
  const initial = engine.getSnapshot();
  expect(initial.engineCompatibility.compatible).toBe(false);
  const measure = vi.spyOn(conservation, 'computeConservationMetrics');
  const next = engine.runFrame(undefined, { cachedDiagnostics: initial.diagnostics });
  expect(next.diagnostics).toBe(initial.diagnostics);
  expect(next.time).toBe(initial.time);
  expect(next.bodies).toEqual(initial.bodies);
  expect(measure).not.toHaveBeenCalled();
  engine.getSnapshot();
  expect(measure).toHaveBeenCalledTimes(1);
});

describe.each(['nbody', 'orbital'] as const)('%s render-only diagnostics', (kind) => {
  it('skips diagnostics without changing any physical result; explicit reads stay fresh', () => {
    const engine = runtime(kind);
    const reference = runtime(kind);
    const published = engine.getSnapshot();
    const measure = vi.spyOn(conservation, 'computeConservationMetrics');

    for (let i = 0; i < 6; i++) {
      const next = engine.runFrame(undefined, { cachedDiagnostics: published.diagnostics });
      expect(next.diagnostics).toBe(published.diagnostics);
      expect(next.time).toBeGreaterThan(published.time);
    }
    expect(measure).not.toHaveBeenCalled();
    for (let i = 0; i < 6; i++) reference.runFrame();
    expect(engine.getSnapshot()).toEqual(reference.getSnapshot());

    measure.mockClear();
    engine.runFrame();
    engine.stepOnce();
    engine.getSnapshot();
    expect(measure).toHaveBeenCalledTimes(3);
  });

  it('publishes fresh diagnostics after reset', () => {
    const engine = runtime(kind);
    const old = engine.getSnapshot();
    engine.runFrame(undefined, { cachedDiagnostics: old.diagnostics });
    const document = scenarioToDocument(sunEarthCircular);
    document.config.engineKind = kind;
    document.bodies[1] = { ...document.bodies[1]!, mass: document.bodies[1]!.mass * 2 };
    engine.reset(document, 1234);
    const next = engine.getSnapshot();
    expect(next.time).toBe(1234);
    expect(next.diagnostics).not.toEqual(old.diagnostics);
    expect(next.diagnostics.totalEnergy).toBe(next.diagnostics.initial.totalEnergy);
  });

  it('store samples diagnostics only for publication, and refreshes on pause and step', () => {
    const previous = useSimulationStore.getState();
    const engine = runtime(kind);
    const render = vi.fn();
    const renderer = { render } as unknown as CanvasRenderer;
    useSimulationStore.setState({ engine, renderer, snapshot: engine.getSnapshot(), playing: true });
    const measure = vi.spyOn(conservation, 'computeConservationMetrics');
    // Keep each parameterized case beyond the preceding publication timestamp.
    const start = kind === 'nbody' ? 10_000 : 20_000;
    try {
      useSimulationStore.getState().tick(start);
      const published = useSimulationStore.getState().snapshot!;
      for (let i = 1; i <= 5; i++) useSimulationStore.getState().tick(start + i * 16);
      expect(render).toHaveBeenCalledTimes(6);
      expect(measure).toHaveBeenCalledTimes(1);
      expect(useSimulationStore.getState().snapshot).toBe(published);
      expect(latestSnapshot()!.time).toBeGreaterThan(published.time);

      useSimulationStore.getState().tick(start + 100);
      expect(measure).toHaveBeenCalledTimes(2);
      expect(useSimulationStore.getState().snapshot!.diagnostics).not.toBe(published.diagnostics);
      useSimulationStore.getState().tick(start + 116);
      const liveTime = latestSnapshot()!.time;
      useSimulationStore.getState().setPlaying(false);
      expect(measure).toHaveBeenCalledTimes(3);
      expect(useSimulationStore.getState().snapshot!.time).toBe(liveTime);
      useSimulationStore.getState().stepForward();
      expect(measure).toHaveBeenCalledTimes(4);
      expect(useSimulationStore.getState().snapshot).toEqual(engine.getSnapshot());
    } finally {
      useSimulationStore.setState(previous, true);
    }
  });
});
