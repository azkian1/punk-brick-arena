import { describe, expect, it, vi } from 'vitest';
import * as arena from './arena';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { CONFIG } from './config';
import { damageArenaBuilding, segmentBuildingHit, type ArenaBuilding } from './arena';
import { createStructure, getBounds } from './structure';
import { DebrisStack, debrisFloorY, debrisRenderSize } from './debris';
import { createBuildingDebris, debrisPositionClear, debrisRadius, stepDebrisPhysics, type MovingDebris } from './debris-motion';
import { projectilePartOffsets } from './projectiles';
import { canCollectDrop, type PickupState } from './pickup';
import type { Piece } from './types';
import { legacyTowerFixture } from './test-fixtures/legacy-arena';

const piece = (id: string, x = 0, y = 0, z = 0, sx = 1, sy = 1.2, sz = 1): Piece =>
  ({ id, position: { x, y, z }, size: { x: sx, y: sy, z: sz }, color: '#aabbee', shape: sy < 1 ? 'plate' : 'brick' });
function building(parts: Piece[], x = 35, z = 12): ArenaBuilding {
  const structure = createStructure({ ...CHARACTER_TEMPLATES[0], pieces: parts, coreId: parts[0].id });
  return { id: 'tower', template: 'tower', x, z, structure, bounds: getBounds(structure) };
}
const seeded = (initial = 1) => { let state = initial; return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296); };
function body(part: Piece, x = 0, y = 4, z = 0): MovingDebris {
  return { piece: part, x, y, z, vx: 0, vy: 0, vz: 0, rotation: 0, settled: false };
}
function settle(drops: MovingDebris[], buildings: ArenaBuilding[], frames = 600) {
  for (let frame = 0; frame < frames; frame++) stepDebrisPhysics(drops, buildings, 1 / 60);
}

