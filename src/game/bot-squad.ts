import type { Structure } from './types';
import { reserveAmmunitionCount } from './ammunition';

export type BotSquadRole = 'independent' | 'attacker' | 'collector' | 'recover';

export interface BotSquadOrder {
  round: number;
  role: BotSquadRole;
  targetId: string | null;
  flankSide: number;
  allyIds: readonly string[];
  /** Sticky combat after the entire squad has stopped making repair progress. */
  recoveryFallback?: boolean;
  /** Prioritize the shared hostile over optional off-lane growth. */
  rush?: boolean;
  /** Real weakness, ammunition and nearby reach justify a finishing push. */
  finish?: boolean;
  /** World-space bearing of this attacker's target-centered crossfire lane. */
  approachAngle?: number;
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
  lastCount: number;
  repairTime: number;
  combatFallback: boolean;
  roleSince: number;
  finishSupport: boolean;
}

interface ArmorPeak { structure: Structure; peak: number }

export interface BotSquadState {
  round: number;
  previousTime: number;
  members: Map<string, MemberState>;
  targetId: string | null;
  targetLockUntil: number;
  armorPeaks: Map<string, ArmorPeak>;
  formation: { targetId: string; structure: Structure; angle: number } | null;
}

const TARGET_LOCK_SECONDS = 3;
const RECOVER_BELOW = 0.65;
const RETURN_ABOVE = 0.9;
const RECOVERY_STALL_SECONDS = 8;
const ROLE_TENURE_SECONDS = 2.5;
const ROTATION_MARGIN = 0.35;
const FINISH_REACH = 48;
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
  return { round: 0, previousTime: -Infinity, members: new Map(), targetId: null, targetLockUntil: 0,
    armorPeaks: new Map(), formation: null };
}

function reset(state: BotSquadState, round: number): void {
  state.round = round;
  state.members.clear();
  state.targetId = null;
  state.targetLockUntil = 0;
  state.armorPeaks.clear();
  state.formation = null;
}

/** Stock can arm an actor, but it cannot count as attached, repaired armour. */
function stock(actor: BotSquadActor): number {
  return reserveAmmunitionCount(actor.structure);
}
const hasAmmunition = (actor: BotSquadActor) => actor.structure.pieces.size > 1 || stock(actor) > 0;
const health = (state: BotSquadState, actor: BotSquadActor) => actor.structure.pieces.size
  / Math.max(1, state.armorPeaks.get(actor.id)?.peak ?? actor.structure.roundStartPieces, actor.structure.pieces.size);
function vulnerable(state: BotSquadState, actor: BotSquadActor): boolean {
  // Exposure is permanent after repair, so it cannot by itself create an
  // all-round finishing order or pull the resource role out of circulation.
  return actor.structure.pieces.size === 1 || health(state, actor) <= 0.55
    || (actor.structure.coreExposed && health(state, actor) <= RECOVER_BELOW);
}
const finishReach = (self: BotSquadActor, target: BotSquadActor) => hasAmmunition(self)
  && Math.hypot(self.x - target.x, self.z - target.z) < FINISH_REACH;

function setRole(member: MemberState, role: BotSquadRole, time: number): void {
  if (member.role !== role) member.roleSince = time;
  member.role = role;
}

/** Both allied bots commit to one hostile target, even when each is nearer another. */
function pairTarget(state: BotSquadState, pair: readonly BotSquadActor[],
  actors: readonly BotSquadActor[], time: number): string | null {
  const candidates = actors.filter(actor => !areBattleAllies(2, pair[0].id, actor.id));
  const center = pair.reduce((point, actor) => ({ x: point.x + actor.x, z: point.z + actor.z }), { x: 0, z: 0 });
  center.x /= pair.length; center.z /= pair.length;
  const finishing = (actor: BotSquadActor) => vulnerable(state, actor) && pair.some(bot => finishReach(bot, actor));
  const score = (actor: BotSquadActor) => {
    return Math.hypot(actor.x - center.x, actor.z - center.z)
      - (1 - health(state, actor)) * 18 - (actor.structure.coreExposed ? 6 : 0)
      - (finishing(actor) ? 24 : 0);
  };
  candidates.sort((a, b) => score(a) - score(b) || compareIds(a, b));
  const locked = candidates.find(actor => actor.id === state.targetId);
  if (locked && time < state.targetLockUntil) {
    const opportunity = candidates.find(actor => actor !== locked && finishing(actor));
    if (!opportunity || (finishing(locked) && score(opportunity) >= score(locked) - 8)) return locked.id;
    state.targetId = opportunity.id;
    state.targetLockUntil = time + TARGET_LOCK_SECONDS;
    return state.targetId;
  }
  state.targetId = candidates[0]?.id ?? null;
  state.targetLockUntil = time + TARGET_LOCK_SECONDS;
  return state.targetId;
}

