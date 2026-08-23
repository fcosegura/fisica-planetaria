import { describe, expect, it } from 'vitest';
import { CanvasRenderer } from '@/render/canvas-renderer';
import { Camera2D } from '@/render/camera2d';
import {
  DEFAULT_RELATIVE_SUN_DISPLAY_PX,
  findScaleReferenceRadius,
  relativeDisplayRadius,
} from '../visual/display-radius';
import type { SimSnapshot, SnapshotBody } from '../types';

const R_EARTH = 6.371e6;
const R_SUN = 6.96e8;
const R_JUPITER = 6.991e7;

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
  position: { x: 1.496e11, y: 0 },
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

describe('Body scale mode (relative vs real)', () => {
  it('computes relative radius from the Sun reference size', () => {
    const canvas = createMockCanvas();
    const camera = new Camera2D();
    camera.zoom = 1e-9;
    const renderer = new CanvasRenderer(canvas, camera);

    renderer.render(
      {
        time: 0,
        step: 0,
        bodies: [mockSun, mockEarth, mockJupiter],
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
      },
      { bodyScaleMode: 'relative', relativeSunDisplayPx: 28 },
    );

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

  it('computes real radius as radius * zoom (with 0.5px minimum)', () => {
    const canvas = createMockCanvas();
    const camera = new Camera2D();
    // At zoom = 1e-9 px/m, Earth (6.371e6 m) = ~0.006 px -> clamped to 0.5 px
    camera.zoom = 1e-9;
    const renderer = new CanvasRenderer(canvas, camera);

    expect(renderer.computeBodyRadius(mockEarth, 'real')).toBe(0.5);

    // Zoom in on Earth: 1e-6 px/m -> 6.371e6 * 1e-6 = 6.371 px
    camera.zoom = 1e-6;
    expect(renderer.computeBodyRadius(mockEarth, 'real')).toBeCloseTo(6.371, 3);

    // Zoom for Sun: 1e-8 px/m -> 6.96e8 * 1e-8 = 6.96 px
    camera.zoom = 1e-8;
    expect(renderer.computeBodyRadius(mockSun, 'real')).toBeCloseTo(6.96, 2);
  });

  it('hitTest works in both relative and real modes', () => {
    const canvas = createMockCanvas();
    const camera = new Camera2D();
    camera.setSize(800, 600);
    camera.center = { x: 0, y: 0 };
    camera.zoom = 1e-9;
    const renderer = new CanvasRenderer(canvas, camera);

    const snapshot: SimSnapshot = {
      time: 0,
      step: 0,
      bodies: [mockSun],
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

    // Sun is at center: screen coord = (400, 300)
    // Relative hit test: displayRadius = 28, hit radius = Math.max(8, 28) + 4 = 32 px
    expect(renderer.hitTest(snapshot, 400, 300, 'relative', 28)).toBe('sun');
    expect(renderer.hitTest(snapshot, 420, 300, 'relative', 28)).toBe('sun');
    expect(renderer.hitTest(snapshot, 450, 300, 'relative', 28)).toBeNull();

    // Real hit test: Sun radius = 6.96e8 * 1e-9 = 0.696 px -> effective click radius = max(8, 0.696) + 4 = 12 px
    expect(renderer.hitTest(snapshot, 400, 300, 'real')).toBe('sun');
    expect(renderer.hitTest(snapshot, 410, 300, 'real')).toBe('sun');
    expect(renderer.hitTest(snapshot, 420, 300, 'real')).toBeNull();
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
    // Zoomed in on the Jupiter system: Callisto orbit ≈ 400 px
    camera.zoom = 400 / moonOrbits.callisto;
    const renderer = new CanvasRenderer(canvas, camera);

    const jupiter: SnapshotBody = {
      ...mockEarth,
      id: 'jupiter',
      name: 'Júpiter',
      radius: jupiterRadius,
      visual: { ...mockEarth.visual, displayRadius: 16, color: '#f59e0b' },
    };
    const jupiterPx = renderer.computeBodyRadius(jupiter, 'real');

    expect(jupiterPx).toBeCloseTo(jupiterRadius * camera.zoom, 6);
    expect(moonOrbits.io * camera.zoom).toBeGreaterThan(jupiterPx);
    expect(moonOrbits.europa * camera.zoom).toBeGreaterThan(jupiterPx);
    expect(moonOrbits.ganymede * camera.zoom).toBeGreaterThan(jupiterPx);
    expect(moonOrbits.callisto * camera.zoom).toBeGreaterThan(jupiterPx);
  });
});
