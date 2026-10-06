import { describe, expect, it } from 'vitest';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { advanceEvolution, assembleReserve, collectPiece, enableEvolution, evolutionPlan, evolutionProgress, EVOLUTIONS } from './evolution';
import { carryToNextRound, connectedToCore, createStructure, damageStructure } from './structure';
import { collectNearbyDrops, type PickupDrop } from './pickup';
import { newRound, nextRound } from './rounds';
import { createVictoryCollection, stepVictoryCollection, type VictoryDrop } from './victory';
import type { EvolutionId, Piece, Structure } from './types';

const base = CHARACTER_TEMPLATES[0];
function evolved(id: EvolutionId = 'mosher') {
  const s = createStructure(base); enableEvolution(s, base, id); return s;
}
function settle(s: Structure) {
  let steps = 0;
  while (assembleReserve(s, 2000).length && steps++ < 100) { /* drain actual stock */ }
  expect(steps).toBeLessThan(100);
}
const mass = (s: Structure) => s.pieces.size + (s.evolution?.reserve.length ?? 0);
const identity = (p: Piece) => ({ id: p.id, size: p.size, color: p.color, shape: p.shape });
const stock = (s: Structure) => [...s.pieces.values(), ...s.evolution!.reserve].map(identity).sort((a,b) => a.id.localeCompare(b.id));
function fill(s: Structure) {
  const plan = s.evolution!.plan;
  const loot = plan.slots.slice(plan.headCount).map((p,i) => ({ ...p, id: `loot/${i}`, color: i % 2 ? '#ff00ff' : '#00ddff' }));
  for (const p of loot) expect(collectPiece(s, p)).not.toBeNull();
  settle(s);
  return loot;
}

