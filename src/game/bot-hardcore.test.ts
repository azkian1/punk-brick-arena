import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { BOT_STYLES, createBot, thinkBattleBot, type BattleBotBody } from './bots';
import { areBattleAllies, coordinateBotSquad, createBotSquad, type BotSquadOrder } from './bot-squad';
import { CONFIG } from './config';
import { newBattleRound, nextBattleRound, type BattleRound } from './rounds';
import { createStructure, damageStructure, getBounds } from './structure';
import { takeAmmunitionBatch } from './ammunition';
import { createPartProjectile, type PartProjectile } from './projectiles';
import { createDash, moveBody, moveDashingBody, startDash } from './movement';
import { pickupRadiusForBounds } from './pickup';
import { groundIndex } from './ground-index';
import { resolveArenaBuildings } from './arena';
import type { Piece } from './types';

const random = () => 0.75;
const source = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.ES2022, true);
const mainFunction = (name: string) => {
  const node = parsed.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!node) throw new Error(`Missing actual main function ${name}`);
  return node.getText(parsed);
};
const cooldownStep = source.match(/for \(const a of actors\) \{ a\.cooldown -= dt;[^\n]*\}/)?.[0];
if (!cooldownStep) throw new Error('Missing actual main cooldown loop');

interface RuntimeActor extends BattleBotBody {
  bot?: ReturnType<typeof createBot>;
  cooldown: number; hurt: number; shotsFired: number; lastShotCount: number; desiredShotCount: number;
  dashStarts: number; boundsRevision: number; bounds: ReturnType<typeof getBounds>;
  view: { ring: { scale: { setScalar(value: number): void } } };
}
interface RuntimeShot extends PartProjectile { owner: RuntimeActor }
const physicalPart = (id: string): Piece => ({ id, position: { x: 0, y: 0, z: 0 },
  size: { x: 1, y: 0.4, z: 1 }, color: '#88a078', shape: 'brick' });
const contents = (actors: readonly BattleBotBody[]) => actors.flatMap(actor =>
  [...actor.structure.pieces.values(), ...(actor.structure.evolution?.reserve ?? [])]);
const ledger = (parts: readonly Piece[]) => parts.map(part => ({ id: part.id, size: part.size,
  color: part.color, shape: part.shape })).sort((a, b) => a.id.localeCompare(b.id));
const order = (round: number): BotSquadOrder => ({ round, role: round === 1 ? 'independent' : 'attacker',
  targetId: round === 1 ? null : 'player', flankSide: 0, allyIds: [] });

