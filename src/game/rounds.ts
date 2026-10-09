import type { CharacterTemplate, EvolutionId, Piece, Random, Structure } from './types';
import { enableEvolution, EVOLUTIONS } from './evolution';
import { carryToNextRound, createStructure } from './structure';
import { botForRound, type BotStyle, type BotDifficulty } from './bots';

export interface RoundState {
  number: number;
  playerTemplate: CharacterTemplate;
  enemyTemplate: CharacterTemplate;
  player: Structure;
  enemy: Structure;
  remainingOpponents: string[];
  enemyBehavior: BotStyle;
  enemyDifficulty: BotDifficulty;
}

function spawn(template: CharacterTemplate, prefix: string): Structure {
  return createStructure({
    ...template,
    coreId: `${prefix}/${template.coreId}`,
    pieces: template.pieces.map(piece => ({ ...piece, id: `${prefix}/${piece.id}` })),
  });
}

function shuffledOpponents(templates: CharacterTemplate[], selectedId: string, random: Random, lastEnemyId?: string): string[] {
  const ids = templates.filter(template => template.id !== selectedId).map(template => template.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  // Avoid a repeat at the boundary between two shuffled cycles as well.
  if (ids.length > 1 && ids[0] === lastEnemyId) [ids[0], ids[1]] = [ids[1], ids[0]];
  return ids;
}

export function newRound(templates: CharacterTemplate[], selectedId: string, random: Random = Math.random, evolutionId?: EvolutionId): RoundState {
  const index = templates.findIndex(template => template.id === selectedId);
  if (index < 0 || templates.length < 2) throw new Error('Invalid round roster');
  const opponents = shuffledOpponents(templates, selectedId, random);
  const playerTemplate = templates[index], enemyTemplate = templates.find(template => template.id === opponents[0])!;
  const player = spawn(playerTemplate, 'round-1/player'), enemy = spawn(enemyTemplate, 'round-1/enemy');
  if (evolutionId) {
    enableEvolution(player, playerTemplate, evolutionId);
    enableEvolution(enemy, enemyTemplate, EVOLUTIONS[Math.min(4, Math.floor(random() * EVOLUTIONS.length))].id);
  }
  return {
    number: 1, playerTemplate, enemyTemplate,
    player, enemy,
    remainingOpponents: opponents.slice(1),
    ...botForRound(1, random),
  };
}

export function nextRound(templates: CharacterTemplate[], previous: RoundState, random: Random = Math.random): RoundState {
  if (!previous.player.pieces.has(previous.player.coreId) || previous.enemy.pieces.has(previous.enemy.coreId)) {
    throw new Error('Next Round requires a victory');
  }
  const index = templates.findIndex(template => template.id === previous.playerTemplate.id);
  if (index < 0 || templates.length < 2) throw new Error('Invalid round roster');
  const number = previous.number + 1;
  const opponents = previous.remainingOpponents.length ? previous.remainingOpponents
    : shuffledOpponents(templates, previous.playerTemplate.id, random, previous.enemyTemplate.id);
  const enemyTemplate = templates.find(template => template.id === opponents[0]);
  if (!enemyTemplate) throw new Error('Invalid round roster');
  const enemy = spawn(enemyTemplate, `round-${number}/enemy`);
  if (previous.player.evolution) enableEvolution(enemy, enemyTemplate, EVOLUTIONS[Math.min(4, Math.floor(random() * EVOLUTIONS.length))].id);
  return {
    number, playerTemplate: previous.playerTemplate, enemyTemplate,
    player: carryToNextRound(previous.player),
    enemy,
    remainingOpponents: opponents.slice(1),
    ...botForRound(number, random),
  };
}

export interface BattleParticipant {
  id: string;
  template: CharacterTemplate;
  structure: Structure;
  style: BotStyle | null;
  difficulty: BotDifficulty | null;
}

/** Actor identity stays stable while each round's new parts receive unique IDs. */
export interface BattleRound {
  number: number;
  playerId: 'player';
  playerTemplate: CharacterTemplate;
  player: Structure;
  participants: BattleParticipant[];
  remainingOpponents: string[];
}

export function livingParticipants(round: Pick<BattleRound, 'participants'>): BattleParticipant[] {
  return round.participants.filter(participant => participant.structure.pieces.has(participant.structure.coreId));
}

/** The arena winner exists only when exactly one Core survives. */
export function battleWinner(round: Pick<BattleRound, 'participants'>): BattleParticipant | null {
  const alive = livingParticipants(round);
  return alive.length === 1 ? alive[0] : null;
}

/** The player's run ends on their elimination, even while rivals remain alive. */
export function playerBattleOutcome(round: Pick<BattleRound, 'participants' | 'playerId'>): 'playing' | 'victory' | 'defeat' {
  const player = round.participants.find(participant => participant.id === round.playerId);
  if (!player?.structure.pieces.has(player.structure.coreId)) return 'defeat';
  return battleWinner(round)?.id === round.playerId ? 'victory' : 'playing';
}

/** Drain exactly once so an eliminated actor's bank becomes contestable ground loot. */
export function releaseEliminatedReserve(structure: Structure): Piece[] {
  if (structure.pieces.has(structure.coreId) || !structure.evolution?.reserve.length) return [];
  const pieces = structure.evolution.reserve;
  structure.evolution.reserve = [];
  structure.evolution.reserveRevision++;
  return pieces;
}

function battleRoster(
  templates: CharacterTemplate[], selectedId: string, number: number,
  random: Random, remaining: string[] = [], previousIds: string[] = [],
): { participants: BattleParticipant[]; remainingOpponents: string[] } {
  const available = templates.filter(template => template.id !== selectedId);
  if (!available.length) throw new Error('Invalid round roster');
  let pool = remaining.filter(id => available.some(template => template.id === id));
  const picked: CharacterTemplate[] = [];
  for (let i = 0; i < 3; i++) {
    if (!pool.length) pool = shuffledOpponents(templates, selectedId, random, previousIds.at(-1));
    // Crossing a shuffled-cycle boundary must not duplicate a model within a
    // four-player match when the roster has enough different heads.
    let next = pool.findIndex(id => !picked.some(template => template.id === id));
    if (next < 0 && available.length >= 3) {
      const refill = shuffledOpponents(templates, selectedId, random);
      pool.push(...refill.filter(id => !pool.includes(id)));
      next = pool.findIndex(id => !picked.some(template => template.id === id));
    }
    const id = pool.splice(Math.max(0, next), 1)[0];
    picked.push(available.find(template => template.id === id)!);
  }
  return {
    participants: picked.map((template, i) => {
      const behavior = botForRound(number, random);
      return { id: `bot-${i + 1}`, template, structure: spawn(template, `round-${number}/bot-${i + 1}`),
        style: behavior.enemyBehavior, difficulty: behavior.enemyDifficulty };
    }),
    remainingOpponents: pool,
  };
}

export function newBattleRound(
  templates: CharacterTemplate[], selectedId: string, random: Random = Math.random, evolutionId?: EvolutionId,
): BattleRound {
  const playerTemplate = templates.find(template => template.id === selectedId);
  if (!playerTemplate || templates.length < 2) throw new Error('Invalid round roster');
  const player = spawn(playerTemplate, 'round-1/player');
  const roster = battleRoster(templates, selectedId, 1, random);
  if (evolutionId) {
    enableEvolution(player, playerTemplate, evolutionId);
    for (const opponent of roster.participants) {
      enableEvolution(opponent.structure, opponent.template,
        EVOLUTIONS[Math.min(EVOLUTIONS.length - 1, Math.floor(random() * EVOLUTIONS.length))].id);
    }
  }
  return { number: 1, playerId: 'player', playerTemplate, player,
    participants: [{ id: 'player', template: playerTemplate, structure: player, style: null, difficulty: null }, ...roster.participants],
    remainingOpponents: roster.remainingOpponents };
}

export function nextBattleRound(
  templates: CharacterTemplate[], previous: BattleRound, random: Random = Math.random,
): BattleRound {
  if (battleWinner(previous)?.id !== previous.playerId) throw new Error('Next Round requires a victory');
  const playerTemplate = templates.find(template => template.id === previous.playerTemplate.id);
  if (!playerTemplate) throw new Error('Invalid round roster');
  const number = previous.number + 1;
  const roster = battleRoster(templates, playerTemplate.id, number, random,
    previous.remainingOpponents, previous.participants.filter(participant => participant.id !== previous.playerId).map(participant => participant.template.id));
  const player = carryToNextRound(previous.player);
  if (player.evolution) for (const opponent of roster.participants) {
    enableEvolution(opponent.structure, opponent.template,
      EVOLUTIONS[Math.min(EVOLUTIONS.length - 1, Math.floor(random() * EVOLUTIONS.length))].id);
  }
  return { number, playerId: 'player', playerTemplate, player,
    participants: [{ id: 'player', template: playerTemplate, structure: player, style: null, difficulty: null }, ...roster.participants],
    remainingOpponents: roster.remainingOpponents };
}
