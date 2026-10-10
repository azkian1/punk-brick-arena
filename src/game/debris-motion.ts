import { CONFIG } from './config';
import { segmentBuildingHit, type ArenaBuilding } from './arena';
import { DebrisStack, debrisFloorY, debrisRenderSize, type DebrisBody } from './debris';
import type { Piece, Random, Vec3 } from './types';

const CLEARANCE = 1e-4;
const MAX_ESCAPE_DISTANCE = 8;
const supportIndexes = new WeakMap<readonly MovingDebris[], DebrisStack>();
const blockedEscapes = new WeakMap<MovingDebris, { x: number; z: number; radius: number; source?: ArenaBuilding; stamp: string }>();
const coverIdentities = new WeakMap<ArenaBuilding, number>();
let nextCoverIdentity = 0;
const unit = (random: Random) => {
  const value = random();
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .5;
};

export interface MovingDebris extends DebrisBody {
  vx: number; vy: number; vz: number;
  spawnOrigin?: Vec3;
  /** Only the source construction may be crossed while ejecting its own brick. */
  escapeSource?: ArenaBuilding;
}

export function debrisRadius(piece: Piece): number {
  const size = debrisRenderSize(piece);
  return Math.hypot(size.x, size.z) / 2;
}

export function clampDebrisToArena(body: { x: number; z: number; piece: Piece }): void {
  const radius = debrisRadius(body.piece);
  const limitX = Math.max(0, CONFIG.arenaWidth / 2 - radius), limitZ = Math.max(0, CONFIG.arenaDepth / 2 - radius);
  body.x = Math.max(-limitX, Math.min(limitX, body.x));
  body.z = Math.max(-limitZ, Math.min(limitZ, body.z));
}

export function debrisPositionClear(x: number, z: number, radius: number, buildings: readonly ArenaBuilding[]): boolean {
  return Math.abs(x) + radius <= CONFIG.arenaWidth / 2 + CLEARANCE &&
    Math.abs(z) + radius <= CONFIG.arenaDepth / 2 + CLEARANCE &&
    buildings.every(building => segmentBuildingHit(x, z, x, z, building, radius) === null);
}

/** Short local ejection only. Never use the arena's central actor fallback. */
export function findNearbyDebrisPosition(
  origin: { x: number; z: number }, radius: number, buildings: readonly ArenaBuilding[],
  source?: ArenaBuilding, tangent = 0,
): { x: number; z: number } | null {
  const bounded = { x: origin.x, z: origin.z };
  const limitX = Math.max(0, CONFIG.arenaWidth / 2 - radius), limitZ = Math.max(0, CONFIG.arenaDepth / 2 - radius);
  bounded.x = Math.max(-limitX, Math.min(limitX, bounded.x));
  bounded.z = Math.max(-limitZ, Math.min(limitZ, bounded.z));
  const box = source?.structure.pieces.size ? {
    minX: source.x + source.bounds.min.x * CONFIG.characterScale - radius - CLEARANCE,
    maxX: source.x + source.bounds.max.x * CONFIG.characterScale + radius + CLEARANCE,
    minZ: source.z + source.bounds.min.z * CONFIG.characterScale - radius - CLEARANCE,
    maxZ: source.z + source.bounds.max.z * CONFIG.characterScale + radius + CLEARANCE,
  } : null;
  const outsideSource = (point: { x: number; z: number }) => !box ||
    point.x <= box.minX || point.x >= box.maxX || point.z <= box.minZ || point.z >= box.maxZ;
  const containing = new Set(buildings.filter(building => building === source ||
    (!source && segmentBuildingHit(bounded.x, bounded.z, bounded.x, bounded.z, building, radius) !== null)));
  const valid = (point: { x: number; z: number }) => outsideSource(point) &&
    Math.hypot(point.x - bounded.x, point.z - bounded.z) <= MAX_ESCAPE_DISTANCE + radius &&
    debrisPositionClear(point.x, point.z, radius, buildings) && buildings.every(building => containing.has(building) ||
      segmentBuildingHit(bounded.x, bounded.z, point.x, point.z, building, radius) === null);
  if (valid(bounded)) return { x: bounded.x, z: bounded.z };
  if (box) {
    const faces = [
      { x: box.minX, z: bounded.z + tangent }, { x: box.maxX, z: bounded.z + tangent },
      { x: bounded.x + tangent, z: box.minZ }, { x: bounded.x + tangent, z: box.maxZ },
    ].sort((a, b) => Math.hypot(a.x - bounded.x, a.z - bounded.z) - Math.hypot(b.x - bounded.x, b.z - bounded.z));
    for (const face of faces) if (valid(face)) return face;
  }
  for (const distance of [.25, .5, 1, 1.5, 2, 3, 4, 6, 8]) for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16;
    const point = { x: bounded.x + Math.cos(angle) * distance, z: bounded.z + Math.sin(angle) * distance };
    if (valid(point)) return point;
  }
  return null;
}