function roundAt(number: number): BattleRound {
  let round = newBattleRound(CHARACTER_TEMPLATES, 'violet', random, 'mosher');
  while (round.number < number) {
    for (const opponent of round.participants.slice(1)) {
      damageStructure(opponent.structure, opponent.structure.pieces.size, random);
      damageStructure(opponent.structure, opponent.structure.pieces.size, random);
    }
    round = nextBattleRound(CHARACTER_TEMPLATES, round, random);
  }
  return round;
}
function actorsFrom(round: BattleRound): RuntimeActor[] {
  // Isolate one live bot and its hostile to measure cadence without incoming
  // lanes or collisions changing the intended offensive job.
  return round.participants.slice(0, 2).map((participant, index) => {
    const actor: RuntimeActor = { id: participant.id, structure: participant.structure,
      x: index === 0 ? 30 : 0, z: 0, vx: 0, vz: 0, radius: 2.2, pickupRadius: 3,
      ...(participant.style ? { bot: createBot(participant.style, random, participant.difficulty!) } : {}),
      dash: createDash(), cooldown: 0, hurt: 0, shotsFired: 0, lastShotCount: 0, desiredShotCount: 0,
      dashStarts: 0, boundsRevision: -1, bounds: getBounds(participant.structure),
      view: { ring: { scale: { setScalar() {} } } } };
    if (index === 1) {
      actor.structure.evolution!.reserve = Array.from({ length: 200 }, (_, i) => physicalPart(`${actor.id}/stock-${i}`));
      actor.structure.evolution!.reserveRevision++;
    }
    return actor;
  });
}
function mainRuntime(round: BattleRound, actors: RuntimeActor[]) {
  const shots: RuntimeShot[] = [], fallen: Piece[] = [], impacts: string[] = [];
  const environment = {
    round, actors, shots, CONFIG, createBot, thinkBattleBot, groundIndex, coordinateBotSquad, squad: createBotSquad(),
    areBattleAllies, startDash, moveDashingBody, resolveArenaBuildings, buildings: [], drops: [],
    takeAmmunitionBatch, createPartProjectile, getBounds, pickupRadiusForBounds, damageStructure,
    alive: (actor: BattleBotBody) => actor.structure.pieces.has(actor.structure.coreId),
    createPieceProjectile: () => ({ position: { set() {} } }), shotCount: 1,
    renderer: { scene: { add() {} }, kick() {} }, sound: { play() {} },
    stats: { shots: 0, hits: 0, direct: 0, cascade: 0 }, ui: { toast() {} }, toastDelay: 1,
    recordImpact: (_owner: string, target: string) => impacts.push(target),
    knockOff: (_actor: RuntimeActor, pieces: Piece[]) => fallen.push(...pieces), burst() {}, eliminate() {},
  };
  const code = ['fire', 'updateBounds', 'bot', 'hit'].map(mainFunction).join('\n')
    + `\nlet simTime = 0; function advance(dt: number) { simTime += dt; ${cooldownStep} bot(dt); }`;
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const functions = new Function(...Object.keys(environment), `${compiled}; return { fire, hit, advance };`)
    (...Object.values(environment)) as {
      fire(actor: RuntimeActor, x: number, z: number, interval: number, count: number): void;
      hit(shot: RuntimeShot, target: RuntimeActor): void;
      advance(dt: number): void;
    };
  return { ...functions, shots, fallen, impacts };
}

