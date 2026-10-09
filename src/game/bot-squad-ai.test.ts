import { describe, expect, it } from 'vitest';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { createBot, thinkBattleBot, type BattleBotBody } from './bots';
import { coordinateBotSquad, createBotSquad, type BotSquadOrder } from './bot-squad';
import { CONFIG } from './config';
import { createStructure, damageStructure, getBounds } from './structure';
import { enableEvolution } from './evolution';
import { createDash, moveDashingBody, startDash } from './movement';
import { collectNearbyDrops } from './pickup';
import { segmentBuildingHit, type ArenaBuilding } from './arena';
import { takeAmmunition } from './ammunition';
import { firstBattleImpact } from './battle-combat';
import { createPartProjectile } from './projectiles';
import type { Piece, Random } from './types';

const random: Random = () => 0.75;
const brick = (id = 'part'): Piece => ({ id, position: { x: 0, y: 0, z: 0 },
  size: { x: 2, y: 1, z: 2 }, color: '#abcdef', shape: 'brick' });
const actor = (id: string, x = 0, z = 0, stock = 20): BattleBotBody => {
  const structure = createStructure(CHARACTER_TEMPLATES[1]);
  enableEvolution(structure, CHARACTER_TEMPLATES[1], 'mosher');
  structure.evolution!.reserve = Array.from({ length: stock }, (_, i) => brick(`${id}/stock-${i}`));
  return { id, x, z, vx: 0, vz: 0, radius: 2, pickupRadius: 3, structure, dash: createDash() };
};
const order = (role: BotSquadOrder['role'], round = 4, targetId: string | null = 'player', flankSide = 1): BotSquadOrder =>
  ({ role, round, targetId, flankSide, allyIds: ['bot-2', 'bot-3'] });
const drop = (x: number, z: number, id = 'loot') => ({ piece: brick(id), x, z, ownerId: null, age: 2, settled: true });
const building = (x: number, z: number, sx = 4, sz = 36): ArenaBuilding => {
  const piece = { ...brick('cover/Core'), position: { x: -sx / 2, y: 0, z: -sz / 2 }, size: { x: sx, y: 10, z: sz } };
  const structure = createStructure({ ...CHARACTER_TEMPLATES[1], coreId: piece.id, pieces: [piece] });
  return { id: 'cover', x, z, structure, bounds: getBounds(structure), template: 'wall' };
};
const incoming = (x = 24, z = 0) => ({ ownerId: 'player', x, z, vx: -64, vz: 0, radius: 1, damage: 10 });
const think = (self: BattleBotBody, enemies: BattleBotBody[], command: BotSquadOrder,
  drops = [] as ReturnType<typeof drop>[], buildings = [] as ArenaBuilding[]) =>
  thinkBattleBot(createBot('balanced', random), self, enemies, drops, [], buildings, 1 / 60, 0, random, command);

