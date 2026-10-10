import { describe, expect, it } from 'vitest';
import { areBattleAllies, battleTeamId, coordinateBotSquad, createBotSquad,
  type BotSquadActor, type BotSquadOrder } from './bot-squad';
import { attachPiece, connectedToCore, createStructure, detachAmmunitionPiece } from './structure';
import type { Piece } from './types';

const ids = ['player', 'bot-1', 'bot-2', 'bot-3'];
const part = (id: string, index: number): Piece => ({
  id, position: { x: index, y: 0, z: 0 }, size: { x: 1, y: 1.2, z: 1 },
  color: '#7652a1', shape: 'brick',
});
function actor(id: string, x = 0, z = 0, count = 100): BotSquadActor {
  const pieces = Array.from({ length: count }, (_, index) => part(`${id}/${index}`, index));
  return { id, x, z, structure: createStructure({ id, name: id, subtitle: '', accent: '#7652a1',
    coreId: pieces[0].id, pieces, source: 'squad-test' }) };
}
const roster = () => [actor('player', 12), actor('bot-1', -10), actor('bot-2', 10), actor('bot-3', 30)];
function removeTo(body: BotSquadActor, count: number): Piece[] {
  const removed: Piece[] = [];
  while (body.structure.pieces.size > count) {
    const ammunition = detachAmmunitionPiece(body.structure);
    expect(ammunition).not.toBeNull();
    removed.push(ammunition!);
  }
  return removed;
}
function restoreTo(body: BotSquadActor, count: number, removed: Piece[]): void {
  while (body.structure.pieces.size < count) {
    const piece = removed.pop();
    expect(piece).toBeDefined();
    expect(attachPiece(body.structure, piece!, () => 0)).not.toBeNull();
  }
}
function giveStock(body: BotSquadActor, count: number): void {
  const structure = body.structure;
  structure.evolution = { id: 'mosher', stage: 2,
    template: { id: 'fixture', name: '', subtitle: '', accent: '', coreId: structure.coreId, pieces: [], source: '' },
    plan: { id: 'mosher', stage: 2, neckY: 0, headCount: structure.roundStartPieces, slots: [], neighbors: [] },
    occupied: [], everBuilt: new Set(),
    reserve: Array.from({ length: count }, (_, index) => part(`${body.id}/stock/${index}`, index)), reserveRevision: 0 };
}
const roles = (orders: Map<string, BotSquadOrder>) =>
  Object.fromEntries([...orders].map(([id, order]) => [id, order.role]));
const inventory = (actors: readonly BotSquadActor[]) => actors.map(body => ({
  id: body.id, x: body.x, z: body.z, revision: body.structure.revision,
  roundStart: body.structure.roundStartPieces, exposed: body.structure.coreExposed,
  pieces: [...body.structure.pieces.values()].map(piece => structuredClone(piece)),
  vacancies: structuredClone(body.structure.vacancies),
  reserve: structuredClone(body.structure.evolution?.reserve ?? []),
}));

describe('battle alliance policy', () => {
  it.each([1, 2, 3, 4, 8])('has the complete symmetric alliance matrix in round %i', round => {
    for (const a of ids) for (const b of ids) {
      const expected = a === b || (round === 2 && ['bot-1', 'bot-2'].includes(a)
        && ['bot-1', 'bot-2'].includes(b)) || (round >= 3 && a.startsWith('bot-') && b.startsWith('bot-'));
      expect(areBattleAllies(round, a, b)).toBe(expected);
      expect(battleTeamId(round, a) === battleTeamId(round, b)).toBe(expected);
    }
  });
  it('does not make the player and third bot allies in round two or absorb unknown IDs into the bot team', () => {
    expect(areBattleAllies(2, 'player', 'bot-3')).toBe(false);
    expect(areBattleAllies(3, 'player', 'bot-1')).toBe(false);
    expect(areBattleAllies(4, 'bot-4', 'bot-1')).toBe(false);
    expect(areBattleAllies(4, 'team:bots', 'bot-1')).toBe(false);
  });
  it('issues round-one independent orders only for living bots', () => {
    const actors = roster(); actors[2].structure.pieces.delete(actors[2].structure.coreId);
    const orders = coordinateBotSquad(createBotSquad(), 1, actors, 0);
    expect([...orders.keys()]).toEqual(['bot-1', 'bot-3']);
    for (const order of orders.values()) expect(order).toEqual({
      round: 1, role: 'independent', targetId: null, flankSide: 0, allyIds: [],
    });
  });
  it('lists only living teammates without including self', () => {
    const actors = roster(), state = createBotSquad();
    expect(coordinateBotSquad(state, 2, actors, 0).get('bot-1')!.allyIds).toEqual(['bot-2']);
    expect(coordinateBotSquad(state, 2, actors, 0).get('bot-3')!.allyIds).toEqual([]);
    actors[2].structure.pieces.delete(actors[2].structure.coreId);
    const orders = coordinateBotSquad(state, 3, actors, 1);
    expect(orders.get('bot-1')!.allyIds).toEqual(['bot-3']);
    expect(orders.get('bot-3')!.allyIds).toEqual(['bot-1']);
  });
});