describe('hardcore policy reaches the actual main battle runtime', () => {
  it.each([1, 2, 3, 4, 8])('round %i spawns full strength and emits physical attacks every 0.23 seconds through the real bot/fire loop', number => {
    const round = roundAt(number);
    expect(round.participants.slice(1).map(participant => participant.difficulty)).toEqual(['normal', 'normal', 'normal']);
    const actors = actorsFrom(round), self = actors[1], runtime = mainRuntime(round, actors);
    expect(self.bot!.difficulty).toBe('normal');
    const before = ledger(contents(actors)), bodyBefore = self.structure.pieces.size, times: number[] = [];
    for (let frame = 0; frame < 60; frame++) {
      const count = runtime.shots.length;
      runtime.advance(1 / 60);
      if (runtime.shots.length > count) times.push((frame + 1) / 60);
    }
    expect(times.length).toBeGreaterThanOrEqual(4);
    expect(self.shotsFired).toBe(times.length);
    for (let index = 1; index < times.length; index++) {
      expect(times[index] - times[index - 1]).toBeGreaterThanOrEqual(CONFIG.shotInterval);
      expect(times[index] - times[index - 1]).toBeLessThan(CONFIG.shotInterval + 1 / 60 + 1e-6);
    }
    expect(runtime.shots.every(shot => shot.ownerId === self.id && shot.damage === shot.pieces.length)).toBe(true);
    expect(runtime.shots.every(shot => shot.pieces.length > 0 && shot.pieces.length <= 20)).toBe(true);
    expect(self.structure.pieces.size).toBe(bodyBefore);
    const all = [...contents(actors), ...runtime.shots.flatMap(shot => shot.pieces)];
    expect(new Set(all.map(piece => piece.id)).size).toBe(all.length);
    expect(ledger(all)).toEqual(before);
    // A second caller cannot bypass the actual runtime's guard or consume parts
    // while the last legitimate shot's cooldown remains active.
    const shotsBefore = runtime.shots.length, inventoryBefore = ledger(contents(actors));
    runtime.fire(self, 30, 0, CONFIG.shotInterval / 10, 20);
    expect(runtime.shots).toHaveLength(shotsBefore); expect(ledger(contents(actors))).toEqual(inventoryBefore);
  });

  it('a real emitted volley damages hostile armour and transfers exactly its lost parts to debris', () => {
    const round = roundAt(1), actors = actorsFrom(round), runtime = mainRuntime(round, actors), target = actors[0];
    const before = ledger(contents(actors)), targetBefore = target.structure.pieces.size;
    runtime.advance(1 / 60);
    expect(runtime.shots).toHaveLength(1);
    runtime.hit(runtime.shots[0], target);
    expect(target.structure.pieces.size).toBeLessThan(targetBefore);
    expect(runtime.fallen).toHaveLength(targetBefore - target.structure.pieces.size);
    expect(runtime.impacts).toEqual([target.id]);
    expect(ledger([...contents(actors), ...runtime.fallen, ...runtime.shots.flatMap(shot => shot.pieces)])).toEqual(before);
  });

  it.each([2, 3, 4])('round %i actual hit guard protects the allied structure, Core and reserve before recording damage', number => {
    const round = roundAt(number), actors = actorsFrom(round), self = actors[1];
    const allyPart = round.participants[2];
    const ally = { ...actors[0], id: allyPart.id, structure: allyPart.structure, x: 12 };
    const runtime = mainRuntime(round, [...actors, ally]);
    runtime.advance(1 / 60);
    expect(runtime.shots).toHaveLength(1);
    const before = JSON.stringify(ally.structure), stock = ledger(contents([ally]));
    runtime.hit(runtime.shots[0], ally); runtime.hit(runtime.shots[0], self);
    expect(JSON.stringify(ally.structure)).toBe(before); expect(ledger(contents([ally]))).toEqual(stock);
    expect(runtime.fallen).toHaveLength(0); expect(runtime.impacts).toHaveLength(0);
    expect(ally.structure.pieces.has(ally.structure.coreId)).toBe(true);
  });
});

