import { CONFIG } from './config';
import { canCollectDrop, type PickupDrop } from './pickup';
import type { DashState, MovingBody } from './movement';
import type { BotSquadOrder } from './bot-squad';
import type { Random } from './types';
import type { Piece, Structure } from './types';
import { segmentBuildingHit, type ArenaBuilding } from './arena';
import { projectileGroupRadius } from './projectiles';

export const BOT_STYLES = ['aggressor', 'collector', 'sniper', 'balanced'] as const;
export type BotStyle = typeof BOT_STYLES[number];
export const BOT_LABELS: Record<BotStyle, { name: string; description: string }> = {
  aggressor: { name: 'Aggressor', description: 'Pressures weaker targets, gathers nearby pieces, and dodges incoming fire.' },
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
  battle?: BattleMemory;
}
export interface BotBody extends MovingBody { id: string; pickupRadius: number }
export interface BotProjectile {
  x: number; z: number; vx: number; vz: number; ownerId: string;
  piece?: Piece; pieces?: readonly Piece[]; radius?: number; damage?: number;
  mode?: 'shot' | 'rebound'; settled?: boolean;
}
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
    const shotRadius = shot.piece ? Math.hypot(shot.piece.size.x, shot.piece.size.z) * CONFIG.characterScale / 2 : CONFIG.projectileSize / 2;
    if (Math.hypot(rx + vx * t, rz + vz * t) > enemy.radius + shotRadius + 1) continue;
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

export interface BattleBotBody extends BotBody { structure: Structure; dash?: DashState }
export type BattleBotIntent = 'prepare' | 'hunt' | 'finish' | 'recover' | 'collect' | 'harvest' | 'clear' | 'flank' | 'evade';
export interface BattleBotAction extends BotAction {
  /** Requested real inventory parts; the firing layer transfers and clamps them. */
  shotCount: number;
  /** Request the same finite, cooldown-bound dash used by the movement layer. */
  dash: boolean;
  intent: BattleBotIntent;
  targetId: string | null;
  targetKind: 'actor' | 'building' | null;
}
interface Point { x: number; z: number }
interface Obstacle { minX: number; maxX: number; minZ: number; maxZ: number }
interface BattleMemory {
  targetId: string | null;
  targetLockUntil: number; lootLockUntil: number;
  battleAge: number; initialMass: number; prepared: boolean; intent: BattleBotIntent;
  volley?: { stamp: string; reserve: Piece[]; maxX: number; maxZ: number; radii: Map<number, number> };
  lastX: number; lastZ: number; stuck: number;
  route: Point[]; goal: Point; routeAge: number; obstacleStamp: string;
  profileRevision: number; repair: Set<string>; growth: Set<string>;
  lootId: string | null; lootDistance: number; lootStall: number; inventoryStamp: string;
  deferredLoot: Map<string, { until: number; geometry: string }>;
  routeFailed: boolean;
  masses: Map<string, number>;
  engagements: Map<string, { age: number; distance: number; stale: number; inventory: string }>;
  deferredTargets: Map<string, { until: number; geometry: string }>;
  navigation?: NavigationGraph;
  flank?: { point: Point | null; target: Point; stamp: string; age: number };
  shelter?: { point: Point | null; target: Point; stamp: string; age: number };
}
const pieceSizeKey = (piece: Piece) => `${piece.size.x}:${piece.size.y}:${piece.size.z}`;
const alive = (actor: BattleBotBody) => actor.structure.pieces.has(actor.structure.coreId);

function resourceProfile(memory: BattleMemory, structure: Structure): void {
  if (memory.profileRevision === structure.revision) return;
  memory.profileRevision = structure.revision;
  memory.repair.clear(); memory.growth.clear();
  const evolution = structure.evolution;
  if (!evolution) {
    for (const hole of structure.vacancies) memory.repair.add(pieceSizeKey(hole));
    return;
  }
  const occupied = evolution.occupied.map(id => !!id && structure.pieces.has(id));
  for (let i = 0; i < evolution.plan.slots.length; i++) {
    if (occupied[i] || !evolution.plan.neighbors[i].some(neighbor => occupied[neighbor])) continue;
    (evolution.everBuilt.has(i) ? memory.repair : memory.growth).add(pieceSizeKey(evolution.plan.slots[i]));
  }
}

interface NavigationGraph {
  stamp: string; points: Point[]; backbone: number[]; neighbors: Map<number, number[]>;
  completed: Set<number>; visibility: Map<string, boolean>;
}
const navigationGeometry = new WeakMap<ArenaBuilding, { revision: number; boxes: Obstacle[]; signature: string }>();

/** The same brick footprint as collision, including gaps left by destruction. */
function footprintBoxes(building: ArenaBuilding): Obstacle[] {
  const previous = navigationGeometry.get(building);
  if (previous?.revision === building.structure.revision) return previous.boxes;
  const unique = new Map<string, Obstacle>();
  for (const piece of building.structure.pieces.values()) {
    const box = { minX: building.x + piece.position.x * CONFIG.characterScale,
      maxX: building.x + (piece.position.x + piece.size.x) * CONFIG.characterScale,
      minZ: building.z + piece.position.z * CONFIG.characterScale,
      maxZ: building.z + (piece.position.z + piece.size.z) * CONFIG.characterScale };
    unique.set(`${box.minX}:${box.maxX}:${box.minZ}:${box.maxZ}`, box);
  }
  const raw = [...unique.values()];
  const xs = [...new Set(raw.flatMap(box => [box.minX, box.maxX]))].sort((a, b) => a - b);
  const zs = [...new Set(raw.flatMap(box => [box.minZ, box.maxZ]))].sort((a, b) => a - b);
  const width = Math.max(0, xs.length - 1), depth = Math.max(0, zs.length - 1);
  let boxes: Obstacle[] = raw;
  // Mixed tilings on different vertical layers overlap in projection. Form the
  // exact 2D union before generating corners; a solid tower needs four corners,
  // rather than hundreds of redundant corners from its individual bricks.
  if (width * depth <= 16384) {
    const occupied = new Uint8Array(width * depth);
    const xIndex = new Map(xs.map((x, i) => [x, i])), zIndex = new Map(zs.map((z, i) => [z, i]));
    for (const box of raw) {
      for (let z = zIndex.get(box.minZ)!; z < zIndex.get(box.maxZ)!; z++) {
        for (let x = xIndex.get(box.minX)!; x < xIndex.get(box.maxX)!; x++) occupied[z * width + x] = 1;
      }
    }
    boxes = [];
    const active = new Map<string, Obstacle>();
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width;) {
        if (!occupied[z * width + x]) { x++; continue; }
        const start = x;
        while (x < width && occupied[z * width + x]) x++;
        const key = `${start}:${x}`, previous = active.get(key);
        if (previous && previous.maxZ === zs[z]) previous.maxZ = zs[z + 1];
        else {
          const box = { minX: xs[start], maxX: xs[x], minZ: zs[z], maxZ: zs[z + 1] };
          active.set(key, box); boxes.push(box);
        }
      }
    }
  }  navigationGeometry.set(building, { revision: building.structure.revision, boxes,
    signature: boxes.map(box => `${box.minX}:${box.maxX}:${box.minZ}:${box.maxZ}`).join(';') });
  return boxes;
}

function buildingObstacles(buildings: readonly ArenaBuilding[], margin: number): Obstacle[] {
  return buildings.flatMap(building => footprintBoxes(building).map(box => ({
    minX: box.minX - margin, maxX: box.maxX + margin,
    minZ: box.minZ - margin, maxZ: box.maxZ + margin,
  })));
}

