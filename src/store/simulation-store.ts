import { create } from 'zustand';
import { createSimulationRuntime } from '@/sim/engine/create-runtime';
import type { SimulationRuntime } from '@/sim/engine/runtime';
import { createDocument } from '@/sim/document/simulation-document';
import { scenarioToDocument, solarSystem } from '@/sim/scenarios';
import type { CelestialBody, EngineKind, SimSnapshot, ScenarioPreset, Vec2 } from '@/sim/types';
import { CanvasRenderer, type BodyScaleMode } from '@/render/canvas-renderer';
import { DEFAULT_RELATIVE_SUN_DISPLAY_PX, DEFAULT_REAL_SUN_DISPLAY_PX, MAX_REAL_SUN_DISPLAY_PX, MIN_REAL_SUN_DISPLAY_PX } from '@/sim/visual/display-radius';
import { makeBodyAtPosition } from '@/sim/orbit/compute-orbit';
import { applySatelliteRecoil, makeVisual, nextCatalogBodyId } from '@/sim/catalog/solar-system';
import { resolvePhysicsDt } from '@/sim/config/physics-dt';
import { WorkerSimulationSession, cancelled } from '@/runtime/worker-session';
import { PhysicsTrailSampler } from '@/sim/worker/trail-sampler';
import type { SimulationDocument } from '@/sim/types';
import { FramePerformance } from '@/render/frame-performance';

type BrowserSession = SimulationRuntime | WorkerSimulationSession;
export type ExecutionMode = 'main' | 'worker';
const defaultExecutionMode: ExecutionMode = typeof Worker !== 'undefined' ? 'worker' : 'main';

function makeSession(document: SimulationDocument, initialTime = 0, mode = defaultExecutionMode): BrowserSession {
  if (mode === 'main') return createSimulationRuntime({ document, initialTime });
  const session = new WorkerSimulationSession(document, initialTime);
  session.onFailure = (message) => {
    if (useSimulationStore.getState().engine === session) {
      useSimulationStore.setState({ workerError: message, playing: false, snapshot: session.getPublishedSnapshot() });
    }
  };
  const startupError = session.getError();
  if (startupError) queueMicrotask(() => session.onFailure?.(startupError));
  return session;
}

function disposeSession(engine: BrowserSession | null): void {
  if (engine instanceof WorkerSimulationSession) engine.dispose();
}

function acknowledge(engine: BrowserSession, result: Promise<SimSnapshot>): void {
  void result.then((snapshot) => {
    if (useSimulationStore.getState().engine === engine && !useSimulationStore.getState().playing) {
      useSimulationStore.setState({ snapshot });
    }
  }).catch((error: unknown) => {
    if (!cancelled(error) && useSimulationStore.getState().engine === engine) {
      useSimulationStore.setState({ workerError: error instanceof Error ? error.message : String(error), playing: false });
    }
  });
}

export interface SimulationStore {
  engine: BrowserSession | null;
  executionMode: ExecutionMode;
  workerError: string | null;
  renderStats: { fps: number; p95FrameMs: number; p95WorkMs: number } | null;
  setExecutionMode: (mode: ExecutionMode) => void;
  snapshot: SimSnapshot | null;
  playing: boolean;
  selectedId: string | null;
  followId: string | null;
  showDebug: boolean;
  bodyScaleMode: BodyScaleMode;
  /** Screen radius (px) of the Sun in relative scale mode. */
  relativeSunDisplayPx: number;
  /** Screen radius (px) of the scale reference in real mode at zoom = 1. */
  realSunDisplayPx: number;
  placementMode: boolean;
  placementError: string | null;
  currentScenarioId: string;
  renderer: CanvasRenderer | null;

  loadScenario: (scenario: ScenarioPreset) => void;
  setPlaying: (playing: boolean) => void;
  stepForward: () => void;
  setTimeScale: (scale: number) => void;
  setEngineKind: (kind: EngineKind) => void;
  setSelectedId: (id: string | null) => void;
  setFollowId: (id: string | null) => void;
  toggleDebug: () => void;
  setBodyScaleMode: (mode: BodyScaleMode) => void;
  toggleBodyScaleMode: () => void;
  setRelativeSunDisplayPx: (px: number) => void;
  setRealSunDisplayPx: (px: number) => void;
  setPlacementMode: (enabled: boolean) => void;
  addBodyAtPosition: (position: Vec2) => boolean;
  updateBody: (body: CelestialBody) => void;
  addBody: (body: CelestialBody) => void;
  addBodies: (bodies: CelestialBody[]) => void;
  removeBody: (id: string) => void;
  setCollisionMode: (mode: 'merge' | 'ignore') => void;
  attachRenderer: (renderer: CanvasRenderer) => void;
  tick: (nowMs: number) => void;
  /** Fit all bodies in view (Centrar). */
  fitCamera: () => void;
  /** Default framing: fit in relative mode, centre reference at zoom=1 in real mode. */
  resetCameraView: () => void;
  zoomBy: (factor: number) => void;
}

