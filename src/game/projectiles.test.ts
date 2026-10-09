import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { debrisFloorY } from './debris';
import { canCollectDrop } from './pickup';
import { createPartProjectile, projectileGroupFloorY, projectileGroupRadius, projectilePartOffsets,
  SHOT_PICKUP_LOCK, stepPartProjectile } from './projectiles';
import type { Piece } from './types';

const piece: Piece = {
  id: 'actual/ammo', position: { x: 4, y: 8, z: -2 }, size: { x: 4, y: 0.4, z: 2 },
  color: '#a52cfa', shape: 'slope',
};
const limitX = () => CONFIG.arenaWidth / 2 - Math.hypot(piece.size.x, piece.size.z) * CONFIG.characterScale / 2;
const limitZ = () => CONFIG.arenaDepth / 2 - Math.hypot(piece.size.x, piece.size.z) * CONFIG.characterScale / 2;
const randomSequence = (values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

describe('physical real-part projectiles', () => {
  it('retains the exact inventory part and returns level start/end movement for a live shot', () => {
    const identity = structuredClone(piece), projectile = createPartProjectile(piece, 'player', 0, 0, 30, 40);
    expect(projectile.piece).toBe(piece);
    expect(projectile.vx).toBeCloseTo(CONFIG.projectileSpeed * 0.6);
    expect(projectile.vz).toBeCloseTo(CONFIG.projectileSpeed * 0.8);
    const result = stepPartProjectile(projectile, 0.1);
    expect(result).toMatchObject({
      from: { x: 0, y: 3.2, z: 0 },
      to: { y: 3.2 },
      canHit: true, landed: false, rebounded: false,
    });
    expect(result.to.x).toBeCloseTo(CONFIG.projectileSpeed * 0.06);
    expect(result.to.z).toBeCloseTo(CONFIG.projectileSpeed * 0.08);
    expect(piece).toEqual(identity);
    expect(projectile.age).toBe(0.1);
    expect(projectile.settled).toBe(false);
  });

  it('launches an outward shot upward at the exact edge and suppresses rebound damage', () => {
    const projectile = createPartProjectile(piece, 'player', limitX() - 1, 0, limitX() + 20, 0);
    const result = stepPartProjectile(projectile, 1 / CONFIG.projectileSpeed, () => 0.5);
    expect(result.rebounded).toBe(true);
    expect(result.canHit).toBe(false);
    expect(projectile.mode).toBe('rebound');
    expect(projectile.x).toBeCloseTo(limitX());
    expect(projectile.vx).toBeLessThan(0);
    expect(projectile.vy).toBeGreaterThan(0);
    expect(projectile.age).toBeCloseTo(1 / CONFIG.projectileSpeed);
    const initialY = projectile.y;
    expect(stepPartProjectile(projectile, 0.1).canHit).toBe(false);
    expect(projectile.y).toBeGreaterThan(initialY);
  });

  it('keeps missed parts forever, lands inside with their complete footprint, and preserves firing age', () => {
    const projectile = createPartProjectile(piece, 'enemy', 0, 0, 50, -50);
    const result = stepPartProjectile(projectile, 100, randomSequence([0, 1, 0.3]));
    expect(result.rebounded).toBe(true);
    expect(result.landed).toBe(true);
    expect(projectile.piece).toBe(piece);
    expect(projectile.mode).toBe('rebound');
    expect(projectile.settled).toBe(true);
    expect(projectile.age).toBe(100);
    expect(Math.abs(projectile.x)).toBeLessThanOrEqual(limitX());
    expect(Math.abs(projectile.z)).toBeLessThanOrEqual(limitZ());
    expect(projectile.y).toBe(debrisFloorY(piece));
    expect([projectile.vx, projectile.vy, projectile.vz]).toEqual([0, 0, 0]);
    const position = { x: projectile.x, y: projectile.y, z: projectile.z };
    expect(stepPartProjectile(projectile, 3)).toMatchObject({ from: position, to: position, landed: false, canHit: false });
    expect(projectile.age).toBe(103);
  });

  it('chooses different interior targets and makes the same landing with coarse or fine time steps', () => {
    const coarse = createPartProjectile(piece, 'player', 0, 0, 100, 80);
    const fine = createPartProjectile(piece, 'player', 0, 0, 100, 80);
    stepPartProjectile(coarse, 4, randomSequence([0.2, 0.7, 0.4]));
    const random = randomSequence([0.2, 0.7, 0.4]);
    for (let i = 0; i < 400; i++) stepPartProjectile(fine, 0.01, random);
    expect(fine.settled).toBe(true);
    expect(fine.x).toBeCloseTo(coarse.x, 8);
    expect(fine.y).toBeCloseTo(coarse.y, 8);
    expect(fine.z).toBeCloseTo(coarse.z, 8);
    expect(fine.age).toBeCloseTo(coarse.age, 8);
    const other = createPartProjectile(piece, 'player', 0, 0, 100, 80);
    stepPartProjectile(other, 4, randomSequence([0.8, 0.1, 0.4]));
    expect(other.x).not.toBeCloseTo(coarse.x);
    expect(other.z).not.toBeCloseTo(coarse.z);
  });

  it('locks all collectors until five seconds since firing and also requires landing', () => {
    const projectile = createPartProjectile(piece, 'player', limitX() - 0.5, 0, limitX() + 1, 0);
    stepPartProjectile(projectile, 3, () => 0.5);
    expect(projectile.settled).toBe(true);
    const drop = () => ({ ...projectile, lockedUntilAge: SHOT_PICKUP_LOCK });
    for (const collector of ['player', 'enemy', 'third']) expect(canCollectDrop(drop(), collector)).toBe(false);
    stepPartProjectile(projectile, 2);
    expect(projectile.age).toBe(5);
    for (const collector of ['player', 'enemy', 'third']) expect(canCollectDrop(drop(), collector)).toBe(true);
    for (const collector of ['player', 'enemy']) expect(canCollectDrop({ ...drop(), settled: false }, collector)).toBe(false);
  });

  it('always launches a raised arc even from a high firing point', () => {
    const projectile = createPartProjectile(piece, 'player', limitX(), 0, 100, 0, 40);
    stepPartProjectile(projectile, 0.01, () => 0);
    expect(projectile.mode).toBe('rebound');
    expect(projectile.vy).toBeGreaterThan(0);
    expect(projectile.y).toBeGreaterThan(40);
    stepPartProjectile(projectile, 20);
    expect(projectile.settled).toBe(true);
    expect(projectile.y).toBe(debrisFloorY(piece));
  });

  it('handles coincident aim and nonpositive time without invalid state or inventory mutation', () => {
    const projectile = createPartProjectile(piece, 'player', 0, 0, 0, 0);
    expect(projectile.vx).toBe(CONFIG.projectileSpeed);
    expect(projectile.vz).toBe(0);
    const initial = { ...projectile };
    stepPartProjectile(projectile, -1);
    stepPartProjectile(projectile, Number.NaN);
    expect(projectile).toEqual(initial);
    stepPartProjectile(projectile, 100, randomSequence([Number.NaN, -2, 9]));
    expect(projectile.settled).toBe(true);
    expect(Number.isFinite(projectile.x + projectile.y + projectile.z)).toBe(true);
    expect(Math.abs(projectile.x)).toBeLessThan(limitX());
    expect(Math.abs(projectile.z)).toBeLessThan(limitZ());
  });

  it('rejects twelve covered samples then uses a free fallback inside the short-distance ring', () => {
    const projectile = createPartProjectile(piece, 'player', limitX() - 0.5, 0, 100, 0);
    const checks: { x: number; z: number; radius: number }[] = [];
    const targetX = limitX() * 0.99;
    const valid = (x: number, z: number, radius: number) => {
      checks.push({ x, z, radius });
      return Math.abs(x - targetX) < 1e-9 && Math.abs(z) < 1e-9;
    };
    const step = stepPartProjectile(projectile, 0.5 / CONFIG.projectileSpeed, () => 1, valid);
    expect(checks).toHaveLength(13);
    expect(checks[12].x).toBeCloseTo(targetX);
    expect(checks[12].z).toBeCloseTo(0);
    expect(checks[12].radius).toBe(Math.hypot(piece.size.x, piece.size.z) * CONFIG.characterScale / 2);
    expect(step.rebounded).toBe(true);
    expect(step.canHit).toBe(false);
    expect(projectile.vy).toBeGreaterThan(0);
    expect(projectile.settled).toBe(false);
    stepPartProjectile(projectile, 4, () => 1, valid);
    expect(projectile.x).toBeCloseTo(targetX);
    expect(projectile.z).toBeCloseTo(0);
    expect(projectile.settled).toBe(true);
    expect(projectile.piece).toBe(piece);
    expect(projectile.age).toBeCloseTo(4 + 0.5 / CONFIG.projectileSpeed);
  });

  it('finds a deterministic free point in the bounded ring when random samples are blocked', () => {
    const projectile = createPartProjectile(piece, 'player', 0, 0, 100, 0);
    const targetX = limitX() * 0.93, targetZ = 0;
    const valid = (x: number, z: number) => Math.abs(x - targetX) < 1e-9 && Math.abs(z - targetZ) < 1e-9;
    const step = stepPartProjectile(projectile, 10, () => 1, valid);
    expect(step.rebounded).toBe(true);
    expect(step.landed).toBe(true);
    expect(projectile.x).toBeCloseTo(targetX);
    expect(projectile.z).toBeCloseTo(targetZ);
    expect(valid(projectile.x, projectile.z)).toBe(true);
    expect(projectile.age).toBe(10);
  });

  it('retains a nondamaging airborne part and retries later if every landing candidate is temporarily blocked', () => {
    const projectile = createPartProjectile(piece, 'enemy', 0, 0, 100, 0);
    const blocked = stepPartProjectile(projectile, 10, () => 1, () => false);
    expect(blocked.canHit).toBe(false);
    expect(blocked.landed).toBe(false);
    expect(projectile.mode).toBe('rebound');
    expect(projectile.awaitingLandingPoint).toBe(true);
    expect(projectile.settled).toBe(false);
    expect(projectile.piece).toBe(piece);
    expect(projectile.age).toBe(10);
    const recovered = stepPartProjectile(projectile, 10, () => 1, (x, z) => Math.abs(x - limitX() * 0.99) < 1e-9 && Math.abs(z) < 1e-9);
    expect(recovered.rebounded).toBe(true);
    expect(recovered.landed).toBe(true);
    expect(projectile.awaitingLandingPoint).toBeUndefined();
    expect(projectile.x).toBeCloseTo(limitX() * 0.99);
    expect(projectile.z).toBeCloseTo(0);
    expect(projectile.piece).toBe(piece);
    expect(projectile.age).toBe(20);
  });

  it('never uses a distant free center when the entire allowed short-distance ring is blocked', () => {
    const projectile = createPartProjectile(piece, 'player', limitX(), 0, 100, 0);
    stepPartProjectile(projectile, 100, () => 0.5, (x, z) => Math.hypot(x, z) < 1);
    expect(projectile.awaitingLandingPoint).toBe(true);
    expect(projectile.settled).toBe(false);
    expect(projectile.x).toBeCloseTo(limitX());
    expect(projectile.pieces).toEqual([piece]);
    expect(projectile.age).toBe(100);
  });

  it.each([1, 3, 20])('packs %i exact real parts compactly without overlap or resizing and counts actual damage', count => {
    const pieces = Array.from({ length: count }, (_, i): Piece => ({
      ...piece, id: `volley/${i}`, size: { x: i % 3 + 1, y: i % 2 ? 0.4 : 1.2, z: i % 2 + 1 },
      color: i % 2 ? '#11aaff' : '#fe7711', shape: i % 2 ? 'plate' : 'brick',
    }));
    const identity = structuredClone(pieces), offsets = projectilePartOffsets(pieces);
    const projectile = createPartProjectile(pieces, 'player', 0, 0, 50, 0);
    expect(projectile.pieces).not.toBe(pieces);
    expect(projectile.damage).toBe(count);
    expect(projectile.piece).toBe(pieces[0]);
    expect(projectile.radius).toBe(projectileGroupRadius(pieces));
    for (let i = 0; i < count; i++) {
      expect(projectile.pieces[i]).toBe(pieces[i]);
      const farCorner = Math.hypot(Math.abs(offsets[i].x) + pieces[i].size.x * CONFIG.characterScale / 2,
        Math.abs(offsets[i].z) + pieces[i].size.z * CONFIG.characterScale / 2);
      expect(farCorner).toBeLessThanOrEqual(projectile.radius + 1e-9);
      expect(projectileGroupFloorY(pieces) + offsets[i].y).toBeGreaterThanOrEqual(debrisFloorY(pieces[i]) - 1e-9);
      for (let j = i + 1; j < count; j++) expect((['x', 'y', 'z'] as const).some(axis =>
        Math.abs(offsets[i][axis] - offsets[j][axis]) >= (pieces[i].size[axis] + pieces[j].size[axis]) * CONFIG.characterScale / 2)).toBe(true);
    }
    stepPartProjectile(projectile, 100, () => 0.5);
    expect(projectile.settled).toBe(true);
    expect(new Set(projectile.pieces).size).toBe(count);
    expect(pieces).toEqual(identity);
    expect(projectile.y).toBe(projectileGroupFloorY(pieces));
  });

  it.each([0, 1])('lands at the exact range endpoint for random fraction %i', fraction => {
    const edge = { x: limitX(), z: 0 }, projectile = createPartProjectile(piece, 'player', edge.x, edge.z, 100, 0);
    stepPartProjectile(projectile, 100, randomSequence([fraction, 0.5]));
    const distance = Math.hypot(projectile.x - edge.x, projectile.z - edge.z);
    expect(distance).toBeCloseTo(Math.hypot(edge.x, edge.z) * (fraction ? 0.33 : 0.01));
    expect(projectile.settled).toBe(true);
  });

  it('keeps randomized inward landings within one to thirty-three percent at every side and corner', () => {
    const locations = [[limitX(), 0], [-limitX(), 0], [0, limitZ()], [0, -limitZ()],
      [limitX(), limitZ()], [-limitX(), limitZ()], [limitX(), -limitZ()], [-limitX(), -limitZ()]];
    for (const [x, z] of locations) for (let i = 0; i < 12; i++) {
      const projectile = createPartProjectile(piece, 'player', x, z, x * 2, z * 2);
      stepPartProjectile(projectile, 100, randomSequence([i / 11, (11 - i) / 11]));
      const range = Math.hypot(projectile.x - x, projectile.z - z), center = Math.hypot(x, z);
      expect(projectile.settled).toBe(true);
      expect(range).toBeGreaterThanOrEqual(center * 0.01 - 1e-8);
      expect(range).toBeLessThanOrEqual(center * 0.33 + 1e-8);
      expect(Math.hypot(projectile.x, projectile.z)).toBeLessThan(center);
      expect(Math.abs(projectile.x)).toBeLessThanOrEqual(limitX() + 1e-8);
      expect(Math.abs(projectile.z)).toBeLessThanOrEqual(limitZ() + 1e-8);
    }
  });

  it.each([1, 3, 20])('caps complete 3D speed throughout the upward and falling arcs of a %i-part volley', count => {
    const pieces = Array.from({ length: count }, (_, i) => ({ ...piece, id: `speed/${i}` }));
    for (const y of [3.2, 12, 20, 40, 1000]) {
      const radius = projectileGroupRadius(pieces), edgeX = CONFIG.arenaWidth / 2 - radius;
      const projectile = createPartProjectile(pieces, 'player', edgeX, 0, 1000, 0, y);
      const originalSpeed = Math.hypot(projectile.vx, projectile.vy, projectile.vz);
      const launch = stepPartProjectile(projectile, 0.000001, randomSequence([1, 0.5]));
      expect(launch.rebounded).toBe(true);
      expect(projectile.vy).toBeGreaterThan(0);
      let peak = Math.hypot(projectile.vx, projectile.vy, projectile.vz), falling = false, frames = 0;
      while (!projectile.settled && frames++ < 20000) {
        stepPartProjectile(projectile, 1 / 120);
        peak = Math.max(peak, Math.hypot(projectile.vx, projectile.vy, projectile.vz));
        falling ||= projectile.vy < 0;
      }
      expect(falling).toBe(true);
      expect(projectile.settled).toBe(true);
      expect(peak).toBeLessThanOrEqual(originalSpeed + 1e-8);
      expect(projectile.shotSpeed).toBe(originalSpeed);
      expect(projectile.pieces).toHaveLength(count);
      expect(projectile.y).toBe(projectileGroupFloorY(pieces));
    }
  });

  it('rejects an empty volley rather than inventing a first part', () => {
    expect(() => createPartProjectile([], 'player', 0, 0, 10, 0)).toThrow(/real ammunition/);
  });
});
