import { describe, expect, it } from 'vitest';
import { createVictoryCollection, stepVictoryCollection, type VictoryDrop } from './victory';
import { newRound, nextRound } from './rounds';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { createStructure, damageStructure, connectedToCore } from './structure';
import { CONFIG } from './config';
import type { Piece } from './types';

const fallen = (piece: Piece, i = 0): VictoryDrop => ({ piece, ownerId: 'player', age: 0, settled: false, x: i % 2 ? -33 : 33, z: 30, y: 12 });
const random = () => 0.37;
describe('victory collection', () => {
  it('attracts airborne/locked loot, repairs first, and carries all collected pieces to Next Round exactly once', () => {
    let seed = 823;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const round = newRound(CHARACTER_TEMPLATES, 'violet', random);
    const wound = damageStructure(round.player, 10, random);
    const armor = damageStructure(round.enemy, round.enemy.pieces.size, random);
    const core = damageStructure(round.enemy, 1, random);
    expect(core.eliminated).toBe(true);
    const drops = [...wound.direct, ...wound.cascade, ...armor.direct, ...armor.cascade, ...core.direct, ...core.cascade].map(fallen);
    const before = round.player.pieces.size, count = drops.length;
    const state = createVictoryCollection(drops), player = { x: 0, z: 0, structure: round.player };
    let done = false, repaired = 0;
    for (let i = 0; i < 600 && !done; i++) {
      const result = stepVictoryCollection(state, drops, player, 1 / 60, random);
      done = result.done;
      repaired += result.attachments.filter(a => a.attachment.mode === 'repair').length;
    }
    expect(done).toBe(true); expect(repaired).toBeGreaterThan(0);
    expect(state.collected).toBe(count); expect(state.skipped).toBe(0); expect(drops).toHaveLength(0);
    expect(player.structure.pieces.size).toBe(before + count);
    expect(connectedToCore(player.structure).size).toBe(before + count);
    const next = nextRound(CHARACTER_TEMPLATES, round, random);
    expect([...next.player.pieces.values()]).toEqual([...round.player.pieces.values()]);
    const again = stepVictoryCollection(state, drops, player, 1, random);
    expect(again.attachments).toHaveLength(0); expect(player.structure.pieces.size).toBe(before + count);
  }, 15000);
  it('finishes an empty arena after the brief celebration', () => {
    const drops: VictoryDrop[] = [], state = createVictoryCollection(drops);
    const player = { x: 0, z: 0, structure: createStructure(CHARACTER_TEMPLATES[0]) };
    expect(stepVictoryCollection(state, drops, player, 0.1).done).toBe(false);
    expect(stepVictoryCollection(state, drops, player, CONFIG.victoryMinDuration).done).toBe(true);
  });
  it('does not stall or delete rejected pieces, and still collects valid pieces after them', () => {
    const base = CHARACTER_TEMPLATES[0].pieces[0];
    const drops = [fallen({ ...base, id: 'bad', size: { x: 0, y: 1, z: 1 } }), fallen({ ...base, id: 'good' })];
    const state = createVictoryCollection(drops), structure = createStructure(CHARACTER_TEMPLATES[0]);
    const result = stepVictoryCollection(state, drops, { x: 0, z: 0, structure }, 3, random);
    expect(result.done).toBe(true); expect(state.skipped).toBe(1); expect(state.collected).toBe(1);
    expect(drops.map(d => d.piece.id)).toEqual(['bad']);
  });
  it('respects the capacity limit and completes with the remaining loot on the ground', () => {
    const base = CHARACTER_TEMPLATES[0].pieces[0], structure = createStructure(CHARACTER_TEMPLATES[0]);
    // Capacity boundary without spending the test growing thousands of pieces.
    while (structure.pieces.size < CONFIG.maxPieces) {
      const id = `capacity-${structure.pieces.size}`;
      structure.pieces.set(id, { ...base, id });
    }
    const drops = [fallen({ ...base, id: 'leftover' })], state = createVictoryCollection(drops);
    const result = stepVictoryCollection(state, drops, { x: 0, z: 0, structure }, 3);
    expect(result.done).toBe(true); expect(result.attachments).toHaveLength(0);
    expect(state.skipped).toBe(1); expect(drops).toHaveLength(1);
  });
  it('cannot collect loot for a defeated fighter', () => {
    const structure = createStructure(CHARACTER_TEMPLATES[0]);
    structure.pieces.delete(structure.coreId);
    const drops = [fallen(CHARACTER_TEMPLATES[1].pieces[0])], state = createVictoryCollection(drops);
    const result = stepVictoryCollection(state, drops, { x: 0, z: 0, structure }, 3);
    expect(result.done).toBe(true); expect(state.collected).toBe(0); expect(drops).toHaveLength(1);
  });
});
