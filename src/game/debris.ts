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

function overlaps(a: Footprint, b: Footprint): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  const axes = [
    [a.cos, -a.sin], [a.sin, a.cos],
    [b.cos, -b.sin], [b.sin, b.cos],
  ];
  for (const [axisX, axisZ] of axes) {
    const distance = Math.abs(dx * axisX + dz * axisZ);
    if (distance >= radiusOnAxis(a, axisX, axisZ) + radiusOnAxis(b, axisX, axisZ) - OVERLAP_EPSILON) return false;
  }
  return true;
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
  private buckets = new Map<string, DebrisBody[]>();
  private highestTop = FLOOR_CLEARANCE;

  add(drop: DebrisBody): void {
    const body = footprint(drop);
    this.highestTop = Math.max(this.highestTop, drop.y + debrisRenderSize(drop.piece).y / 2);
    for (const key of cells(body)) {
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(drop);
      else this.buckets.set(key, [drop]);
    }
  }

  canLand(drop: DebrisBody): boolean {
    return drop.y <= this.highestTop + debrisRenderSize(drop.piece).y / 2 + STACK_GAP;
  }

  landingY(drop: DebrisBody): number {
    const body = footprint(drop);
    const candidates = new Set<DebrisBody>();
    for (const key of cells(body)) for (const support of this.buckets.get(key) ?? []) candidates.add(support);
    let y = debrisFloorY(drop.piece);
    const halfHeight = debrisRenderSize(drop.piece).y / 2;
    for (const support of candidates) {
      if (!overlaps(body, footprint(support))) continue;
      const supportTop = support.y + debrisRenderSize(support.piece).y / 2;
      y = Math.max(y, supportTop + halfHeight + STACK_GAP);
    }
    return y;
  }
}
