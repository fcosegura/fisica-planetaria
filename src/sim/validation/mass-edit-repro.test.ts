import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '../engine/simulation-engine';
import { scenarioToDocument, solarSystem } from '../scenarios';
import { createDocument } from '../document/simulation-document';
import { makeBodyAtPosition } from '../orbit/compute-orbit';
import { makeVisual, nextCatalogBodyId } from '../catalog/solar-system';
import { AU, M_EARTH } from '../constants';

describe('mass edit stability', () => {
  it('keeps all bodies finite after changing custom body mass', () => {
    const engine = new SimulationEngine({ document: scenarioToDocument(solarSystem) });
    const body = makeBodyAtPosition(
      { x: 2 * AU, y: 0 },
      engine.getBodies(),
      () => nextCatalogBodyId('custom'),
      makeVisual,
    )!;
    engine.reset(createDocument('custom', [...engine.getBodies(), body], engine.getConfig()));

    const edited = {
      ...engine.getBodies().find((b) => b.id === body.id)!,
      mass: 2 * M_EARTH,
    };
    const bodies = engine.getBodies().map((b) => (b.id === edited.id ? edited : b));
    engine.reset(createDocument('custom', bodies, engine.getConfig()));

    for (let i = 0; i < 20; i++) engine.stepOnce();

    const snap = engine.getSnapshot();
    expect(snap.bodies.length).toBe(10);
    for (const b of snap.bodies) {
      expect(Number.isFinite(b.position.x)).toBe(true);
      expect(Number.isFinite(b.position.y)).toBe(true);
    }
  });

  it('does not poison other bodies when one mass is NaN', () => {
    const engine = new SimulationEngine({ document: scenarioToDocument(solarSystem) });
    const bodies = engine.getBodies();
    bodies[1] = { ...bodies[1]!, mass: Number.NaN };
    engine.reset(createDocument('custom', bodies, engine.getConfig()));
    engine.stepOnce();

    const snap = engine.getSnapshot();
    // Sun and other finite-mass bodies should remain finite
    const sun = snap.bodies.find((b) => b.name === 'Sol');
    expect(sun).toBeTruthy();
    expect(Number.isFinite(sun!.position.x)).toBe(true);
  });
});
