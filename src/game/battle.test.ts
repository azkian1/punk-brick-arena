import { describe, expect, it } from 'vitest';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { BOT_STYLES, createBot, thinkBattleBot, type BattleBotBody } from './bots';
import { CONFIG } from './config';
import { battleWinner, livingParticipants, newBattleRound, nextBattleRound, releaseEliminatedReserve } from './rounds';
import { createStructure, damageStructure, getBounds } from './structure';
import { enableEvolution } from './evolution';
import { clampToArena, moveBody } from './movement';
import { collectNearbyDrops } from './pickup';
import { damageArenaBuilding, generateArenaBuildings, resolveArenaBuildings, segmentBuildingHit, type ArenaBuilding } from './arena';
import { takeAmmunition } from './ammunition';
import { firstBattleImpact } from './battle-combat';
import { createPartProjectile } from './projectiles';
import type { Piece, Random } from './types';

const seeded = (seed: number): Random => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const brick = (id = 'loot'): Piece => ({ id, position: { x: 0, y: 0, z: 0 },
  size: { x: 2, y: 1, z: 2 }, color: '#abcdef', shape: 'brick' });
const actor = (id: string, x = 0, z = 0, stock = 20): BattleBotBody => {
  const structure = createStructure(CHARACTER_TEMPLATES[1]);
  enableEvolution(structure, CHARACTER_TEMPLATES[1], 'mosher');
  structure.evolution!.reserve = Array.from({ length: stock }, (_, i) => brick(`${id}/ammo-${i}`));
  return { id, x, z, vx: 0, vz: 0, radius: 2, pickupRadius: 3, structure };
};
const defeat = (body: BattleBotBody['structure']) => {
  damageStructure(body, body.pieces.size, seeded(9));
  damageStructure(body, body.pieces.size, seeded(10));
  expect(body.pieces.has(body.coreId)).toBe(false);
};
const wall = (): ArenaBuilding => {
  const piece = { ...brick('wall/Core'), position: { x: -2, y: 0, z: -18 }, size: { x: 4, y: 10, z: 36 } };
  const structure = createStructure({ ...CHARACTER_TEMPLATES[1], coreId: piece.id, pieces: [piece] });
  return { id: 'wall', x: 0, z: 0, structure, bounds: getBounds(structure), template: 'wall' };
};
const drop = (x: number, z: number, id = 'loot') => ({ piece: brick(id), x, z, ownerId: null, age: 2, settled: true });

