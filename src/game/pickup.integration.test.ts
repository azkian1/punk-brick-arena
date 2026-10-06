import { describe, expect, it } from 'vitest';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { CONFIG } from './config';
import { createStructure, damageStructure, getBounds } from './structure';
import { collectNearbyDrops, pickupRadiusForBounds, type PickupCollector, type PickupDrop } from './pickup';

const player = (): PickupCollector => {
  const structure = createStructure(CHARACTER_TEMPLATES[0]);
  return { id: 'player', x: 0, z: 0, structure, pickupRadius: pickupRadiusForBounds(getBounds(structure)) };
};
const pile = (count: number, ownerId: string | null = 'enemy'): PickupDrop[] => Array.from({ length: count }, (_, i) => ({
  ownerId, age: 2, settled: true, x: (i % 7 - 3) * 0.15, z: (Math.floor(i / 7) % 7 - 3) * 0.15,
  piece: { ...CHARACTER_TEMPLATES[1].pieces[i % CHARACTER_TEMPLATES[1].pieces.length], id: `loot-${i}` },
}));

describe('running over a pile of enemy bricks', () => {
  it('collects all 120 nearby pieces in one pass at full movement speed', () => {
    const actor = player(), drops = pile(120), originalSize = actor.structure.pieces.size;
    actor.x = -10;
    let firstPickupTick = -1, lastPickupTick = -1;
    for (let tick = 0; tick < 90; tick++) {
      actor.x += CONFIG.movementSpeed / 60;
      actor.pickupRadius = pickupRadiusForBounds(getBounds(actor.structure));
      const results = collectNearbyDrops(drops, [actor], () => 0.6);
      if (results.length > 0) {
        if (firstPickupTick < 0) firstPickupTick = tick;
        lastPickupTick = tick;
      }
    }
    expect(drops).toHaveLength(0);
    expect(actor.structure.pieces.size).toBe(originalSize + 120);
    expect((lastPickupTick - firstPickupTick + 1) / 60).toBeLessThan(0.4);
  });

  it('picks up a batch immediately, prioritizes closer loot and preserves IDs without duplicates', () => {
    const actor = player(), drops = pile(20);
    drops.forEach((drop, index) => { drop.x = (20 - index) * 0.1; drop.z = 0; });
    const results = collectNearbyDrops(drops, [actor], () => 0.6);
    expect(results).toHaveLength(CONFIG.pickupBatchSize);
    expect(results[0].drop.piece.id).toBe('loot-19');
    expect(new Set(results.map(result => result.attachment.piece.id)).size).toBe(results.length);
    expect(drops).toHaveLength(20 - results.length);
    for (const result of results) expect(drops.includes(result.drop)).toBe(false);
  });

  it('covers a wide and asymmetrically grown build instead of only a small circle at its center', () => {
    const actor = player();
    const bounds = { min: { x: -2, y: 0, z: -3 }, max: { x: 20, y: 12, z: 4 } };
    actor.pickupRadius = pickupRadiusForBounds(bounds);
    const drops = pile(1);
    drops[0].x = 10;
    expect(actor.pickupRadius).toBeGreaterThan(10);
    expect(collectNearbyDrops(drops, [actor])).toHaveLength(1);
  });

  it('keeps the five-second owner restriction while collecting enemy pieces from the same pile', () => {
    const actor = player(), own = pile(8, 'player'), foreign = pile(8);
    own.forEach(drop => { drop.piece = { ...drop.piece, id: `own-${drop.piece.id}` }; drop.age = 4.999; });
    const drops = [...own, ...foreign];
    const first = collectNearbyDrops(drops, [actor]);
    expect(first).toHaveLength(8);
    expect(first.every(result => result.drop.ownerId === 'enemy')).toBe(true);
    expect(drops).toHaveLength(8);
    for (const drop of drops) drop.age = 5;
    expect(collectNearbyDrops(drops, [actor])).toHaveLength(8);
  });

  it('does not let one incompatible piece block the rest of the pile', () => {
    const actor = player(), drops = pile(5);
    const bad = { ...drops[0], x: 0, z: 0, piece: { ...drops[0].piece, size: { x: 0, y: 1, z: 1 } } };
    drops[0] = bad;
    const results = collectNearbyDrops(drops, [actor]);
    expect(results).toHaveLength(4);
    expect(drops).toEqual([bad]);
  });

  it('gives contested loot to the closer eligible character exactly once', () => {
    const farther = player(), closer = player();
    farther.x = -2; closer.x = 0; closer.id = 'enemy';
    const drops = pile(1, null);
    drops[0].x = 0; drops[0].z = 0;
    const results = collectNearbyDrops(drops, [farther, closer]);
    expect(results).toHaveLength(1);
    expect(results[0].collector).toBe(closer);
    expect(drops).toHaveLength(0);
  });

  it('retains repair priority when several pieces are picked up together', () => {
    const actor = player();
    const hit = damageStructure(actor.structure, 10, () => 0.999);
    const before = actor.structure.pieces.size;
    const drops: PickupDrop[] = hit.direct.slice(0,8).map(piece => ({ piece, ownerId: 'enemy', x: 0, z: 0, age: 6, settled: true }));
    const results = collectNearbyDrops(drops, [actor], () => 0.3);
    expect(results).toHaveLength(8);
    expect(results.some(result => result.attachment.mode === 'repair')).toBe(true);
    expect(actor.structure.pieces.size).toBe(before + 8);
  });
});