function navigationStamp(buildings: readonly ArenaBuilding[], radius: number): string {
  return `${radius}:` + buildings.map(building => {
    footprintBoxes(building);
    return `${building.id}/${navigationGeometry.get(building)!.signature}`;
  }).join(',');
}
function pointFree(point: Point, buildings: readonly ArenaBuilding[], radius: number): boolean {
  return Math.abs(point.x) <= CONFIG.arenaWidth / 2 - radius - 0.1
    && Math.abs(point.z) <= CONFIG.arenaDepth / 2 - radius - 0.1
    && buildings.every(building => segmentBuildingHit(point.x, point.z, point.x, point.z, building, radius + 0.04) === null);
}

function movementClear(a: Point, b: Point, buildings: readonly ArenaBuilding[], radius: number): boolean {
  // Collision resolution leaves an epsilon outside a face. Do not classify that
  // safe starting boundary as an obstruction to moving away from it.
  return buildings.every(building => segmentBuildingHit(a.x, a.z, b.x, b.z, building, Math.max(0, radius - 0.02)) === null);
}

/** Collect from any reachable point in the pickup circle; entering the piece's
 * exact center is unnecessary and can be impossible beside remaining cover. */
function lootApproach(self: BattleBotBody, drop: PickupDrop, buildings: readonly ArenaBuilding[]): Point | null {
  const distance = Math.hypot(drop.x - self.x, drop.z - self.z);
  if (distance < self.pickupRadius - 0.08) return { x: self.x, z: self.z };
  const reach = Math.max(0.1, self.pickupRadius - 0.2);
  const towardSelf = Math.atan2(self.z - drop.z, self.x - drop.x);
  const points: Point[] = [{ x: drop.x, z: drop.z }];
  const xLimit = CONFIG.arenaWidth / 2 - self.radius - 0.12, zLimit = CONFIG.arenaDepth / 2 - self.radius - 0.12;
  const addApproach = (point: Point) => {
    if (Math.hypot(point.x - drop.x, point.z - drop.z) <= reach) points.push(point);
  };
  // Near arena corners the valid pickup arc may be narrower than the angular
  // sample spacing. Include its exact nearest point inside the movement bounds.
  addApproach({ x: Math.max(-xLimit, Math.min(xLimit, drop.x)), z: Math.max(-zLimit, Math.min(zLimit, drop.z)) });
  for (const building of buildings) for (const box of footprintBoxes(building)) {
    const dx = Math.max(box.minX - drop.x, 0, drop.x - box.maxX), dz = Math.max(box.minZ - drop.z, 0, drop.z - box.maxZ);
    if (Math.hypot(dx, dz) > reach + self.radius) continue;
    addApproach({ x: box.minX - self.radius - 0.08, z: drop.z });
    addApproach({ x: box.maxX + self.radius + 0.08, z: drop.z });
    addApproach({ x: drop.x, z: box.minZ - self.radius - 0.08 });
    addApproach({ x: drop.x, z: box.maxZ + self.radius + 0.08 });
  }
  for (let i = 0; i < 16; i++) {
    const angle = towardSelf + i * Math.PI / 8;
    points.push({ x: drop.x + Math.cos(angle) * reach, z: drop.z + Math.sin(angle) * reach });
  }
  points.sort((a, b) => Math.hypot(a.x - self.x, a.z - self.z) - Math.hypot(b.x - self.x, b.z - self.z));
  let fallback: Point | null = null;
  for (const point of points) {
    if (!pointFree(point, buildings, self.radius)) continue;
    fallback ??= point;
    if (movementClear(self, point, buildings, self.radius)) return point;
  }
  return fallback;
}

/** A visibility graph around actual cover supplies detours through surviving gaps. */
function findRoute(start: Point, requestedGoal: Point, buildings: readonly ArenaBuilding[], radius: number, memory: BattleMemory): Point[] {
  const xLimit = Math.max(1, CONFIG.arenaWidth / 2 - radius - 0.1);
  const zLimit = Math.max(1, CONFIG.arenaDepth / 2 - radius - 0.1);
  let goal = { x: Math.max(-xLimit, Math.min(xLimit, requestedGoal.x)), z: Math.max(-zLimit, Math.min(zLimit, requestedGoal.z)) };
  const obstacles = buildingObstacles(buildings, radius + 0.18);
  if (!pointFree(goal, buildings, radius)) {
    const exits: Point[] = [];
    for (const box of obstacles) if (goal.x > box.minX && goal.x < box.maxX && goal.z > box.minZ && goal.z < box.maxZ) {
      exits.push({ x: box.minX - 0.02, z: goal.z }, { x: box.maxX + 0.02, z: goal.z },
        { x: goal.x, z: box.minZ - 0.02 }, { x: goal.x, z: box.maxZ + 0.02 });
    }
    const possible = exits.filter(point => pointFree(point, buildings, radius));
    possible.sort((a, b) => Math.hypot(a.x - goal.x, a.z - goal.z) + Math.hypot(a.x - start.x, a.z - start.z) * 0.2
      - Math.hypot(b.x - goal.x, b.z - goal.z) - Math.hypot(b.x - start.x, b.z - start.z) * 0.2);
    if (!possible.length) return [];
    goal = possible[0];
  }
  const clear = (a: Point, b: Point) => movementClear(a, b, buildings, radius);
  if (clear(start, goal)) return [goal];
  const stamp = navigationStamp(buildings, radius);
  if (memory.navigation?.stamp !== stamp) {
    const keys = new Set<string>(), corners: Point[] = [], backbone: number[] = [];
    const add = (point: Point, anchor = false) => {
      const key = `${point.x.toFixed(3)}:${point.z.toFixed(3)}`;
      if (!keys.has(key) && pointFree(point, buildings, radius)) { keys.add(key); if (anchor) backbone.push(corners.length); corners.push(point); }
    };
    // Open arena boundaries and the center provide a sparse connected backbone.
    for (const x of [-xLimit, 0, xLimit]) for (const z of [-zLimit, 0, zLimit]) add({ x, z }, true);
    for (const box of obstacles) for (const x of [box.minX, box.maxX]) for (const z of [box.minZ, box.maxZ]) add({ x, z });
    memory.navigation = { stamp, points: corners, backbone, neighbors: new Map(), completed: new Set(), visibility: new Map() };
  }
  const graph = memory.navigation!;
  const points = [start, goal, ...graph.points];
  const visible = (a: number, b: number) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    let result = graph.visibility.get(key);
    if (result === undefined) { result = clear(graph.points[a], graph.points[b]); graph.visibility.set(key, result); }
    return result;
  };
  const staticNeighbors = (current: number): number[] => {
    if (!graph.completed.has(current)) {
      const candidates = graph.points.map((point, index) => ({ index, distance: Math.hypot(point.x - graph.points[current].x, point.z - graph.points[current].z) }))
        .filter(candidate => candidate.index !== current).sort((a, b) => a.distance - b.distance);
      const connect = (next: number) => {
        const forward = graph.neighbors.get(current) ?? [], reverse = graph.neighbors.get(next) ?? [];
        if (!forward.includes(next)) forward.push(next);
        if (!reverse.includes(current)) reverse.push(current);
        graph.neighbors.set(current, forward); graph.neighbors.set(next, reverse);
      };
      for (const anchor of graph.backbone) if (anchor !== current && visible(current, anchor)) connect(anchor);
      let visibleEdges = 0, checked = 0;
      for (const candidate of candidates) {
        if (++checked > 24 || visibleEdges >= 8) break;
        if (!visible(current, candidate.index)) continue;
        visibleEdges++;
        connect(candidate.index);
      }
      graph.completed.add(current);
    }
    return graph.neighbors.get(current) ?? [];
  };
  const costs = points.map(() => Infinity), parents = points.map(() => -1), visited = new Set<number>();
  costs[0] = 0;
  for (let step = 0; step < points.length; step++) {
    let current = -1;
    for (let i = 0; i < points.length; i++) if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
    if (current < 0 || !Number.isFinite(costs[current])) break;
    if (current === 1) {
      const route: Point[] = [];
      for (let index = 1; index !== 0 && index !== -1; index = parents[index]) route.unshift(points[index]);
      return route;
    }
    visited.add(current);
    const relax = (next: number) => {
      if (visited.has(next)) return;
      const cost = costs[current] + Math.hypot(points[next].x - points[current].x, points[next].z - points[current].z);
      if (cost < costs[next]) { costs[next] = cost; parents[next] = current; }
    };
    if (clear(points[current], goal)) relax(1);
    if (current === 0) {
      const candidates = graph.points.map((point, index) => ({ index, distance: Math.hypot(point.x - start.x, point.z - start.z) }))
        .sort((a, b) => a.distance - b.distance);
      for (const anchor of graph.backbone) if (clear(start, graph.points[anchor])) relax(anchor + 2);
      let connected = 0, checked = 0;
      for (const candidate of candidates) {
        if (++checked > 24 || connected >= 8) break;
        if (clear(start, graph.points[candidate.index])) { relax(candidate.index + 2); connected++; }
      }
    } else for (const next of staticNeighbors(current - 2)) relax(next + 2);
  }  return [];
}

