import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { ARENA_PART_TYPES, ARENA_ROUTE_HALF_WIDTH, MAX_ARENA_BUILDING_PIECES, damageArenaBuilding, generateArenaBuildings, resolveArenaBuildings, segmentBuildingHit, type ArenaBuilding } from './arena';
import { connectedToCore, contactGraph, getBounds, intersects, validGeometry } from './structure';
import templates from '../assets/templates.generated.json';
import evolutions from '../assets/evolutions.generated.json';
import { clampToArena } from './movement';
import type { MovingBody } from './movement';
import type { Piece, Random, Structure } from './types';

function seeded(seed: number): Random {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function brick(id: string, x: number, y = 0, z = 0, sx = 2, sy = 1.2, sz = 2): Piece {
  return { id, position: { x, y, z }, size: { x: sx, y: sy, z: sz }, color: '#d4a700', shape: sy < 1 ? 'plate' : 'brick' };
}
function building(pieces: Piece[], x = 0, z = 0): ArenaBuilding {
  const structure: Structure = { pieces: new Map(pieces.map(piece => [piece.id, piece])), coreId: pieces[0].id,
    vacancies: [], revision: 0, roundStartPieces: pieces.length, coreExposed: true };
  return { id: 'test-building', template: 'wall', x, z, structure, bounds: getBounds(structure) };
}
function body(x: number, z: number, radius = 0.25): MovingBody { return { x, z, radius, vx: 100, vz: 0 }; }
function floorConnected(structure: Structure): Set<string> {
  const pieces = [...structure.pieces.values()], graph = contactGraph(pieces);
  const queue = pieces.flatMap((piece, i) => Math.abs(piece.position.y) < 1e-6 ? [i] : []), reached = new Set(queue);
  for (let i = 0; i < queue.length; i++) for (const neighbor of graph[queue[i]]) {
    if (!reached.has(neighbor)) { reached.add(neighbor); queue.push(neighbor); }
  }
  return new Set([...reached].map(i => pieces[i].id));
}
const snapshot = (buildings: ArenaBuilding[]) => buildings.map(b => ({ x: b.x, z: b.z, id: b.id,
  template: b.template, bounds: b.bounds, pieces: [...b.structure.pieces.values()] }));
const signature = (piece: Pick<Piece, 'size' | 'shape'>) => [piece.size.x, piece.size.y, piece.size.z, piece.shape].join(':');

describe('procedural destructible arena', () => {
  it('reproduces a seed while different seeds change layout and brick shapes', () => {
    const a = generateArenaBuildings(seeded(48), 3);
    expect(snapshot(a)).toEqual(snapshot(generateArenaBuildings(seeded(48), 3)));
    expect(snapshot(a)).not.toEqual(snapshot(generateArenaBuildings(seeded(49), 3)));
    expect(a.length).toBe(20);
    expect(new Set(a.map(b => b.template)).size).toBe(5);
    const heights = a.map(b => b.bounds.max.y * CONFIG.characterScale);
    expect(Math.max(...heights)).toBeGreaterThan(8);
    expect(Math.min(...heights)).toBeLessThan(4);
  });
  it('uses globally distinct round/building IDs and ordinary collectible piece sizes', () => {
    const a = generateArenaBuildings(seeded(4), 1), b = generateArenaBuildings(seeded(4), 2);
    const all = [...a, ...b].flatMap(b => [...b.structure.pieces.values()]);
    expect(new Set(all.map(p => p.id)).size).toBe(all.length);
    expect(new Set([...a, ...b].map(b => b.id)).size).toBe(a.length + b.length);
    const catalogue = new Set(ARENA_PART_TYPES.map(signature));
    for (const piece of all) { expect(validGeometry(piece)).toBe(true); expect(catalogue.has(signature(piece))).toBe(true); }
    expect(new Set(all.map(signature))).toEqual(catalogue);
  });
  it('derives the exact oriented size and shape catalogue from real character and evolution parts', () => {
    const actual = new Set(templates.flatMap(template => template.pieces).map(piece => signature(piece as Piece)));
    for (const evolution of evolutions) for (const slot of evolution.slots) {
      actual.add(signature({ size: { x: slot[3], y: slot[4], z: slot[5] }, shape: slot[4] < 1 ? 'plate' : 'brick' }));
    }
    expect(new Set(ARENA_PART_TYPES.map(signature))).toEqual(actual);
    expect(actual.size).toBe(57);
    expect(new Set(ARENA_PART_TYPES.map(type => [type.size.x, type.size.y, type.size.z].join(':'))).size).toBe(39);
    expect(actual.has('2:1.2:8:brick')).toBe(false);
  });
  it('covers the whole catalogue in each map with varied quantities and visibly large beams and plates', () => {
    for (const seed of [1, 48, 927]) {
      const buildings = generateArenaBuildings(seeded(seed)), pieces = buildings.flatMap(b => [...b.structure.pieces.values()]);
      expect(new Set(pieces.map(signature))).toEqual(new Set(ARENA_PART_TYPES.map(signature)));
      expect(new Set(pieces.map(piece => piece.shape))).toEqual(new Set(['brick', 'plate', 'tile']));
      expect(new Set(buildings.map(b => b.structure.pieces.size)).size).toBeGreaterThan(5);
      for (const b of buildings) expect(b.structure.pieces.size).toBeLessThanOrEqual(MAX_ARENA_BUILDING_PIECES);
      expect(pieces.some(piece => piece.size.x === 8 && piece.size.y === 1.2 && piece.size.z === 2)).toBe(true);
      expect(pieces.some(piece => piece.size.x === 2 && piece.size.y === 0.4 && piece.size.z === 8)).toBe(true);
    }
  });
  it('keeps catalogue coverage and the piece limit with RNG values at or outside their endpoints', () => {
    for (const value of [0, 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const buildings = generateArenaBuildings(() => value);
      expect(buildings.length).toBe(20);
      expect(new Set(buildings.map(b => b.template)).size).toBe(5);
      expect(new Set(buildings.flatMap(b => [...b.structure.pieces.values()].map(signature))))
        .toEqual(new Set(ARENA_PART_TYPES.map(signature)));
      expect(buildings.every(b => b.structure.pieces.size <= MAX_ARENA_BUILDING_PIECES)).toBe(true);
    }
  });
  it('generates connected floor-supported construction for every template', () => {
    for (const b of generateArenaBuildings(seeded(22))) {
      expect(connectedToCore(b.structure).size, b.template).toBe(b.structure.pieces.size);
      expect(floorConnected(b.structure).size, b.template).toBe(b.structure.pieces.size);
      expect(b.bounds.min.y).toBe(0);
      const pieces = [...b.structure.pieces.values()];
      for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
        expect(intersects(pieces[i], pieces[j]), b.template + ' ' + pieces[i].id + ' / ' + pieces[j].id).toBe(false);
      }
    }
  });
  it('keeps all four full-form spawn-to-center routes and the arena boundary clear across seeds', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const buildings = generateArenaBuildings(seeded(seed));
      expect(buildings.length).toBe(20);
      expect(new Set(buildings.map(b => b.template)).size).toBe(5);
      for (const b of buildings) {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          expect(segmentBuildingHit(0, 0, sx * CONFIG.arenaWidth * 0.36, sz * CONFIG.arenaDepth * 0.36,
            b, ARENA_ROUTE_HALF_WIDTH)).toBeNull();
        }
        expect(b.x + b.bounds.min.x * CONFIG.characterScale).toBeGreaterThan(-CONFIG.arenaWidth / 2);
        expect(b.x + b.bounds.max.x * CONFIG.characterScale).toBeLessThan(CONFIG.arenaWidth / 2);
        expect(b.z + b.bounds.min.z * CONFIG.characterScale).toBeGreaterThan(-CONFIG.arenaDepth / 2);
        expect(b.z + b.bounds.max.z * CONFIG.characterScale).toBeLessThan(CONFIG.arenaDepth / 2);
      }
      for (let i = 0; i < buildings.length; i++) for (let j = i + 1; j < buildings.length; j++) {
        const a = buildings[i], b = buildings[j], scale = CONFIG.characterScale;
        expect(a.x + a.bounds.max.x * scale + 2.2 <= b.x + b.bounds.min.x * scale ||
          b.x + b.bounds.max.x * scale + 2.2 <= a.x + a.bounds.min.x * scale ||
          a.z + a.bounds.max.z * scale + 2.2 <= b.z + b.bounds.min.z * scale ||
          b.z + b.bounds.max.z * scale + 2.2 <= a.z + a.bounds.min.z * scale).toBe(true);
      }
    }
  });
  it('drops unsupported levels while grounded sections survive loss of the reference core', () => {
    const b = building([brick('left-floor', 0), brick('left-top', 0, 1.2), brick('right-floor', 6), brick('right-top', 6, 1.2)]);
    const result = damageArenaBuilding(b, 1, seeded(1), { x: 0.5, z: 0.5, y: 0.3 });
    expect(result.direct.map(p => p.id)).toEqual(['left-floor']);
    expect(result.cascade.map(p => p.id)).toEqual(['left-top']);
    expect(result.eliminated).toBe(false);
    expect(b.structure.pieces.has(b.structure.coreId)).toBe(false);
    expect([...b.structure.pieces.keys()]).toEqual(['right-floor', 'right-top']);
    expect(b.bounds.min.x).toBe(6);
    expect(b.structure.revision).toBe(1);
  });
  it('retains an overhang supported through a surviving neighbouring floor column', () => {
    const b = building([brick('left', 0), brick('right', 4), brick('beam', 0, 1.2, 0, 6)]);
    const result = damageArenaBuilding(b, 1, seeded(1), { x: 0.5, z: 0.5, y: 0.1 });
    expect(result.direct.map(p => p.id)).toEqual(['left']);
    expect(result.cascade).toEqual([]);
    expect(floorConnected(b.structure).size).toBe(2);
  });
  it('conserves all original bricks through repeated local damage and cascades', () => {
    for (const b of generateArenaBuildings(seeded(71)).slice(0, 5)) {
      const original = new Map(b.structure.pieces), removed = new Map<string, Piece>();
      for (let hit = 0; hit < 12; hit++) {
        const result = damageArenaBuilding(b, 10, seeded(hit + 1));
        expect(result.direct.length).toBe(Math.min(10, original.size - removed.size));
        for (const piece of [...result.direct, ...result.cascade]) {
          expect(removed.has(piece.id)).toBe(false);
          expect(piece).toBe(original.get(piece.id));
          removed.set(piece.id, piece);
        }
        expect(b.structure.pieces.size + removed.size).toBe(original.size);
      }
      expect(floorConnected(b.structure).size).toBe(b.structure.pieces.size);
    }
  });
  it('uses world impact coordinates and invalid damage is inert', () => {
    const b = building([brick('near', 0), brick('far', 10)], 20, -30);
    const bounds = b.bounds;
    for (const power of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) expect(damageArenaBuilding(b, power).direct).toEqual([]);
    expect(b.structure.revision).toBe(0); expect(b.bounds).toBe(bounds);
    expect(damageArenaBuilding(b, 1, seeded(1), { x: 25.5, z: -29.5, y: 0 }).direct[0].id).toBe('far');
  });
  it('fully clears a demolished building and updates its bounds', () => {
    const b = building([brick('bottom', 0), brick('top', 0, 1.2)]);
    const result = damageArenaBuilding(b, 100);
    expect(result.eliminated).toBe(true); expect(result.direct.length).toBe(2);
    expect(b.bounds).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } });
    expect(segmentBuildingHit(-5, 0.5, 5, 0.5, b)).toBeNull();
  });
});

