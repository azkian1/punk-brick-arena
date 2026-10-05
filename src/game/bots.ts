import { CONFIG } from './config';
import { canCollectDrop, type PickupDrop } from './pickup';
import type { MovingBody } from './movement';
import type { Random } from './types';

export const BOT_STYLES = ['aggressor', 'collector', 'sniper', 'balanced'] as const;
export type BotStyle = typeof BOT_STYLES[number];
export const BOT_LABELS: Record<BotStyle, { name: string; description: string }> = {
  aggressor: { name: 'Aggressor', description: 'Closes in, keeps firing, and grabs nearby pieces. Does not dodge.' },
  collector: { name: 'Collector', description: 'Seeks out debris, grows its build, and dodges incoming shots.' },
  sniper: { name: 'Sniper', description: 'Keeps its distance and dodges. Switches to rapid, precise fire when you get close.' },
  balanced: { name: 'Balanced', description: 'Mixes close pressure, mid-range fire, and collecting pieces, with occasional dodges.' },
};
export const BOT_DIFFICULTIES = {
  easy: { name: 'Easy', speed: 0.65, shotInterval: 1.9, decision: 0.42, spread: 4, lead: 0.2, dodgeChance: 0 },
  medium: { name: 'Medium', speed: 0.85, shotInterval: 1.35, decision: 0.24, spread: 1.8, lead: 0.65, dodgeChance: 0.55 },
  normal: { name: 'Full Strength', speed: 1, shotInterval: 1, decision: 0.12, spread: 0, lead: 1, dodgeChance: 1 },
} as const;
export type BotDifficulty = keyof typeof BOT_DIFFICULTIES;

export function pickBotStyle(random: Random = Math.random): BotStyle {
  return BOT_STYLES[Math.floor(random() * BOT_STYLES.length)];
}
/** The opening rounds teach the common behavior before introducing specialists. */
export function botForRound(number: number, random: Random = Math.random): { enemyBehavior: BotStyle; enemyDifficulty: BotDifficulty } {
  if (number <= 2) return { enemyBehavior: 'balanced', enemyDifficulty: number <= 1 ? 'easy' : 'medium' };
  return { enemyBehavior: pickBotStyle(random), enemyDifficulty: 'normal' };
}

export interface BotState {
  style: BotStyle; difficulty: BotDifficulty; side: number; decision: number; wander: number;
  tactic: 'approach' | 'strafe' | 'collect'; dodgeCooldown: number;
  wanderX: number; wanderZ: number; moveX: number; moveZ: number;
  dodgeTime: number; dodgeX: number; dodgeZ: number;
}
export interface BotBody extends MovingBody { id: string; pickupRadius: number }
export interface BotProjectile { x: number; z: number; vx: number; vz: number; ownerId: string }
export interface BotAction {
  x: number; z: number; speed: number; aimX: number; aimZ: number;
  fire: boolean; shotInterval: number; dodging: boolean; panic: boolean;
}
export const createBot = (style: BotStyle, random: Random = Math.random, difficulty: BotDifficulty = 'normal'): BotState => ({
  style, difficulty, side: random() < 0.5 ? -1 : 1, decision: 0, wander: 0,
  tactic: 'strafe', dodgeCooldown: 0,
  wanderX: 0, wanderZ: 0, moveX: 0, moveZ: 0, dodgeTime: 0, dodgeX: 0, dodgeZ: 0,
});

