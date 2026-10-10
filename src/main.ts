import * as THREE from 'three';
import { CHARACTER_TEMPLATES } from './assets/templates';
import { createStructure, damageStructure, getBounds, coreExposureThreshold } from './game/structure';
import { newBattleRound, nextBattleRound, battleWinner, playerBattleOutcome, releaseEliminatedReserve, type BattleRound } from './game/rounds';
import { CONFIG } from './game/config';
import { firstBattleImpact } from './game/battle-combat';
import { collectNearbyDrops, pickupRadiusForBounds, type PickupState } from './game/pickup';
import { groundIndex } from './game/ground-index';
import { createDash, startDash, movePlayer, moveDashingBody, clampToArena, type DashState } from './game/movement';
import { BOT_LABELS, BOT_DIFFICULTIES, createBot, thinkBattleBot, type BotState } from './game/bots';
import { createBotSquad, coordinateBotSquad, battleTeamId, areBattleAllies, type BotSquadRole } from './game/bot-squad';
import { createVictoryCollection, stepVictoryCollection, type VictoryCollection } from './game/victory';
import { assembleReserve, evolutionProgress } from './game/evolution';
import { debrisFloorY, debrisRenderSize } from './game/debris';
import { createBuildingDebris, debrisRadius, findNearbyDebrisPosition, clampDebrisToArena, stepDebrisPhysics, type MovingDebris } from './game/debris-motion';
import { takeAmmunitionBatch } from './game/ammunition';
import { createPartProjectile, stepPartProjectile, projectilePartOffsets, SHOT_PICKUP_LOCK, type PartProjectile } from './game/projectiles';
import { createRune, stepRune, collectRune } from './game/rune';
import { generateArenaBuildings, damageArenaBuilding, resolveArenaBuildings, segmentBuildingHit, type ArenaBuilding } from './game/arena';
import type { CharacterTemplate, EvolutionId, Piece, Structure } from './game/types';
import { ArenaRenderer, CharacterView, ReserveView, createPieceProjectile, createRuneCube, disposePieceProjectile } from './render';
import { GameUI } from './ui';
import { Sound } from './sound';
import './style.css';

type Phase = 'lobby' | 'playing' | 'collecting' | 'paused' | 'result';
interface Actor {
  id: string; template: CharacterTemplate; structure: Structure;
  view: CharacterView; x: number; z: number; vx: number; vz: number;
  cooldown: number; pickupRadius: number; hurt: number; radius: number; boundsRevision: number;
  bounds: ReturnType<typeof getBounds>;
  bot?: BotState; dash?: DashState; panic: boolean; eliminated: boolean;
  squadRole: BotSquadRole; desiredShotCount: number; lastShotCount: number; shotsFired: number; dashStarts: number;
}
interface Shot extends PartProjectile { owner: Actor; mesh: THREE.Group }
interface Drop extends PickupState, MovingDebris { skipAgeOnce?: boolean }
interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; color: THREE.Color; scale: number }
interface Stats { elapsed: number; repairs: number; growth: number; shots: number; hits: number; direct: number; cascade: number }
const combatEvents: { ownerId: string; targetId: string; kind: 'actor' | 'building'; time: number }[] = [];
function recordImpact(ownerId: string, targetId: string, kind: 'actor' | 'building') {
  combatEvents.push({ ownerId, targetId, kind, time: simTime });
  if (combatEvents.length > 80) combatEvents.shift();
}

