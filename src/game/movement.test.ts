import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { createDash, moveDashingBody, movePlayer, startDash } from './movement';
import { resolveArenaBuildings, segmentBuildingHit, type ArenaBuilding } from './arena';
import { createStructure, getBounds } from './structure';
import { CHARACTER_TEMPLATES } from '../assets/templates';

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

describe('shared bot dash', () => {
  it.each([9, CONFIG.botSpeed, 24])('uses the actual base speed %s for exactly the configured duration', speed => {
    const bot = body(), dash = createDash();
    startDash(dash, 1, 0, 0, 1);
    moveDashingBody(bot, dash, 1, 0, speed, CONFIG.dashDuration + .07);
    expect(bot.x).toBeCloseTo(speed * (CONFIG.dashSpeedMultiplier * CONFIG.dashDuration + .07));
    expect(bot.z).toBe(0);
    expect(dash.remaining).toBe(0);
    expect(Math.hypot(bot.vx, bot.vz)).toBeCloseTo(speed);
    expect(dash.cooldown).toBeCloseTo(CONFIG.dashCooldown - CONFIG.dashDuration - .07);
  });

  it('normalizes bot dash direction and gives the same distance across frame subdivisions', () => {
    const distances = [];
    for (const steps of [1, 12]) {
      const bot = body(), dash = createDash();
      startDash(dash, 3, 4, 0, 0);
      for (let i = 0; i < steps; i++) moveDashingBody(bot, dash, -1, 0, CONFIG.botSpeed, CONFIG.dashDuration / steps);
      distances.push(Math.hypot(bot.x, bot.z));
      expect(bot.x / bot.z).toBeCloseTo(3 / 4);
      expect(dash.remaining).toBeCloseTo(0);
    }
    expect(distances[0]).toBeCloseTo(distances[1]);
    expect(distances[0]).toBeCloseTo(CONFIG.botSpeed * CONFIG.dashSpeedMultiplier * CONFIG.dashDuration);
  });

  it('freezes timers and position without elapsed simulation time and cannot borrow another bot cooldown', () => {
    const bot = body(), dash = createDash(), other = createDash();
    startDash(dash, 1, 0, 0, 0);
    moveDashingBody(bot, dash, 1, 0, CONFIG.botSpeed, .06);
    const savedBody = { ...bot }, savedDash = { ...dash };
    moveDashingBody(bot, dash, -1, 0, CONFIG.botSpeed, 0);
    expect(bot).toEqual(savedBody);
    expect(dash).toEqual(savedDash);
    expect(startDash(dash, -1, 0, 0, 0)).toBe(false);
    expect(startDash(other, -1, 0, 0, 0)).toBe(true);
    moveDashingBody(bot, dash, 0, 0, CONFIG.botSpeed, CONFIG.dashCooldown - .06 - .001);
    expect(startDash(dash, -1, 0, 0, 0)).toBe(false);
    moveDashingBody(bot, dash, 0, 0, CONFIG.botSpeed, .001);
    expect(startDash(dash, -1, 0, 0, 0)).toBe(true);
  });

  it.each([1, 12])('resolves a complete bot dash continuously against cover over %i movement step(s)', steps => {
    const structure = createStructure({ ...CHARACTER_TEMPLATES[0], coreId: 'dash/wall', pieces: [{
      id: 'dash/wall', position: { x: -2, y: 0, z: -6 }, size: { x: 4, y: 1.2, z: 12 }, color: '#555555', shape: 'brick',
    }] });
    const building: ArenaBuilding = { id: 'dash/wall', template: 'wall', x: 5, z: 0, structure, bounds: getBounds(structure) };
    const bot = { ...body(), radius: .5 }, dash = createDash();
    startDash(dash, 1, 0, 0, 0);
    for (let i = 0; i < steps; i++) {
      const previous = { x: bot.x, z: bot.z };
      moveDashingBody(bot, dash, 1, 0, 24, CONFIG.dashDuration / steps);
      resolveArenaBuildings(bot, [building], previous);
    }
    expect(bot.x).toBeLessThan(3.501);
    expect(bot.x).toBeGreaterThan(3.49);
    expect(bot.vx).toBe(0);
    expect(segmentBuildingHit(bot.x, bot.z, bot.x, bot.z, building, bot.radius - .00001)).toBeNull();
  });
});
