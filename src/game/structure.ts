import type {
  AttachmentResult, CharacterTemplate, DamageResult, Piece, Random, Structure, Vec3,
} from './types';
import { CONFIG } from './config';

const EPSILON = 1e-6;
const CELL_SIZE = 2;
const AXES = ['x', 'y', 'z'] as const;
type Axis = typeof AXES[number];

const clonePiece = (piece: Piece): Piece => ({
  ...piece, position: { ...piece.position }, size: { ...piece.size },
});
const end = (piece: Piece, axis: Axis) => piece.position[axis] + piece.size[axis];
const near = (a: number, b: number) => Math.abs(a - b) <= EPSILON;
const overlap = (a: Piece, b: Piece, axis: Axis) =>
  Math.min(end(a, axis), end(b, axis)) - Math.max(a.position[axis], b.position[axis]);
export const intersects = (a: Piece, b: Piece) => AXES.every(axis => overlap(a, b, axis) > EPSILON);

function touching(a: Piece, b: Piece): boolean {
  return AXES.some(axis =>
    (near(end(a, axis), b.position[axis]) || near(end(b, axis), a.position[axis])) &&
    AXES.every(other => other === axis || overlap(a, b, other) > EPSILON));
}

export function validGeometry(piece: Piece): boolean {
  return AXES.every(axis => Number.isFinite(piece.position[axis]) &&
    Number.isFinite(piece.size[axis]) && piece.size[axis] > EPSILON);
}

function randomIndex(length: number, rng: Random): number {
  const value = rng();
  return Math.min(length - 1, Math.floor(Math.max(0, Number.isFinite(value) ? value : 0) * length));
}

function shuffled<T>(values: T[], rng: Random): T[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, rng);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function cellRange(piece: Piece, margin = 0): { min: Vec3; max: Vec3; count: number } {
  const min = {} as Vec3;
  const max = {} as Vec3;
  for (const axis of AXES) {
    min[axis] = Math.floor((piece.position[axis] - margin) / CELL_SIZE);
    max[axis] = Math.floor((end(piece, axis) + margin) / CELL_SIZE);
  }
  return { min, max, count: (max.x - min.x + 1) * (max.y - min.y + 1) * (max.z - min.z + 1) };
}

/** Local bucket queries keep cascades and candidate collision checks off the O(n²) path. */
class SpatialIndex {
  private readonly buckets = new Map<string, Piece[]>();
  private readonly large: Piece[] = [];

  constructor(private readonly pieces: Piece[]) {
    for (const piece of pieces) this.indexPiece(piece);
  }

  private indexPiece(piece: Piece): void {
    const range = cellRange(piece);
    // Imported unusually large bricks must not create an unbounded bucket allocation.
    if (range.count > 512) {
      this.large.push(piece);
      return;
    }
    this.visit(range, key => {
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(piece);
      else this.buckets.set(key, [piece]);
    });
  }

  add(piece: Piece): void {
    this.pieces.push(piece);
    this.indexPiece(piece);
  }

  private visit(range: ReturnType<typeof cellRange>, visitor: (key: string) => void): void {
    for (let x = range.min.x; x <= range.max.x; x++) {
      for (let y = range.min.y; y <= range.max.y; y++) {
        for (let z = range.min.z; z <= range.max.z; z++) visitor(`${x},${y},${z}`);
      }
    }
  }

  nearby(piece: Piece): Piece[] {
    const range = cellRange(piece, EPSILON);
    if (range.count > 4096) return this.pieces;
    const found = new Set<Piece>(this.large);
    this.visit(range, key => {
      for (const other of this.buckets.get(key) ?? []) found.add(other);
    });
    return [...found];
  }
}

interface GeometryCache {
  revision: number;
  index?: SpatialIndex;
  connected?: Set<string>;
}
const caches = new WeakMap<Structure, GeometryCache>();

function geometryCache(structure: Structure): GeometryCache {
  let cache = caches.get(structure);
  if (!cache || cache.revision !== structure.revision) {
    cache = { revision: structure.revision };
    caches.set(structure, cache);
  }
  return cache;
}

function geometry(structure: Structure): GeometryCache & { index: SpatialIndex } {
  const cache = geometryCache(structure);
  cache.index ??= new SpatialIndex([...structure.pieces.values()]);
  return cache as GeometryCache & { index: SpatialIndex };
}

