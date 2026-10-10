import { describe, expect, it } from 'vitest';
import { BOT_STYLES, createBot, thinkBot, type BotBody, type BotDifficulty } from './bots';
import { moveBody } from './movement';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { collectNearbyDrops } from './pickup';
import { createStructure } from './structure';
import { CONFIG } from './config';
import { newRound, nextRound } from './rounds';

const enemy = (): BotBody => ({ id: 'enemy', x: 0, z: 0, vx: 0, vz: 0, radius: 4, pickupRadius: 5 });
const player = (x = 24, z = 0) => ({ x, z, vx: 0, vz: 0, radius: 4 });
const random = () => 0.75;
const incoming = [{ ownerId: 'player', x: 24, z: 0, vx: -64, vz: 0 }];
const drop = (x: number, z: number, id = 'loot') => ({ piece: { ...CHARACTER_TEMPLATES[0].pieces[0], id }, x, z, ownerId: 'player', age: 1, settled: true });

describe('four bot personalities and round difficulty', () => {
  it('aggressor closes distance and keeps the same movement under incoming fire', () => {
    const a = thinkBot(createBot('aggressor', random), enemy(), player(), [], incoming, 1 / 60, 0, random);
    const b = thinkBot(createBot('aggressor', random), enemy(), player(), [], [], 1 / 60, 0, random);
    expect(a.x).toBeGreaterThan(0.9); expect(a.z).toBe(0);
    expect([a.x, a.z]).toEqual([b.x, b.z]); expect(a.dodging).toBe(false);
    expect(a.fire).toBe(true); expect(a.shotInterval).toBeLessThan(CONFIG.botShotInterval);
  });
  it('aggressor gathers available nearby bricks while pressuring the player', () => {
    const actor = { ...enemy(), structure: createStructure(CHARACTER_TEMPLATES[1]) };
    const loot = [drop(0, 2)];
    const action = thinkBot(createBot('aggressor', random), actor, player(8), loot, [], 1 / 60, 0, random);
    expect(action.x).toBeGreaterThan(0); expect(action.z).toBeGreaterThan(0);
    expect(collectNearbyDrops(loot, [actor], random)).toHaveLength(1);
  });
  it('collector runs to distant safe loot and actually grows its structure', () => {
    const actor = { ...enemy(), x: -14, z: -12, structure: createStructure(CHARACTER_TEMPLATES[1]) };
    const loot = [drop(-15, 14)];
    const initial = actor.structure.pieces.size, bot = createBot('collector', random);
    for (let tick = 0; tick < 240 && loot.length; tick++) {
      const action = thinkBot(bot, actor, player(25, -20), loot, [], 1 / 60, tick / 60, random);
      moveBody(actor, action.x, action.z, action.speed, 1 / 60);
      collectNearbyDrops(loot, [actor], random);
    }
    expect(loot).toHaveLength(0); expect(actor.structure.pieces.size).toBe(initial + 1);
  });
  it('collector retreats from close pressure and ignores ownership-locked loot', () => {
    const locked = { ...drop(-12, 0), ownerId: 'enemy', age: 1 };
    const safe = drop(0, 16);
    const action = thinkBot(createBot('collector', random), enemy(), player(30), [locked, safe], [], 1 / 60, 0, random);
    expect(action.z).toBeGreaterThan(0.9); expect(action.x).toBeCloseTo(0);
    const retreat = thinkBot(createBot('collector', random), enemy(), player(10), [safe], [], 1 / 60, 0, random);
    expect(retreat.x).toBeLessThan(0);
  });
  it.each(['collector', 'sniper', 'balanced'] as const)('%s dodges approaching projectiles but ignores receding ones', style => {
    const dodge = thinkBot(createBot(style, random), enemy(), player(), [], incoming, 1 / 60, 0, random);
    const receding = thinkBot(createBot(style, random), enemy(), player(), [], [{ ...incoming[0], vx: 64 }], 1 / 60, 0, random);
    expect(dodge.dodging).toBe(true); expect(Math.abs(dodge.z)).toBeGreaterThan(0.9);
    expect(receding.dodging).toBe(false);
  });
  it('sniper retreats and switches to accurate rapid fire when approached', () => {
    const long = thinkBot(createBot('sniper', random), enemy(), player(31), [], [], 1 / 60, 0, random);
    const close = thinkBot(createBot('sniper', random), enemy(), player(10), [], [], 1 / 60, 0, random);
    expect(long.panic).toBe(false); expect(close.panic).toBe(true);
    expect(close.x).toBeLessThan(0); expect(close.shotInterval).toBeLessThan(long.shotInterval / 4);
    expect([close.aimX, close.aimZ]).toEqual([10, 0]);
    expect(close.fire).toBe(true);
  });
  it('sniper leads a moving target instead of firing at its old position', () => {
    const target = { ...player(10), vz: 10 };
    const action = thinkBot(createBot('sniper', random), enemy(), target, [], [], 1 / 60, 0, random);
    expect(action.aimZ).toBeGreaterThan(target.z);
  });
  it.each(BOT_STYLES)('%s turns away from a corner instead of becoming stuck there', style => {
    const actor = { ...enemy(), x: 32, z: 32 }, bot = createBot(style, random);
    for (let i = 0; i < 120; i++) {
      const action = thinkBot(bot, actor, player(0), [], [], 1 / 60, i / 60, random);
      moveBody(actor, action.x, action.z, action.speed, 1 / 60);
      expect(Math.abs(actor.x) + actor.radius).toBeLessThanOrEqual(CONFIG.arenaWidth / 2);
      expect(Math.abs(actor.z) + actor.radius).toBeLessThanOrEqual(CONFIG.arenaDepth / 2);
    }
    expect(Math.hypot(actor.x - 32, actor.z - 32)).toBeGreaterThan(10);
  });
  it('starts and resets at full strength, keeps the opening universal styles and unlocks all four specialists', () => {
    const styles = new Set();
    for (const value of [0, 0.2499, 0.25, 0.4999, 0.5, 0.7499, 0.75, 0.999]) {
      const first = newRound(CHARACTER_TEMPLATES, 'violet', () => value);
      expect([first.enemyBehavior, first.enemyDifficulty]).toEqual(['balanced', 'normal']);
      first.enemy.pieces.clear();
      const second = nextRound(CHARACTER_TEMPLATES, first, () => value);
      expect([second.number, second.enemyBehavior, second.enemyDifficulty]).toEqual([2, 'balanced', 'normal']);
      second.enemy.pieces.clear();
      const third = nextRound(CHARACTER_TEMPLATES, second, () => value);
      expect(third.number).toBe(3); expect(third.enemyDifficulty).toBe('normal');
      expect(third.enemyBehavior).toBe(BOT_STYLES[Math.floor(value * 4)]);
      styles.add(third.enemyBehavior);
      // Independent random choices permit the same type again, including universal.
      third.enemy.pieces.clear();
      const fourth = nextRound(CHARACTER_TEMPLATES, third, () => value);
      expect([fourth.enemyBehavior, fourth.enemyDifficulty]).toEqual([third.enemyBehavior, 'normal']);
      const reset = newRound(CHARACTER_TEMPLATES, fourth.playerTemplate.id, () => value);
      expect([reset.number, reset.enemyBehavior, reset.enemyDifficulty]).toEqual([1, 'balanced', 'normal']);
    }
    expect(styles).toEqual(new Set(BOT_STYLES));
  });

  it('universal alternates attacking, strafing, and seeking nearby loot without sniper panic', () => {
    const bot = createBot('balanced', random);
    const attack = thinkBot(bot, enemy(), player(30), [drop(-10, 0)], [], 0.01, 0, () => 0.5);
    expect(attack.x).toBeGreaterThan(0.9); expect(attack.fire).toBe(true);
    const strafe = thinkBot(bot, enemy(), player(22), [], [], 5, 5, () => 0.9);
    expect(strafe.x).toBeCloseTo(0); expect(Math.abs(strafe.z)).toBeGreaterThan(0.9);
    const collect = thinkBot(bot, enemy(), player(30), [drop(-10, 0)], [], 5, 10, () => 0.1);
    expect(collect.x).toBeLessThan(-0.9); expect(collect.fire).toBe(true);
    const close = thinkBot(bot, enemy(), player(8), [], [], 1, 11, random);
    expect(close.panic).toBe(false); expect(close.shotInterval).toBe(collect.shotInterval);
  });

  it('universal can reach and absorb nearby loot but does not chase distant loot across the whole map', () => {
    const actor = { ...enemy(), structure: createStructure(CHARACTER_TEMPLATES[1]) };
    const loot = [drop(0, 16)], bot = createBot('balanced', random);
    const before = actor.structure.pieces.size;
    for (let i = 0; i < 180 && loot.length; i++) {
      const action = thinkBot(bot, actor, player(30), loot, [], 1 / 60, i / 60, () => 0.1);
      moveBody(actor, action.x, action.z, action.speed, 1 / 60);
      collectNearbyDrops(loot, [actor], random);
    }
    expect(loot).toHaveLength(0); expect(actor.structure.pieces.size).toBe(before + 1);
    const far = thinkBot(createBot('balanced', random), enemy(), player(30), [drop(-30, 0)], [], 0.01, 0, () => 0.1);
    expect(far.x).toBeGreaterThan(0);
  });

  it('opening difficulty tiers are progressively slower, less accurate, and fire less often', () => {
    const actions = (['easy', 'medium', 'normal'] as BotDifficulty[]).map(difficulty =>
      thinkBot(createBot('balanced', random, difficulty), enemy(), player(24), [], [], 0.01, 0.5, random));
    const errors = actions.map(action => Math.hypot(action.aimX - 24, action.aimZ));
    for (let i = 0; i < 2; i++) {
      expect(actions[i].speed).toBeLessThan(actions[i + 1].speed);
      expect(actions[i].shotInterval).toBeGreaterThan(actions[i + 1].shotInterval);
      expect(errors[i]).toBeGreaterThan(errors[i + 1]);
      expect(actions[i].fire).toBe(true);
    }
  });

  it('weak universal does not dodge; medium reacts later; normal universal has gaps between dodges', () => {
    const weak = thinkBot(createBot('balanced', random, 'easy'), enemy(), player(), [], incoming, 0.01, 0, () => 0.1);
    expect(weak.dodging).toBe(false);
    const medium = createBot('balanced', random, 'medium');
    thinkBot(medium, enemy(), player(), [], [], 0.01, 0, () => 0.1);
    expect(thinkBot(medium, enemy(), player(), [], incoming, 0.13, 0.13, () => 0.1).dodging).toBe(false);
    expect(thinkBot(medium, enemy(), player(), [], incoming, 0.13, 0.26, () => 0.1).dodging).toBe(true);
    const normal = createBot('balanced', random);
    expect(thinkBot(normal, enemy(), player(), [], incoming, 0.01, 0, random).dodging).toBe(true);
    expect(thinkBot(normal, enemy(), player(), [], incoming, 0.4, 0.4, random).dodging).toBe(false);
    expect(thinkBot(normal, enemy(), player(), [], incoming, 0.8, 1.2, random).dodging).toBe(true);
  });
});