const root = document.querySelector<HTMLElement>('#app')!;
const canvas = document.querySelector<HTMLCanvasElement>('#arena')!;
let renderer: ArenaRenderer;
try { renderer = new ArenaRenderer(canvas); }
catch {
  const section = document.createElement('section');
  section.className = 'webgl-error';
  const heading = document.createElement('h1');
  heading.textContent = 'The 3D arena could not start';
  const explanation = document.createElement('p');
  explanation.textContent = 'This game needs WebGL. Try enabling hardware acceleration or opening the game in another browser.';
  const reload = document.createElement('button');
  reload.textContent = 'Try Again';
  reload.addEventListener('click', () => location.reload());
  section.append(heading, explanation, reload);
  root.replaceChildren(section);
  throw new Error('WebGL renderer unavailable');
}
const sound = new Sound();
let phase: Phase = 'lobby';
let round: BattleRound | null = null;
let selected = CHARACTER_TEMPLATES[0].id;
let selectedEvolution: EvolutionId = 'mosher';
let shotCount = 1;
let rune = createRune();
let actors: Actor[] = [];
let shots: Shot[] = [];
let drops: Drop[] = [];
let particles: Particle[] = [];
let stats = emptyStats();
let simTime = 0;
let buildings: ArenaBuilding[] = [];
let buildingViews: CharacterView[] = [];
let playerPlacement = 1;
let dash = createDash();
let squad = createBotSquad();
let dashRequested = false;
let victory: VictoryCollection<Drop> | null = null;
let resumePhase: 'playing' | 'collecting' = 'playing';
let toastDelay = 0;
let firing = false;
let firePointerId: number | null = null;
function stopFiring(pointerId?: number) {
  if (pointerId !== undefined && pointerId !== firePointerId) return;
  const previous = firePointerId;
  firePointerId = null; firing = false;
  if (previous !== null && canvas.hasPointerCapture(previous)) canvas.releasePointerCapture(previous);
}
let aim = new THREE.Vector3(18, 0, 0);
let pointerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let touchMovement = { x: 0, z: 0 };
const keys = new Set<string>();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const transform = new THREE.Object3D();
const dropColor = new THREE.Color();
const dropGeometry = new THREE.BoxGeometry(1, 1, 1);
const dropMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7 });
const initialDropCapacity = 1024;
let droppedView = new THREE.InstancedMesh(dropGeometry, dropMaterial, initialDropCapacity);
let renderedDrops: Drop[] = [];
let renderedDropTransforms = new Float64Array(initialDropCapacity * 4);
droppedView.castShadow = true;
droppedView.frustumCulled = false;
droppedView.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
renderer.scene.add(droppedView);
function resizeDropView(capacity: number) {
  const previous = droppedView;
  droppedView = new THREE.InstancedMesh(dropGeometry, dropMaterial, capacity);
  droppedView.castShadow = true;
  droppedView.frustumCulled = false;
  droppedView.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  renderer.scene.remove(previous);
  previous.dispose();
  renderer.scene.add(droppedView);
  renderedDrops = [];
  renderedDropTransforms = new Float64Array(capacity * 4);
}
const particleView = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 500);
particleView.frustumCulled = false;
particleView.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
renderer.scene.add(particleView);
const ui = new GameUI(root, CHARACTER_TEMPLATES, {
  onStart: (id) => { selected = id; startRound(); },
  onRestart: () => startRound(),
  onNextRound: () => {
    if (phase === 'result' && round && battleWinner(round)?.id === 'player') {
      beginRound(nextBattleRound(CHARACTER_TEMPLATES, round));
    }
  },
  onLobby: () => showPreview(),
  onPause: () => togglePause(),
  onMute: () => toggleMute(),
  onSelect: (id) => { selected = id; if (phase === 'lobby') showPreview(); },
  onShotCountChange: (value) => { shotCount = Math.max(1, Math.min(20, Math.round(value))); updateUI(); },
  onDash: () => { if (phase === 'playing' && actors[0] && alive(actors[0])) dashRequested = true; },
  onEvolution: (id) => { selectedEvolution = id; },
  onMove: (x, z) => { touchMovement = { x, z }; },
});
const reserveViews = [new ReserveView(ui.reserveStage('player'), -1)];
renderer.reserveViews = reserveViews;
const runeView = createRuneCube();
runeView.visible = false;
renderer.scene.add(runeView);