/** Exact blueprint slots already have an immutable face graph. */
function blueprintComponent(structure: Structure): Set<string> | null {
  const state = structure.evolution;
  if (!state) return null;
  const mapped = new Set<string>();
  let core = -1;
  for (let i = 0; i < state.occupied.length; i++) {
    const id = state.occupied[i], piece = id && structure.pieces.get(id);
    if (!piece) continue;
    const slot = state.plan.slots[i];
    if (!slot || mapped.has(piece.id) || !AXES.every(axis =>
      piece.position[axis] === slot.position[axis] && piece.size[axis] === slot.size[axis])) return null;
    mapped.add(piece.id);
    if (piece.id === structure.coreId) core = i;
  }
  // Direct free-growth/attachment callers can temporarily lie outside the plan.
  if (mapped.size !== structure.pieces.size) return null;
  const reached = new Set<string>();
  if (core < 0) return reached;
  const queue = [core];
  reached.add(structure.coreId);
  for (let i = 0; i < queue.length; i++) for (const neighbor of state.plan.neighbors[queue[i]]) {
    const id = state.occupied[neighbor];
    if (id && structure.pieces.has(id) && !reached.has(id)) { reached.add(id); queue.push(neighbor); }
  }
  return reached;
}

function coreComponent(structure: Structure): Set<string> {
  const cache = geometryCache(structure);
  if (cache.connected) return cache.connected;
  const blueprint = blueprintComponent(structure);
  if (blueprint) { cache.connected = blueprint; return blueprint; }
  const index = geometry(structure).index;
  const reached = new Set<string>();
  const core = structure.pieces.get(structure.coreId);
  if (core) {
    const queue = [core];
    reached.add(core.id);
    for (let i = 0; i < queue.length; i++) {
      for (const other of index.nearby(queue[i])) {
        if (!reached.has(other.id) && touching(queue[i], other)) {
          reached.add(other.id);
          queue.push(other);
        }
      }
    }
  }
  cache.connected = reached;
  return reached;
}

export function createStructure(template: CharacterTemplate): Structure {
  const pieces = new Map<string, Piece>();
  for (const piece of template.pieces) {
    if (!piece.id || pieces.has(piece.id)) throw new Error(`Duplicate or empty piece ID: ${piece.id}`);
    if (!validGeometry(piece)) throw new Error(`Invalid geometry for piece: ${piece.id}`);
    pieces.set(piece.id, clonePiece(piece));
  }
  if (!pieces.has(template.coreId)) throw new Error(`Template Core does not exist: ${template.coreId}`);
  return { pieces, coreId: template.coreId, vacancies: [], revision: 0,
    roundStartPieces: pieces.size, coreExposed: pieces.size <= 1 };
}

/** A new fight preserves the exact survivor, but starts a fresh protection phase. */
export function carryToNextRound(previous: Structure): Structure {
  if (!previous.pieces.has(previous.coreId)) throw new Error('Cannot carry an eliminated character');
  return {
    pieces: new Map([...previous.pieces].map(([id, piece]) => [id, clonePiece(piece)])),
    coreId: previous.coreId,
    vacancies: previous.vacancies.map(clonePiece),
    revision: 0,
    roundStartPieces: previous.pieces.size,
    coreExposed: previous.pieces.size <= 1,
    evolution: previous.evolution && {
      ...previous.evolution,
      occupied: [...previous.evolution.occupied],
      everBuilt: new Set(previous.evolution.everBuilt),
      reserve: previous.evolution.reserve.map(clonePiece),
    },
  };
}

export function coreExposureThreshold(structure: Structure): number {
  return Math.max(1, Math.floor(structure.roundStartPieces * (1 - CONFIG.coreProtectionLoss) + EPSILON));
}

/** Returns a copy so callers cannot accidentally mutate the cached connectivity graph. */
export function connectedToCore(structure: Structure): Set<string> {
  return new Set(coreComponent(structure));
}

function contains(box: Piece, piece: Piece): boolean {
  return AXES.every(axis => piece.position[axis] >= box.position[axis] - EPSILON &&
    end(piece, axis) <= end(box, axis) + EPSILON);
}

/** Merge only face-adjacent empty boxes whose union is still one exact rectangle. */
function recordVacancy(vacancies: Piece[], lost: Piece): void {
  let vacancy = clonePiece(lost);
  for (let i = 0; i < vacancies.length;) {
    const other = vacancies[i];
    if (contains(other, vacancy)) return;
    if (contains(vacancy, other)) {
      vacancies.splice(i, 1);
      continue;
    }
    const axis = AXES.find(candidate =>
      AXES.every(perpendicular => perpendicular === candidate ||
        (near(vacancy.position[perpendicular], other.position[perpendicular]) &&
          near(vacancy.size[perpendicular], other.size[perpendicular]))) &&
      (near(end(vacancy, candidate), other.position[candidate]) ||
        near(end(other, candidate), vacancy.position[candidate])));
    if (axis) {
      const min = Math.min(vacancy.position[axis], other.position[axis]);
      const max = Math.max(end(vacancy, axis), end(other, axis));
      vacancy.position[axis] = min;
      vacancy.size[axis] = max - min;
      vacancies.splice(i, 1);
      i = 0;
    } else i++;
  }
  vacancies.push(vacancy);
}

