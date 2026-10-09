import { detachAmmunitionPiece } from './structure';
import type { Piece, Structure } from './types';

export interface Ammunition {
  piece: Piece;
  source: 'reserve' | 'body';
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