function emptyStats(): Stats { return { elapsed: 0, repairs: 0, growth: 0, shots: 0, hits: 0, direct: 0, cascade: 0 }; }
function createActor(id: Actor['id'], template: CharacterTemplate, x: number, z: number, structure = createStructure(template)): Actor {
  const accent = ({ player: '#7c3aed', 'bot-1': '#248d79', 'bot-2': '#e56b3d', 'bot-3': '#ca9b24' } as Record<string, string>)[id] ?? '#638596';
  const view = new CharacterView(renderer.scene, accent);
  view.sync(structure);
  return { id, template, structure, view, x, z, vx: 0, vz: 0, cooldown: 0, pickupRadius: CONFIG.pickupRadius, hurt: 0, radius: 3.3, boundsRevision: -1, bounds: getBounds(structure), panic: false, eliminated: false,
    dash: id === 'player' ? undefined : createDash(), squadRole: 'independent', desiredShotCount: 0, lastShotCount: 0, shotsFired: 0, dashStarts: 0 };
}
function clearRound() {
  actors.forEach(a => a.view.dispose(renderer.scene));
  buildingViews.forEach(view => view.dispose(renderer.scene));
  shots.forEach(s => disposePieceProjectile(renderer.scene, s.mesh));
  actors = []; shots = []; drops = []; particles = [];
  buildings = []; buildingViews = [];
  combatEvents.length = 0;
  renderedDrops = [];
  if (droppedView.instanceMatrix.count > initialDropCapacity * 4) resizeDropView(initialDropCapacity);
  keys.clear(); stopFiring(); dashRequested = false; touchMovement = { x: 0, z: 0 };
  dash = createDash(); victory = null; playerPlacement = 1;
  squad = createBotSquad();
  rune = createRune(); runeView.visible = false;
}
function showPreview() {
  clearRound();
  round = null;
  stats = emptyStats();
  const template = CHARACTER_TEMPLATES.find(t => t.id === selected)!;
  const a = createActor('player', template, 0, 0);
  a.view.root.scale.setScalar(1);
  actors = [a];
  ui.setScreen('lobby');
  renderer.setPreviewMode(true);
  phase = 'lobby';
  updateUI();
}
function startRound() {
  beginRound(newBattleRound(CHARACTER_TEMPLATES, selected, Math.random, selectedEvolution));
}
function beginRound(state: BattleRound) {
  sound.unlock();
  clearRound();
  round = state;
  const spawnX = CONFIG.arenaWidth * 0.36, spawnZ = CONFIG.arenaDepth * 0.36;
  const corners = [[-spawnX, spawnZ], [spawnX, -spawnZ], [-spawnX, -spawnZ], [spawnX, spawnZ]];
  actors = state.participants.map((participant, index) => {
    const actor = createActor(participant.id, participant.template, corners[index][0], corners[index][1], participant.structure);
    if (participant.style && participant.difficulty) actor.bot = createBot(participant.style, Math.random, participant.difficulty);
    return actor;
  });
  for (const actor of actors) { updateBounds(actor); clampToArena(actor); }
  // A carried final form also needs a clear spawn footprint.
  buildings = generateArenaBuildings(Math.random, state.number).filter(building =>
    actors.every(actor => segmentBuildingHit(actor.x, actor.z, actor.x, actor.z, building, actor.radius + 1) === null));
  buildingViews = buildings.map(building => {
    const view = new CharacterView(renderer.scene, '#8c9b8d');
    view.root.position.set(building.x, 0, building.z);
    view.ring.visible = view.core.visible = false;
    view.sync(building.structure);
    return view;
  });
  for (const actor of actors) { updateBounds(actor); clampToArena(actor); }
  stats = emptyStats(); simTime = 0; toastDelay = 0;
  phase = 'playing';
  resumePhase = 'playing';
  seedDrops(24, 0);
  ui.setScreen('playing');
  renderer.setPreviewMode(false);
  const challenge = state.number === 1 ? 'Every fighter for themselves'
    : state.number === 2 ? `${actors[1].template.name} + ${actors[2].template.name} are allied`
    : state.number === 3 ? 'All three bots are allied against you' : 'Bot squad · Crossfire, growth and recovery';
  ui.toast(`Round ${state.number} · ${challenge}`, 'repair');
  updateUI();
  canvas.focus();
}
function seedDrops(count: number, offset: number) {
  const source = actors[0].template.pieces.filter(p => p.size.x <= 2 && p.size.z <= 2 && p.size.y <= 1.21);
  for (let i = 0; i < count; i++) {
    const p = source[i % source.length];
    if (!p) continue;
    const angle = i * 2.399, radius = 5 + (i % 5) * 1.4;
    drops.push({ ownerId: null, piece: { ...p, id: `round-${round?.number ?? 0}/loose-${i}`, position: { ...p.position }, size: { ...p.size } }, x: Math.cos(angle) * radius + offset, z: Math.sin(angle) * radius, y: debrisFloorY(p) + 0.02, vx: 0, vy: 0, vz: 0, age: 2, settled: true, rotation: Math.random() * Math.PI });
  }
}
function togglePause() {
  if (phase !== 'playing' && phase !== 'collecting' && phase !== 'paused') return;
  if (phase === 'paused') phase = resumePhase;
  else { resumePhase = phase; phase = 'paused'; }
  stopFiring(); dashRequested = false; keys.clear(); ui.setScreen(phase);
  if (phase !== 'paused') { sound.unlock(); canvas.focus(); }
}
function toggleMute() { sound.muted = !sound.muted; ui.setMuted(sound.muted); updateUI(); }
function alive(actor: Actor): boolean { return actor.structure.pieces.has(actor.structure.coreId); }
function projectileDrops(shot: Shot): Drop[] {
  const offsets = projectilePartOffsets(shot.pieces);
  return shot.pieces.map((piece, i) => {
    const position = { piece, x: shot.x + offsets[i].x, z: shot.z + offsets[i].z };
    clampDebrisToArena(position);
    const clear = findNearbyDebrisPosition(position, debrisRadius(piece), buildings);
    if (clear) { position.x = clear.x; position.z = clear.z; }
    return { piece, ownerId: shot.ownerId, x: position.x, y: Math.max(debrisFloorY(piece), shot.y + offsets[i].y), z: position.z,
      vx: 0, vy: Math.min(0, shot.vy), vz: 0, age: shot.age, settled: false,
      rotation: Math.random() * Math.PI, lockedUntilAge: SHOT_PICKUP_LOCK, skipAgeOnce: true };
  });
}
function eliminate(actor: Actor) {
  if (actor.eliminated || alive(actor)) return;
  actor.eliminated = true; actor.vx = actor.vz = 0;
  if (actor.dash) actor.dash.remaining = 0;
  for (const piece of releaseEliminatedReserve(actor.structure)) {
    drops.push({ ownerId: actor.id, piece, x: actor.x + (Math.random() - 0.5) * 3, z: actor.z + (Math.random() - 0.5) * 3,
      y: 1.5, vx: (Math.random() - 0.5) * 5, vy: 3, vz: (Math.random() - 0.5) * 5, age: 0, settled: false, rotation: 0 });
  }
  burst(actor.x, 3, actor.z, 50, '#ed7c47');
  if (actor.id === 'player') {
    playerPlacement = actors.filter(alive).length + 1;
    stopFiring(); dashRequested = false; keys.clear(); dash.remaining = 0;
  } else ui.toast(`${actor.template.name} eliminated · ${actors.filter(alive).length} remain`, 'hit');
  updateUI();
}
function finish(won: boolean) {
  if (phase !== 'playing') return;
  stopFiring(); dashRequested = false; keys.clear(); touchMovement = { x: 0, z: 0 };
  for (const shot of shots) { drops.push(...projectileDrops(shot)); disposePieceProjectile(renderer.scene, shot.mesh); }
  shots = [];
  drops.forEach(drop => { drop.skipAgeOnce = false; });
  actors.forEach(actor => { actor.vx = 0; actor.vz = 0; if (actor.dash) actor.dash.remaining = 0; });
  dash.remaining = 0;
  sound.play(won ? 'win' : 'lose');
  if (won) {
    victory = createVictoryCollection(drops);
    phase = 'collecting';
    ui.setScreen('collecting');
    updateUI();
  } else showResult(false);
}
function showResult(won: boolean) {
  phase = 'result';
  updateUI();
  ui.showResult(won, { ...stats, round: round!.number, carriedPieces: actors[0].structure.pieces.size, basePieces: round!.playerTemplate.pieces.length,
    victoryCollected: victory?.collected ?? 0, victorySkipped: victory?.skipped ?? 0,
    reserve: actors[0].structure.evolution?.reserve.length ?? 0,
    evolutionName: evolutionProgress(actors[0].structure)?.name ?? '', evolved: victory?.evolved ?? false,
    placement: won ? 1 : playerPlacement, winner: battleWinner(round!)?.template.name ?? '' });
}
function fire(actor: Actor, tx: number, tz: number, interval: number = CONFIG.shotInterval, count = actor.id === 'player' ? shotCount : 1) {
  actor.desiredShotCount = Number.isFinite(count) ? Math.max(0, Math.min(20, Math.trunc(count))) : 0;
  if (actor.cooldown > 0 || !alive(actor) || Math.hypot(tx - actor.x, tz - actor.z) < 0.1) return;
  const ammunition = takeAmmunitionBatch(actor.structure, count);
  if (!ammunition.length) return;
  actor.cooldown = Math.max(CONFIG.shotInterval, Number.isFinite(interval) ? interval : CONFIG.shotInterval);
  actor.lastShotCount = ammunition.length; actor.shotsFired++;
  const parts = ammunition.map(ammo => ammo.piece);
  const projectile = createPartProjectile(parts, actor.id, actor.x, actor.z, tx, tz);
  const mesh = createPieceProjectile(parts);
  mesh.position.set(projectile.x, projectile.y, projectile.z);
  renderer.scene.add(mesh);
  shots.push({ ...projectile, owner: actor, mesh });
  updateBounds(actor);
  if (actor.id === 'player') stats.shots++;
  sound.play('shot', actor.id === 'player' ? 1 : 0.5);
}
function burst(x: number, y: number, z: number, count: number, color: string) {
  for (let i = 0; i < count && particles.length < 450; i++) {
    const life = 0.25 + Math.random() * 0.45;
    particles.push({ x, y, z, vx: (Math.random() - 0.5) * 17, vy: Math.random() * 12, vz: (Math.random() - 0.5) * 17, life, max: life, color: new THREE.Color(color), scale: 0.1 + Math.random() * 0.28 });
  }
}
function knockOff(target: Actor, pieces: Piece[]) {
  for (const piece of pieces) {
    const local = new THREE.Vector3(piece.position.x + piece.size.x / 2, piece.position.y + piece.size.y / 2 - target.view.groundOffset, piece.position.z + piece.size.z / 2);
    local.multiplyScalar(CONFIG.characterScale).applyAxisAngle(new THREE.Vector3(0, 1, 0), target.view.root.rotation.y);
    const angle = Math.random() * Math.PI * 2, speed = 11 + Math.random() * 10;
    drops.push({ ownerId: target.id, piece, x: target.x + local.x, y: Math.max(0.5, local.y), z: target.z + local.z, vx: Math.cos(angle) * speed, vy: 4 + Math.random() * 7, vz: Math.sin(angle) * speed, age: 0, settled: false, rotation: Math.random() * Math.PI });
  }
}
function hit(shot: Shot, target: Actor) {
  if (shot.ownerId === target.id || (round && areBattleAllies(round.number, shot.ownerId, target.id))) return;
  recordImpact(shot.ownerId, target.id, 'actor');
  const wasExposed = target.structure.coreExposed;
  const result = damageStructure(target.structure, shot.damage);
  updateBounds(target);
  knockOff(target, [...result.direct, ...result.cascade]);
  target.hurt = 0.2;
  burst(shot.x, 3, shot.z, 12 + Math.min(15, result.cascade.length), shot.owner.id === 'player' ? '#e56b3d' : '#5d9a86');
  renderer.kick(target.id === 'player' ? 0.4 : 0.17);
  sound.play('hit');
  if (result.cascade.length > 4) sound.play('cascade', 0.6);
  if (shot.owner.id === 'player') {
    stats.hits++; stats.direct += result.direct.length; stats.cascade += result.cascade.length;
    if (result.cascade.length > 3 && toastDelay <= 0) {
      ui.toast(`Chain reaction · ${result.direct.length + result.cascade.length} pieces`, 'hit'); toastDelay = 1.5;
    }
  }
  if (!wasExposed && target.structure.coreExposed && !result.eliminated) {
    ui.toast(target.id === 'player' ? 'Your Core is exposed! Repairs cannot restore its protection.' : 'Enemy Core exposed!', 'hit');
    toastDelay = 2;
  }
  if (result.eliminated) eliminate(target);
}
function hitBuilding(shot: Shot, target: ArenaBuilding) {
  recordImpact(shot.ownerId, target.id, 'building');
  const result = damageArenaBuilding(target, shot.damage, Math.random, { x: shot.x, z: shot.z });
  drops.push(...createBuildingDebris(target, [...result.direct, ...result.cascade], buildings));
  burst(shot.x, 2, shot.z, 10, shot.piece.color);
  sound.play('hit', 0.5);
  if (shot.ownerId === 'player') { stats.hits++; stats.direct += result.direct.length; stats.cascade += result.cascade.length; }
}
function pointerAim(clientX: number, clientY: number) {
  return renderer.pointer(clientX, clientY, [
    ...actors.filter(actor => actor.id !== 'player' && alive(actor)).map(actor => ({ mesh: actor.view.body, x: actor.x, z: actor.z })),
    ...buildings.filter(building => building.structure.pieces.size > 0).map(building => ({
      mesh: buildingViews[buildings.indexOf(building)].body, x: building.x, z: building.z, kind: 'building' as const,
    })),
  ]);
}
function updateBounds(a: Actor) {
  if (a.boundsRevision === a.structure.revision) return;
  const b = getBounds(a.structure);
  a.bounds = b;
  a.pickupRadius = pickupRadiusForBounds(b);
  a.radius = Math.min(Math.min(CONFIG.arenaWidth, CONFIG.arenaDepth) / 2 - 2,
    Math.max(2.2, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * CONFIG.characterScale * 0.44));
  a.view.ring.scale.setScalar(a.radius / 3.9);
  a.boundsRevision = a.structure.revision;
}
function bot(dt: number) {
  const floor = groundIndex(drops);
  const living = actors.filter(alive), threats = shots.filter(shot => shot.mode === 'shot');
  const orders = coordinateBotSquad(squad, round!.number, living, simTime);
  for (const actor of living) {
    if (!actor.bot) continue;
    const hostile = (id: string) => !areBattleAllies(round!.number, actor.id, id);
    const order = orders.get(actor.id);
    const action = thinkBattleBot(actor.bot, actor, living.filter(other => hostile(other.id)), drops,
      threats.filter(shot => hostile(shot.ownerId)), buildings, dt, simTime, Math.random, order, floor);
    actor.squadRole = order?.role ?? 'independent';
    actor.desiredShotCount = action.shotCount;
    const previous = { x: actor.x, z: actor.z };
    const botDash = actor.dash!;
    if (action.dash && startDash(botDash, action.x, action.z, action.aimX - actor.x, action.aimZ - actor.z)) actor.dashStarts++;
    moveDashingBody(actor, botDash, action.x, action.z, action.speed, dt);
    resolveArenaBuildings(actor, buildings, previous);
    actor.panic = action.panic;
    if (action.fire) fire(actor, action.aimX, action.aimZ, action.shotInterval, action.shotCount);
  }
}
function updateDrops(dt: number, collect: boolean, advanceAges = true) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; if (advanceAges && !d.skipAgeOnce) d.age += dt; d.skipAgeOnce = false;
  }
  stepDebrisPhysics(drops, buildings, dt);
  if (!collect) return;
  const results = collectNearbyDrops(drops, actors);
  let repairs = 0, growth = 0, banked = 0;
  for (const { drop, collector, attachment } of results) {
    burst(drop.x, 0.5, drop.z, 2, collector.id === 'player' ? '#ed9963' : '#61a68b');
    if (collector.id !== 'player') continue;
    if (attachment.mode === 'repair') repairs++;
    else if (attachment.mode === 'growth') growth++;
    else banked++;
  }
  for (const actor of actors) {
    if (!alive(actor)) continue;
    const built = assembleReserve(actor.structure);
    if (actor.id === 'player') {
      repairs += built.filter(p => p.mode === 'repair').length;
      growth += built.filter(p => p.mode === 'growth').length;
    }
  }
  if (repairs + growth + banked > 0) {
    stats.repairs += repairs; stats.growth += growth;
    sound.play('pickup');
  }
}
function tick(dt: number) {
  if (phase === 'paused' || phase === 'result') return;
  simTime += dt;
  if (phase === 'collecting' && victory) {
    const player = actors[0];
    updateDrops(dt, false, false);
    const collected = stepVictoryCollection(victory, drops, player, dt);
    const built = [...collected.attachments.map(a => a.attachment), ...(victory.evolved ? [] : collected.assembled)];
    for (const attachment of built) {
      if (attachment.mode === 'repair') stats.repairs++;
      else if (attachment.mode === 'growth') stats.growth++;
    }
    if (collected.attachments.length || collected.assembled.length) {
      sound.play('pickup', 0.6);
      if (!reducedMotion.matches) burst(player.x, 2.5, player.z, 2, '#7c3aed');
    }
    player.hurt = Math.max(0, player.hurt - dt);
    updateBounds(player); clampToArena(player);
    if (collected.done) showResult(true);
    return;
  }
  if (phase !== 'playing') return;
  const initialOutcome = playerBattleOutcome(round!);
  if (initialOutcome !== 'playing') { finish(initialOutcome === 'victory'); return; }
  stats.elapsed += dt; toastDelay -= dt;
  if (stepRune(rune, dt)) ui.toast('Color rune appeared at the center', 'growth');
  for (const a of actors) { a.cooldown -= dt; a.hurt = Math.max(0, a.hurt - dt); updateBounds(a); }
  const p = actors[0];
  aim = pointerAim(pointerPosition.x, pointerPosition.y);
  const mx = THREE.MathUtils.clamp(Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touchMovement.x, -1, 1);
  const mz = THREE.MathUtils.clamp(Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')) + touchMovement.z, -1, 1);
  if (dashRequested && alive(p)) {
    if (startDash(dash, mx, mz, aim.x - p.x, aim.z - p.z)) p.dashStarts++;
    dashRequested = false;
  }
  const dashing = dash.remaining > 0;
  if (alive(p)) {
    const previous = { x: p.x, z: p.z };
    movePlayer(p, dash, mx, mz, dt);
    resolveArenaBuildings(p, buildings, previous);
  }
  if (dashing && !reducedMotion.matches) burst(p.x, 0.6, p.z, 2, '#7c3aed');
  if (firing) fire(p, aim.x, aim.z);
  bot(dt);
  const living = actors.filter(alive), prior = new Map(living.map(actor => [actor, { x: actor.x, z: actor.z }]));
  for (let i = 0; i < living.length; i++) for (let j = i + 1; j < living.length; j++) {
    const a = living[i], b = living[j], dx = b.x - a.x, dz = b.z - a.z;
    const distance = Math.hypot(dx, dz), separation = (a.radius + b.radius) * 0.8;
    if (distance < separation) {
      const overlap = (separation - distance) / 2, nx = distance > 0.001 ? dx / distance : 1, nz = distance > 0.001 ? dz / distance : 0;
      a.x -= nx * overlap; a.z -= nz * overlap; b.x += nx * overlap; b.z += nz * overlap;
    }
  }
  for (const actor of living) { resolveArenaBuildings(actor, buildings, prior.get(actor)); clampToArena(actor); }
  const runeCollector = collectRune(rune, living);
  if (runeCollector) {
    burst(0, 2, 0, 24, '#c2ccd8'); sound.play('pickup');
    if (runeCollector.id === 'player') ui.toast('Original colors restored', 'growth');
  }
  for (let i = shots.length - 1; i >= 0; i--) {
    const shot = shots[i], bx = shot.x + shot.vx * dt, bz = shot.z + shot.vz * dt;
    const impact = firstBattleImpact(shot, bx, bz, actors, buildings,
      (ownerId, targetId) => !areBattleAllies(round!.number, ownerId, targetId));
    if (impact) {
      shot.x += (bx - shot.x) * impact.fraction; shot.z += (bz - shot.z) * impact.fraction; shot.age += dt;
      if (impact.kind === 'actor') hit(shot, impact.target);
      else hitBuilding(shot, impact.target);
      drops.push(...projectileDrops(shot)); disposePieceProjectile(renderer.scene, shot.mesh); shots.splice(i, 1);
      if (playerBattleOutcome(round!) !== 'playing') {
        // The result freezes combat, but unprocessed parts still lived this frame.
        for (let pending = i - 1; pending >= 0; pending--) shots[pending].age += dt;
        break;
      }
    } else {
      const step = stepPartProjectile(shot, dt, Math.random, (x, z, radius) =>
        buildings.every(building => segmentBuildingHit(x, z, x, z, building, radius) === null));
      if (step.landed) { drops.push(...projectileDrops(shot)); disposePieceProjectile(renderer.scene, shot.mesh); shots.splice(i, 1); }
    }
  }
  const outcome = playerBattleOutcome(round!);
  if (outcome !== 'playing') finish(outcome === 'victory');
  if (phase === 'playing') updateDrops(dt, true);
}
function draw(dt: number) {
  actors.forEach((a, index) => {
    updateBounds(a);
    a.view.sync(a.structure);
    a.view.root.position.set(a.x, a.hurt > 0 ? Math.sin(a.hurt * 60) * 0.12 : Math.sin(simTime * 11) * Math.min(0.08, Math.hypot(a.vx, a.vz) * 0.005), a.z);
    const yaw = phase === 'lobby' ? (reducedMotion.matches ? -0.15 : Math.sin(simTime * 0.4) * 0.23 - 0.15) : THREE.MathUtils.clamp(a.vx * 0.018, -0.25, 0.25);
    a.view.root.rotation.y += (yaw - a.view.root.rotation.y) * Math.min(1, dt * 8);
    a.view.ring.position.set(a.x, 0.06, a.z);
    a.view.root.visible = a.structure.pieces.size > 0;
    a.view.ring.visible = phase !== 'lobby' && a.structure.pieces.size > 0;
    if (phase === 'result' && !a.structure.pieces.has(a.structure.coreId)) a.view.ring.visible = false;
    if (index === 0 && phase === 'lobby') a.view.ring.rotation.z = simTime * 0.1;
  });
  buildings.forEach((building, i) => {
    const view = buildingViews[i]; view.sync(building.structure);
    view.root.visible = building.structure.pieces.size > 0;
    view.root.position.set(building.x, 0, building.z);
    view.ring.visible = view.core.visible = false;
  });
  reserveViews[0].sync(actors[0]?.structure.evolution, phase !== 'lobby');
  runeView.visible = rune.available && (phase === 'playing' || phase === 'paused');
  runeView.position.y = 2.6 + Math.sin(rune.elapsed * 2) * .25;
  runeView.rotation.y = rune.elapsed * .6;
  renderer.fitCombat([...actors.filter(alive), ...buildings.filter(building => building.structure.pieces.size > 0)]);
  // Packed groups use the same offsets in flight and when splitting into loot.
  shots.forEach(s => { s.mesh.position.set(s.x, s.y, s.z); s.mesh.rotation.set(0, s.pieces.length > 1 ? 0 : simTime * 8, 0); });
  if (drops.length > droppedView.instanceMatrix.count) resizeDropView(2 ** Math.ceil(Math.log2(drops.length)));
  let matrixStart = drops.length, matrixEnd = -1, colorStart = drops.length, colorEnd = -1;
  drops.forEach((d, i) => {
    const offset = i * 4, changedPiece = renderedDrops[i] !== d;
    const moved = changedPiece || renderedDropTransforms[offset] !== d.x || renderedDropTransforms[offset + 1] !== d.y ||
      renderedDropTransforms[offset + 2] !== d.z || renderedDropTransforms[offset + 3] !== d.rotation;
    if (!moved) return;
    transform.position.set(d.x, d.y, d.z); transform.rotation.set(0, d.rotation, 0);
    const size = debrisRenderSize(d.piece);
    transform.scale.set(size.x, size.y, size.z);
    transform.updateMatrix(); droppedView.setMatrixAt(i, transform.matrix);
    matrixStart = Math.min(matrixStart, i); matrixEnd = i;
    if (changedPiece) {
      droppedView.setColorAt(i, dropColor.set(d.piece.color));
      colorStart = Math.min(colorStart, i); colorEnd = i;
    }
    renderedDrops[i] = d;
    renderedDropTransforms[offset] = d.x; renderedDropTransforms[offset + 1] = d.y;
    renderedDropTransforms[offset + 2] = d.z; renderedDropTransforms[offset + 3] = d.rotation;
  });
  renderedDrops.length = drops.length;
  droppedView.count = drops.length;
  if (matrixEnd >= matrixStart) {
    droppedView.instanceMatrix.clearUpdateRanges();
    droppedView.instanceMatrix.addUpdateRange(matrixStart * 16, (matrixEnd - matrixStart + 1) * 16);
    droppedView.instanceMatrix.needsUpdate = true;
  }
  if (droppedView.instanceColor && colorEnd >= colorStart) {
    droppedView.instanceColor.clearUpdateRanges();
    droppedView.instanceColor.addUpdateRange(colorStart * 3, (colorEnd - colorStart + 1) * 3);
    droppedView.instanceColor.needsUpdate = true;
  }
  if (phase !== 'paused') for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy -= dt * 25; p.x += p.vx * dt; p.y = Math.max(0.05, p.y + p.vy * dt); p.z += p.vz * dt;
  }
  particles.forEach((p, i) => { transform.position.set(p.x, p.y, p.z); transform.rotation.set(0, simTime, 0); transform.scale.setScalar(p.scale * p.life / p.max); transform.updateMatrix(); particleView.setMatrixAt(i, transform.matrix); particleView.setColorAt(i, p.color); });
  particleView.count = particles.length;
  if (particles.length) {
    particleView.instanceMatrix.clearUpdateRanges(); particleView.instanceMatrix.addUpdateRange(0, particles.length * 16);
    particleView.instanceMatrix.needsUpdate = true;
    if (particleView.instanceColor) {
      particleView.instanceColor.clearUpdateRanges(); particleView.instanceColor.addUpdateRange(0, particles.length * 3);
      particleView.instanceColor.needsUpdate = true;
    }
  }
  renderer.aim(aim.x, aim.z, phase === 'playing' && alive(actors[0]));
  renderer.frame(dt);
}
function updateUI() {
  const rival = actors.find(actor => actor.id !== 'player' && alive(actor));
  ui.update({ elapsed: stats.elapsed, playerPieces: actors[0]?.structure.pieces.size ?? 0, enemyPieces: rival?.structure.pieces.size ?? 0, repairs: stats.repairs, growth: stats.growth, shots: stats.shots, hits: stats.hits, muted: sound.muted, shotCount,
    round: round?.number ?? 1,
    playerCoreExposed: actors[0]?.structure.coreExposed ?? false,
    enemyCoreExposed: rival?.structure.coreExposed ?? false,
    playerCoreThreshold: actors[0] ? coreExposureThreshold(actors[0].structure) : 0,
    enemyCoreThreshold: rival ? coreExposureThreshold(rival.structure) : 0,
    dashCooldown: dash.cooldown, dashing: dash.remaining > 0,
    botStyle: rival?.bot?.style ?? 'balanced', botDifficulty: rival?.bot?.difficulty ?? 'easy', botPanic: rival?.panic ?? false,
    victoryCollected: victory?.collected ?? 0, victoryTotal: victory?.total ?? 0,
    evolution: actors[0] ? evolutionProgress(actors[0].structure) : null,
    enemyReserve: rival?.structure.evolution?.reserve.length ?? 0,
    fighters: actors.map(actor => ({ id: actor.id, name: actor.template.name, pieces: actor.structure.pieces.size,
      reserve: actor.structure.evolution?.reserve.length ?? 0, alive: alive(actor), exposed: actor.structure.coreExposed,
      style: actor.bot?.style ?? null })),
    aliveCount: actors.filter(alive).length, spectating: false, placement: playerPlacement,
  });
}

