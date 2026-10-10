import { CONFIG } from './config';
import { segmentCircleHit } from './collision';
import templates from '../assets/templates.generated.json';
import evolutions from '../assets/evolutions.generated.json';
import type { MovingBody } from './movement';
import { contactGraph, getBounds } from './structure';
import type { DamageResult, Piece, Random, Structure, Vec3 } from './types';

const EPSILON = 1e-6;
/** Clears the largest authored form (24.2 world radius), with traversal margin. */
export const ARENA_ROUTE_HALF_WIDTH = 26;
export const MAX_ARENA_BUILDING_PIECES = 600;
/** The actual oriented collectible types, including authored tiles. */
export const ARENA_PART_TYPES: readonly { size: Vec3; shape: Piece['shape'] }[] = (() => {
  const types = new Map<string, { size: Vec3; shape: Piece['shape'] }>();
  const add = (size: Vec3, shape: Piece['shape']): void => {
    const key = [size.x, size.y, size.z, shape].join(':');
    types.set(key, { size: { ...size }, shape });
  };
  for (const template of templates) for (const piece of template.pieces) add(piece.size, piece.shape as Piece['shape']);
  // Read raw slots here: importing evolution plans would create an arena/evolution cycle.
  for (const evolution of evolutions) for (const slot of evolution.slots) {
    add({ x: slot[3], y: slot[4], z: slot[5] }, slot[4] < 1 ? 'plate' : 'brick');
  }
  return [...types.values()];
})();
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
type ArenaPartType = typeof ARENA_PART_TYPES[number];
const partType = (x: number, y: number, z: number, shape: Piece['shape'] = y < 1 ? 'plate' : 'brick'): ArenaPartType =>
  ARENA_PART_TYPES.find(type => type.size.x === x && type.size.y === y && type.size.z === z && type.shape === shape)!;
