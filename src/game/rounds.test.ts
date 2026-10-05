import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { CharacterView } from '../render';
import { newRound, nextRound } from './rounds';
import { attachPiece, connectedToCore, damageStructure } from './structure';
import { CONFIG } from './config';
import type { Piece, Random, Structure } from './types';

const seeded = (seed: number): Random => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const defeat = (body: Structure): Piece[] => {
  const armor = damageStructure(body, body.pieces.size, seeded(9));
  const core = damageStructure(body, 1, () => 0);
  expect(core.eliminated).toBe(true);
  return [...armor.direct, ...armor.cascade, ...core.direct, ...core.cascade];
};

describe('New Round and Next Round', () => {
  it('offers every character as a player and every other model as an opponent', () => {
    for (const template of CHARACTER_TEMPLATES) {
      const state = newRound(CHARACTER_TEMPLATES, template.id, seeded(7));
      expect(state.playerTemplate.id).toBe(template.id);
      expect(state.player.pieces.size).toBe(template.pieces.length);
      expect(new Set([state.enemyTemplate.id, ...state.remainingOpponents])).toEqual(
        new Set(CHARACTER_TEMPLATES.filter(other => other.id !== template.id).map(other => other.id)),
      );
      expect(state.enemy.pieces.size).toBe(state.enemyTemplate.pieces.length);
    }
  });

  it('shuffles a new run and cycles through all 16 opponents without repeats, including cycle boundaries', () => {
    const first = newRound(CHARACTER_TEMPLATES, 'violet', () => 0);
    const other = newRound(CHARACTER_TEMPLATES, 'violet', () => 0.999);
    expect(first.enemyTemplate.id).not.toBe(other.enemyTemplate.id);
    const random = seeded(71);
    let state = first;
    let last = '';
    for (let cycle = 0; cycle < 2; cycle++) {
      const opponents = new Set<string>();
      for (let round = 0; round < 16; round++) {
        expect(state.enemyTemplate.id).not.toBe(last);
        expect(state.enemyTemplate.id).not.toBe('violet');
        expect(opponents.has(state.enemyTemplate.id)).toBe(false);
        opponents.add(state.enemyTemplate.id);
        last = state.enemyTemplate.id;
        const remaining = [...state.remainingOpponents];
        defeat(state.enemy);
        const previous = state;
        state = nextRound(CHARACTER_TEMPLATES, previous, random);
        expect(previous.remainingOpponents).toEqual(remaining);
        expect(state.enemy.pieces.size).toBe(state.enemyTemplate.pieces.length);
      }
      expect(opponents.size).toBe(16);
    }
  });

  it('requires victory, rejecting an ongoing round and a defeated player', () => {
    const state = newRound(CHARACTER_TEMPLATES, 'violet');
    expect(() => nextRound(CHARACTER_TEMPLATES, state)).toThrow(/victory/);
    defeat(state.player);
    defeat(state.enemy);
    expect(() => nextRound(CHARACTER_TEMPLATES, state)).toThrow(/victory/);
  });

  it('carries exact shape, colors, holes and Core identity, while rearming for the new starting count', () => {
    const state = newRound(CHARACTER_TEMPLATES, 'violet');
    const wound = damageStructure(state.player, 12, seeded(51));
    const loot = { ...wound.direct[0], id: 'collected', color: '#123456' };
    expect(attachPiece(state.player, loot, seeded(8))).not.toBeNull();
    state.player.coreExposed = true;
    defeat(state.enemy);
    const before = JSON.stringify([...state.player.pieces.values()]);
    const holes = JSON.stringify(state.player.vacancies);
    const next = nextRound(CHARACTER_TEMPLATES, state);
    expect(next.number).toBe(2);
    expect(JSON.stringify([...next.player.pieces.values()])).toBe(before);
    expect(JSON.stringify(next.player.vacancies)).toBe(holes);
    expect(next.player.coreId).toBe(state.player.coreId);
    expect(next.player.roundStartPieces).toBe(state.player.pieces.size);
    expect(next.player.coreExposed).toBe(false);
    expect(next.enemy.pieces.size).toBe(next.enemyTemplate.pieces.length);
    expect(next.enemy.vacancies).toHaveLength(0);
    expect(next.enemy.coreExposed).toBe(false);
    next.player.pieces.values().next().value!.color = '#000000';
    next.player.vacancies[0].position.x += 9;
    expect(JSON.stringify([...state.player.pieces.values()])).toBe(before);
    expect(JSON.stringify(state.player.vacancies)).toBe(holes);
  });

  it('New Round resets both fighters, damage, holes and round number to their base forms', () => {
    const state = newRound(CHARACTER_TEMPLATES, 'ranger');
    damageStructure(state.player, 50, seeded(3));
    defeat(state.enemy);
    const second = nextRound(CHARACTER_TEMPLATES, state);
    const reset = newRound(CHARACTER_TEMPLATES, second.playerTemplate.id);
    expect(reset.number).toBe(1);
    expect(reset.player.pieces.size).toBe(reset.playerTemplate.pieces.length);
    expect(reset.player.vacancies).toHaveLength(0);
    expect(reset.player.coreExposed).toBe(false);
    expect(reset.enemy.pieces.size).toBe(reset.enemyTemplate.pieces.length);
  });

  it('keeps fifteen rounds of collected parts and renders the resulting giant beyond the old 1800-piece cap', () => {
    const sourceBefore = JSON.stringify(CHARACTER_TEMPLATES);
    let state = newRound(CHARACTER_TEMPLATES, 'violet', seeded(27));
    let total = state.player.pieces.size;
    const random = seeded(802);
    // Stress the maximum-growth case: all opponent loot has been collected.
    for (let round = 1; round <= 15; round++) {
      const loot = defeat(state.enemy);
      total += loot.length;
      let rejected = 0;
      for (const piece of loot) if (!attachPiece(state.player, piece, random)) rejected++;
      expect(rejected).toBe(0);
      expect(state.player.pieces.size).toBe(total);
      expect(new Set([...state.player.pieces.values()].map(piece => piece.id)).size).toBe(total);
      expect(connectedToCore(state.player).size).toBe(total);
      state = nextRound(CHARACTER_TEMPLATES, state);
      expect(state.number).toBe(round + 1);
      expect(state.player.pieces.size).toBe(total);
      expect(state.enemy.pieces.size).toBe(state.enemyTemplate.pieces.length);
      expect([...state.enemy.pieces.keys()].some(id => state.player.pieces.has(id))).toBe(false);
    }
    expect(total).toBeGreaterThan(7000);
    expect(total).toBeLessThan(CONFIG.maxPieces);
    const scene = new Scene(), view = new CharacterView(scene, '#ffffff');
    view.sync(state.player);
    expect(view.body.count).toBe(total);
    const studs = [...state.player.pieces.values()].reduce((sum, piece) => sum +
      (piece.shape === 'tile' || piece.shape === 'slope' ? 0 : Math.floor(piece.size.x) * Math.floor(piece.size.z)), 0);
    expect(view.studs.count).toBe(studs);
    expect(view.body.instanceMatrix.count).toBeGreaterThanOrEqual(total);
    expect(view.studs.instanceMatrix.count).toBeGreaterThanOrEqual(studs);
    view.dispose(scene);
    expect(JSON.stringify(CHARACTER_TEMPLATES)).toBe(sourceBefore);
  }, 30000);
});
