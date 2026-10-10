import { describe, expect, it } from 'vitest';
import { segmentBuildingHit, type ArenaBuilding } from './arena';
import { segmentCircleHit } from './collision';
import { CONFIG } from './config';
import { createStructure, getBounds } from './structure';
import type { Piece } from './types';

interface Box { minX: number; maxX: number; minZ: number; maxZ: number }
// The previous allocating face-strip/corner algorithm is an independent
// reference for the optimized broadphase and local-coordinate implementation.
function referenceRect(ax: number, az: number, bx: number, bz: number, box: Box): number | null {
  let enter = 0, exit = 1;
  for (const [start, delta, min, max] of [[ax, bx - ax, box.minX, box.maxX], [az, bz - az, box.minZ, box.maxZ]]) {
    if (Math.abs(delta) < 1e-6) { if (start < min - 1e-6 || start > max + 1e-6) return null; }
    else {
      const a = (min - start) / delta, b = (max - start) / delta;
      enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      if (enter > exit + 1e-6) return null;
    }
  }
  return enter >= 0 && enter <= 1 ? enter : null;
}
function reference(ax: number, az: number, bx: number, bz: number, box: Box, radius: number): number | null {
  if (radius <= 1e-6) return referenceRect(ax, az, bx, bz, box);
  const hits = [referenceRect(ax, az, bx, bz, { ...box, minX: box.minX - radius, maxX: box.maxX + radius }),
    referenceRect(ax, az, bx, bz, { ...box, minZ: box.minZ - radius, maxZ: box.maxZ + radius }),
    ...[box.minX, box.maxX].flatMap(x => [box.minZ, box.maxZ].map(z => segmentCircleHit(ax, az, bx, bz, x, z, radius)))];
  const valid = hits.filter((hit): hit is number => hit !== null);
  return valid.length ? Math.min(...valid) : null;
}

describe('allocation-free cover sweep preserves exact hit geometry', () => {
  it('matches the previous exact union for moving/stationary rays, rounded corners, wide shots, holes and translations', () => {
    const part = (id: string, x: number, z: number, width: number, depth: number): Piece => ({
      id, position: { x, y: 0, z }, size: { x: width, y: 1.2, z: depth }, color: '#88a078', shape: 'brick' });
    const pieces = [part('core', 0, 0, 8, 2), part('upright', 0, 2, 2, 6), part('island', 12, 0, 2, 2)];
    const structure = createStructure({ id: 'sweep', name: 'Sweep', subtitle: '', accent: '#fff', source: 'fixture', coreId: 'core', pieces });
    const building: ArenaBuilding = { id: 'sweep', template: 'ruin', structure, bounds: getBounds(structure), x: 17.3, z: -24.7 };
    const boxes = pieces.map(piece => ({ minX: building.x + piece.position.x * CONFIG.characterScale,
      maxX: building.x + (piece.position.x + piece.size.x) * CONFIG.characterScale,
      minZ: building.z + piece.position.z * CONFIG.characterScale, maxZ: building.z + (piece.position.z + piece.size.z) * CONFIG.characterScale }));
    let seed = 0xa7489;
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223; return (seed >>> 0) / 4294967296; };
    for (let trial = 0; trial < 2400; trial++) {
      const ax = building.x - 8 + random() * 25, az = building.z - 8 + random() * 20;
      const bx = trial % 7 === 0 ? ax : building.x - 8 + random() * 25;
      const bz = trial % 7 === 0 ? az : building.z - 8 + random() * 20;
      const radius = [0, .01, .3, 2.2, 6][trial % 5];
      const expected = Math.min(...boxes.map(box => reference(ax, az, bx, bz, box, radius) ?? Infinity));
      const actual = segmentBuildingHit(ax, az, bx, bz, building, radius);
      if (expected === Infinity) expect(actual).toBeNull();
      else { expect(actual).not.toBeNull(); expect(actual!).toBeCloseTo(expected, 10); }
    }
  });
});