describe('deterministic team targets', () => {
  it('gives the round-two pair a shared target while the third bot stays independent', () => {
    const actors = roster(); actors[0].x = 5;
    const orders = coordinateBotSquad(createBotSquad(), 2, actors, 0);
    for (const id of ['bot-1', 'bot-2']) {
      expect(orders.get(id)!.role).toBe('attacker');
      expect(orders.get(id)!.targetId).toBe('player');
    }
    expect(orders.get('bot-1')!.flankSide).toBe(-1);
    expect(orders.get('bot-2')!.flankSide).toBe(1);
    expect(orders.get('bot-3')!.role).toBe('independent');
    expect(orders.get('bot-3')!.targetId).toBeNull();
  });
  it('holds the common target through movement, then re-evaluates after the three-second lock', () => {
    const actors = roster(), state = createBotSquad(); actors[0].x = 5;
    coordinateBotSquad(state, 2, actors, 0);
    actors[0].x = 70; actors[3].x = 2;
    expect(coordinateBotSquad(state, 2, actors, 2.99).get('bot-1')!.targetId).toBe('player');
    expect(coordinateBotSquad(state, 2, actors, 3).get('bot-1')!.targetId).toBe('bot-3');
    expect(coordinateBotSquad(state, 2, actors, 3).get('bot-2')!.targetId).toBe('bot-3');
  });
  it('replaces a dead locked target immediately and never chooses its teammate', () => {
    const actors = roster(), state = createBotSquad(); actors[0].x = 5;
    coordinateBotSquad(state, 2, actors, 0);
    actors[0].structure.pieces.delete(actors[0].structure.coreId); actors[2].x = 0;
    const orders = coordinateBotSquad(state, 2, actors, 0.1);
    expect(orders.get('bot-1')!.targetId).toBe('bot-3');
    expect(orders.get('bot-2')!.targetId).toBe('bot-3');
  });
  it('uses real target vulnerability and stable IDs to break equal-position ties', () => {
    const actors = roster(); actors[0].x = actors[3].x = 25;
    const tie = coordinateBotSquad(createBotSquad(), 2, actors, 0);
    expect(tie.get('bot-1')!.targetId).toBe('bot-3');
    removeTo(actors[0], 30);
    expect(coordinateBotSquad(createBotSquad(), 2, actors, 0).get('bot-1')!.targetId).toBe('player');
  });
  it.each([1, 2, 3, 4])('is independent of actor array order in round %i', round => {
    const actors = roster();
    const first = coordinateBotSquad(createBotSquad(), round, actors, 0);
    const reversed = coordinateBotSquad(createBotSquad(), round, [...actors].reverse(), 0);
    expect([...reversed]).toEqual([...first]);
  });
  it('targets only the living player in round three even when another bot is weak', () => {
    const actors = roster(); removeTo(actors[3], 1);
    const orders = coordinateBotSquad(createBotSquad(), 3, actors, 0);
    expect([...orders.values()].every(order => order.role === 'attacker' && order.targetId === 'player')).toBe(true);
    actors[0].structure.pieces.delete(actors[0].structure.coreId);
    expect([...coordinateBotSquad(createBotSquad(), 3, actors, 1).values()]
      .every(order => order.targetId === null)).toBe(true);
  });
  it('has no common target when all hostile Cores are absent', () => {
    const actors = roster();
    for (const body of [actors[0], actors[3]]) body.structure.pieces.delete(body.structure.coreId);
    expect([...coordinateBotSquad(createBotSquad(), 2, actors, 0).values()]
      .every(order => order.targetId === null)).toBe(true);
  });
});

