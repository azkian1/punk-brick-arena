import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { BOT_STYLES, BOT_NAVIGATION_WORK, createBot, thinkBattleBot, type BattleBotBody, type BotDifficulty } from './bots';
import type { BotSquadOrder } from './bot-squad';
import { CONFIG } from './config';
import { damageArenaBuilding, resolveArenaBuildings, segmentBuildingHit, type ArenaBuilding } from './arena';
import { takeAmmunitionBatch } from './ammunition';
import { connectedToCore, createStructure, damageStructure, getBounds } from './structure';
import { enableEvolution, evolutionPlan, evolutionProgress } from './evolution';
import { collectNearbyDrops, pickupRadiusForBounds, type PickupDrop } from './pickup';
import { createDash, moveDashingBody, startDash } from './movement';
import { debrisFloorY } from './debris';
import { clampDebrisToArena, createBuildingDebris, debrisRadius, findNearbyDebrisPosition, stepDebrisPhysics } from './debris-motion';
import { createPartProjectile, projectilePartOffsets, SHOT_PICKUP_LOCK, type PartProjectile } from './projectiles';
import { firstBattleImpact } from './battle-combat';
import type { Piece } from './types';

const random = () => 0.75;
const template = CHARACTER_TEMPLATES[0];
const sizeKey = (piece: Piece) => [piece.size.x, piece.size.y, piece.size.z].join(':');
const identity = (piece: Piece) => ({ id: piece.id, size: { ...piece.size }, color: piece.color, shape: piece.shape });
const inventory = (self: BattleBotBody) => [...self.structure.pieces.values(), ...self.structure.evolution!.reserve];
const ledger = (pieces: Piece[]) => pieces.map(identity).sort((a, b) => a.id.localeCompare(b.id));
const command = (role: BotSquadOrder['role'], round = 4): BotSquadOrder =>
  ({ role, round, targetId: 'player', flankSide: 1, allyIds: ['bot-2', 'bot-3'] });

interface MainActor extends BattleBotBody {
  cooldown: number; hurt: number; shotsFired: number; lastShotCount: number; desiredShotCount: number;
  boundsRevision: number; bounds: ReturnType<typeof getBounds>;
  view: { ring: { scale: { setScalar(value: number): void } } };
}
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
function section(from: string, to: string): string {
  const start = main.indexOf(from), end = main.indexOf(to, start);
  if (start < 0 || end <= start) throw new Error(`Missing main function: ${from}`);
  return main.slice(start, end);
}
function runtime<T>(code: string, environment: Record<string, unknown>, expression: string): T {
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(environment), `${compiled};return ${expression};`)(...Object.values(environment)) as T;
}
const refreshBounds = runtime<(actor: MainActor) => void>(section('function updateBounds(', 'function bot('),
  { getBounds, pickupRadiusForBounds, CONFIG }, 'updateBounds');
function actor(id = 'bot-1', x = 0, z = 0, stock = 40): MainActor {
  const structure = createStructure(template);
  enableEvolution(structure, template, 'mosher');
  const small = template.pieces.find(piece => piece.size.x === 1 && piece.size.y === 0.4 && piece.size.z === 1)!;
  structure.evolution!.reserve = Array.from({ length: stock }, (_, i) => ({ ...small, id: `${id}/stock-${i}`,
    position: { ...small.position }, size: { ...small.size } }));
  structure.evolution!.reserveRevision++;
  const self: MainActor = { id, x, z, vx: 0, vz: 0, radius: 0, pickupRadius: 0, structure, dash: createDash(),
    cooldown: 0, hurt: 0, shotsFired: 0, lastShotCount: 0, desiredShotCount: 0,
    boundsRevision: -1, bounds: getBounds(structure), view: { ring: { scale: { setScalar() {} } } } };
  refreshBounds(self);
  return self;
}
function usefulPiece(self: BattleBotBody, id = 'growth'): Piece {
  const state = self.structure.evolution!;
  const slot = state.plan.slots.find((piece, i) => i >= state.plan.headCount && !state.occupied[i]
    && Math.max(piece.size.x, piece.size.z) >= 6 && state.plan.neighbors[i].some(n => state.occupied[n]))!;
  return { ...slot, id, position: { x: 0, y: 0, z: 0 }, size: { ...slot.size }, color: '#88a078' };
}
function bankingPiece(self: BattleBotBody, id = 'raw'): Piece {
  const state = self.structure.evolution!;
  const reachable = new Set(state.plan.slots.filter((_, i) => !state.occupied[i]
    && state.plan.neighbors[i].some(n => state.occupied[n])).map(sizeKey));
  const part = template.pieces.find(piece => !reachable.has(sizeKey(piece)))!;
  return { ...part, id, position: { x: 0, y: 0, z: 0 }, size: { ...part.size } };
}
const drop = (piece: Piece, x: number, z: number): PickupDrop => ({ piece, x, z, ownerId: null, age: 2, settled: true });
function building(id: string, piece: Piece, x: number, z: number, count = 1): ArenaBuilding {
  const parts = Array.from({ length: count }, (_, i) => ({ ...piece, id: `${id}/${i}`,
    position: { x: (i - count / 2) * piece.size.x, y: 0, z: -piece.size.z / 2 }, size: { ...piece.size } }));
  const structure = createStructure({ ...template, pieces: parts, coreId: parts[0].id });
  return { id, x, z, structure, bounds: getBounds(structure), template: 'wall' };
}
function mixedBuilding(self: BattleBotBody): ArenaBuilding {
  const useful = usefulPiece(self, 'mixed/growth'), raw = bankingPiece(self);
  const pieces: Piece[] = [{ ...useful, position: { x: -useful.size.x / 2, y: 0, z: -useful.size.z / 2 } }];
  for (let i = 0; i < 31; i++) pieces.push({ ...raw, id: `mixed/raw-${i}`, size: { ...raw.size },
    position: { x: useful.size.x / 2 + i * raw.size.x, y: 0, z: -raw.size.z / 2 } });
  const structure = createStructure({ ...template, pieces, coreId: pieces.at(-1)!.id });
  return { id: 'mixed', x: 0, z: 25, structure, bounds: getBounds(structure), template: 'wall' };
}