describe('squad orders produce distinct, stable tactical jobs', () => {
  it('commits to the shared hostile target and applies a changed order immediately despite its independent target lock', () => {
    const self = actor('bot-1'), near = actor('bot-3', 18), assigned = actor('player', 45), bot = createBot('balanced', random);
    expect(thinkBattleBot(bot, self, [near, assigned], [], [], [], 1 / 60, 0).targetId).toBe(near.id);
    const switched = thinkBattleBot(bot, self, [near, assigned], [], [], [], 1 / 60, 0.02, random, order('attacker', 2));
    expect(switched.targetId).toBe(assigned.id); expect(switched.fire).toBe(true);
    expect(switched.aimX).toBe(assigned.x); expect(switched.x).toBeGreaterThan(0.8);
    const changed = thinkBattleBot(bot, self, [near, assigned], [], [], [], 1 / 60, 0.04, random, order('attacker', 2, near.id));
    expect(changed.targetId).toBe(near.id); expect(changed.aimX).toBe(near.x);
  });
  it('takes opposite pressure angles while keeping aim on the same real opponent', () => {
    const target = actor('player', 48), left = actor('bot-1'), right = actor('bot-2');
    const a = think(left, [target], order('attacker', 3, target.id, -1));
    const b = think(right, [target], order('attacker', 3, target.id, 1));
    moveDashingBody(left, left.dash!, a.x, a.z, a.speed, 0.15);
    moveDashingBody(right, right.dash!, b.x, b.z, b.speed, 0.15);
    expect(left.x).toBeGreaterThan(1); expect(right.x).toBeGreaterThan(1);
    expect(left.z).toBeLessThan(-0.1); expect(right.z).toBeGreaterThan(0.1);
    expect(a.aimZ).toBe(target.z); expect(b.aimZ).toBe(target.z);
  });
  it('keeps an attacker in the fight instead of farming optional loot and off-lane cover with a healthy body', () => {
    const self = actor('bot-1', 0, 0, 0), target = actor('player', 42);
    const action = think(self, [target], order('attacker'), [drop(-20, 0)], [building(-30, 0)]);
    expect(action.intent).toBe('hunt'); expect(action.targetId).toBe(target.id); expect(action.fire).toBe(true);
    expect(action.x).toBeGreaterThan(0.8);
    const before = self.structure.pieces.size;
    for (let i = 0; i < action.shotCount; i++) expect(takeAmmunition(self.structure)?.source).toBe('body');
    expect(self.structure.pieces.has(self.structure.coreId)).toBe(true);
    expect(self.structure.pieces.size).toBeGreaterThan(before * 0.98);
  });
  it('has an R4 collector actually reach and pick up accessible debris even while stocked and healthy', () => {
    const self = actor('bot-3'), target = actor('player', 45), loot = [drop(0, 25)], bot = createBot('balanced', random);
    const before = self.structure.pieces.size + self.structure.evolution!.reserve.length;
    const first = thinkBattleBot(bot, self, [target], loot, [], [], 1 / 60, 0, random, order('collector'));
    expect(first.intent).toBe('collect'); expect(first.fire).toBe(false); expect(first.z).toBeGreaterThan(0.9);
    expect(first.dash).toBe(true);
    for (let tick = 0; tick < 240 && loot.length; tick++) {
      const action = thinkBattleBot(bot, self, [target], loot, [], [], 1 / 60, tick / 60, random, order('collector'));
      if (action.dash) startDash(self.dash!, action.x, action.z, action.aimX - self.x, action.aimZ - self.z);
      moveDashingBody(self, self.dash!, action.x, action.z, action.speed, 1 / 60);
      collectNearbyDrops(loot, [self]);
    }
    expect(loot).toHaveLength(0);
    expect(self.structure.pieces.size + self.structure.evolution!.reserve.length).toBe(before + 1);
  });
  it('stays at an eligible pile already in reach until real pickup batches finish, even beside an exposed finishing target', () => {
    const self = actor('bot-3'), target = actor('player', 18), bot = createBot('balanced', random);
    damageStructure(target.structure, target.structure.pieces.size, () => 0.5);
    const loot = Array.from({ length: CONFIG.pickupBatchSize * 2 + 1 }, (_, index) => drop(0, 1, `pile/${index}`));
    const before = self.structure.pieces.size + self.structure.evolution!.reserve.length, total = loot.length;
    let frames = 0;
    while (loot.length) {
      const action = thinkBattleBot(bot, self, [target], loot, [], [], 1 / 60, frames / 60, random, order('collector'));
      expect(action.intent).toBe('collect'); expect(action.fire).toBe(false); expect(action.dash).toBe(false);
      expect(action.targetId).toBeNull(); expect(action.targetKind).toBeNull();
      expect(Math.hypot(action.x, action.z)).toBeLessThan(0.01);
      expect(collectNearbyDrops(loot, [self]).length).toBeLessThanOrEqual(CONFIG.pickupBatchSize);
      frames++;
      expect(frames).toBeLessThan(5);
    }
    expect(frames).toBe(3);
    expect(self.structure.pieces.size + self.structure.evolution!.reserve.length).toBe(before + total);
    const next = thinkBattleBot(bot, self, [target], loot, [], [], 1 / 60, frames / 60, random, order('attacker'));
    expect(next.intent).toBe('finish'); expect(next.fire).toBe(true); expect(next.targetId).toBe(target.id);
  });
  it('harvests real cover when the collector has no reachable loot and never pads one stock part with body ammunition', () => {
    const self = actor('bot-3', 0, 0, 1), cover = building(-26, 0), target = actor('player', 45);
    const action = think(self, [target], order('collector'), [], [cover]);
    expect(action.intent).toBe('harvest'); expect(action.targetKind).toBe('building'); expect(action.fire).toBe(true);
    expect(action.shotCount).toBe(1);
    const before = self.structure.pieces.size, ammo = takeAmmunition(self.structure)!;
    expect(ammo.source).toBe('reserve'); expect(self.structure.pieces.size).toBe(before);
    const shot = createPartProjectile(ammo.piece, self.id, self.x, self.z, action.aimX, action.aimZ);
    expect(firstBattleImpact(shot, action.aimX, action.aimZ, [self, target], [cover])?.kind).toBe('building');
    expect(shot.damage).toBe(1); expect(self.structure.evolution!.reserve).toHaveLength(0);
  });
  it('honours recovery before an exposed finishing target and resumes pressure immediately when the role swaps back', () => {
    const self = actor('bot-1'), target = actor('player', 18), bot = createBot('balanced', random);
    damageStructure(target.structure, target.structure.pieces.size, () => 0.5);
    expect(target.structure.pieces.size).toBe(1);
    const loot = [drop(-12, 0)];
    const recovering = thinkBattleBot(bot, self, [target], loot, [], [], 1 / 60, 0, random, order('recover'));
    expect(recovering.intent).toBe('recover'); expect(recovering.fire).toBe(false); expect(recovering.targetId).toBeNull();
    expect(recovering.x).toBeLessThan(-0.9);
    const attacking = thinkBattleBot(bot, self, [target], loot, [], [], 1 / 60, 0.02, random, order('attacker'));
    expect(attacking.intent).toBe('finish'); expect(attacking.fire).toBe(true); expect(attacking.targetId).toBe(target.id);
  });
  it('uses real harvesting during a recovery order instead of trading shots with the easy finishing target', () => {
    const self = actor('bot-1', 0, 0, 3), target = actor('player', 18), cover = building(-22, 0);
    damageStructure(target.structure, target.structure.pieces.size, () => 0.5);
    const action = think(self, [target], order('recover'), [], [cover]);
    expect(action.intent).toBe('recover'); expect(action.targetKind).toBe('building'); expect(action.targetId).toBe(cover.id);
    expect(action.fire).toBe(true); expect(action.shotCount).toBeLessThanOrEqual(3);
  });
  it('does not invent threats from allied volleys when using an attacker order', () => {
    const self = actor('bot-1'), target = actor('player', 35);
    const action = thinkBattleBot(createBot('balanced', random), self, [target], [], [{ ...incoming(), ownerId: 'bot-2' }], [], 1 / 60, 0, random, order('attacker'));
    expect(action.dodging).toBe(false); expect(action.intent).toBe('hunt'); expect(action.fire).toBe(true);
  });
  it('uses the coordinator recovery exit after restored armour even if Core exposure stays permanent', () => {
    const self = actor('bot-1'), two = actor('bot-2'), three = actor('bot-3'), target = actor('player', 35), squad = createBotSquad();
    self.structure.coreExposed = true;
    const command = coordinateBotSquad(squad, 4, [self, two, three, target], 0).get(self.id)!;
    expect(command.role).toBe('attacker');
    const action = think(self, [target], command);
    expect(action.intent).toBe('hunt'); expect(action.fire).toBe(true);
  });
});

