import { CONFIG } from './config';

export interface MovingBody { x: number; z: number; vx: number; vz: number; radius: number }
export interface DashState { remaining: number; cooldown: number; x: number; z: number }
export const createDash = (): DashState => ({ remaining: 0, cooldown: 0, x: 0, z: 0 });

export function startDash(dash: DashState, moveX: number, moveZ: number, aimX: number, aimZ: number): boolean {
  if (dash.cooldown > 1e-6 || dash.remaining > 0) return false;
  const moving = Math.hypot(moveX, moveZ) > 0.001;
  const x = moving ? moveX : aimX, z = moving ? moveZ : aimZ;
  const length = Math.hypot(x, z);
  if (length < 0.001) return false;
  dash.x = x / length; dash.z = z / length;
  dash.remaining = CONFIG.dashDuration; dash.cooldown = CONFIG.dashCooldown;
  return true;
}

export function clampToArena(body: MovingBody): void {
  const xLimit = Math.max(0, CONFIG.arenaWidth / 2 - body.radius);
  const zLimit = Math.max(0, CONFIG.arenaDepth / 2 - body.radius);
  body.x = Math.max(-xLimit, Math.min(xLimit, body.x));
  body.z = Math.max(-zLimit, Math.min(zLimit, body.z));
}

export function moveBody(body: MovingBody, x: number, z: number, speed: number, dt: number): void {
  const length = Math.hypot(x, z), smoothing = 1 - Math.exp(-dt * 17);
  body.vx += ((length > 0.001 ? x / length * speed : 0) - body.vx) * smoothing;
  body.vz += ((length > 0.001 ? z / length * speed : 0) - body.vz) * smoothing;
  body.x += body.vx * dt; body.z += body.vz * dt;
  clampToArena(body);
}

/** Called only during active combat: pause freezes the dash and its cooldown. */
export function moveDashingBody(body: MovingBody, dash: DashState, x: number, z: number, speed: number, dt: number): void {
  dash.cooldown = Math.max(0, dash.cooldown - dt);
  const activeTime = Math.min(dt, dash.remaining);
  if (activeTime > 0) {
    body.vx = dash.x * speed * CONFIG.dashSpeedMultiplier;
    body.vz = dash.z * speed * CONFIG.dashSpeedMultiplier;
    body.x += body.vx * activeTime; body.z += body.vz * activeTime;
    dash.remaining = Math.max(0, dash.remaining - activeTime);
    clampToArena(body);
    if (dash.remaining === 0) {
      body.vx = dash.x * speed;
      body.vz = dash.z * speed;
    }
  }
  if (dt > activeTime) moveBody(body, x, z, speed, dt - activeTime);
}

export function movePlayer(body: MovingBody, dash: DashState, x: number, z: number, dt: number): void {
  moveDashingBody(body, dash, x, z, CONFIG.movementSpeed, dt);
}