function initEngine(scenario: ScenarioPreset = solarSystem): BrowserSession {
  return makeSession(scenarioToDocument(scenario));
}

let initialWorkerError: string | null = null;
const initialEngine = (() => {
  try { return initEngine(); }
  catch {
    initialWorkerError = 'No se pudo iniciar el Worker. Selecciona Hilo principal para continuar.';
    return createSimulationRuntime({ document: scenarioToDocument(solarSystem) });
  }
})();

/**
 * While playing, React panels receive a new snapshot at most this often. The
 * canvas still renders every frame from the engine; publishing 60 snapshots/s
 * to the store re-rendered the whole toolbar and catalog on every frame.
 */
export const UI_SNAPSHOT_INTERVAL_MS = 100;
let lastSnapshotPublishMs = -Infinity;
const framePerformance = new FramePerformance();
/** Snapshot of the latest frame or store update (fresher than the throttled `snapshot`). */
let liveSnapshot: SimSnapshot | null = null;

/** Latest rendered bodies for camera/hit-testing; interpolation and cached diagnostics are visual only. */
export function latestSnapshot(): SimSnapshot | null {
  return liveSnapshot;
}

function getSafePhysicsDt(bodies: CelestialBody[], currentDt: number): number {
  return resolvePhysicsDt(bodies, currentDt);
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  engine: initialEngine,
  executionMode: initialEngine instanceof WorkerSimulationSession ? 'worker' : 'main',
  workerError: initialWorkerError,
  renderStats: null,
  snapshot: initialEngine.getSnapshot(),
  playing: false,
  selectedId: null,
  followId: null,
  showDebug: false,
  bodyScaleMode: 'relative',
  relativeSunDisplayPx: DEFAULT_RELATIVE_SUN_DISPLAY_PX,
  realSunDisplayPx: DEFAULT_REAL_SUN_DISPLAY_PX,
  placementMode: false,
  placementError: null,
  currentScenarioId: solarSystem.id,
  renderer: null,

  setExecutionMode: (mode) => {
    const { engine, renderer } = get();
    if (!engine) return;
    try {
      const document = createDocument('custom', engine.getBodies(), engine.getConfig());
      const next = makeSession(document, engine.getSnapshot().time, mode);
      disposeSession(engine);
      renderer?.clearTrails();
      framePerformance.reset();
      set({ engine: next, executionMode: mode, snapshot: next.getSnapshot(), playing: false, workerError: null, renderStats: null });
    } catch (error) {
      set({ workerError: error instanceof Error ? error.message : String(error), playing: false });
    }
  },

  loadScenario: (scenario) => {
    const kind = get().engine?.getEngineKind() ?? 'nbody';
    const base = scenarioToDocument(scenario);
    const engine = makeSession({ ...base, config: { ...base.config, engineKind: kind } }, 0, get().executionMode);
    disposeSession(get().engine);
    const renderer = get().renderer;
    renderer?.clearTrails();
    framePerformance.reset();
    set({
      engine,
      workerError: null,
      renderStats: null,
      snapshot: engine.getSnapshot(),
      playing: false,
      selectedId: null,
      followId: null,
      placementMode: false,
      placementError: null,
      currentScenarioId: scenario.id,
    });
    get().resetCameraView();
  },

  setPlaying: (playing) => {
    // Publish the live state on pause: the store copy may lag by one UI interval.
    const { engine } = get();
    set(playing ? { playing } : { playing, snapshot: engine?.getSnapshot() ?? null });
    if (!playing && engine instanceof WorkerSimulationSession) acknowledge(engine, engine.pause());
  },

  stepForward: () => {
    const { engine } = get();
    if (!engine) return;
    const result = engine.stepOnce();
    if (result instanceof Promise) acknowledge(engine, result);
    else set({ snapshot: result });
  },

  setTimeScale: (scale) => {
    const { engine } = get();
    engine?.setTimeScale(scale);
    set({ snapshot: engine instanceof WorkerSimulationSession ? engine.getPublishedSnapshot() : engine?.getSnapshot() ?? null });
  },

  setEngineKind: (kind) => {
    const { engine, renderer } = get();
    if (!engine) return;
    const config = { ...engine.getConfig(), engineKind: kind };
    const bodies = engine.getBodies();
    const time = engine.getSnapshot().time;
    const doc = createDocument('custom', bodies, config);
    const next = makeSession(doc, time, get().executionMode);
    disposeSession(engine);
    renderer?.clearTrails();
    set({ engine: next, snapshot: next.getSnapshot(), playing: false, workerError: null });
  },

  setSelectedId: (id) => {
    // Selecting a body starts camera follow (auto-scroll); clearing selection keeps follow.
    if (id) set({ selectedId: id, followId: id });
    else set({ selectedId: null });
  },

  setFollowId: (id) => set({ followId: id }),

  toggleDebug: () => set((s) => ({ showDebug: !s.showDebug })),

  setBodyScaleMode: (mode) => {
    set({ bodyScaleMode: mode });
    get().resetCameraView();
  },

  toggleBodyScaleMode: () => {
    const next = get().bodyScaleMode === 'relative' ? 'real' : 'relative';
    get().setBodyScaleMode(next);
  },

  setRelativeSunDisplayPx: (px) => {
    const clamped = Math.min(64, Math.max(12, px));
    set({ relativeSunDisplayPx: clamped });
  },

  setRealSunDisplayPx: (px) => {
    const clamped = Math.min(MAX_REAL_SUN_DISPLAY_PX, Math.max(MIN_REAL_SUN_DISPLAY_PX, px));
    set({ realSunDisplayPx: clamped });
  },

  setPlacementMode: (enabled) =>
    set({
      placementMode: enabled,
      placementError: null,
      playing: enabled ? false : get().playing,
    }),

  addBodyAtPosition: (position) => {
    const { engine } = get();
    if (!engine) return false;

    const body = makeBodyAtPosition(position, engine.getBodies(), () => nextCatalogBodyId('custom'), makeVisual);
    if (!body) {
      set({ placementError: 'Demasiado cerca de otro cuerpo' });
      return false;
    }

    const bodies = [...engine.getBodies(), body];
    const config = engine.getConfig();
    const safeDt = getSafePhysicsDt(bodies, config.physicsDt);
    const doc = createDocument('custom', bodies, { ...config, physicsDt: safeDt });
    engine.reset(doc);
    get().renderer?.clearTrails();
    set({
      snapshot: engine.getSnapshot(),
      selectedId: body.id,
      placementError: null,
    });
    return true;
  },

  updateBody: (body) => {
    const { engine } = get();
    if (!engine) return;

    if (
      !Number.isFinite(body.mass) ||
      body.mass <= 0 ||
      !Number.isFinite(body.radius) ||
      body.radius <= 0 ||
      !Number.isFinite(body.position.x) ||
      !Number.isFinite(body.position.y) ||
      !Number.isFinite(body.velocity.x) ||
      !Number.isFinite(body.velocity.y)
    ) {
      return;
    }

    const bodies = engine.getBodies();
    const exists = bodies.some((b) => b.id === body.id);
    const updated = exists
      ? bodies.map((b) => (b.id === body.id ? body : b))
      : [...bodies, body];
    const config = engine.getConfig();
    const safeDt = getSafePhysicsDt(updated, config.physicsDt);
    const doc = createDocument('custom', updated, { ...config, physicsDt: safeDt });
    engine.reset(doc);
    get().renderer?.clearTrails();
    set({ snapshot: engine.getSnapshot(), playing: false });
  },

  addBody: (body) => {
    const { engine } = get();
    if (!engine) return;
    const bodies = applySatelliteRecoil([...engine.getBodies(), body], new Set([body.id]));
    const config = engine.getConfig();
    const safeDt = getSafePhysicsDt(bodies, config.physicsDt);
    const doc = createDocument('custom', bodies, { ...config, physicsDt: safeDt });
    engine.reset(doc);
    get().renderer?.clearTrails();
    set({ snapshot: engine.getSnapshot() });
  },

  addBodies: (newBodies) => {
    const { engine } = get();
    if (!engine) return;
    // New moons share momentum with their (possibly already running) parent.
    const bodies = applySatelliteRecoil(
      [...engine.getBodies(), ...newBodies],
      new Set(newBodies.map((b) => b.id)),
    );
    const config = engine.getConfig();
    const safeDt = getSafePhysicsDt(bodies, config.physicsDt);
    const doc = createDocument('custom', bodies, { ...config, physicsDt: safeDt });
    engine.reset(doc);
    get().renderer?.clearTrails();
    set({ snapshot: engine.getSnapshot() });
  },

  removeBody: (id) => {
    const { engine, followId, selectedId } = get();
    if (!engine) return;
    const bodies = engine.getBodies().filter((b) => b.id !== id);
    const config = engine.getConfig();
    const safeDt = getSafePhysicsDt(bodies, config.physicsDt);
    const doc = createDocument('custom', bodies, { ...config, physicsDt: safeDt });
    engine.reset(doc);
    get().renderer?.clearTrails();
    set({
      snapshot: engine.getSnapshot(),
      selectedId: selectedId === id ? null : selectedId,
      followId: followId === id ? null : followId,
    });
  },

  setCollisionMode: (mode) => {
    const { engine } = get();
    engine?.setCollisionMode(mode);
    set({ snapshot: engine?.getSnapshot() ?? null });
  },

  attachRenderer: (renderer) => set({ renderer }),

  tick: (nowMs) => {
    const workStart = performance.now();
    const renderStats = framePerformance.record(nowMs);
    if (renderStats) set({ renderStats });
    const {
      engine,
      playing,
      renderer,
      snapshot,
      selectedId,
      followId,
      showDebug,
      bodyScaleMode,
      relativeSunDisplayPx,
      realSunDisplayPx,
    } = get();
    if (!engine || !renderer) return;

    const publishSnapshot = !playing || nowMs - lastSnapshotPublishMs >= UI_SNAPSHOT_INTERVAL_MS;
    const worker = engine instanceof WorkerSimulationSession ? engine : null;
    const sampler = !worker && playing ? new PhysicsTrailSampler() : null;
    const next = playing
      ? engine.runFrame(nowMs, {
        cachedDiagnostics: publishSnapshot ? undefined : snapshot?.diagnostics,
        onStep: sampler?.observe,
      })
      : snapshot ?? engine.getSnapshot();
    const samples = sampler?.finish(next, next.time - (liveSnapshot?.time ?? next.time));
    const rendered = playing && worker ? worker.getRenderSnapshot(nowMs) : next;
    liveSnapshot = rendered;
    const trailSamples = worker ? worker.drainTrails() : samples ? [samples] : [];
    renderer.render(rendered, {
      selectedId,
      followId,
      showDebug,
      bodyScaleMode,
      relativeSunDisplayPx,
      realSunDisplayPx,
      playing,
      visualNowMs: nowMs,
      trailSamples: !playing && trailSamples.length === 0 ? undefined : trailSamples,
    });
    if (!publishSnapshot) {
      framePerformance.completeFrame(performance.now() - workStart);
      return;
    }
    lastSnapshotPublishMs = nowMs;
    set({ snapshot: playing && worker ? worker.getPublishedSnapshot() : next });
    // The store subscription tracks explicit snapshot updates, but this frame
    // drew an interpolated Worker state that hit-testing must continue to use.
    liveSnapshot = rendered;
    framePerformance.completeFrame(performance.now() - workStart);
  },

  fitCamera: () => {
    const { renderer, bodyScaleMode, realSunDisplayPx, relativeSunDisplayPx } = get();
    const snapshot = latestSnapshot();
    if (!renderer || !snapshot) return;
    renderer.fitBodies(snapshot.bodies, {
      mode: bodyScaleMode,
      realSunDisplayPx,
      relativeSunDisplayPx,
    });
  },

  resetCameraView: () => {
    const { renderer, bodyScaleMode, realSunDisplayPx, relativeSunDisplayPx } = get();
    const snapshot = latestSnapshot();
    if (!renderer || !snapshot) return;
    const opts = { mode: bodyScaleMode, realSunDisplayPx, relativeSunDisplayPx };
    if (bodyScaleMode === 'real') {
      renderer.centerOnReference(snapshot.bodies, opts);
    } else {
      renderer.fitBodies(snapshot.bodies, opts);
    }
  },

  zoomBy: (factor) => {
    const { renderer } = get();
    if (!renderer) return;
    const { width, height } = renderer.camera;
    renderer.zoomAt(factor, width / 2, height / 2);
  },
}));

liveSnapshot = useSimulationStore.getState().snapshot;
useSimulationStore.subscribe((state, prev) => {
  if (state.snapshot !== prev.snapshot) liveSnapshot = state.snapshot;
});
