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