// These verify actual multi-participant rules and tactical outcomes, retaining
// the duel tests as regression coverage for the original bot API.
describe('four participant battle rounds', () => {
  it('spawns three distinct opponents with globally unique parts', () => {
    const round = newBattleRound(CHARACTER_TEMPLATES, 'violet', seeded(44), 'mosher');
    expect(round.participants.map(participant => participant.id)).toEqual(['player', 'bot-1', 'bot-2', 'bot-3']);
    expect(new Set(round.participants.map(participant => participant.template.id)).size).toBe(4);
    const ids = round.participants.flatMap(participant => [...participant.structure.pieces.keys()]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(livingParticipants(round)).toHaveLength(4);
    expect(battleWinner(round)).toBeNull();
  });
  it('continues after each elimination and allows a bot to become the final winner', () => {
    const round = newBattleRound(CHARACTER_TEMPLATES, 'violet', seeded(7));
    for (const index of [1, 0]) {
      defeat(round.participants[index].structure);
      expect(battleWinner(round)).toBeNull();
    }
    expect(livingParticipants(round)).toHaveLength(2);
    defeat(round.participants[2].structure);
    expect(battleWinner(round)?.id).toBe('bot-3');
    expect(() => nextBattleRound(CHARACTER_TEMPLATES, round)).toThrow(/victory/);
  });
  it('drops an eliminated bank once and carries the player only after sole survival', () => {
    const round = newBattleRound(CHARACTER_TEMPLATES, 'violet', seeded(5), 'mosher');
    const opponent = round.participants[1].structure;
    opponent.evolution!.reserve.push(brick('enemy-stock'));
    expect(releaseEliminatedReserve(opponent)).toEqual([]);
    defeat(opponent);
    expect(releaseEliminatedReserve(opponent).map(piece => piece.id)).toEqual(['enemy-stock']);
    expect(releaseEliminatedReserve(opponent)).toEqual([]);
    expect(() => nextBattleRound(CHARACTER_TEMPLATES, round)).toThrow(/victory/);
    round.player.evolution!.reserve.push(brick('saved-stock'));
    const original = JSON.stringify([...round.player.pieces.values()]);
    for (const participant of round.participants.slice(2)) defeat(participant.structure);
    const next = nextBattleRound(CHARACTER_TEMPLATES, round, seeded(13));
    expect(next.number).toBe(2);
    expect(JSON.stringify([...next.player.pieces.values()])).toBe(original);
    expect(next.player.evolution!.reserve.map(piece => piece.id)).toEqual(['saved-stock']);
    next.player.evolution!.reserve[0].color = '#111111';
    expect(round.player.evolution!.reserve[0].color).toBe('#abcdef');
    expect(new Set(next.participants.map(participant => participant.template.id)).size).toBe(4);
    const oldIds = new Set([...round.player.pieces.keys(), ...round.player.evolution!.reserve.map(piece => piece.id)]);
    expect(next.participants.slice(1).some(participant => [...participant.structure.pieces.keys()].some(id => oldIds.has(id)))).toBe(false);
  });
  it('keeps distinct opponents across shuffled roster boundaries', () => {
    let round = newBattleRound(CHARACTER_TEMPLATES.slice(0, 6), CHARACTER_TEMPLATES[0].id, seeded(2));
    for (let number = 0; number < 8; number++) {
      expect(new Set(round.participants.map(participant => participant.template.id)).size).toBe(4);
      for (const participant of round.participants.slice(1)) defeat(participant.structure);
      round = nextBattleRound(CHARACTER_TEMPLATES.slice(0, 6), round, seeded(number + 1));
    }
  });
});

describe('battle bots treat every opponent as a threat and a target', () => {
  it('finishes an exposed bot instead of always choosing the player', () => {
    const self = actor('bot-1'), player = actor('player', 18), weak = actor('bot-2', 25);
    damageStructure(weak.structure, weak.structure.pieces.size, seeded(17));
    const action = thinkBattleBot(createBot('balanced', () => 0.75), self, [player, weak, actor('bot-3', -34)], [], [], [], 0.016, 0);
    expect(action.targetId).toBe('bot-2'); expect(action.targetKind).toBe('actor');
    expect(action.fire).toBe(true);
    expect(action.aimX).toBe(25);
  });
  it('ignores an eliminated bot and can attack a closer healthy bot', () => {
    const dead = actor('bot-3', 1); defeat(dead.structure);
    const action = thinkBattleBot(createBot('aggressor', () => 0.75), actor('bot-1'), [actor('player', 45), actor('bot-2', 18), dead], [], [], [], 0.016, 0);
    expect(action.targetId).toBe('bot-2'); expect(action.fire).toBe(true);
  });
  it.each(BOT_STYLES)('%s dodges shots owned by another bot', style => {
    const action = thinkBattleBot(createBot(style, () => 0.75), actor('bot-1'), [actor('player', 35)], [],
      [{ ownerId: 'bot-2', x: 24, z: 0, vx: -64, vz: 0 }], [], 0.016, 0);
    expect(action.dodging).toBe(true); expect(Math.abs(action.z)).toBeGreaterThan(0.9);
  });
  it.each(BOT_STYLES)('%s harvests nearby cover for stock with real body ammo', style => {
    const self = actor('bot-1', -14, 0, 0);
    const action = thinkBattleBot(createBot(style, () => 0.75), self, [actor('player', 45, 35)], [], [], [wall()], 0.016, 0);
    expect(action.targetId).toBe('wall'); expect(action.targetKind).toBe('building'); expect(action.fire).toBe(true);
  });
  it('seeks eligible safe debris when reduced to a Core, without firing that Core', () => {
    const self = actor('bot-1', 0, 0, 0);
    damageStructure(self.structure, self.structure.pieces.size, seeded(17));
    const locked = { ...drop(-1, 0, 'locked'), ownerId: self.id, age: 1 };
    const action = thinkBattleBot(createBot('balanced', () => 0.75), self, [actor('player', 35, 0)], [locked, drop(0, 12)], [], [], 0.016, 0);
    expect(action.fire).toBe(false); expect(action.z).toBeGreaterThan(0.5);
  });
  it('harvests nearby cover before crossing the arena for distant debris', () => {
    const self = actor('bot-1', -14, 0, 0);
    const action = thinkBattleBot(createBot('balanced', () => 0.75), self, [actor('player', 45, 35)],
      [drop(32, 25)], [], [wall()], 0.016, 0);
    expect(action.targetKind).toBe('building'); expect(action.targetId).toBe('wall'); expect(action.fire).toBe(true);
  });
  it('keeps fighting with body ammunition once debris and buildings run out', () => {
    const action = thinkBattleBot(createBot('balanced', () => 0.75), actor('bot-1', 0, 0, 0),
      [actor('player', 24, 0)], [], [], [], 0.016, 0);
    expect(action.targetId).toBe('player'); expect(action.fire).toBe(true);
    expect(action.shotInterval).toBeGreaterThan(0.62);
  });
  it('resumes fighting after physical repairs even though Core exposure is permanent', () => {
    const self = actor('bot-1'); self.structure.coreExposed = true;
    const action = thinkBattleBot(createBot('balanced', () => 0.75), self, [actor('player', 24)], [], [], [], 0.016, 0);
    expect(action.targetKind).toBe('actor'); expect(action.fire).toBe(true);
  });
  it('accounts for the real dimensions of a wide incoming part while dodging', () => {
    const wide = { ...brick('wide-shot'), size: { x: 12, y: 1, z: 12 } };
    const action = thinkBattleBot(createBot('balanced', () => 0.75), actor('bot-1'), [actor('player', 35)], [],
      [{ ownerId: 'bot-2', piece: wide, x: 24, z: 5, vx: -64, vz: 0 }], [], 0.016, 0);
    expect(action.dodging).toBe(true);
  });
  it('clears the first intervening cover before pursuing a blocked actor', () => {
    const self = actor('bot-1', -18), opponent = actor('player', 18), buildings = [wall()];
    const action = thinkBattleBot(createBot('balanced', () => 0.75), self, [opponent], [], [], buildings, 0.016, 0);
    expect(action.targetKind).toBe('building'); expect(action.targetId).toBe(buildings[0].id); expect(action.fire).toBe(true);
    const ammunition = takeAmmunition(self.structure)!;
    const projectile = createPartProjectile(ammunition.piece, self.id, self.x, self.z, action.aimX, action.aimZ);
    expect(firstBattleImpact(projectile, action.aimX, action.aimZ, [self, opponent], buildings)?.kind).toBe('building');
  });
  it.each(BOT_STYLES)('%s routes around cover to reach and absorb loot', style => {
    const self = actor('bot-1', -18, 0, 0), loot = [drop(18, 0)];
    damageStructure(self.structure, self.structure.pieces.size, seeded(31));
    const bot = createBot(style, () => 0.75), cover = [wall()];
    const before = self.structure.pieces.size + self.structure.evolution!.reserve.length;
    for (let tick = 0; tick < 1200 && loot.length; tick++) {
      const action = thinkBattleBot(bot, self, [], loot, [], cover, 1 / 60, tick / 60, () => 0.75);
      const previous = { x: self.x, z: self.z };
      moveBody(self, action.x, action.z, action.speed, 1 / 60);
      resolveArenaBuildings(self, cover, previous);
      collectNearbyDrops(loot, [self], () => 0.75);
    }
    expect(loot).toHaveLength(0);
    expect(self.structure.pieces.size + self.structure.evolution!.reserve.length).toBe(before + 1);
    expect(self.x).toBeGreaterThan(12);
  });
});




describe('battle bot resource navigation recovers from unreachable loot', () => {
  const cover = (id: string, pieces: Piece[]): ArenaBuilding => {
    const structure = createStructure({ ...CHARACTER_TEMPLATES[1], coreId: pieces[0].id, pieces });
    return { id, x: 0, z: 0, structure, bounds: getBounds(structure), template: 'ruin' };
  };
  const block = (id: string, x: number, z: number, sx: number, sz: number): Piece => ({
    ...brick(id), position: { x, y: 0, z }, size: { x: sx, y: 2, z: sz },
  });
  const exhausted = (x: number, z = 0) => {
    const self = actor('bot-1', x, z, 0);
    damageStructure(self.structure, self.structure.pieces.size, seeded(31));
    return self;
  };
  const collectFor = (self: BattleBotBody, loot: ReturnType<typeof drop>[], buildings: ArenaBuilding[], seconds = 10) => {
    const bot = createBot('balanced', () => 0.75);
    for (let tick = 0; tick < seconds * 60; tick++) {
      const action = thinkBattleBot(bot, self, [], loot, [], buildings, 1 / 60, tick / 60, () => 0.75);
      const previous = { x: self.x, z: self.z };
      moveBody(self, action.x, action.z, action.speed, 1 / 60);
      resolveArenaBuildings(self, buildings, previous);
      collectNearbyDrops(loot, [self], () => 0.75);
    }
    return bot;
  };
  it('collects through an actual gap inside a building enclosing rectangle', () => {
    const building = cover('open-ruin', [block('post-a', -20, -20, 2, 2), block('post-b', 18, 18, 2, 2)]);
    const self = exhausted(-18), loot = [drop(0, 0)];
    collectFor(self, loot, [building], 5);
    expect(loot).toHaveLength(0);
  });
  it('approaches within pickup reach without trying to enter solid cover', () => {
    const building = cover('thick-wall', [block('wall', -20, -20, 40, 40)]);
    const self = exhausted(-15), loot = [drop(-9, 0)];
    self.pickupRadius = 5;
    collectFor(self, loot, [building], 5);
    expect(loot).toHaveLength(0);
    expect(self.x).toBeLessThanOrEqual(-12);
  });
  it('skips deeply buried debris and collects an accessible alternative', () => {
    const building = cover('thick-wall', [block('wall', -40, -40, 80, 80)]);
    const self = exhausted(-24), loot = [drop(-18, 0, 'buried'), drop(-24, 16, 'accessible')];
    collectFor(self, loot, [building], 8);
    expect(loot.map(item => item.piece.id)).toEqual(['buried']);
    expect(self.structure.pieces.size + self.structure.evolution!.reserve.length).toBe(2);
  });
  it('abandons a free-looking but sealed courtyard after failed route progress', () => {
    const building = cover('closed-courtyard', [block('left', -20, -20, 4, 40), block('right', 16, -20, 4, 40),
      block('top', -16, -20, 32, 4), block('bottom', -16, 16, 32, 4)]);
    const self = exhausted(-14), loot = [drop(0, 0, 'sealed'), drop(-14, 18, 'outside')];
    collectFor(self, loot, [building], 8);
    expect(loot.map(item => item.piece.id)).toEqual(['sealed']);
    expect(self.z).toBeGreaterThan(12);
  });
  it('uses real stock to clear intervening cover when a well-stocked bot has no path to its opponent', () => {
    const building = cover('closed-courtyard', [block('left', -20, -20, 4, 40), block('right', 16, -20, 4, 40),
      block('top', -16, -20, 32, 4), block('bottom', -16, 16, 32, 4)]);
    const self = actor('bot-1', -14), opponent = actor('player', 0), bot = createBot('balanced', () => 0.75);
    const blocked = thinkBattleBot(bot, self, [opponent], [], [], [building], 1 / 60, 0);
    expect(blocked.fire).toBe(true); expect(blocked.targetKind).toBe('building');
    const clearing = thinkBattleBot(bot, self, [opponent], [], [], [building], 1 / 60, 1 / 60);
    expect(clearing.targetKind).toBe('building'); expect(clearing.fire).toBe(true);
    const ammunition = takeAmmunition(self.structure)!;
    expect(ammunition.source).toBe('reserve'); expect(self.structure.evolution!.reserve).toHaveLength(19);
    const projectile = createPartProjectile(ammunition.piece, self.id, self.x, self.z, clearing.aimX, clearing.aimZ);
    const impact = firstBattleImpact(projectile, clearing.aimX, clearing.aimZ, [self, opponent], [building]);
    expect(impact?.kind).toBe('building');
    damageArenaBuilding(building, 10, () => 0.75, { x: clearing.aimX, z: clearing.aimZ });
    const attack = thinkBattleBot(bot, self, [opponent], [], [], [building], 1 / 60, 2 / 60);
    expect(attack.targetId).toBe(opponent.id); expect(attack.targetKind).toBe('actor'); expect(attack.fire).toBe(true);
  });
  it('keeps clearing blocked actor sight after arriving at a successful route proxy', () => {
    const building = cover('corner-cover', [block('cover', -2, -22, 4, 44)]);
    const self = actor('bot-1', -3.25), opponent = actor('player', 7), bot = createBot('balanced', () => 0.75);
    // Establish a valid stationary route, reproducing the state left behind
    // when an actor's requested position was projected outside solid cover.
    thinkBattleBot(bot, self, [], [], [], [], 1 / 60, 0);
    bot.battle!.routeFailed = false;
    bot.battle!.route = [{ x: self.x, z: self.z }];
    for (let tick = 1; tick <= 120; tick++) {
      const action = thinkBattleBot(bot, self, [opponent], [], [], [building], 1 / 60, tick / 60);
      expect(action.targetKind).toBe('building'); expect(action.fire).toBe(true);
      expect(bot.battle!.routeFailed).toBe(false);
    }
    damageArenaBuilding(building, 10, () => 0.75, { x: 0, z: 0 });
    const attack = thinkBattleBot(bot, self, [opponent], [], [], [building], 1 / 60, 3);
    expect(attack.targetKind).toBe('actor'); expect(attack.fire).toBe(true);
  });
  it('clears a body-width obstruction even when the projectile lane remains open', () => {
    const gapStuds = 6;
    const building = cover('narrow-opening', [
      block('lower', -1, -CONFIG.arenaDepth, 2, CONFIG.arenaDepth - gapStuds),
      block('upper', -1, gapStuds, 2, CONFIG.arenaDepth - gapStuds),
    ]);
    const self = actor('bot-1', -6), opponent = actor('player', 50);
    self.radius = 5;
    expect(segmentBuildingHit(self.x, self.z, opponent.x, opponent.z, building, CONFIG.projectileSize / 2)).toBeNull();
    expect(segmentBuildingHit(self.x, self.z, opponent.x, opponent.z, building, self.radius)).not.toBeNull();
    const bot = createBot('balanced', () => 0.75);
    thinkBattleBot(bot, self, [opponent], [], [], [building], 1 / 60, 0);
    const clearing = thinkBattleBot(bot, self, [opponent], [], [], [building], 1 / 60, 1 / 60);
    expect(clearing.targetKind).toBe('building'); expect(clearing.fire).toBe(true);
  });
  it('routes the largest body between spawn corners through the actual generated arena', () => {
    const buildings = generateArenaBuildings(seeded(413), 1);
    const self = exhausted(-CONFIG.arenaWidth * 0.36, -CONFIG.arenaDepth * 0.36);
    self.radius = 24.2; self.pickupRadius = 3; clampToArena(self);
    const loot = [drop(CONFIG.arenaWidth * 0.36, -CONFIG.arenaDepth * 0.36)];
    const bot = createBot('balanced', () => 0.75);
    for (let tick = 0; tick < 1800 && loot.length; tick++) {
      const action = thinkBattleBot(bot, self, [], loot, [], buildings, 1 / 60, tick / 60, () => 0.75);
      const previous = { x: self.x, z: self.z };
      moveBody(self, action.x, action.z, action.speed, 1 / 60);
      resolveArenaBuildings(self, buildings, previous);
      collectNearbyDrops(loot, [self], () => 0.75);
    }
    expect(loot).toHaveLength(0);
  });
  it('keeps harvesting at close range even when enemy risk raises its target score', () => {
    const self = actor('bot-1', -10, 0, 4);
    self.structure.roundStartPieces *= 3;
    const action = thinkBattleBot(createBot('balanced', () => 0.75), self,
      [actor('player', 12, 5), actor('bot-2', 12, -5), actor('bot-3', 10, 14)], [], [], [wall()], 0.016, 0);
    expect(action.targetKind).toBe('building'); expect(action.fire).toBe(true);
  });
});

describe('battle tactics spend physical volleys to win and preserve survival options', () => {
  it('uses its final reserve part to finish an exposed peer without dismantling armor', () => {
    const self = actor('bot-1', 0, 0, 1), weak = actor('bot-2', 24);
    damageStructure(weak.structure, weak.structure.pieces.size, seeded(17));
    const before = self.structure.pieces.size;
    const action = thinkBattleBot(createBot('balanced', () => 0.75), self, [actor('player', 18), weak], [], [], [], 1 / 60, 0);
    expect(action.targetId).toBe(weak.id); expect(action.fire).toBe(true); expect(action.shotCount).toBe(1);
    const spent = Array.from({ length: action.shotCount }, () => takeAmmunition(self.structure));
    expect(spent.every(part => part?.source === 'reserve')).toBe(true);
    expect(self.structure.pieces.size).toBe(before); expect(self.structure.evolution!.reserve).toHaveLength(0);
  });
  it('limits harvesting volleys and never pads a small stock volley with body parts', () => {
    const stocked = actor('bot-1', -18), enemy = actor('player', 18);
    const clearing = thinkBattleBot(createBot('balanced', () => 0.75), stocked, [enemy], [], [], [wall()], 1 / 60, 0);
    const attack = thinkBattleBot(createBot('balanced', () => 0.75), actor('bot-1', 0), [actor('player', 24)], [], [], [], 1 / 60, 0);
    expect(clearing.targetKind).toBe('building'); expect(clearing.shotCount).toBeGreaterThan(0);
    expect(clearing.shotCount).toBeLessThanOrEqual(4); expect(attack.shotCount).toBeGreaterThan(clearing.shotCount);
    const lowStock = actor('bot-1', 0, 0, 3), before = lowStock.structure.pieces.size;
    const limited = thinkBattleBot(createBot('balanced', () => 0.75), lowStock, [actor('player', 24)], [], [], [], 1 / 60, 0);
    expect(limited.fire).toBe(true); expect(limited.shotCount).toBeLessThanOrEqual(3);
    for (let part = 0; part < limited.shotCount; part++) expect(takeAmmunition(lowStock.structure)?.source).toBe('reserve');
    expect(lowStock.structure.pieces.size).toBe(before);
  });
  it('preserves most body armor and closes distance rather than wasting body parts on long shots', () => {
    const self = actor('bot-1', 0, 0, 0), before = self.structure.pieces.size;
    const close = thinkBattleBot(createBot('balanced', () => 0.75), self, [actor('player', 24)], [], [], [], 1 / 60, 0);
    expect(close.fire).toBe(true); expect(close.shotCount).toBeLessThanOrEqual(Math.max(1, Math.floor((before - 1) * 0.01)));
    for (let part = 0; part < close.shotCount; part++) {
      const spent = takeAmmunition(self.structure);
      expect(spent?.source).toBe('body'); expect(spent?.piece.id).not.toBe(self.structure.coreId);
    }
    expect(self.structure.pieces.has(self.structure.coreId)).toBe(true);
    expect(self.structure.pieces.size).toBeGreaterThan(before * 0.98);
    const far = thinkBattleBot(createBot('balanced', () => 0.75), actor('bot-1', 0, 0, 0), [actor('player', 60)], [], [], [], 1 / 60, 0);
    expect(far.fire).toBe(false); expect(far.shotCount).toBe(0); expect(far.x).toBeGreaterThan(0.5);
  });
  it('keeps a stocked collector in combat and returns a moderately injured bot to combat', () => {
    const collector = actor('bot-1', 0, 0, 30);
    const collecting = thinkBattleBot(createBot('collector', () => 0.75), collector, [actor('player', 28)], [drop(-10, 0)], [], [], 1 / 60, 0);
    expect(collecting.targetKind).toBe('actor'); expect(collecting.fire).toBe(true); expect(collecting.x).toBeGreaterThan(-0.1);
    const injured = actor('bot-1', 0, 0, 30); injured.structure.roundStartPieces *= 2;
    const recovery = thinkBattleBot(createBot('balanced', () => 0.75), injured, [actor('player', 28)], [], [], [wall()], 1 / 60, 0);
    // Place cover away from this lane: having a harvest option must not make a
    // stocked bot abandon an otherwise available fight indefinitely.
    const offLane = wall(); offLane.x = -30;
    const fight = thinkBattleBot(createBot('balanced', () => 0.75), injured, [actor('player', 28)], [], [], [offLane], 1 / 60, 0);
    expect(recovery.targetKind).toBe('building');
    expect(fight.targetKind).toBe('actor'); expect(fight.fire).toBe(true);
  });
  it('intercepts lateral motion and maintains useful sniper separation', () => {
    const moving = actor('player', 30); moving.vz = 14;
    const lead = thinkBattleBot(createBot('sniper', () => 0.75), actor('bot-1'), [moving], [], [], [], 1 / 60, 0);
    expect(lead.aimZ).toBeGreaterThan(6.5); expect(lead.fire).toBe(true);
    const inRange = thinkBattleBot(createBot('sniper', () => 0.75), actor('bot-1'), [actor('player', 35)], [], [], [], 1 / 60, 0);
    expect(Math.abs(inRange.x)).toBeLessThan(0.1); expect(Math.abs(inRange.z)).toBeGreaterThan(0.9);
    const close = thinkBattleBot(createBot('sniper', () => 0.75), actor('bot-1'), [actor('player', 9)], [], [], [], 1 / 60, 0);
    expect(close.x).toBeLessThan(-0.5); expect(close.fire).toBe(true);
  });
  it('accounts for several opponents when retreating and prioritizes an active shooter', () => {
    const self = actor('bot-1'), west = actor('west', -12), eastA = actor('east-a', 10, 8), eastB = actor('east-b', 10, -8);
    const surrounded = thinkBattleBot(createBot('balanced', () => 0.75), self, [west, eastA, eastB], [], [], [], 1 / 60, 0);
    expect(surrounded.targetId).toBe(west.id); expect(surrounded.x).toBeLessThan(0);
    expect(surrounded.fire).toBe(true);
    const threatened = thinkBattleBot(createBot('balanced', () => 0.75), self, [actor('player', 18), actor('bot-2', 26)], [],
      [{ ownerId: 'bot-2', x: 18, z: 0, vx: -64, vz: 0, radius: 1, damage: 16 }], [], 1 / 60, 0);
    expect(threatened.targetId).toBe('bot-2'); expect(threatened.dodging).toBe(true);
    expect(threatened.shotCount).toBeLessThanOrEqual(6);
  });
  it('reacts to a dangerous group before its next routine decision and reuses only real stock', () => {
    const self = actor('bot-1'), bot = createBot('balanced', () => 0.75);
    bot.decision = 1; bot.dodgeCooldown = 0.6;
    const shots = [{ ownerId: 'bot-2', x: 12, z: 0, vx: -64, vz: 0, radius: 1.5, damage: 12,
      pieces: Array.from({ length: 12 }, (_, index) => brick(`incoming-${index}`)) }];
    const action = thinkBattleBot(bot, self, [actor('player', 35)], [], shots, [], 1 / 60, 0);
    expect(action.dodging).toBe(true); expect(Math.abs(action.z)).toBeGreaterThan(0.9);
    expect(self.structure.evolution!.reserve).toHaveLength(20);
  });
  it('dodges away from adjacent firing lanes and remains outside real group collision radii', () => {
    const self = actor('bot-1'), shots = [
      { ownerId: 'bot-2', x: 24, z: 0, vx: -64, vz: 0, radius: 1, damage: 12 },
      { ownerId: 'bot-3', x: 24, z: 5, vx: -64, vz: 0, radius: 1, damage: 12 },
    ];
    const action = thinkBattleBot(createBot('balanced', () => 0.75), self, [actor('player', 35)], [], shots, [], 1 / 60, 0);
    expect(action.dodging).toBe(true); expect(action.z).toBeLessThan(-0.9);
    let clearance = Infinity;
    for (let tick = 1; tick <= 72; tick++) {
      moveBody(self, action.x, action.z, action.speed, 1 / 120);
      for (const shot of shots) clearance = Math.min(clearance,
        Math.hypot(shot.x + shot.vx * tick / 120 - self.x, shot.z + shot.vz * tick / 120 - self.z) - self.radius - shot.radius);
    }
    expect(clearance).toBeGreaterThan(0);
  });
  it('uses actual cover to ignore shielded shots and never dodges into solid cover', () => {
    const self = actor('bot-1', -18), cover = wall();
    const shielded = thinkBattleBot(createBot('balanced', () => 0.75), self, [actor('player', 30)], [],
      [{ ownerId: 'bot-2', x: 18, z: 0, vx: -64, vz: 0, radius: 1, damage: 20 }], [cover], 1 / 60, 0);
    expect(shielded.dodging).toBe(false);
    const sideCover = wall(); sideCover.x = 0; sideCover.z = 14;
    const dodger = actor('bot-1', 0, -6);
    const dodge = thinkBattleBot(createBot('balanced', () => 0.75), dodger, [actor('player', 35)], [],
      [{ ownerId: 'bot-2', x: 24, z: -6, vx: -64, vz: 0, radius: 1, damage: 10 }], [sideCover], 1 / 60, 0);
    expect(dodge.dodging).toBe(true);
    expect(segmentBuildingHit(dodger.x, dodger.z, dodger.x + dodge.x * 6, dodger.z + dodge.z * 6, sideCover, dodger.radius)).toBeNull();
  });
  it('takes reachable cover when critically damaged under a concentrated volley', () => {
    const piece = { ...brick('shelter'), position: { x: 18, y: 0, z: 8 }, size: { x: 4, y: 10, z: 16 } };
    const structure = createStructure({ ...CHARACTER_TEMPLATES[1], coreId: piece.id, pieces: [piece] });
    const building: ArenaBuilding = { id: 'shelter', x: 0, z: 0, structure, bounds: getBounds(structure), template: 'wall' };
    const self = actor('bot-1'), enemy = actor('player', 30), bot = createBot('balanced', () => 0.75);
    self.structure.roundStartPieces *= 5;
    const shot = { ownerId: enemy.id, x: 24, z: 0, vx: -64, vz: 0, radius: 1, damage: 16 };
    let covered = false;
    for (let tick = 0; tick < 120 && !covered; tick++) {
      const time = tick / 60;
      const action = thinkBattleBot(bot, self, [enemy], [], [{ ...shot, x: shot.x + shot.vx * time }], [building], 1 / 60, time);
      const previous = { x: self.x, z: self.z };
      moveBody(self, action.x, action.z, action.speed, 1 / 60); resolveArenaBuildings(self, [building], previous);
      covered = segmentBuildingHit(enemy.x, enemy.z, self.x, self.z, building, CONFIG.projectileSize / 2) !== null;
      if (covered) expect(action.fire).toBe(false);
    }
    expect(covered).toBe(true); expect(building.structure.pieces.size).toBe(1);
    expect(self.structure.evolution!.reserve).toHaveLength(20);
  });
  it('flanks reachable short cover on scarce stock and opens an attack without destroying it', () => {
    const piece = { ...brick('short-cover'), position: { x: -2, y: 0, z: -4 }, size: { x: 4, y: 10, z: 8 } };
    const structure = createStructure({ ...CHARACTER_TEMPLATES[1], coreId: piece.id, pieces: [piece] });
    const building: ArenaBuilding = { id: 'short-cover', x: 0, z: 0, structure, bounds: getBounds(structure), template: 'wall' };
    const self = actor('bot-1', -12, 0, 4), enemy = actor('player', 12), bot = createBot('balanced', () => 0.75);
    let fired = false;
    for (let tick = 0; tick < 300 && !fired; tick++) {
      const action = thinkBattleBot(bot, self, [enemy], [], [], [building], 1 / 60, tick / 60);
      expect(action.targetKind).toBe('actor');
      if (action.fire) {
        fired = true;
        expect(segmentBuildingHit(self.x, self.z, action.aimX, action.aimZ, building, CONFIG.projectileSize / 2)).toBeNull();
      }
      const previous = { x: self.x, z: self.z };
      moveBody(self, action.x, action.z, action.speed, 1 / 60); resolveArenaBuildings(self, [building], previous);
    }
    expect(fired).toBe(true); expect(Math.abs(self.z)).toBeGreaterThan(2);
    expect(building.structure.pieces.size).toBe(1); expect(self.structure.evolution!.reserve).toHaveLength(4);
  });
});

describe('battle pressure breaks repair stalemates and recovers stale combat goals', () => {
  it.each(['easy', 'medium', 'normal'] as const)('spends a full physical stock volley on %s difficulty when stock is plentiful', difficulty => {
    const self = actor('bot-1', 0, 0, 100), enemy = actor('player', 28), before = self.structure.pieces.size;
    const action = thinkBattleBot(createBot('balanced', () => 0.75, difficulty), self, [enemy], [], [], [], 1 / 60, 0);
    expect(action.fire).toBe(true); expect(action.shotCount).toBe(20);
    const parts = Array.from({ length: action.shotCount }, () => takeAmmunition(self.structure));
    expect(parts.every(part => part?.source === 'reserve')).toBe(true);
    expect(new Set(parts.map(part => part!.piece.id)).size).toBe(20);
    expect(self.structure.evolution!.reserve).toHaveLength(80); expect(self.structure.pieces.size).toBe(before);
    const shot = createPartProjectile(parts.map(part => part!.piece), self.id, self.x, self.z, action.aimX, action.aimZ);
    expect(shot.damage).toBe(20); expect(shot.pieces).toHaveLength(20);
  });
  it('tightens range and raises physical pressure when a visible opponent keeps repairing', () => {
    const self = actor('bot-1', 0, 0, 60), enemy = actor('player', 25), bot = createBot('balanced', () => 0.75, 'easy');
    const initial = thinkBattleBot(bot, self, [enemy], [], [], [], 1 / 60, 0);
    let pressured = initial;
    // Repeated unchanged opposing armor models the observed repair stalemate:
    // the AI must change its offensive tactic, while only the firing layer can
    // transfer inventory parts or change either character's actual structure.
    for (let tick = 1; tick < 900; tick++) pressured = thinkBattleBot(bot, self, [enemy], [], [], [], 1 / 60, tick / 60);
    expect(pressured.shotCount).toBe(20); expect(pressured.shotCount).toBeGreaterThan(initial.shotCount);
    expect(pressured.shotInterval).toBeLessThan(initial.shotInterval * 0.6);
    expect(pressured.x).toBeGreaterThan(0.8); expect(Math.abs(initial.x)).toBeLessThan(0.1);
    expect(self.structure.evolution!.reserve).toHaveLength(60); expect(enemy.structure.pieces.size).toBe(enemy.structure.roundStartPieces);
  });
  it('recognizes lost grown armor even while the opponent remains larger than its starting head', () => {
    const self = actor('bot-1'), grown = actor('bot-2', 25), near = actor('player', 18), bot = createBot('balanced', () => 0.75);
    const peak = grown.structure.pieces.size;
    grown.structure.roundStartPieces = Math.floor(peak * 0.15);
    thinkBattleBot(bot, self, [near, grown], [], [], [], 1 / 60, 0);
    grown.structure.evolution!.reserve = [];
    for (let part = 0; part < Math.ceil(peak * 0.55); part++) expect(takeAmmunition(grown.structure)?.source).toBe('body');
    expect(grown.structure.pieces.size).toBeGreaterThan(grown.structure.roundStartPieces);
    expect(grown.structure.coreExposed).toBe(false);
    const action = thinkBattleBot(bot, self, [near, grown], [], [], [], 1 / 60, 1);
    expect(action.targetId).toBe(grown.id); expect(action.fire).toBe(true);
  });
  const bulkyCover = (): ArenaBuilding => {
    const piece = { ...brick('bulky-cover'), position: { x: -20, y: 0, z: -20 }, size: { x: 40, y: 8, z: 40 } };
    const structure = createStructure({ ...CHARACTER_TEMPLATES[1], coreId: piece.id, pieces: [piece] });
    return { id: 'bulky-cover', x: 0, z: 0, structure, bounds: getBounds(structure), template: 'tower' };
  };
  it('pursues a distant opponent around body-blocking cover instead of repeatedly reaching a short-step proxy', () => {
    const building = bulkyCover(), self = actor('bot-1', -20, -11, 78), enemy = actor('player', 58, -11);
    self.radius = 9.46; enemy.radius = 7.26;
    expect(segmentBuildingHit(self.x, self.z, enemy.x, enemy.z, building, CONFIG.projectileSize / 2)).toBeNull();
    expect(segmentBuildingHit(self.x, self.z, enemy.x, enemy.z, building, self.radius)).not.toBeNull();
    const bot = createBot('aggressor', () => 0.75);
    let fired = false;
    for (let tick = 0; tick < 600 && !fired; tick++) {
      const action = thinkBattleBot(bot, self, [enemy], [], [], [building], 1 / 60, tick / 60);
      expect(action.targetKind).toBe('actor');
      fired ||= action.fire;
      const previous = { x: self.x, z: self.z };
      moveBody(self, action.x, action.z, action.speed, 1 / 60); resolveArenaBuildings(self, [building], previous);
    }
    expect(fired).toBe(true); expect(self.z).toBeLessThan(-18);
    expect(building.structure.pieces.size).toBe(1);
  });
  it('clears body-width cover when a cached successful route ended at a stale proxy', () => {
    const building = bulkyCover(), self = actor('bot-1', -20, -11, 78), enemy = actor('player', 58, -11), bot = createBot('balanced', () => 0.75);
    self.radius = 9.46;
    thinkBattleBot(bot, self, [enemy], [], [], [building], 1 / 60, 0);
    // A valid prior navigation stamp with a reached projected endpoint is the
    // state produced by the original local-step pursuit in the browser stall.
    bot.battle!.route = [{ x: self.x, z: self.z }]; bot.battle!.routeAge = 1; bot.battle!.routeFailed = false;
    thinkBattleBot(bot, self, [enemy], [], [], [building], 1 / 60, 1 / 60);
    expect(bot.battle!.routeFailed).toBe(true);
    const clearing = thinkBattleBot(bot, self, [enemy], [], [], [building], 1 / 60, 2 / 60);
    expect(clearing.targetKind).toBe('building'); expect(clearing.fire).toBe(true);
    const ammunition = takeAmmunition(self.structure)!;
    const shot = createPartProjectile(ammunition.piece, self.id, self.x, self.z, clearing.aimX, clearing.aimZ);
    expect(firstBattleImpact(shot, clearing.aimX, clearing.aimZ, [self, enemy], [building])?.kind).toBe('building');
  });
  it('switches away from a combat target after sustained inability to approach or attack it', () => {
    const self = actor('bot-1', -60), nearest = actor('bot-2', 50), alternative = actor('bot-3', 50, 55), bot = createBot('balanced', () => 0.75);
    let action = thinkBattleBot(bot, self, [nearest, alternative], [], [], [], 1 / 60, 0);
    expect(action.targetId).toBe(nearest.id);
    // Freeze the physical position as an external collision would: a repeated
    // movement command is not evidence of progress toward the combat target.
    for (let tick = 1; tick < 360; tick++) action = thinkBattleBot(bot, self, [nearest, alternative], [], [], [], 1 / 60, tick / 60);
    expect(action.targetId).toBe(alternative.id); expect(action.fire).toBe(false);
  });
  it('uses compact group geometry for handwritten shots whose parts retain old body positions', () => {
    const pieces = [{ ...brick('a'), position: { x: -1000, y: 0, z: 0 } },
      { ...brick('b'), position: { x: 1000, y: 0, z: 0 } }];
    const action = thinkBattleBot(createBot('balanced', () => 0.75), actor('bot-1'), [actor('player', 35)], [],
      [{ ownerId: 'bot-2', x: 24, z: 10, vx: -64, vz: 0, pieces }], [], 1 / 60, 0);
    expect(action.dodging).toBe(false);
  });
});

describe('purposeful battle hunting remains readable and uses real resources', () => {
  it('labels a pressure-driven retreat as evade after it overrides a repair goal', () => {
    const self = actor('bot-1', 0, 0, 0), opponent = actor('player', 10);
    damageStructure(self.structure, self.structure.pieces.size, seeded(17));
    expect(self.structure.pieces.size).toBe(1);
    expect(self.structure.pieces.has(self.structure.coreId)).toBe(true);
    const loot = [drop(8, 0)];
    const action = thinkBattleBot(createBot('balanced', () => 0.75), self, [opponent], loot, [], [], 1 / 60, 0);
    expect(action.intent).toBe('evade');
    expect(action.x).toBeLessThan(-0.9);
    expect(action.fire).toBe(false);
    expect(action.shotCount).toBe(0);
    expect(action.targetId).toBeNull();
    expect(self.structure.pieces.size).toBe(1);
    expect(self.structure.evolution!.reserve).toHaveLength(0);
    expect(loot).toHaveLength(1);
  });

  it('mobilizes briefly then attacks with safe body ammunition despite an empty reserve and remaining harvest options', () => {
    const self = actor('bot-1', 0, 0, 0), enemy = actor('player', 42), bot = createBot('balanced', () => 0.75, 'easy');
    const offLane = wall(); offLane.x = -30;
    const loot = [drop(-20, 0)], mass = self.structure.pieces.size;
    const opening = thinkBattleBot(bot, self, [enemy], loot, [], [offLane], 1 / 60, 0);
    expect(opening.intent).toBe('prepare');
    let hunting = opening;
    for (let tick = 1; tick < 420; tick++) hunting = thinkBattleBot(bot, self, [enemy], loot, [], [offLane], 1 / 60, tick / 60);
    expect(hunting.intent).toBe('hunt'); expect(hunting.targetId).toBe(enemy.id); expect(hunting.fire).toBe(true);
    expect(hunting.x).toBeGreaterThan(0.5);
    const ammunition = Array.from({ length: hunting.shotCount }, () => takeAmmunition(self.structure));
    expect(ammunition.every(part => part?.source === 'body')).toBe(true);
    expect(self.structure.pieces.has(self.structure.coreId)).toBe(true);
    expect(self.structure.pieces.size).toBeGreaterThan(mass * 0.98);
  });
  it('continues hunting while automatic pickups in reach perform actual repairs', () => {
    const self = actor('bot-1'), enemy = actor('player', 28);
    const initial = self.structure.pieces.size;
    const lost = Array.from({ length: Math.ceil(initial * 0.36) }, () => {
      self.structure.evolution!.reserve = [];
      return takeAmmunition(self.structure)!.piece;
    });
    self.structure.evolution!.reserve = Array.from({ length: 20 }, (_, index) => brick(`stock/${index}`));
    self.structure.evolution!.reserveRevision++;
    const repair = [{ ...drop(0, 1), piece: lost[0] }];
    const bot = createBot('balanced', () => 0.75);
    const action = thinkBattleBot(bot, self, [enemy], repair, [], [], 1 / 60, 0);
    expect(action.intent).toBe('hunt'); expect(action.fire).toBe(true); expect(Math.hypot(action.x, action.z)).toBeGreaterThan(0.9);
    const before = self.structure.pieces.size + self.structure.evolution!.reserve.length;
    moveBody(self, action.x, action.z, action.speed, 1 / 60);
    const collected = collectNearbyDrops(repair, [self]);
    expect(collected).toHaveLength(1); expect(repair).toHaveLength(0);
    expect(self.structure.pieces.size + self.structure.evolution!.reserve.length).toBe(before + 1);
  });
  it('holds a hunting target through incidental crossfire but switches immediately for a reachable finishing blow', () => {
    const self = actor('bot-1'), first = actor('player', 18), second = actor('bot-2', 26), bot = createBot('balanced', () => 0.75);
    expect(thinkBattleBot(bot, self, [first, second], [], [], [], 1 / 60, 0).targetId).toBe(first.id);
    for (let tick = 1; tick <= 60; tick++) {
      const shots = tick % 2 ? [{ ownerId: second.id, x: 24, z: 0, vx: -64, vz: 0, radius: 1, damage: 20 }] : [];
      const action = thinkBattleBot(bot, self, [first, second], [], shots, [], 1 / 60, tick / 60);
      expect(action.targetId).toBe(first.id);
    }
    damageStructure(second.structure, second.structure.pieces.size, seeded(17));
    const finish = thinkBattleBot(bot, self, [first, second], [], [], [], 1 / 60, 1.1);
    expect(finish.targetId).toBe(second.id); expect(finish.intent).toBe('finish'); expect(finish.fire).toBe(true);
  });
  it('commits to one reachable resource rather than reversing for each slightly closer new piece', () => {
    const self = actor('bot-1', 0, 0, 0), bot = createBot('balanced', () => 0.75);
    damageStructure(self.structure, self.structure.pieces.size, seeded(17));
    const original = drop(10, 10, 'original'), newcomer = drop(-8, 8, 'newcomer');
    const start = thinkBattleBot(bot, self, [actor('player', 35)], [original], [], [], 1 / 60, 0);
    expect(start.x).toBeGreaterThan(0.5); expect(start.z).toBeGreaterThan(0.5);
    const held = thinkBattleBot(bot, self, [actor('player', 35)], [original, newcomer], [], [], 1 / 60, 1);
    expect(held.x).toBeGreaterThan(0.5); expect(held.z).toBeGreaterThan(0.5);
    expect(held.intent).toBe('recover'); expect(held.fire).toBe(false);
  });
  it('an opening bot leads a fast target and closes a poor shot instead of wasting ammo, but fires at a broad grown model', () => {
    const tiny = actor('player', 35); tiny.vz = 20;
    const self = actor('bot-1'), small = thinkBattleBot(createBot('balanced', () => 0.75, 'easy'), self, [tiny], [], [], [], 1 / 60, 0);
    expect(small.aimZ).toBeGreaterThan(6); expect(small.fire).toBe(false); expect(small.x).toBeGreaterThan(0.5);
    const large = { ...tiny, radius: 12 };
    const broad = thinkBattleBot(createBot('balanced', () => 0.75, 'easy'), self, [large], [], [], [], 1 / 60, 0);
    expect(broad.fire).toBe(true); expect(broad.shotCount).toBeGreaterThan(0);
    expect(self.structure.evolution!.reserve).toHaveLength(20);
  });
  const doorway = (): ArenaBuilding => {
    const pieces = [
      { ...brick('lower'), position: { x: -1, y: 0, z: -160 }, size: { x: 2, y: 10, z: 156 } },
      { ...brick('upper'), position: { x: -1, y: 0, z: 4 }, size: { x: 2, y: 10, z: 156 } },
    ];
    const structure = createStructure({ ...CHARACTER_TEMPLATES[1], coreId: pieces[0].id, pieces });
    return { id: 'doorway', x: 0, z: 0, structure, bounds: getBounds(structure), template: 'wall' };
  };
  it('reduces a real packed volley to fit an opening instead of spending twenty parts against the door edges', () => {
    const self = actor('bot-1', -18, 0, 100), enemy = actor('player', 18), building = doorway();
    const action = thinkBattleBot(createBot('balanced', () => 0.75), self, [enemy], [], [], [building], 1 / 60, 0);
    expect(action.targetKind).toBe('actor'); expect(action.fire).toBe(true);
    expect(action.shotCount).toBeGreaterThan(0); expect(action.shotCount).toBeLessThan(20);
    const ammunition = Array.from({ length: action.shotCount }, () => takeAmmunition(self.structure)!.piece);
    const shot = createPartProjectile(ammunition, self.id, self.x, self.z, action.aimX, action.aimZ);
    expect(firstBattleImpact(shot, enemy.x, enemy.z, [self, enemy], [building])?.kind).toBe('actor');
    expect(shot.damage).toBe(ammunition.length);
    expect(self.structure.evolution!.reserve).toHaveLength(100 - ammunition.length);
  });
  it('clears actual cover when even its next stock part cannot fit the apparent shot opening', () => {
    const self = actor('bot-1', -18, 0, 1), enemy = actor('player', 18), building = doorway();
    self.structure.evolution!.reserve[0].size = { x: 8, y: 1, z: 8 };
    const action = thinkBattleBot(createBot('balanced', () => 0.75), self, [enemy], [], [], [building], 1 / 60, 0);
    expect(action.targetKind).toBe('building'); expect(action.intent).toBe('clear'); expect(action.fire).toBe(true);
    const ammunition = takeAmmunition(self.structure)!;
    const shot = createPartProjectile(ammunition.piece, self.id, self.x, self.z, action.aimX, action.aimZ);
    expect(firstBattleImpact(shot, action.aimX, action.aimZ, [self, enemy], [building])?.kind).toBe('building');
    expect(ammunition.source).toBe('reserve'); expect(shot.damage).toBe(1);
  });
});
