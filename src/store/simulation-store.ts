import { create } from 'zustand';
import { createSimulationRuntime } from '@/sim/engine/create-runtime';
import type { SimulationRuntime } from '@/sim/engine/runtime';
import { createDocument } from '@/sim/document/simulation-document';
import { scenarioToDocument, solarSystem } from '@/sim/scenarios';
import type { CelestialBody, EngineKind, SimSnapshot, ScenarioPreset, Vec2 } from '@/sim/types';
import { CanvasRenderer, type BodyScaleMode } from '@/render/canvas-renderer';
import { makeBodyAtPosition } from '@/sim/orbit/compute-orbit';
import { makeVisual, nextCatalogBodyId } from '@/sim/catalog/solar-system';
import { resolvePhysicsDt } from '@/sim/config/physics-dt';

export interface SimulationStore {
  engine: SimulationRuntime | null;
  snapshot: SimSnapshot | null;
  playing: boolean;
  selectedId: string | null;
  followId: string | null;
  showDebug: boolean;
  bodyScaleMode: BodyScaleMode;
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
  setPlacementMode: (enabled: boolean) => void;
  addBodyAtPosition: (position: Vec2) => boolean;
  updateBody: (body: CelestialBody) => void;
  addBody: (body: CelestialBody) => void;
  addBodies: (bodies: CelestialBody[]) => void;
  removeBody: (id: string) => void;
  setCollisionMode: (mode: 'merge' | 'ignore') => void;
  attachRenderer: (renderer: CanvasRenderer) => void;
  tick: (nowMs: number) => void;
  fitCamera: () => void;
}

function initEngine(scenario: ScenarioPreset = solarSystem): SimulationRuntime {
  return createSimulationRuntime({ document: scenarioToDocument(scenario) });
}

const initialEngine = initEngine();

function getSafePhysicsDt(bodies: CelestialBody[], currentDt: number): number {
  return resolvePhysicsDt(bodies, currentDt);
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  engine: initialEngine,
  snapshot: initialEngine.getSnapshot(),
  playing: false,
  selectedId: null,
  followId: null,
  showDebug: false,
  bodyScaleMode: 'relative',
  placementMode: false,
  placementError: null,
  currentScenarioId: solarSystem.id,
  renderer: null,

  loadScenario: (scenario) => {
    const kind = get().engine?.getEngineKind() ?? 'nbody';
    const base = scenarioToDocument(scenario);
    const engine = createSimulationRuntime({
      document: { ...base, config: { ...base.config, engineKind: kind } },
    });
    const renderer = get().renderer;
    renderer?.clearTrails();
    set({
      engine,
      snapshot: engine.getSnapshot(),
      playing: false,
      selectedId: null,
      followId: null,
      placementMode: false,
      placementError: null,
      currentScenarioId: scenario.id,
    });
    get().fitCamera();
  },

  setPlaying: (playing) => set({ playing }),

  stepForward: () => {
    const { engine } = get();
    if (!engine) return;
    set({ snapshot: engine.stepOnce() });
  },

  setTimeScale: (scale) => {
    const { engine } = get();
    engine?.setTimeScale(scale);
    set({ snapshot: engine?.getSnapshot() ?? null });
  },

  setEngineKind: (kind) => {
    const { engine, renderer } = get();
    if (!engine) return;
    const config = { ...engine.getConfig(), engineKind: kind };
    const bodies = engine.getBodies();
    const time = engine.getSnapshot().time;
    const doc = createDocument('custom', bodies, config);
    const next = createSimulationRuntime({ document: doc, initialTime: time });
    renderer?.clearTrails();
    set({ engine: next, snapshot: next.getSnapshot(), playing: false });
  },

  setSelectedId: (id) => set({ selectedId: id }),

  setFollowId: (id) => set({ followId: id }),

  toggleDebug: () => set((s) => ({ showDebug: !s.showDebug })),

  setBodyScaleMode: (mode) => set({ bodyScaleMode: mode }),

  toggleBodyScaleMode: () =>
    set((s) => ({ bodyScaleMode: s.bodyScaleMode === 'relative' ? 'real' : 'relative' })),

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
    const bodies = [...engine.getBodies(), body];
    const config = engine.getConfig();
    const safeDt = getSafePhysicsDt(bodies, config.physicsDt);
    const doc = createDocument('custom', bodies, { ...config, physicsDt: safeDt });
    engine.reset(doc);
    set({ snapshot: engine.getSnapshot() });
  },

  addBodies: (newBodies) => {
    const { engine } = get();
    if (!engine) return;
    const bodies = [...engine.getBodies(), ...newBodies];
    const config = engine.getConfig();
    const safeDt = getSafePhysicsDt(bodies, config.physicsDt);
    const doc = createDocument('custom', bodies, { ...config, physicsDt: safeDt });
    engine.reset(doc);
    set({ snapshot: engine.getSnapshot() });
  },

  removeBody: (id) => {
    const { engine } = get();
    if (!engine) return;
    const bodies = engine.getBodies().filter((b) => b.id !== id);
    const config = engine.getConfig();
    const safeDt = getSafePhysicsDt(bodies, config.physicsDt);
    const doc = createDocument('custom', bodies, { ...config, physicsDt: safeDt });
    engine.reset(doc);
    set({ snapshot: engine.getSnapshot(), selectedId: null });
  },

  setCollisionMode: (mode) => {
    const { engine } = get();
    engine?.setCollisionMode(mode);
    set({ snapshot: engine?.getSnapshot() ?? null });
  },

  attachRenderer: (renderer) => set({ renderer }),

  tick: (nowMs) => {
    const { engine, playing, renderer, snapshot, selectedId, followId, showDebug, bodyScaleMode } = get();
    if (!engine || !renderer) return;

    const next = playing ? engine.runFrame(nowMs) : snapshot ?? engine.getSnapshot();
    renderer.render(next, { selectedId, followId, showDebug, bodyScaleMode });
    set({ snapshot: next });
  },

  fitCamera: () => {
    const { renderer, snapshot } = get();
    if (!renderer || !snapshot) return;
    renderer.camera.fitBodies(snapshot.bodies.map((b) => b.position));
  },
}));
