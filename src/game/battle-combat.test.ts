import { describe, expect, it } from 'vitest';
import { firstBattleImpact } from './battle-combat';
import { areBattleAllies } from './bot-squad';
import { takeAmmunitionBatch } from './ammunition';
import { createPartProjectile } from './projectiles';
import { createStructure, damageStructure, getBounds } from './structure';
import { damageArenaBuilding, type ArenaBuilding } from './arena';
import { createVictoryCollection, stepVictoryCollection } from './victory';
import { enableEvolution } from './evolution';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import type { Piece } from './types';

const brick: Piece = { id: 'ammo', position: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1.2, z: 1 }, color: '#cc3311', shape: 'brick' };
function target(id: string, x: number) {
  return { id, x, z: 0, radius: 1, structure: createStructure({ ...CHARACTER_TEMPLATES[0], pieces: [{ ...brick, id: `${id}/core` }], coreId: `${id}/core` }) };
}
function cover(): ArenaBuilding {
  const structure = createStructure({ ...CHARACTER_TEMPLATES[0], coreId: 'cover', pieces: [{ ...brick, id: 'cover', size: { x: 4, y: 1.2, z: 4 }, position: { x: -2, y: 0, z: -2 } }] });
  return { id: 'cover', template: 'wall', x: 5, z: 0, structure, bounds: getBounds(structure) };
}

