import { detachAmmunitionPiece } from './structure';
import type { Piece, Structure } from './types';

export interface Ammunition {
  piece: Piece;
  source: 'reserve' | 'body';
}
const stockProfiles = new WeakMap<Structure, { reserve: Piece[]; revision: number; length: number; coreId: string; count: number }>();
/** Shared exact stock count. Identity, revision, length and Core changes invalidate it. */
export function reserveAmmunitionCount(structure: Structure): number {
  const evolution = structure.evolution;
  if (!evolution) return 0;
  const previous = stockProfiles.get(structure);
  if (previous?.reserve === evolution.reserve && previous.revision === evolution.reserveRevision
    && previous.length === evolution.reserve.length && previous.coreId === structure.coreId) return previous.count;
  let count = 0;
  for (const piece of evolution.reserve) if (piece.id !== structure.coreId) count++;
  stockProfiles.set(structure, { reserve: evolution.reserve, revision: evolution.reserveRevision,
    length: evolution.reserve.length, coreId: structure.coreId, count });
  return count;
}

/** Transfer a real inventory part to a shot. The designated Core is never ammunition. */
export function takeAmmunition(structure: Structure): Ammunition | null {
  if (!structure.pieces.has(structure.coreId)) return null;
  const state = structure.evolution;
  if (state) {
    const index = state.reserve.findIndex(piece => piece.id !== structure.coreId);
    if (index >= 0) {
      const [piece] = state.reserve.splice(index, 1);
      state.reserveRevision++;
      return { piece, source: 'reserve' };
    }
  }
  const piece = detachAmmunitionPiece(structure);
  return piece ? { piece, source: 'body' } : null;
}

/** One volley owns up to twenty available real parts; a shortage never fabricates ammunition. */
export function takeAmmunitionBatch(structure: Structure, count: number): Ammunition[] {
  const limit = Number.isFinite(count) ? Math.min(20, Math.max(0, Math.floor(count))) : 0;
  const batch: Ammunition[] = [];
  while (batch.length < limit) {
    const ammunition = takeAmmunition(structure);
    if (!ammunition) break;
    batch.push(ammunition);
  }
  return batch;
}
