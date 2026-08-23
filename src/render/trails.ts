import type { Vec2 } from '@/sim/types';

interface RingBuffer {
  x: Float64Array;
  y: Float64Array;
  capacity: number;
  head: number;
  length: number;
}

function createRingBuffer(capacity: number): RingBuffer {
  const cap = Math.max(2, capacity);
  return {
    x: new Float64Array(cap),
    y: new Float64Array(cap),
    capacity: cap,
    head: 0,
    length: 0,
  };
}

export class TrailBuffer {
  private buffers = new Map<string, RingBuffer>();
  private defaultMaxPoints: number;

  constructor(defaultMaxPoints = 300) {
    this.defaultMaxPoints = defaultMaxPoints;
  }

  setMaxPoints(n: number): void {
    this.defaultMaxPoints = n;
  }

  push(bodyId: string, position: Vec2, maxPoints?: number): void {
    const targetCapacity = maxPoints ?? this.defaultMaxPoints;
    let buf = this.buffers.get(bodyId);

    if (!buf) {
      buf = createRingBuffer(targetCapacity);
      this.buffers.set(bodyId, buf);
    } else if (buf.capacity !== targetCapacity) {
      // Resize preserving newest points
      const newBuf = createRingBuffer(targetCapacity);
      const copyCount = Math.min(buf.length, targetCapacity);
      const startOffset = buf.length - copyCount;
      for (let i = 0; i < copyCount; i++) {
        const srcIdx =
          buf.length < buf.capacity
            ? startOffset + i
            : (buf.head + startOffset + i) % buf.capacity;
        newBuf.x[i] = buf.x[srcIdx]!;
        newBuf.y[i] = buf.y[srcIdx]!;
      }
      newBuf.length = copyCount;
      newBuf.head = copyCount % targetCapacity;
      buf = newBuf;
      this.buffers.set(bodyId, buf);
    }

    buf.x[buf.head] = position.x;
    buf.y[buf.head] = position.y;
    buf.head = (buf.head + 1) % buf.capacity;
    if (buf.length < buf.capacity) {
      buf.length++;
    }
  }

  /**
   * Fast zero-allocation point traversal in chronological order (oldest to newest).
   */
  forEach(bodyId: string, callback: (x: number, y: number, index: number) => void): void {
    const buf = this.buffers.get(bodyId);
    if (!buf || buf.length === 0) return;

    const { x, y, capacity, head, length } = buf;
    const startIdx = length < capacity ? 0 : head;

    for (let i = 0; i < length; i++) {
      const idx = (startIdx + i) % capacity;
      callback(x[idx]!, y[idx]!, i);
    }
  }

  get(bodyId: string): Vec2[] {
    const buf = this.buffers.get(bodyId);
    if (!buf || buf.length === 0) return [];

    const out: Vec2[] = new Array(buf.length);
    const { x, y, capacity, head, length } = buf;
    const startIdx = length < capacity ? 0 : head;

    for (let i = 0; i < length; i++) {
      const idx = (startIdx + i) % capacity;
      out[i] = { x: x[idx]!, y: y[idx]! };
    }
    return out;
  }

  getLength(bodyId: string): number {
    return this.buffers.get(bodyId)?.length ?? 0;
  }

  clear(): void {
    this.buffers.clear();
  }

  remove(bodyId: string): void {
    this.buffers.delete(bodyId);
  }

  retainOnly(activeIds: ReadonlySet<string>): void {
    for (const id of this.buffers.keys()) {
      if (!activeIds.has(id)) {
        this.buffers.delete(id);
      }
    }
  }
}