function steerBattle(
  memory: BattleMemory, self: BattleBotBody, goal: Point, buildings: readonly ArenaBuilding[], state: BotState, dt: number,
): Point {
  if (Math.hypot(goal.x - self.x, goal.z - self.z) < 0.12) {
    memory.route = []; memory.goal = { ...goal }; memory.routeFailed = false;
    memory.lastX = self.x; memory.lastZ = self.z; memory.stuck = 0;
    return { x: 0, z: 0 };
  }
  const stamp = navigationStamp(buildings, self.radius);
  const moved = Math.hypot(self.x - memory.lastX, self.z - memory.lastZ);
  const expectedMovement = Math.hypot(state.moveX, state.moveZ) > 0.1;
  memory.stuck = expectedMovement && moved < dt * 0.8 ? memory.stuck + dt : Math.max(0, memory.stuck - dt * 2);
  memory.lastX = self.x; memory.lastZ = self.z; memory.routeAge -= dt;
  if (memory.stuck > 0.85) {
    state.side *= -1; memory.route = []; memory.routeAge = 0; memory.stuck = 0;
    let nearest: Obstacle | undefined, distance = Infinity;
    for (const obstacle of buildingObstacles(buildings, self.radius + 0.18)) {
      const d = Math.hypot(self.x - (obstacle.minX + obstacle.maxX) / 2, self.z - (obstacle.minZ + obstacle.maxZ) / 2);
      if (d < distance) { nearest = obstacle; distance = d; }
    }
    if (nearest) {
      const dx = self.x - (nearest.minX + nearest.maxX) / 2, dz = self.z - (nearest.minZ + nearest.maxZ) / 2;
      return { x: dx - dz * state.side * 0.8, z: dz + dx * state.side * 0.8 };
    }
  }
  if (memory.obstacleStamp !== stamp || memory.routeAge <= 0 || Math.hypot(goal.x - memory.goal.x, goal.z - memory.goal.z) > 2) {
    memory.route = findRoute(self, goal, buildings, self.radius, memory);
    memory.goal = { ...goal }; memory.routeAge = 1.2; memory.obstacleStamp = stamp;
    memory.routeFailed = !memory.route.length;
  }
  while (memory.route.length > 1 && Math.hypot(memory.route[0].x - self.x, memory.route[0].z - self.z) < 0.7) memory.route.shift();
  const waypoint = memory.route[0];
  if (!waypoint) return { x: 0, z: 0 };
  if (memory.route.length === 1 && Math.hypot(waypoint.x - self.x, waypoint.z - self.z) < 0.7
    && Math.hypot(goal.x - self.x, goal.z - self.z) > 1 && !movementClear(self, goal, buildings, self.radius)) {
    // Reaching a projected endpoint beside cover did not reach the requested
    // combat position. Allow body-width clearance on the following decision.
    memory.routeFailed = true;
  }
  return { x: waypoint.x - self.x, z: waypoint.z - self.z };
}
function clearShot(self: Point, aim: Point, buildings: readonly ArenaBuilding[], ignoredId?: string, radius = CONFIG.projectileSize / 2): boolean {
  return !buildings.some(building => building.id !== ignoredId && segmentBuildingHit(self.x, self.z, aim.x, aim.z, building, radius) !== null);
}

const battleLead = (difficulty: BotDifficulty) => difficulty === 'easy' ? 0.65 : difficulty === 'medium' ? 0.85 : 1;
/** Stock packing is exact. Body ammunition uses a conservative footprint because
 * the firing layer alone owns the safe peel and inventory transfer. */
