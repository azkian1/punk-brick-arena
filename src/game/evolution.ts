import rawPlans from '../assets/evolutions.generated.json';
import { attachAt, attachPiece, connectedToCore, contactGraph, intersects, validGeometry } from './structure';
import { CONFIG } from './config';
import type { AttachmentResult, CharacterTemplate, EvolutionId, EvolutionPlan, EvolutionState, Piece, Random, Structure } from './types';

export const EVOLUTIONS: { id: EvolutionId; name: string; description: string }[] = [
  { id: 'mosher', name: 'Mosher', description: 'Heavy boots, broad shoulders, enormous fists.' },
  { id: 'guitar', name: 'Guitar Demon', description: 'A jagged guitar and a towering claw.' },
  { id: 'spider', name: 'Stage Spider', description: 'A drummer that grows four legs and four arms.' },
  { id: 'bass', name: 'Bass Titan', description: 'A walking wall of speakers and shoulder horns.' },
  { id: 'frontman', name: 'Winged Frontman', description: 'A microphone, a torn coat, and sweeping wings.' },
];
export const EVOLUTION_THRESHOLD = 0.85;
const clone = (p: Piece): Piece => ({ ...p, position: { ...p.position }, size: { ...p.size } });
const signature = (p: Piece) => `${p.size.x}:${p.size.y}:${p.size.z}`;
const plans: { template: CharacterTemplate; key: string; plan: EvolutionPlan }[] = [];

export function evolutionPlan(template: CharacterTemplate, id: EvolutionId, stage: 2 | 3): EvolutionPlan {
  const key = `${id}:${stage}`, saved = plans.find(p => p.template === template && p.key === key);
  if (saved) return saved.plan;
  const raw = rawPlans.find(p => p.id === id && p.stage === stage);
  if (!raw) throw new Error(`Unknown evolution: ${key}`);
  const head = template.pieces.map(p => ({ ...clone(p), position: { ...p.position, y: p.position.y + raw.neckY } }));
  const body: Piece[] = raw.slots.map(([x, y, z, sx, sy, sz], i) => ({ id: `body/${i}`,
    position: { x, y, z }, size: { x: sx, y: sy, z: sz }, color: '#ffffff', shape: sy > 0.4 ? 'brick' : 'plate' }));
  // Different hair/hats can occupy a few body slots. Keep the chosen head intact.
  const available = [...head, ...body.filter(p => p.position.y + p.size.y <= raw.neckY + 1e-6 || !head.some(h => intersects(p, h)))];
  const graph = contactGraph(available), reached = new Set(head.map((_, i) => i)), queue = [...reached];
  for (let i = 0; i < queue.length; i++) for (const neighbor of graph[queue[i]]) {
    if (!reached.has(neighbor)) { reached.add(neighbor); queue.push(neighbor); }
  }
  const slots = available.filter((_, i) => reached.has(i));
  const remap = new Map<number, number>();
  for (let i = 0, n = 0; i < available.length; i++) if (reached.has(i)) remap.set(i, n++);
  const neighbors = graph.filter((_, i) => reached.has(i)).map(edges => edges.filter(i => reached.has(i)).map(i => remap.get(i)!));
  const plan = { id, stage, neckY: raw.neckY, headCount: head.length, slots, neighbors };
  plans.push({ template, key, plan });
  if (plans.length > 12) plans.shift();
  return plan;
}

export function enableEvolution(structure: Structure, template: CharacterTemplate, id: EvolutionId): void {
  const plan = evolutionPlan(template, id, 2);
  const existing = [...structure.pieces.values()];
  if (existing.length !== template.pieces.length) throw new Error('Evolution must start with a base head');
  for (const p of existing) p.position.y += plan.neckY;
  structure.evolution = { id, stage: 2, template, plan,
    occupied: plan.slots.map((_, i) => i < existing.length ? existing[i].id : null),
    everBuilt: new Set(existing.map((_, i) => i)), reserve: [], reserveRevision: 0 };
  structure.revision++;
}

interface Frontier {
  revision: number;
  repair: Map<string, Set<number>>;
  growth: Map<string, Set<number>>;
  bankAttempt: string;
}
const frontiers = new WeakMap<Structure, Frontier>();
const reserveIdentity = new WeakMap<EvolutionState, { revision: number; length: number; pieces: Piece[]; ids: Set<string> }>();
function reserveIds(state: EvolutionState): Set<string> {
  let cached = reserveIdentity.get(state);
  if (!cached || cached.revision !== state.reserveRevision || cached.pieces !== state.reserve || cached.length !== state.reserve.length) {
    cached = { revision: state.reserveRevision, length: state.reserve.length, pieces: state.reserve, ids: new Set(state.reserve.map(p => p.id)) };
    reserveIdentity.set(state, cached);
  }
  return cached.ids;
}
function addCandidate(state: EvolutionState, cache: Frontier, i: number): void {
  if (state.occupied[i] || !state.plan.neighbors[i].some(n => state.occupied[n])) return;
  const map = state.everBuilt.has(i) ? cache.repair : cache.growth;
  const key = signature(state.plan.slots[i]);
  let bucket = map.get(key);
  if (!bucket) { bucket = new Set(); map.set(key, bucket); }
  bucket.add(i);
}
function frontier(structure: Structure): Frontier {
  const state = structure.evolution!;
  let cache = frontiers.get(structure);
  if (cache?.revision === structure.revision) return cache;
  cache = { revision: structure.revision, repair: new Map(), growth: new Map(), bankAttempt: '' };
  for (let i = 0; i < state.occupied.length; i++) {
    if (state.occupied[i] && !structure.pieces.has(state.occupied[i]!)) state.occupied[i] = null;
  }
  for (let i = 0; i < state.occupied.length; i++) addCandidate(state, cache, i);
  frontiers.set(structure, cache);
  return cache;
}
function place(structure: Structure, incoming: Piece): AttachmentResult | null {
  if (structure.pieces.size >= CONFIG.maxPieces) return null;
  const state = structure.evolution!, cache = frontier(structure), key = signature(incoming);
  for (const [map, mode] of [[cache.repair, 'repair'], [cache.growth, 'growth']] as const) {
    for (const i of map.get(key) ?? []) {
      const result = attachAt(structure, incoming, state.plan.slots[i].position, mode);
      if (!result) continue;
      state.occupied[i] = result.piece.id;
      state.everBuilt.add(i);
      map.get(key)!.delete(i);
      for (const neighbor of state.plan.neighbors[i]) addCandidate(state, cache, neighbor);
      cache.revision = structure.revision;
      return result;
    }
  }
  return null;
}

