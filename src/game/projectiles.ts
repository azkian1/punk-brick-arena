import { CONFIG } from './config';
import { debrisFloorY } from './debris';
import type { Piece, Random, Vec3 } from './types';

export const SHOT_PICKUP_LOCK = 5;
const GRAVITY = 18;

export interface PartProjectile {
  /** All real parts in this single logical volley; first part keeps the legacy API. */
  pieces: Piece[];
  piece: Piece;
  damage: number;
  radius: number;
  shotSpeed: number;
  reboundGravity?: number;
  ownerId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Continuous time since firing, including impact, rebound, and landing. */
  age: number;
  mode: 'shot' | 'rebound';
  settled: boolean;
  /** Retain the airborne part if temporarily no safe landing point exists. */
  awaitingLandingPoint?: boolean;
}

export interface PartProjectileStep {
  from: Vec3;
  to: Vec3;
  /** Only a straight shot can damage a target; rebound arcs are transport. */
  canHit: boolean;
  /** True only on the step that first touches the ground. */
  landed: boolean;
  /** True on the step that launches an arena-edge rebound arc. */
  rebounded: boolean;
}

export type LandingPointValid = (x: number, z: number, radius: number) => boolean;

/** Deterministic compact 3D packing, in world units, without changing any part. */
export function projectilePartOffsets(pieces: readonly Piece[]): Vec3[] {
  if (!pieces.length) return [];
  const columns = Math.ceil(Math.cbrt(pieces.length));
  const cell = { x: 0, y: 0, z: 0 };
  for (const piece of pieces) for (const axis of ['x', 'y', 'z'] as const) {
    cell[axis] = Math.max(cell[axis], piece.size[axis] * CONFIG.characterScale + 0.035);
  }
  const offsets = pieces.map((_, i) => ({
    x: i % columns * cell.x,
    y: Math.floor(i / (columns * columns)) * cell.y,
    z: Math.floor(i / columns) % columns * cell.z,
  }));
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i < pieces.length; i++) for (const axis of ['x', 'y', 'z'] as const) {
    const half = pieces[i].size[axis] * CONFIG.characterScale / 2;
    min[axis] = Math.min(min[axis], offsets[i][axis] - half);
    max[axis] = Math.max(max[axis], offsets[i][axis] + half);
  }
  for (const offset of offsets) for (const axis of ['x', 'y', 'z'] as const) offset[axis] -= (min[axis] + max[axis]) / 2;
  return offsets;
}

export function projectileGroupRadius(pieces: readonly Piece[] | Piece): number {
  const parts = Array.isArray(pieces) ? pieces : [pieces as Piece], offsets = projectilePartOffsets(parts);
  let radius = 0;
  for (let i = 0; i < parts.length; i++) radius = Math.max(radius, Math.hypot(
    Math.abs(offsets[i].x) + parts[i].size.x * CONFIG.characterScale / 2,
    Math.abs(offsets[i].z) + parts[i].size.z * CONFIG.characterScale / 2,
  ));
  return radius;
}

/** Group center height at which every packed part has cleared the floor. */
export function projectileGroupFloorY(pieces: readonly Piece[]): number {
  const offsets = projectilePartOffsets(pieces);
  return Math.max(0, ...pieces.map((piece, i) => debrisFloorY(piece) - offsets[i].y));
}

