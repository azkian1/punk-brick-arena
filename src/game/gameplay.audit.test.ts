import { describe, expect, it } from 'vitest';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { CONFIG } from './config';
import { assembleReserve, collectPiece, enableEvolution, evolutionPlan, evolutionProgress, EVOLUTIONS } from './evolution';
import { collectNearbyDrops } from './pickup';
import { newRound, nextRound } from './rounds';
import { carryToNextRound, connectedToCore, contactGraph, createStructure, damageStructure } from './structure';
import { createVictoryCollection, stepVictoryCollection, type VictoryDrop } from './victory';
import type { Piece, Structure } from './types';

const seeded = (initial: number) => {
  let seed = initial;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
};
const inventory = (s: Structure) => [...s.pieces.values(), ...(s.evolution?.reserve ?? [])];
const identity = (pieces: Piece[]) => pieces.map(p => `${p.id}|${p.size.x}:${p.size.y}:${p.size.z}|${p.color}|${p.shape}`).sort();
const drop = (piece: Piece, ownerId: string | null, x = 0): VictoryDrop => ({ piece, ownerId, x, y: 12, z: 0, age: 0, settled: false });
const drain = (s: Structure) => {
  for (let steps = 0; steps < 2000; steps++) if (!assembleReserve(s, CONFIG.pickupBatchSize).length) return;
  throw new Error('Reserve assembly did not finish');
};

