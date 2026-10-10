import { CONFIG } from './config';
import type { Piece } from './types';

const CELL_SIZE = 2;
const FLOOR_CLEARANCE = 0.04;
const STACK_GAP = 0.012;
const OVERLAP_EPSILON = 1e-5;

export interface DebrisBody {
  piece: Piece;
  x: number;
  y: number;
  z: number;
  rotation: number;
  settled: boolean;
}

interface Footprint {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  cos: number;
  sin: number;
  extentX: number;
  extentZ: number;
}
interface Support {
  footprint: Footprint; top: number; bottom: number; keys: string[];
  x: number; y: number; z: number; rotation: number; piece: Piece; epoch: number;
}

export function debrisRenderSize(piece: Piece) {
  return {
    x: Math.max(0.1, piece.size.x * CONFIG.characterScale - 0.015),
    y: Math.max(0.1, piece.size.y * CONFIG.characterScale - 0.015),
    z: Math.max(0.1, piece.size.z * CONFIG.characterScale - 0.015),
  };
}

export function debrisFloorY(piece: Piece): number {
  return debrisRenderSize(piece).y / 2 + FLOOR_CLEARANCE;
}

function footprint(drop: DebrisBody): Footprint {
  const size = debrisRenderSize(drop.piece);
  const halfX = size.x / 2, halfZ = size.z / 2;
  const cos = Math.cos(drop.rotation), sin = Math.sin(drop.rotation);
  return {
    x: drop.x,
    z: drop.z,
    halfX,
    halfZ,
    cos,
    sin,
    extentX: Math.abs(cos) * halfX + Math.abs(sin) * halfZ,
    extentZ: Math.abs(sin) * halfX + Math.abs(cos) * halfZ,
  };
}

function radiusOnAxis(body: Footprint, axisX: number, axisZ: number): number {
  const localX = Math.abs(axisX * body.cos - axisZ * body.sin);
  const localZ = Math.abs(axisX * body.sin + axisZ * body.cos);
  return body.halfX * localX + body.halfZ * localZ;
}

function separation(a: Footprint, b: Footprint): { x: number; z: number; distance: number } | null {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.abs(dx) >= a.extentX + b.extentX - OVERLAP_EPSILON ||
    Math.abs(dz) >= a.extentZ + b.extentZ - OVERLAP_EPSILON) return null;
  let pushX = 0, pushZ = 0, depth = Infinity;
  for (let axis = 0; axis < 4; axis++) {
    const rotation = axis < 2 ? a : b;
    const axisX = axis % 2 ? rotation.sin : rotation.cos, axisZ = axis % 2 ? rotation.cos : -rotation.sin;
    const signedDistance = dx * axisX + dz * axisZ;
    const penetration = radiusOnAxis(a, axisX, axisZ) + radiusOnAxis(b, axisX, axisZ) - Math.abs(signedDistance);
    if (penetration <= OVERLAP_EPSILON) return null;
    if (penetration < depth) {
      const distance = penetration + OVERLAP_EPSILON;
      const direction = signedDistance >= 0 ? -1 : 1;
      pushX = axisX * distance * direction; pushZ = axisZ * distance * direction; depth = penetration;
    }
  }
  return { x: pushX, z: pushZ, distance: depth + OVERLAP_EPSILON };
}

function cells(body: Footprint): string[] {
  const minX = Math.floor((body.x - body.extentX) / CELL_SIZE);
  const maxX = Math.floor((body.x + body.extentX) / CELL_SIZE);
  const minZ = Math.floor((body.z - body.extentZ) / CELL_SIZE);
  const maxZ = Math.floor((body.z + body.extentZ) / CELL_SIZE);
  const result: string[] = [];
  for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) result.push(`${x}:${z}`);
  return result;
}

/** Finds nearby settled supports without comparing every piece in a debris field. */
export class DebrisStack {
  private buckets = new Map<string, Set<Support>>();
  private supports = new Map<DebrisBody, Support>();
  private epoch = 0;
  private highestTop = FLOOR_CLEARANCE;

  add(drop: DebrisBody): void {
    const previous = this.supports.get(drop);
    if (previous && previous.x === drop.x && previous.y === drop.y && previous.z === drop.z
      && previous.rotation === drop.rotation && previous.piece === drop.piece) {
      previous.epoch = this.epoch; return;
    }
    this.remove(drop);
    const body = footprint(drop);
    const halfHeight = debrisRenderSize(drop.piece).y / 2;
    const support: Support = { footprint: body, top: drop.y + halfHeight, bottom: drop.y - halfHeight, keys: cells(body),
      x: drop.x, y: drop.y, z: drop.z, rotation: drop.rotation, piece: drop.piece, epoch: this.epoch };
    this.supports.set(drop, support);
    this.highestTop = Math.max(this.highestTop, support.top);
    for (const key of support.keys) {
      const bucket = this.buckets.get(key);
      if (bucket) bucket.add(support);
      else this.buckets.set(key, new Set([support]));
    }
  }

