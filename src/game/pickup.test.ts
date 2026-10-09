import { describe, expect, it } from 'vitest';
import { canCollectDrop } from './pickup';

describe('fallen-piece ownership cooldown', () => {
  it.each(['player', 'enemy'])('blocks %s from reclaiming its own pieces until exactly five seconds', ownerId => {
    const drop = { ownerId, settled: true, age: 4.999 };
    expect(canCollectDrop(drop, ownerId)).toBe(false);
    expect(canCollectDrop({ ...drop, age: 5 }, ownerId)).toBe(true);
  });

  it('lets an opponent steal a settled piece before its owner can reclaim it', () => {
    const drop = { ownerId: 'player', settled: true, age: 0.8 };
    expect(canCollectDrop(drop, 'enemy')).toBe(true);
    expect(canCollectDrop(drop, 'player')).toBe(false);
    expect(canCollectDrop({ ...drop, age: 0.799 }, 'enemy')).toBe(false);
  });

  it('keeps airborne pieces unavailable even after the cooldown', () => {
    const drop = { ownerId: 'player', settled: false, age: 7 };
    expect(canCollectDrop(drop, 'player')).toBe(false);
    expect(canCollectDrop(drop, 'enemy')).toBe(false);
  });

  it('does not apply the ownership delay to neutral starting pieces', () => {
    const drop = { ownerId: null, settled: true, age: 2 };
    expect(canCollectDrop(drop, 'player')).toBe(true);
    expect(canCollectDrop(drop, 'enemy')).toBe(true);
  });

  it('uses the latest owner when a stolen piece is knocked off again', () => {
    const drop = { ownerId: 'enemy', settled: true, age: 1 };
    expect(canCollectDrop(drop, 'player')).toBe(true);
    expect(canCollectDrop(drop, 'enemy')).toBe(false);
  });

  it('honors an explicit firing-age lock for everyone and preserves ordinary debris rules', () => {
    const fired = { ownerId: 'player', settled: true, age: 4.999, lockedUntilAge: 5 };
    expect(canCollectDrop(fired, 'enemy')).toBe(false);
    expect(canCollectDrop(fired, 'player')).toBe(false);
    expect(canCollectDrop({ ...fired, age: 5 }, 'enemy')).toBe(true);
    expect(canCollectDrop({ ...fired, age: 5 }, 'player')).toBe(true);
    expect(canCollectDrop({ ...fired, age: 8, settled: false }, 'enemy')).toBe(false);
    expect(canCollectDrop({ ownerId: 'player', settled: true, age: 0.8 }, 'enemy')).toBe(true);
  });
});
