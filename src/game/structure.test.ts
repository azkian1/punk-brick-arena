import { describe, expect, it } from 'vitest';
import { attachPiece, connectedToCore, createStructure, damageStructure, getBounds } from './structure';
import type { CharacterTemplate, Piece, Random, Vec3 } from './types';

const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
const brick = (id: string, position = vec(), size = vec(1, 1, 1)): Piece => ({
  id, position, size, color: '#ff9900', shape: 'brick',
});
const template = (pieces: Piece[], coreId = 'core'): CharacterTemplate => ({
  id: 'test', name: 'Test', subtitle: '', accent: '#fff', coreId, pieces, source: 'test fixture',
});
// Geometry/attachment tests below exercise the exposed phase. Protection has
// separate tests covering its threshold and the transition between phases.
const structure = (pieces: Piece[]) => ({ ...createStructure(template(pieces)), coreExposed: true });
const seeded = (seed: number): Random => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const volume = (piece: Piece) => piece.size.x * piece.size.y * piece.size.z;
const overlaps = (a: Piece, b: Piece) => (['x', 'y', 'z'] as const).every(axis =>
  Math.min(a.position[axis] + a.size[axis], b.position[axis] + b.size[axis]) -
  Math.max(a.position[axis], b.position[axis]) > 1e-6);

describe('structure creation and connectivity', () => {
  it('clones templates so two fighters cannot mutate one another or the source asset', () => {
    const source = template([brick('core')]);
    const one = createStructure(source);
    const two = createStructure(source);
    one.pieces.get('core')!.position.x = 42;
    one.pieces.get('core')!.size.x = 9;
    expect(source.pieces[0].position.x).toBe(0);
    expect(two.pieces.get('core')!.size.x).toBe(1);
  });

  it('requires a real Core and unique IDs', () => {
    expect(() => createStructure(template([brick('other')]))).toThrow(/Core/);
    expect(() => createStructure(template([brick('core'), brick('core')]))).toThrow(/ID/);
  });

  it('connects positive-area shared faces, tolerates plate-unit rounding, rejects edge/corner contact', () => {
    const body = structure([
      brick('core', vec(), vec(2, 0.4, 2)),
      brick('plate', vec(0, 0.4000000000000001, 0), vec(1, 0.4, 1)),
      brick('face', vec(2, 0, 0), vec(2, 0.4, 1)),
      brick('edge', vec(-1, 0, -1)),
      brick('corner', vec(-1, -1, -1)),
    ]);
    expect(connectedToCore(body)).toEqual(new Set(['core', 'plate', 'face']));
    const copy = connectedToCore(body);
    copy.clear();
    expect(connectedToCore(body).size).toBe(3);
  });

  it('calculates bounds with rectangular pieces and handles eliminated structures', () => {
    const body = structure([brick('core', vec(-2, 0, -3), vec(4, 1.2, 6))]);
    expect(getBounds(body)).toEqual({ min: vec(-2, 0, -3), max: vec(2, 1.2, 3) });
    damageStructure(body, 1);
    expect(getBounds(body)).toEqual({ min: vec(), max: vec() });
  });
});