function volleyRadius(memory: BattleMemory, self: BattleBotBody, count: number): number {
  const evolution = self.structure.evolution;
  const stamp = `${self.structure.revision}:${evolution?.reserveRevision ?? 0}`;
  if (memory.volley?.stamp !== stamp) {
    const reserve = (evolution?.reserve ?? []).filter(piece => piece.id !== self.structure.coreId).slice(0, 20);
    let maxX = 0, maxZ = 0;
    for (const piece of self.structure.pieces.values()) if (piece.id !== self.structure.coreId) {
      maxX = Math.max(maxX, piece.size.x * CONFIG.characterScale); maxZ = Math.max(maxZ, piece.size.z * CONFIG.characterScale);
    }
    memory.volley = { stamp, reserve, maxX, maxZ, radii: new Map() };
  }
  const profile = memory.volley;
  const cached = profile.radii.get(count);
  if (cached !== undefined) return cached;
  const columns = Math.ceil(Math.cbrt(Math.max(1, count)));
  const radius = profile.reserve.length >= count ? projectileGroupRadius(profile.reserve.slice(0, count))
    : Math.hypot(columns * (profile.maxX + 0.035) / 2 - 0.0175, columns * (profile.maxZ + 0.035) / 2 - 0.0175);
  profile.radii.set(count, radius);
  return radius;
}
function plausibleHit(self: BattleBotBody, target: BattleBotBody, difficulty: BotDifficulty, radius: number, finishing: boolean): number {
  const travel = Math.hypot(target.x - self.x, target.z - self.z) / CONFIG.projectileSpeed;
  const error = BOT_DIFFICULTIES[difficulty].spread * (finishing ? 0.35 : 1)
    + Math.hypot(target.vx, target.vz) * travel * (1 - battleLead(difficulty));
  return clampUnit((target.radius + radius) / (error + 0.5));
}interface IncomingThreat {
  shot: BotProjectile; radius: number; count: number; time: number; impactTime: number; danger: boolean;
}
const unit = (x: number, z: number): Point => {
  const length = Math.hypot(x, z);
  return length > 0.001 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
};
const clampUnit = (value: number) => Math.max(0, Math.min(1, value));
function actualShotRadius(shot: BotProjectile): number {
  if (shot.radius !== undefined) return Math.max(0, shot.radius);
  const parts = shot.pieces ?? (shot.piece ? [shot.piece] : []);
  if (!parts.length) return CONFIG.projectileSize / 2;
  return projectileGroupRadius(parts);

}
/** Keep near misses too: a dodge must not move from one firing lane into another. */
function incomingThreats(self: BattleBotBody, shots: readonly BotProjectile[], buildings: readonly ArenaBuilding[]): IncomingThreat[] {
  const result: IncomingThreat[] = [];
  for (const shot of shots) {
    if (shot.ownerId === self.id || shot.mode === 'rebound' || shot.settled) continue;
    const rx = shot.x - self.x, rz = shot.z - self.z, vx = shot.vx - self.vx, vz = shot.vz - self.vz;
    const speed2 = vx * vx + vz * vz;
    if (speed2 < 0.001) continue;
    const time = -(rx * vx + rz * vz) / speed2;
    if (time < 0 || time > 0.9) continue;
    const radius = actualShotRadius(shot), reach = self.radius + radius + 0.65;
    const miss = Math.hypot(rx + vx * time, rz + vz * time);
    if (miss > reach + 7) continue;
    const end = { x: shot.x + shot.vx * time, z: shot.z + shot.vz * time };
    if (buildings.some(building => segmentBuildingHit(shot.x, shot.z, end.x, end.z, building, radius) !== null)) continue;
    const danger = miss <= reach;
    const contactOffset = danger ? Math.sqrt(Math.max(0, reach * reach - miss * miss) / speed2) : 0;
    result.push({ shot, radius, count: Math.max(1, shot.damage ?? shot.pieces?.length ?? 1), time,
      impactTime: Math.max(0, time - contactOffset), danger });
  }
  return result;
}
function battleDodge(self: BattleBotBody, threats: readonly IncomingThreat[], buildings: readonly ArenaBuilding[], side: number, speed: number): Point | null {
  const dangerous = threats.filter(threat => threat.danger).sort((a, b) => a.impactTime - b.impactTime);
  if (!dangerous.length) return null;
  const first = dangerous[0].shot, perpendicular = unit(-first.vz, first.vx);
  const offset = (self.x - first.x) * perpendicular.x + (self.z - first.z) * perpendicular.z;
  const preferred = Math.abs(offset) > 0.4 ? Math.sign(offset) : side;
  const candidates: Point[] = [];
  for (const threat of dangerous.slice(0, 3)) {
    const normal = unit(-threat.shot.vz, threat.shot.vx);
    for (const sign of [preferred, -preferred]) candidates.push({ x: normal.x * sign, z: normal.z * sign });
  }
  for (let index = 0; index < 8; index++) candidates.push({ x: Math.cos(index * Math.PI / 4), z: Math.sin(index * Math.PI / 4) });
  let best: Point | null = null, bestScore = -Infinity;
  for (const direction of candidates) {
    const endpoint = { x: self.x + direction.x * 6, z: self.z + direction.z * 6 };
    if (!pointFree(endpoint, buildings, self.radius) || !movementClear(self, endpoint, buildings, self.radius)) continue;
    let penalty = 0, worstClearance = Infinity;
    for (const threat of threats) {
      const t = Math.min(0.4, threat.time), smoothingTravel = (1 - Math.exp(-17 * t)) / 17;
      const x = self.x + direction.x * speed * t + (self.vx - direction.x * speed) * smoothingTravel;
      const z = self.z + direction.z * speed * t + (self.vz - direction.z * speed) * smoothingTravel;
      const clearance = Math.hypot(threat.shot.x + threat.shot.vx * threat.time - x,
        threat.shot.z + threat.shot.vz * threat.time - z) - self.radius - threat.radius;
      worstClearance = Math.min(worstClearance, clearance);
      penalty += Math.max(0, 1.2 - clearance) * Math.min(20, threat.count) / (0.2 + threat.impactTime);
    }
    const score = Math.min(6, worstClearance) - penalty + (direction.x * perpendicular.x + direction.z * perpendicular.z) * preferred * 0.08;
    if (score > bestScore) { best = direction; bestScore = score; }
  }
  return best;
}
function interception(self: Point, target: BattleBotBody, lead: number): Point {
  const dx = target.x - self.x, dz = target.z - self.z;
  const a = target.vx * target.vx + target.vz * target.vz - CONFIG.projectileSpeed ** 2;
  const b = 2 * (dx * target.vx + dz * target.vz), c = dx * dx + dz * dz;
  const discriminant = Math.max(0, b * b - 4 * a * c);
  const roots = Math.abs(a) < 0.001 ? [-c / (Math.abs(b) < 0.001 ? -1 : b)] : [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)];
  const positive = roots.filter(time => time >= 0 && Number.isFinite(time));
  const time = Math.min(1.3, positive.length ? Math.min(...positive) : Math.sqrt(c) / CONFIG.projectileSpeed) * lead;
  return { x: target.x + target.vx * time, z: target.z + target.vz * time };
}
/** A cheap local flank is preferable to spending scarce stock on thick cover. */
function availableFlank(memory: BattleMemory, self: BattleBotBody, target: BattleBotBody, obstruction: ArenaBuilding,
  buildings: readonly ArenaBuilding[], dt: number, shotRadius = CONFIG.projectileSize / 2): Point | null {
  const stamp = `${shotRadius}:` + buildings.map(building => `${building.id}/${building.structure.revision}`).join(',');
  if (memory.flank) memory.flank.age -= dt;
  if (memory.flank && memory.flank.age > 0 && memory.flank.stamp === stamp
    && Math.hypot(memory.flank.target.x - target.x, memory.flank.target.z - target.z) < 3) return memory.flank.point;
  const margin = self.radius + 0.35;
  const boxes = [...footprintBoxes(obstruction)].sort((a, b) =>
    Math.hypot((a.minX + a.maxX) / 2 - self.x, (a.minZ + a.maxZ) / 2 - self.z)
    - Math.hypot((b.minX + b.maxX) / 2 - self.x, (b.minZ + b.maxZ) / 2 - self.z)).slice(0, 6);
  let best: Point | null = null, cost = Infinity;
  for (const box of boxes) for (const x of [box.minX - margin, box.maxX + margin]) for (const z of [box.minZ - margin, box.maxZ + margin]) {
    const point = { x, z }, approach = Math.hypot(x - self.x, z - self.z);
    if (approach > 25 || !pointFree(point, buildings, self.radius) || !movementClear(self, point, buildings, self.radius)
      || !clearShot(point, target, buildings, undefined, shotRadius)) continue;
    const distance = approach + Math.hypot(x - target.x, z - target.z) * 0.3;
    if (distance < cost) { cost = distance; best = point; }
  }
  memory.flank = { point: best, target: { x: target.x, z: target.z }, stamp, age: 0.75 };
  return best;
}
/** Use nearby existing cover under concentrated fire; never invent protection. */
function nearbyShelter(memory: BattleMemory, self: BattleBotBody, target: BattleBotBody,
  opponents: readonly BattleBotBody[], buildings: readonly ArenaBuilding[], dt: number): Point | null {
  const stamp = buildings.map(building => `${building.id}/${building.structure.revision}`).join(',');
  if (memory.shelter) memory.shelter.age -= dt;
  if (memory.shelter && memory.shelter.age > 0 && memory.shelter.stamp === stamp
    && Math.hypot(memory.shelter.target.x - target.x, memory.shelter.target.z - target.z) < 3) return memory.shelter.point;
  const margin = self.radius + 0.25;
  const nearby = [...buildings].sort((a, b) => Math.hypot(a.x - self.x, a.z - self.z) - Math.hypot(b.x - self.x, b.z - self.z)).slice(0, 3);
  let best: Point | null = null, cost = Infinity;
  for (const building of nearby) for (const box of footprintBoxes(building).slice(0, 6)) {
    const centerX = (box.minX + box.maxX) / 2, centerZ = (box.minZ + box.maxZ) / 2;
    const points = [
      { x: box.minX - margin, z: centerZ }, { x: box.maxX + margin, z: centerZ },
      { x: centerX, z: box.minZ - margin }, { x: centerX, z: box.maxZ + margin },
    ];
    for (const point of points) {
      const distance = Math.hypot(point.x - self.x, point.z - self.z);
      if (distance > 18 || !pointFree(point, buildings, self.radius) || !movementClear(self, point, buildings, self.radius)
        || clearShot(target, point, buildings)) continue;
      let exposure = 0;
      for (const opponent of opponents) if (opponent !== target && clearShot(opponent, point, buildings)) {
        exposure += Math.max(0, 35 - Math.hypot(opponent.x - point.x, opponent.z - point.z)) * 0.4;
      }
      if (distance + exposure < cost) { cost = distance + exposure; best = point; }
    }
  }
  memory.shelter = { point: best, target: { x: target.x, z: target.z }, stamp, age: 0.8 };
  return best;
}
function attackBatch(self: BattleBotBody, target: BattleBotBody | undefined, kind: BattleBotAction['targetKind'],
  reserve: number, finishing: boolean, health: number, underFire: boolean, difficulty: BotDifficulty, pressing: boolean): number {
  const body = Math.max(0, self.structure.pieces.size - 1);
  // Preserve most armor: stock is expendable, the body is a survival resource.
  const bodyBudget = Math.min(body, Math.max(1, Math.floor(body * (finishing ? 0.05 : kind === 'building' ? 0.012 : 0.008))));
  const available = reserve + bodyBudget;
  if (available <= 0) return 0;
  if (kind === 'building') return Math.min(reserve > 0 ? reserve : bodyBudget, reserve >= 12 ? 4 : reserve >= 4 ? 3 : 2);
  if (!target) return 0;
  // Plentiful real stock should break a repair stalemate. Difficulty still
  // affects aim and movement, but it must not throttle the physical damage cap.
  if (reserve >= 100 || (pressing && reserve >= 20)) return 20;
  const distance = Math.hypot(target.x - self.x, target.z - self.z), travel = distance / CONFIG.projectileSpeed;
  const confidence = clampUnit((target.radius + 1.3) / (1.5 + distance * 0.055 + Math.hypot(target.vx, target.vz) * travel * (1 - battleLead(difficulty))));
  let desired = Math.round((4 + confidence * 12) * (difficulty === 'easy' ? 0.55 : difficulty === 'medium' ? 0.8 : 1));
  if (finishing) desired = Math.min(20, target.structure.pieces.size + (confidence < 0.75 ? 2 : 0));
  if (underFire && !finishing) desired = Math.min(desired, 6);
  if (health < 0.45 && reserve < 4 && !finishing) desired = Math.min(desired, 2);
  // Do not spill a stocked volley into body ammunition merely to reach its cap.
  if (reserve > 0) return Math.max(1, Math.min(20, reserve, desired));
  return Math.max(1, Math.min(20, available, desired));
}
/** A dash is a request, never movement or a cooldown mutation. Check the whole
 * continuous body path using the larger player/bot distance, then verify actual
 * dash velocity will not enter another live projectile lane. */