const BRICK_TYPES = ARENA_PART_TYPES.filter(type => type.shape === 'brick');
const WIDE_FLAT_TYPES = ARENA_PART_TYPES.filter(type => type.size.y < 1 && type.size.x * type.size.z >= 6);
const HEIGHT_UNIT = 0.4;
/** Bounded height-field packing permits real cantilevers without overlapping boxes. */
function templatePieces(id: string, template: ArenaTemplate, random: Random, mandatory: readonly ArenaPartType[]): Piece[] {
  const mandatoryWidth = mandatory.reduce((sum, type) => sum + type.size.x, 0);
  const width = Math.max(mandatoryWidth + 2, template === 'wall' || template === 'arch' ? integer(random, 18, 24) : integer(random, 10, 18));
  const depth = Math.max(...mandatory.map(type => type.size.z + 2), template === 'wall' ? integer(random, 8, 12) : integer(random, 10, 14));
  const minX = -Math.floor(width / 2), minZ = -Math.floor(depth / 2), maxX = minX + width, maxZ = minZ + depth;
  const heights = new Int16Array(width * depth), targets = new Int16Array(width * depth);
  const floors: (Piece | undefined)[] = Array(width * depth);
  const pieces: Piece[] = [], palette = PALETTES[integer(random, 0, PALETTES.length - 1)];
  const index = (x: number, z: number) => (x - minX) * depth + z - minZ;
  const inBounds = (x: number, z: number, sx = 1, sz = 1) => x >= minX && z >= minZ && x + sx <= maxX && z + sz <= maxZ;
  const topAt = (x: number, z: number, sx: number, sz: number): number => {
    let top = 0;
    for (let dx = 0; dx < sx; dx++) for (let dz = 0; dz < sz; dz++) top = Math.max(top, heights[index(x + dx, z + dz)]);
    return top;
  };
  const faceContact = (a: Piece, b: Piece): boolean => (['x', 'y', 'z'] as const).some(axis =>
    (Math.abs(a.position[axis] + a.size[axis] - b.position[axis]) < EPSILON ||
      Math.abs(b.position[axis] + b.size[axis] - a.position[axis]) < EPSILON) &&
    (['x', 'y', 'z'] as const).every(other => other === axis ||
      Math.min(a.position[other] + a.size[other], b.position[other] + b.size[other]) -
      Math.max(a.position[other], b.position[other]) > EPSILON));
  const place = (type: ArenaPartType, x: number, z: number, prescribedY?: number): Piece | undefined => {
    if (pieces.length >= MAX_ARENA_BUILDING_PIECES) return;
    const { x: sx, z: sz } = type.size;
    if (!inBounds(x, z, sx, sz)) return;
    const top = topAt(x, z, sx, sz), y = prescribedY ?? top;
    if (y < top) return;
    const piece: Piece = { id: id + '/piece-' + pieces.length, position: { x, y: Math.round(y * HEIGHT_UNIT * 10) / 10, z },
      size: { ...type.size }, shape: type.shape, color: palette[integer(random, 0, palette.length - 1)] };
    let supported = !pieces.length;
    if (y === top && y > 0) supported = true; // At least one positive-area cell touches its actual top owner.
    if (!supported && y === 0) {
      for (let dx = 0; dx < sx && !supported; dx++) for (const nz of [z - 1, z + sz]) {
        if (inBounds(x + dx, nz) && floors[index(x + dx, nz)]) { supported = true; break; }
      }
      for (let dz = 0; dz < sz && !supported; dz++) for (const nx of [x - 1, x + sx]) {
        if (inBounds(nx, z + dz) && floors[index(nx, z + dz)]) { supported = true; break; }
      }
    }
    // Authored horizontal branches/lintels can be attached through a side face.
    if (!supported && prescribedY !== undefined) supported = pieces.some(other => faceContact(piece, other));
    if (!supported) return;
    pieces.push(piece);
    const end = y + Math.round(type.size.y / HEIGHT_UNIT);
    for (let dx = 0; dx < sx; dx++) for (let dz = 0; dz < sz; dz++) {
      const cell = index(x + dx, z + dz); heights[cell] = end;
      if (y === 0) floors[cell] = piece;
    }
    return piece;
  };
  // Two or three mandatory types per accepted building cover the complete map catalogue.
  // Their differently sized floor rectangles touch at a face around the same centerline.
  let cursor = -Math.floor(mandatoryWidth / 2);
  for (const type of mandatory) { place(type, cursor, -Math.floor(type.size.z / 2), 0); cursor += type.size.x; }
  const base = Math.max(...mandatory.map(type => Math.round(type.size.y / HEIGHT_UNIT)));
  const highest = pieces.find(piece => Math.round(piece.size.y / HEIGHT_UNIT) === base)!;
  const spineStart = Math.max(minX, Math.min(maxX - 8, Math.floor(highest.position.x + highest.size.x / 2) - 4));
  place(partType(8, 0.4, 2), spineStart, -1, base);
  // A broken platform connects the remote posts, while leaving irregular edges around it.
  for (const direction of [-1, 1]) {
    let edge = direction < 0 ? spineStart : spineStart + 8;
    while (direction < 0 ? edge > minX : edge < maxX) {
      const remaining = direction < 0 ? edge - minX : maxX - edge;
      const length = [8, 6, 4, 3, 2, 1].find(size => size <= remaining)!;
      place(partType(length, 0.4, 2), direction < 0 ? edge - length : edge, -1, base);
      edge += direction * length;
    }
  }
  const platformY = base + 1;
  const column = (x: number, z: number, top: number, type = partType(2, 1.2, 2)): void => {
    for (let count = 0; count < 40 && topAt(x, z, type.size.x, type.size.z) < top; count++) {
      if (!place(type, x, z)) break;
    }
  };
  const tallHeight = integer(random, 54, 90), lowHeight = integer(random, 8, 17);
  const branchX = integer(random, minX + 2, maxX - 4), branchZ = integer(random, minZ + 2, maxZ - 4);
  for (let x = minX; x < maxX; x++) for (let z = minZ; z < maxZ; z++) {
    let target = 0;
    const edge = x < minX + 3 || x >= maxX - 3 || z < minZ + 2 || z >= maxZ - 2;
    if (template === 'wall') {
      const strip = z >= -2 && z <= 1, arm = Math.abs(x - branchX) < 2 && z < 4;
      if (strip || arm) target = integer(random, 14, 32) - Math.floor((x - minX) / width * 4) * 3;
    } else if (template === 'tower') {
      target = edge ? integer(random, 18, tallHeight) : integer(random, 3, 13);
      if (Math.abs(x - branchX) < 3 && Math.abs(z - branchZ) < 3) target = tallHeight - integer(random, 0, 12);
    } else if (template === 'ruin') {
      if (edge || Math.abs(x - branchX) < 2 || (z >= -2 && z <= 1)) target = integer(random, 2, lowHeight);
    } else if (template === 'steps') {
      target = 2 + Math.floor((x - minX) / width * lowHeight) + integer(random, 0, 3);
      if (z < branchZ) target = Math.max(1, target - integer(random, 2, 6));
    } else {
      target = (x < minX + 4 || x >= maxX - 4) && z >= -2 && z <= 2 ? integer(random, 25, 42) : integer(random, 1, 4);
    }
    if (randomUnit(random) < 0.14 && z !== 0) target = 0;
    targets[index(x, z)] = target;
  }
  if (template === 'tower') {
    column(-1, -1, tallHeight);
    column(branchX, -1, integer(random, 18, tallHeight - 8));
    // Broad real beams make the skinny towers read as crooked, branching constructions.
    place(partType(8, 1.2, 2), -4, -1);
    place(partType(2, 0.4, 8), -1, -4);
  } else if (template === 'wall') {
    const count = integer(random, 3, 5);
    for (let i = 0; i < count; i++) {
      const x = minX + Math.floor(i * (width - 2) / count), z = integer(random, -1, 0);
      column(x, z, platformY + integer(random, 10, 25) - i * 2);
    }
    place(partType(1, 0.4, 8), branchX, -4);
  } else if (template === 'arch') {
    const left = minX + 1, right = maxX - 3, levels = integer(random, 9, 14), lintelY = platformY + levels * 3;
    column(left, -1, lintelY); column(right, -1, lintelY);
    let x = left;
    while (x < right + 2) {
      const remaining = right + 2 - x, length = [8, 6, 4, 3, 2, 1].find(size => size <= remaining)!;
      place(partType(length, 1.2, 2), x, -1, lintelY); x += length;
    }
    place(partType(2, 0.4, 8), left, -4);
  }
  const quantity = template === 'tower' ? integer(random, 130, 560) : template === 'wall' ? integer(random, 50, 440) :
    template === 'arch' ? integer(random, 65, 380) : template === 'steps' ? integer(random, 35, 330) : integer(random, 20, 220);
  const targetQuantity = Math.min(MAX_ARENA_BUILDING_PIECES, Math.max(pieces.length, quantity));
  for (let attempt = 0; attempt < targetQuantity * 24 && pieces.length < targetQuantity; attempt++) {
    const choice = randomUnit(random), pool = choice < 0.34 ? BRICK_TYPES : choice < 0.65 ? WIDE_FLAT_TYPES : ARENA_PART_TYPES;
    const type = pool[integer(random, 0, pool.length - 1)];
    const { x: sx, z: sz } = type.size;
    let x: number, z: number;
    if (randomUnit(random) < 0.7) {
      const anchor = pieces[integer(random, 0, pieces.length - 1)];
      x = anchor.position.x + integer(random, 0, anchor.size.x - 1) - integer(random, 0, sx - 1);
      z = anchor.position.z + integer(random, 0, anchor.size.z - 1) - integer(random, 0, sz - 1);
    } else { x = integer(random, minX, maxX - sx); z = integer(random, minZ, maxZ - sz); }
    if (!inBounds(x, z, sx, sz)) continue;
    const y = topAt(x, z, sx, sz);
    let active = 0, limit = 0;
    for (let dx = 0; dx < sx; dx++) for (let dz = 0; dz < sz; dz++) {
      const target = targets[index(x + dx, z + dz)]; if (target) active++; limit = Math.max(limit, target);
    }
    if (active < sx * sz * 0.6 || y + Math.round(type.size.y / HEIGHT_UNIT) > limit) continue;
    place(type, x, z);
  }
  // Reflections diversify silhouettes without inventing an unavailable 2x1.2x8 brick orientation.
  const flipX = randomUnit(random) < 0.5, flipZ = randomUnit(random) < 0.5;
  for (const piece of pieces) {
    if (flipX) piece.position.x = -piece.position.x - piece.size.x;
    if (flipZ) piece.position.z = -piece.position.z - piece.size.z;
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
  const catalogue = shuffle([...ARENA_PART_TYPES], random), mandatoryTypes: ArenaPartType[][] = [];
  let catalogueCursor = 0;
  for (let i = 0; i < 20; i++) {
    const count = Math.floor(catalogue.length / 20) + (i < catalogue.length % 20 ? 1 : 0);
    mandatoryTypes.push(catalogue.slice(catalogueCursor, catalogueCursor + count)); catalogueCursor += count;
  }
  const buildings: ArenaBuilding[] = [];
  const spawns = [-1, 1].flatMap(x => [-1, 1].map(z => ({
    x: x * CONFIG.arenaWidth * 0.36, z: z * CONFIG.arenaDepth * 0.36,
  })));
  // Cycle accepted templates so every layout starts with all five construction types.
  for (let attempt = 0; attempt < 30 && buildings.length < 20; attempt++) {
    const template = templates[buildings.length % templates.length], id = 'arena-round-' + roundNumber + '/building-' + buildings.length;
    const pieces = templatePieces(id, template, random, mandatoryTypes[buildings.length]);
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
function segmentRectHit(ax: number, az: number, bx: number, bz: number, minX: number, maxX: number, minZ: number, maxZ: number): number | null {
  let enter = 0, exit = 1;
  for (let axis = 0; axis < 2; axis++) {
    const start = axis ? az : ax, delta = axis ? bz - az : bx - ax;
    const min = axis ? minZ : minX, max = axis ? maxZ : maxX;
    if (Math.abs(delta) < EPSILON) { if (start < min - EPSILON || start > max + EPSILON) return null; }
    else {
      const a = (min - start) / delta, b = (max - start) / delta;
      enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      if (enter > exit + EPSILON) return null;
    }
  }
  return enter >= 0 && enter <= 1 ? enter : null;
}
function segmentBoxHit(ax: number, az: number, bx: number, bz: number, box: Box): number | null {
  return segmentRectHit(ax, az, bx, bz, box.minX, box.maxX, box.minZ, box.maxZ);
}
/** Exact swept circle against a box: face strips plus round corners. */
function segmentRoundedBoxHit(ax: number, az: number, bx: number, bz: number, box: Box, radius: number): number | null {
  if (radius <= EPSILON) return segmentBoxHit(ax, az, bx, bz, box);
  // The expanded rectangle is only a rejection broadphase. Exact rounded
  // corners and face strips below retain holes, tangent contacts and fractions.
  if (segmentRectHit(ax, az, bx, bz, box.minX - radius, box.maxX + radius, box.minZ - radius, box.maxZ + radius) === null) return null;
  const first = Math.min(
    segmentRectHit(ax, az, bx, bz, box.minX - radius, box.maxX + radius, box.minZ, box.maxZ) ?? Infinity,
    segmentRectHit(ax, az, bx, bz, box.minX, box.maxX, box.minZ - radius, box.maxZ + radius) ?? Infinity,
    segmentCircleHit(ax, az, bx, bz, box.minX, box.minZ, radius) ?? Infinity,
    segmentCircleHit(ax, az, bx, bz, box.minX, box.maxZ, radius) ?? Infinity,
    segmentCircleHit(ax, az, bx, bz, box.maxX, box.minZ, radius) ?? Infinity,
    segmentCircleHit(ax, az, bx, bz, box.maxX, box.maxZ, radius) ?? Infinity,
  );
  return first === Infinity ? null : first;
}
function translated(box: Box, building: ArenaBuilding): Box {
  return { minX: box.minX + building.x, maxX: box.maxX + building.x, minZ: box.minZ + building.z, maxZ: box.maxZ + building.z };
}
/** Earliest WORLD-space hit against actual remaining bricks, including shot width. */
export function segmentBuildingHit(ax: number, az: number, bx: number, bz: number, building: ArenaBuilding, projectileRadius = 0): number | null {
  if (!building.structure.pieces.size) return null;
  const radius = Math.max(0, projectileRadius);
  if (segmentRoundedBoxHit(ax, az, bx, bz, worldBounds(building), radius) === null) return null;
  const localAx = ax - building.x, localAz = az - building.z, localBx = bx - building.x, localBz = bz - building.z;
  let first: number | null = null;
  for (const local of geometry(building).boxes) {
    const hit = segmentRoundedBoxHit(localAx, localAz, localBx, localBz, local, radius);
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