/** Preserve pressure while rotating clearly fitter, stocked troops into it. */
function assignRoles(state: BotSquadState, bots: readonly BotSquadActor[], target: BotSquadActor | undefined, time: number): void {
  for (const actor of bots) {
    const member = state.members.get(actor.id)!;
    const count = actor.structure.pieces.size;
    if (count > member.lastCount) member.repairTime = time;
    member.lastCount = count;
    if (count >= member.peak * RETURN_ABOVE) member.combatFallback = false;
    const canShoot = hasAmmunition(actor);
    if (member.combatFallback && !canShoot) {
      member.combatFallback = false; setRole(member, 'recover', time); member.repairTime = time;
    }
    if (member.role === 'recover') {
      if (count >= member.peak * RETURN_ABOVE) setRole(member, 'collector', time);
    } else if (count <= member.peak * RECOVER_BELOW && !member.combatFallback) {
      setRole(member, 'recover', time); member.repairTime = time;
    }
    if (member.role !== 'attacker') member.flankSide = 0;
  }
  const healthy = bots.filter(actor => state.members.get(actor.id)!.role !== 'recover');
  // If nobody can maintain pressure and actual armour is no longer improving,
  // resume combat with the best armed recovering members. This exception stays
  // latched until full recovery: low health cannot oscillate the same order back
  // into recovery every frame. A bare Core without stock is never ammunition.
  if (!healthy.length) {
    const stranded = bots.filter(actor => {
      const member = state.members.get(actor.id)!;
      return time - member.repairTime >= RECOVERY_STALL_SECONDS
        && hasAmmunition(actor);
    }).sort((a, b) => (b.structure.pieces.size + stock(b))
      - (a.structure.pieces.size + stock(a)) || compareIds(a, b));
    for (const actor of stranded.slice(0, 2)) {
      const member = state.members.get(actor.id)!;
      member.combatFallback = true; setRole(member, 'attacker', time); healthy.push(actor);
    }
  }
  const wanted = Math.min(2, healthy.length);
  const strength = (actor: BotSquadActor) => health(state, actor) * 2 + Math.min(24, stock(actor)) / 24 * 0.6;
  const attackers = healthy.filter(actor => {
    const member = state.members.get(actor.id)!;
    return member.role === 'attacker' && !member.finishSupport;
  }).slice(0, wanted);
  // New squads keep deterministic initial slots. Actual replacements use the
  // best available armour and stocked ammunition rather than alphabetical IDs.
  const replacements = healthy.filter(actor => !attackers.includes(actor))
    .sort((a, b) => strength(b) - strength(a) || compareIds(a, b));
  for (const actor of replacements) {
    if (attackers.length === wanted) break;
    attackers.push(actor);
  }
  const collector = healthy.find(actor => !attackers.includes(actor));
  if (collector && hasAmmunition(collector)) {
    const tired = attackers.filter(actor => {
      const member = state.members.get(actor.id)!;
      return !member.combatFallback && time - member.roleSince >= ROLE_TENURE_SECONDS;
    }).sort((a, b) => strength(a) - strength(b) || compareIds(a, b))[0];
    if (tired && strength(collector) > strength(tired) + ROTATION_MARGIN) {
      const old = state.members.get(tired.id)!, fresh = state.members.get(collector.id)!;
      fresh.flankSide = old.flankSide; old.flankSide = 0;
      attackers[attackers.indexOf(tired)] = collector;
    }
  }
  const occupied = new Set(attackers.map(actor => state.members.get(actor.id)!.flankSide).filter(side => side !== 0));
  for (const actor of healthy) {
    const member = state.members.get(actor.id)!;
    const support = !attackers.includes(actor) && !!target && vulnerable(state, target)
      && health(state, actor) >= RETURN_ABOVE && finishReach(actor, target);
    member.finishSupport = support;
    if (!attackers.includes(actor) && !support) {
      setRole(member, 'collector', time); member.flankSide = 0;
    } else {
      setRole(member, 'attacker', time);
      if (support) member.flankSide = 0;
      else if (member.flankSide === 0) {
        member.flankSide = occupied.has(-1) ? 1 : -1;
        occupied.add(member.flankSide);
      }
    }
  }
}