describe('building a real evolution stays active during combat', () => {
  it('a coordinated rush grows from nearby loot, keeps pressure over a distant detour, and releases that cutoff for recovery', () => {
    const decide = (offset: number, recovering = false) => {
      const self = actor(), hostile = actor('player', 55, -10), state = createBot('balanced', random);
      const loot = drop(usefulPiece(self), 0, self.pickupRadius + offset);
      const before = ledger([...inventory(self), loot.piece]);
      const order = { ...command(recovering ? 'recover' : 'attacker'), rush: true };
      const action = thinkBattleBot(state, self, [hostile], [loot], [], [], 1 / 60, 0, random, order);
      expect(ledger([...inventory(self), loot.piece])).toEqual(before);
      return action;
    };
    const near = decide(10);
    expect(near.intent).toBe('collect'); expect(near.z).toBeGreaterThan(0.9);
    expect(near.targetId).toBe('player'); expect(near.fire).toBe(true);
    const far = decide(20);
    expect(far.intent).toBe('hunt'); expect(far.x).toBeGreaterThan(0.8);
    expect(far.targetId).toBe('player'); expect(far.fire).toBe(true);
    const recovery = decide(20, true);
    expect(recovery.intent).toBe('recover'); expect(recovery.z).toBeGreaterThan(0.9);
    expect(recovery.targetId).toBeNull(); expect(recovery.fire).toBe(false);
  });

  it.each(BOT_STYLES)('%s changes a prepared stocked attacker, independent and collector movement for useful growth while retaining hostile fire', style => {
    for (const role of ['attacker', 'independent', 'collector'] as const) {
      const self = actor(), hostile = actor('player', 42), state = createBot(style, random);
      const order = command(role, role === 'independent' ? 1 : 4);
      thinkBattleBot(state, self, [hostile], [], [], [], 6.1, 6.1, random, order);
      const loot = [drop(usefulPiece(self), 0, 24), drop(bankingPiece(self), -10, 0)];
      const before = ledger(inventory(self));
      const action = thinkBattleBot(state, self, [hostile], loot, [], [], 1 / 60, 6.2, random, order);
      expect(action.intent).toBe('collect');
      expect(action.z).toBeGreaterThan(0.9); expect(Math.abs(action.x)).toBeLessThan(0.1);
      expect(action.targetKind).toBe('actor'); expect(action.targetId).toBe(hostile.id);
      expect([action.aimX, action.aimZ]).toEqual([hostile.x, hostile.z]);
      expect(action.fire).toBe(true); expect(action.shotCount).toBeGreaterThan(0);
      expect(ledger(inventory(self))).toEqual(before);
    }
  });

  it.each(['attacker', 'independent', 'collector'] as const)('%s actually reaches physical construction loot and increases built armour instead of only banking raw stock', role => {
    const self = actor(), hostile = actor('player', 45, -15), state = createBot('balanced', random);
    const source = building('donor', usefulPiece(self, 'source'), -24, 16);
    const hit = damageArenaBuilding(source, 1, random);
    const ground = createBuildingDebris(source, [...hit.direct, ...hit.cascade], [], random);
    for (let frame = 0; frame < 180 && ground.some(item => !item.settled); frame++) {
      stepDebrisPhysics(ground, [], 1 / 60);
      for (const item of ground) item.age += 1 / 60;
    }
    expect(ground.every(item => item.settled)).toBe(true);
    const originalPart = identity(ground[0].piece), before = ledger([...inventory(self), ...ground.map(item => item.piece)]);
    const built = evolutionProgress(self.structure)!.built, reserve = self.structure.evolution!.reserve.length;
    const order = command(role, role === 'independent' ? 1 : 4);
    let firingWhileTravelling = 0;
    for (let frame = 0; frame < 360 && ground.length; frame++) {
      for (const item of ground) item.age += 1 / 60;
      stepDebrisPhysics(ground, [], 1 / 60);
      const action = thinkBattleBot(state, self, [hostile], ground, [], [], 1 / 60, 8 + frame / 60, random, order);
      if (action.intent === 'collect' && action.fire) firingWhileTravelling++;
      if (action.dash) startDash(self.dash!, action.x, action.z, action.aimX - self.x, action.aimZ - self.z);
      moveDashingBody(self, self.dash!, action.x, action.z, action.speed, 1 / 60);
      collectNearbyDrops(ground, [self], random);
      refreshBounds(self);
    }
    expect(ground).toHaveLength(0); expect(firingWhileTravelling).toBeGreaterThan(0);
    expect(evolutionProgress(self.structure)!.built).toBe(built + 1);
    expect(self.structure.evolution!.reserve).toHaveLength(reserve);
    expect(identity(self.structure.pieces.get(originalPart.id)!)).toEqual(originalPart);
    expect(connectedToCore(self.structure).size).toBe(self.structure.pieces.size);
    expect(ledger(inventory(self))).toEqual(before);
  });

  it('ignores nearer owned, firing-locked and airborne useful parts while aiming at a hostile rather than an ally', () => {
    const self = actor(), hostile = actor('player', 42), ally = actor('bot-2', 10);
    const desired = usefulPiece(self), eligible = drop({ ...desired, id: 'eligible' }, 0, 24);
    const unavailable = [
      { ...drop({ ...desired, id: 'owned' }, -12, 0), ownerId: self.id, age: 1 },
      { ...drop({ ...desired, id: 'fired' }, -13, 0), lockedUntilAge: 5, age: 4.9 },
      { ...drop({ ...desired, id: 'airborne' }, -14, 0), settled: false },
    ];
    // main supplies only hostiles as opponents and passes all live shots.
    const action = thinkBattleBot(createBot('balanced', random), self, [hostile], [...unavailable, eligible],
      [{ ownerId: ally.id, x: 24, z: 0, vx: -64, vz: 0, damage: 20 }], [], 1 / 60, 8, random, command('attacker'));
    expect(action.intent).toBe('collect'); expect(action.z).toBeGreaterThan(0.9);
    expect(action.targetId).toBe(hostile.id); expect(action.fire).toBe(true); expect(action.dodging).toBe(false);
  });

  it('a finish, recovery swap and imminent hostile volley retain priority over optional growth', () => {
    const self = actor(), hostile = actor('player', 20), useful = [drop(usefulPiece(self), 0, 24)];
    damageStructure(hostile.structure, hostile.structure.pieces.size, random);
    const finishing = thinkBattleBot(createBot('balanced', random), self, [hostile], useful, [], [], 1 / 60, 8, random, command('attacker'));
    expect(finishing.intent).toBe('finish'); expect(finishing.fire).toBe(true); expect(finishing.shotCount).toBe(1);
    const recovering = thinkBattleBot(createBot('balanced', random), self, [hostile], useful, [], [], 1 / 60, 8, random, command('recover'));
    expect(recovering.intent).toBe('recover'); expect(recovering.fire).toBe(false); expect(recovering.targetKind).toBeNull();
    expect(recovering.z).toBeGreaterThan(0.9);
    const threatened = thinkBattleBot(createBot('balanced', random), self, [actor('player', 42)], useful,
      [{ ownerId: 'player', x: 12, z: 0, vx: -64, vz: 0, damage: 20, radius: 1 }], [], 1 / 60, 8, random, command('attacker'));
    expect(threatened.intent).toBe('evade'); expect(threatened.dodging).toBe(true);
  });

  it('bounds a healthy attacker growth detour while the actual main fire loop keeps fast physical pressure', () => {
    const self = actor('bot-1', 0, 0, 600), hostile = actor('player', 45), state = createBot('balanced', random);
    const ground = [drop(usefulPiece(self, 'detour-growth'), 0, 28)], shots: PartProjectile[] = [];
    const before = ledger([...inventory(self), ...inventory(hostile), ...ground.map(item => item.piece)]);
    const cooldowns = main.match(/for \(const a of actors\) \{ a\.cooldown -= dt;[^\n]*\}/)![0];
    const functions = runtime<{
      fire(actor: MainActor, x: number, z: number, interval: number, count: number): void;
      advanceCooldowns(dt: number): void;
    }>(section('function fire(actor:', 'function burst(') + section('function updateBounds(', 'function bot(')
      + `function advanceCooldowns(dt: number) { ${cooldowns} }`, {
      CONFIG, takeAmmunitionBatch, createPartProjectile, shots, actors: [self], shotCount: 1,
      alive: (body: MainActor) => body.structure.pieces.has(body.structure.coreId),
      createPieceProjectile: () => ({ position: { set() {} } }), renderer: { scene: { add() {} } },
      sound: { play() {} }, stats: { shots: 0 }, getBounds, pickupRadiusForBounds,
    }, '{ fire, advanceCooldowns }');
    let detourStart = Infinity, pressureReturned = Infinity;
    const times: number[] = [];
    // Hold the body still to model a jammed detour. Intent, real ammunition and
    // the main cooldown must progress without assuming commanded movement ran.
    for (let frame = 0; frame < 360; frame++) {
      const time = 8 + frame / 60;
      functions.advanceCooldowns(1 / 60);
      const action = thinkBattleBot(state, self, [hostile], ground, [], [], 1 / 60, time, random, command('attacker'));
      if (action.intent === 'collect') detourStart = Math.min(detourStart, time);
      if (Number.isFinite(detourStart) && action.intent === 'hunt') pressureReturned = Math.min(pressureReturned, time);
      if (!action.fire) continue;
      expect(action.targetId).toBe(hostile.id); expect(action.shotInterval).toBe(CONFIG.shotInterval);
      const count = shots.length;
      functions.fire(self, action.aimX, action.aimZ, action.shotInterval, action.shotCount);
      if (shots.length > count) times.push(time);
    }
    expect(detourStart).toBe(8);
    expect(pressureReturned - detourStart).toBeGreaterThan(0);
    expect(pressureReturned - detourStart).toBeLessThanOrEqual(3.5 + 1 / 60 + 1e-6);
    expect(times.length).toBeGreaterThanOrEqual(20);
    for (let index = 1; index < times.length; index++) {
      expect(times[index] - times[index - 1]).toBeGreaterThanOrEqual(CONFIG.shotInterval);
      expect(times[index] - times[index - 1]).toBeLessThan(CONFIG.shotInterval + 1 / 60 + 1e-6);
    }
    expect(ground).toHaveLength(1); expect(self.structure.pieces.has(self.structure.coreId)).toBe(true);
    expect(ledger([...inventory(self), ...inventory(hostile), ...ground.map(item => item.piece),
      ...shots.flatMap(shot => shot.pieces)])).toEqual(before);
  });

  it('progresses past more than 76 inaccessible compatible drops and revisits them when real blocking cover is removed', () => {
    const self = actor('bot-1', -35), hostile = actor('player', -70), state = createBot('balanced', random);
    const growth = usefulPiece(self), barrier = (id: string, x: number, z: number, sx: number, sz: number) => {
      const part = { ...growth, id: `${id}/wall`, size: { x: sx, y: 1.2, z: sz } };
      return building(id, part, x, z);
    };
    const walls = [barrier('solid', 0, 0, 80, 80)];
    const inaccessible = Array.from({ length: 85 }, (_, i) => drop({ ...growth, id: `enclosed/${i}` }, 0, i / 1000));
    const reachable = drop({ ...growth, id: 'reachable' }, -35, 55), all = [...inaccessible, reachable];
    let selected = false; const actions: unknown[] = [];
    for (let scan = 0; scan < 12; scan++) {
      const action = thinkBattleBot(state, self, [hostile], all, [], walls, 0.31, 8 + scan * 0.31, random, command('attacker'));
      actions.push({ intent: action.intent, x: action.x, z: action.z, radius: self.radius, pickup: self.pickupRadius,
        loot: state.battle?.lootId, goal: state.battle?.goal });
      if (action.intent === 'collect' && action.z > 0.9 && Math.abs(action.x) < 0.1) { selected = true; break; }
    }
    expect(selected, JSON.stringify(actions)).toBe(true);
    for (const wall of walls) { wall.structure.pieces.clear(); wall.structure.revision++; }
    const opened = thinkBattleBot(state, self, [hostile], all, [], walls, 0.31, 100, random, command('attacker'));
    expect(opened.intent).toBe('collect'); expect(opened.x).toBeGreaterThan(0.9); expect(Math.abs(opened.z)).toBeLessThan(0.1);
  });

  it('defers an unreachable enclosure and selects reachable growth while real hostile volleys keep changing inventory', () => {
    const self = actor('bot-1', -40, 0, 600), hostile = actor('player', -70), state = createBot('balanced', random);
    const growth = usefulPiece(self), barrier = (id: string, x: number, z: number, sx: number, sz: number) =>
      building(id, { ...growth, size: { x: sx, y: 1.2, z: sz } }, x, z);
    const walls = [barrier('left', -20, 0, 2, 80), barrier('right', 20, 0, 2, 80),
      barrier('top', 0, -20, 80, 2), barrier('bottom', 0, 20, 80, 2)];
    const ground = [drop({ ...growth, id: 'unreachable' }, 0, 0), drop({ ...growth, id: 'reachable' }, -40, 55)];
    const original = ledger([...inventory(self), ...ground.map(item => item.piece)]), shots: PartProjectile[] = [];
    let cooldown = 0, selected = false, shotsBeforeSelection = 0;
    for (let frame = 0; frame < 360; frame++) {
      cooldown -= 1 / 60;
      const action = thinkBattleBot(state, self, [hostile], ground, [], walls, 1 / 60, 8 + frame / 60, random, command('attacker'));
      if (frame === 0) { expect(action.intent).toBe('collect'); expect(state.battle!.lootId).toBe('unreachable'); }
      if (state.battle!.lootId === 'reachable') { selected = true; shotsBeforeSelection = shots.length; break; }
      const previous = { x: self.x, z: self.z };
      moveDashingBody(self, self.dash!, action.x, action.z, action.speed, 1 / 60); resolveArenaBuildings(self, walls, previous);
      if (action.fire && cooldown <= 0) {
        expect(action.targetId).toBe(hostile.id);
        const ammunition = takeAmmunitionBatch(self.structure, action.shotCount);
        expect(ammunition.length).toBeGreaterThan(0);
        shots.push(createPartProjectile(ammunition.map(item => item.piece), self.id, self.x, self.z, action.aimX, action.aimZ));
        cooldown = Math.max(CONFIG.shotInterval, action.shotInterval); refreshBounds(self);
      }
    }
    expect(selected).toBe(true); expect(shotsBeforeSelection).toBeGreaterThanOrEqual(4);
    expect(ledger([...inventory(self), ...ground.map(item => item.piece), ...shots.flatMap(shot => shot.pieces)])).toEqual(original);
  });

  it('a complete healthy stocked form avoids optional floor ranking and growth-only buildings', () => {
    const self = actor(), plan = evolutionPlan(template, 'mosher', 2), state = self.structure.evolution!;
    self.structure.pieces = createStructure({ ...template, pieces: plan.slots }).pieces;
    state.occupied = plan.slots.map(piece => piece.id); state.everBuilt = new Set(plan.slots.map((_, i) => i));
    self.structure.roundStartPieces = self.structure.pieces.size; self.structure.revision++;
    // Keep this decision fixture near the ordinary combat radius; geometry and
    // conservation for full forms are covered by the evolution integration tests.
    let reads = 0;
    const useless = bankingPiece(self), ground = Array.from({ length: 1000 }, (_, i) => ({ ...drop(useless, 0, 24),
      get piece() { reads++; return { ...useless, id: `irrelevant/${i}` }; } }));
    const action = thinkBattleBot(createBot('balanced', random), self, [actor('player', 35)], ground, [],
      [building('optional', useless, -25, 0)], 1 / 60, 8, random, command('attacker'));
    expect(action.intent).toBe('hunt'); expect(action.targetKind).toBe('actor'); expect(action.fire).toBe(true);
    expect(reads).toBe(0);
  });

  it('a stocked body at the real piece cap avoids farming growth it cannot attach', () => {
    const self = actor(), state = self.structure.evolution!, small = self.structure.evolution!.reserve[0];
    const growth = usefulPiece(self);
    // Add a connected, native-size layer under the head. The live Map reaches
    // the actual cap; pickup and decision code see the same real inventory.
    const floor = Math.min(...Array.from(self.structure.pieces.values(), piece => piece.position.y));
    for (let i = 0; self.structure.pieces.size < CONFIG.maxPieces; i++) {
      const part = { ...small, id: `capped/${i}`, size: { ...small.size },
        position: { x: -64 + i % 128, y: floor - small.size.y, z: -64 + Math.floor(i / 128) } };
      self.structure.pieces.set(part.id, part);
    }
    self.structure.roundStartPieces = self.structure.pieces.size; self.structure.revision++;
    const before = self.structure.pieces.size;
    const action = thinkBattleBot(createBot('balanced', random), self, [actor('player', 35)],
      [drop(growth, 0, 24)], [], [building('optional-growth', growth, -25, 0, 3)], 1 / 60, 8, random, command('attacker'));
    expect(action.intent).toBe('hunt'); expect(action.targetKind).toBe('actor'); expect(action.fire).toBe(true);
    expect(self.structure.pieces.size).toBe(before); expect(state.reserve).toHaveLength(40);
  });
});