describe('shots against remaining arena cover', () => {
  it('catches fast shots at their first box contact and accounts for world placement', () => {
    const b = building([brick('wall', 0)], 10, 20);
    expect(segmentBuildingHit(0, 20.5, 30, 20.5, b)).toBeCloseTo(1 / 3);
    expect(segmentBuildingHit(0, 22, 30, 22, b)).toBeNull();
    expect(segmentBuildingHit(0, 20.5, 5, 20.5, b)).toBeNull();
    expect(segmentBuildingHit(10.5, 20.5, 10.5, 20.5, b)).toBe(0);
  });
  it('preserves holes inside the broad bounds, including after partial demolition', () => {
    const b = building([brick('left', -6), brick('middle', 0), brick('right', 6)]);
    expect(segmentBuildingHit(0.5, -5, 0.5, 5, b)).not.toBeNull();
    damageArenaBuilding(b, 1, seeded(2), { x: 0.5, z: 0.5, y: 0.1 });
    expect(segmentBuildingHit(0.5, -5, 0.5, 5, b)).toBeNull();
    expect(segmentBuildingHit(-2.5, -5, -2.5, 5, b)).not.toBeNull();
  });
  it('uses a projectile circle rather than a square at cover corners', () => {
    const b = building([brick('wall', 0)]);
    expect(segmentBuildingHit(-0.8, -0.8, -0.8, -0.8, b, 1)).toBeNull();
    expect(segmentBuildingHit(-0.6, -0.6, -0.6, -0.6, b, 1)).toBe(0);
    expect(segmentBuildingHit(-5, 1.5, 5, 1.5, b, 0.6)).not.toBeNull();
    expect(segmentBuildingHit(-5, 1.7, 5, 1.7, b, 0.6)).toBeNull();
  });
});