function dodgeDirection(enemy: BotBody, shots: readonly BotProjectile[], side: number): { x: number; z: number } | null {
  let earliest = 0.7, threat: BotProjectile | undefined;
  for (const shot of shots) {
    if (shot.ownerId === enemy.id) continue;
    const rx = shot.x - enemy.x, rz = shot.z - enemy.z;
    const vx = shot.vx - enemy.vx, vz = shot.vz - enemy.vz, speed2 = vx * vx + vz * vz;
    if (speed2 < 0.001) continue;
    const t = -(rx * vx + rz * vz) / speed2;
    if (t < 0 || t >= earliest) continue;
    if (Math.hypot(rx + vx * t, rz + vz * t) > enemy.radius + CONFIG.projectileSize / 2 + 1) continue;
    earliest = t; threat = shot;
  }
  if (!threat) return null;
  const length = Math.hypot(threat.vx, threat.vz);
  let x = -threat.vz / length, z = threat.vx / length;
  const offset = (enemy.x - threat.x) * x + (enemy.z - threat.z) * z;
  const direction = Math.abs(offset) > 0.4 ? Math.sign(offset) : side;
  x *= direction; z *= direction;
  const fits = (sign: number) => Math.abs(enemy.x + x * sign * 6) <= CONFIG.arenaWidth / 2 - enemy.radius
    && Math.abs(enemy.z + z * sign * 6) <= CONFIG.arenaDepth / 2 - enemy.radius;
  if (!fits(1) && fits(-1)) { x *= -1; z *= -1; }
  return { x, z };
}