describe('planned evolution in combat', () => {
  it.each(EVOLUTIONS)('$name accepts all 17 heads in both phases without disconnected slots', async ({id}) => {
    for (const template of CHARACTER_TEMPLATES) for (const stage of [2, 3] as const) {
      const plan = evolutionPlan(template, id, stage);
      const s = createStructure({ ...template, pieces: plan.slots });
      expect(connectedToCore(s).size, `${template.id}/${stage}`).toBe(plan.slots.length);
      expect(plan.slots.slice(0, plan.headCount).map(p => ({ ...p, position: { ...p.position, y: Math.round((p.position.y - plan.neckY)*1e6)/1e6 } }))).toEqual(template.pieces);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }, 60000);

  it.each(EVOLUTIONS)('$name grows a connected body from real collected sizes without changing their colors', ({id}) => {
    const s = evolved(id), original = stock(s), loot = fill(s);
    expect(evolutionProgress(s)!.fraction).toBe(1);
    expect(s.evolution!.reserve).toHaveLength(0);
    expect(connectedToCore(s).size).toBe(s.pieces.size);
    expect(stock(s)).toEqual([...original, ...loot.map(identity)].sort((a,b)=>a.id.localeCompare(b.id)));
  }, 30000);

  it('collects incompatible loot into stock, honors the owner delay, and gives shared loot to one player', () => {
    const s = evolved(), other = evolved('guitar');
    const drops: PickupDrop[] = [0,1].map(i => ({ piece: { ...base.pieces[0], id: `bank-${i}`, size: { x: 31, y: 0.4, z: 1 } },
      x: 0, z: 0, ownerId: i ? 'enemy' : 'player', age: 4.9, settled: true }));
    const player = { id:'player', structure:s, x:0, z:0, pickupRadius:5 };
    expect(collectNearbyDrops(drops, [player])).toHaveLength(1);
    expect(drops).toHaveLength(1);
    drops[0].age = 5;
    const results = collectNearbyDrops(drops, [{...player, id:'enemy', x:3, structure:other},player]);
    expect(results).toHaveLength(1);
    expect(results[0].collector).toBe(player);
    expect(s.pieces.size).toBe(base.pieces.length);
    expect(s.evolution!.reserve).toHaveLength(2);
    expect(other.evolution!.reserve).toHaveLength(0);
    expect(drops).toHaveLength(0);
  });

  it('repairs damage before new growth and can restore a cascading loss using the reserve', () => {
    const s = evolved();
    // A whole donor set supplies multiple sizes in arbitrary pickup order.
    for (const p of CHARACTER_TEMPLATES[1].pieces) collectPiece(s, {...p, id:`enemy/${p.id}`});
    settle(s);
    const before = mass(s), hit = damageStructure(s, 10, () => .02);
    expect(hit.eliminated).toBe(false);
    let repairs = 0;
    for (const p of [...hit.direct, ...hit.cascade].reverse()) {
      const result = collectPiece(s,p);
      if (result?.mode === 'repair') repairs++;
    }
    settle(s);
    expect(repairs).toBeGreaterThan(0);
    expect(mass(s)).toBe(before);
    expect(connectedToCore(s).size).toBe(s.pieces.size);
  });

  it('rebuilds phase 3 only at a round boundary, conserving every part and the original Core', () => {
    const s = evolved('frontman'); fill(s);
    const before = stock(s), core = s.coreId;
    s.coreExposed = true;
    expect(s.evolution!.stage).toBe(2);
    expect(advanceEvolution(s)).toBe(true);
    settle(s);
    expect(s.evolution!.stage).toBe(3);
    expect(s.coreId).toBe(core);
    expect(s.coreExposed).toBe(true);
    expect(stock(s)).toEqual(before);
    expect(connectedToCore(s).size).toBe(s.pieces.size);
    expect(advanceEvolution(s)).toBe(false);
    const next = carryToNextRound(s);
    expect(stock(next)).toEqual(before);
    expect(next.evolution!.stage).toBe(3);
    expect(next.evolution!.reserve).not.toBe(s.evolution!.reserve);
    expect(next.evolution!.occupied).not.toBe(s.evolution!.occupied);
    if (next.evolution!.reserve.length) {
      next.evolution!.reserve[0].color = '#123456';
      expect(stock(s)).toEqual(before);
    }
  }, 30000);

  it('victory collects locked loot into body + reserve; Next Round carries both and Start Over clears both', () => {
    const round = newRound(CHARACTER_TEMPLATES, 'violet', () => .5, 'spider');
    const armor = damageStructure(round.enemy, round.enemy.pieces.size, () => .5);
    const core = damageStructure(round.enemy,1,()=>0);
    const drops: VictoryDrop[] = [...armor.direct,...armor.cascade,...core.direct].map(piece => ({ piece, x:30, y:20, z:10, settled:false, age:0, ownerId:'player' }));
    const expected = mass(round.player)+drops.length;
    const victory = createVictoryCollection(drops);
    let done = false;
    for (let i=0;i<600&&!done;i++) done=stepVictoryCollection(victory,drops,{x:0,z:0,structure:round.player},1/60).done;
    expect(done).toBe(true); expect(drops).toHaveLength(0);
    expect(mass(round.player)).toBe(expected);
    expect(round.player.evolution!.reserve.length).toBeGreaterThan(0);
    const next = nextRound(CHARACTER_TEMPLATES,round,()=>.5);
    expect(stock(next.player)).toEqual(stock(round.player));
    expect(next.enemy.pieces.size).toBe(next.enemyTemplate.pieces.length);
    expect(next.enemy.evolution!.reserve).toHaveLength(0);
    const reset = newRound(CHARACTER_TEMPLATES,'violet',()=>.5,'spider');
    expect(reset.player.pieces.size).toBe(base.pieces.length);
    expect(reset.player.evolution!.reserve).toHaveLength(0);
    expect(evolutionProgress(reset.player)!.built).toBe(0);
  },15000);

  it('an eliminated head cannot attach, bank, rebuild, or progress from its stored loot', () => {
    const s=evolved(); collectPiece(s,{...base.pieces[0],id:'stock',size:{x:31,y:.4,z:1}});
    damageStructure(s, s.pieces.size, ()=>.5); damageStructure(s,1,()=>0);
    const before = mass(s);
    expect(collectPiece(s,base.pieces[0])).toBeNull();
    expect(assembleReserve(s)).toHaveLength(0);
    expect(advanceEvolution(s)).toBe(false);
    expect(mass(s)).toBe(before);
  });
});
