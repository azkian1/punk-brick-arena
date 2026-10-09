import rawPlans from '../assets/evolutions.generated.json';
import colors from '../assets/evolution-colors.generated.json';
import type { CharacterTemplate, Piece, Structure } from './types';

export const RUNE_INTERVAL = 30;
export const RUNE_PICKUP_RADIUS = 2.5;
export interface RuneState { elapsed: number; nextSpawn: number; available: boolean; spawned: number; collected: number }
export function createRune(): RuneState {
  return { elapsed: 0, nextSpawn: RUNE_INTERVAL, available: false, spawned: 0, collected: 0 };
}
/** Called only while combat runs. A missed rune remains; no stack accumulates. */
export function stepRune(state: RuneState, dt: number): boolean {
  state.elapsed += Number.isFinite(dt) ? Math.max(0, dt) : 0;
  if (state.elapsed + 1e-9 < state.nextSpawn) return false;
  state.nextSpawn += (Math.floor((state.elapsed + 1e-9 - state.nextSpawn) / RUNE_INTERVAL) + 1) * RUNE_INTERVAL;
  if (state.available) return false;
  state.available = true; state.spawned++;
  return true;
}
const geometryKey = (piece: Piece) => [piece.position.x, piece.position.y, piece.position.z, piece.size.x, piece.size.y, piece.size.z]
  .map(n => Math.round(n * 1000)).join(':');
const bodyPalettes = new Map<string, Map<string, string>>();
function bodyPalette(id: string, stage: number): Map<string, string> {
  const key = `${id}:${stage}`;
  let saved = bodyPalettes.get(key);
  if (saved) return saved;
  saved = new Map();
  const raw = rawPlans.find(plan => plan.id === id && plan.stage === stage)!;
  const swatches = colors.plans.find(plan => plan.id === id && plan.stage === stage)!;
  raw.slots.forEach((slot, i) => saved!.set(slot.map(n => Math.round(n * 1000)).join(':'), colors.palette[swatches.colors[i]]));
  bodyPalettes.set(key, saved);
  return saved;
}
/** A one-time paint operation on installed parts. IDs, stock and geometry stay intact. */
export function restoreModelColors(structure: Structure, template: CharacterTemplate): number {
  if (!structure.pieces.has(structure.coreId)) return 0;
  let changed = 0;
  const state = structure.evolution;
  if (state) {
    const body = bodyPalette(state.id, state.stage);
    state.occupied.forEach((id, i) => {
      const piece = id && structure.pieces.get(id);
      if (!piece) return;
      const slot = state.plan.slots[i];
      const color = i < state.plan.headCount ? slot.color : body.get(geometryKey(slot));
      if (color && color !== piece.color) { piece.color = color; changed++; }
    });
  } else {
    const palette = new Map(template.pieces.map(p => [geometryKey(p), p.color]));
    for (const piece of structure.pieces.values()) {
      const color = palette.get(geometryKey(piece));
      if (color && color !== piece.color) { piece.color = color; changed++; }
    }
  }
  if (changed) structure.revision++;
  return changed;
}
export interface RuneCollector { id: string; x: number; z: number; radius: number; structure: Structure; template: CharacterTemplate }
/** Nearest living touching fighter wins a simultaneous contact deterministically. */
export function collectRune<T extends RuneCollector>(state: RuneState, actors: readonly T[]): T | null {
  if (!state.available) return null;
  const candidates = actors.filter(actor => actor.structure.pieces.has(actor.structure.coreId)
    && Math.hypot(actor.x, actor.z) <= actor.radius + RUNE_PICKUP_RADIUS);
  candidates.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z) || a.id.localeCompare(b.id));
  const actor = candidates[0];
  if (!actor) return null;
  restoreModelColors(actor.structure, actor.template);
  state.available = false; state.collected++;
  return actor;
}
