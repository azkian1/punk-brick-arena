import { describe, expect, it } from 'vitest';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { createStructure } from './structure';
import { collectPiece, enableEvolution, EVOLUTIONS } from './evolution';
import { collectRune, createRune, restoreModelColors, stepRune } from './rune';

const template = CHARACTER_TEMPLATES[0];
function actor(id = 'player', x = 0) {
  return { id, x, z: 0, radius: 2.2, template, structure: createStructure(template) };
}
describe('center color rune', () => {
  it('appears every 30 combat seconds, remains until collected and never stacks', () => {
    const rune = createRune();
    expect(stepRune(rune, 29.99)).toBe(false); expect(rune.available).toBe(false);
    expect(stepRune(rune, .01)).toBe(true); expect(rune.available).toBe(true);
    expect(stepRune(rune, 30)).toBe(false); expect(rune.spawned).toBe(1);
    expect(collectRune(rune, [actor()])?.id).toBe('player'); expect(rune.available).toBe(false);
    expect(stepRune(rune, 29.99)).toBe(false); expect(stepRune(rune, .01)).toBe(true);
    expect(rune.spawned).toBe(2); expect(rune.collected).toBe(1);
  });
  it('chooses one nearest living collector and does not trigger a second time', () => {
    const rune = createRune(), dead = actor('dead'), near = actor('bot-1', 1), far = actor('player', 4);
    dead.structure.pieces.delete(dead.structure.coreId); stepRune(rune, 30);
    expect(collectRune(rune, [dead, far, near])).toBe(near);
    expect(collectRune(rune, [far])).toBeNull(); expect(rune.collected).toBe(1);
    stepRune(rune, 30); expect(collectRune(rune, [actor('distant', 20)])).toBeNull();
  });
  it('restores the selected original head without modifying the template or geometry', () => {
    const a = actor(), original = JSON.stringify(template);
    const before = [...a.structure.pieces.values()].map(p => ({ id: p.id, position: { ...p.position }, size: { ...p.size }, shape: p.shape }));
    for (const p of a.structure.pieces.values()) p.color = '#ff00ff';
    expect(restoreModelColors(a.structure, template)).toBeGreaterThan(0);
    expect([...a.structure.pieces.values()].map(p => p.color)).toEqual(template.pieces.map(p => p.color));
    expect([...a.structure.pieces.values()].map(({ id, position, size, shape }) => ({ id, position, size, shape }))).toEqual(before);
    expect(JSON.stringify(template)).toBe(original);
  });
  it.each(EVOLUTIONS)('$id paints installed evolution parts only, preserving stock and subsequent loot colors', ({ id }) => {
    const a = actor(); enableEvolution(a.structure, template, id);
    const state = a.structure.evolution!;
    const slots = state.plan.slots.slice(state.plan.headCount, state.plan.headCount + 12);
    slots.forEach((slot, i) => {
      const piece = { ...slot, id: `installed/${i}`, color: '#ff00ff', position: { ...slot.position }, size: { ...slot.size } };
      a.structure.pieces.set(piece.id, piece); state.occupied[state.plan.headCount + i] = piece.id;
    });
    state.reserve.push({ ...slots[0], id: 'saved', color: '#00aaff' });
    const ids = [...a.structure.pieces.keys()], mass = a.structure.pieces.size + state.reserve.length;
    expect(restoreModelColors(a.structure, template)).toBeGreaterThan(0);
    expect(slots.map((_, i) => a.structure.pieces.get(`installed/${i}`)!.color)).not.toContain('#ff00ff');
    expect(new Set([...a.structure.pieces.values()].slice(template.pieces.length).map(p => p.color)).size).toBeLessThanOrEqual(5);
    expect(state.reserve[0].color).toBe('#00aaff'); expect([...a.structure.pieces.keys()]).toEqual(ids);
    expect(a.structure.pieces.size + state.reserve.length).toBe(mass);
    const loot = { ...slots[0], id: 'after-rune', color: '#123abc' };
    const result = collectPiece(a.structure, loot); expect(result?.piece.color).toBe('#123abc');
  });
});