function safeBattleDash(self: BattleBotBody, move: Point, speed: number, buildings: readonly ArenaBuilding[],
  shots: readonly BotProjectile[], enemies: readonly BattleBotBody[], escaping: boolean): boolean {
  if (!self.dash || self.dash.cooldown > 1e-6 || self.dash.remaining > 0 || !alive(self)) return false;
  const direction = unit(move.x, move.z);
  if (Math.hypot(direction.x, direction.z) < 0.5) return false;
  const travel = Math.max(CONFIG.movementSpeed, speed) * CONFIG.dashSpeedMultiplier * CONFIG.dashDuration;
  const end = { x: self.x + direction.x * travel, z: self.z + direction.z * travel };
  if (!pointFree(end, buildings, self.radius)
    || buildings.some(building => segmentBuildingHit(self.x, self.z, end.x, end.z, building, self.radius + 0.04) !== null)) return false;
  for (const enemy of enemies) {
    const before = Math.hypot(enemy.x - self.x, enemy.z - self.z), after = Math.hypot(enemy.x - end.x, enemy.z - end.z);
    if (after < self.radius + enemy.radius + (escaping ? 1 : 4) && after < before) return false;
  }
  const dashSpeed = speed * CONFIG.dashSpeedMultiplier;
  // Use all live shots here: a lane outside ordinary dodge reach can still be
  // crossed by the much longer dash, including a compact multi-part group.
  for (const shot of shots) {
    if (shot.ownerId === self.id || shot.mode === 'rebound' || shot.settled) continue;
    const rx = shot.x - self.x, rz = shot.z - self.z, radius = actualShotRadius(shot);
    const vx = shot.vx - direction.x * dashSpeed, vz = shot.vz - direction.z * dashSpeed;
    const time = Math.max(0, Math.min(CONFIG.dashDuration, -(rx * vx + rz * vz) / Math.max(0.001, vx * vx + vz * vz)));
    if (Math.hypot(rx + vx * time, rz + vz * time) >= self.radius + radius + 0.15) continue;
    const sx = shot.x + shot.vx * time, sz = shot.z + shot.vz * time;
    if (!buildings.some(building => segmentBuildingHit(shot.x, shot.z, sx, sz, building, radius) !== null)) return false;
  }
  return true;
}
/** Style changes priorities; every bot can repair, build, dodge and finish peers. */
export function thinkBattleBot(
  state: BotState, self: BattleBotBody, opponents: readonly BattleBotBody[], drops: readonly PickupDrop[],
  shots: readonly BotProjectile[], buildings: readonly ArenaBuilding[], dt: number, time: number, random: Random = Math.random,
  order?: BotSquadOrder,
): BattleBotAction {
  const difficulty = BOT_DIFFICULTIES[state.difficulty];
  const memory: BattleMemory = state.battle ??= { targetId: null, lastX: self.x, lastZ: self.z, stuck: 0,
    route: [], goal: { x: self.x, z: self.z }, routeAge: 0, obstacleStamp: '', profileRevision: -1,
    repair: new Set(), growth: new Set(), lootId: null, lootDistance: Infinity, lootStall: 0,
    inventoryStamp: '', deferredLoot: new Map(), routeFailed: false,
    masses: new Map(), engagements: new Map(), deferredTargets: new Map(),
    targetLockUntil: 0, lootLockUntil: 0, battleAge: 0, initialMass: self.structure.pieces.size + (self.structure.evolution?.reserve.length ?? 0),
    prepared: false, intent: 'prepare' };
  const enemies = opponents.filter(opponent => opponent.id !== self.id && alive(opponent));
  const recovering = order?.role === 'recover';
  const collecting = order?.role === 'collector' && order.round >= 4;
  const attacking = order?.role === 'attacker';
  const flankSide = order?.flankSide ? Math.sign(order.flankSide) : state.side;
  const hostileShots = order?.allyIds.length ? shots.filter(shot => !order.allyIds.includes(shot.ownerId)) : shots;
  const reserve = self.structure.evolution?.reserve.length ?? 0;
  const ammunition = reserve + Math.max(0, self.structure.pieces.size - 1);
  memory.battleAge += dt;
  memory.prepared ||= reserve >= 4 || self.structure.pieces.size + reserve >= memory.initialMass + 6 || memory.battleAge >= 6;
  const preparing = !memory.prepared && !attacking && !collecting && !recovering;
  const minimumShotRadius = ammunition > 0 ? volleyRadius(memory, self, 1) : CONFIG.projectileSize / 2;
  const battleClear = (origin: Point, aim: Point, ignoredId?: string) => clearShot(origin, aim, buildings, ignoredId, minimumShotRadius);
  memory.masses.set(self.id, Math.max(self.structure.roundStartPieces, self.structure.pieces.size, memory.masses.get(self.id) ?? 0));
  const health = Math.min(1, self.structure.pieces.size / Math.max(1, memory.masses.get(self.id)!));
  const geometryStamp = buildings.map(building => `${building.id}/${building.structure.revision}`).join(',');
  const needsRepair = self.structure.pieces.size <= 4 || health < 0.68 || (self.structure.coreExposed && health < 0.9);
  const criticalHealth = self.structure.pieces.size <= 4 || health < 0.35 || (self.structure.coreExposed && health < 0.5);
  const needsStock = reserve < 5 && (preparing || self.structure.pieces.size <= 40 || health < 0.55);
  const needsResources = recovering || collecting || needsRepair || needsStock || (state.style === 'collector' && preparing && reserve < 12);
  const incoming = incomingThreats(self, hostileShots, buildings);
  const dangerous = incoming.filter(threat => threat.danger);
  const urgentShot = dangerous.some(threat => threat.impactTime < 0.25);
  const firingPressure = new Map<string, number>();
  for (const threat of dangerous) firingPressure.set(threat.shot.ownerId,
    (firingPressure.get(threat.shot.ownerId) ?? 0) + Math.min(20, threat.count) / (1 + threat.impactTime));
  let enemyPressure = 0, repelX = 0, repelZ = 0;
  let target: BattleBotBody | undefined, bestTarget = -Infinity;
  const previousTargetId = memory.targetId, scores = new Map<string, number>();
  let closest: BattleBotBody | undefined, closestDistance = Infinity;
  for (const opponent of enemies) {
    const distance = Math.hypot(opponent.x - self.x, opponent.z - self.z);
    if (distance < closestDistance) { closest = opponent; closestDistance = distance; }
    const peak = Math.max(opponent.structure.roundStartPieces, opponent.structure.pieces.size, memory.masses.get(opponent.id) ?? 0);
    memory.masses.set(opponent.id, peak);
    const weakness = 1 - Math.min(1, opponent.structure.pieces.size / Math.max(1, peak));
    const deferred = memory.deferredTargets.get(opponent.id);
    const unreachable = deferred && deferred.until > time && deferred.geometry === geometryStamp;
    const visible = battleClear(self, opponent);
    const exposed = opponent.structure.coreExposed ? 3 + weakness * 2 : 0;
    const finishing = opponent.structure.pieces.size <= 20 ? 3 : 0;
    const contact = self.radius + opponent.radius;
    const strength = Math.min(2, Math.sqrt(opponent.structure.pieces.size / Math.max(1, self.structure.pieces.size + reserve)));
    const pressure = clampUnit((contact + 30 - distance) / 30) * strength * (visible ? 1 : 0.2);
    enemyPressure += pressure;
    if (distance > 0.001) { repelX += (self.x - opponent.x) / distance * pressure; repelZ += (self.z - opponent.z) / distance * pressure; }
    const activeThreat = Math.min(3.5, (firingPressure.get(opponent.id) ?? 0) * 0.2);
    const score = 42 / (distance + 8) + weakness * 4 + exposed + finishing + activeThreat
      + (visible ? 1.2 : -1.5) - Math.max(0, strength - 1) * pressure
      + (memory.targetId === opponent.id ? 0.5 : 0) - (unreachable && enemies.length > 1 ? 20 : 0);
    scores.set(opponent.id, score);
    if (score > bestTarget) { bestTarget = score; target = opponent; }
  }
  const locked = enemies.find(opponent => opponent.id === previousTargetId);
  if (target && locked && target !== locked && time < memory.targetLockUntil) {
    const decisiveFinish = battleClear(self, target) && Math.hypot(target.x - self.x, target.z - self.z) < 55
      && (target.structure.coreExposed || target.structure.pieces.size <= 20
        || target.structure.pieces.size < (memory.masses.get(target.id) ?? target.structure.roundStartPieces) * 0.55);
    const directEmergency = criticalHealth && (firingPressure.get(target.id) ?? 0) >= 6;
    const deferred = memory.deferredTargets.get(locked.id);
    const lockedUnreachable = deferred && deferred.until > time && deferred.geometry === geometryStamp;
    if (!decisiveFinish && !directEmergency && !lockedUnreachable
      && bestTarget < (scores.get(locked.id) ?? -Infinity) + 3.5) target = locked;
  }
  // A coordinator's live hostile target supersedes the independent target lock.
  // Reachability deferrals still allow a useful fallback instead of a proxy wait.
  const assigned = order?.targetId && enemies.find(opponent => opponent.id === order.targetId);
  if (assigned && !recovering) {
    const deferred = memory.deferredTargets.get(assigned.id);
    if (!deferred || deferred.until <= time || deferred.geometry !== geometryStamp || enemies.length === 1) target = assigned;
  }
  if (target?.id !== previousTargetId) { memory.targetLockUntil = time + 3; memory.routeAge = 0; }
  memory.targetId = target?.id ?? null;
  let engagement: { age: number; distance: number; stale: number; inventory: string } | undefined;
  if (target) {
    const distance = Math.hypot(target.x - self.x, target.z - self.z);
    const inventory = `${self.structure.revision}:${self.structure.evolution?.reserveRevision ?? 0}`;
    engagement = memory.engagements.get(target.id);
    if (!engagement) {
      engagement = { age: 0, distance, stale: 0, inventory };
      memory.engagements.set(target.id, engagement);
    }
    const attackable = distance < 65 && battleClear(self, target);
    if (attackable && ammunition > 0) engagement.age += dt;
    if (attackable || inventory !== engagement.inventory || distance < engagement.distance - 0.75) {
      engagement.stale = 0; engagement.distance = distance;
    } else engagement.stale += dt;
    engagement.inventory = inventory;
    if (engagement.stale > 3) memory.routeFailed = true;
    if (engagement.stale > 5 && enemies.length > 1) {
      memory.deferredTargets.set(target.id, { until: time + 8, geometry: geometryStamp });
      engagement.stale = 0; memory.routeAge = 0;
    }
  }
  const pressing = !!engagement && engagement.age >= 12 && (reserve >= 20 || health >= 0.5);
  resourceProfile(memory, self.structure);
  let loot: PickupDrop | undefined, lootGoal: Point | undefined, lootScore = Infinity;
  const resourceCandidates: { drop: PickupDrop; score: number }[] = [];
  for (const drop of drops) {
    if (!canCollectDrop(drop, self.id)) continue;
    const deferred = memory.deferredLoot.get(drop.piece.id);
    if (deferred && deferred.until > time && deferred.geometry === geometryStamp) continue;
    const key = pieceSizeKey(drop.piece);
    const compatible = memory.repair.has(key) ? 2.2 : memory.growth.has(key) ? 1.4 : self.structure.evolution ? 0.6 : 1;
    let risk = 0;
    for (const opponent of enemies) {
      const safety = self.radius + opponent.radius + (needsRepair ? 13 : 7);
      risk += Math.max(0, safety - Math.hypot(drop.x - opponent.x, drop.z - opponent.z)) * (needsRepair ? 4 : 2);
    }
    const distance = Math.hypot(drop.x - self.x, drop.z - self.z);
    const score = distance / compatible + risk;
    const keepingLoot = drop.piece.id === memory.lootId && time < memory.lootLockUntil && risk < 20;
    resourceCandidates.push({ drop, score: score * (keepingLoot ? 0.65 : drop.piece.id === memory.lootId ? 0.88 : 1) });
  }
  resourceCandidates.sort((a, b) => a.score - b.score);
  for (const candidate of resourceCandidates) {
    const approach = lootApproach(self, candidate.drop, buildings);
    if (approach) { loot = candidate.drop; lootGoal = approach; lootScore = candidate.score; break; }
    memory.deferredLoot.set(candidate.drop.piece.id, { until: time + 8, geometry: geometryStamp });
  }
  const imminent = closest && closestDistance < self.radius + closest.radius + (needsRepair ? 12 : 5);
  const canFinish = !recovering && !!target && (target.structure.coreExposed || target.structure.pieces.size <= 20
    || target.structure.pieces.size < (memory.masses.get(target.id) ?? target.structure.roundStartPieces) * 0.55)
    && battleClear(self, target) && Math.hypot(target.x - self.x, target.z - self.z) < 48 && ammunition > 0;
  let obstruction: ArenaBuilding | undefined, firstObstruction = Infinity;
  if (target && ammunition > 0) {
    // A successful route can terminate at a safe proxy beside an unreachable
    // actor. Clear the first real cover on the attack line rather than waiting
    // at that proxy forever. A separate body-width query handles open shot
    // lanes too narrow to move through when no route exists.
    for (const building of buildings) {
      const hit = segmentBuildingHit(self.x, self.z, target.x, target.z, building, minimumShotRadius);
      if (hit !== null && hit < firstObstruction) { obstruction = building; firstObstruction = hit; }
    }
    if (!obstruction && memory.routeFailed) for (const building of buildings) {
      const hit = segmentBuildingHit(self.x, self.z, target.x, target.z, building, self.radius);
      if (hit !== null && hit < firstObstruction) { obstruction = building; firstObstruction = hit; }
    }
  }
  const flankGoal = !recovering && !collecting && target && obstruction && reserve > 0 && reserve < 8 && !criticalHealth && !urgentShot && (engagement?.stale ?? 0) < 2
    ? availableFlank(memory, self, target, obstruction, buildings, dt, minimumShotRadius) : null;
  const clearingCover = !recovering && !collecting && !!obstruction && ammunition > 0 && !flankGoal;
  let harvest: ArenaBuilding | undefined, harvestScore = Infinity, harvestAim: Point | undefined;
  const economicalHarvest = !attacking && needsStock && (reserve === 0 || !target || closestDistance > 35 || !battleClear(self, target));
  if ((recovering || collecting || economicalHarvest || (criticalHealth && !pressing) || !target || clearingCover) && ammunition > 0 && !flankGoal && (clearingCover || !loot || lootScore > 20) && (!canFinish || collecting)) {
    for (const building of buildings) {
      if (!building.structure.pieces.size || (clearingCover && building !== obstruction)) continue;
      let aim: Point | undefined, distance = Infinity;
      for (const piece of building.structure.pieces.values()) {
        const point = { x: building.x + (piece.position.x + piece.size.x / 2) * CONFIG.characterScale,
          z: building.z + (piece.position.z + piece.size.z / 2) * CONFIG.characterScale };
        const d = Math.hypot(point.x - self.x, point.z - self.z);
        if (d < distance) { aim = point; distance = d; }
      }
      if (!aim || !battleClear(self, aim, building.id)) continue;
      let risk = 0;
      for (const opponent of enemies) risk += Math.max(0, 20 - Math.hypot(aim.x - opponent.x, aim.z - opponent.z)) * (needsRepair ? 2.5 : 1);
      const score = distance + risk;
      if (score < harvestScore) { harvest = building; harvestScore = score; harvestAim = aim; }
    }
  }
  let goal: Point = { x: 0, z: 0 };
  let aim: Point = target ?? self;
  let targetId: string | null = target?.id ?? null;
  let targetKind: BattleBotAction['targetKind'] = target ? 'actor' : null;
  let fire = false;
  let intent: BattleBotIntent = canFinish ? 'finish' : 'hunt';
  const worthwhileLoot = !!loot && (recovering || collecting || criticalHealth || (!attacking && needsStock) || (needsRepair && lootScore < 20)
    || (state.style === 'collector' && preparing && reserve < 12 && lootScore < 16));
  // Collection already runs independently of the movement action. Do not stop
  // an ongoing hunt merely because automatic pickups are already in reach.
  const needsLootApproach = !!loot && (ammunition === 0 || Math.hypot(loot.x - self.x, loot.z - self.z) > self.pickupRadius - 0.15);
  const gathering = needsResources && worthwhileLoot && loot && needsLootApproach && (!canFinish || collecting) && !flankGoal && (!(pressing && reserve >= 20) || recovering || collecting)
    && (!harvest || lootScore < harvestScore + 6) && (!imminent || ammunition === 0 || needsRepair || recovering);
  const holdingPile = collecting && !!loot && !needsLootApproach;
  if ((gathering || holdingPile) && loot) {
    goal = lootGoal ?? loot;
    fire = false; targetId = null; targetKind = null; intent = recovering ? 'recover' : collecting ? 'collect' : preparing && !criticalHealth ? 'prepare' : 'recover';
  } else if (harvest && harvestAim && (!imminent || clearingCover || recovering)) {
    goal = harvestAim; aim = harvestAim; targetId = harvest.id; targetKind = 'building';
    intent = recovering ? 'recover' : collecting ? 'harvest' : clearingCover ? 'clear' : preparing && !criticalHealth ? 'prepare' : 'recover';
    fire = Math.hypot(aim.x - self.x, aim.z - self.z) < 48;
    const distance = Math.hypot(aim.x - self.x, aim.z - self.z);
    if (distance < self.radius + 9) goal = { x: self.x, z: self.z };
  } else if (flankGoal && target) {
    goal = flankGoal; aim = interception(self, target, battleLead(state.difficulty)); intent = 'flank';
  } else if (target) {
    const dx = target.x - self.x, dz = target.z - self.z, distance = Math.max(0.001, Math.hypot(dx, dz));
    const nx = dx / distance, nz = dz / distance;
    const contact = self.radius + target.radius;
    const normalRange = attacking ? 18 : state.style === 'aggressor' ? 21 : state.style === 'sniper' ? 35 : state.style === 'collector' ? 30 : 27;
    const speed = Math.hypot(target.vx, target.vz), residual = speed * (1 - battleLead(state.difficulty));
    const accurateRange = residual > 0.01 ? Math.max(0, (target.radius + minimumShotRadius) / 0.45 - difficulty.spread - 0.5) * CONFIG.projectileSpeed / residual : 65;
    const preferredRange = Math.min(normalRange, Math.max(contact + 7, accurateRange));
    const range = pressing ? contact + 3 : canFinish ? contact + 7 : Math.max(contact + 7, preferredRange + (needsRepair ? 4 : 0) + (enemyPressure > 1.6 ? 4 : 0));
    const retreat = distance < range - 3 ? -1 : distance > range + 3 ? 1 : 0;
    const strafe = pressing ? 0.18 : canFinish ? 0.3 : 0.65;
    const intercept = interception(self, target, battleLead(state.difficulty));
    const pursuit = unit(intercept.x - self.x, intercept.z - self.z);
    goal = { x: self.x + (pursuit.x * retreat - nz * flankSide * strafe) * 9,
      z: self.z + (pursuit.z * retreat + nx * flankSide * strafe) * 9 };
    // Plan to the actual interception point when distant, rather than repeatedly
    // projecting short approach steps onto the same nearby obstacle face.
    if (distance > range + 12 || (engagement?.stale ?? 0) > 2 || (!battleClear(self, target) && distance > contact + 4)) {
      goal = intercept;
      if (attacking && flankSide && distance > range + 12) {
        const width = Math.min(10, Math.max(4, contact * 0.5));
        const angled = { x: intercept.x - nz * flankSide * width, z: intercept.z + nx * flankSide * width };
        if (pointFree(angled, buildings, self.radius)) goal = angled;
      }
    }
    const spread = difficulty.spread * (canFinish ? 0.35 : 1);
    aim = { x: intercept.x + Math.sin(time * 3.1) * spread, z: intercept.z + Math.cos(time * 2.7) * spread };
    const bodyOnlyFallback = reserve === 0 && self.structure.pieces.size > 1 && ((!preparing && !criticalHealth) || (!loot && !harvest));
    const combatReady = !criticalHealth || canFinish || !!imminent || reserve >= 6 || bodyOnlyFallback;
    fire = distance < (reserve === 0 && !canFinish ? 45 : 65) && battleClear(self, aim) && plausibleHit(self, target, state.difficulty, minimumShotRadius, canFinish) >= 0.42 && combatReady
      && (reserve > 0 || canFinish || !!imminent || bodyOnlyFallback);
  } else if (loot) {
    goal = lootGoal ?? loot; targetId = null; targetKind = null;
  }
  if (recovering && !gathering && targetKind !== 'building') {
    // Never turn a recovery swap into a finishing trade. Move towards actual
    // resources, or create a little safe separation while the coordinator exits
    // recovery; an irreversibly exposed Core alone cannot make this order stick.
    fire = false; targetId = null; targetKind = null; intent = 'recover';
    if (loot) goal = lootGoal ?? loot;
    else if (closest) {
      const away = unit(self.x - closest.x, self.z - closest.z);
      goal = { x: self.x + away.x * 12, z: self.z + away.z * 12 };
    }
  }
  if (((imminent && (criticalHealth || ammunition < 2)) || enemyPressure > 1.6) && closest && !canFinish && !flankGoal && !pressing) {
    const away = unit(repelX || self.x - closest.x, repelZ || self.z - closest.z);
    const escape = { x: away.x - away.z * flankSide * 0.35, z: away.z + away.x * flankSide * 0.35 };
    if (!gathering || !loot || (loot.x - self.x) * escape.x + (loot.z - self.z) * escape.z < 0) {
      goal = { x: self.x + escape.x * 12, z: self.z + escape.z * 12 };
      intent = 'evade';
    }
  }
  const shelteredGoal = target && criticalHealth && !canFinish && !pressing
    && (dangerous.some(threat => threat.count >= 6) || (memory.shelter?.age ?? 0) > 0)
    ? nearbyShelter(memory, self, target, enemies, buildings, dt) : null;
  if (shelteredGoal) {
    goal = shelteredGoal; fire = false; targetId = null; targetKind = null; intent = 'evade';
  }
  state.dodgeTime = Math.max(0, state.dodgeTime - dt);
  state.dodgeCooldown = Math.max(0, state.dodgeCooldown - dt);
  state.decision -= dt;
  let direction = steerBattle(memory, self, goal, buildings, state, dt);
  if ((gathering || holdingPile) && loot && !shelteredGoal) {
    const distance = Math.hypot(loot.x - self.x, loot.z - self.z);
    const inventory = `${self.structure.revision}:${self.structure.evolution?.reserveRevision ?? 0}`;
    if (memory.lootId !== loot.piece.id || inventory !== memory.inventoryStamp || distance < memory.lootDistance - 0.2) {
      if (memory.lootId !== loot.piece.id) memory.lootLockUntil = time + 1.5;
      memory.lootId = loot.piece.id; memory.lootDistance = distance; memory.lootStall = 0; memory.inventoryStamp = inventory;
    } else memory.lootStall += dt * (memory.routeFailed ? 3 : 1);
    if (memory.lootStall > 2.5) {
      memory.deferredLoot.set(loot.piece.id, { until: time + 8, geometry: geometryStamp });
      memory.lootId = null; memory.lootStall = 0; memory.routeAge = 0;
    }
  } else { memory.lootId = null; memory.lootStall = 0; }
  if (state.decision <= 0 || urgentShot) {
    state.decision = difficulty.decision;
    const emergency = dangerous.some(threat => threat.impactTime < 0.18 && threat.count >= 3);
    if (state.dodgeTime === 0 && (state.dodgeCooldown === 0 || emergency)) {
      const dodge = battleDodge(self, incoming, buildings, state.side, CONFIG.botSpeed * difficulty.speed * 1.25);
      const chance = Math.max(0.4, difficulty.dodgeChance);
      if (dodge && (emergency || chance === 1 || random() < chance)) {
        state.dodgeX = dodge.x; state.dodgeZ = dodge.z; state.dodgeTime = 0.28;
        state.dodgeCooldown = state.style === 'sniper' ? 0.38 : 0.62;
      }
    }
  }
  const edgeX = CONFIG.arenaWidth / 2 - self.radius - 0.1, edgeZ = CONFIG.arenaDepth / 2 - self.radius - 0.1;
  if (Math.abs(self.x) > edgeX && Math.sign(direction.x) === Math.sign(self.x)) direction.x = -Math.sign(self.x) * 4;
  if (Math.abs(self.z) > edgeZ && Math.sign(direction.z) === Math.sign(self.z)) direction.z = -Math.sign(self.z) * 4;
  const length = Math.hypot(direction.x, direction.z);
  if (length > 0.001) direction = { x: direction.x / length, z: direction.z / length };
  state.moveX = direction.x; state.moveZ = direction.z;
  const dodging = state.dodgeTime > 0;
  const baseInterval = state.style === 'aggressor' ? 0.42 : state.style === 'collector' ? 0.72 : state.style === 'sniper' ? 0.7 : CONFIG.botShotInterval;
  let shotCount = fire && alive(self) ? attackBatch(self, target, targetKind, reserve, canFinish, health, urgentShot, state.difficulty, pressing) : 0;
  // A broad packed volley may not fit the same opening as one part. Spend a
  // smaller real group when it can hit, rather than pouring stock into cover.
  if (shotCount > 0 && targetKind === 'actor') {
    for (const count of [...new Set([shotCount, Math.min(8, shotCount), Math.min(4, shotCount), 1])]) {
      if (clearShot(self, aim, buildings, undefined, volleyRadius(memory, self, count))) { shotCount = count; break; }
      shotCount = 0;
    }
  }
  const ordinaryInterval = baseInterval * (pressing ? 0.5 : difficulty.shotInterval)
    * (reserve === 0 && targetKind === 'actor' && !canFinish ? 1.65 : 1);
  const stockedPressure = (order?.round ?? 1) >= 2 && reserve > 0 && targetKind === 'actor' && target
    && (reserve >= 4 || pressing || canFinish || plausibleHit(self, target, state.difficulty, minimumShotRadius, false) >= 0.75);
  // Growth can immediately consume pickups, leaving a healthy attacker with no
  // stock. Its already bounded, real body batch should retain later-round pace;
  // neither this decision nor the firing layer replenishes parts or cooldowns.
  const bodyPressure = (order?.round ?? 1) >= 2 && reserve === 0 && shotCount > 0
    && targetKind === 'actor' && !recovering && !collecting && (health >= 0.68 || canFinish);
  const shotInterval = Math.max(CONFIG.shotInterval, stockedPressure || bodyPressure ? CONFIG.shotInterval : ordinaryInterval);
  const move = dodging ? { x: state.dodgeX, z: state.dodgeZ } : direction;
  const moveSpeed = CONFIG.botSpeed * difficulty.speed * (dodging ? 1.25 : 1);
  const travellingToLoot = !!loot && (gathering || recovering || collecting)
    && Math.hypot(loot.x - self.x, loot.z - self.z) > self.pickupRadius + 14;
  const closing = !!target && targetKind === 'actor' && !recovering && !collecting && ammunition > 0 && !needsRepair
    && Math.hypot(target.x - self.x, target.z - self.z) > self.radius + target.radius + 18
    && (target.x - self.x) * move.x + (target.z - self.z) * move.z > 10;
  const retreating = !!closest && (intent === 'evade' || recovering) && !!imminent
    && (self.x - closest.x) * move.x + (self.z - closest.z) * move.z > 0;
  const evasiveDash = dangerous.some(threat => threat.impactTime < 0.65 && (threat.count >= 2 || criticalHealth));
  const dash = (evasiveDash || retreating || closing || travellingToLoot)
    && safeBattleDash(self, move, moveSpeed, buildings, hostileShots, enemies, evasiveDash || retreating);
  memory.intent = dodging ? 'evade' : intent;
  return {
    x: move.x, z: move.z, speed: moveSpeed, dash,
    aimX: aim.x, aimZ: aim.z, fire: shotCount > 0, shotCount, intent: memory.intent,
    shotInterval,
    dodging, panic: !!imminent && (needsRepair || state.style === 'sniper'), targetId, targetKind,
  };
}
