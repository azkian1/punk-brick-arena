import { CONFIG } from './config';
import { attachPiece } from './structure';
import type { PickupDrop } from './pickup';
import type { AttachmentResult, Random, Structure } from './types';

export interface VictoryDrop extends PickupDrop { y: number }
export interface VictoryCollection<T extends VictoryDrop> {
  elapsed: number; total: number; collected: number; skipped: number; pending: Set<T>;
}
export function createVictoryCollection<T extends VictoryDrop>(drops: readonly T[]): VictoryCollection<T> {
  return { elapsed: 0, total: drops.length, collected: 0, skipped: 0, pending: new Set(drops) };
}

/** Combat is over: the winner attracts even airborne and ownership-locked pieces. */
export function stepVictoryCollection<T extends VictoryDrop>(
  state: VictoryCollection<T>, drops: T[], player: { x: number; z: number; structure: Structure },
  dt: number, random: Random = Math.random,
): { done: boolean; attachments: { drop: T; attachment: AttachmentResult }[] } {
  state.elapsed += dt;
  const attachments: { drop: T; attachment: AttachmentResult }[] = [];
  const removed = new Set<T>();
  let attempted = 0;
  for (const drop of state.pending) {
    if (!player.structure.pieces.has(player.structure.coreId) || player.structure.pieces.size >= CONFIG.maxPieces) {
      state.skipped += state.pending.size; state.pending.clear(); break;
    }
    const dx = player.x - drop.x, dy = 2.5 - drop.y, dz = player.z - drop.z;
    const distance = Math.hypot(dx, dy, dz);
    if (state.elapsed < 0.3) continue;
    const step = Math.min(distance, (35 + state.elapsed * 32) * dt);
    if (distance > 0.001) {
      drop.x += dx / distance * step; drop.y += dy / distance * step; drop.z += dz / distance * step;
    }
    if (distance - step > 0.8 || attempted >= CONFIG.victoryPickupBatchSize) continue;
    attempted++;
    state.pending.delete(drop);
    const attachment = attachPiece(player.structure, drop.piece, random);
    if (!attachment) { state.skipped++; continue; }
    state.collected++; removed.add(drop); attachments.push({ drop, attachment });
  }
  if (removed.size) {
    let write = 0;
    for (const drop of drops) if (!removed.has(drop)) drops[write++] = drop;
    drops.length = write;
  }
  return { done: state.elapsed >= CONFIG.victoryMinDuration && state.pending.size === 0, attachments };
}