/** Every eligible collected piece is either installed or stored, never fabricated. */
export function collectPiece(structure: Structure, incoming: Piece, random: Random = Math.random): AttachmentResult | null {
  if (!structure.evolution) return attachPiece(structure, incoming, random);
  if (!structure.pieces.has(structure.coreId) || !validGeometry(incoming)) return null;
  const state = structure.evolution;
  const ids = reserveIds(state), base = incoming.id || 'bank';
  let id = base, suffix = 1;
  while (ids.has(id) || structure.pieces.has(id)) id = `${base}~${suffix++}`;
  const candidate = id === incoming.id ? incoming : { ...incoming, id };
  const result = place(structure, candidate);
  if (result) return result;
  const piece = clone(candidate);
  state.reserve.push(piece);
  state.reserveRevision++;
  ids.add(piece.id);
  const cached = reserveIdentity.get(state)!;
  cached.revision = state.reserveRevision; cached.length = state.reserve.length;
  return { piece, mode: 'bank' };
}

/** A bounded batch retries stock when new connections or new loot become available. */
export function assembleReserve(structure: Structure, limit: number = CONFIG.pickupBatchSize): AttachmentResult[] {
  const state = structure.evolution;
  if (!state || !structure.pieces.has(structure.coreId) || structure.pieces.size >= CONFIG.maxPieces) return [];
  const cache = frontier(structure), stamp = `${structure.revision}:${state.reserveRevision}`;
  if (cache.bankAttempt === stamp || !state.reserve.length) return [];
  const stock = new Map<string, Piece[]>();
  for (const p of state.reserve) {
    const key = signature(p), bucket = stock.get(key);
    if (bucket) bucket.push(p); else stock.set(key, [p]);
  }
  const used = new Set<Piece>(), results: AttachmentResult[] = [];
  while (results.length < limit) {
    let next: Piece | undefined;
    for (const map of [cache.repair, cache.growth]) {
      for (const [key, slots] of map) if (slots.size && stock.get(key)?.length) { next = stock.get(key)!.pop(); break; }
      if (next) break;
    }
    if (!next) break;
    const result = place(structure, next);
    if (result) { used.add(next); results.push(result); }
  }
  if (used.size) { state.reserve = state.reserve.filter(p => !used.has(p)); state.reserveRevision++; }
  // If the budget was exhausted there may be more work on the next step.
  cache.bankAttempt = results.length === limit ? '' : `${structure.revision}:${state.reserveRevision}`;
  return results;
}

export function evolutionProgress(structure: Structure) {
  const state = structure.evolution;
  if (!state) return null;
  frontier(structure);
  const built = state.occupied.slice(state.plan.headCount).filter(Boolean).length;
  const target = state.plan.slots.length - state.plan.headCount;
  return { id: state.id, name: EVOLUTIONS.find(e => e.id === state.id)!.name,
    stage: state.stage, built, target, fraction: built / target, reserve: state.reserve.length };
}

/** Only between fights: reuse actual body parts and stock for the larger body. */
export function advanceEvolution(structure: Structure): boolean {
  const state = structure.evolution, progress = evolutionProgress(structure);
  if (!state || state.stage !== 2 || !progress || progress.fraction < EVOLUTION_THRESHOLD || !structure.pieces.has(structure.coreId)) return false;
  const plan = evolutionPlan(state.template, state.id, 3);
  const headIds = new Set(state.occupied.slice(0, state.plan.headCount).filter((id): id is string => !!id));
  const headPositions = new Map(state.occupied.slice(0, state.plan.headCount)
    .map((id, i) => [id, plan.slots[i].position] as const));
  const pool = [...state.reserve, ...[...structure.pieces.values()].filter(p => !headIds.has(p.id))];
  for (const [id, p] of structure.pieces) {
    if (headIds.has(id)) p.position = { ...headPositions.get(id)! };
    else structure.pieces.delete(id);
  }
  state.occupied = plan.slots.map((_, i) => i < plan.headCount ? state.occupied[i] : null);
  state.everBuilt = new Set(Array.from({ length: plan.headCount }, (_, i) => i));
  state.plan = plan; state.stage = 3;
  state.reserve = pool; state.reserveRevision++;
  structure.vacancies = [];
  structure.revision++;
  const connected = connectedToCore(structure);
  for (const [id, piece] of structure.pieces) if (!connected.has(id)) {
    state.reserve.push(piece); structure.pieces.delete(id);
  }
  structure.revision++;
  frontiers.delete(structure);
  return true;
}