canvas.tabIndex = 0;
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('pointermove', e => {
  if (firePointerId === null || e.pointerId === firePointerId) pointerPosition = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 || firePointerId !== null || phase !== 'playing' || !alive(actors[0])) return;
  firePointerId = e.pointerId; firing = true; canvas.setPointerCapture(e.pointerId); sound.unlock();
  pointerPosition = { x: e.clientX, y: e.clientY };
  aim = pointerAim(e.clientX, e.clientY);
  fire(actors[0], aim.x, aim.z);
});
window.addEventListener('pointerup', e => stopFiring(e.pointerId));
window.addEventListener('pointercancel', e => stopFiring(e.pointerId));
canvas.addEventListener('lostpointercapture', e => stopFiring(e.pointerId));
window.addEventListener('keydown', e => {
  if (phase === 'lobby') return;
  if ((e.target as HTMLElement).matches('input,select,textarea')) return;
  if ((e.code === 'Space' || e.code === 'Enter') && (e.target as HTMLElement).closest('button,a,summary')) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space' && phase === 'playing') dashRequested = true;
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'KeyR') startRound();
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); stopFiring(); dashRequested = false; if (phase === 'playing' || phase === 'collecting') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && (phase === 'playing' || phase === 'collecting')) togglePause(); });
let previousTime = performance.now(), accumulator = 0, uiClock = 0;
function frame(now: number) {
  const dt = Math.min(0.1, Math.max(0, (now - previousTime) / 1000)); previousTime = now;
  accumulator += dt;
  while (accumulator >= 1 / 60) { tick(1 / 60); accumulator -= 1 / 60; }
  draw(dt);
  uiClock += dt;
  if (uiClock > 0.15) { updateUI(); uiClock = 0; }
  requestAnimationFrame(frame);
}

