import type { CollisionEvent, SimSnapshot, SnapshotBody, Vec2 } from '@/sim/types';
import {
  DEFAULT_REAL_SUN_DISPLAY_PX,
  DEFAULT_RELATIVE_SUN_DISPLAY_PX,
  findScaleReferenceRadius,
  realDisplayRadius,
  realPxPerMeter,
  relativeDisplayRadius,
  R_SUN,
} from '@/sim/visual/display-radius';
import { Camera2D } from './camera2d';
import { TrailBuffer } from './trails';

export type BodyScaleMode = 'relative' | 'real';

export interface RenderOptions {
  showDebug?: boolean;
  selectedId?: string | null;
  followId?: string | null;
  bodyScaleMode?: BodyScaleMode;
  /** Screen radius (px) of the Sun / scale reference in real mode at zoom = 1. */
  realSunDisplayPx?: number;
  /** Screen radius (px) of the Sun / scale reference in relative mode. */
  relativeSunDisplayPx?: number;
}

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  camera: Camera2D;
  trails = new TrailBuffer(300);
  private scaleRefRadius = R_SUN;
  private scaleRefDisplayPx = DEFAULT_RELATIVE_SUN_DISPLAY_PX;
  private collisionEffect: { event: CollisionEvent; startedAt: number } | null = null;
  private lastCollisionEventKey: string | null = null;
  private renderMode: BodyScaleMode = 'relative';
  private realSunDisplayPx = DEFAULT_REAL_SUN_DISPLAY_PX;
  /** px/m at zoom = 1 in real mode; 0 in relative mode. */
  private physicalPxPerMeter = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    camera?: Camera2D,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.camera = camera ?? new Camera2D();
    this.resize();
  }

  resize(): void {
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.setSize(rect.width, rect.height);
  }

  private applyScaleContext(
    bodies: ReadonlyArray<SnapshotBody>,
    options: { relativeSunDisplayPx?: number; realSunDisplayPx?: number; mode: BodyScaleMode },
  ): void {
    this.scaleRefRadius = findScaleReferenceRadius(bodies);
    if (options.mode === 'real') {
      this.realSunDisplayPx = options.realSunDisplayPx ?? DEFAULT_REAL_SUN_DISPLAY_PX;
      this.physicalPxPerMeter = realPxPerMeter(this.realSunDisplayPx, this.scaleRefRadius);
    } else {
      this.scaleRefDisplayPx = options.relativeSunDisplayPx ?? DEFAULT_RELATIVE_SUN_DISPLAY_PX;
      this.physicalPxPerMeter = 0;
    }
  }

  /** World metres → screen pixels (positions and radii share this in real mode). */
  getWorldScale(mode: BodyScaleMode = this.renderMode): number {
    if (mode === 'real') {
      return this.physicalPxPerMeter * this.camera.zoom;
    }
    return this.camera.zoom;
  }

  computeBodyRadius(
    body: SnapshotBody,
    mode: BodyScaleMode = 'relative',
    realSunDisplayPx = this.realSunDisplayPx,
  ): number {
    if (mode === 'real') {
      const base = realDisplayRadius(body.radius, realSunDisplayPx, this.scaleRefRadius);
      return Math.max(0, base * this.camera.zoom);
    }
    return relativeDisplayRadius(body.radius, this.scaleRefRadius, this.scaleRefDisplayPx);
  }

  render(snapshot: SimSnapshot, options: RenderOptions = {}): void {
    const { width, height } = this.camera;
    const ctx = this.ctx;
    const bodyScaleMode = options.bodyScaleMode ?? 'relative';
    this.renderMode = bodyScaleMode;
    this.applyScaleContext(snapshot.bodies, {
      mode: bodyScaleMode,
      relativeSunDisplayPx: options.relativeSunDisplayPx,
      realSunDisplayPx: options.realSunDisplayPx,
    });

    // Relative mode uses ~1e-9 px/m in camera.zoom; real mode uses zoom as a
    // navigation multiplier on top of physicalPxPerMeter.
    if (bodyScaleMode === 'real' && this.physicalPxPerMeter > 0 && this.camera.zoom < 1e-12) {
      this.camera.zoom = 1;
    }

    const collisionEventKey = snapshot.collisionEvent
      ? `${snapshot.step}:${snapshot.collisionEvent.bodyNames.join('|')}`
      : null;
    if (snapshot.collisionEvent && collisionEventKey !== this.lastCollisionEventKey) {
      this.collisionEffect = { event: snapshot.collisionEvent, startedAt: performance.now() };
      this.lastCollisionEventKey = collisionEventKey;
    }

    if (options.followId) {
      const body = snapshot.bodies.find((b) => b.id === options.followId);
      if (body) this.camera.follow(body.position);
    }

    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, width, height);

    this.drawGrid();

    const activeIds = new Set(snapshot.bodies.map((b) => b.id));
    this.trails.retainOnly(activeIds);

    const bodiesById = new Map(snapshot.bodies.map((body) => [body.id, body]));

    for (const body of snapshot.bodies) {
      const parent = body.parentId ? bodiesById.get(body.parentId) : undefined;
      const trailPosition = parent
        ? { x: body.position.x - parent.position.x, y: body.position.y - parent.position.y }
        : body.position;
      if (body.visual.showTrail) {
        this.trails.push(body.id, trailPosition, body.visual.trailLength);
        this.drawTrail(body, parent?.position);
      }
    }

    for (const body of snapshot.bodies) {
      this.drawBody(body, body.id === options.selectedId, bodyScaleMode);
    }

    this.drawCollisionEffect();

    if (options.showDebug) {
      for (const body of snapshot.bodies) {
        this.drawDebugVectors(body);
      }
    }
  }

  clearTrails(): void {
    this.trails.clear();
    this.collisionEffect = null;
    this.lastCollisionEventKey = null;
  }

  fitBodies(
    bodies: ReadonlyArray<SnapshotBody>,
    options: {
      mode: BodyScaleMode;
      realSunDisplayPx?: number;
      relativeSunDisplayPx?: number;
    },
    padding = 80,
  ): void {
    if (bodies.length === 0) return;
    this.applyScaleContext(bodies, options);

    const positions = bodies.map((b) => b.position);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const p of positions) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const zoomX = (this.camera.width - padding * 2) / spanX;
    const zoomY = (this.camera.height - padding * 2) / spanY;

    if (options.mode === 'real') {
      const pxPerM = realPxPerMeter(
        options.realSunDisplayPx ?? this.realSunDisplayPx,
        this.scaleRefRadius,
      );
      if (pxPerM > 0) {
        this.camera.zoom = Math.max(1e-15, Math.min(zoomX, zoomY) / pxPerM);
      } else {
        this.camera.zoom = Math.max(1e-15, Math.min(zoomX, zoomY));
      }
    } else {
      this.camera.zoom = Math.max(1e-15, Math.min(zoomX, zoomY));
    }

    this.camera.center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }

  /** Real-mode default view: honour the Sun slider at zoom = 1 (no auto-fit). */
  centerOnReference(
    bodies: ReadonlyArray<SnapshotBody>,
    options: {
      mode: BodyScaleMode;
      realSunDisplayPx?: number;
      relativeSunDisplayPx?: number;
    },
  ): void {
    if (bodies.length === 0) return;
    this.applyScaleContext(bodies, options);

    const sun = bodies.find((b) => {
      const n = b.name.toLowerCase();
      return n === 'sol' || n === 'sun';
    });
    const ref = sun ?? bodies.reduce((largest, body) =>
      body.radius > largest.radius ? body : largest,
    bodies[0]!);

    this.camera.center = { x: ref.position.x, y: ref.position.y };
    this.camera.zoom = 1;
  }

  panScreen(dx: number, dy: number): void {
    const scale = this.getWorldScale();
    if (scale <= 0) return;
    this.camera.center.x -= dx / scale;
    this.camera.center.y += dy / scale;
  }

  zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy);
    this.camera.zoom = Math.max(1e-15, Math.min(1e3, this.camera.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.camera.center.x += before.x - after.x;
    this.camera.center.y += before.y - after.y;
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    const scale = this.getWorldScale();
    return {
      x: this.camera.center.x + (sx - this.camera.width / 2) / scale,
      y: this.camera.center.y - (sy - this.camera.height / 2) / scale,
    };
  }

  private drawCollisionEffect(): void {
    if (!this.collisionEffect) return;

    const elapsed = performance.now() - this.collisionEffect.startedAt;
    const duration = 900;
    const progress = elapsed / duration;
    if (progress >= 1) {
      this.collisionEffect = null;
      return;
    }

    const { event } = this.collisionEffect;
    const center = this.worldToScreen(event.position.x, event.position.y);
    const baseRadius = Math.max(10, this.computeBodyRadius({
      id: 'collision-effect',
      name: 'collision-effect',
      position: event.position,
      velocity: { x: 0, y: 0 },
      mass: 0,
      radius: event.radius,
      visual: { color: '#fbbf24', displayRadius: 0, showTrail: false, trailLength: 0 },
      state: 'dynamic',
    }, this.renderMode));
    const ringRadius = baseRadius + progress * Math.max(34, baseRadius * 2.5);
    const alpha = 1 - progress;
    const ctx = this.ctx;

    ctx.save();
    ctx.strokeStyle = `rgba(251, 191, 36, ${alpha})`;
    ctx.lineWidth = 3 - progress * 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 237, 153, ${alpha * 0.8})`;
    ctx.beginPath();
    ctx.arc(center.x, center.y, Math.max(3, baseRadius * (1 - progress * 0.7)), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 237, 153, ${alpha})`;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`💥 Fusión: ${event.bodyNames.join(' + ')}`, center.x, center.y - ringRadius - 8);
    ctx.restore();
  }

  hitTest(
    snapshot: SimSnapshot,
    sx: number,
    sy: number,
    mode: BodyScaleMode = 'relative',
    relativeSunDisplayPx?: number,
    realSunDisplayPx?: number,
  ): string | null {
    this.applyScaleContext(snapshot.bodies, {
      mode,
      relativeSunDisplayPx,
      realSunDisplayPx,
    });
    this.renderMode = mode;
    for (let i = snapshot.bodies.length - 1; i >= 0; i--) {
      const body = snapshot.bodies[i]!;
      const screen = this.worldToScreen(body.position.x, body.position.y);
      const r = this.computeBodyRadius(body, mode, realSunDisplayPx ?? this.realSunDisplayPx);
      const effectiveRadius = Math.max(8, r) + 4;
      const dx = sx - screen.x;
      const dy = sy - screen.y;
      if (dx * dx + dy * dy <= effectiveRadius * effectiveRadius) return body.id;
    }
    return null;
  }

  private drawGrid(): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;

    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(this.camera.width, this.camera.height);

    const worldSpan = Math.max(Math.abs(bottomRight.x - topLeft.x), Math.abs(topLeft.y - bottomRight.y));
    const step = Math.pow(10, Math.floor(Math.log10(worldSpan / 8)));

    const startX = Math.floor(topLeft.x / step) * step;
    const startY = Math.floor(bottomRight.y / step) * step;

    for (let x = startX; x <= bottomRight.x; x += step) {
      const s = this.worldToScreen(x, 0);
      ctx.beginPath();
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, this.camera.height);
      ctx.stroke();
    }

    for (let y = startY; y <= topLeft.y; y += step) {
      const s = this.worldToScreen(0, y);
      ctx.beginPath();
      ctx.moveTo(0, s.y);
      ctx.lineTo(this.camera.width, s.y);
      ctx.stroke();
    }
  }

  private drawTrail(body: SnapshotBody, parentPosition?: { x: number; y: number }): void {
    if (this.trails.getLength(body.id) < 2) return;

    const ctx = this.ctx;
    ctx.strokeStyle = body.visual.color + '66';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    this.trails.forEach(body.id, (wx, wy, i) => {
      const s = this.worldToScreen(
        wx + (parentPosition?.x ?? 0),
        wy + (parentPosition?.y ?? 0),
      );
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });

    ctx.stroke();
  }

  private drawBody(
    body: SnapshotBody,
    selected: boolean,
    mode: BodyScaleMode = 'relative',
  ): void {
    const ctx = this.ctx;
    const s = this.worldToScreen(body.position.x, body.position.y);
    const r = this.computeBodyRadius(body, mode);
    const isStar =
      body.mass >= 1e29 ||
      body.name.toLowerCase().includes('sol') ||
      body.name.toLowerCase().includes('sun');

    if (isStar && mode !== 'real') {
      const glowRadius = Math.max(r * 1.5, r + 12);
      const gradient = ctx.createRadialGradient(s.x, s.y, Math.max(1, r * 0.3), s.x, s.y, glowRadius);
      gradient.addColorStop(0, 'rgba(251, 191, 36, 0.45)');
      gradient.addColorStop(0.5, 'rgba(245, 158, 11, 0.18)');
      gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(s.x, s.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (selected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(r, 4) + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = body.visual.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const labelOffset = Math.max(r, isStar ? 12 : 5) + 6;
    ctx.fillText(body.name, s.x, s.y - labelOffset);
  }

  private drawDebugVectors(body: SnapshotBody): void {
    const origin = this.worldToScreen(body.position.x, body.position.y);
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    if (speed <= 0) return;

    const refSpeed = 30_000;
    const arrowLength = Math.min(70, Math.max(12, (speed / refSpeed) * 35));
    const dirX = body.velocity.x / speed;
    const dirY = body.velocity.y / speed;

    this.drawArrow(
      origin.x,
      origin.y,
      dirX * arrowLength,
      -dirY * arrowLength,
      '#22c55e',
    );
  }

  private drawArrow(x: number, y: number, dx: number, dy: number, color: string): void {
    const ctx = this.ctx;
    const len = Math.hypot(dx, dy);
    if (len < 2) return;

    const headLength = Math.min(7, len * 0.3);
    const angle = Math.atan2(dy, dx);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + dx, y + dy);
    ctx.lineTo(
      x + dx - headLength * Math.cos(angle - Math.PI / 6),
      y + dy - headLength * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      x + dx - headLength * Math.cos(angle + Math.PI / 6),
      y + dy - headLength * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const scale = this.getWorldScale();
    return {
      x: (wx - this.camera.center.x) * scale + this.camera.width / 2,
      y: -(wy - this.camera.center.y) * scale + this.camera.height / 2,
    };
  }
}
