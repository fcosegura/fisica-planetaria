import { useEffect, useRef, useState } from 'react';
import { useSimulationStore } from '@/store/simulation-store';
import { CanvasRenderer } from '@/render/canvas-renderer';
import { displayRadiusFromPhysical } from '@/sim/visual/display-radius';
import type { CelestialBody } from '@/sim/types';

/** Text inputs: masses (~1e24) break HTML type="number" and can inject NaN into the sim. */
interface BodyFieldStrings {
  name: string;
  mass: string;
  radius: string;
  px: string;
  py: string;
  vx: string;
  vy: string;
  state: 'dynamic' | 'fixed';
}

function bodyToFields(body: CelestialBody): BodyFieldStrings {
  return {
    name: body.name,
    mass: String(body.mass),
    radius: String(body.radius),
    px: String(body.position.x),
    py: String(body.position.y),
    vx: String(body.velocity.x),
    vy: String(body.velocity.y),
    state: body.state,
  };
}

function parsePositive(raw: string, label: string): number {
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} debe ser un número finito > 0`);
  }
  return n;
}

function parseFinite(raw: string, label: string): number {
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) {
    throw new Error(`${label} debe ser un número finito`);
  }
  return n;
}

export function BodyEditor() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const selectedId = useSimulationStore((s) => s.selectedId);
  const updateBody = useSimulationStore((s) => s.updateBody);
  const removeBody = useSimulationStore((s) => s.removeBody);
  const setFollowId = useSimulationStore((s) => s.setFollowId);
  const followId = useSimulationStore((s) => s.followId);

  const body = snapshot?.bodies.find((b) => b.id === selectedId);
  const [fields, setFields] = useState<BodyFieldStrings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const syncedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!body) {
      setFields(null);
      setError(null);
      syncedIdRef.current = null;
      return;
    }
    // Only reload form when selection changes — not on every snapshot tick while playing.
    if (syncedIdRef.current !== body.id) {
      setFields(bodyToFields(body));
      setError(null);
      syncedIdRef.current = body.id;
    }
  }, [body]);

  if (!fields || !body) {
    return (
      <div className="body-editor empty">
        <p>Selecciona un cuerpo en el canvas</p>
      </div>
    );
  }

  const setField = <K extends keyof BodyFieldStrings>(key: K, value: BodyFieldStrings[K]) => {
    setFields({ ...fields, [key]: value });
    setError(null);
  };

  const handleApply = () => {
    try {
      const mass = parsePositive(fields.mass, 'Masa');
      const radius = parsePositive(fields.radius, 'Radio');
      const px = parseFinite(fields.px, 'Pos X');
      const py = parseFinite(fields.py, 'Pos Y');
      const vx = parseFinite(fields.vx, 'Vel X');
      const vy = parseFinite(fields.vy, 'Vel Y');

      const next: CelestialBody = {
        id: body.id,
        name: fields.name.trim() || body.name,
        mass,
        radius,
        position: { x: px, y: py },
        velocity: { x: vx, y: vy },
        state: fields.state,
        visual: {
          ...body.visual,
          displayRadius: displayRadiusFromPhysical(radius, fields.state === 'fixed'),
        },
      };

      updateBody(next);
      setFields(bodyToFields(next));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Valores inválidos');
    }
  };

  return (
    <div className="body-editor">
      <h3>{fields.name || body.name}</h3>
      <label>
        Nombre
        <input value={fields.name} onChange={(e) => setField('name', e.target.value)} />
      </label>
      <label>
        Masa (kg)
        <input
          type="text"
          inputMode="decimal"
          spellCheck={false}
          value={fields.mass}
          onChange={(e) => setField('mass', e.target.value)}
          placeholder="p.ej. 5.972e24"
        />
      </label>
      <label>
        Radio físico (m)
        <input
          type="text"
          inputMode="decimal"
          spellCheck={false}
          value={fields.radius}
          onChange={(e) => setField('radius', e.target.value)}
        />
      </label>
      <label>
        Pos X (m)
        <input
          type="text"
          inputMode="decimal"
          spellCheck={false}
          value={fields.px}
          onChange={(e) => setField('px', e.target.value)}
        />
      </label>
      <label>
        Pos Y (m)
        <input
          type="text"
          inputMode="decimal"
          spellCheck={false}
          value={fields.py}
          onChange={(e) => setField('py', e.target.value)}
        />
      </label>
      <label>
        Vel X (m/s)
        <input
          type="text"
          inputMode="decimal"
          spellCheck={false}
          value={fields.vx}
          onChange={(e) => setField('vx', e.target.value)}
        />
      </label>
      <label>
        Vel Y (m/s)
        <input
          type="text"
          inputMode="decimal"
          spellCheck={false}
          value={fields.vy}
          onChange={(e) => setField('vy', e.target.value)}
        />
      </label>
      <label>
        Estado
        <select
          value={fields.state}
          onChange={(e) => setField('state', e.target.value as 'dynamic' | 'fixed')}
        >
          <option value="dynamic">dynamic</option>
          <option value="fixed">fixed</option>
        </select>
      </label>
      {error && <p className="editor-error">{error}</p>}
      <div className="editor-actions">
        <button onClick={handleApply}>Aplicar</button>
        <button onClick={() => setFollowId(followId === body.id ? null : body.id)}>
          {followId === body.id ? 'Dejar de seguir' : 'Seguir'}
        </button>
        <button className="danger" onClick={() => removeBody(body.id)}>
          Eliminar
        </button>
      </div>
    </div>
  );
}

export function SimCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const attachRenderer = useSimulationStore((s) => s.attachRenderer);
  const tick = useSimulationStore((s) => s.tick);
  const setSelectedId = useSimulationStore((s) => s.setSelectedId);
  const fitCamera = useSimulationStore((s) => s.fitCamera);
  const snapshot = useSimulationStore((s) => s.snapshot);
  const placementMode = useSimulationStore((s) => s.placementMode);
  const addBodyAtPosition = useSimulationStore((s) => s.addBodyAtPosition);

  const dragRef = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    panning: boolean;
    hitId: string | null;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new CanvasRenderer(canvas);
    attachRenderer(renderer);
    if (snapshot) {
      renderer.camera.fitBodies(snapshot.bodies.map((b) => b.position));
      renderer.render(snapshot);
    }

    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);

    let raf = 0;
    const loop = (now: number) => {
      tick(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [attachRenderer, tick]);

  useEffect(() => {
    fitCamera();
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const store = useSimulationStore.getState();
    const renderer = store.renderer;
    if (!renderer) return;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = e.currentTarget.getBoundingClientRect();
    renderer.camera.zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const store = useSimulationStore.getState();
    const hit = store.renderer?.hitTest(store.snapshot!, sx, sy, store.bodyScaleMode) ?? null;
    if (hit) {
      setSelectedId(hit);
      dragRef.current = { x: sx, y: sy, startX: sx, startY: sy, panning: false, hitId: hit };
    } else {
      setSelectedId(null);
      dragRef.current = { x: sx, y: sy, startX: sx, startY: sy, panning: !placementMode, hitId: null };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag?.panning) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const store = useSimulationStore.getState();
    store.renderer?.camera.pan(sx - drag.x, sy - drag.y);
    drag.x = sx;
    drag.y = sy;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag && placementMode && !drag.hitId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const moved = Math.hypot(sx - drag.startX, sy - drag.startY);
      if (moved < 6) {
        const store = useSimulationStore.getState();
        const world = store.renderer?.camera.screenToWorld(sx, sy);
        if (world) addBodyAtPosition(world);
      }
    }
    dragRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Lienzo de simulación física orbital N-cuerpos"
      className={`sim-canvas${placementMode ? ' placement-mode' : ''}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}