/** One physical body per removed brick, preserving its exact identity and geometry. */
export function createBuildingDebris(
  building: ArenaBuilding, pieces: readonly Piece[], buildings: readonly ArenaBuilding[], random: Random = Math.random,
): (MovingDebris & { ownerId: null; age: number })[] {
  return pieces.map(piece => {
    const spawnOrigin = {
      x: building.x + (piece.position.x + piece.size.x / 2) * CONFIG.characterScale,
      y: Math.max(debrisFloorY(piece), (piece.position.y + piece.size.y / 2) * CONFIG.characterScale),
      z: building.z + (piece.position.z + piece.size.z / 2) * CONFIG.characterScale,
    };
    const radius = debrisRadius(piece), position = findNearbyDebrisPosition(spawnOrigin, radius, buildings, building, (unit(random) - .5) * .6);
    const x = position?.x ?? spawnOrigin.x, z = position?.z ?? spawnOrigin.z;
    const escaped = Math.hypot(x - spawnOrigin.x, z - spawnOrigin.z) > CLEARANCE;
    let angle = escaped ? Math.atan2(z - spawnOrigin.z, x - spawnOrigin.x) :
      Math.hypot(x - building.x, z - building.z) > CLEARANCE ? Math.atan2(z - building.z, x - building.x) : unit(random) * Math.PI * 2;
    angle += (unit(random) - .5) * Math.PI / 3;
    const speed = 2.5 + unit(random) * 3 + Math.min(1, spawnOrigin.y / 12) * 3.5;
    return { piece, ownerId: null, spawnOrigin, escapeSource: position ? undefined : building,
      x, y: spawnOrigin.y, z, vx: Math.cos(angle) * speed, vy: 2.5 + unit(random) * 3.5, vz: Math.sin(angle) * speed,
      age: 0, settled: false, rotation: unit(random) * Math.PI };
  });
}

