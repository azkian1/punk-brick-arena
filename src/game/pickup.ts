import { CONFIG } from './config';
import { attachPiece } from './structure';
import type { AttachmentResult, Piece, Random, Structure, Vec3 } from './types';

export interface PickupState {
  ownerId: string | null;
  age: number;
  settled: boolean;
}

/** Ownership is the last actor to lose this piece, including stolen/grown pieces. */
export function canCollectDrop(drop: PickupState, collectorId: string): boolean {
  if (!drop.settled || drop.age < CONFIG.pickupDelay) return false;
  return drop.ownerId !== collectorId || drop.age >= CONFIG.ownPickupDelay;
}

export interface PickupDrop extends PickupState {
  piece: Piece;
  x: number;
  z: number;
}

export interface PickupCollector {
  id: string;
  x: number;
  z: number;
  pickupRadius: number;
  structure: Structure;
}

export interface CollectedPickup<T extends PickupDrop> {
  drop: T;
  collector: PickupCollector;
  attachment: AttachmentResult;
}

/** Cover the footprint, including asymmetric growth, with a small pickup margin. */
export function pickupRadiusForBounds(bounds: { min: Vec3; max: Vec3 }): number {
  const x = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x));
  const z = Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z));
  return Math.max(CONFIG.pickupRadius, Math.hypot(x, z) * CONFIG.characterScale + CONFIG.pickupReach);
}

// A rejected placement is retried only after that character's geometry changes.
// It never puts the other nearby pieces on an actor-wide cooldown.
const failedPlacements = new WeakMap<PickupDrop, WeakMap<Structure, number>>();

export function collectNearbyDrops<T extends PickupDrop>(
  drops: T[], collectors: PickupCollector[], rng: Random = Math.random,
): CollectedPickup<T>[] {
  const candidates: { drop: T; collector: PickupCollector; distance: number }[] = [];
  for (const drop of drops) {
    for (const collector of collectors) {
      if (!canCollectDrop(drop, collector.id) || !collector.structure.pieces.has(collector.structure.coreId)) continue;
      if (failedPlacements.get(drop)?.get(collector.structure) === collector.structure.revision) continue;
      const distance = (drop.x - collector.x) ** 2 + (drop.z - collector.z) ** 2;
      if (distance <= collector.pickupRadius ** 2) candidates.push({ drop, collector, distance });
    }
  }
  // Resolve shared loot by proximity, not by whichever actor happened to be first.
  candidates.sort((a, b) => a.distance - b.distance);
  const collected = new Set<T>();
  const counts = new Map<PickupCollector, number>();
  const results: CollectedPickup<T>[] = [];
  for (const { drop, collector } of candidates) {
    if (collected.has(drop) || (counts.get(collector) ?? 0) >= CONFIG.pickupBatchSize) continue;
    if (collector.structure.pieces.size >= CONFIG.maxPieces) continue;
    const attachment = attachPiece(collector.structure, drop.piece, rng);
    if (!attachment) {
      let rejected = failedPlacements.get(drop);
      if (!rejected) { rejected = new WeakMap(); failedPlacements.set(drop, rejected); }
      rejected.set(collector.structure, collector.structure.revision);
      continue;
    }
    collected.add(drop);
    counts.set(collector, (counts.get(collector) ?? 0) + 1);
    results.push({ drop, collector, attachment });
  }
  // Compact once instead of shifting the entire ground array for every pickup.
  if (collected.size > 0) {
    let write = 0;
    for (const drop of drops) if (!collected.has(drop)) drops[write++] = drop;
    drops.length = write;
  }
  return results;
}
