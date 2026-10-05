import { describe, expect, it } from 'vitest';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { attachPiece, connectedToCore, createStructure, damageStructure } from './structure';
import type { DamageResult, Piece, Random } from './types';
import { CONFIG } from './config';

const seeded = (initial: number): Random => {
  let state = initial;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};
const axes = ['x', 'y', 'z'] as const;
const overlaps = (a: Piece, b: Piece) => axes.every(axis =>
  Math.min(a.position[axis] + a.size[axis], b.position[axis] + b.size[axis]) -
  Math.max(a.position[axis], b.position[axis]) > 1e-6);

describe('authentic generator assets through a complete combat and collection loop', () => {
  it.each(CHARACTER_TEMPLATES)('$name: starting power removes ten distinct pieces before the cascade', template => {
    const body = createStructure(template);
    const hit = damageStructure(body, CONFIG.projectilePower, seeded(73));
    expect(hit.direct).toHaveLength(10);
    expect(new Set(hit.direct.map(piece => piece.id)).size).toBe(10);
    expect(body.pieces.size + hit.direct.length + hit.cascade.length).toBe(template.pieces.length);
  });

  for (const [index, targetTemplate] of CHARACTER_TEMPLATES.entries()) {
    it(`${targetTemplate.name}: conserves pieces through repair, growth, cascades and Core defeat`, () => {
      const templatesBefore = JSON.stringify(CHARACTER_TEMPLATES);
      const collectorTemplate = CHARACTER_TEMPLATES[(index + 1) % CHARACTER_TEMPLATES.length];
      const target = createStructure(targetTemplate);
      const collector = createStructure(collectorTemplate);
      const totalPieces = target.pieces.size + collector.pieces.size;
      const ground = new Map<string, Piece>();
      const collected = new Set<string>();
      const targetLosses = new Set<string>();
      const hitRandom = seeded(42);
      const placementRandom = seeded(314159);
      let repairCount = 0;
      let growthCount = 0;
      let nonFatalCascadeCount = 0;
      let directCount = 0;
      let cascadeCount = 0;

      const accountForFallenPieces = (result: DamageResult) => {
        const fallen = [...result.direct, ...result.cascade];
        expect(new Set(fallen.map(piece => piece.id)).size).toBe(fallen.length);
        for (const piece of fallen) {
          expect(ground.has(piece.id)).toBe(false);
          ground.set(piece.id, piece);
        }
        expect(target.pieces.size + collector.pieces.size + ground.size).toBe(totalPieces);
      };

      const collectGround = () => {
        for (const [id, piece] of ground) {
          const previousCount = collector.pieces.size;
          const attached = attachPiece(collector, piece, placementRandom);
          expect(attached).not.toBeNull();
          if (!attached) continue;
          expect(collected.has(id)).toBe(false);
          collected.add(id);
          // Asset IDs are globally unique, so transfers must preserve their identity.
          expect(attached.piece.id).toBe(id);
          expect(attached.piece.color).toBe(piece.color);
          expect(attached.piece.shape).toBe(piece.shape);
          expect(attached.piece.size).toEqual(piece.size);
          expect(attached.piece.position.y).toBeGreaterThanOrEqual(0);
          expect(collector.pieces.size).toBe(previousCount + 1);
          const collision = [...collector.pieces.values()].find(other =>
            other.id !== id && overlaps(attached.piece, other));
          expect(collision?.id).toBeUndefined();
          if (attached.mode === 'repair') repairCount++;
          else growthCount++;
          ground.delete(id);
        }
        expect(ground.size).toBe(0);
        expect(connectedToCore(collector).size).toBe(collector.pieces.size);
        expect(target.pieces.size + collector.pieces.size).toBe(totalPieces);
      };

      expect(connectedToCore(target).size).toBe(targetTemplate.pieces.length);
      expect(connectedToCore(collector).size).toBe(collectorTemplate.pieces.length);

      // Give the collector a real asset vacancy before feeding it the opponent's pieces.
      // Selecting its first non-Core brick makes this preparatory wound nonlethal.
      const woundIndex = collectorTemplate.pieces.findIndex(piece => piece.id !== collectorTemplate.coreId);
      const wound = damageStructure(collector, 1,
        () => (woundIndex + 0.5) / collectorTemplate.pieces.length);
      expect(wound.eliminated).toBe(false);
      expect(wound.direct).toHaveLength(1);
      accountForFallenPieces(wound);
      collectGround();
      expect(repairCount).toBeGreaterThan(0);

      let eliminated = false;
      let shots = 0;
      // No pieces return to the target: each positive hit shrinks it, bounding the match.
      while (!eliminated && shots < targetTemplate.pieces.length) {
        const previousCount = target.pieces.size;
        const eligibleCount = previousCount - (target.coreExposed ? 0 : 1);
        const power = shots % 2 === 0 ? 3 : 7;
        const hit = damageStructure(target, power, hitRandom);
        shots++;
        expect(hit.direct).toHaveLength(Math.min(power, eligibleCount));
        expect(previousCount - target.pieces.size).toBe(hit.direct.length + hit.cascade.length);
        expect(hit.eliminated).toBe(!target.pieces.has(target.coreId));
        for (const piece of [...hit.direct, ...hit.cascade]) {
          expect(targetLosses.has(piece.id)).toBe(false);
          targetLosses.add(piece.id);
          expect(target.pieces.has(piece.id)).toBe(false);
        }
        directCount += hit.direct.length;
        cascadeCount += hit.cascade.length;
        if (!hit.eliminated) nonFatalCascadeCount += hit.cascade.length;
        accountForFallenPieces(hit);
        expect(connectedToCore(target).size).toBe(target.pieces.size);
        collectGround();
        eliminated = hit.eliminated;
      }

      expect(eliminated).toBe(true);
      expect(shots).toBeGreaterThan(1);
      expect(target.pieces.size).toBe(0);
      expect(targetLosses.size).toBe(targetTemplate.pieces.length);
      expect(directCount + cascadeCount).toBe(targetTemplate.pieces.length);
      expect(nonFatalCascadeCount).toBeGreaterThan(0);
      expect(growthCount).toBeGreaterThan(0);
      expect(collector.pieces.size).toBe(totalPieces);
      expect(collected.size).toBe(targetTemplate.pieces.length + wound.direct.length + wound.cascade.length);
      expect(attachPiece(target, wound.direct[0], placementRandom)).toBeNull();
      expect(JSON.stringify(CHARACTER_TEMPLATES)).toBe(templatesBefore);
    });
  }
});
