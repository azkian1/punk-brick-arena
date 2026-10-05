import type { CharacterTemplate, Random, Structure } from './types';
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

export function newRound(templates: CharacterTemplate[], selectedId: string, random: Random = Math.random): RoundState {
  const index = templates.findIndex(template => template.id === selectedId);
  if (index < 0 || templates.length < 2) throw new Error('Invalid round roster');
  const opponents = shuffledOpponents(templates, selectedId, random);
  const playerTemplate = templates[index], enemyTemplate = templates.find(template => template.id === opponents[0])!;
  return {
    number: 1, playerTemplate, enemyTemplate,
    player: spawn(playerTemplate, 'round-1/player'),
    enemy: spawn(enemyTemplate, 'round-1/enemy'),
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
  return {
    number, playerTemplate: previous.playerTemplate, enemyTemplate,
    player: carryToNextRound(previous.player),
    enemy: spawn(enemyTemplate, `round-${number}/enemy`),
    remainingOpponents: opponents.slice(1),
    ...botForRound(number, random),
  };
}