describe('real armor recovery and pressure substitution', () => {
  it('begins round four with two attackers and one collector, with stable repeated orders', () => {
    const actors = roster(), state = createBotSquad(), first = coordinateBotSquad(state, 4, actors, 0);
    expect(roles(first)).toEqual({ 'bot-1': 'attacker', 'bot-2': 'attacker', 'bot-3': 'collector' });
    for (let tick = 1; tick <= 120; tick++) {
      expect([...coordinateBotSquad(state, 4, [...actors].reverse(), tick / 60)]).toEqual([...first]);
    }
  });
  it('immediately replaces a damaged attacker with the healthy collector without displacing the other attacker', () => {
    const actors = roster(), state = createBotSquad();
    const initial = coordinateBotSquad(state, 4, actors, 0);
    removeTo(actors[1], 65);
    const orders = coordinateBotSquad(state, 4, actors, 1 / 60);
    expect(roles(orders)).toEqual({ 'bot-1': 'recover', 'bot-2': 'attacker', 'bot-3': 'attacker' });
    expect(orders.get('bot-2')!.flankSide).toBe(initial.get('bot-2')!.flankSide);
    expect(orders.get('bot-3')!.flankSide).toBe(initial.get('bot-1')!.flankSide);
    expect(orders.get('bot-1')!.flankSide).toBe(0);
  });
  it('requires genuine restoration to 90%, then returns the recovered bot to collection without oscillating roles', () => {
    const actors = roster(), state = createBotSquad();
    coordinateBotSquad(state, 4, actors, 0);
    const removed = removeTo(actors[1], 65);
    coordinateBotSquad(state, 4, actors, 1);
    restoreTo(actors[1], 89, removed);
    expect(coordinateBotSquad(state, 4, actors, 2).get('bot-1')!.role).toBe('recover');
    restoreTo(actors[1], 90, removed);
    expect(roles(coordinateBotSquad(state, 4, actors, 3)))
      .toEqual({ 'bot-1': 'collector', 'bot-2': 'attacker', 'bot-3': 'attacker' });
    removeTo(actors[1], 66);
    expect(coordinateBotSquad(state, 4, actors, 4).get('bot-1')!.role).toBe('collector');
    expect(connectedToCore(actors[1].structure).size).toBe(actors[1].structure.pieces.size);
  });
  it('recognizes damage to grown armor relative to the attained peak rather than its original head', () => {
    const actors = roster(), state = createBotSquad(), body = actors[1];
    coordinateBotSquad(state, 4, actors, 0);
    const donors = actor('donor', 0, 0, 101);
    for (const piece of removeTo(donors, 1)) {
      expect(attachPiece(body.structure, piece, () => 0)).not.toBeNull();
    }
    expect(body.structure.pieces.size).toBe(200);
    expect(body.structure.pieces.size + donors.structure.pieces.size).toBe(201);
    coordinateBotSquad(state, 4, actors, 1);
    removeTo(body, 130);
    expect(body.structure.pieces.size).toBeGreaterThan(body.structure.roundStartPieces);
    expect(coordinateBotSquad(state, 4, actors, 2).get('bot-1')!.role).toBe('recover');
  });
  it('does not keep a repaired but permanently exposed Core in recovery', () => {
    const actors = roster(), state = createBotSquad();
    coordinateBotSquad(state, 4, actors, 0);
    const removed = removeTo(actors[1], 35);
    expect(actors[1].structure.coreExposed).toBe(true);
    coordinateBotSquad(state, 4, actors, 1);
    restoreTo(actors[1], 100, removed);
    const orders = coordinateBotSquad(state, 4, actors, 2);
    expect(actors[1].structure.coreExposed).toBe(true);
    expect(orders.get('bot-1')!.role).toBe('collector');
    expect(orders.get('bot-1')!.targetId).toBe('player');
  });
  it('does not interpret exposure alone as lost armor on a complete one-part structure', () => {
    const actors = [actor('player'), actor('bot-1', 0, 0, 1)];
    expect(actors[1].structure.coreExposed).toBe(true);
    expect(coordinateBotSquad(createBotSquad(), 4, actors, 0).get('bot-1')!.role).toBe('attacker');
  });
  it('does not falsely repair a recovering attacker when its reserve grows', () => {
    const actors = roster(), state = createBotSquad();
    coordinateBotSquad(state, 4, actors, 0); removeTo(actors[1], 65);
    coordinateBotSquad(state, 4, actors, 1);
    const body = actors[1].structure;
    body.evolution = { id: 'mosher', stage: 2, template: { id: 'fixture', name: '', subtitle: '', accent: '',
      coreId: body.coreId, pieces: [], source: '' }, plan: { id: 'mosher', stage: 2, neckY: 0,
      headCount: 100, slots: [], neighbors: [] }, occupied: [], everBuilt: new Set(),
      reserve: Array.from({ length: 200 }, (_, index) => part(`stock/${index}`, index)), reserveRevision: 0 };
    const before = inventory(actors);
    expect(coordinateBotSquad(state, 4, actors, 2).get('bot-1')!.role).toBe('recover');
    expect(inventory(actors)).toEqual(before);
  });
  it('does not promote a recovering collector or invent a second replacement for two wounded attackers', () => {
    const actors = roster(), state = createBotSquad();
    coordinateBotSquad(state, 4, actors, 0);
    removeTo(actors[1], 40); removeTo(actors[2], 50);
    expect(roles(coordinateBotSquad(state, 4, actors, 1)))
      .toEqual({ 'bot-1': 'recover', 'bot-2': 'recover', 'bot-3': 'attacker' });
    removeTo(actors[3], 30);
    expect([...coordinateBotSquad(state, 4, actors, 2).values()].every(order => order.role === 'recover')).toBe(true);
  });
  it('keeps a damaged collector out of pressure until actual recovery', () => {
    const actors = roster(), state = createBotSquad();
    coordinateBotSquad(state, 4, actors, 0); removeTo(actors[3], 60);
    expect(roles(coordinateBotSquad(state, 4, actors, 1)))
      .toEqual({ 'bot-1': 'attacker', 'bot-2': 'attacker', 'bot-3': 'recover' });
  });
  it('mobilizes the surviving collector after attacker death and removes dead membership', () => {
    const actors = roster(), state = createBotSquad();
    coordinateBotSquad(state, 4, actors, 0);
    actors[1].structure.pieces.delete(actors[1].structure.coreId);
    const orders = coordinateBotSquad(state, 4, actors, 1);
    expect(roles(orders)).toEqual({ 'bot-2': 'attacker', 'bot-3': 'attacker' });
    expect(orders.get('bot-2')!.allyIds).toEqual(['bot-3']);
    expect(state.members.has('bot-1')).toBe(false);
    expect(orders.get('bot-2')!.flankSide).not.toBe(orders.get('bot-3')!.flankSide);
  });
  it.each([1, 2])('uses every healthy surviving bot for pressure when only %i remains', count => {
    const actors = [actor('player'), ...Array.from({ length: count }, (_, index) => actor(`bot-${3 - index}`))];
    const orders = coordinateBotSquad(createBotSquad(), 4, actors, 0);
    expect(orders.size).toBe(count);
    expect([...orders.values()].every(order => order.role === 'attacker' && order.targetId === 'player')).toBe(true);
  });
});