describe('maintained gameplay audit scenarios', () => {
  it.each(EVOLUTIONS)('$name conserves every physical part across 20 deterministic damage/pickup/reward rounds', ({ id }) => {
    const random = seeded(410 + EVOLUTIONS.findIndex(e => e.id === id));
    let round = newRound(CHARACTER_TEMPLATES, 'violet', random, id);
    let unlocked: number | null = null;
    let hitCount = 0, repairedRounds = 0;
    for (let number = 1; number <= 20; number++) {
      expect(round.number).toBe(number);
      const source = round.playerTemplate.pieces.filter(p => p.size.x <= 2 && p.size.z <= 2 && p.size.y <= 1.21);
      // The live opening adds 24 neutral parts; half are contested by the bot here.
      const drops = Array.from({ length: 24 }, (_, i) => ({
        ...drop({ ...source[i % source.length], id: `audit-${id}-${number}/neutral-${i}` }, null, i < 12 ? -20 : 20),
        age: 2, settled: true,
      }));
      const expected = identity([...inventory(round.player), ...inventory(round.enemy), ...drops.map(d => d.piece)]);
      const player = { id: 'player', x: -20, z: 0, pickupRadius: 4, structure: round.player };
      const enemy = { id: 'enemy', x: 20, z: 0, pickupRadius: 4, structure: round.enemy };
      for (let step = 0; step < 2; step++) collectNearbyDrops(drops, [player, enemy], random);
      drain(round.player); drain(round.enemy);
      // Exercise damage and delayed own-debris recovery without granting replacement parts.
      if (number % 3 === 0) {
        const wound = damageStructure(round.player, 7, random);
        expect(wound.eliminated).toBe(false);
        const recovery = [...wound.direct, ...wound.cascade].map(p => ({ ...drop(p, 'player', -20), settled: true, age: 4.99 }));
        expect(collectNearbyDrops(recovery, [player], random)).toHaveLength(0);
        for (const d of recovery) d.age = 5;
        while (recovery.length) {
          expect(collectNearbyDrops(recovery, [player], random).length).toBeGreaterThan(0);
          drain(round.player);
        }
        repairedRounds++;
      }
      // Standard-power damage goes through protection, exposure, cascades and Core loss.
      let hits = 0;
      while (round.enemy.pieces.has(round.enemy.coreId)) {
        const hit = damageStructure(round.enemy, CONFIG.projectilePower, random);
        drops.push(...[...hit.direct, ...hit.cascade].map(p => drop(p, 'enemy', 20)));
        if (++hits > 1000) throw new Error('Enemy remained alive after 1000 hits');
      }
      hitCount += hits;
      for (const piece of round.enemy.evolution!.reserve) drops.push(drop(piece, 'enemy', 43));
      round.enemy.evolution!.reserve = [];
      round.enemy.evolution!.reserveRevision++;
      expect(identity([...inventory(round.player), ...drops.map(d => d.piece)])).toEqual(expected);
      const victory = createVictoryCollection(drops);
      let done = false, steps = 0;
      while (!done && steps++ < 2400) done = stepVictoryCollection(victory, drops, player, 1 / 60, random).done;
      expect(done).toBe(true);
      expect(victory.skipped).toBe(0);
      expect(drops).toHaveLength(0);
      expect(victory.pending.size).toBe(0);
      expect(victory.elapsed).toBeGreaterThanOrEqual(CONFIG.victoryMinDuration);
      expect(identity(inventory(round.player))).toEqual(expected);
      expect(connectedToCore(round.player).size).toBe(round.player.pieces.size);
      const progress = evolutionProgress(round.player)!;
      expect(progress.built).toBeLessThanOrEqual(progress.target);
      if (progress.stage === 3 && unlocked === null) unlocked = number;
      const carried = identity(inventory(round.player));
      const next = nextRound(CHARACTER_TEMPLATES, round, random);
      expect(identity(inventory(next.player))).toEqual(carried);
      expect(next.player.evolution!.reserve).not.toBe(round.player.evolution!.reserve);
      expect(next.enemy.evolution!.reserve).toHaveLength(0);
      expect(next.enemy.pieces.size).toBe(next.enemyTemplate.pieces.length);
      round = next;
    }
    expect(unlocked).not.toBeNull();
    expect(repairedRounds).toBe(6);
    expect(round.player.evolution!.reserve.length).toBeGreaterThan(240);
    console.info(JSON.stringify({ scenario: 'deterministic-api-rounds', id, rounds: 20, hitCount, repairedRounds, unlocked, final: evolutionProgress(round.player) }));
    const defeat = damageStructure(round.player, round.player.pieces.size, random);
    if (!defeat.eliminated) damageStructure(round.player, 1, () => 0);
    expect(round.player.pieces.has(round.player.coreId)).toBe(false);
    expect(() => nextRound(CHARACTER_TEMPLATES, round, random)).toThrow(/victory/);
    const restarted = newRound(CHARACTER_TEMPLATES, 'violet', random, id);
    expect(restarted.number).toBe(1);
    expect(restarted.player.pieces.size).toBe(restarted.playerTemplate.pieces.length);
    expect(evolutionProgress(restarted.player)!.built).toBe(0);
    expect(restarted.player.evolution!.reserve).toHaveLength(0);
  }, 60000);

  it.each([
    ['non-finite position', { position: { x: Number.NaN, y: 0, z: 0 } }],
    ['infinite position', { position: { x: 0, y: Infinity, z: 0 } }],
    ['zero size', { size: { x: 0, y: 0.4, z: 1 } }],
    ['sub-epsilon size', { size: { x: 1e-8, y: 0.4, z: 1 } }],
  ] as const)('rejects %s rather than hiding invalid world loot in reserve', (_, patch) => {
    const s = createStructure(CHARACTER_TEMPLATES[0]);
    enableEvolution(s, CHARACTER_TEMPLATES[0], 'mosher');
    const incoming = { ...CHARACTER_TEMPLATES[1].pieces[0], ...patch, id: 'invalid' };
    const before = identity(inventory(s));
    expect(collectPiece(s, incoming)).toBeNull();
    expect(identity(inventory(s))).toEqual(before);
    const drops = [drop(incoming, null)];
    const state = createVictoryCollection(drops);
    expect(stepVictoryCollection(state, drops, { x: 0, z: 0, structure: s }, 3).done).toBe(true);
    expect(state.collected).toBe(0); expect(state.skipped).toBe(1);
    expect(drops).toHaveLength(1);
  });

  it.each(EVOLUTIONS)('$name detaches a complete phase-3 body exactly once when its exposed Core is hit', ({ id }) => {
    const template = CHARACTER_TEMPLATES[0], s = createStructure(template);
    enableEvolution(s, template, id);
    // Complete geometry fixture; these parts are not claimed as earned combat loot.
    const plan = evolutionPlan(template, id, 3);
    s.pieces = new Map(plan.slots.map(p => [p.id, { ...p, size: { ...p.size }, position: { ...p.position } }]));
    s.evolution!.stage = 3; s.evolution!.plan = plan;
    s.evolution!.occupied = plan.slots.map(p => p.id);
    s.evolution!.everBuilt = new Set(plan.slots.map((_, i) => i));
    s.coreExposed = true; s.revision++;
    const before = identity(inventory(s));
    expect(connectedToCore(s).size).toBe(s.pieces.size);
    const index = [...s.pieces.keys()].indexOf(s.coreId);
    const hit = damageStructure(s, 1, () => (index + 0.5) / s.pieces.size);
    expect(hit.eliminated).toBe(true);
    expect(hit.direct.map(p => p.id)).toEqual([s.coreId]);
    expect(hit.cascade.length).toBeGreaterThan(4000);
    expect(identity([...hit.direct, ...hit.cascade])).toEqual(before);
    expect(s.pieces.size).toBe(0);
    expect(damageStructure(s, 20).direct).toHaveLength(0);
    expect(damageStructure(s, 20).cascade).toHaveLength(0);
    expect(collectPiece(s, hit.cascade[0])).toBeNull();
    expect(assembleReserve(s)).toHaveLength(0);
  });

  it.each(EVOLUTIONS)('$name blueprint connectivity agrees with spatial traversal through damage and repair', ({ id }) => {
    const template = CHARACTER_TEMPLATES[0], s = createStructure(template);
    enableEvolution(s, template, id);
    const plan = evolutionPlan(template, id, 3);
    s.pieces = new Map(plan.slots.map(p => [p.id, { ...p, size: { ...p.size }, position: { ...p.position } }]));
    s.evolution!.stage = 3; s.evolution!.plan = plan;
    s.evolution!.occupied = plan.slots.map(p => p.id);
    s.evolution!.everBuilt = new Set(plan.slots.map((_, i) => i));
    s.roundStartPieces = s.pieces.size; s.revision++;
    const random = seeded(517);
    for (let round = 0; round < 4; round++) {
      const before = new Map(s.pieces);
      const hit = damageStructure(s, 20, random);
      for (const piece of hit.direct) before.delete(piece.id);
      const oracle: Structure = { ...s, pieces: before, evolution: undefined };
      const spatial = connectedToCore(oracle);
      expect(new Set(hit.cascade.map(p => p.id))).toEqual(new Set([...before.keys()].filter(id => !spatial.has(id))));
      expect(connectedToCore(s)).toEqual(spatial);
      for (const piece of [...hit.direct, ...hit.cascade].reverse()) expect(collectPiece(s, piece)).not.toBeNull();
      drain(s);
      expect(connectedToCore(s)).toEqual(connectedToCore({ ...s, evolution: undefined }));
      expect(s.pieces.size + s.evolution!.reserve.length).toBe(plan.slots.length);
    }
    // A caller outside the blueprint must get the spatial fallback, including new geometry.
    const extra = { ...template.pieces[0], id: 'outside-plan', position: { x: 1000, y: 0, z: 0 } };
    s.pieces.set(extra.id, extra); s.revision++;
    expect(connectedToCore(s)).toEqual(connectedToCore({ ...s, evolution: undefined }));
    expect(connectedToCore(s).has(extra.id)).toBe(false);
  });

  it('keeps incoming IDs unique across installed parts, stock, reserve replacement and carryover', () => {
    const template = CHARACTER_TEMPLATES[0], s = createStructure(template);
    enableEvolution(s, template, 'guitar');
    const state = s.evolution!;
    const slot = state.plan.slots.find((_, i) => i >= state.plan.headCount && state.plan.neighbors[i].some(n => n < state.plan.headCount))!;
    const bank = { ...slot, id: 'collision', size: { x: 31, y: 0.4, z: 1 } };
    expect(collectPiece(s, bank)!.mode).toBe('bank');
    const attached = collectPiece(s, { ...slot, id: bank.id })!;
    expect(attached.mode).toBe('growth');
    expect(attached.piece.id).toBe('collision~1');
    expect(collectPiece(s, { ...slot, id: bank.id })!.piece.id).toBe('collision~2');
    expect(new Set(inventory(s).map(p => p.id)).size).toBe(inventory(s).length);
    // An imported fixture can replace stock without changing the previous array's stamp.
    state.reserve = [{ ...bank, id: 'replacement' }];
    expect(collectPiece(s, { ...bank, id: 'replacement' })!.piece.id).toBe('replacement~1');
    state.reserve.push({ ...bank, id: 'appended' });
    expect(collectPiece(s, { ...bank, id: 'appended' })!.piece.id).toBe('appended~1');
    const next = carryToNextRound(s);
    expect(collectPiece(next, { ...bank, id: 'replacement' })!.piece.id).toBe('replacement~2');
    expect(new Set(inventory(next).map(p => p.id)).size).toBe(inventory(next).length);
    expect(bank.id).toBe('collision');
  });

  it('falls back to spatial contact when sub-epsilon slot offsets change adjacency', () => {
    const core = { ...CHARACTER_TEMPLATES[0].pieces[0], id: 'epsilon/core', size: { x: 1, y: 1, z: 1 }, position: { x: 0, y: 0, z: 0 } };
    const bridge = { ...core, id: 'epsilon/bridge', position: { x: 1 + 0.5e-6, y: 0, z: 0 } };
    const template = { ...CHARACTER_TEMPLATES[0], coreId: core.id, pieces: [core, bridge] };
    const s = createStructure(template);
    s.evolution = { id: 'mosher', stage: 2, template,
      plan: { id: 'mosher', stage: 2, neckY: 0, headCount: 2, slots: template.pieces, neighbors: contactGraph(template.pieces) },
      occupied: [core.id, bridge.id], everBuilt: new Set([0, 1]), reserve: [], reserveRevision: 0 };
    expect(connectedToCore(s).size).toBe(2);
    s.pieces.get(core.id)!.position.x -= 0.75e-6;
    s.pieces.get(bridge.id)!.position.x += 0.75e-6;
    s.revision++;
    const spatial = connectedToCore({ ...s, evolution: undefined });
    expect(spatial).toEqual(new Set([core.id]));
    expect(connectedToCore(s)).toEqual(spatial);
  });

  it('stores and carries valid loot even when attached capacity is full', () => {
    const s = createStructure(CHARACTER_TEMPLATES[0]);
    enableEvolution(s, CHARACTER_TEMPLATES[0], 'guitar');
    // Capacity fixture bypasses geometry solely to reach the storage boundary quickly.
    while (s.pieces.size < CONFIG.maxPieces) {
      const p = { ...CHARACTER_TEMPLATES[0].pieces[0], id: `capacity/${s.pieces.size}` };
      s.pieces.set(p.id, p);
    }
    const drops = Array.from({ length: 300 }, (_, i) => drop({ ...CHARACTER_TEMPLATES[1].pieces[0], id: `stock/${i}` }, 'player'));
    const state = createVictoryCollection(drops);
    let done = false;
    for (let step = 0; step < 200 && !done; step++) done = stepVictoryCollection(state, drops, { x: 0, z: 0, structure: s }, 1 / 60).done;
    expect(done).toBe(true); expect(drops).toHaveLength(0);
    expect(s.pieces.size).toBe(CONFIG.maxPieces);
    expect(s.evolution!.reserve).toHaveLength(300);
    expect(state.collected).toBe(300); expect(state.skipped).toBe(0);
    const carried = carryToNextRound(s);
    expect(identity(inventory(carried))).toEqual(identity(inventory(s)));
    expect(carried.evolution!.reserve).not.toBe(s.evolution!.reserve);
  });
});