/** Subtract a placed brick, preserving the remainder of a larger repair cavity. */
function consumeVacancies(structure: Structure, placed: Piece): void {
  const remaining: Piece[] = [];
  for (const vacancy of structure.vacancies) {
    if (!intersects(vacancy, placed)) {
      remaining.push(vacancy);
      continue;
    }
    const middle = clonePiece(vacancy);
    for (const axis of AXES) {
      const low = Math.max(middle.position[axis], placed.position[axis]);
      const high = Math.min(end(middle, axis), end(placed, axis));
      if (low - middle.position[axis] > EPSILON) {
        const fragment = clonePiece(middle);
        fragment.size[axis] = low - middle.position[axis];
        remaining.push(fragment);
      }
      if (end(middle, axis) - high > EPSILON) {
        const fragment = clonePiece(middle);
        fragment.position[axis] = high;
        fragment.size[axis] = end(middle, axis) - high;
        remaining.push(fragment);
      }
      middle.position[axis] = low;
      middle.size[axis] = high - low;
    }
  }
  structure.vacancies = remaining;
}

export function damageStructure(
  structure: Structure, power: number, rng: Random = Math.random,
): DamageResult {
  const available = [...structure.pieces.values()].filter(piece => structure.coreExposed || piece.id !== structure.coreId);
  const count = Math.min(available.length, Number.isFinite(power) ? Math.max(0, Math.floor(power)) : 0);
  const direct: Piece[] = [];
  const cascade: Piece[] = [];
  if (count > 0) {
    // Select the complete batch before checking the threshold: a newly exposed
    // Core becomes eligible only on the following hit, never midway through this one.
    for (let i = 0; i < count; i++) {
      const index = i + randomIndex(available.length - i, rng);
      [available[i], available[index]] = [available[index], available[i]];
      direct.push(available[i]);
      structure.pieces.delete(available[i].id);
    }
    caches.delete(structure);
    const connected = coreComponent(structure);
    for (const piece of structure.pieces.values()) {
      if (!connected.has(piece.id)) {
        cascade.push(piece);
        structure.pieces.delete(piece.id);
      }
    }
    // Blueprint slots already record exact repair locations; avoid merging thousands
    // of detached body boxes into generic free-growth cavities.
    if (!structure.evolution) for (const piece of [...direct, ...cascade]) recordVacancy(structure.vacancies, piece);
    if (structure.pieces.size <= coreExposureThreshold(structure)) structure.coreExposed = true;
    structure.revision++;
    // The reached component remains correct after discarding the disconnected pieces.
    // A spatial index built before that discard must be rebuilt on its next use.
    if (cascade.length > 0) {
      const cache = caches.get(structure);
      if (cache) cache.index = undefined;
    }
    geometryAfterRevision(structure);
  }
  return { direct, cascade, eliminated: !structure.pieces.has(structure.coreId) };
}

/** Shared face graph for immutable evolution blueprints. */
export function contactGraph(pieces: Piece[]): number[][] {
  const index = new SpatialIndex(pieces), ids = new Map(pieces.map((p, i) => [p.id, i]));
  return pieces.map(piece => index.nearby(piece).filter(other => other !== piece && touching(piece, other)).map(other => ids.get(other.id)!));
}

/** Install at a prescribed slot, preserving the collected part's size and color. */
export function attachAt(structure: Structure, incoming: Piece, position: Vec3, mode: 'repair' | 'growth'): AttachmentResult | null {
  if (!structure.pieces.has(structure.coreId) || !validGeometry(incoming)) return null;
  const cache = geometry(structure), connected = coreComponent(structure);
  const piece = { ...clonePiece(incoming), position: { ...position } };
  const nearby = cache.index.nearby(piece);
  if (nearby.some(other => intersects(piece, other)) || !nearby.some(other => connected.has(other.id) && touching(piece, other))) return null;
  const base = piece.id || 'pickup';
  let suffix = 1;
  while (structure.pieces.has(piece.id)) piece.id = `${base}~${suffix++}`;
  structure.pieces.set(piece.id, piece);
  cache.index.add(piece);
  connected.add(piece.id);
  cache.connected = connected;
  cache.revision = ++structure.revision;
  return { piece, mode };
}