describe('squad lifecycle and read-only decisions', () => {
  it('resets target locks and recovery history on a round change', () => {
    const actors = roster(), state = createBotSquad(); actors[0].x = 5;
    coordinateBotSquad(state, 2, actors, 10); removeTo(actors[1], 65);
    coordinateBotSquad(state, 4, actors, 11);
    const fresh = roster();
    const orders = coordinateBotSquad(state, 5, fresh, 0);
    expect(roles(orders)).toEqual({ 'bot-1': 'attacker', 'bot-2': 'attacker', 'bot-3': 'collector' });
    expect([...orders.values()].every(order => order.round === 5 && order.targetId === 'player')).toBe(true);
    expect(state.targetId).toBeNull();
  });
  it('resets a restarted clock in the same round and forgets a previous grown peak', () => {
    const actors = roster(), state = createBotSquad(), body = actors[1];
    coordinateBotSquad(state, 4, actors, 10);
    const pieces = removeTo(actor('donor', 0, 0, 101), 1);
    for (const piece of pieces) expect(attachPiece(body.structure, piece, () => 0)).not.toBeNull();
    coordinateBotSquad(state, 4, actors, 11); removeTo(body, 100);
    expect(coordinateBotSquad(state, 4, actors, 12).get(body.id)!.role).toBe('recover');
    expect(coordinateBotSquad(state, 4, actors, 0).get(body.id)!.role).toBe('attacker');
  });
  it('does not inherit old damage memory when a caller replaces the same actor structure', () => {
    const actors = roster(), state = createBotSquad();
    coordinateBotSquad(state, 4, actors, 0); removeTo(actors[1], 50);
    coordinateBotSquad(state, 4, actors, 1); actors[1] = actor('bot-1');
    expect(coordinateBotSquad(state, 4, actors, 2).get('bot-1')!.role).toBe('collector');
  });
  it('returns detached orders and leaves structures, positions, reserve and part identities unchanged', () => {
    const actors = roster(), state = createBotSquad(), before = inventory(actors);
    const orders = coordinateBotSquad(state, 4, actors, 0);
    orders.get('bot-1')!.role = 'recover'; orders.get('bot-1')!.targetId = 'bot-2';
    (orders.get('bot-1')!.allyIds as string[]).push('player');
    const next = coordinateBotSquad(state, 4, actors, 1);
    expect(next.get('bot-1')!.role).toBe('attacker');
    expect(next.get('bot-1')!.targetId).toBe('player');
    expect(next.get('bot-1')!.allyIds).toEqual(['bot-2', 'bot-3']);
    expect(inventory(actors)).toEqual(before);
  });
  it('handles an empty roster without stale target or membership', () => {
    const actors = roster(), state = createBotSquad();
    coordinateBotSquad(state, 2, actors, 0);
    expect(coordinateBotSquad(state, 2, [], 1).size).toBe(0);
    expect(state.members.size).toBe(0);
    expect(state.targetId).toBeNull();
    expect(state.targetLockUntil).toBe(0);
    expect(coordinateBotSquad(state, 4, [], 2).size).toBe(0);
  });
});

