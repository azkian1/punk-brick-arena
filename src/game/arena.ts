import { CONFIG } from './config';
import { segmentCircleHit } from './collision';
import type { MovingBody } from './movement';
import { contactGraph, getBounds } from './structure';
import type { DamageResult, Piece, Random, Structure, Vec3 } from './types';

const EPSILON = 1e-6;
/** Clears the largest authored form (24.2 world radius), with traversal margin. */
export const ARENA_ROUTE_HALF_WIDTH = 26;
const PALETTES = [
  ['#5c6870', '#f5c842', '#de5c42', '#88a078'],
  ['#8a7773', '#ffb742', '#454d59', '#bdcfcc'],
  ['#71839a', '#be4db1', '#d4dacd', '#344544'],
  ['#ac8158', '#dbddcf', '#527976', '#ff6e54'],
];
export type ArenaTemplate = 'wall' | 'tower' | 'ruin' | 'steps' | 'arch';
/** Brick coordinates and bounds are local studs; x/z are world coordinates. */
export interface ArenaBuilding {
  id: string; structure: Structure; x: number; z: number;
  bounds: { min: Vec3; max: Vec3 }; template: ArenaTemplate;
}
export interface ArenaImpact { x: number; z: number; y?: number }
interface Box { minX: number; maxX: number; minZ: number; maxZ: number }
interface Geometry { revision: number; neighbors?: Map<string, string[]>; floor: string[]; boxes: Box[] }
const geometryCaches = new WeakMap<ArenaBuilding, Geometry>();
const randomUnit = (random: Random): number => {
  const value = random();
  return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0;
};
const integer = (random: Random, min: number, max: number) => min + Math.floor(randomUnit(random) * (max - min + 1));
function shuffle<T>(items: T[], random: Random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = integer(random, 0, i); [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
const overlap = (a: Box, b: Box, gap = 0): boolean =>
  a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minZ < b.maxZ + gap && a.maxZ > b.minZ - gap;
function worldBounds(building: ArenaBuilding): Box {
  const scale = CONFIG.characterScale;
  return { minX: building.x + building.bounds.min.x * scale, maxX: building.x + building.bounds.max.x * scale,
    minZ: building.z + building.bounds.min.z * scale, maxZ: building.z + building.bounds.max.z * scale };
}
/** Merge only rectangles whose union is exactly rectangular, preserving real holes. */
function mergeBoxes(boxes: Box[]): Box[] {
  for (const axis of ['x', 'z'] as const) {
    const across = axis === 'x' ? ['minZ', 'maxZ'] as const : ['minX', 'maxX'] as const;
    const along = axis === 'x' ? ['minX', 'maxX'] as const : ['minZ', 'maxZ'] as const;
    const rows = new Map<string, Box[]>();
    for (const box of boxes) {
      const key = box[across[0]] + ':' + box[across[1]], row = rows.get(key) ?? [];
      row.push(box); rows.set(key, row);
    }
    boxes = [];
    for (const row of rows.values()) {
      row.sort((a, b) => a[along[0]] - b[along[0]]);
      for (const box of row) {
        const previous = boxes[boxes.length - 1];
        if (previous && previous[across[0]] === box[across[0]] && previous[across[1]] === box[across[1]] &&
          box[along[0]] <= previous[along[1]] + EPSILON) previous[along[1]] = Math.max(previous[along[1]], box[along[1]]);
        else boxes.push({ ...box });
      }
    }
  }
  return boxes;
}
function footprint(pieces: Map<string, Piece>): Box[] {
  const boxes = new Map<string, Box>(), scale = CONFIG.characterScale;
  for (const piece of pieces.values()) {
    const box = { minX: piece.position.x * scale, maxX: (piece.position.x + piece.size.x) * scale,
      minZ: piece.position.z * scale, maxZ: (piece.position.z + piece.size.z) * scale };
    boxes.set([box.minX, box.maxX, box.minZ, box.maxZ].join(':'), box);
  }
  return mergeBoxes([...boxes.values()]);
}
function geometry(building: ArenaBuilding): Geometry {
  let cached = geometryCaches.get(building);
  if (cached?.revision === building.structure.revision) return cached;
  const pieces = [...building.structure.pieces.values()];
  cached = { revision: building.structure.revision,
    floor: pieces.filter(piece => Math.abs(piece.position.y) <= EPSILON).map(piece => piece.id),
    boxes: footprint(building.structure.pieces) };
  geometryCaches.set(building, cached);
  return cached;
}
function withSupportGraph(building: ArenaBuilding): Geometry {
  const cached = geometry(building);
  if (!cached.neighbors) {
    const pieces = [...building.structure.pieces.values()], graph = contactGraph(pieces);
    cached.neighbors = new Map(pieces.map((piece, i) => [piece.id, graph[i].map(j => pieces[j].id)]));
  }
  return cached;
}
function templatePieces(id: string, template: ArenaTemplate, random: Random): Piece[] {
  const width = template === 'wall' || template === 'arch' ? integer(random, 16, 24) : integer(random, 8, 14);
  const depth = template === 'wall' || template === 'arch' ? integer(random, 2, 4) : integer(random, 8, 12);
  const height = template === 'tower' ? integer(random, 15, 27) : template === 'arch' ? integer(random, 8, 12) : integer(random, 3, 7);
  const palette = PALETTES[integer(random, 0, PALETTES.length - 1)];
  const heights: number[][] = Array.from({ length: width }, () => Array(depth).fill(0));
  for (let x = 0; x < width; x++) for (let z = 0; z < depth; z++) {
    if (template === 'wall') heights[x][z] = Math.max(1, height - Math.floor(x / Math.max(3, width / 3)) + integer(random, 0, 1));
    else if (template === 'tower') {
      if (x < 2 || z < 2 || x >= width - 2 || z >= depth - 2) heights[x][z] = height + integer(random, -2, 3);
    } else if (template === 'ruin') {
      if (x < 2 || z < 2 || x >= width - 2 || (x === Math.floor(width / 2) && z < depth * 0.65)) heights[x][z] = integer(random, 1, height + 3);
    } else if (template === 'steps') heights[x][z] = 1 + Math.floor(x / width * height) + (z < 2 ? integer(random, 0, 2) : 0);
    else if (x < 3 || x >= width - 3) heights[x][z] = height;
  }
  const levels = Math.max(...heights.flat()), pieces: Piece[] = [], rotated = integer(random, 0, 3);
  const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number): void => {
    let px = x - width / 2, pz = z - depth / 2;
    if (rotated === 1) { const oldX = px; px = -pz - sz; pz = oldX; [sx, sz] = [sz, sx]; }
    else if (rotated === 2) { px = -px - sx; pz = -pz - sz; }
    else if (rotated === 3) { const oldX = px; px = pz; pz = -oldX - sx; [sx, sz] = [sz, sx]; }
    pieces.push({ id: id + '/piece-' + pieces.length, position: { x: px, y: Math.round(y * 10) / 10, z: pz },
      size: { x: sx, y: sy, z: sz }, color: palette[integer(random, 0, palette.length - 1)], shape: sy < 1 ? 'plate' : 'brick' });
  };
  for (let level = 0; level < levels; level++) {
    const layers = randomUnit(random) < 0.25 ? 3 : 1;
    for (let layer = 0; layer < layers; layer++) {
      const cells = new Set<string>();
      for (let x = 0; x < width; x++) for (let z = 0; z < depth; z++) {
        if (heights[x][z] > level || (template === 'arch' && level >= height - 2)) cells.add(x + ':' + z);
      }
      for (let x = 0; x < width; x++) for (let z = 0; z < depth; z++) {
        if (!cells.delete(x + ':' + z)) continue;
        let sx = 1, sz = 1;
        const pairX = randomUnit(random) < 0.5;
        if (randomUnit(random) < 0.72) {
          if (pairX && cells.delete((x + 1) + ':' + z)) sx = 2;
          else if (!pairX && cells.delete(x + ':' + (z + 1))) sz = 2;
        }
        if (sx === 2 && cells.has(x + ':' + (z + 1)) && cells.has((x + 1) + ':' + (z + 1)) && randomUnit(random) < 0.25) {
          cells.delete(x + ':' + (z + 1)); cells.delete((x + 1) + ':' + (z + 1)); sz = 2;
        }
        add(x, level * 1.2 + layer * 0.4, z, sx, layers === 3 ? 0.4 : 1.2, sz);
      }
    }
  }
  return pieces;
}
/** Twenty clustered buildings leave four broad diagonal spawn-to-center routes. */
export function generateArenaBuildings(random: Random = Math.random, roundNumber = 1): ArenaBuilding[] {
  const cells: { x: number; z: number }[] = [];
  const limitX = CONFIG.arenaWidth / 2 - 8, limitZ = CONFIG.arenaDepth / 2 - 8;
  for (let x = -limitX; x <= limitX; x += 8) for (let z = -limitZ; z <= limitZ; z += 8) cells.push({ x, z });
  shuffle(cells, random);
  const templates: ArenaTemplate[] = shuffle(['wall', 'tower', 'ruin', 'steps', 'arch'], random);
  const buildings: ArenaBuilding[] = [];
  const spawns = [-1, 1].flatMap(x => [-1, 1].map(z => ({
    x: x * CONFIG.arenaWidth * 0.36, z: z * CONFIG.arenaDepth * 0.36,
  })));
  // Cycle accepted templates so every layout starts with all five construction types.
  for (let attempt = 0; attempt < 30 && buildings.length < 20; attempt++) {
    const template = templates[buildings.length % templates.length], id = 'arena-round-' + roundNumber + '/building-' + buildings.length;
    const pieces = templatePieces(id, template, random);
    const structure: Structure = { pieces: new Map(pieces.map(piece => [piece.id, piece])), coreId: pieces[0].id,
      vacancies: [], revision: 0, roundStartPieces: pieces.length, coreExposed: true };
    const building: ArenaBuilding = { id, template, structure, bounds: getBounds(structure), x: 0, z: 0 };
    for (const cell of cells) {
      building.x = cell.x + (randomUnit(random) - 0.5) * 1.6;
      building.z = cell.z + (randomUnit(random) - 0.5) * 1.6;
      const box = worldBounds(building);
      if (box.minX < -CONFIG.arenaWidth / 2 + 2 || box.maxX > CONFIG.arenaWidth / 2 - 2 ||
        box.minZ < -CONFIG.arenaDepth / 2 + 2 || box.maxZ > CONFIG.arenaDepth / 2 - 2) continue;
      if (buildings.some(other => overlap(box, worldBounds(other), 2.2))) continue;
      // Radius-expanded segment checks reserve the whole route and its spawn end,
      // rather than protecting only an isolated starting circle.
      if (spawns.some(spawn => segmentBuildingHit(0, 0, spawn.x, spawn.z, building, ARENA_ROUTE_HALF_WIDTH) !== null)) continue;
      buildings.push(building);
      break;
    }
  }
  return buildings;
}
function supported(building: ArenaBuilding, cached: Geometry): Set<string> {
  const pieces = building.structure.pieces, reached = new Set(cached.floor.filter(id => pieces.has(id))), queue = [...reached];
  for (let i = 0; i < queue.length; i++) for (const neighbor of cached.neighbors?.get(queue[i]) ?? []) {
    if (pieces.has(neighbor) && !reached.has(neighbor)) { reached.add(neighbor); queue.push(neighbor); }
  }
  return reached;
}
function distanceToPiece(piece: Piece, x: number, y: number, z: number): number {
  const dx = Math.max(piece.position.x - x, 0, x - piece.position.x - piece.size.x);
  const dy = Math.max(piece.position.y - y, 0, y - piece.position.y - piece.size.y);
  const dz = Math.max(piece.position.z - z, 0, z - piece.position.z - piece.size.z);
  return dx * dx + dz * dz + dy * dy * 0.35;
}
/** Neutral construction is anchored to EVERY floor brick, never to an actor Core. */
export function damageArenaBuilding(building: ArenaBuilding, power: number, random: Random = Math.random, impact?: ArenaImpact): DamageResult {
  const direct: Piece[] = [], cascade: Piece[] = [];
  const count = Number.isFinite(power) ? Math.min(building.structure.pieces.size, Math.max(0, Math.floor(power))) : 0;
  if (!count) return { direct, cascade, eliminated: building.structure.pieces.size === 0 };
  const cached = withSupportGraph(building), pieces = [...building.structure.pieces.values()];
  let point = impact && { x: (impact.x - building.x) / CONFIG.characterScale,
    z: (impact.z - building.z) / CONFIG.characterScale, y: (impact.y ?? 1.5) / CONFIG.characterScale };
  if (!point) {
    const exposed = pieces.filter(piece => {
      const directions = new Set<string>();
      for (const id of cached.neighbors?.get(piece.id) ?? []) {
        const other = building.structure.pieces.get(id);
        if (!other) continue;
        for (const axis of ['x', 'z'] as const) {
          if (Math.abs(piece.position[axis] + piece.size[axis] - other.position[axis]) < EPSILON) directions.add(axis + '+');
          if (Math.abs(other.position[axis] + other.size[axis] - piece.position[axis]) < EPSILON) directions.add(axis + '-');
        }
      }
      return directions.size < 4;
    });
    const candidates = exposed.length ? exposed : pieces, seed = candidates[integer(random, 0, candidates.length - 1)];
    point = { x: seed.position.x + seed.size.x / 2, y: seed.position.y + seed.size.y / 2, z: seed.position.z + seed.size.z / 2 };
  }
  const ranked = pieces.map(piece => ({ piece, distance: distanceToPiece(piece, point.x, point.y, point.z), tie: randomUnit(random) }));
  ranked.sort((a, b) => a.distance - b.distance || a.tie - b.tie);
  for (let i = 0; i < count; i++) { direct.push(ranked[i].piece); building.structure.pieces.delete(ranked[i].piece.id); }
  const reached = supported(building, cached);
  for (const piece of building.structure.pieces.values()) if (!reached.has(piece.id)) {
    cascade.push(piece); building.structure.pieces.delete(piece.id);
  }
  building.structure.revision++; building.bounds = getBounds(building.structure);
  cached.boxes = footprint(building.structure.pieces); cached.revision = building.structure.revision;
  return { direct, cascade, eliminated: building.structure.pieces.size === 0 };
}
function segmentBoxHit(ax: number, az: number, bx: number, bz: number, box: Box): number | null {
  let enter = 0, exit = 1;
  for (const [start, delta, min, max] of [[ax, bx - ax, box.minX, box.maxX], [az, bz - az, box.minZ, box.maxZ]]) {
    if (Math.abs(delta) < EPSILON) { if (start < min - EPSILON || start > max + EPSILON) return null; }
    else {
      const a = (min - start) / delta, b = (max - start) / delta;
      enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      if (enter > exit + EPSILON) return null;
    }
  }
  return enter >= 0 && enter <= 1 ? enter : null;
}
/** Exact swept circle against a box: face strips plus round corners. */
function segmentRoundedBoxHit(ax: number, az: number, bx: number, bz: number, box: Box, radius: number): number | null {
  if (radius <= EPSILON) return segmentBoxHit(ax, az, bx, bz, box);
  const hits = [
    segmentBoxHit(ax, az, bx, bz, { ...box, minX: box.minX - radius, maxX: box.maxX + radius }),
    segmentBoxHit(ax, az, bx, bz, { ...box, minZ: box.minZ - radius, maxZ: box.maxZ + radius }),
    ...[box.minX, box.maxX].flatMap(x => [box.minZ, box.maxZ].map(z => segmentCircleHit(ax, az, bx, bz, x, z, radius))),
  ].filter((hit): hit is number => hit !== null);
  return hits.length ? Math.min(...hits) : null;
}
function translated(box: Box, building: ArenaBuilding): Box {
  return { minX: box.minX + building.x, maxX: box.maxX + building.x, minZ: box.minZ + building.z, maxZ: box.maxZ + building.z };
}
/** Earliest WORLD-space hit against actual remaining bricks, including shot width. */
export function segmentBuildingHit(ax: number, az: number, bx: number, bz: number, building: ArenaBuilding, projectileRadius = 0): number | null {
  if (!building.structure.pieces.size) return null;
  const radius = Math.max(0, projectileRadius);
  if (segmentRoundedBoxHit(ax, az, bx, bz, worldBounds(building), radius) === null) return null;
  let first: number | null = null;
  for (const local of geometry(building).boxes) {
    const hit = segmentRoundedBoxHit(ax, az, bx, bz, translated(local, building), radius);
    if (hit !== null && (first === null || hit < first)) first = hit;
  }
  return first;
}
function normalAt(x: number, z: number, box: Box): { x: number; z: number; distance: number } {
  const closestX = Math.max(box.minX, Math.min(box.maxX, x)), closestZ = Math.max(box.minZ, Math.min(box.maxZ, z));
  const dx = x - closestX, dz = z - closestZ, distance = Math.hypot(dx, dz);
  if (distance > EPSILON) return { x: dx / distance, z: dz / distance, distance };
  const sides = [{ x: -1, z: 0, distance: x - box.minX }, { x: 1, z: 0, distance: box.maxX - x },
    { x: 0, z: -1, distance: z - box.minZ }, { x: 0, z: 1, distance: box.maxZ - z }];
  sides.sort((a, b) => a.distance - b.distance);
  return { ...sides[0], distance: -sides[0].distance };
}
function removeInwardVelocity(body: MovingBody, normal: { x: number; z: number }): void {
  const inward = body.vx * normal.x + body.vz * normal.z;
  if (inward < 0) { body.vx -= inward * normal.x; body.vz -= inward * normal.z; }
}
function nearbyBoxes(buildings: ArenaBuilding[], x: number, z: number, targetX: number, targetZ: number, radius: number): Box[] {
  const sweep = { minX: Math.min(x, targetX) - radius - EPSILON, maxX: Math.max(x, targetX) + radius + EPSILON,
    minZ: Math.min(z, targetZ) - radius - EPSILON, maxZ: Math.max(z, targetZ) + radius + EPSILON };
  const boxes: Box[] = [];
  for (const building of buildings) if (building.structure.pieces.size && overlap(sweep, worldBounds(building))) {
    for (const box of geometry(building).boxes) {
      const world = translated(box, building); if (overlap(sweep, world)) boxes.push(world);
    }
  }
  return boxes;
}
/** Return true only when overlap requires the guaranteed clear central fallback. */
function depenetrate(body: MovingBody, buildings: ArenaBuilding[]): boolean {
  for (let iteration = 0; iteration < 12; iteration++) {
    let penetration = 0, best: ReturnType<typeof normalAt> | undefined;
    // Growth can push into cover outside the initial sweep: query AFTER every shift.
    const boxes = nearbyBoxes(buildings, body.x, body.z, body.x, body.z, Math.max(0, body.radius));
    for (const box of boxes) {
      const normal = normalAt(body.x, body.z, box), depth = body.radius - normal.distance;
      if (depth > penetration + EPSILON) { penetration = depth; best = normal; }
    }
    if (!best) return false;
    const limitX = Math.max(0, CONFIG.arenaWidth / 2 - body.radius), limitZ = Math.max(0, CONFIG.arenaDepth / 2 - body.radius);
    body.x = Math.max(-limitX, Math.min(limitX, body.x + best.x * (penetration + EPSILON)));
    body.z = Math.max(-limitZ, Math.min(limitZ, body.z + best.z * (penetration + EPSILON)));
    removeInwardVelocity(body, best);
  }
  const stillOverlapping = buildings.some(building =>
    segmentBuildingHit(body.x, body.z, body.x, body.z, building, Math.max(0, body.radius - EPSILON)) !== null);
  if (!stillOverlapping) return false;
  // The generator reserves this point for every authored full form. Verify again
  // for external callers/custom fixtures; never choose a known occupied fallback.
  const centerFitsArena = body.radius <= Math.min(CONFIG.arenaWidth, CONFIG.arenaDepth) / 2;
  if (centerFitsArena && buildings.every(building =>
    segmentBuildingHit(0, 0, 0, 0, building, body.radius + EPSILON) === null)) {
    body.x = 0; body.z = 0; body.vx = 0; body.vz = 0;
    return true;
  }
  return false;
}
/** Resolve movement/dashes continuously; previous is the position BEFORE movement. */
export function resolveArenaBuildings(body: MovingBody, buildings: ArenaBuilding[], previous?: { x: number; z: number }): void {
  const targetX = body.x, targetZ = body.z;
  let x = previous?.x ?? body.x, z = previous?.z ?? body.z;
  if (previous) {
    const start = { ...body, x, z };
    if (depenetrate(start, buildings)) {
      body.x = start.x; body.z = start.z; body.vx = 0; body.vz = 0;
      return;
    }
    x = start.x; z = start.z; body.vx = start.vx; body.vz = start.vz;
    let dx = targetX - previous.x, dz = targetZ - previous.z;
    for (let iteration = 0; iteration < 8 && Math.hypot(dx, dz) > EPSILON; iteration++) {
      const boxes = nearbyBoxes(buildings, x, z, x + dx, z + dz, Math.max(0, body.radius));
      let earliest = 1, hitNormal: ReturnType<typeof normalAt> | undefined;
      for (const box of boxes) {
        const hit = segmentRoundedBoxHit(x, z, x + dx, z + dz, box, body.radius);
        if (hit === null || hit > earliest) continue;
        const normal = normalAt(x + dx * hit, z + dz * hit, box);
        if (dx * normal.x + dz * normal.z >= -EPSILON) continue;
        earliest = hit; hitNormal = normal;
      }
      x += dx * earliest; z += dz * earliest;
      if (!hitNormal) break;
      x += hitNormal.x * EPSILON; z += hitNormal.z * EPSILON;
      dx *= 1 - earliest; dz *= 1 - earliest;
      const inward = dx * hitNormal.x + dz * hitNormal.z;
      if (inward < 0) { dx -= inward * hitNormal.x; dz -= inward * hitNormal.z; }
      removeInwardVelocity(body, hitNormal);
    }
    body.x = x; body.z = z;
  }
  depenetrate(body, buildings);
}
