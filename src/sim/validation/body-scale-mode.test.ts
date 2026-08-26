import { describe, expect, it } from 'vitest';
import { CanvasRenderer } from '@/render/canvas-renderer';
import { Camera2D } from '@/render/camera2d';
import {
  DEFAULT_RELATIVE_SUN_DISPLAY_PX,
  findScaleReferenceRadius,
  realDisplayRadius,
  relativeDisplayRadius,
} from '../visual/display-radius';
import type { SimSnapshot, SnapshotBody } from '../types';

const R_EARTH = 6.371e6;
const R_SUN = 6.96e8;
const R_JUPITER = 6.991e7;
const AU = 1.496e11;

function createMockCanvas(): HTMLCanvasElement {
  const canvas = {
    getContext: () => ({
      setTransform: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      arc: () => {},
      fill: () => {},
      fillText: () => {},
      closePath: () => {},
      createRadialGradient: () => ({
        addColorStop: () => {},
      }),
    }),
    getBoundingClientRect: () => ({ width: 800, height: 600, top: 0, left: 0 }),
    width: 800,
    height: 600,
  } as unknown as HTMLCanvasElement;
  return canvas;
}

const mockEarth: SnapshotBody = {
  id: 'earth',
  name: 'Tierra',
  mass: 5.972e24,
  radius: R_EARTH,
  position: { x: AU, y: 0 },
  velocity: { x: 0, y: 29780 },
  state: 'dynamic',
  visual: {
    color: '#3b82f6',
    displayRadius: 8,
    showTrail: true,
    trailLength: 400,
  },
};

const mockSun: SnapshotBody = {
  id: 'sun',
  name: 'Sol',
  mass: 1.989e30,
  radius: R_SUN,
  position: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  state: 'fixed',
  visual: {
    color: '#fbbf24',
    displayRadius: DEFAULT_RELATIVE_SUN_DISPLAY_PX,
    showTrail: false,
    trailLength: 0,
  },
};

const mockJupiter: SnapshotBody = {
  id: 'jupiter',
  name: 'Júpiter',
  mass: 1.898e27,
  radius: R_JUPITER,
  position: { x: 7.785e11, y: 0 },
  velocity: { x: 0, y: 13070 },
  state: 'dynamic',
  visual: {
    color: '#f59e0b',
    displayRadius: 16,
    showTrail: true,
    trailLength: 400,
  },
};

function makeSnapshot(bodies: SnapshotBody[]): SimSnapshot {
  return {
    time: 0,
    step: 0,
    bodies,
    diagnostics: {
      kineticEnergy: 0,
      potentialEnergy: 0,
      totalEnergy: 0,
      linearMomentum: { x: 0, y: 0 },
      angularMomentum: 0,
      initial: {
        kineticEnergy: 0,
        potentialEnergy: 0,
        totalEnergy: 0,
        linearMomentum: { x: 0, y: 0 },
        angularMomentum: 0,
      },
      relativeEnergyError: 0,
      relativeMomentumError: 0,
      relativeAngularMomentumError: 0,
    },
    timeScale: {
      requestedTimeScale: 1,
      effectiveTimeScale: 1,
      physicsDt: 3600,
      substepsRequested: 1,
      substepsExecuted: 1,
      isCapped: false,
      capReason: null,
    },
    engineKind: 'nbody',
    engineCompatibility: { compatible: true, code: 'ok', reason: null },
  };
}