describe('bounded squad recovery without repair starvation or role oscillation', () => {
  it('resumes pressure after eight seconds when the whole wounded squad stops repairing, without modifying its inventory', () => {
    const actors = roster(), state = createBotSquad();
    coordinateBotSquad(state, 4, actors, 0);
    for (const bot of actors.slice(1)) removeTo(bot, 60);
    const before = inventory(actors);
    expect([...coordinateBotSquad(state, 4, actors, 0.1).values()].every(o => o.role === 'recover')).toBe(true);
    expect([...coordinateBotSquad(state, 4, actors, 8).values()].every(o => o.role === 'recover')).toBe(true);
    const resumed = coordinateBotSquad(state, 4, actors, 8.2);
    expect(roles(resumed)).toEqual({ 'bot-1': 'attacker', 'bot-2': 'attacker', 'bot-3': 'recover' });
    for (const id of ['bot-1', 'bot-2']) expect(resumed.get(id)!.recoveryFallback).toBe(true);
    expect(resumed.get('bot-1')!.flankSide).not.toBe(resumed.get('bot-2')!.flankSide);
    expect(inventory(actors)).toEqual(before);
  });
  it('resets the starvation clock on actual attached armour gains and preserves 65/90 hysteresis while recovery progresses', () => {
    const actors = roster(), state = createBotSquad();
    coordinateBotSquad(state, 4, actors, 0);
    const removed = actors.slice(1).map(bot => removeTo(bot, 60));
    coordinateBotSquad(state, 4, actors, 0.1);
    for (const time of [7, 14, 21, 28]) {
      for (const [index, bot] of actors.slice(1).entries()) restoreTo(bot, bot.structure.pieces.size + 1, removed[index]);
      const orders = coordinateBotSquad(state, 4, actors, time);
      expect([...orders.values()].every(o => o.role === 'recover' && !o.recoveryFallback)).toBe(true);
    }
    expect([...coordinateBotSquad(state, 4, actors, 35.99).values()].every(o => o.role === 'recover')).toBe(true);
    expect([...coordinateBotSquad(state, 4, actors, 36.1).values()].filter(o => o.role === 'attacker')).toHaveLength(2);
  });
  it('keeps real healthy replacement pressure while allowing the wounded troops to recover normally', () => {
    const actors = roster(), state = createBotSquad();
    coordinateBotSquad(state, 4, actors, 0); removeTo(actors[1], 60); removeTo(actors[2], 60);
    coordinateBotSquad(state, 4, actors, 0.1);
    const later = coordinateBotSquad(state, 4, actors, 30);
    expect(roles(later)).toEqual({ 'bot-1': 'recover', 'bot-2': 'recover', 'bot-3': 'attacker' });
    expect([...later.values()].every(o => !o.recoveryFallback)).toBe(true);
  });
  it('latches fallback combat despite the same low armour or a small real pickup, then clears it after full recovery', () => {
    const actors = roster(), state = createBotSquad();
    coordinateBotSquad(state, 4, actors, 0);
    const removed = actors.slice(1).map(bot => removeTo(bot, 60));
    coordinateBotSquad(state, 4, actors, 0.1);
    const promoted = coordinateBotSquad(state, 4, actors, 8.2);
    restoreTo(actors[1], 61, removed[0]);
    for (let tick = 0; tick < 600; tick++) {
      const orders = coordinateBotSquad(state, 4, actors, 8.3 + tick / 60);
      for (const id of ['bot-1', 'bot-2']) {
        expect(orders.get(id)!.role).toBe('attacker'); expect(orders.get(id)!.recoveryFallback).toBe(true);
        expect(orders.get(id)!.flankSide).toBe(promoted.get(id)!.flankSide);
      }
    }
    restoreTo(actors[1], 90, removed[0]);
    expect(coordinateBotSquad(state, 4, actors, 20).get('bot-1')!.recoveryFallback).toBeUndefined();
    removeTo(actors[1], 65);
    expect(coordinateBotSquad(state, 4, actors, 21).get('bot-1')!.role).toBe('recover');
  });
  it('never promotes bare Cores without actual ammunition and withdraws a fallback fighter after it loses its last part', () => {
    const actors = roster(), state = createBotSquad();
    coordinateBotSquad(state, 4, actors, 0);
    for (const bot of actors.slice(1)) removeTo(bot, 1);
    coordinateBotSquad(state, 4, actors, 0.1);
    const bare = coordinateBotSquad(state, 4, actors, 60);
    expect([...bare.values()].every(o => o.role === 'recover' && !o.recoveryFallback)).toBe(true);
    const armed = roster(), other = createBotSquad();
    coordinateBotSquad(other, 4, armed, 0);
    for (const bot of armed.slice(1)) removeTo(bot, 60);
    coordinateBotSquad(other, 4, armed, 0.1); coordinateBotSquad(other, 4, armed, 8.2);
    removeTo(armed[1], 1);
    const exhausted = coordinateBotSquad(other, 4, armed, 9).get('bot-1')!;
    expect(exhausted.role).toBe('recover'); expect(exhausted.recoveryFallback).toBeUndefined();
  });
  it('clears a starvation exception after a simulation rewind and on the next round', () => {
    const actors = roster(), state = createBotSquad();
    coordinateBotSquad(state, 4, actors, 0);
    for (const bot of actors.slice(1)) removeTo(bot, 60);
    coordinateBotSquad(state, 4, actors, 0.1); coordinateBotSquad(state, 4, actors, 8.2);
    expect(coordinateBotSquad(state, 4, actors, 0).get('bot-1')!.role).toBe('recover');
    coordinateBotSquad(state, 4, actors, 8.2);
    expect(coordinateBotSquad(state, 5, actors, 9).get('bot-1')!.role).toBe('recover');
  });
});

