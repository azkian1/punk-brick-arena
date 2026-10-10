import { describe, expect, it } from 'vitest';
import { GroundIndex, groundIndex, type RankedDrop } from './ground-index';
import { canCollectDrop, type PickupDrop } from './pickup';

const key = (drop: PickupDrop) => `${drop.piece.size.x}:${drop.piece.size.y}:${drop.piece.size.z}`;
const make = (id: number, x: number, z: number, useful = true): PickupDrop => ({ x, z, age: 8, ownerId: null, settled: true,
  piece: { id: `part/${id}`, position: { x: 0, y: 0, z: 0 }, size: { x: useful ? 2 : 1, y: .4, z: 1 }, color: '#88a078', shape: 'plate' } });

describe('shared exact ground queries', () => {
  it('matches full useful-first ranking across risk, ownership locks, bonuses, negative cells and equal scores', () => {
    let seed = 0x17afe;
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223; return (seed >>> 0) / 4294967296; };
    const useful = new Set(['2:0.4:1']);
    for (let trial = 0; trial < 80; trial++) {
      const parts = Array.from({ length: 320 }, (_, i) => {
        const part = make(i, Math.floor(random() * 154) - 77, Math.floor(random() * 154) - 77, random() < .2);
        part.age = random() * 8; part.settled = random() > .15; part.ownerId = random() < .3 ? 'self' : null;
        part.lockedUntilAge = random() < .2 ? 5 : 0; return part;
      });
      const x = Math.floor(random() * 140) - 70, z = Math.floor(random() * 140) - 70;
      const locked = parts[Math.floor(random() * parts.length)], bank = trial % 2 === 0;
      const rank = (drop: PickupDrop): RankedDrop<PickupDrop> | undefined => {
        const compatible = useful.has(key(drop));
        if (!canCollectDrop(drop, 'self') || !compatible && !bank) return undefined;
        const risk = Math.max(0, 24 - Math.hypot(drop.x - 25, drop.z + 15)) * 4;
        return { drop, compatible, score: (Math.hypot(drop.x - x, drop.z - z) / (compatible ? 2.2 : .6) + risk) * (drop === locked ? .65 : 1) };
      };
      const expected = parts.map(rank).filter((part): part is RankedDrop<PickupDrop> => !!part)
        .sort((a, b) => Number(b.compatible) - Number(a.compatible) || a.score - b.score).slice(0, 12);
      const index = new GroundIndex().sync(parts);
      expect(index.ranked(x, z, useful, bank, rank, .65 / 2.2)).toEqual(expected);
      expect([...index.within(x, z, 13)].sort((a, b) => index.order(a) - index.order(b)))
        .toEqual(parts.filter(part => part.settled && (part.x - x) ** 2 + (part.z - z) ** 2 <= 13 ** 2));
    }
  });

  it('examines local parts in a 12,000-part floor, while retaining a rare useful part across the arena', () => {
    const parts = Array.from({ length: 12000 }, (_, i) => make(i, i % 120 * 1.25 - 75, Math.floor(i / 120) * 1.5 - 75));
    const index = new GroundIndex().sync(parts), useful = new Set(['2:0.4:1']);
    const rank = (drop: PickupDrop) => ({ drop, compatible: true, score: Math.hypot(drop.x, drop.z) / 2.2 });
    expect(index.ranked(0, 0, useful, false, rank, .65 / 2.2)).toHaveLength(12);
    expect(index.examined).toBeLessThan(1200);
    expect([...index.within(0, 0, 4)].length).toBeGreaterThan(0);
    expect(index.examined).toBeLessThan(200);
    const raw = Array.from({ length: 1500 }, (_, i) => make(i, i % 70 - 35, Math.floor(i / 70) - 10, false));
    const rare = make(1501, 72, 72);
    index.sync([...raw, rare]);
    const ranked = index.ranked(0, 0, useful, true, drop => ({ drop, compatible: useful.has(key(drop)), score: Math.hypot(drop.x, drop.z) }), .65 / 2.2);
    expect(ranked[0].drop).toBe(rare);
  });

  it('reconciles same-length replacements, movement, airborne changes, reorder and resets without phantom loot', () => {
    const a = make(0, 1, 1), b = make(1, 65, 65), parts = [a, b], index = groundIndex(parts);
    expect([...index.within(0, 0, 4)]).toEqual([a]);
    const c = make(2, 0, 0); parts[0] = c; b.x = 2; b.z = 2;
    expect(groundIndex(parts)).toBe(index); expect(index.has(a)).toBe(false);
    expect([...index.within(0, 0, 4)]).toEqual([c, b]);
    c.settled = false; parts.reverse(); groundIndex(parts);
    expect([...index.within(0, 0, 4)]).toEqual([b]); expect(index.order(b)).toBe(0);
    parts.length = 0; groundIndex(parts);
    expect(index.has(b)).toBe(false); expect([...index.within(0, 0, 100)]).toEqual([]);
    expect(groundIndex([a])).not.toBe(index);
  });
});