describe('Body scale mode (relative vs real)', () => {
  it('computes relative radius from the Sun reference size', () => {
    const canvas = createMockCanvas();
    const camera = new Camera2D();
    camera.zoom = 1e-9;
    const renderer = new CanvasRenderer(canvas, camera);

    renderer.render(makeSnapshot([mockSun, mockEarth, mockJupiter]), {
      bodyScaleMode: 'relative',
      relativeSunDisplayPx: 28,
    });

    expect(renderer.computeBodyRadius(mockSun, 'relative')).toBe(28);
    expect(renderer.computeBodyRadius(mockJupiter, 'relative')).toBeCloseTo(
      relativeDisplayRadius(R_JUPITER, R_SUN, 28),
      6,
    );
    expect(renderer.computeBodyRadius(mockEarth, 'relative')).toBe(
      relativeDisplayRadius(R_EARTH, R_SUN, 28),
    );
    expect(renderer.computeBodyRadius(mockSun, 'relative')).toBeGreaterThan(
      renderer.computeBodyRadius(mockJupiter, 'relative'),
    );
  });

  it('scales all relative disks when the Sun display size changes', () => {
    expect(relativeDisplayRadius(R_JUPITER, R_SUN, 40)).toBeGreaterThan(
      relativeDisplayRadius(R_JUPITER, R_SUN, 20),
    );
    expect(relativeDisplayRadius(R_SUN, R_SUN, 40)).toBe(40);
    expect(relativeDisplayRadius(R_SUN, R_SUN, 20)).toBe(20);
  });

  it('finds Sol/Sun by name as scale reference', () => {
    expect(findScaleReferenceRadius([mockEarth, mockSun, mockJupiter])).toBe(R_SUN);
    expect(findScaleReferenceRadius([mockEarth, mockJupiter])).toBe(R_JUPITER);
  });

  it('computes real radii as exact sun-relative proportions at zoom = 1', () => {
    const canvas = createMockCanvas();
    const camera = new Camera2D();
    camera.zoom = 1;
    const renderer = new CanvasRenderer(canvas, camera);
    const sunPx = 1000;

    renderer.render(makeSnapshot([mockSun, mockEarth, mockJupiter]), {
      bodyScaleMode: 'real',
      realSunDisplayPx: sunPx,
    });

    expect(renderer.computeBodyRadius(mockSun, 'real', sunPx)).toBeCloseTo(sunPx, 6);
    expect(renderer.computeBodyRadius(mockEarth, 'real', sunPx)).toBeCloseTo(
      realDisplayRadius(R_EARTH, sunPx, R_SUN),
      6,
    );
    expect(renderer.computeBodyRadius(mockJupiter, 'real', sunPx)).toBeCloseTo(
      realDisplayRadius(R_JUPITER, sunPx, R_SUN),
      4,
    );
    expect(renderer.computeBodyRadius(mockEarth, 'real', sunPx)).toBeCloseTo(9.15, 1);
  });

  it('scales real positions and radii together when the Sun size changes', () => {
    const canvas = createMockCanvas();
    const camera = new Camera2D();
    camera.zoom = 1;
    camera.center = { x: 0, y: 0 };
    const renderer = new CanvasRenderer(canvas, camera);
    const snapshot = makeSnapshot([mockSun, mockEarth]);

    renderer.render(snapshot, { bodyScaleMode: 'real', realSunDisplayPx: 1000 });
    const earthScreenLarge = renderer.worldToScreen(mockEarth.position.x, mockEarth.position.y);
    const earthRadiusLarge = renderer.computeBodyRadius(mockEarth, 'real', 1000);

    renderer.render(snapshot, { bodyScaleMode: 'real', realSunDisplayPx: 100 });
    const earthScreenSmall = renderer.worldToScreen(mockEarth.position.x, mockEarth.position.y);
    const earthRadiusSmall = renderer.computeBodyRadius(mockEarth, 'real', 100);

    expect((earthScreenLarge.x - 400) / (earthScreenSmall.x - 400)).toBeCloseTo(10, 5);
    expect(earthRadiusLarge / earthRadiusSmall).toBeCloseTo(10, 5);
    expect(earthScreenLarge.x).toBeGreaterThan(earthRadiusLarge);
  });

  it('keeps Earth outside the Sun disk in real mode', () => {
    const canvas = createMockCanvas();
    const camera = new Camera2D();
    camera.zoom = 1;
    camera.center = { x: 0, y: 0 };
    const renderer = new CanvasRenderer(canvas, camera);
    const sunPx = 1000;

    renderer.render(makeSnapshot([mockSun, mockEarth]), {
      bodyScaleMode: 'real',
      realSunDisplayPx: sunPx,
    });

    const sunR = renderer.computeBodyRadius(mockSun, 'real', sunPx);
    const earthR = renderer.computeBodyRadius(mockEarth, 'real', sunPx);
    const earthScreen = renderer.worldToScreen(mockEarth.position.x, mockEarth.position.y);
    const orbitPx = Math.hypot(earthScreen.x - 400, earthScreen.y - 300);

    expect(orbitPx).toBeGreaterThan(sunR + earthR);
  });

  it('round-trips screen/world coordinates in real mode', () => {
    const canvas = createMockCanvas();
    const camera = new Camera2D();
    camera.zoom = 2;
    camera.center = { x: 1e10, y: -2e10 };
    const renderer = new CanvasRenderer(canvas, camera);

    renderer.render(makeSnapshot([mockSun, mockEarth]), {
      bodyScaleMode: 'real',
      realSunDisplayPx: 500,
    });

    const world = { x: 1.2e11, y: 3.4e10 };
    const screen = renderer.worldToScreen(world.x, world.y);
    const back = renderer.screenToWorld(screen.x, screen.y);

    expect(back.x).toBeCloseTo(world.x, 3);
    expect(back.y).toBeCloseTo(world.y, 3);
  });

  it('hitTest works in both relative and real modes', () => {
    const canvas = createMockCanvas();
    const camera = new Camera2D();
    camera.setSize(800, 600);
    camera.center = { x: 0, y: 0 };
    camera.zoom = 1e-9;
    const renderer = new CanvasRenderer(canvas, camera);
    const snapshot = makeSnapshot([mockSun]);

    expect(renderer.hitTest(snapshot, 400, 300, 'relative', 28)).toBe('sun');
    expect(renderer.hitTest(snapshot, 420, 300, 'relative', 28)).toBe('sun');
    expect(renderer.hitTest(snapshot, 450, 300, 'relative', 28)).toBeNull();

    camera.zoom = 1;
    renderer.render(snapshot, { bodyScaleMode: 'real', realSunDisplayPx: 28 });
    expect(renderer.hitTest(snapshot, 400, 300, 'real', undefined, 28)).toBe('sun');
    expect(renderer.hitTest(snapshot, 410, 300, 'real', undefined, 28)).toBe('sun');
    expect(renderer.hitTest(snapshot, 435, 300, 'real', undefined, 28)).toBeNull();
  });

  it('centers the Sun at the slider radius in real mode at zoom = 1', () => {
    const canvas = createMockCanvas();
    const camera = new Camera2D();
    camera.setSize(800, 600);
    const renderer = new CanvasRenderer(canvas, camera);
    const snapshot = makeSnapshot([mockSun, mockEarth, mockJupiter]);
    const sunPx = 1000;

    renderer.centerOnReference(snapshot.bodies, { mode: 'real', realSunDisplayPx: sunPx });
    renderer.render(snapshot, { bodyScaleMode: 'real', realSunDisplayPx: sunPx });

    expect(renderer.camera.zoom).toBe(1);
    expect(renderer.computeBodyRadius(mockSun, 'real', sunPx)).toBeCloseTo(sunPx, 3);
    const earthScreen = renderer.worldToScreen(mockEarth.position.x, 0);
    expect(Math.abs(earthScreen.x - 400)).toBeGreaterThan(sunPx);
  });

  it('recovers from relative zoom when entering real mode', () => {
    const canvas = createMockCanvas();
    const camera = new Camera2D();
    camera.setSize(800, 600);
    camera.center = { x: 0, y: 0 };
    camera.zoom = 1e-9;
    const renderer = new CanvasRenderer(canvas, camera);
    const snapshot = makeSnapshot([mockSun, mockEarth, mockJupiter]);

    renderer.centerOnReference(snapshot.bodies, { mode: 'real', realSunDisplayPx: 100 });
    renderer.render(snapshot, { bodyScaleMode: 'real', realSunDisplayPx: 100 });
    const sunScreen = renderer.worldToScreen(0, 0);
    const earthScreen = renderer.worldToScreen(mockEarth.position.x, 0);
    const separation = Math.hypot(earthScreen.x - sunScreen.x, earthScreen.y - sunScreen.y);
    expect(separation).toBeGreaterThan(10);
    expect(renderer.camera.zoom).toBe(1);
    expect(renderer.computeBodyRadius(mockSun, 'real', 100)).toBeCloseTo(100, 3);
  });

  it('keeps Galilean moons outside Jupiter disk in real scale', () => {
    const jupiterRadius = 6.9911e7;
    const moonOrbits = {
      io: 4.217e8,
      europa: 6.709e8,
      ganymede: 1.0704e9,
      callisto: 1.8827e9,
    };

    const canvas = createMockCanvas();
    const camera = new Camera2D();
    camera.zoom = 1;
    const renderer = new CanvasRenderer(canvas, camera);
    const callistoOrbit = moonOrbits.callisto;
    const refDisplayPx = (400 * jupiterRadius) / callistoOrbit;

    const jupiter: SnapshotBody = {
      ...mockEarth,
      id: 'jupiter',
      name: 'Júpiter',
      radius: jupiterRadius,
      visual: { ...mockEarth.visual, displayRadius: 16, color: '#f59e0b' },
    };

    renderer.render(makeSnapshot([jupiter]), {
      bodyScaleMode: 'real',
      realSunDisplayPx: refDisplayPx,
    });

    const jupiterPx = renderer.computeBodyRadius(jupiter, 'real', refDisplayPx);
    const pxPerM = refDisplayPx / jupiterRadius;

    expect(jupiterPx).toBeCloseTo(refDisplayPx, 6);
    expect(moonOrbits.io * pxPerM).toBeGreaterThan(jupiterPx);
    expect(moonOrbits.europa * pxPerM).toBeGreaterThan(jupiterPx);
    expect(moonOrbits.ganymede * pxPerM).toBeGreaterThan(jupiterPx);
    expect(moonOrbits.callisto * pxPerM).toBeCloseTo(400, 3);
  });
});