describe('hardcore coordinated finishing and crossfire', () => {
  it('breaks the pair target lock immediately for an armed nearby finish and keeps both partners committed', () => {
    const actors = roster(), state = createBotSquad(); actors[0].x = 5;
    expect(coordinateBotSquad(state, 2, actors, 0).get('bot-1')!.targetId).toBe('player');
    removeTo(actors[3], 25);
    const before = inventory(actors), orders = coordinateBotSquad(state, 2, actors, 0.1);
    for (const id of ['bot-1', 'bot-2']) {
      expect(orders.get(id)!.targetId).toBe('bot-3');
      expect(orders.get(id)!.finish).toBe(true); expect(orders.get(id)!.rush).toBe(true);
    }
    expect(orders.get('bot-3')!.role).toBe('independent');
    expect(orders.get('bot-3')!.finish).toBeUndefined();
    expect(coordinateBotSquad(state, 2, actors, 0.2).get('bot-2')!.targetId).toBe('bot-3');
    expect(inventory(actors)).toEqual(before);
  });
  it('does not break the pair lock for distant weakness, ammunition-free partners or repaired exposure', () => {
    for (const reason of ['distant', 'unarmed', 'exposure']) {
      const actors = roster(), state = createBotSquad(); actors[0].x = 5;
      coordinateBotSquad(state, 2, actors, 0);
      if (reason === 'exposure') actors[3].structure.coreExposed = true;
      else removeTo(actors[3], 20);
      if (reason === 'distant') actors[3].x = 100;
      if (reason === 'unarmed') {
        for (const body of actors.slice(1, 3)) {
          removeTo(body, 1); giveStock(body, 1);
          body.structure.evolution!.reserve[0].id = body.structure.coreId;
        }
      }
      const orders = coordinateBotSquad(state, 2, actors, 0.1);
      expect(orders.get('bot-1')!.targetId, reason).toBe('player');
      expect(orders.get('bot-2')!.targetId, reason).toBe('player');
      expect([...orders.values()].some(order => order.finish), reason).toBe(false);
    }
  });
  it('recognizes a finish against genuinely depleted grown armour and clears that history on rewind', () => {
    const actors = roster(), state = createBotSquad(), target = actors[3]; actors[0].x = 5;
    for (const piece of removeTo(actor('donor', 0, 0, 101), 1)) {
      expect(attachPiece(target.structure, piece, () => 0)).not.toBeNull();
    }
    coordinateBotSquad(state, 2, actors, 10); removeTo(target, 110);
    expect(target.structure.pieces.size).toBeGreaterThan(target.structure.roundStartPieces);
    expect(coordinateBotSquad(state, 2, actors, 10.1).get('bot-1')!.targetId).toBe(target.id);
    expect(coordinateBotSquad(state, 2, actors, 0).get('bot-1')!.targetId).toBe('player');
    expect(state.armorPeaks.get(target.id)!.peak).toBe(110);
  });
  it('forgets an old finishing lock and vulnerability when the hostile structure is replaced', () => {
    const actors = roster(), state = createBotSquad(); actors[0].x = 5;
    coordinateBotSquad(state, 2, actors, 0); removeTo(actors[3], 20);
    expect(coordinateBotSquad(state, 2, actors, 0.1).get('bot-1')!.targetId).toBe('bot-3');
    actors[3] = actor('bot-3', 30);
    const replaced = coordinateBotSquad(state, 2, actors, 0.2);
    expect(replaced.get('bot-1')!.targetId).toBe('player');
    expect(replaced.get('bot-2')!.finish).toBeUndefined();
    expect(state.armorPeaks.get('bot-3')!.peak).toBe(100);
  });
  it('gives all three round-three attackers distinct persistent lanes 120 degrees apart', () => {
    const actors = roster(), state = createBotSquad(), first = coordinateBotSquad(state, 3, actors, 0);
    const angles = [...first.values()].map(order => order.approachAngle!);
    expect(angles.every(Number.isFinite)).toBe(true);
    expect(angles[1] - angles[0]).toBeCloseTo(Math.PI * 2 / 3, 10);
    expect(angles[2] - angles[1]).toBeCloseTo(Math.PI * 2 / 3, 10);
    for (const body of actors) { body.x += 7; body.z -= 3; }
    const before = inventory(actors);
    const later = coordinateBotSquad(state, 3, [...actors].reverse(), 1);
    expect([...later.values()].map(order => order.approachAngle)).toEqual(angles);
    expect([...later.values()].every(order => order.rush && order.targetId === 'player')).toBe(true);
    expect(inventory(actors)).toEqual(before);
  });
  it('removes stale formation and finishing orders when the hostile Core dies and reanchors a replacement structure', () => {
    const actors = roster(), state = createBotSquad();
    const angle = coordinateBotSquad(state, 3, actors, 0).get('bot-1')!.approachAngle;
    actors[0].structure.pieces.delete(actors[0].structure.coreId);
    const ended = coordinateBotSquad(state, 3, actors, 1);
    expect(state.formation).toBeNull(); expect(state.armorPeaks.has('player')).toBe(false);
    for (const order of ended.values()) {
      expect(order.targetId).toBeNull(); expect(order.rush).toBeUndefined();
      expect(order.finish).toBeUndefined(); expect(order.approachAngle).toBeUndefined();
    }
    actors[0] = actor('player', -20, -20);
    expect(coordinateBotSquad(state, 3, actors, 2).get('bot-1')!.approachAngle).not.toBe(angle);
  });
  it('joins a true finish with a healthy collector, then restores two pressure slots and collection after real repair', () => {
    const actors = roster(), state = createBotSquad();
    const first = coordinateBotSquad(state, 4, actors, 0), removed = removeTo(actors[0], 20);
    const before = inventory(actors), push = coordinateBotSquad(state, 4, actors, 0.1);
    expect([...push.values()].every(order => order.role === 'attacker' && order.finish && order.rush)).toBe(true);
    expect(new Set([...push.values()].map(order => order.approachAngle)).size).toBe(3);
    expect(push.get('bot-1')!.approachAngle).toBe(first.get('bot-1')!.approachAngle);
    expect(push.get('bot-2')!.approachAngle).toBe(first.get('bot-2')!.approachAngle);
    expect(inventory(actors)).toEqual(before);
    restoreTo(actors[0], 100, removed);
    expect(actors[0].structure.coreExposed).toBe(true);
    const restored = coordinateBotSquad(state, 4, actors, 0.2);
    expect(roles(restored)).toEqual({ 'bot-1': 'attacker', 'bot-2': 'attacker', 'bot-3': 'collector' });
    expect([...restored.values()].some(order => order.finish)).toBe(false);
    expect(restored.get('bot-3')!.approachAngle).toBeUndefined();
  });
  it('preserves resource and recovery jobs when the third bot is wounded, unarmed or outside finishing reach', () => {
    for (const reason of ['wounded', 'recovering', 'unarmed', 'distant']) {
      const actors = roster(), state = createBotSquad();
      if (reason === 'unarmed') actors[3] = actor('bot-3', 30, 0, 1);
      coordinateBotSquad(state, 4, actors, 0); removeTo(actors[0], 20);
      if (reason === 'wounded') removeTo(actors[3], 89);
      if (reason === 'recovering') { removeTo(actors[3], 60); giveStock(actors[3], 100); }
      if (reason === 'distant') actors[3].x = 100;
      const order = coordinateBotSquad(state, 4, actors, 0.1).get('bot-3')!;
      expect(order.role, reason).toBe(reason === 'recovering' ? 'recover' : 'collector');
      expect(order.finish, reason).toBeUndefined(); expect(order.rush, reason).toBeUndefined();
    }
  });
});