/** Continuous cover contact, radius-aware edges, and the existing physical stack. */
export function stepDebrisPhysics(drops: readonly MovingDebris[], buildings: readonly ArenaBuilding[], dt: number): void {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  const damping = Math.exp(-dt * 3.4), falling: { drop: MovingDebris; previousY: number }[] = [];
  // Twenty construction bounds are cheap to query; avoid touching their detailed
  // brick geometry or allocating escape-search Sets for thousands of clear parts.
  const obstacles = buildings.filter(building => building.structure.pieces.size).map(building => ({ building,
    minX: building.x + building.bounds.min.x * CONFIG.characterScale, maxX: building.x + building.bounds.max.x * CONFIG.characterScale,
    minZ: building.z + building.bounds.min.z * CONFIG.characterScale, maxZ: building.z + building.bounds.max.z * CONFIG.characterScale,
  }));
  const nearby: ArenaBuilding[] = [];
  const coverStamp = buildings.map(building => {
    let identity = coverIdentities.get(building);
    if (identity === undefined) { identity = ++nextCoverIdentity; coverIdentities.set(building, identity); }
    return `${identity}:${building.x}:${building.z}:${building.structure.revision}`;
  }).join(',');
  const query = (ax: number, az: number, bx: number, bz: number, radius: number) => {
    nearby.length = 0;
    const minX = Math.min(ax, bx) - radius, maxX = Math.max(ax, bx) + radius;
    const minZ = Math.min(az, bz) - radius, maxZ = Math.max(az, bz) + radius;
    for (const obstacle of obstacles) if (minX <= obstacle.maxX && maxX >= obstacle.minX && minZ <= obstacle.maxZ && maxZ >= obstacle.minZ) nearby.push(obstacle.building);
  };
  for (const drop of drops) {
    if (drop.settled) continue;
    const radius = debrisRadius(drop.piece);
    clampDebrisToArena(drop);
    query(drop.x, drop.z, drop.x, drop.z, radius);
    if (drop.escapeSource || !debrisPositionClear(drop.x, drop.z, radius, nearby)) {
      const blocked = blockedEscapes.get(drop);
      if (blocked && blocked.x === drop.x && blocked.z === drop.z && blocked.radius === radius
        && blocked.source === drop.escapeSource && blocked.stamp === coverStamp) continue;
      const position = findNearbyDebrisPosition(drop, radius, buildings, drop.escapeSource);
      if (!position) {
        drop.vx = drop.vy = drop.vz = 0; drop.y = Math.max(debrisFloorY(drop.piece), drop.y);
        blockedEscapes.set(drop, { x: drop.x, z: drop.z, radius, source: drop.escapeSource, stamp: coverStamp });
        continue; // Retain the exact part airborne until nearby cover opens.
      }
      blockedEscapes.delete(drop);
      drop.x = position.x; drop.z = position.z; delete drop.escapeSource;
    }
    const desired = { piece: drop.piece, x: drop.x + drop.vx * dt, z: drop.z + drop.vz * dt };
    const desiredX = desired.x, desiredZ = desired.z;
    clampDebrisToArena(desired);
    const dx = desired.x - drop.x, dz = desired.z - drop.z, length = Math.hypot(dx, dz);
    let fraction = 1;
    query(drop.x, drop.z, desired.x, desired.z, radius);
    for (const building of nearby) {
      const hit = segmentBuildingHit(drop.x, drop.z, desired.x, desired.z, building, radius);
      if (hit !== null) fraction = Math.min(fraction, Math.max(0, hit - CLEARANCE / Math.max(length, CLEARANCE)));
    }
    drop.x += dx * fraction; drop.z += dz * fraction;
    if (fraction < 1) { drop.vx *= -.18; drop.vz *= -.18; }
    if (desired.x !== desiredX) drop.vx = 0;
    if (desired.z !== desiredZ) drop.vz = 0;
    const previousY = drop.y;
    drop.vy -= 25 * dt; drop.y += drop.vy * dt;
    drop.vx *= damping; drop.vz *= damping; drop.rotation += dt * drop.vx * .4;
    if (drop.vy <= 0) falling.push({ drop, previousY });
  }
  if (!falling.length) return;
  let stack = supportIndexes.get(drops);
  if (!stack) { stack = new DebrisStack(); supportIndexes.set(drops, stack); }
  stack.sync(drops);
  falling.sort((a, b) => a.previousY - b.previousY);
  for (const { drop, previousY } of falling) {
    if (!stack.canLand(drop)) continue;
    const x = drop.x, z = drop.z, radius = debrisRadius(drop.piece);
    const clearPath = (nextX: number, nextZ: number) => {
      query(x, z, nextX, nextZ, radius);
      return debrisPositionClear(nextX, nextZ, radius, nearby) && nearby.every(building =>
        segmentBuildingHit(x, z, nextX, nextZ, building, radius) === null);
    };
    if (!stack.resolveSideContact(drop, previousY, clearPath, Math.min(.15, dt * 6))) {
      drop.y = previousY; drop.vy = 0;
      continue; // Retain an obstructed part and retry; do not lift it onto the pile.
    }
    if (drop.x !== x || drop.z !== z) { drop.vx *= .5; drop.vz *= .5; }
    const y = stack.landingY(drop, previousY);
    if (drop.y > y) continue;
    drop.y = y;
    if (Math.abs(drop.vy) > 2.2) drop.vy = -drop.vy * .23;
    else { drop.settled = true; drop.vy = 0; stack.add(drop); }
  }
}