describe('hardcore aim and adaptive physical pressure', () => {
  it.each(BOT_STYLES)('%s solves a reachable fast lateral intercept past the old lead clamp', style => {
    const round = roundAt(1), [target, self] = actorsFrom(round);
    self.x = -34; self.z = 0; target.x = 34; target.z = -10; target.vx = 0; target.vz = 48;
    const action = thinkBattleBot(createBot(style, random), self, [target], [], [], [], 1 / 60, 0, random, order(1));
    const flight = Math.hypot(action.aimX - self.x, action.aimZ - self.z) / CONFIG.projectileSpeed;
    expect(flight).toBeGreaterThan(1.3);
    expect(action.aimX).toBeCloseTo(target.x + target.vx * flight, 8);
    expect(action.aimZ).toBeCloseTo(target.z + target.vz * flight, 8);
    expect(Math.abs(action.aimX)).toBeLessThan(CONFIG.arenaWidth / 2);
    expect(Math.abs(action.aimZ)).toBeLessThan(CONFIG.arenaDepth / 2);
  });

  it('solves the linear equal-speed closing intercept without a fallback guess', () => {
    const [target, self] = actorsFrom(roundAt(1));
    self.x = 0; target.x = 30; target.vx = -CONFIG.projectileSpeed;
    const action = thinkBattleBot(createBot('sniper', random), self, [target], [], [], [], 1 / 60, 0);
    expect(action.aimX).toBeCloseTo(15, 8); expect(action.aimZ).toBeCloseTo(0, 8);
  });

  it('intercepts the real clamped target path when its x velocity reaches the arena edge before impact', () => {
    const [target, self] = actorsFrom(roundAt(1));
    self.x = -20; self.z = -15; target.x = 50; target.z = 20; target.vx = 40; target.vz = 8;
    const action = thinkBattleBot(createBot('balanced', random), self, [target], [], [], [], 1 / 60, 0);
    const flight = Math.hypot(action.aimX - self.x, action.aimZ - self.z) / CONFIG.projectileSpeed;
    const edge = CONFIG.arenaWidth / 2 - target.radius;
    expect(flight).toBeGreaterThan((edge - target.x) / target.vx);
    expect(action.aimX).toBeCloseTo(edge, 8);
    expect(action.aimZ).toBeCloseTo(target.z + target.vz * flight, 8);
  });

  it('reduces a narrow fast target batch even with plentiful stock and reserves only the real finishing mass', () => {
    const [target, self] = actorsFrom(roundAt(1));
    target.x = 30;
    const pressure = thinkBattleBot(createBot('balanced', random), self, [target], [], [], [], 1 / 60, 0);
    const moving = { ...target, radius: 0.6, vx: 0, vz: 45 };
    const uncertain = thinkBattleBot(createBot('balanced', random), self, [moving], [], [], [], 1 / 60, 0);
    expect(uncertain.shotCount).toBeGreaterThan(0);
    expect(uncertain.shotCount).toBeLessThan(pressure.shotCount);
    expect(uncertain.shotCount).toBeLessThan(20);
    damageStructure(target.structure, target.structure.pieces.size, random);
    expect(target.structure.pieces.size).toBe(1);
    const finish = thinkBattleBot(createBot('balanced', random), self, [target], [], [], [], 1 / 60, 0);
    expect(finish.intent).toBe('finish'); expect(finish.shotCount).toBe(1);
    const before = self.structure.pieces.size, stock = self.structure.evolution!.reserve.length;
    const ammunition = takeAmmunitionBatch(self.structure, finish.shotCount);
    expect(ammunition.map(part => part.source)).toEqual(['reserve']);
    expect(ammunition[0].piece.id).not.toBe(self.structure.coreId);
    expect(self.structure.pieces.size).toBe(before); expect(self.structure.evolution!.reserve).toHaveLength(stock - 1);
  });
});

describe('hardcore defence reacts to live geometry while a dodge is in progress', () => {
  it('changes an active dodge for a new crossing volley before the routine decision and improves real path clearance', () => {
    const [target, self] = actorsFrom(roundAt(1));
    self.x = 0; self.z = 0; self.dash!.cooldown = 1;
    const state = createBot('balanced', random);
    const first = { ownerId: 'player', x: 24, z: 0, vx: -64, vz: 0, radius: 1, damage: 10 };
    const initial = thinkBattleBot(state, self, [target], [], [first], [], 1 / 60, 0);
    expect(initial.dodging).toBe(true); expect(initial.z).toBeLessThan(-0.9);
    state.decision = 1;
    const cross = { ownerId: 'bot-3', x: 0, z: -24, vx: 0, vz: 64, radius: 1, damage: 20 };
    const action = thinkBattleBot(state, self, [target], [], [first, cross], [], 1 / 60, 1 / 60);
    expect(action.dodging).toBe(true);
    expect(Math.hypot(action.x - initial.x, action.z - initial.z)).toBeGreaterThan(0.5);
    const clearance = (direction: { x: number; z: number; speed: number }) => {
      const body = { x: 0, z: 0, vx: 0, vz: 0, radius: self.radius };
      let nearest = Infinity;
      for (let frame = 1; frame <= 36; frame++) {
        moveBody(body, direction.x, direction.z, direction.speed, 1 / 60);
        const time = frame / 60;
        for (const shot of [first, cross]) nearest = Math.min(nearest,
          Math.hypot(shot.x + shot.vx * time - body.x, shot.z + shot.vz * time - body.z) - body.radius - shot.radius);
      }
      return nearest;
    };
    expect(clearance(initial)).toBeLessThan(0);
    expect(clearance(action)).toBeGreaterThan(clearance(initial));
    expect(state.decision).toBeGreaterThan(0.9);
  });
});