/** Also accepts old handwritten single-part collision fixtures. */
export function projectileRadius(projectile: { piece: Piece; pieces?: readonly Piece[]; radius?: number }): number {
  return projectile.radius ?? projectileGroupRadius(projectile.pieces ?? projectile.piece);
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const unitRandom = (random: Random) => {
  const value = random();
  return clamp(Number.isFinite(value) ? value : 0.5, 0, 1);
};
function bounds(radius: number) {
  return {
    x: Math.max(0, CONFIG.arenaWidth / 2 - radius),
    z: Math.max(0, CONFIG.arenaDepth / 2 - radius),
  };
}

/** Own the exact detached inventory object; no synthetic ammunition or resized copy. */
export function createPartProjectile(
  piece: Piece | Piece[], ownerId: string, x: number, z: number, tx: number, tz: number, y = 3.2,
): PartProjectile {
  const pieces = Array.isArray(piece) ? [...piece] : [piece];
  if (!pieces.length) throw new Error('A projectile needs at least one real ammunition part');
  const radius = projectileGroupRadius(pieces), limit = bounds(radius);
  let dx = tx - x, dz = tz - z;
  const length = Math.hypot(dx, dz);
  if (length > 1e-9 && Number.isFinite(length)) { dx /= length; dz /= length; }
  else { dx = 1; dz = 0; }
  return {
    pieces, piece: pieces[0], damage: pieces.length, radius, shotSpeed: CONFIG.projectileSpeed, ownerId,
    x: clamp(x, -limit.x, limit.x), z: clamp(z, -limit.z, limit.z),
    y: Math.max(projectileGroupFloorY(pieces), Number.isFinite(y) ? y : 3.2),
    vx: dx * CONFIG.projectileSpeed, vy: 0, vz: dz * CONFIG.projectileSpeed,
    age: 0, mode: 'shot', settled: false,
  };
}

function startRebound(projectile: PartProjectile, random: Random, landingPointValid?: LandingPointValid): boolean {
  const radius = projectileRadius(projectile), limit = bounds(radius);
  const towardCenter = Math.atan2(-projectile.z, -projectile.x), centerDistance = Math.hypot(projectile.x, projectile.z);
  const minimum = centerDistance * 0.01, maximum = centerDistance * 0.33;
  const valid = (x: number, z: number) => Math.abs(x) <= limit.x + 1e-9 && Math.abs(z) <= limit.z + 1e-9 &&
    (!landingPointValid || landingPointValid(x, z, radius));
  const candidate = (fraction: number, angle: number) => {
    const distance = centerDistance * fraction, direction = towardCenter + angle;
    return { x: projectile.x + Math.cos(direction) * distance, z: projectile.z + Math.sin(direction) * distance };
  };
  let target: { x: number; z: number } | undefined;
  for (let i = 0; i < 12 && centerDistance > 0; i++) {
    const point = candidate(0.01 + unitRandom(random) * 0.32, (unitRandom(random) * 2 - 1) * Math.PI / 3);
    if (valid(point.x, point.z)) { target = point; break; }
  }
  // Every fallback stays in the same short-distance ring. A blocked ring is
  // retried later; sending the group to the distant center is not an escape.
  if (!target && centerDistance > 0) for (let distanceStep = 0; distanceStep <= 16 && !target; distanceStep++) {
    for (let angleStep = 0; angleStep <= 24; angleStep++) {
      const signedStep = angleStep === 0 ? 0 : Math.ceil(angleStep / 2) * (angleStep % 2 ? 1 : -1);
      const point = candidate(0.01 + distanceStep * 0.02, signedStep * Math.PI / 36);
      if (valid(point.x, point.z)) { target = point; break; }
    }
  }
  projectile.mode = 'rebound';
  const distance = target ? Math.hypot(target.x - projectile.x, target.z - projectile.z) : 0;
  const speed = projectile.shotSpeed;
  if (!target || !(speed > 0) || distance < minimum - 1e-9 || distance > maximum + 1e-9) {
    projectile.awaitingLandingPoint = true;
    projectile.vx = projectile.vy = projectile.vz = 0;
    return false;
  }
  delete projectile.awaitingLandingPoint;
  const floor = projectileGroupFloorY(projectile.pieces), height = Math.max(0, projectile.y - floor);
  // Horizontal speed uses at most 45% of the original speed. A sufficiently
  // long flight gives even high launches room for a genuinely upward arc.
  const duration = Math.max(1.2, distance / (speed * 0.45), Math.sqrt(2 * height / GRAVITY) + 0.4,
    4 * height / (speed * 0.75));
  const horizontalSpeed = distance / duration;
  const verticalLimit = Math.sqrt(Math.max(0, speed * speed - horizontalSpeed * horizontalSpeed));
  const maximumGravity = 2 * (verticalLimit - height / duration) / duration;
  const gravity = Math.min(GRAVITY, maximumGravity * 0.9);
  projectile.reboundGravity = gravity;
  projectile.vx = (target.x - projectile.x) / duration;
  projectile.vz = (target.z - projectile.z) / duration;
  projectile.vy = (floor - projectile.y) / duration + gravity * duration / 2;
  return true;
}

function stepRebound(projectile: PartProjectile, dt: number): boolean {
  const floor = projectileGroupFloorY(projectile.pieces), gravity = projectile.reboundGravity ?? GRAVITY;
  const height = Math.max(0, projectile.y - floor);
  const landingTime = (projectile.vy + Math.sqrt(projectile.vy ** 2 + 2 * gravity * height)) / gravity;
  const travel = Math.min(dt, Math.max(0, landingTime));
  projectile.x += projectile.vx * travel;
  projectile.z += projectile.vz * travel;
  projectile.y += projectile.vy * travel - gravity * travel * travel / 2;
  projectile.vy -= gravity * travel;
  if (dt + 1e-9 < landingTime) return false;
  projectile.y = floor;
  projectile.vx = 0; projectile.vy = 0; projectile.vz = 0;
  projectile.settled = true;
  return true;
}

/**
 * Mutate and return the movement segment. A level shot enters a ballistic arc
 * at an edge. No timeout deletes a shot or resets its continuous firing age.
 */
export function stepPartProjectile(
  projectile: PartProjectile, dt: number, random: Random = Math.random,
  landingPointValid?: LandingPointValid,
): PartProjectileStep {
  const from = { x: projectile.x, y: projectile.y, z: projectile.z };
  let landed = false, rebounded = false;
  const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const wasShot = projectile.mode === 'shot';
  projectile.age += elapsed;
  if (!projectile.settled && elapsed > 0) {
    if (wasShot) {
      const limit = bounds(projectileRadius(projectile));
      const edgeX = projectile.vx > 0 ? (limit.x - projectile.x) / projectile.vx :
        projectile.vx < 0 ? (-limit.x - projectile.x) / projectile.vx : Infinity;
      const edgeZ = projectile.vz > 0 ? (limit.z - projectile.z) / projectile.vz :
        projectile.vz < 0 ? (-limit.z - projectile.z) / projectile.vz : Infinity;
      const edgeTime = Math.max(0, Math.min(edgeX, edgeZ));
      const travel = Math.min(elapsed, edgeTime);
      projectile.x += projectile.vx * travel;
      projectile.z += projectile.vz * travel;
      if (edgeTime <= elapsed) {
        projectile.x = clamp(projectile.x, -limit.x, limit.x);
        projectile.z = clamp(projectile.z, -limit.z, limit.z);
        rebounded = startRebound(projectile, random, landingPointValid);
        if (rebounded) landed = stepRebound(projectile, elapsed - travel);
      }
    } else if (projectile.awaitingLandingPoint) {
      rebounded = startRebound(projectile, random, landingPointValid);
      if (rebounded) landed = stepRebound(projectile, elapsed);
    } else landed = stepRebound(projectile, elapsed);
  }
  return {
    from, to: { x: projectile.x, y: projectile.y, z: projectile.z },
    canHit: wasShot && projectile.mode === 'shot' && !projectile.settled,
    landed, rebounded,
  };
}
