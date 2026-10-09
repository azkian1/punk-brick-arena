import { CONFIG } from './config';
import { advanceEvolution, assembleReserve, collectPiece } from './evolution';
import type { PickupDrop } from './pickup';
import type { AttachmentResult, Random, Structure } from './types';

export interface VictoryDrop extends PickupDrop { y: number }
export interface VictoryCollection<T extends VictoryDrop> {
  elapsed: number; total: number; collected: number; skipped: number; pending: Set<T>;
  evolved?: boolean;
  evolutionChecked?: boolean;
}
export function createVictoryCollection<T extends VictoryDrop>(drops: readonly T[]): VictoryCollection<T> {
  return { elapsed: 0, total: drops.length, collected: 0, skipped: 0, pending: new Set(drops) };
}

/** Combat is over: the winner attracts even airborne and ownership-locked pieces. */
export function stepVictoryCollection<T extends VictoryDrop>(
  state: VictoryCollection<T>, drops: T[], player: { x: number; z: number; structure: Structure },
  dt: number, random: Random = Math.random,
): { done: boolean; attachments: { drop: T; attachment: AttachmentResult }[]; assembled: AttachmentResult[] } {
  state.elapsed += dt;
  const attachments: { drop: T; attachment: AttachmentResult }[] = [];
  const removed = new Set<T>();
  let attempted = 0;
  for (const drop of state.pending) {
    drop.age += dt;
    if (!player.structure.pieces.has(player.structure.coreId) || (!player.structure.evolution && player.structure.pieces.size >= CONFIG.maxPieces)) {
      state.skipped += state.pending.size; state.pending.clear(); break;
    }
    const dx = player.x - drop.x, dy = 2.5 - drop.y, dz = player.z - drop.z;
    const distance = Math.hypot(dx, dy, dz);
    // Fired inventory remains locked for everyone even when combat has ended.
    if (drop.age < (drop.lockedUntilAge ?? 0)) continue;
    if (drop.lockedUntilAge !== undefined && !drop.settled) continue;
    if (state.elapsed < 0.3) continue;
    const step = Math.min(distance, (35 + state.elapsed * 32) * dt);
    if (distance > 0.001) {
      drop.x += dx / distance * step; drop.y += dy / distance * step; drop.z += dz / distance * step;
    }
    if (distance - step > 0.8 || attempted >= CONFIG.victoryPickupBatchSize) continue;
    attempted++;
    state.pending.delete(drop);
    const attachment = collectPiece(player.structure, drop.piece, random);
    if (!attachment) { state.skipped++; continue; }
    state.collected++; removed.add(drop); attachments.push({ drop, attachment });
  }
  if (removed.size) {
    let write = 0;
    for (const drop of drops) if (!removed.has(drop)) drops[write++] = drop;
    drops.length = write;
  }
  const assembled = assembleReserve(player.structure, CONFIG.victoryPickupBatchSize);
  let ready = state.pending.size === 0 && assembled.length === 0;
  if (ready && !state.evolutionChecked) {
    state.evolutionChecked = true;
    state.evolved = advanceEvolution(player.structure);
    if (state.evolved) ready = false;
  }
  return { done: state.elapsed >= CONFIG.victoryMinDuration && ready, attachments, assembled };
}