function formationAngle(state: BotSquadState, bots: readonly BotSquadActor[], target: BotSquadActor | undefined): number | null {
  if (!target) { state.formation = null; return null; }
  if (state.formation?.targetId !== target.id || state.formation.structure !== target.structure) {
    const anchor = bots.find(actor => state.members.get(actor.id)!.role === 'attacker');
    if (!anchor) return null;
    const dx = anchor.x - target.x, dz = anchor.z - target.z;
    state.formation = { targetId: target.id, structure: target.structure,
      angle: Math.hypot(dx, dz) > 0.01 ? Math.atan2(dz, dx) : Math.PI };
  }
  return state.formation.angle;
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
  const livingIds = new Set(living.map(actor => actor.id));
  for (const id of state.armorPeaks.keys()) if (!livingIds.has(id)) state.armorPeaks.delete(id);
  for (const actor of living) {
    const previous = state.armorPeaks.get(actor.id);
    if (previous && previous.structure !== actor.structure && state.targetId === actor.id) {
      state.targetId = null; state.targetLockUntil = 0;
    }
    state.armorPeaks.set(actor.id, { structure: actor.structure,
      peak: Math.max(1, actor.structure.roundStartPieces, actor.structure.pieces.size,
        previous?.structure === actor.structure ? previous.peak : 0) });
  }
  const bots = living.filter(actor => isBot(actor.id));
  const present = new Set(bots.map(actor => actor.id));
  for (const id of state.members.keys()) if (!present.has(id)) state.members.delete(id);
  for (const actor of bots) {
    let member = state.members.get(actor.id);
    if (!member || member.structure !== actor.structure) {
      member = { structure: actor.structure, peak: Math.max(1, actor.structure.roundStartPieces,
        actor.structure.pieces.size), role: 'independent', flankSide: 0,
        lastCount: actor.structure.pieces.size, repairTime: now, combatFallback: false,
        roleSince: now, finishSupport: false };
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
  const targetActor = living.find(actor => actor.id === target);
  if (round >= 4) assignRoles(state, bots, targetActor, now);
  const orders = new Map<string, BotSquadOrder>();
  for (const actor of bots) {
    const member = state.members.get(actor.id)!;
    const allied = round >= 3 || (round === 2 && actor.id !== 'bot-3');
    if (round < 4) {
      setRole(member, allied ? 'attacker' : 'independent', now);
      member.flankSide = allied ? actor.id === 'bot-1' ? -1 : actor.id === 'bot-2' ? 1 : 0 : 0;
    }
  }
  const angle = round >= 3 ? formationAngle(state, bots, targetActor) : null;
  for (const actor of bots) {
    const member = state.members.get(actor.id)!;
    const allied = round >= 3 || (round === 2 && actor.id !== 'bot-3');
    const attacking = allied && member.role === 'attacker' && !!targetActor;
    const lane = round === 3 ? bots.indexOf(actor) * Math.PI * 2 / bots.length
      : member.flankSide < 0 ? 0 : member.flankSide > 0 ? Math.PI : Math.PI / 2;
    orders.set(actor.id, {
      round, role: member.role, targetId: allied ? target : null, flankSide: member.flankSide,
      ...(member.combatFallback ? { recoveryFallback: true } : {}),
      ...(attacking ? { rush: true } : {}),
      ...(attacking && targetActor && vulnerable(state, targetActor) && finishReach(actor, targetActor) ? { finish: true } : {}),
      ...(attacking && angle !== null ? { approachAngle: angle + lane } : {}),
      allyIds: living.filter(other => other.id !== actor.id && areBattleAllies(round, actor.id, other.id))
        .map(other => other.id),
    });
  }
  return orders;
}