describe('physical construction debris', () => {
  it('caches a failed bounded escape, but retries when cover identity or geometry changes', () => {
    const blocker = building([piece('blocked', -160, 0, -160, 320, 1.2, 320)], 0, 0);
    const loose = body(piece('retained'), 30, 10, 20), ground = [loose];
    const probe = vi.spyOn(arena, 'segmentBuildingHit');
    try {
      stepDebrisPhysics(ground, [blocker], 1 / 60);
      const first = probe.mock.calls.length; expect(first).toBeGreaterThan(100);
      probe.mockClear(); stepDebrisPhysics(ground, [blocker], 1 / 60);
      expect(probe.mock.calls.length).toBeLessThan(5);
      expect(loose.settled).toBe(false); expect(ground[0]).toBe(loose);
      // An externally replaced construction may reuse its id and revision.
      const replacement = building([piece('far-cover')], -60, -60);
      stepDebrisPhysics(ground, [replacement], 1 / 60);
      expect(loose.y).toBeLessThan(10); expect(loose.piece.id).toBe('retained');
      settle(ground, [replacement]); expect(loose.settled).toBe(true);
    } finally { probe.mockRestore(); }
  });
  it.each([0, 900])('settles the saved native seed-29 tower with %i spent parts without a tall column', spentCount => {
    const { tower, spent: nativeSpent } = legacyTowerFixture();
    tower.x = tower.z = 0;
    const inventory = [...tower.structure.pieces.values()], original = JSON.stringify(inventory);
    expect(inventory).toHaveLength(1919);
    const random = seeded(4), drops: (MovingDebris & PickupState)[] = [];
    while (tower.structure.pieces.size) {
      const result = damageArenaBuilding(tower, 20, random, { x: -2, z: 0, y: 3.2 });
      expect(result.direct.length + result.cascade.length).toBeGreaterThan(0);
      drops.push(...createBuildingDebris(tower, [...result.direct, ...result.cascade], [tower], random));
    }
    const sourceHeight = Math.max(...drops.map(drop => drop.spawnOrigin!.y));
    // Use existing real native plates, packed exactly as forty-five 20-part
    // volleys. They make the audit's crowded impact point without minting parts.
    const spent = nativeSpent.slice(0, spentCount);
    expect(spent).toHaveLength(spentCount);
    const spentOriginal = JSON.stringify(spent), spentDrops: (MovingDebris & PickupState)[] = [];
    for (let start = 0; start < spent.length; start += 20) {
      const parts = spent.slice(start, start + 20), offsets = projectilePartOffsets(parts);
      for (let i = 0; i < parts.length; i++) spentDrops.push({
        ...body(parts[i], -2 + offsets[i].x, 3.2 + offsets[i].y, offsets[i].z),
        rotation: random() * Math.PI, age: 0, ownerId: 'player', lockedUntilAge: 5,
      });
    }
    drops.push(...spentDrops);
    let maximumHeight = sourceHeight, maximumDescentRise = 0;
    for (let frame = 0; frame < 300; frame++) {
      const previousY = drops.map(drop => drop.y), previousVY = drops.map(drop => drop.vy);
      stepDebrisPhysics(drops, [tower], 1 / 60);
      maximumHeight = Math.max(maximumHeight, ...drops.map(drop => drop.y));
      for (let i = 0; i < drops.length; i++) if (previousVY[i] <= 0) {
        maximumDescentRise = Math.max(maximumDescentRise, drops[i].y - previousY[i]);
      }
    }
    expect(drops).toHaveLength(inventory.length + spent.length);
    expect(new Set(drops.map(drop => drop.piece.id)).size).toBe(inventory.length + spent.length);
    const references = new Set([...inventory, ...spent]);
    expect(drops.every(drop => references.has(drop.piece))).toBe(true);
    expect(JSON.stringify(inventory)).toBe(original);
    expect(JSON.stringify(spent)).toBe(spentOriginal);
    expect(drops.every(drop => [drop.x, drop.y, drop.z, drop.vx, drop.vy, drop.vz].every(Number.isFinite))).toBe(true);
    expect(drops.every(drop => drop.settled)).toBe(true);
    expect(maximumDescentRise).toBeLessThanOrEqual(1e-5);
    expect(maximumHeight).toBeLessThanOrEqual(sourceHeight + 2);
    expect(Math.max(...drops.map(drop => Math.hypot(drop.x, drop.z)))).toBeLessThan(20);
    const meanX = drops.reduce((sum, drop) => sum + drop.x, 0) / drops.length;
    const meanZ = drops.reduce((sum, drop) => sum + drop.z, 0) / drops.length;
    const varianceX = drops.reduce((sum, drop) => sum + (drop.x - meanX) ** 2, 0) / drops.length;
    const varianceZ = drops.reduce((sum, drop) => sum + (drop.z - meanZ) ** 2, 0) / drops.length;
    const covariance = drops.reduce((sum, drop) => sum + (drop.x - meanX) * (drop.z - meanZ), 0) / drops.length;
    expect((varianceX + varianceZ - Math.hypot(varianceX - varianceZ, 2 * covariance)) / 2).toBeGreaterThan(.35);
    for (const drop of spentDrops) {
      expect(drop.age).toBe(0); expect(drop.lockedUntilAge).toBe(5);
      drop.age = 5 - 1e-6; expect(canCollectDrop(drop, 'bot-1')).toBe(false);
      drop.age = 5; expect(canCollectDrop(drop, 'bot-1')).toBe(true);
    }
  });

  it('conserves every direct/cascade part and spreads a real unsupported tower collapse around its world origin', () => {
    const tower = building([
      piece('foundation'), piece('platform', -3, 1.2, -3, 7, 1.2, 7),
      ...Array.from({ length: 54 }, (_, i) => piece(`tower/${i}`, i % 3 - 1, 2.4 + Math.floor(i / 9) * 1.2, Math.floor(i / 3) % 3 - 1)),
    ]);
    const inventory = [...tower.structure.pieces.values()], before = JSON.stringify(inventory);
    const result = damageArenaBuilding(tower, 1, () => 0, { x: tower.x + .25, z: tower.z + .25, y: .3 });
    expect(result.direct.map(part => part.id)).toEqual(['foundation']);
    expect(result.cascade).toHaveLength(55);
    const drops = createBuildingDebris(tower, [...result.direct, ...result.cascade], [tower], seeded(4));
    expect(drops).toHaveLength(inventory.length);
    expect(new Set(drops.map(drop => drop.piece.id)).size).toBe(inventory.length);
    expect(drops.every(drop => inventory.includes(drop.piece))).toBe(true);
    expect(JSON.stringify(inventory)).toBe(before);
    for (const drop of drops) {
      expect(drop.spawnOrigin!.x).toBeCloseTo(tower.x + (drop.piece.position.x + drop.piece.size.x / 2) * CONFIG.characterScale);
      expect(drop.spawnOrigin!.z).toBeCloseTo(tower.z + (drop.piece.position.z + drop.piece.size.z / 2) * CONFIG.characterScale);
      expect(drop.x).toBe(drop.spawnOrigin!.x); expect(drop.z).toBe(drop.spawnOrigin!.z);
      expect(Math.hypot(drop.vx, drop.vz)).toBeGreaterThan(0);
      expect(Math.hypot(drop.vx, drop.vz)).toBeLessThanOrEqual(9);
    }
    settle(drops, [tower]);
    expect(drops.every(drop => drop.settled)).toBe(true);
    expect(Math.max(...drops.map(drop => drop.x)) - Math.min(...drops.map(drop => drop.x))).toBeGreaterThan(3);
    expect(Math.max(...drops.map(drop => drop.z)) - Math.min(...drops.map(drop => drop.z))).toBeGreaterThan(3);
    expect(new Set(drops.map(drop => `${drop.x.toFixed(2)}/${drop.z.toFixed(2)}`)).size).toBeGreaterThan(45);
    // Side contacts add a short physical displacement to the original impulse.
    expect(Math.max(...drops.map(drop => Math.hypot(drop.x - drop.spawnOrigin!.x, drop.z - drop.spawnOrigin!.z)))).toBeLessThan(4);
    expect(drops.every(drop => drop.x > 30 && drop.z > 7)).toBe(true);
  });

  it('gives higher fragments a wider bounded outward impulse without changing their size or color', () => {
    const tower = building([piece('source')]); tower.structure.pieces.clear(); tower.structure.revision++;
    const low = piece('low', 2, 0), high = piece('high', 2, 24);
    const [lowDrop, highDrop] = createBuildingDebris(tower, [low, high], [tower], () => .5);
    expect(Math.hypot(highDrop.vx, highDrop.vz)).toBeGreaterThan(Math.hypot(lowDrop.vx, lowDrop.vz) + 3);
    expect(highDrop.vx).toBeGreaterThan(0);
    expect(highDrop.piece).toBe(high); expect(lowDrop.piece).toBe(low);
    expect(highDrop.vy).toBeLessThanOrEqual(6);
  });

  it('ejects parts only a short distance outside the remaining tower and never across another wall', () => {
    const tower = building([piece('floor', -4, 0, -4, 8, 1.2, 8)]);
    const wall = building([piece('neighbor', -1, 0, -8, 2, 1.2, 16)], 38, 12);
    const parts = Array.from({ length: 24 }, (_, i) => piece(`loose/${i}`, i % 3 - 1, 4 + i * .4, Math.floor(i / 3) % 3 - 1));
    const drops = createBuildingDebris(tower, parts, [tower, wall], seeded(9));
    for (const drop of drops) {
      expect(debrisPositionClear(drop.x, drop.z, debrisRadius(drop.piece), [tower, wall])).toBe(true);
      expect(Math.hypot(drop.x - drop.spawnOrigin!.x, drop.z - drop.spawnOrigin!.z)).toBeLessThan(4);
      expect(segmentBuildingHit(drop.spawnOrigin!.x, drop.spawnOrigin!.z, drop.x, drop.z, wall, debrisRadius(drop.piece))).toBeNull();
    }
    for (let frame = 0; frame < 600; frame++) {
      stepDebrisPhysics(drops, [tower, wall], 1 / 60);
      expect(drops.every(drop => debrisPositionClear(drop.x, drop.z, debrisRadius(drop.piece), [tower, wall]))).toBe(true);
    }
    expect(drops.every(drop => drop.settled)).toBe(true);
  });

  it('stops fast airborne debris continuously at cover instead of placing it behind the wall', () => {
    const wall = building([piece('wall', -1, 0, -10, 2, 1.2, 20)], 0, 0);
    const drop = body(piece('flying'), -5); drop.vx = 100;
    stepDebrisPhysics([drop], [wall], .2);
    expect(drop.x).toBeLessThan(-.5 - debrisRadius(drop.piece));
    expect(drop.vx).toBeLessThanOrEqual(0);
    expect(debrisPositionClear(drop.x, drop.z, debrisRadius(drop.piece), [wall])).toBe(true);
  });

  it('pushes a low descending part beside a pile without lifting it or crossing a neighboring wall', () => {
    const support = body(piece('support', 0, 0, 0, 3, 1.2, 3), 0, debrisFloorY(piece('support')));
    support.settled = true;
    const loose = body(piece('loose'), -.3, .4);
    const wall = building([piece('wall', -.5, 0, -5, 1, 1.2, 10)], -1.35, 0);
    let maximumY = loose.y;
    for (let frame = 0; frame < 300; frame++) {
      const from = { x: loose.x, z: loose.z };
      stepDebrisPhysics([support, loose], [wall], 1 / 60);
      maximumY = Math.max(maximumY, loose.y);
      expect(debrisPositionClear(loose.x, loose.z, debrisRadius(loose.piece), [wall])).toBe(true);
      expect(segmentBuildingHit(from.x, from.z, loose.x, loose.z, wall, debrisRadius(loose.piece))).toBeNull();
    }
    expect(loose.settled).toBe(true);
    expect(maximumY).toBeLessThanOrEqual(.4);
    expect(loose.y).toBeCloseTo(debrisFloorY(loose.piece));
    expect(Math.hypot(loose.x, loose.z)).toBeGreaterThan(.985);
    expect(Math.hypot(loose.x + .3, loose.z)).toBeLessThan(2);
  });

  it('slides the real seed-71 long plate along its narrow cover corridor and settles without lifting', () => {
    const southZ = 17.313304456323387, northZ = 20.55043489485979;
    const wallParts = (id: string) => Array.from({ length: 5 }, (_, i) => piece(id + '/' + i, i * 8, 0, 0, 8, 1.2, 2));
    const walls = [building(wallParts('south'), 60, southZ), building(wallParts('north'), 60, northZ)];
    const support = body(piece('arena-round-7/building-1/piece-205', 0, 0, 0, 4, .4, 1),
      72.61885802289552, .1325, 19.34600127080224);
    support.rotation = .1512581746124638; support.settled = true;
    const upper = body(piece('arena-round-7/building-1/piece-225', 0, 0, 0, 4, 1.2, 1),
      72.11992576110468, .5295, 19.36165219555885);
    upper.rotation = .13129633091014076; upper.settled = true;
    const part = piece('arena-round-7/building-1/piece-228', 0, 0, 0, 4, .4, 2);
    const loose = body(part, 73.61174043563602, .16391642365195472, 19.435365813764538);
    loose.rotation = .27293952153755147;
    const original = JSON.stringify(part), start = { x: loose.x, y: loose.y, z: loose.z };
    for (let frame = 0; frame < 60; frame++) {
      const previous = { x: loose.x, y: loose.y, z: loose.z };
      stepDebrisPhysics([support, upper, loose], walls, 1 / 60);
      expect(loose.y).toBeLessThanOrEqual(previous.y + 1e-6);
      expect(debrisPositionClear(loose.x, loose.z, debrisRadius(part), walls)).toBe(true);
      for (const wall of walls) expect(segmentBuildingHit(previous.x, previous.z, loose.x, loose.z, wall, debrisRadius(part))).toBeNull();
    }
    expect(loose.settled).toBe(true);
    expect(loose.piece).toBe(part); expect(JSON.stringify(part)).toBe(original);
    expect(loose.y).toBeCloseTo(debrisFloorY(part));
    expect(Math.hypot(loose.x - start.x, loose.z - start.z)).toBeLessThan(3);
    expect(loose.z).toBe(start.z);
    const stack = new DebrisStack(); stack.add(support); stack.add(upper);
    expect(stack.landingY(loose)).toBe(debrisFloorY(part));
  });

  it('retains a blocked real part without a center teleport and retries after cover opens', () => {
    const blocker = building([piece('blocked', -160, 0, -160, 320, 1.2, 320)], 0, 0);
    const loose = piece('retained', 60, 10, 20);
    const [drop] = createBuildingDebris(blocker, [loose], [blocker], () => .5);
    const start = { x: drop.x, z: drop.z };
    stepDebrisPhysics([drop], [blocker], 1);
    expect(drop.piece).toBe(loose); expect(drop.settled).toBe(false);
    expect(drop.x).toBe(start.x); expect(drop.z).toBe(start.z);
    expect(Math.hypot(drop.x, drop.z)).toBeGreaterThan(30);
    blocker.structure.pieces.clear(); blocker.structure.revision++;
    settle([drop], [blocker]);
    expect(drop.settled).toBe(true); expect(drop.piece).toBe(loose);
  });

  it('handles invalid random samples and near-corner scatter with finite radius-safe coordinates', () => {
    const tower = building([piece('removed')], 79.2, 79.2); tower.structure.pieces.clear(); tower.structure.revision++;
    const drops = createBuildingDebris(tower, [piece('corner', 0, 18)], [tower], () => NaN);
    settle(drops, [tower]);
    const drop = drops[0], radius = debrisRadius(drop.piece);
    expect(drop.settled).toBe(true);
    expect([drop.x, drop.y, drop.z, drop.vx, drop.vy, drop.vz, drop.rotation].every(Number.isFinite)).toBe(true);
    expect(Math.abs(drop.x) + radius).toBeLessThanOrEqual(CONFIG.arenaWidth / 2);
    expect(Math.abs(drop.z) + radius).toBeLessThanOrEqual(CONFIG.arenaDepth / 2);
  });

  it('keeps the existing stack support and freezes all physics for zero elapsed time', () => {
    const drops = [body(piece('bottom'), 0, 2), body(piece('top'), 0, 5)];
    const saved = JSON.stringify(drops);
    stepDebrisPhysics(drops, [], 0); expect(JSON.stringify(drops)).toBe(saved);
    settle(drops, []);
    expect(drops.every(drop => drop.settled)).toBe(true);
    expect(drops[0].y).toBeCloseTo(debrisFloorY(drops[0].piece));
    expect(drops[1].y).toBeCloseTo(drops[0].y + debrisRenderSize(drops[0].piece).y + .012);
  });
});
