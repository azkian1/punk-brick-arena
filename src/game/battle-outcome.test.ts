import { describe, expect, it } from 'vitest';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { battleWinner, livingParticipants, newBattleRound, nextBattleRound, playerBattleOutcome } from './rounds';
import { damageStructure } from './structure';
import type { Random, Structure } from './types';

const seeded = (seed: number): Random => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const battle = () => newBattleRound(CHARACTER_TEMPLATES, 'violet', seeded(17));
const eliminate = (structure: Structure) => {
  // The first hit exposes the protected Core; the next hit destroys it.
  damageStructure(structure, structure.pieces.size, seeded(41));
  damageStructure(structure, structure.pieces.size, seeded(42));
  expect(structure.pieces.has(structure.coreId)).toBe(false);
};

describe('the player battle outcome', () => {
  it('keeps a fresh four-participant match playing', () => {
    const round = battle();
    expect(livingParticipants(round)).toHaveLength(4);
    expect(playerBattleOutcome(round)).toBe('playing');
    expect(battleWinner(round)).toBeNull();
  });

  it('ends the player run immediately with three living rivals', () => {
    const round = battle();
    eliminate(round.player);
    expect(livingParticipants(round).map(participant => participant.id)).toEqual(['bot-1', 'bot-2', 'bot-3']);
    expect(playerBattleOutcome(round)).toBe('defeat');
    // No arena winner is invented while multiple rivals remain.
    expect(battleWinner(round)).toBeNull();
    expect(() => nextBattleRound(CHARACTER_TEMPLATES, round, seeded(18))).toThrow(/victory/);
  });

  it('continues after non-player deaths until the player alone survives', () => {
    const round = battle();
    for (const participant of round.participants.slice(1, 3)) {
      eliminate(participant.structure);
      expect(playerBattleOutcome(round)).toBe('playing');
      expect(battleWinner(round)).toBeNull();
      expect(() => nextBattleRound(CHARACTER_TEMPLATES, round, seeded(18))).toThrow(/victory/);
    }
    eliminate(round.participants[3].structure);
    expect(playerBattleOutcome(round)).toBe('victory');
    expect(battleWinner(round)?.id).toBe(round.playerId);
    expect(livingParticipants(round)).toHaveLength(1);
    const next = nextBattleRound(CHARACTER_TEMPLATES, round, seeded(18));
    expect(next.number).toBe(2);
    expect(playerBattleOutcome(next)).toBe('playing');
    expect(livingParticipants(next)).toHaveLength(4);
  });

  it('does not treat an exposed but surviving player Core as defeat', () => {
    const round = battle();
    damageStructure(round.player, round.player.pieces.size, seeded(41));
    expect(round.player.coreExposed).toBe(true);
    expect(round.player.pieces.has(round.player.coreId)).toBe(true);
    expect(playerBattleOutcome(round)).toBe('playing');
    for (const participant of round.participants.slice(1)) eliminate(participant.structure);
    expect(playerBattleOutcome(round)).toBe('victory');
  });

  it.each([0, 1, 2, 3])('gives player death priority with %i surviving rivals', survivingRivals => {
    const round = battle();
    for (const participant of round.participants.slice(1 + survivingRivals)) eliminate(participant.structure);
    eliminate(round.player);
    expect(livingParticipants(round)).toHaveLength(survivingRivals);
    expect(playerBattleOutcome(round)).toBe('defeat');
    expect(() => nextBattleRound(CHARACTER_TEMPLATES, round, seeded(18))).toThrow(/victory/);
    if (survivingRivals === 1) expect(battleWinner(round)?.id).toBe('bot-1');
    else expect(battleWinner(round)).toBeNull();
  });

  it('checks outcomes without changing real parts, reserves, or round state', () => {
    const round = newBattleRound(CHARACTER_TEMPLATES, 'violet', seeded(17), 'mosher');
    const snapshots = () => JSON.stringify(round.participants.map(participant => ({
      id: participant.id, pieces: [...participant.structure.pieces.values()],
      revision: participant.structure.revision, evolution: participant.structure.evolution,
      vacancies: participant.structure.vacancies,
    })));
    const original = snapshots();
    const structures = round.participants.map(participant => participant.structure);
    const pieces = round.participants.map(participant => participant.structure.pieces);
    const reserves = round.participants.map(participant => participant.structure.evolution!.reserve);
    for (let i = 0; i < 4; i++) expect(playerBattleOutcome(round)).toBe('playing');
    expect(snapshots()).toBe(original);
    round.participants.forEach((participant, index) => {
      expect(participant.structure).toBe(structures[index]);
      expect(participant.structure.pieces).toBe(pieces[index]);
      expect(participant.structure.evolution!.reserve).toBe(reserves[index]);
    });
  });

  it('fails closed when the player is missing from the participant roster', () => {
    const round = battle();
    expect(playerBattleOutcome({ playerId: round.playerId, participants: round.participants.slice(1) })).toBe('defeat');
  });
});