describe('battle dash commands follow actual cooldown, path and tactical benefit', () => {
  it('requests a real dash to leave a dangerous group lane without mutating position, inventory or dash state', () => {
    const self = actor('bot-1'), before = JSON.stringify(self), target = actor('player', 35);
    const action = thinkBattleBot(createBot('balanced', random), self, [target], [], [incoming()], [], 1 / 60, 0, random, order('attacker'));
    expect(action.dodging).toBe(true); expect(action.dash).toBe(true); expect(JSON.stringify(self)).toBe(before);
    expect(startDash(self.dash!, action.x, action.z, action.aimX - self.x, action.aimZ - self.z)).toBe(true);
    moveDashingBody(self, self.dash!, action.x, action.z, action.speed, CONFIG.dashDuration);
    expect(Math.hypot(self.x, self.z)).toBeCloseTo(action.speed * CONFIG.dashSpeedMultiplier * CONFIG.dashDuration, 6);
    expect(self.dash!.remaining).toBe(0); expect(self.dash!.cooldown).toBeGreaterThan(2);
  });
  it('refuses a long dash into a second live lane outside the ordinary dodge reach', () => {
    const self = actor('bot-1'), target = actor('player', 35);
    const ordinary = thinkBattleBot(createBot('balanced', random), self, [target], [], [incoming()], [], 1 / 60, 0, random, order('attacker'));
    expect(ordinary.dash).toBe(true); expect(ordinary.z).toBeLessThan(-0.9);
    const crossLane = { ...incoming(12, -11), damage: 20 };
    const action = thinkBattleBot(createBot('balanced', random), self, [target], [], [incoming(), crossLane], [], 1 / 60, 0, random, order('attacker'));
    expect(action.dodging).toBe(true); expect(action.z).toBeLessThan(-0.9);
    expect(action.dash).toBe(false);
  });
  it('rejects a dash whose short dodge is clear but whose complete body path crosses a wall', () => {
    const self = actor('bot-1'), target = actor('player', 35), cover = building(0, -10.5, 80, 2);
    const action = thinkBattleBot(createBot('balanced', random), self, [target], [], [incoming()], [cover], 1 / 60, 0, random, order('attacker'));
    expect(action.dodging).toBe(true); expect(action.z).toBeLessThan(-0.9);
    expect(segmentBuildingHit(0, 0, action.x * 6, action.z * 6, cover, self.radius)).toBeNull();
    const travel = Math.max(CONFIG.movementSpeed, action.speed) * CONFIG.dashSpeedMultiplier * CONFIG.dashDuration;
    expect(segmentBuildingHit(0, 0, action.x * travel, action.z * travel, cover, self.radius)).not.toBeNull();
    expect(action.dash).toBe(false);
  });
  it('rejects a dash that would hit the arena edge although an ordinary dodge remains valid', () => {
    const self = actor('bot-1', 0, -68), target = actor('player', 35, -68);
    const action = thinkBattleBot(createBot('balanced', random), self, [target], [], [incoming(24, -68)], [], 1 / 60, 0, random, order('attacker'));
    expect(action.dodging).toBe(true); expect(action.z).toBeLessThan(-0.9);
    const travel = Math.max(CONFIG.movementSpeed, action.speed) * CONFIG.dashSpeedMultiplier * CONFIG.dashDuration;
    expect(Math.abs(self.z + action.z * travel) + self.radius).toBeGreaterThan(CONFIG.arenaDepth / 2);
    expect(action.dash).toBe(false);
  });
  it.each([{ remaining: 0, cooldown: 1, x: 0, z: 0 }, { remaining: 0.1, cooldown: 0, x: 1, z: 0 }, undefined])('does not request a dash without readiness (%s)', dash => {
    const self = actor('bot-1'); self.dash = dash;
    const action = think(self, [actor('player', 45)], order('attacker'));
    expect(action.x).toBeGreaterThan(0.8); expect(action.dash).toBe(false);
  });
  it('uses a clear useful closing dash but conserves it when already at firing distance', () => {
    const far = think(actor('bot-1'), [actor('player', 48)], order('attacker'));
    const close = think(actor('bot-1'), [actor('player', 18)], order('attacker'));
    expect(far.dash).toBe(true); expect(close.dash).toBe(false);
  });
  it('can dash away from close danger while reduced to a Core, without firing that Core', () => {
    const self = actor('bot-1', 0, 0, 0);
    damageStructure(self.structure, self.structure.pieces.size, () => 0.5);
    const action = think(self, [actor('player', 10)], order('recover'));
    expect(action.intent).toBe('evade'); expect(action.x).toBeLessThan(-0.9); expect(action.dash).toBe(true);
    expect(action.fire).toBe(false); expect(action.shotCount).toBe(0); expect(self.structure.pieces.size).toBe(1);
  });
});