describe('arena movement and dash collision', () => {
  it('stops a dash crossing a thin wall between frames', () => {
    const b = building([brick('wall', 0, 0, -20, 2, 1.2, 40)]), actor = body(30, 0, 1);
    resolveArenaBuildings(actor, [b], { x: -30, z: 0 });
    expect(actor.x).toBeCloseTo(-1, 5); expect(actor.z).toBeCloseTo(0);
    expect(actor.vx).toBeCloseTo(0);
  });
  it('slides along a wall, retaining the parallel velocity', () => {
    const b = building([brick('wall', 0, 0, -20, 2, 1.2, 40)]), actor = body(5, 4, 1);
    actor.vz = 8;
    resolveArenaBuildings(actor, [b], { x: -5, z: 0 });
    expect(actor.x).toBeCloseTo(-1, 5); expect(actor.z).toBeCloseTo(4, 5);
    expect(actor.vx).toBeCloseTo(0); expect(actor.vz).toBe(8);
  });
  it('lets a touching actor move away from cover', () => {
    const b = building([brick('wall', 0)]), actor = body(-5, 0.5, 1);
    actor.vx = -10;
    resolveArenaBuildings(actor, [b], { x: -1, z: 0.5 });
    expect(actor.x).toBe(-5); expect(actor.vx).toBe(-10);
  });
  it('resolves overlap after growth and treats rounded corners accurately', () => {
    const b = building([brick('wall', 0)]), actor = body(-0.2, 0.5, 1);
    resolveArenaBuildings(actor, [b]);
    expect(actor.x).toBeCloseTo(-1, 5);
    const corner = body(-0.8, -0.8, 1);
    resolveArenaBuildings(corner, [b]);
    expect(corner.x).toBe(-0.8); expect(corner.z).toBe(-0.8);
  });
  it('allows movement through a freshly demolished opening while adjacent cover blocks', () => {
    const b = building([brick('left', -6), brick('opening', 0), brick('right', 6)]);
    damageArenaBuilding(b, 1, seeded(2), { x: 0.5, z: 0.5, y: 0.1 });
    const through = body(0.5, 5), blocked = body(-2.5, 5);
    through.vz = 100; blocked.vz = 100;
    resolveArenaBuildings(through, [b], { x: 0.5, z: -5 });
    resolveArenaBuildings(blocked, [b], { x: -2.5, z: -5 });
    expect(through.z).toBe(5); expect(blocked.z).toBeCloseTo(-0.25, 5);
    expect(blocked.vz).toBeCloseTo(0);
  });
  it('stops at the earliest of several cover buildings in either travel direction', () => {
    const a = building([brick('a', 0)], -5), b = building([brick('b', 0)], 5);
    const actor = body(30, 0.5, 0.5);
    resolveArenaBuildings(actor, [b, a], { x: -30, z: 0.5 });
    expect(actor.x).toBeCloseTo(-5.5, 5);
    const reverse = body(-30, 0.5, 0.5); reverse.vx = -100;
    resolveArenaBuildings(reverse, [a, b], { x: 30, z: 0.5 });
    expect(reverse.x).toBeCloseTo(6.5, 5);
  });
  it('moves the largest full form from every clamped spawn to the center without collision or stationary drift', () => {
    for (const seed of [1, 4, 413]) {
      const buildings = generateArenaBuildings(seeded(seed));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const actor = body(sx * CONFIG.arenaWidth * 0.36, sz * CONFIG.arenaDepth * 0.36, 24.2);
        actor.vx = actor.vz = 0; clampToArena(actor);
        const start = { x: actor.x, z: actor.z };
        for (let step = 1; step <= 80; step++) {
          const previous = { x: actor.x, z: actor.z };
          const expected = { x: start.x * (1 - step / 80), z: start.z * (1 - step / 80) };
          actor.x = expected.x; actor.z = expected.z;
          resolveArenaBuildings(actor, buildings, previous); clampToArena(actor);
          expect(actor.x).toBeCloseTo(expected.x, 5); expect(actor.z).toBeCloseTo(expected.z, 5);
          expect(buildings.every(b => segmentBuildingHit(actor.x, actor.z, actor.x, actor.z, b, actor.radius - 1e-5) === null)).toBe(true);
          resolveArenaBuildings(actor, buildings, { x: actor.x, z: actor.z });
          expect(actor.x).toBeCloseTo(expected.x, 5); expect(actor.z).toBeCloseTo(expected.z, 5);
        }
      }
    }
  });
  it('rechecks cover encountered after an overlap push and uses only a verified clear central fallback', () => {
    const a = building([brick('a', 0)], 10), b = building([brick('b', 0)], 7.2);
    const actor = body(10.5, 0.5, 1);
    resolveArenaBuildings(actor, [a, b], { x: actor.x, z: actor.z });
    expect([a, b].every(b => segmentBuildingHit(actor.x, actor.z, actor.x, actor.z, b, actor.radius - 1e-5) === null)).toBe(true);
    expect(actor.x).toBe(0); expect(actor.z).toBe(0); expect(actor.vx).toBe(0); expect(actor.vz).toBe(0);
    for (let frame = 0; frame < 10; frame++) {
      resolveArenaBuildings(actor, [a, b], { x: actor.x, z: actor.z });
      expect(actor.x).toBe(0); expect(actor.z).toBe(0);
    }
  });
  it('returns a grown full form trapped between cover to free ground and keeps it stable', () => {
    const a = building([brick('a', -2, 0, -40, 4, 1.2, 80)], 30);
    const b = building([brick('b', -2, 0, -40, 4, 1.2, 80)], 60);
    const actor = body(45, 0, 2.2);
    expect([a, b].every(b => segmentBuildingHit(actor.x, actor.z, actor.x, actor.z, b, actor.radius) === null)).toBe(true);
    actor.radius = 24.2; actor.vz = 8;
    resolveArenaBuildings(actor, [a, b], { x: actor.x, z: actor.z });
    expect(actor.x).toBe(0); expect(actor.z).toBe(0); expect(actor.vx).toBe(0); expect(actor.vz).toBe(0);
    for (let frame = 0; frame < 20; frame++) {
      const previous = { x: actor.x, z: actor.z };
      resolveArenaBuildings(actor, [a, b], previous); clampToArena(actor);
      expect(actor.x).toBe(0); expect(actor.z).toBe(0);
      expect([a, b].every(b => segmentBuildingHit(actor.x, actor.z, actor.x, actor.z, b, actor.radius) === null)).toBe(true);
    }
  });
  it('resolves full-form growth inside a generated cluster without repeated drift', () => {
    for (const seed of [1, 4, 413]) {
      const buildings = generateArenaBuildings(seeded(seed)), target = buildings[0];
      const actor = body(target.x, target.z, 24.2); actor.vz = 6;
      resolveArenaBuildings(actor, buildings, { x: actor.x, z: actor.z }); clampToArena(actor);
      expect(buildings.every(b => segmentBuildingHit(actor.x, actor.z, actor.x, actor.z, b, actor.radius - 1e-5) === null)).toBe(true);
      const settled = { x: actor.x, z: actor.z };
      for (let frame = 0; frame < 20; frame++) {
        resolveArenaBuildings(actor, buildings, { x: actor.x, z: actor.z }); clampToArena(actor);
        expect(actor.x).toBeCloseTo(settled.x, 5); expect(actor.z).toBeCloseTo(settled.z, 5);
      }
    }
  });

});
