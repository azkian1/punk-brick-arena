import { describe, expect, it } from 'vitest';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { ARENA_PART_TYPES, damageArenaBuilding, generateArenaBuildings, type ArenaBuilding } from './arena';
import { takeAmmunitionBatch } from './ammunition';
import { CONFIG } from './config';
import { debrisFloorY } from './debris';
import { createBuildingDebris, debrisPositionClear, debrisRadius, stepDebrisPhysics } from './debris-motion';
import { collectPiece, enableEvolution } from './evolution';
import { canCollectDrop } from './pickup';
import { createPartProjectile, stepPartProjectile, type PartProjectile } from './projectiles';
import { connectedToCore, createStructure } from './structure';
import type { Piece, Random, Structure } from './types';

function seeded(seed: number): Random {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
const dimensions = (piece: Pick<Piece, 'size'>) => [piece.size.x, piece.size.y, piece.size.z].join(':');
const partType = (piece: Pick<Piece, 'size' | 'shape'>) => `${dimensions(piece)}:${piece.shape}`;
const identity = (piece: Piece) => ({ id: piece.id, size: { ...piece.size }, shape: piece.shape, color: piece.color });
const identities = (pieces: Piece[]) => pieces.map(identity).sort((a, b) => a.id.localeCompare(b.id));
const inventory = (structure: Structure) => [...structure.pieces.values(), ...structure.evolution!.reserve];
const constructionPieces = (buildings: ArenaBuilding[]) => buildings.flatMap(building => [...building.structure.pieces.values()]);
const long = (piece: Pick<Piece, 'size'>) => Math.max(piece.size.x, piece.size.z) >= 6;

describe('mixed construction loot through evolution and real-part ammunition', () => {
  it('conserves every actual part type through demolition, physical debris, repair, growth, banking and firing', () => {
    const buildings = generateArenaBuildings(seeded(71), 7);
    const originalBuildings = new Map(constructionPieces(buildings).map(piece => [piece.id, piece]));
    const template = CHARACTER_TEMPLATES[0], structure = createStructure(template);
    enableEvolution(structure, template, 'mosher');
    const original = identities([...originalBuildings.values(), ...inventory(structure)]);
    const state = structure.evolution!, projectiles: PartProjectile[] = [];

    // Firing one actual head part creates an accessible, previously built slot.
    const [wound] = takeAmmunitionBatch(structure, 1);
    expect(wound.source).toBe('body');
    expect(long(wound.piece)).toBe(true);
    projectiles.push(createPartProjectile(wound.piece, 'player', 0, 0, 50, 50));
    const repairType = ARENA_PART_TYPES.find(type => partType(type) === partType(wound.piece))!;
    const frontier = state.plan.slots.filter((_, i) => !state.occupied[i] && state.plan.neighbors[i].some(n => state.occupied[n]));
    const frontierSizes = new Set(frontier.map(dimensions));
    const growthSlot = frontier.find(slot => slot.shape === 'brick' && long(slot))!;
    const growthType = ARENA_PART_TYPES.find(type => partType(type) === partType(growthSlot))!;
    const bankType = ARENA_PART_TYPES.find(type => type.shape === 'tile' && long(type) && !frontierSizes.has(dimensions(type)))!;
    const bankBrickType = ARENA_PART_TYPES.find(type => type.shape === 'brick' && long(type) && !frontierSizes.has(dimensions(type)))!;
    expect(repairType).toBeDefined();
    expect(growthType).toBeDefined();
    expect(bankType).toBeDefined();
    expect(bankBrickType).toBeDefined();

    const plannedSizes = new Set(state.plan.slots.map(dimensions));
    for (const type of ARENA_PART_TYPES) expect(plannedSizes.has(dimensions(type)), partType(type)).toBe(true);

    // Aim at real part centers. Taking the highest available example keeps the
    // scenario independent of the generator's placement and support algorithm.
    const requested = [repairType, bankType, bankBrickType, growthType, ...ARENA_PART_TYPES];
    const drops: ReturnType<typeof createBuildingDebris> = [];
    const removed = new Set<string>();
    for (const type of requested) {
      if (drops.some(drop => partType(drop.piece) === partType(type))) continue;
      const candidates = buildings.flatMap(building => [...building.structure.pieces.values()]
        .filter(piece => partType(piece) === partType(type)).map(piece => ({ building, piece })));
      candidates.sort((a, b) => b.piece.position.y - a.piece.position.y);
      expect(candidates.length, partType(type)).toBeGreaterThan(0);
      const { building, piece } = candidates[0];
      const impact = {
        x: building.x + (piece.position.x + piece.size.x / 2) * CONFIG.characterScale,
        y: (piece.position.y + piece.size.y / 2) * CONFIG.characterScale,
        z: building.z + (piece.position.z + piece.size.z / 2) * CONFIG.characterScale,
      };
      const hit = damageArenaBuilding(building, 1, seeded(removed.size + 1), impact);
      expect(hit.direct.map(part => part.id)).toEqual([piece.id]);
      const fallen = [...hit.direct, ...hit.cascade];
      for (const part of fallen) {
        expect(removed.has(part.id)).toBe(false);
        expect(part).toBe(originalBuildings.get(part.id));
        removed.add(part.id);
      }
      const physical = createBuildingDebris(building, fallen, buildings, seeded(removed.size));
      expect(physical.map(drop => drop.piece)).toEqual(fallen);
      drops.push(...physical);
    }
    expect(new Set(drops.map(drop => partType(drop.piece)))).toEqual(new Set(ARENA_PART_TYPES.map(partType)));
    const worldPieces = () => [
      ...constructionPieces(buildings), ...inventory(structure), ...drops.map(drop => drop.piece),
      ...projectiles.flatMap(projectile => projectile.pieces),
    ];
    expect(identities(worldPieces())).toEqual(original);

    for (let frame = 0; frame < 900 && drops.some(drop => !drop.settled); frame++) {
      stepDebrisPhysics(drops, buildings, 1 / 60);
      for (const drop of drops) drop.age += 1 / 60;
    }
    expect(drops.filter(drop => !drop.settled).map(drop => ({
      id: drop.piece.id, size: drop.piece.size, x: drop.x, y: drop.y, z: drop.z,
      vy: drop.vy, source: drop.escapeSource?.id,
    })), 'construction debris must settle through its physical simulation').toEqual([]);
    for (const drop of drops) {
      expect(drop.piece).toBe(originalBuildings.get(drop.piece.id));
      expect(drop.y).toBeGreaterThanOrEqual(debrisFloorY(drop.piece));
      expect(debrisPositionClear(drop.x, drop.z, debrisRadius(drop.piece), buildings)).toBe(true);
      expect(canCollectDrop(drop, 'player')).toBe(true);
    }

    const repairDrop = drops.find(drop => partType(drop.piece) === partType(repairType))!;
    const bankDrop = drops.find(drop => partType(drop.piece) === partType(bankType))!;
    const bankBrickDrop = drops.find(drop => partType(drop.piece) === partType(bankBrickType))!;
    const growthDrop = drops.find(drop => partType(drop.piece) === partType(growthType))!;
    const first = [repairDrop, bankDrop, bankBrickDrop, growthDrop];
    const order = [...first, ...drops.filter(drop => !first.includes(drop))];
    const modes: string[] = [];
    for (const drop of order) {
      const result = collectPiece(structure, drop.piece, seeded(19));
      expect(result).not.toBeNull();
      expect(identity(result!.piece)).toEqual(identity(drop.piece));
      if (drop === repairDrop) {
        expect(result!.mode).toBe('repair');
        expect(result!.piece.position).toEqual(wound.piece.position);
      }
      if (drop === bankDrop) expect(result!.mode).toBe('bank');
      if (drop === bankBrickDrop) expect(result!.mode).toBe('bank');
      if (drop === growthDrop) expect(result!.mode).toBe('growth');
      modes.push(result!.mode);
    }
    drops.length = 0;
    expect(new Set(modes)).toEqual(new Set(['repair', 'growth', 'bank']));
    expect(connectedToCore(structure).size).toBe(structure.pieces.size);
    expect(identities(worldPieces())).toEqual(original);

    // Both installed and banked construction parts become actual volley objects;
    // the original Core remains, and no attachment color/shape is replaced.
    const firedConstruction: { piece: Piece; source: 'reserve' | 'body' }[] = [];
    for (let volley = 0; volley < template.pieces.length + removed.size; volley++) {
      const batch = takeAmmunitionBatch(structure, 20);
      if (!batch.length) break;
      const projectile = createPartProjectile(batch.map(ammunition => ammunition.piece), 'player', 0, 0, 50, 50);
      expect(projectile.damage).toBe(batch.length);
      for (const [i, ammunition] of batch.entries()) {
        expect(projectile.pieces[i]).toBe(ammunition.piece);
        if (originalBuildings.has(ammunition.piece.id)) firedConstruction.push(ammunition);
      }
      projectiles.push(projectile);
    }
    expect(new Set(firedConstruction.map(ammunition => ammunition.source))).toEqual(new Set(['reserve', 'body']));
    expect(new Set(firedConstruction.map(ammunition => partType(ammunition.piece)))).toEqual(new Set(ARENA_PART_TYPES.map(partType)));
    expect(firedConstruction).toHaveLength(removed.size);
    expect([...structure.pieces.keys()]).toEqual([structure.coreId]);
    expect(state.reserve).toHaveLength(0);
    expect(takeAmmunitionBatch(structure, 20)).toEqual([]);

    const mixedVolley = projectiles.find(projectile => projectile.pieces.some(piece => piece.shape === 'tile') &&
      projectile.pieces.some(piece => piece.shape === 'brick'))!;
    expect(mixedVolley).toBeDefined();
    const ammunitionIdentity = identities(mixedVolley.pieces);
    const projectileRandom = seeded(97);
    for (let frame = 0; frame < 600 && !mixedVolley.settled; frame++) {
      stepPartProjectile(mixedVolley, 1 / 60, projectileRandom,
        (x, z, radius) => debrisPositionClear(x, z, radius, buildings));
    }
    expect(mixedVolley.settled).toBe(true);
    expect(identities(mixedVolley.pieces)).toEqual(ammunitionIdentity);
    const all = worldPieces();
    expect(new Set(all.map(piece => piece.id)).size).toBe(all.length);
    expect(identities(all)).toEqual(original);
  });
});