describe('adaptive pressure rotation with actual armour and stock', () => {
  it('rotates a clearly fresher collector after the minimum tenure and preserves both crossfire slots', () => {
    const actors = roster(), state = createBotSquad(), initial = coordinateBotSquad(state, 4, actors, 0);
    removeTo(actors[1], 80);
    expect(coordinateBotSquad(state, 4, actors, 2.49).get('bot-1')!.role).toBe('attacker');
    const before = inventory(actors), rotated = coordinateBotSquad(state, 4, actors, 2.5);
    expect(roles(rotated)).toEqual({ 'bot-1': 'collector', 'bot-2': 'attacker', 'bot-3': 'attacker' });
    expect(rotated.get('bot-3')!.flankSide).toBe(initial.get('bot-1')!.flankSide);
    expect(rotated.get('bot-3')!.approachAngle).toBe(initial.get('bot-1')!.approachAngle);
    expect(rotated.get('bot-2')!.approachAngle).toBe(initial.get('bot-2')!.approachAngle);
    expect(inventory(actors)).toEqual(before);
  });
  it('avoids marginal swaps and rapid counterrotation while allowing a later meaningful pressure replacement', () => {
    const actors = roster(), state = createBotSquad(); coordinateBotSquad(state, 4, actors, 0);
    const removed = removeTo(actors[1], 85);
    expect(coordinateBotSquad(state, 4, actors, 20).get('bot-1')!.role).toBe('attacker');
    removed.push(...removeTo(actors[1], 80));
    expect(coordinateBotSquad(state, 4, actors, 20.1).get('bot-3')!.role).toBe('attacker');
    restoreTo(actors[1], 100, removed); removeTo(actors[3], 70);
    expect(coordinateBotSquad(state, 4, actors, 22.59).get('bot-3')!.role).toBe('attacker');
    const rotated = coordinateBotSquad(state, 4, actors, 22.61);
    expect(rotated.get('bot-3')!.role).toBe('collector'); expect(rotated.get('bot-1')!.role).toBe('attacker');
  });
  it('uses new real reserve ammunition for rotation but excludes a Core-contaminated stock count', () => {
    for (const contamination of [false, true]) {
      const actors = roster(), state = createBotSquad(); coordinateBotSquad(state, 4, actors, 0);
      giveStock(actors[3], 24);
      if (contamination) for (const piece of actors[3].structure.evolution!.reserve) piece.id = actors[3].structure.coreId;
      const before = inventory(actors), orders = coordinateBotSquad(state, 4, actors, 2.5);
      expect(orders.get('bot-3')!.role).toBe(contamination ? 'collector' : 'attacker');
      expect(inventory(actors)).toEqual(before);
    }
  });
  it('invalidates stocked combat strength when the reserve array or revision changes without a length change', () => {
    for (const replaceArray of [false, true]) {
      const actors = roster(), state = createBotSquad(); coordinateBotSquad(state, 4, actors, 0);
      giveStock(actors[3], 24);
      const body = actors[3].structure, evolution = body.evolution!;
      for (const piece of evolution.reserve) piece.id = body.coreId;
      coordinateBotSquad(state, 4, actors, 1);
      const armed = Array.from({ length: 24 }, (_, i) => part(`refill/${i}`, i));
      if (replaceArray) evolution.reserve = armed;
      else { evolution.reserve.splice(0, 24, ...armed); evolution.reserveRevision++; }
      expect(coordinateBotSquad(state, 4, actors, 2.5).get('bot-3')!.role).toBe('attacker');
    }
  });
  it('never substitutes reserve gains for real repair or pulls a recovering bot into a finishing push', () => {
    const actors = roster(), state = createBotSquad(); coordinateBotSquad(state, 4, actors, 0);
    removeTo(actors[1], 60); giveStock(actors[1], 200); removeTo(actors[0], 1);
    const before = inventory(actors), orders = coordinateBotSquad(state, 4, actors, 10);
    expect(orders.get('bot-1')!.role).toBe('recover');
    expect(orders.get('bot-1')!.finish).toBeUndefined(); expect(orders.get('bot-1')!.rush).toBeUndefined();
    expect(inventory(actors)).toEqual(before);
  });
  it('clears finish support and role tenure on a round restart instead of carrying three attackers forward', () => {
    const actors = roster(), state = createBotSquad(); coordinateBotSquad(state, 4, actors, 10);
    removeTo(actors[0], 20);
    expect(coordinateBotSquad(state, 4, actors, 11).get('bot-3')!.role).toBe('attacker');
    const fresh = roster(), reset = coordinateBotSquad(state, 4, fresh, 0);
    expect(roles(reset)).toEqual({ 'bot-1': 'attacker', 'bot-2': 'attacker', 'bot-3': 'collector' });
    expect([...reset.values()].some(order => order.finish)).toBe(false);
    removeTo(fresh[1], 80);
    expect(coordinateBotSquad(state, 4, fresh, 2.49).get('bot-1')!.role).toBe('attacker');
    expect(coordinateBotSquad(state, 4, fresh, 2.5).get('bot-1')!.role).toBe('collector');
  });
});
