import { describe, expect, it } from 'vitest';
import { attachPiece, createStructure, damageStructure, coreExposureThreshold } from './structure';
import type { CharacterTemplate, Piece } from './types';

const brick = (id: string, x = 0, y = 1): Piece => ({ id, position: { x, y, z: 0 }, size: { x: 1, y: 1, z: 1 }, color: '#abc', shape: 'brick' });
const rack = (count: number) => createStructure({ id: 'rack', name: 'Rack', accent: '#abc', subtitle: '', source: 'test', coreId: 'core', pieces: [
  { ...brick('core', 0, 0), size: { x: count - 1, y: 1, z: 1 } },
  ...Array.from({ length: count - 1 }, (_, i) => brick(`p${i}`, i)),
] });

describe('Core protection until 60% loss', () => {
  it('excludes Core even when the random source always picks the first eligible piece', () => {
    const body = rack(100);
    const hit = damageStructure(body, 10, () => 0);
    expect(hit.direct).toHaveLength(10);
    expect(hit.direct.some(piece => piece.id === 'core')).toBe(false);
    expect(body.pieces.size).toBe(90);
    expect(body.coreExposed).toBe(false);
    expect(hit.eliminated).toBe(false);
  });

  it('opens at exactly 40% remaining and can lose Core only on the next hit', () => {
    const body = rack(100);
    damageStructure(body, 59, () => 0);
    expect(body.pieces.size).toBe(41);
    expect(body.coreExposed).toBe(false);
    const thresholdHit = damageStructure(body, 1, () => 0);
    expect(body.pieces.size).toBe(40);
    expect(body.coreExposed).toBe(true);
    expect(thresholdHit.eliminated).toBe(false);
    expect(damageStructure(body, 1, () => 0).eliminated).toBe(true);
  });

  it('counts cascade losses toward exposure without turning the threshold into death', () => {
    const template: CharacterTemplate = { id: 'chain', name: 'Chain', accent: '', subtitle: '', source: 'test', coreId: 'core',
      pieces: Array.from({ length: 10 }, (_, i) => brick(i === 0 ? 'core' : `p${i}`, i, 0)) };
    const body = createStructure(template);
    const hit = damageStructure(body, 1, () => 0);
    expect(hit.direct).toHaveLength(1);
    expect(hit.cascade).toHaveLength(8);
    expect(body.coreExposed).toBe(true);
    expect(body.pieces.has('core')).toBe(true);
    expect(hit.eliminated).toBe(false);
  });

  it('preserves Core throughout an oversized hit and exposes it afterward', () => {
    const body = rack(10);
    const hit = damageStructure(body, 100, () => 0);
    expect(hit.direct).toHaveLength(9);
    expect(hit.eliminated).toBe(false);
    expect(body.coreExposed).toBe(true);
    expect(damageStructure(body, 1, () => 0).eliminated).toBe(true);
  });

  it('allows pickups to delay exposure without moving the round-start threshold', () => {
    const body = rack(10);
    damageStructure(body, 5, () => 0);
    expect(body.coreExposed).toBe(false);
    attachPiece(body, brick('loot'), () => 0);
    expect(body.pieces.size).toBe(6);
    damageStructure(body, 1, () => 0);
    expect(body.pieces.size).toBe(5);
    expect(body.coreExposed).toBe(false);
    expect(coreExposureThreshold(body)).toBe(4);
  });

  it('never restores protection after repairs in the same round', () => {
    const body = rack(10);
    const hit = damageStructure(body, 6, () => 0);
    for (const piece of hit.direct) expect(attachPiece(body, piece, () => 0)).not.toBeNull();
    expect(body.pieces.size).toBe(10);
    expect(body.roundStartPieces).toBe(10);
    expect(body.coreExposed).toBe(true);
    expect(damageStructure(body, 1, () => 0).eliminated).toBe(true);
  });

  it('handles fractional thresholds and a survivor consisting of only the Core', () => {
    const body = rack(11);
    expect(coreExposureThreshold(body)).toBe(4);
    damageStructure(body, 6, () => 0);
    expect(body.coreExposed).toBe(false);
    damageStructure(body, 1, () => 0);
    expect(body.coreExposed).toBe(true);
    const coreOnly = createStructure({ id: 'one', name: '', subtitle: '', accent: '', source: '', coreId: 'core', pieces: [brick('core')] });
    expect(damageStructure(coreOnly, 1).eliminated).toBe(true);
  });
});
