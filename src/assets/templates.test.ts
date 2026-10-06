import { describe, expect, it, vi } from 'vitest';
import { CHARACTER_TEMPLATES } from './templates';
import { CHARACTER_CATALOG, characterPortrait } from './catalog';
import provenance from './provenance.json';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Piece } from '../game/types';

const axes = ['x', 'y', 'z'] as const;
const epsilon = 1e-6;
function contact(a: Piece, b: Piece): boolean {
  const overlap = axes.map(axis =>
    Math.min(a.position[axis] + a.size[axis], b.position[axis] + b.size[axis])
      - Math.max(a.position[axis], b.position[axis]));
  return overlap.filter(length => Math.abs(length) < epsilon).length === 1
    && overlap.every(length => length > -epsilon);
}

describe('offline source assets', () => {
  it('contains all 17 authentic examples with matching, unmodified portraits', () => {
    expect(CHARACTER_CATALOG.map(entry => entry.file)).toEqual([
      'reference', 'a-1', 'b-1', 'b-2', 'b-3', 'b-4', 'b-5', 'b-6',
      'c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'c-6', 'c-7', 'c-8', 'c-9',
    ]);
    expect(CHARACTER_TEMPLATES.map(t => t.id)).toEqual(CHARACTER_CATALOG.map(entry => entry.id));
    expect(new Set(CHARACTER_TEMPLATES.map(t => t.id)).size).toBe(17);
    expect(CHARACTER_TEMPLATES.slice(0, 3).map(t => [t.id, t.pieces.length])).toEqual([
      ['violet', 423], ['flare', 499], ['ranger', 446],
    ]);
    for (const [index, template] of CHARACTER_TEMPLATES.entries()) {
      const file = CHARACTER_CATALOG[index].file;
      expect(template.source).toBe(`${provenance.repository}/blob/${provenance.commit}/public/examples/${file}.png`);
      const portrait = characterPortrait(template.id);
      expect(portrait).toBe(`${import.meta.env.BASE_URL}assets/source/${file}.png`);
      const png = readFileSync(new URL(`../../public/assets/source/${file}.png`, import.meta.url));
      const hash = createHash('sha1').update(`blob ${png.length}\0`).update(png).digest('hex');
      expect(hash).toBe(provenance.files.find(entry => entry.path === `public/examples/${file}.png`)?.gitBlobSha);
    }
  });

  it('keeps all portrait URLs within the GitHub Pages project path', () => {
    vi.stubEnv('BASE_URL', '/punk-brick-arena/');
    try {
      for (const entry of CHARACTER_CATALOG) {
        expect(characterPortrait(entry.id)).toBe(`/punk-brick-arena/assets/source/${entry.file}.png`);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  for (const template of CHARACTER_TEMPLATES) {
    describe(template.name, () => {
      it('has unique IDs, valid dimensions and colors, a Core, and a grounded origin', () => {
        expect(new Set(template.pieces.map(p => p.id)).size).toBe(template.pieces.length);
        expect(template.pieces.find(p => p.id === template.coreId)).toBeDefined();
        expect(Math.min(...template.pieces.map(p => p.position.y))).toBe(0);
        for (const piece of template.pieces) {
          expect(piece.color).toMatch(/^#[0-9a-f]{6}$/i);
          for (const axis of axes) {
            expect(Number.isFinite(piece.position[axis])).toBe(true);
            expect(Number.isFinite(piece.size[axis]) && piece.size[axis] > 0).toBe(true);
          }
        }
      });

      it('has no overlapping solid brick volumes after coordinate conversion', () => {
        const overlaps: string[] = [];
        for (let i = 0; i < template.pieces.length; i++) {
          const a = template.pieces[i];
          for (const b of template.pieces.slice(i + 1)) {
            if (axes.every(axis => Math.min(a.position[axis] + a.size[axis], b.position[axis] + b.size[axis])
              - Math.max(a.position[axis], b.position[axis]) > epsilon)) overlaps.push(`${a.id}/${b.id}`);
          }
        }
        expect(overlaps).toEqual([]);
      });

      it('connects every initial piece to Core via a face with positive contact area', () => {
        const pending = new Map(template.pieces.map(piece => [piece.id, piece]));
        const queue = [pending.get(template.coreId)!];
        pending.delete(template.coreId);
        for (let i = 0; i < queue.length; i++) {
          for (const [id, piece] of pending) {
            if (contact(queue[i], piece)) { pending.delete(id); queue.push(piece); }
          }
        }
        expect([...pending.keys()]).toEqual([]);
      });
    });
  }
});