describe('useful harvesting approaches real resources and uses the main firing cooldown', () => {
  it.each([false, true])('finishes a bounded fragmented-cover detour with safe pending movement (radius/goal change: %s)', revise => {
    const self = actor('bot-1', -20, 0, 40), state = createBot('balanced', random);
    self.radius = 2.2; self.pickupRadius = 3;
    const part = bankingPiece(self), pieces = Array.from({ length: 60 }, (_, i) => ({ ...part, id: `comb/${i}`,
      size: { x: 2, y: 1.2, z: 2 }, position: { x: -1, y: 0, z: (i - 30) * 4 } }));
    const structure = createStructure({ ...template, pieces, coreId: pieces[0].id });
    const cover: ArenaBuilding = { id: 'comb', template: 'wall', x: 0, z: 0, structure, bounds: getBounds(structure) };
    const loot = drop(usefulPiece(self), 20, 0), ground = [loot], before = ledger(inventory(self));
    let pending = 0, completed = false;
    for (let frame = 0; frame < 1000; frame++) {
      if (revise && frame === 1) { self.radius = 2.4; loot.x = 25; }
      const action = thinkBattleBot(state, self, [], ground, [], [cover], 1 / 60, frame / 60, random, command('recover'));
      expect(state.battle!.navigationWork).toBeLessThanOrEqual(BOT_NAVIGATION_WORK);
      if (state.battle!.routeSearch) {
        pending++;
        expect(state.battle!.routeFailed).toBe(false);
        const step = state.battle!.route.length ? action.speed / 60 : 1.5;
        expect(segmentBuildingHit(self.x, self.z, self.x + action.x * step, self.z + action.z * step, cover, self.radius - .02)).toBeNull();
      }
      const previous = { x: self.x, z: self.z };
      moveDashingBody(self, self.dash!, action.x, action.z, action.speed, 1 / 60);
      resolveArenaBuildings(self, [cover], previous);
      expect(segmentBuildingHit(self.x, self.z, self.x, self.z, cover, self.radius - 1e-5)).toBeNull();
      if (Math.hypot(self.x - loot.x, self.z - loot.z) < self.pickupRadius) { completed = true; break; }
    }
    expect(pending).toBeGreaterThan(0); expect(completed).toBe(true);
    expect(ledger(inventory(self))).toEqual(before);
  });
  it('continuous evasion consumes the same optional harvesting window as quiet decisions', () => {
    const run = (incoming: boolean, mandatory = false) => {
      const self = actor('bot-3', 0, 0, 200); self.radius = 3.3; self.pickupRadius = 7; self.dash!.cooldown = 100;
      const hostile = actor('player', 75), state = createBot('balanced', random);
      const evolution = self.structure.evolution!;
      const part = evolution.plan.slots.find((_, i) => !evolution.occupied[i] && evolution.plan.neighbors[i].some(n => evolution.occupied[n]))!;
      const pieces = Array.from({ length: 200 }, (_, i) => ({ ...part, id: `wall/${i}`, size: { ...part.size },
        position: { x: (i % 20 - 10) * part.size.x, y: 0, z: Math.floor(i / 20) * part.size.z } }));
      const structure = createStructure({ ...template, pieces, coreId: pieces[0].id });
      const cover: ArenaBuilding = { id: 'wall', template: 'wall', x: 0, z: 20, structure, bounds: getBounds(structure) };
      let buildingDecisions = 0, dodges = 0, pressureDecisions = 0;
      for (let frame = 0; frame < 480; frame++) {
        const threats = incoming ? [{ ownerId: 'player', x: 24, z: 0, vx: -64, vz: 0, radius: 1, damage: 10 }] : [];
        const action = thinkBattleBot(state, self, [hostile], [], threats, [cover], 1 / 60, frame / 60, random,
          command(mandatory ? 'recover' : 'collector'));
        if (action.fire && action.targetKind === 'building') buildingDecisions++;
        if (action.dodging) dodges++;
        if (frame > 312 && frame < 444 && action.targetKind !== 'building') pressureDecisions++;
        // Productive cover revisions isolate the time guard from stall deferral;
        // these are decisions, not invented firing events or a native fire rate.
        structure.revision++;
      }
      return { buildingDecisions, dodges, pressureDecisions };
    };
    const quiet = run(false), underFire = run(true), recovery = run(true, true);
    expect(quiet.buildingDecisions).toBeGreaterThan(250); expect(quiet.buildingDecisions).toBeLessThan(360);
    expect(underFire.buildingDecisions).toBeLessThanOrEqual(quiet.buildingDecisions + 1);
    expect(underFire.pressureDecisions).toBeGreaterThan(100); expect(underFire.dodges).toBeGreaterThan(400);
    expect(recovery.buildingDecisions).toBe(480);
  });
  it('moves toward an out-of-range useful building while firing at a visible hostile in another direction', () => {
    const self = actor(), hostile = actor('player', 35), cover = building('distant-growth', usefulPiece(self), 0, 65, 3);
    const action = thinkBattleBot(createBot('balanced', random), self, [hostile], [], [], [cover], 1 / 60, 8, random, command('attacker'));
    expect(action.intent).toBe('harvest'); expect(action.z).toBeGreaterThan(0.9); expect(Math.abs(action.x)).toBeLessThan(0.1);
    expect(action.targetKind).toBe('actor'); expect(action.targetId).toBe(hostile.id); expect(action.fire).toBe(true);
    expect([action.aimX, action.aimZ]).toEqual([hostile.x, hostile.z]);
    const recovery = thinkBattleBot(createBot('balanced', random), self, [hostile], [], [], [cover], 1 / 60, 8, random, command('recover'));
    expect(recovery.intent).toBe('recover'); expect(recovery.targetKind).toBe('building'); expect(recovery.fire).toBe(false);
    expect(recovery.z).toBeGreaterThan(0.9);
  });

  it('stocked mining targets and physically collects a rare compatible frontier part among 31 raw parts; body-only mining rejects that poor trade', () => {
    const self = actor(), cover = mixedBuilding(self), state = createBot('balanced', random);
    expect(connectedToCore(cover.structure).size).toBe(32);
    const action = thinkBattleBot(state, self, [], [], [], [cover], 1 / 60, 8, random, command('independent', 1));
    expect(action.intent).toBe('harvest'); expect(action.targetId).toBe(cover.id); expect(action.fire).toBe(true);
    expect(action.shotInterval).toBe(CONFIG.shotInterval); expect(action.shotCount).toBe(1);
    expect([action.aimX, action.aimZ]).toEqual([0, 25]);
    const armourOnly = actor('body-only', 0, 0, 0), poor = thinkBattleBot(createBot('balanced', random), armourOnly,
      [], [], [], [mixedBuilding(armourOnly)], 1 / 60, 8, random, command('independent', 1));
    expect(poor.targetKind).not.toBe('building'); expect(poor.fire).toBe(false);
    const original = ledger([...inventory(self), ...cover.structure.pieces.values()]);
    const before = evolutionProgress(self.structure)!.built;
    const ammunition = takeAmmunitionBatch(self.structure, action.shotCount);
    const shot = createPartProjectile(ammunition.map(item => item.piece), self.id, self.x, self.z, action.aimX, action.aimZ);
    const impact = firstBattleImpact(shot, action.aimX, action.aimZ, [], [cover])!;
    expect(impact.kind).toBe('building');
    shot.x += (action.aimX - shot.x) * impact.fraction; shot.z += (action.aimZ - shot.z) * impact.fraction;
    const hit = damageArenaBuilding(cover, shot.damage, random, { x: shot.x, z: shot.z });
    const fallen = [...hit.direct, ...hit.cascade]; expect(fallen.some(part => part.id === 'mixed/growth')).toBe(true);
    const ground = createBuildingDebris(cover, fallen, [cover], random);
    for (let frame = 0; frame < 240 && ground.some(item => !item.settled); frame++) {
      stepDebrisPhysics(ground, [cover], 1 / 60); for (const item of ground) item.age += 1 / 60;
    }
    expect(ground.every(item => item.settled)).toBe(true);
    for (let frame = 0; frame < 360 && ground.length; frame++) {
      for (const item of ground) item.age += 1 / 60;
      stepDebrisPhysics(ground, [cover], 1 / 60);
      const next = thinkBattleBot(state, self, [], ground, [], [cover], 1 / 60, 9 + frame / 60, random, command('independent', 1));
      const previous = { x: self.x, z: self.z };
      moveDashingBody(self, self.dash!, next.x, next.z, next.speed, 1 / 60);
      resolveArenaBuildings(self, [cover], previous); collectNearbyDrops(ground, [self], random); refreshBounds(self);
    }
    expect(ground).toHaveLength(0); expect(evolutionProgress(self.structure)!.built).toBe(before + 1);
    expect(self.structure.pieces.has('mixed/growth')).toBe(true);
    expect(ledger([...inventory(self), ...cover.structure.pieces.values(), ...shot.pieces])).toEqual(original);
  });

  it.each(['easy', 'medium', 'normal'] as BotDifficulty[])('%s selects useful farther construction and actually closes into pickup reach', difficulty => {
    const self = actor(), state = createBot('balanced', random, difficulty);
    const useful = building('useful', usefulPiece(self), 0, 25, 3), raw = building('raw', bankingPiece(self), -10, 0);
    const start = Math.hypot(useful.x - self.x, useful.z - self.z);
    let action = thinkBattleBot(state, self, [], [], [], [raw, useful], 1 / 60, 8, random, command('independent', 1));
    expect(action.intent).toBe('harvest'); expect(action.targetId).toBe(useful.id);
    expect(action.fire).toBe(true); expect(action.shotInterval).toBe(CONFIG.shotInterval);
    for (let frame = 0; frame < 240; frame++) {
      action = thinkBattleBot(state, self, [], [], [], [raw, useful], 1 / 60, 8 + frame / 60, random, command('independent', 1));
      const previous = { x: self.x, z: self.z };
      moveDashingBody(self, self.dash!, action.x, action.z, action.speed, 1 / 60);
      resolveArenaBuildings(self, [raw, useful], previous);
    }
    expect(Math.hypot(useful.x - self.x, useful.z - self.z)).toBeLessThan(start - 10);
    expect(Math.hypot(action.aimX - self.x, action.aimZ - self.z)).toBeLessThanOrEqual(self.pickupRadius + 0.5);
    expect(segmentBuildingHit(self.x, self.z, self.x, self.z, useful, self.radius - 1e-5)).toBeNull();
  });

  it.each([0, 40])('real main fire/hit/drop code keeps 0.23-second mining cadence with %i stocked parts and conserves every ID', stock => {
    const self = actor('bot-1', 0, 0, stock), state = createBot('balanced', random, 'easy');
    const cover = building('mine', usefulPiece(self), 0, 25, 24), buildings = [cover];
    const shots: PartProjectile[] = [], drops: (PickupDrop & { y: number })[] = [];
    const original = ledger([...inventory(self), ...cover.structure.pieces.values()]);
    const cooldowns = main.match(/for \(const a of actors\) \{ a\.cooldown -= dt;[^\n]*\}/)![0];
    const functions = runtime<{
      fire(actor: MainActor, x: number, z: number, interval: number, count: number): void;
      hitBuilding(shot: PartProjectile, building: ArenaBuilding): void;
      projectileDrops(shot: PartProjectile): typeof drops;
      advanceCooldowns(dt: number): void;
    }>(section('function fire(actor:', 'function burst(') + section('function hitBuilding(', 'function pointerAim(')
      + section('function projectileDrops(', 'function eliminate(') + section('function updateBounds(', 'function bot(')
      + `function advanceCooldowns(dt: number) { ${cooldowns} }`, {
      CONFIG, takeAmmunitionBatch, createPartProjectile, shots, drops, buildings, actors: [self], shotCount: 1,
      alive: (body: MainActor) => body.structure.pieces.has(body.structure.coreId),
      createPieceProjectile: () => ({ position: { set() {} } }), renderer: { scene: { add() {} } },
      sound: { play() {} }, stats: { shots: 0, hits: 0, direct: 0, cascade: 0 }, recordImpact() {}, burst() {},
      damageArenaBuilding, createBuildingDebris, getBounds, pickupRadiusForBounds, projectilePartOffsets,
      clampDebrisToArena, findNearbyDebrisPosition, debrisRadius, debrisFloorY, SHOT_PICKUP_LOCK,
    }, '{ fire, hitBuilding, projectileDrops, advanceCooldowns }');
    const times: number[] = [];
    for (let frame = 0; frame < 60; frame++) {
      functions.advanceCooldowns(1 / 60);
      const action = thinkBattleBot(state, self, [], [], [], buildings, 1 / 60, 8 + frame / 60, random, command('independent', 1));
      if (action.targetKind === 'building') expect(action.shotInterval).toBe(CONFIG.shotInterval);
      if (!action.fire) continue;
      const before = shots.length;
      functions.fire(self, action.aimX, action.aimZ, action.shotInterval, action.shotCount);
      if (shots.length === before) continue;
      expect(action.shotCount).toBeLessThanOrEqual(4);
      const shot = shots.pop()!, impact = firstBattleImpact(shot, action.aimX, action.aimZ, [], buildings)!;
      expect(impact.kind).toBe('building');
      shot.x += (action.aimX - shot.x) * impact.fraction; shot.z += (action.aimZ - shot.z) * impact.fraction;
      functions.hitBuilding(shot, cover); drops.push(...functions.projectileDrops(shot));
      times.push(frame / 60);
    }
    expect(times.length).toBeGreaterThanOrEqual(4); expect(self.shotsFired).toBe(times.length);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(CONFIG.shotInterval);
      expect(times[i] - times[i - 1]).toBeLessThan(CONFIG.shotInterval + 1 / 60 + 1e-6);
    }
    expect(drops.some(item => item.piece.id.startsWith('mine/'))).toBe(true);
    expect(drops.filter(item => item.ownerId === self.id).every(item => item.lockedUntilAge === 5)).toBe(true);
    expect(self.structure.pieces.has(self.structure.coreId)).toBe(true);
    const all = [...inventory(self), ...cover.structure.pieces.values(), ...drops.map(item => item.piece)];
    expect(new Set(all.map(piece => piece.id)).size).toBe(all.length); expect(ledger(all)).toEqual(original);
  });
});