describe('later round pressure is fast but uses only real, suitably sized batches', () => {
  it.each([2, 3, 4])('fires stocked pressure at the player interval in round %i while keeping round one easy slower', round => {
    const self = actor('bot-1'), target = actor('player', 30);
    const bot = createBot('balanced', random, 'easy');
    const opening = thinkBattleBot(bot, self, [target], [], [], [], 1 / 60, 0, random, order('independent', 1));
    const later = thinkBattleBot(bot, self, [target], [], [], [], 1 / 60, 0.02, random, order('attacker', round));
    expect(opening.shotInterval).toBeGreaterThan(0.62); expect(later.shotInterval).toBe(CONFIG.shotInterval);
    expect(later.fire).toBe(true);
  });
  it.each([2, 3, 4])('keeps a healthy round %i attacker on player cadence with a bounded real body volley and retained Core', round => {
    const self = actor('bot-1', 0, 0, 0), target = actor('player', 30), before = self.structure.pieces.size;
    const action = think(self, [target], order('attacker', round));
    expect(action.fire).toBe(true); expect(action.shotInterval).toBe(CONFIG.shotInterval);
    expect(action.shotCount).toBeGreaterThan(0); expect(action.shotCount).toBeLessThanOrEqual(3);
    const ammunition = Array.from({ length: action.shotCount }, () => takeAmmunition(self.structure)!);
    expect(ammunition.every(part => part.source === 'body' && part.piece.id !== self.structure.coreId)).toBe(true);
    expect(self.structure.pieces.size).toBe(before - ammunition.length);
    expect(self.structure.pieces.has(self.structure.coreId)).toBe(true);
    const shot = createPartProjectile(ammunition.map(part => part.piece), self.id, self.x, self.z, action.aimX, action.aimZ);
    expect(shot.damage).toBe(ammunition.length);
    expect(self.structure.evolution!.reserve).toHaveLength(0);
  });
  it('keeps damaged, recovering and collecting bodies on their cautious cadence and preserves the slow no-order and round-one API', () => {
    const target = actor('player', 30), damaged = actor('bot-1', 0, 0, 0), original = damaged.structure.pieces.size;
    while (damaged.structure.pieces.size > original * 0.6) expect(takeAmmunition(damaged.structure)?.source).toBe('body');
    const cautious = think(damaged, [target], order('attacker', 3));
    expect(cautious.fire).toBe(true); expect(cautious.shotInterval).toBeGreaterThan(CONFIG.shotInterval);
    const recovering = think(actor('bot-1', 0, 0, 0), [target], order('recover'), [], [building(-22, 0)]);
    expect(recovering.targetKind).toBe('building'); expect(recovering.intent).toBe('recover');
    expect(recovering.shotInterval).toBeGreaterThan(CONFIG.shotInterval);
    const collecting = think(actor('bot-3', 0, 0, 0), [target], order('collector'));
    expect(collecting.targetKind).toBe('actor'); expect(collecting.shotInterval).toBeGreaterThan(CONFIG.shotInterval);
    const self = actor('bot-1', 0, 0, 0);
    const noOrder = thinkBattleBot(createBot('balanced', random), self, [target], [], [], [], 1 / 60, 0);
    const opening = think(self, [target], order('attacker', 1));
    expect(noOrder.shotInterval).toBeGreaterThan(0.62); expect(opening.shotInterval).toBeGreaterThan(0.62);
  });
  it('allows a damaged later attacker to use its existing real finishing batch at player cadence', () => {
    const self = actor('bot-1', 0, 0, 0), target = actor('player', 30), original = self.structure.pieces.size;
    while (self.structure.pieces.size > original * 0.6) takeAmmunition(self.structure);
    damageStructure(target.structure, target.structure.pieces.size, () => 0.5);
    const action = think(self, [target], order('attacker', 3));
    expect(action.intent).toBe('finish'); expect(action.fire).toBe(true); expect(action.shotInterval).toBe(CONFIG.shotInterval);
    expect(action.shotCount).toBe(1); expect(takeAmmunition(self.structure)?.source).toBe('body');
    expect(self.structure.pieces.has(self.structure.coreId)).toBe(true);
  });
  it('maintains precise pressure through the final one to three reserve parts without pulling from the body', () => {
    for (const stock of [1, 2, 3]) {
      const self = actor('bot-1', 0, 0, stock), target = actor('player', 30), before = self.structure.pieces.size;
      const action = think(self, [target], order('attacker', 3));
      expect(action.fire).toBe(true); expect(action.shotInterval).toBe(CONFIG.shotInterval); expect(action.shotCount).toBeLessThanOrEqual(stock);
      for (let i = 0; i < action.shotCount; i++) expect(takeAmmunition(self.structure)?.source).toBe('reserve');
      expect(self.structure.pieces.size).toBe(before);
    }
  });
  it('adapts batches to actual confidence and finishing mass instead of making every fast shot twenty parts', () => {
    const self = actor('bot-1', 0, 0, 20), healthy = actor('player', 30), weak = actor('player', 30);
    damageStructure(weak.structure, weak.structure.pieces.size, () => 0.5);
    const pressure = think(self, [healthy], order('attacker'));
    const finish = think(self, [weak], order('attacker'));
    expect(pressure.shotCount).toBeGreaterThan(finish.shotCount); expect(finish.shotCount).toBe(1);
    expect(pressure.shotCount).toBeLessThanOrEqual(20); expect(pressure.shotCount).toBeGreaterThan(1);
    expect(pressure.shotInterval).toBeGreaterThanOrEqual(CONFIG.shotInterval); expect(finish.shotInterval).toBeGreaterThanOrEqual(CONFIG.shotInterval);
  });
});