// Readable diagnostics for prototype QA; contains no remote calls or player data.
Object.defineProperty(window, '__arenaSnapshot', { get: () => ({
  phase, round: round?.number, elapsed: stats.elapsed, shotCount, rune: { ...rune },
  player: actors[0] && { x: actors[0].x, z: actors[0].z, alive: alive(actors[0]), pieces: actors[0].structure.pieces.size,
    vacancies: actors[0].structure.vacancies.length, evolution: evolutionProgress(actors[0].structure) },
  enemy: actors[1] && { x: actors[1].x, z: actors[1].z, pieces: actors[1].structure.pieces.size,
    reserve: actors[1].structure.evolution?.reserve.length ?? 0 },
  fighters: actors.map(actor => ({ id: actor.id, name: actor.template.name, x: actor.x, z: actor.z, radius: actor.radius,
    round: round?.number, teamId: battleTeamId(round?.number ?? 1, actor.id), role: actor.squadRole,
    desiredShotCount: actor.desiredShotCount, lastShotCount: actor.lastShotCount, shotCount: actor.lastShotCount,
    shotsFired: actor.shotsFired, dashStarts: actor.dashStarts, dash: { ...(actor.id === 'player' ? dash : actor.dash!) },
    alive: alive(actor), pieces: actor.structure.pieces.size, reserve: actor.structure.evolution?.reserve.length ?? 0,
    coreExposed: actor.structure.coreExposed, style: actor.bot?.style, difficulty: actor.bot?.difficulty, intent: actor.bot?.battle?.intent,
    targetId: actor.bot?.battle?.targetId, cooldown: actor.cooldown })),
  aliveCount: actors.filter(alive).length, placement: playerPlacement,
  winner: round && battleWinner(round)?.id, outcome: round && playerBattleOutcome(round),
  buildings: buildings.map(building => ({ id: building.id, template: building.template, x: building.x, z: building.z,
    pieces: building.structure.pieces.size, revision: building.structure.revision })),
  mass: actors.reduce((n, actor) => n + actor.structure.pieces.size + (actor.structure.evolution?.reserve.length ?? 0), 0)
    + buildings.reduce((n, building) => n + building.structure.pieces.size, 0) + drops.length + shots.reduce((n, shot) => n + shot.pieces.length, 0),
  drops: drops.length, projectiles: shots.length, events: [...combatEvents],
  input: { touchMovement: { ...touchMovement }, firing }, stats: { ...stats }, drawCalls: renderer.renderer.info.render.calls,
}) });
showPreview();
requestAnimationFrame(frame);
