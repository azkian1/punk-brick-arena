import { describe, expect, it } from 'vitest';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { takeAmmunition, takeAmmunitionBatch } from './ammunition';
import { collectPiece, enableEvolution, evolutionPlan, EVOLUTIONS } from './evolution';
import { attachPiece, connectedToCore, createStructure, damageStructure } from './structure';
import type { CharacterTemplate, EvolutionId, Piece, Structure, Vec3 } from './types';

const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
const brick = (id: string, position = vec(), size = vec(1, 1, 1)): Piece => ({
  id, position, size, color: '#fa3287', shape: 'brick',
});
const fixture = (pieces: Piece[]): CharacterTemplate => ({
  id: 'ammunition', name: 'Ammo', subtitle: '', accent: '#fff', source: 'fixture', coreId: 'core', pieces,
});
const identity = (piece: Piece) => ({ id: piece.id, size: { ...piece.size }, color: piece.color, shape: piece.shape });

function independentConnectivity(structure: Structure) {
  const copy = createStructure({ ...fixture([...structure.pieces.values()]), coreId: structure.coreId });
  expect(connectedToCore(copy).size).toBe(structure.pieces.size);
}

function drain(structure: Structure, checkpoint = 1) {
  const originals = new Map([...structure.pieces].map(([id, piece]) => [id, { piece, identity: identity(piece) }]));
  const fired: string[] = [];
  const size = structure.pieces.size;
  for (let i = 0; i < size - 1; i++) {
    const shot = takeAmmunition(structure);
    expect(shot?.source).toBe('body');
    expect(shot?.piece.id).not.toBe(structure.coreId);
    expect(shot!.piece).toBe(originals.get(shot!.piece.id)!.piece);
    expect(identity(shot!.piece)).toEqual(originals.get(shot!.piece.id)!.identity);
    expect(structure.pieces.size).toBe(size - i - 1);
    fired.push(shot!.piece.id);
    if (i % checkpoint === 0 || i === size - 2) independentConnectivity(structure);
  }
  expect(new Set(fired).size).toBe(size - 1);
  expect([...structure.pieces.keys()]).toEqual([structure.coreId]);
  expect(takeAmmunition(structure)).toBeNull();
  return fired;
}

function completeEvolution(id: EvolutionId, stage: 2 | 3): Structure {
  const template = CHARACTER_TEMPLATES[0], plan = evolutionPlan(template, id, stage);
  const structure = createStructure({ ...template, pieces: plan.slots });
  structure.evolution = {
    id, stage, template, plan, occupied: plan.slots.map(piece => piece.id),
    everBuilt: new Set(plan.slots.map((_, i) => i)), reserve: [], reserveRevision: 0,
  };
  return structure;
}