describe('random damage and cascades', () => {
  it('removes a random bridge directly, then only its disconnected branch', () => {
    const body = structure([
      brick('core'), brick('bridge', vec(1, 0, 0)),
      brick('tip', vec(2, 0, 0)), brick('survivor', vec(0, 1, 0)),
    ]);
    const result = damageStructure(body, 1, () => 0.3);
    expect(result.direct.map(piece => piece.id)).toEqual(['bridge']);
    expect(result.cascade.map(piece => piece.id)).toEqual(['tip']);
    expect(result.eliminated).toBe(false);
    expect([...body.pieces.keys()]).toEqual(['core', 'survivor']);
    expect(body.vacancies.reduce((sum, piece) => sum + volume(piece), 0)).toBe(2);
    expect(body.revision).toBe(1);
  });

  it('batches configurable power as distinct direct removals without replacement', () => {
    const body = structure([
      brick('core', vec(), vec(10, 1, 1)),
      ...Array.from({ length: 10 }, (_, i) => brick(`p${i}`, vec(i, 1, 0))),
    ]);
    const result = damageStructure(body, 5, () => 0.15);
    expect(result.direct.map(piece => piece.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    expect(new Set(result.direct.map(piece => piece.id)).size).toBe(5);
    expect(result.cascade).toHaveLength(0);
    expect(body.pieces.size).toBe(6);
    expect(result.eliminated).toBe(false);
  });

  it('lets random damage choose every piece including Core once protection is gone', () => {
    const selected: string[] = [];
    for (let index = 0; index < 4; index++) {
      const body = structure([brick('core'), brick('a', vec(1, 0, 0)),
        brick('b', vec(0, 1, 0)), brick('c', vec(0, 0, 1))]);
      selected.push(damageStructure(body, 1, () => (index + 0.5) / 4).direct[0].id);
    }
    expect(selected).toEqual(['core', 'a', 'b', 'c']);
  });

  it('Core destruction eliminates, releases the whole remainder once, and prevents revival by pickup', () => {
    const body = structure([brick('core'), brick('a', vec(1, 0, 0)), brick('b', vec(2, 0, 0))]);
    const result = damageStructure(body, 1, () => 0);
    expect(result.direct.map(piece => piece.id)).toEqual(['core']);
    expect(result.cascade.map(piece => piece.id)).toEqual(['a', 'b']);
    expect(result.eliminated).toBe(true);
    expect(body.pieces.size).toBe(0);
    expect(new Set([...result.direct, ...result.cascade].map(piece => piece.id)).size).toBe(3);
    expect(attachPiece(body, brick('new'), seeded(3))).toBeNull();
    expect(body.revision).toBe(1);
  });

  it('caps direct losses by available pieces and leaves no-op revisions unchanged', () => {
    const body = structure([brick('core'), brick('a', vec(1, 0, 0))]);
    expect(damageStructure(body, 0).direct).toHaveLength(0);
    expect(damageStructure(body, -4).direct).toHaveLength(0);
    expect(body.revision).toBe(0);
    const result = damageStructure(body, 100, seeded(10));
    expect(result.direct).toHaveLength(2);
    expect(result.cascade).toHaveLength(0);
    damageStructure(body, 100);
    expect(body.revision).toBe(1);
  });
});

describe('repair-first collection and growth', () => {
  it('repairs an owned loss before growth while preserving a foreign pickup’s size, color, and shape', () => {
    const body = structure([brick('core'), brick('lost', vec(1, 0, 0))]);
    damageStructure(body, 1, () => 0.9);
    const incoming = { ...brick('foreign', vec(9, 9, 9)), color: '#22ccff', shape: 'slope' as const };
    const repaired = attachPiece(body, incoming, seeded(2));
    expect(repaired?.mode).toBe('repair');
    expect(repaired?.piece.position).toEqual(vec(1, 0, 0));
    expect(repaired?.piece).toMatchObject({ id: 'foreign', color: '#22ccff', shape: 'slope', size: vec(1, 1, 1) });
    expect(body.vacancies).toHaveLength(0);
    expect(incoming.position).toEqual(vec(9, 9, 9));
    expect(body.revision).toBe(2);
  });

  it('keeps incompatible holes for later and grows without resizing the pickup', () => {
    const body = structure([brick('core'), brick('lost', vec(1, 0, 0))]);
    damageStructure(body, 1, () => 0.9);
    const pickup = brick('long', vec(), vec(3, 0.4, 2));
    const result = attachPiece(body, pickup, seeded(88));
    expect(result?.mode).toBe('growth');
    expect(result?.piece.size).toEqual(pickup.size);
    expect(result?.piece.position.y).toBeGreaterThanOrEqual(0);
    expect(connectedToCore(body).size).toBe(2);
    for (const vacancy of body.vacancies) expect(overlaps(vacancy, result!.piece)).toBe(false);
  });

  it('preserves and fills the rest of a larger rectangular repair hole', () => {
    const body = structure([brick('core', vec(), vec(2, 1, 1)), brick('lost', vec(0, 1, 0), vec(2, 1, 1))]);
    damageStructure(body, 1, () => 0.9);
    const a = attachPiece(body, brick('a'), seeded(1));
    expect(a?.mode).toBe('repair');
    expect(body.vacancies.reduce((sum, piece) => sum + volume(piece), 0)).toBeCloseTo(1);
    const b = attachPiece(body, brick('b'), seeded(9));
    expect(b?.mode).toBe('repair');
    expect(body.vacancies).toHaveLength(0);
    expect(overlaps(a!.piece, b!.piece)).toBe(false);
  });

  it('restores the full hole when a partial repair is lost again', () => {
    const body = structure([brick('core', vec(), vec(2, 1, 1)), brick('lost', vec(0, 1, 0), vec(2, 1, 1))]);
    damageStructure(body, 1, () => 0.9);
    attachPiece(body, brick('small'), seeded(17));
    damageStructure(body, 1, () => 0.9);
    const result = attachPiece(body, brick('whole', vec(), vec(2, 1, 1)), seeded(20));
    expect(result?.mode).toBe('repair');
    expect(result?.piece.position).toEqual(vec(0, 1, 0));
    expect(body.vacancies).toHaveLength(0);
  });

  it('records lost growth positions and does not duplicate a repeatedly repaired vacancy', () => {
    const body = structure([brick('core')]);
    const grown = attachPiece(body, brick('new'), seeded(40))!;
    expect(grown.mode).toBe('growth');
    const position = { ...grown.piece.position };
    for (let i = 0; i < 8; i++) {
      damageStructure(body, 1, () => 0.9);
      expect(body.vacancies).toHaveLength(1);
      const result = attachPiece(body, brick(`repair${i}`), seeded(i))!;
      expect(result.mode).toBe('repair');
      expect(result.piece.position).toEqual(position);
      expect(body.vacancies).toHaveLength(0);
    }
  });

  it('assigns collision-free IDs without changing the designated Core', () => {
    const body = structure([brick('core')]);
    expect(attachPiece(body, brick('core'), seeded(11))?.piece.id).toBe('core~1');
    expect(attachPiece(body, brick('core'), seeded(12))?.piece.id).toBe('core~2');
    expect(body.coreId).toBe('core');
    expect(body.pieces.size).toBe(3);
  });

  it('keeps varied growing rectangles connected, above ground, and non-overlapping', () => {
    const body = structure([brick('core', vec(), vec(2, 1.2, 2))]);
    const random = seeded(180);
    for (let i = 0; i < 100; i++) {
      const incoming = brick(`p${i}`, vec(), vec(i % 3 + 1, i % 2 ? 0.4 : 1.2, i % 4 + 1));
      const result = attachPiece(body, incoming, random);
      expect(result).not.toBeNull();
      expect(result!.piece.position.y).toBeGreaterThanOrEqual(0);
      expect(result!.piece.size).toEqual(incoming.size);
    }
    const pieces = [...body.pieces.values()];
    expect(connectedToCore(body).size).toBe(pieces.length);
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) expect(overlaps(pieces[i], pieces[j])).toBe(false);
    }
  });

  it('rejects invalid incoming dimensions without a state mutation', () => {
    const body = structure([brick('core')]);
    expect(attachPiece(body, brick('bad', vec(), vec(0, 1, 1)))).toBeNull();
    expect(body.revision).toBe(0);
    expect(body.pieces.size).toBe(1);
  });
});