describe('battle projectile integration', () => {
  it('a requested twenty-part volley with two available parts deals two damage and keeps Core', () => {
    const shooter = createStructure({ ...CHARACTER_TEMPLATES[0], coreId: 'shooter/core', pieces: [
      { ...brick, id: 'shooter/core' },
      { ...brick, id: 'shooter/one', position: { x: 1, y: 0, z: 0 } },
      { ...brick, id: 'shooter/two', position: { x: 2, y: 0, z: 0 } },
    ] });
    const batch = takeAmmunitionBatch(shooter, 20), shot = createPartProjectile(batch.map(ammo => ammo.piece), 'player', 0, 0, 20, 0);
    expect(shot.damage).toBe(2);
    expect(shot.pieces).toHaveLength(2);
    expect([...shooter.pieces.keys()]).toEqual(['shooter/core']);
    expect(shooter.pieces.size + shot.pieces.length).toBe(3);
  });

  it.each([1, 3, 20])('applies the actual %i-part volley count as one damage batch and keeps all physical ammunition', count => {
    const parts = Array.from({ length: count }, (_, i) => ({ ...brick, id: `volley/${i}` }));
    const shot = createPartProjectile(parts, 'player', 0, 0, 20, 0);
    const victim = createStructure({ ...CHARACTER_TEMPLATES[0], coreId: 'target/core', pieces: [
      { ...brick, id: 'target/core', size: { x: 40, y: 1.2, z: 1 } },
      ...Array.from({ length: 40 }, (_, i) => ({ ...brick, id: `armor/${i}`, position: { x: i, y: 1.2, z: 0 } })),
    ] });
    const before = victim.pieces.size, result = damageStructure(victim, shot.damage, () => 0);
    expect(result.direct).toHaveLength(count);
    expect(result.cascade).toHaveLength(0);
    expect(victim.pieces.size).toBe(before - count);
    expect(shot.pieces).toHaveLength(count);
    for (let i = 0; i < count; i++) expect(shot.pieces[i]).toBe(parts[i]);
  });

  it('uses the complete compact volley footprint for collisions rather than the first part alone', () => {
    const single = createPartProjectile(brick, 'player', 0, 0, 20, 0);
    const volley = createPartProjectile(Array.from({ length: 20 }, (_, i) => ({ ...brick, id: `wide/${i}` })), 'player', 0, 0, 20, 0);
    const bot = { ...target('bot-1', 12), z: 1.8 };
    expect(firstBattleImpact(single, 20, 0, [bot], [])).toBeNull();
    expect(firstBattleImpact(volley, 20, 0, [bot], [])?.target.id).toBe('bot-1');
  });

  it('hits the nearest living rival independent of actor array order and ignores its owner', () => {
    const shot = createPartProjectile(brick, 'bot-1', 0, 0, 20, 0);
    const owner = target('bot-1', 0), dead = target('bot-3', 2), near = target('bot-2', 6), far = target('player', 12);
    dead.structure.pieces.clear();
    const impact = firstBattleImpact(shot, 20, 0, [owner, far, dead, near], []);
    expect(impact?.kind).toBe('actor'); expect(impact?.target.id).toBe('bot-2');
  });
  it('keeps independent fire as the default, and filters an ally before selecting the hostile contact', () => {
    const parts = Array.from({ length: 3 }, (_, i) => ({ ...brick, id: `team/volley/${i}` }));
    const shot = createPartProjectile(parts, 'bot-1', 0, 0, 20, 0);
    const ally = target('bot-2', 6), enemy = target('player', 12);
    expect(firstBattleImpact(shot, 20, 0, [enemy, ally], [])?.target.id).toBe(ally.id);
    const calls: string[] = [];
    const impact = firstBattleImpact(shot, 20, 0, [ally, enemy], [], (owner, candidate) => {
      calls.push(`${owner}/${candidate}`);
      return candidate !== ally.id;
    });
    expect(impact?.kind).toBe('actor');
    expect(impact?.target).toBe(enemy);
    if (impact?.kind === 'actor') damageStructure(impact.target.structure, shot.damage);
    expect(ally.structure.pieces.has(ally.structure.coreId)).toBe(true);
    expect(enemy.structure.pieces.has(enemy.structure.coreId)).toBe(false);
    expect(calls).toEqual(['bot-1/bot-2', 'bot-1/player']);
    expect(shot.pieces).toEqual(parts);
    expect(shot.pieces.every((piece, i) => piece === parts[i])).toBe(true);
  });
  it('still stops at cover when every fighter is protected by the damage policy', () => {
    const shot = createPartProjectile(brick, 'bot-1', 0, 0, 20, 0);
    const owner = target('bot-1', 0), ally = target('bot-2', 2), enemy = target('player', 12), building = cover();
    const impact = firstBattleImpact(shot, 20, 0, [owner, ally, enemy], [building], () => false);
    expect(impact?.kind).toBe('building');
    expect(impact?.target).toBe(building);
    expect(firstBattleImpact(shot, 20, 0, [owner], [], () => true)).toBeNull();
  });
  it.each([
    [1, 'bot-2', 'bot-2'], [2, 'bot-2', 'player'], [2, 'bot-3', 'bot-3'],
    [3, 'bot-2', 'player'], [3, 'bot-3', 'player'], [4, 'bot-3', 'player'],
  ] as const)('applies round %i team policy to the nearer %s and reaches %s', (round, nearerId, expectedId) => {
    const shot = createPartProjectile(Array.from({ length: 20 }, (_, i) => ({ ...brick, id: `round-${round}/${i}` })), 'bot-1', 0, 0, 20, 0);
    const nearer = target(nearerId, 6), player = target('player', 12);
    const impact = firstBattleImpact(shot, 20, 0, [nearer, player], [],
      (owner, candidate) => !areBattleAllies(round, owner, candidate));
    expect(impact?.target.id).toBe(expectedId);
    expect(shot.pieces).toHaveLength(20);
    expect(nearer.structure.pieces.size).toBe(1);
  });
  it('stops at cover and reaches the actor behind it after demolition', () => {
    const shot = createPartProjectile(brick, 'player', 0, 0, 20, 0), building = cover(), bot = target('bot-2', 12);
    expect(firstBattleImpact(shot, 20, 0, [bot], [building])?.kind).toBe('building');
    const destroyed = damageArenaBuilding(building, 10, () => .5, { x: 4, z: 0 });
    expect(destroyed.direct[0].id).toBe('cover');
    expect(firstBattleImpact(shot, 20, 0, [bot], [building])?.target.id).toBe('bot-2');
  });
  it('does not allow a rebound arc or a settled shot to deal another hit', () => {
    const shot = createPartProjectile(brick, 'player', 0, 0, 20, 0);
    shot.mode = 'rebound';
    expect(firstBattleImpact(shot, 20, 0, [target('bot-1', 4)], [cover()])).toBeNull();
    shot.mode = 'shot'; shot.settled = true;
    expect(firstBattleImpact(shot, 20, 0, [target('bot-1', 4)], [])).toBeNull();
  });
  it('preserves the firing lock and landing requirement during victory collection', () => {
    const structure = createStructure(CHARACTER_TEMPLATES[0]);
    enableEvolution(structure, CHARACTER_TEMPLATES[0], 'mosher');
    const drop = { piece: { ...brick, id: 'fired/victory', size: { x: 1, y: .4, z: 1 } }, ownerId: 'player',
      x: 0, y: 2.5, z: 0, age: 0, settled: false, lockedUntilAge: 5 };
    const drops = [drop], state = createVictoryCollection(drops), player = { x: 0, z: 0, structure };
    for (let i = 0; i < 300; i++) stepVictoryCollection(state, drops, player, 1 / 60);
    expect(drops).toHaveLength(1); expect(state.collected).toBe(0);
    expect(drop.age).toBeCloseTo(5);
    drop.settled = true;
    stepVictoryCollection(state, drops, player, 1 / 60);
    expect(drops).toHaveLength(0); expect(state.collected).toBe(1);
    expect([...structure.pieces.values(), ...structure.evolution!.reserve].some(piece => piece.id === 'fired/victory')).toBe(true);
  });
});