function geometryAfterRevision(structure: Structure): void {
  const cache = caches.get(structure);
  if (cache) cache.revision = structure.revision;
}

function faceCandidates(anchor: Piece, incoming: Piece, hole?: Piece): Vec3[] {
  const positions: Vec3[] = [];
  for (const normal of AXES) {
    const [u, v] = AXES.filter(axis => axis !== normal);
    const offsets = (axis: Axis) => {
      const raw = [anchor.position[axis], end(anchor, axis) - incoming.size[axis],
        anchor.position[axis] + (anchor.size[axis] - incoming.size[axis]) / 2];
      return [...new Set(raw.map(value => hole ? Math.max(hole.position[axis],
        Math.min(end(hole, axis) - incoming.size[axis], value)) : value))];
    };
    for (const coordinate of [end(anchor, normal), anchor.position[normal] - incoming.size[normal]]) {
      for (const a of offsets(u)) {
        for (const b of offsets(v)) {
          const position = { x: 0, y: 0, z: 0 };
          position[normal] = coordinate;
          position[u] = a;
          position[v] = b;
          positions.push(position);
        }
      }
    }
  }
  return positions;
}

export function attachPiece(
  structure: Structure, incoming: Piece, rng: Random = Math.random,
): AttachmentResult | null {
  if (!structure.pieces.has(structure.coreId) || !validGeometry(incoming)) return null;
  const cache = geometry(structure);
  const { index } = cache;
  const connected = coreComponent(structure);
  const tested = new Set<string>();
  const validAt = (position: Vec3): Piece | null => {
    const cleaned = Object.fromEntries(AXES.map(axis => [axis,
      Math.abs(position[axis]) < EPSILON ? 0 : Math.round(position[axis] * 1e9) / 1e9])) as unknown as Vec3;
    if (cleaned.y < 0) return null;
    const key = `${cleaned.x},${cleaned.y},${cleaned.z}`;
    if (tested.has(key)) return null;
    tested.add(key);
    const candidate = { ...incoming, position: cleaned, size: { ...incoming.size } };
    const neighbors = index.nearby(candidate);
    if (neighbors.some(other => intersects(candidate, other))) return null;
    return neighbors.some(other => connected.has(other.id) && touching(candidate, other)) ? candidate : null;
  };
  const finish = (piece: Piece, mode: AttachmentResult['mode']): AttachmentResult => {
    const base = incoming.id || 'pickup';
    piece.id = base;
    let suffix = 1;
    while (structure.pieces.has(piece.id)) piece.id = `${base}~${suffix++}`;
    structure.pieces.set(piece.id, piece);
    consumeVacancies(structure, piece);
    structure.revision++;
    // Pickups can arrive in a burst. Extend the cached index/component instead of
    // re-traversing the whole character for every single nearby fallen brick.
    index.add(piece);
    const queue = [piece];
    connected.add(piece.id);
    for (let i = 0; i < queue.length; i++) {
      for (const neighbor of index.nearby(queue[i])) {
        if (!connected.has(neighbor.id) && touching(queue[i], neighbor)) {
          connected.add(neighbor.id);
          queue.push(neighbor);
        }
      }
    }
    cache.connected = connected;
    cache.revision = structure.revision;
    return { piece, mode };
  };

  for (const vacancy of shuffled([...structure.vacancies], rng)) {
    if (!AXES.every(axis => incoming.size[axis] <= vacancy.size[axis] + EPSILON)) continue;
    const candidates: Vec3[] = [{ ...vacancy.position }];
    for (const neighbor of index.nearby(vacancy)) {
      if (connected.has(neighbor.id)) candidates.push(...faceCandidates(neighbor, incoming, vacancy));
    }
    for (const position of shuffled(candidates, rng)) {
      if (!contains(vacancy, { ...incoming, position })) continue;
      const piece = validAt(position);
      if (piece) return finish(piece, 'repair');
    }
  }

  const anchors = shuffled([...structure.pieces.values()].filter(piece => connected.has(piece.id)), rng);
  for (const anchor of anchors) {
    for (const position of shuffled(faceCandidates(anchor, incoming), rng)) {
      const piece = validAt(position);
      if (piece) return finish(piece, 'growth');
    }
  }
  return null;
}

export function getBounds(structure: Structure): { min: Vec3; max: Vec3 } {
  if (structure.pieces.size === 0) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const piece of structure.pieces.values()) {
    for (const axis of AXES) {
      min[axis] = Math.min(min[axis], piece.position[axis]);
      max[axis] = Math.max(max[axis], end(piece, axis));
    }
  }
  return { min, max };
}
