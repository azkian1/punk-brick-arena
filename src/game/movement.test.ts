import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { createDash, movePlayer, startDash } from './movement';

const body = () => ({ x: 0, z: 0, vx: 0, vz: 0, radius: 4 });
describe('player dash', () => {
  it('travels the same distance diagonally and straight, with no residual dash speed', () => {
    const positions = [];
    for (const [x, z] of [[1, 0], [1, 1]]) {
      const player = body(), dash = createDash();
      expect(startDash(dash, x, z, -1, 0)).toBe(true);
      movePlayer(player, dash, x, z, CONFIG.dashDuration);
      positions.push(Math.hypot(player.x, player.z));
      expect(Math.hypot(player.vx, player.vz)).toBeCloseTo(CONFIG.movementSpeed);
    }
    expect(positions[0]).toBeCloseTo(positions[1]);
    expect(positions[0]).toBeGreaterThan(CONFIG.movementSpeed * CONFIG.dashDuration * 3);
  });
  it('uses aim when stationary and locks direction until the dash ends', () => {
    const player = body(), dash = createDash();
    expect(startDash(dash, 0, 0, -10, 0)).toBe(true);
    movePlayer(player, dash, 0, 1, 0.1);
    expect(player.x).toBeLessThan(-5); expect(player.z).toBe(0);
    expect(startDash(dash, 0, 1, 1, 1)).toBe(false);
  });
  it('requires the cooldown to expire and resets ready for a fresh round', () => {
    const player = body(), dash = createDash();
    startDash(dash, 1, 0, 0, 0);
    for (let i = 0; i < 120; i++) movePlayer(player, dash, 0, 0, 1 / 60);
    expect(startDash(dash, -1, 0, 0, 0)).toBe(false);
    for (let i = 0; i < 25; i++) movePlayer(player, dash, 0, 0, 1 / 60);
    expect(startDash(dash, -1, 0, 0, 0)).toBe(true);
    expect(startDash(createDash(), 1, 0, 0, 0)).toBe(true);
  });
  it('keeps the whole fighter inside the arena even when dashing into a corner', () => {
    const player = { ...body(), x: 30, z: 30, radius: 8 }, dash = createDash();
    startDash(dash, 1, 1, 0, 0);
    movePlayer(player, dash, 1, 1, 0.3);
    expect(player.x + player.radius).toBeLessThanOrEqual(CONFIG.arenaWidth / 2);
    expect(player.z + player.radius).toBeLessThanOrEqual(CONFIG.arenaDepth / 2);
    expect(Number.isFinite(player.vx)).toBe(true);
  });
});