describe('real-part ammunition', () => {
  it.each([1, 3, 20])('withdraws a %i-part volley as connected safe body losses, preserving every real reference', count => {
    const structure = createStructure(fixture([brick('core'), ...Array.from({ length: 24 }, (_, i) => brick(`part/${i}`, vec(i + 1, 0, 0)))]));
    const inventory = new Map(structure.pieces), before = structure.pieces.size;
    const batch = takeAmmunitionBatch(structure, count);
    expect(batch).toHaveLength(count);
    expect(structure.pieces.size).toBe(before - count);
    expect(new Set(batch.map(ammo => ammo.piece.id)).size).toBe(count);
    for (const ammo of batch) {
      expect(ammo.source).toBe('body');
      expect(ammo.piece).toBe(inventory.get(ammo.piece.id));
      expect(ammo.piece.id).not.toBe('core');
    }
    independentConnectivity(structure);
    expect([...structure.pieces.values(), ...batch.map(ammo => ammo.piece)]).toHaveLength(before);
  });

  it('uses reserve first across the whole volley and only then consumes one safe body part', () => {
    const template = CHARACTER_TEMPLATES[0], structure = createStructure(template);
    enableEvolution(structure, template, 'mosher');
    for (let i = 0; i < 2; i++) expect(collectPiece(structure, brick(`bank/${i}`, vec(), vec(31, 0.4, 3)))?.mode).toBe('bank');
    const stock = [...structure.evolution!.reserve], before = structure.pieces.size;
    const reserveRevision = structure.evolution!.reserveRevision, revision = structure.revision;
    const batch = takeAmmunitionBatch(structure, 3);
    expect(batch.map(ammo => ammo.source)).toEqual(['reserve', 'reserve', 'body']);
    expect(batch[0].piece).toBe(stock[0]); expect(batch[1].piece).toBe(stock[1]);
    expect(structure.evolution!.reserve).toHaveLength(0);
    expect(structure.evolution!.reserveRevision).toBe(reserveRevision + 2);
    expect(structure.revision).toBe(revision + 1);
    expect(structure.pieces.size).toBe(before - 1);
    independentConnectivity(structure);
  });

  it('returns only available real ammunition on shortage, caps requests at twenty, and cannot use Core', () => {
    const short = createStructure(fixture([brick('core'), brick('bridge', vec(1, 0, 0)), brick('tip', vec(2, 0, 0))]));
    short.coreExposed = true;
    expect(takeAmmunitionBatch(short, 20).map(ammo => ammo.piece.id)).toEqual(['tip', 'bridge']);
    expect([...short.pieces.keys()]).toEqual(['core']);
    expect(takeAmmunitionBatch(short, 20)).toEqual([]);
    const stocked = createStructure(fixture([brick('core'), ...Array.from({ length: 25 }, (_, i) => brick(`part/${i}`, vec(i + 1, 0, 0)))]));
    expect(takeAmmunitionBatch(stocked, 99)).toHaveLength(20);
    for (const count of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(takeAmmunitionBatch(stocked, count)).toEqual([]);
    expect(stocked.pieces.size).toBe(6);
  });

  it('takes banked parts first, keeps object identity, and updates only reserve revision', () => {
    const template = CHARACTER_TEMPLATES[0], structure = createStructure(template);
    enableEvolution(structure, template, 'mosher');
    const stock = { ...brick('stock', vec(9, 8, 7), vec(31, 0.4, 3)), color: '#123abc', shape: 'slope' as const };
    expect(collectPiece(structure, stock)?.mode).toBe('bank');
    const stored = structure.evolution!.reserve[0], body = [...structure.pieces.values()];
    const revision = structure.revision, reserveRevision = structure.evolution!.reserveRevision;
    const shot = takeAmmunition(structure);
    expect(shot).toEqual({ piece: stored, source: 'reserve' });
    expect(shot!.piece).toBe(stored);
    expect(identity(shot!.piece)).toEqual(identity(stock));
    expect([...structure.pieces.values()]).toEqual(body);
    expect(structure.revision).toBe(revision);
    expect(structure.evolution!.reserveRevision).toBe(reserveRevision + 1);
    // A consumed ID must leave the reserve identity cache before recollection.
    expect(collectPiece(structure, shot!.piece)?.piece.id).toBe('stock');
  });

  it('peels branch tips before their bridges without firing extra detached pieces', () => {
    const template = fixture([
      brick('core'), brick('bridge', vec(1, 0, 0)), brick('a-tip', vec(2, 0, 0)),
      brick('z-leaf', vec(0, 1, 0)),
    ]);
    const structure = createStructure(template);
    expect(drain(structure)).toEqual(['a-tip', 'bridge', 'z-leaf']);
    expect(structure.revision).toBe(3);
    expect(structure.coreExposed).toBe(true);
    expect(structure.vacancies.reduce((sum, piece) => sum + piece.size.x * piece.size.y * piece.size.z, 0)).toBe(3);
  });

  it('uses a deterministic safe fallback on a cycle with no graph leaves', () => {
    const pieces = [brick('core'), brick('a', vec(1, 0, 0)), brick('b', vec(1, 1, 0)), brick('c', vec(0, 1, 0))];
    const forward = createStructure(fixture(pieces)), reverse = createStructure(fixture([...pieces].reverse()));
    expect(drain(forward)).toEqual(['b', 'a', 'c']);
    expect(drain(reverse)).toEqual(['b', 'a', 'c']);
  });

  it('replans after attachment and damage instead of using stale peel candidates or buckets', () => {
    const structure = createStructure(fixture([brick('core'), brick('bridge', vec(1, 0, 0)), brick('tip', vec(2, 0, 0))]));
    expect(takeAmmunition(structure)?.piece.id).toBe('tip');
    expect(attachPiece(structure, brick('new-tip'), () => 0)?.mode).toBe('repair');
    expect(takeAmmunition(structure)?.piece.id).toBe('new-tip');
    expect(attachPiece(structure, brick('other-tip'), () => 0)?.mode).toBe('repair');
    const damage = damageStructure(structure, 1, () => 0);
    expect(damage.direct[0].id).toBe('bridge');
    expect(damage.cascade[0].id).toBe('other-tip');
    expect(takeAmmunition(structure)).toBeNull();
    expect(structure.pieces.has('core')).toBe(true);
  });

  it('never fires Core even while exposed, and eliminated characters cannot spend stock', () => {
    const structure = createStructure(fixture([brick('core')]));
    expect(structure.coreExposed).toBe(true);
    expect(takeAmmunition(structure)).toBeNull();
    const template = CHARACTER_TEMPLATES[0], eliminated = createStructure(template);
    enableEvolution(eliminated, template, 'mosher');
    const reserve = brick('stored');
    eliminated.evolution!.reserve.push(reserve);
    eliminated.pieces.delete(eliminated.coreId);
    expect(takeAmmunition(eliminated)).toBeNull();
    expect(eliminated.evolution!.reserve).toEqual([reserve]);
  });

  it.each(CHARACTER_TEMPLATES)('safely consumes the complete $name head down to its actual Core', template => {
    const structure = createStructure(template);
    structure.coreExposed = true;
    drain(structure, 97);
  }, 30000);

  it.each(EVOLUTIONS)('safely consumes complete $name evolution fixtures in both stages', ({ id }) => {
    for (const stage of [2, 3] as const) {
      const structure = completeEvolution(id, stage), built = new Set(structure.evolution!.everBuilt);
      const first = takeAmmunition(structure)!;
      expect(structure.evolution!.occupied).not.toContain(first.piece.id);
      expect(structure.evolution!.everBuilt).toEqual(built);
      drain(structure, 131);
      expect(structure.evolution!.occupied.filter(Boolean)).toEqual([structure.coreId]);
      expect(structure.vacancies).toHaveLength(0);
    }
  }, 30000);
});
