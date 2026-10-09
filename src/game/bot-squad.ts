import type { Structure } from './types';

export type BotSquadRole = 'independent' | 'attacker' | 'collector' | 'recover';

export interface BotSquadOrder {
  round: number;
  role: BotSquadRole;
  targetId: string | null;
  flankSide: number;
  allyIds: readonly string[];
}

export interface BotSquadActor {
  id: string;
  x: number;
  z: number;
  structure: Structure;
}

interface MemberState {
  structure: Structure;
  peak: number;
  role: BotSquadRole;
  flankSide: number;
}

export interface BotSquadState {
  round: number;
  previousTime: number;
  members: Map<string, MemberState>;
  targetId: string | null;
  targetLockUntil: number;
}

const TARGET_LOCK_SECONDS = 3;
const RECOVER_BELOW = 0.65;
const RETURN_ABOVE = 0.9;
const botIds = ['bot-1', 'bot-2', 'bot-3'] as const;
const isBot = (id: string) => botIds.some(botId => botId === id);
const alive = (actor: BotSquadActor) => actor.structure.pieces.has(actor.structure.coreId);
const roundIndex = (round: number) => Number.isFinite(round) ? Math.max(1, Math.floor(round)) : 1;
const compareIds = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Team identity is independent of current survival, role or health. */
export function battleTeamId(roundNumber: number, id: string): string {
  const round = roundIndex(roundNumber);
  if (isBot(id) && round >= 3) return 'team:bots';
  if ((id === 'bot-1' || id === 'bot-2') && round === 2) return 'team:bot-pair';
  return `solo:${id}`;
}

export function areBattleAllies(roundNumber: number, a: string, b: string): boolean {
  return battleTeamId(roundNumber, a) === battleTeamId(roundNumber, b);
}

export function createBotSquad(): BotSquadState {
  return { round: 0, previousTime: -Infinity, members: new Map(), targetId: null, targetLockUntil: 0 };
}

function reset(state: BotSquadState, round: number): void {
  state.round = round;
  state.members.clear();
  state.targetId = null;
  state.targetLockUntil = 0;
}

/** Both allied bots commit to one hostile target, even when each is nearer another. */
function pairTarget(state: BotSquadState, pair: readonly BotSquadActor[],
  actors: readonly BotSquadActor[], time: number): string | null {
  const candidates = actors.filter(actor => !areBattleAllies(2, pair[0].id, actor.id));
  if (state.targetId && time < state.targetLockUntil
    && candidates.some(actor => actor.id === state.targetId)) return state.targetId;
  const center = pair.reduce((point, actor) => ({ x: point.x + actor.x, z: point.z + actor.z }), { x: 0, z: 0 });
  center.x /= pair.length; center.z /= pair.length;
  const score = (actor: BotSquadActor) => {
    const count = actor.structure.pieces.size;
    const health = count / Math.max(1, count, actor.structure.roundStartPieces);
    return Math.hypot(actor.x - center.x, actor.z - center.z)
      - (1 - health) * 18 - (actor.structure.coreExposed ? 6 : 0);
  };
  candidates.sort((a, b) => score(a) - score(b) || compareIds(a, b));
  state.targetId = candidates[0]?.id ?? null;
  state.targetLockUntil = time + TARGET_LOCK_SECONDS;
  return state.targetId;
}

/** Keep existing healthy pressure slots; an available collector fills a vacancy immediately. */
function assignRoles(state: BotSquadState, bots: readonly BotSquadActor[]): void {
  for (const actor of bots) {
    const member = state.members.get(actor.id)!;
    const count = actor.structure.pieces.size;
    if (member.role === 'recover') {
      if (count >= member.peak * RETURN_ABOVE) member.role = 'collector';
    } else if (count <= member.peak * RECOVER_BELOW) {
      member.role = 'recover';
    }
    if (member.role !== 'attacker') member.flankSide = 0;
  }
  const healthy = bots.filter(actor => state.members.get(actor.id)!.role !== 'recover');
  const wanted = Math.min(2, healthy.length);
  const attackers = healthy.filter(actor => state.members.get(actor.id)!.role === 'attacker').slice(0, wanted);
  for (const actor of healthy) {
    if (attackers.length === wanted) break;
    if (!attackers.includes(actor)) attackers.push(actor);
  }
  const occupied = new Set(attackers.map(actor => state.members.get(actor.id)!.flankSide).filter(side => side !== 0));
  for (const actor of healthy) {
    const member = state.members.get(actor.id)!;
    if (!attackers.includes(actor)) {
      member.role = 'collector'; member.flankSide = 0;
    } else {
      member.role = 'attacker';
      if (member.flankSide === 0) {
        member.flankSide = occupied.has(-1) ? 1 : -1;
        occupied.add(member.flankSide);
      }
    }
  }
}

/**
 * Read actual attached armor and issue decisions only. No parts, reserves,
 * exposure flags, positions or structure revisions are modified.
 */
export function coordinateBotSquad(state: BotSquadState, roundNumber: number,
  actors: readonly BotSquadActor[], time: number): Map<string, BotSquadOrder> {
  const round = roundIndex(roundNumber);
  const now = Number.isFinite(time) ? time : Math.max(0, state.previousTime);
  if (state.round !== round || now < state.previousTime) reset(state, round);
  state.previousTime = now;
  const living = actors.filter(alive).sort(compareIds);
  const bots = living.filter(actor => isBot(actor.id));
  const present = new Set(bots.map(actor => actor.id));
  for (const id of state.members.keys()) if (!present.has(id)) state.members.delete(id);
  for (const actor of bots) {
    let member = state.members.get(actor.id);
    if (!member || member.structure !== actor.structure) {
      member = { structure: actor.structure, peak: Math.max(1, actor.structure.roundStartPieces,
        actor.structure.pieces.size), role: 'independent', flankSide: 0 };
      state.members.set(actor.id, member);
    }
    member.peak = Math.max(member.peak, actor.structure.pieces.size);
  }
  const pair = bots.filter(actor => actor.id === 'bot-1' || actor.id === 'bot-2');
  if (round !== 2 || pair.length === 0) {
    state.targetId = null; state.targetLockUntil = 0;
  }
  const target = round === 2 && pair.length ? pairTarget(state, pair, living, now)
    : round >= 3 ? living.find(actor => actor.id === 'player')?.id ?? null : null;
  if (round >= 4) assignRoles(state, bots);
  const orders = new Map<string, BotSquadOrder>();
  for (const actor of bots) {
    const member = state.members.get(actor.id)!;
    const allied = round >= 3 || (round === 2 && actor.id !== 'bot-3');
    if (round < 4) {
      member.role = allied ? 'attacker' : 'independent';
      member.flankSide = allied ? actor.id === 'bot-1' ? -1 : actor.id === 'bot-2' ? 1 : 0 : 0;
    }
    orders.set(actor.id, {
      round, role: member.role, targetId: allied ? target : null, flankSide: member.flankSide,
      allyIds: living.filter(other => other.id !== actor.id && areBattleAllies(round, actor.id, other.id))
        .map(other => other.id),
    });
  }
  return orders;
}