  remove(drop: DebrisBody): void {
    const previous = this.supports.get(drop);
    if (!previous) return;
    for (const key of previous.keys) {
      const bucket = this.buckets.get(key)!; bucket.delete(previous);
      if (!bucket.size) this.buckets.delete(key);
    }
    this.supports.delete(drop);
    // An overestimate merely disables the early-out; landing uses exact faces.
    if (!this.supports.size) this.highestTop = FLOOR_CLEARANCE;
  }

  /** Reconcile external array edits; unchanged supports keep geometry and buckets. */
  sync(drops: readonly DebrisBody[]): void {
    this.epoch++;
    for (const drop of drops) if (drop.settled) this.add(drop);
    for (const [drop, support] of this.supports) if (support.epoch !== this.epoch) this.remove(drop);
  }

  canLand(drop: DebrisBody): boolean {
    return drop.y <= this.highestTop + debrisRenderSize(drop.piece).y / 2 + STACK_GAP;
  }

  /** Only a top face reached from above can stop this descent. */
  landingY(drop: DebrisBody, previousY = Infinity): number {
    const body = footprint(drop);
    const candidates = new Set<{ footprint: Footprint; top: number; bottom: number }>();
    for (const key of cells(body)) for (const support of this.buckets.get(key) ?? []) candidates.add(support);
    let y = debrisFloorY(drop.piece);
    const halfHeight = debrisRenderSize(drop.piece).y / 2;
    for (const support of candidates) {
      const contactY = support.top + halfHeight + STACK_GAP;
      if (contactY > previousY + OVERLAP_EPSILON || !separation(body, support.footprint)) continue;
      y = Math.max(y, contactY);
    }
    return y;
  }

  /**
   * A part entering an existing pile from its side must move sideways, never to
   * the pile's top. Resolve only a short local displacement at the pre-fall
   * height; the caller validates its whole path against cover and arena edges.
   */
  resolveSideContact(drop: DebrisBody, previousY: number, positionValid: (x: number, z: number) => boolean, progressDistance = 0): boolean {
    const originX = drop.x, originZ = drop.z, shape = footprint(drop);
    const halfHeight = debrisRenderSize(drop.piece).y / 2;
    const bottom = previousY - halfHeight, top = previousY + halfHeight;
    if (bottom >= this.highestTop + STACK_GAP - OVERLAP_EPSILON) return true;
    const maximumMove = 8;
    const candidates = new Set<{ footprint: Footprint; top: number; bottom: number }>();
    const collision = (x: number, z: number, deepestContact = false) => {
      const body = { ...shape, x, z };
      candidates.clear();
      let deepest: ReturnType<typeof separation> = null;
      for (const key of cells(body)) for (const support of this.buckets.get(key) ?? []) {
        if (candidates.has(support) || bottom >= support.top + STACK_GAP - OVERLAP_EPSILON || top <= support.bottom + OVERLAP_EPSILON) continue;
        candidates.add(support);
        const push = separation(body, support.footprint);
        if (push && !deepestContact) return push;
        if (push && (!deepest || push.distance > deepest.distance)) deepest = push;
      }
      return deepest;
    };
    let x = originX, z = originZ;
    let push = collision(x, z, true);
    if (!push) return true;
    for (let attempt = 0; attempt < 8 && push; attempt++) {
      const nextX = x + push.x, nextZ = z + push.z;
      if (Math.hypot(nextX - originX, nextZ - originZ) > maximumMove || !positionValid(nextX, nextZ)) break;
      x = nextX; z = nextZ; push = collision(x, z, true);
    }
    if (!push) { drop.x = x; drop.z = z; return true; }
    let hash = 2166136261;
    for (let i = 0; i < drop.piece.id.length; i++) hash = Math.imul(hash ^ drop.piece.id.charCodeAt(i), 16777619);
    hash = Math.imul(hash ^ hash >>> 16, 0x7feb352d);
    hash = Math.imul(hash ^ hash >>> 15, 0x846ca68b);
    const direction = ((hash ^ hash >>> 16) >>> 0) / 4294967296 * Math.PI * 2;
    const directions = Array.from({ length: 8 }, (_, i) => {
      const angle = direction + i * Math.PI / 4;
      return { x: Math.cos(angle), z: Math.sin(angle) };
    });
    // A radius-wide corridor can have only an exact cover/arena-edge tangent.
    // Hash-rotated rays alone all leave that corridor and permanently trap a part.
    directions.push({ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 });
    for (const distance of [.5, 1, 2, 3, 4, maximumMove]) for (const direction of directions) {
      const nextX = originX + direction.x * distance, nextZ = originZ + direction.z * distance;
      if (!collision(nextX, nextZ) && positionValid(nextX, nextZ)) { drop.x = nextX; drop.z = nextZ; return true; }
    }
    // Dense simultaneous falls can enclose a part below a newly settled pile.
    // Keep its height and gently work sideways over subsequent frames instead
    // of lifting it, searching distant arena points, or leaving it stuck forever.
    if (progressDistance > 0) for (const direction of directions) {
      const nextX = originX + direction.x * progressDistance, nextZ = originZ + direction.z * progressDistance;
      if (positionValid(nextX, nextZ)) { drop.x = nextX; drop.z = nextZ; break; }
    }
    return false;
  }
}
