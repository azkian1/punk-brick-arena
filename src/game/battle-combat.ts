import { segmentCircleHit } from './collision';
import { segmentBuildingHit, type ArenaBuilding } from './arena';
import { projectileRadius, type PartProjectile } from './projectiles';
import type { Structure } from './types';

export interface CombatTarget { id: string; x: number; z: number; radius: number; structure: Structure }
export type BattleImpact<T extends CombatTarget> =
  | { kind: 'actor'; target: T; fraction: number }
  | { kind: 'building'; target: ArenaBuilding; fraction: number };

/** Resolve first contact; cover blocks actors behind it. */
export function firstBattleImpact<T extends CombatTarget>(
  shot: PartProjectile, endX: number, endZ: number, actors: readonly T[], buildings: readonly ArenaBuilding[],
  canHit: (ownerId: string, targetId: string) => boolean = () => true,
): BattleImpact<T> | null {
  if (shot.mode !== 'shot' || shot.settled) return null;
  const radius = projectileRadius(shot);
  let first: BattleImpact<T> | null = null;
  for (const building of buildings) {
    const fraction = segmentBuildingHit(shot.x, shot.z, endX, endZ, building, radius);
    if (fraction !== null && (!first || fraction < first.fraction)) first = { kind: 'building', target: building, fraction };
  }
  for (const actor of actors) {
    if (actor.id === shot.ownerId || !actor.structure.pieces.has(actor.structure.coreId) || !canHit(shot.ownerId, actor.id)) continue;
    const fraction = segmentCircleHit(shot.x, shot.z, endX, endZ, actor.x, actor.z, actor.radius + radius);
    if (fraction !== null && (!first || fraction < first.fraction)) first = { kind: 'actor', target: actor, fraction };
  }
  return first;
}