export function thinkBot(
  state: BotState, enemy: BotBody, player: MovingBody, drops: readonly PickupDrop[],
  shots: readonly BotProjectile[], dt: number, time: number, random: Random = Math.random,
): BotAction {
  const difficulty = BOT_DIFFICULTIES[state.difficulty];
  const dx = player.x - enemy.x, dz = player.z - enemy.z;
  const distance = Math.max(0.001, Math.hypot(dx, dz)), nx = dx / distance, nz = dz / distance;
  const contact = (player.radius + enemy.radius) * 0.8;
  const panic = state.style === 'sniper' && distance < Math.max(15, contact + 5);
  state.decision -= dt; state.wander -= dt;
  state.dodgeTime = Math.max(0, state.dodgeTime - dt);
  state.dodgeCooldown = Math.max(0, state.dodgeCooldown - dt);
  if (state.decision <= 0) {
    state.decision = difficulty.decision;
    if (state.wander <= 0) {
      state.wander = 2 + random() * 2;
      const angle = random() * Math.PI * 2;
      const radius = Math.max(2, Math.min(CONFIG.arenaWidth, CONFIG.arenaDepth) / 2 - enemy.radius - 6);
      state.wanderX = Math.cos(angle) * radius * 0.8;
      state.wanderZ = Math.sin(angle) * radius * 0.8;
      if (random() < 0.4) state.side *= -1;
      if (state.style === 'balanced') {
        const choice = random();
        state.tactic = choice < 0.35 ? 'collect' : choice < 0.65 ? 'approach' : 'strafe';
      }
    }
    let mx = 0, mz = 0;
    if (state.style === 'aggressor') {
      // No projectile response: this bot willingly trades damage for pressure.
      mx = distance > contact + 0.5 ? nx : 0;
      mz = distance > contact + 0.5 ? nz : 0;
      let nearest: PickupDrop | undefined, best = (enemy.pickupRadius + 3) ** 2;
      for (const drop of drops) if (canCollectDrop(drop, enemy.id)) {
        const d = (drop.x - enemy.x) ** 2 + (drop.z - enemy.z) ** 2;
        if (d < best) { best = d; nearest = drop; }
      }
      if (nearest && distance < contact + 8) {
        const length = Math.max(0.001, Math.sqrt(best));
        mx += (nearest.x - enemy.x) / length * 0.55;
        mz += (nearest.z - enemy.z) / length * 0.55;
      }
    } else if (state.style === 'collector') {
      const safeDistance = Math.max(18, contact + 8);
      let closest: PickupDrop | undefined, best = Infinity;
      for (const drop of drops) if (canCollectDrop(drop, enemy.id)) {
        const risk = Math.max(0, safeDistance - Math.hypot(drop.x - player.x, drop.z - player.z));
        const score = Math.hypot(drop.x - enemy.x, drop.z - enemy.z) + risk * 4;
        if (score < best) { best = score; closest = drop; }
      }
      if (distance < safeDistance) {
        mx = -nx - nz * state.side * 0.55; mz = -nz + nx * state.side * 0.55;
      } else {
        mx = (closest?.x ?? state.wanderX) - enemy.x;
        mz = (closest?.z ?? state.wanderZ) - enemy.z;
        if (!closest && Math.hypot(mx, mz) < 2) state.wander = 0;
      }
    } else if (state.style === 'balanced') {
      let closest: PickupDrop | undefined, best = 24;
      if (state.tactic === 'collect') {
        for (const drop of drops) if (canCollectDrop(drop, enemy.id)) {
          const risk = Math.max(0, contact + 4 - Math.hypot(drop.x - player.x, drop.z - player.z));
          const score = Math.hypot(drop.x - enemy.x, drop.z - enemy.z) + risk * 2;
          if (score < best) { best = score; closest = drop; }
        }
      }
      if (closest && distance > contact + 4) {
        mx = closest.x - enemy.x; mz = closest.z - enemy.z;
      } else {
        const range = Math.max(state.tactic === 'approach' ? 16 : 22, contact + 7);
        const approach = distance > range + 3 ? 1 : distance < contact + 5 ? -0.8 : 0;
        const strafe = state.tactic === 'approach' ? 0.3 : 0.65;
        mx = nx * approach - nz * state.side * strafe;
        mz = nz * approach + nx * state.side * strafe;
      }
    } else {
      const range = Math.max(28, contact + 12);
      const approach = distance > range + 5 ? 0.9 : distance < range - 2 ? -1.3 : 0;
      mx = nx * approach - nz * state.side * 0.65;
      mz = nz * approach + nx * state.side * 0.65;
    }
    const length = Math.hypot(mx, mz);
    if (length > 0.001) { mx /= length; mz /= length; }
    // Give even the growing bot enough room to turn away from arena walls.
    const edgeX = Math.max(1, CONFIG.arenaWidth / 2 - enemy.radius - 4);
    const edgeZ = Math.max(1, CONFIG.arenaDepth / 2 - enemy.radius - 4);
    if (Math.abs(enemy.x) > edgeX) mx -= Math.sign(enemy.x) * 1.8;
    if (Math.abs(enemy.z) > edgeZ) mz -= Math.sign(enemy.z) * 1.8;
    state.moveX = mx; state.moveZ = mz;
    if (state.style !== 'aggressor' && state.dodgeTime === 0 && state.dodgeCooldown === 0 && difficulty.dodgeChance > 0) {
      const dodge = dodgeDirection(enemy, shots, state.side);
      if (dodge) {
        state.dodgeCooldown = state.style === 'balanced' ? 1.1 : 0;
        if (difficulty.dodgeChance === 1 || random() < difficulty.dodgeChance) {
          state.dodgeX = dodge.x; state.dodgeZ = dodge.z; state.dodgeTime = 0.28;
        }
      }
    }
  }
  const dodging = state.dodgeTime > 0;
  const lead = Math.min(0.85, distance / CONFIG.projectileSpeed) * (state.style === 'sniper' ? 1 : 0.55) * difficulty.lead;
  const spread = (state.style === 'sniper' ? (panic ? 0 : 0.3) : state.style === 'aggressor' ? 0.8 : state.style === 'balanced' ? 1.3 : 1.8) + difficulty.spread;
  const interval = state.style === 'aggressor' ? 0.3 : state.style === 'collector' ? 0.85 : panic ? 0.12 : CONFIG.botShotInterval;
  return {
    x: dodging ? state.dodgeX : state.moveX, z: dodging ? state.dodgeZ : state.moveZ,
    speed: CONFIG.botSpeed * (dodging ? 1.22 : state.style === 'aggressor' ? 1.12 : 1) * difficulty.speed,
    aimX: player.x + player.vx * lead + Math.sin(time * 3.1) * spread,
    aimZ: player.z + player.vz * lead + Math.cos(time * 2.7) * spread,
    fire: distance < (state.style === 'collector' ? 42 : 66),
    shotInterval: interval * difficulty.shotInterval,
    dodging, panic,
  };
}
