import * as THREE from 'three';
import { CHARACTER_TEMPLATES } from './assets/templates';
import { createStructure, damageStructure, getBounds, coreExposureThreshold } from './game/structure';
import { newRound, nextRound, type RoundState } from './game/rounds';
import { CONFIG } from './game/config';
import { segmentCircleHit } from './game/collision';
import { collectNearbyDrops, pickupRadiusForBounds, type PickupState } from './game/pickup';
import { createDash, startDash, movePlayer, moveBody, clampToArena } from './game/movement';
import { BOT_LABELS, BOT_DIFFICULTIES, createBot, thinkBot } from './game/bots';
import { createVictoryCollection, stepVictoryCollection, type VictoryCollection } from './game/victory';
import type { CharacterTemplate, Piece, Structure } from './game/types';
import { ArenaRenderer, CharacterView, createProjectile } from './render';
import { GameUI } from './ui';
import { Sound } from './sound';
import './style.css';

type Phase = 'lobby' | 'playing' | 'collecting' | 'paused' | 'result';
interface Actor {
  id: 'player' | 'enemy'; template: CharacterTemplate; structure: Structure;
  view: CharacterView; x: number; z: number; vx: number; vz: number;
  cooldown: number; pickupRadius: number; hurt: number; radius: number; boundsRevision: number;
}
interface Shot { owner: Actor; x: number; z: number; vx: number; vz: number; life: number; mesh: THREE.Group }
interface Drop extends PickupState { piece: Piece; x: number; y: number; z: number; vx: number; vy: number; vz: number; rotation: number }
interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; color: THREE.Color; scale: number }
interface Stats { elapsed: number; repairs: number; growth: number; shots: number; hits: number; direct: number; cascade: number }

const root = document.querySelector<HTMLElement>('#app')!;
const canvas = document.querySelector<HTMLCanvasElement>('#arena')!;
let renderer: ArenaRenderer;
try { renderer = new ArenaRenderer(canvas); }
catch {
  root.innerHTML = '<section style="padding:10vw;font-family:Arial;background:#f2f5f7;height:100vh"><h1>The 3D arena could not start</h1><p>This game needs WebGL. Try enabling hardware acceleration or opening the game in another browser.</p><button onclick="location.reload()">Try Again</button></section>';
  throw new Error('WebGL renderer unavailable');
}
const sound = new Sound();
let phase: Phase = 'lobby';
let round: RoundState | null = null;
let selected = CHARACTER_TEMPLATES[0].id;
let damage: number = CONFIG.projectilePower;
let actors: Actor[] = [];
let shots: Shot[] = [];
let drops: Drop[] = [];
let particles: Particle[] = [];
let stats = emptyStats();
let simTime = 0;
let botState = createBot('aggressor');
let botPanic = false;
let dash = createDash();
let dashRequested = false;
let victory: VictoryCollection<Drop> | null = null;
let resumePhase: 'playing' | 'collecting' = 'playing';
let toastDelay = 0;
let firing = false;
let aim = new THREE.Vector3(18, 0, 0);
let pointerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
const keys = new Set<string>();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const transform = new THREE.Object3D();
const maxDrops = CONFIG.maxPieces * 2 + 64;
const droppedView = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.7 }), maxDrops);
droppedView.castShadow = true;
droppedView.frustumCulled = false;
droppedView.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
renderer.scene.add(droppedView);
const particleView = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 500);
particleView.frustumCulled = false;
renderer.scene.add(particleView);
const ui = new GameUI(root, CHARACTER_TEMPLATES, {
  onStart: (id) => { selected = id; startRound(); },
  onRestart: () => startRound(),
  onNextRound: () => {
    if (phase === 'result' && round && round.player.pieces.has(round.player.coreId) && !round.enemy.pieces.has(round.enemy.coreId)) {
      beginRound(nextRound(CHARACTER_TEMPLATES, round));
    }
  },
  onLobby: () => showPreview(),
  onPause: () => togglePause(),
  onMute: () => toggleMute(),
  onSelect: (id) => { selected = id; if (phase === 'lobby') showPreview(); },
  onDamageChange: (value) => { damage = Math.max(1, Math.min(20, Math.round(value))); updateUI(); },
});

function emptyStats(): Stats { return { elapsed: 0, repairs: 0, growth: 0, shots: 0, hits: 0, direct: 0, cascade: 0 }; }
function createActor(id: Actor['id'], template: CharacterTemplate, x: number, z: number, structure = createStructure(template)): Actor {
  const view = new CharacterView(renderer.scene, id === 'player' ? '#7c3aed' : '#638596');
  view.sync(structure);
  return { id, template, structure, view, x, z, vx: 0, vz: 0, cooldown: 0, pickupRadius: CONFIG.pickupRadius, hurt: 0, radius: 3.3, boundsRevision: -1 };
}
function clearRound() {
  actors.forEach(a => a.view.dispose(renderer.scene));
  shots.forEach(s => renderer.scene.remove(s.mesh));
  actors = []; shots = []; drops = []; particles = [];
  keys.clear(); firing = false; dashRequested = false;
  dash = createDash(); victory = null; botPanic = false;
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
  beginRound(newRound(CHARACTER_TEMPLATES, selected));
}
function beginRound(state: RoundState) {
  sound.unlock();
  clearRound();
  round = state;
  const spawnX = CONFIG.arenaWidth * 0.31;
  actors = [createActor('player', state.playerTemplate, -spawnX, 0, state.player), createActor('enemy', state.enemyTemplate, spawnX, 0, state.enemy)];
  stats = emptyStats(); simTime = 0; toastDelay = 0;
  phase = 'playing';
  resumePhase = 'playing';
  botState = createBot(state.enemyBehavior, Math.random, state.enemyDifficulty);
  seedDrops(24, 0);
  ui.setScreen('playing');
  renderer.setPreviewMode(false);
  ui.toast(`Round ${state.number} · ${BOT_LABELS[state.enemyBehavior].name} · ${BOT_DIFFICULTIES[state.enemyDifficulty].name}`, 'repair');
  updateUI();
  canvas.focus();
}
function seedDrops(count: number, offset: number) {
  const source = actors[0].template.pieces.filter(p => p.size.x <= 2 && p.size.z <= 2 && p.size.y <= 1.21);
  for (let i = 0; i < count; i++) {
    const p = source[i % source.length];
    if (!p) continue;
    const angle = i * 2.399, radius = 5 + (i % 5) * 1.4;
    drops.push({ ownerId: null, piece: { ...p, id: `round-${round?.number ?? 0}/loose-${i}`, position: { ...p.position }, size: { ...p.size } }, x: Math.cos(angle) * radius + offset, z: Math.sin(angle) * radius, y: p.size.y * CONFIG.characterScale / 2 + 0.06, vx: 0, vy: 0, vz: 0, age: 2, settled: true, rotation: Math.random() * Math.PI });
  }
}
function togglePause() {
  if (phase !== 'playing' && phase !== 'collecting' && phase !== 'paused') return;
  if (phase === 'paused') phase = resumePhase;
  else { resumePhase = phase; phase = 'paused'; }
  firing = false; dashRequested = false; keys.clear(); ui.setScreen(phase);
  if (phase !== 'paused') { sound.unlock(); canvas.focus(); }
}
function toggleMute() { sound.muted = !sound.muted; ui.setMuted(sound.muted); updateUI(); }
function finish(won: boolean) {
  if (phase !== 'playing') return;
  firing = false; dashRequested = false; keys.clear();
  shots.forEach(shot => renderer.scene.remove(shot.mesh)); shots = [];
  actors.forEach(actor => { actor.vx = 0; actor.vz = 0; });
  dash.remaining = 0;
  sound.play(won ? 'win' : 'lose');
  const defeated = actors[won ? 1 : 0];
  burst(defeated.x, 3, defeated.z, 50, '#ed7c47');
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
    victoryCollected: victory?.collected ?? 0, victorySkipped: victory?.skipped ?? 0 });
}
function fire(actor: Actor, tx: number, tz: number, interval: number = CONFIG.shotInterval) {
  if (actor.cooldown > 0) return;
  let dx = tx - actor.x, dz = tz - actor.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.1) return;
  dx /= length; dz /= length;
  actor.cooldown = interval;
  const mesh = createProjectile(actor.id);
  const x = actor.x + dx * (actor.radius + CONFIG.projectileSize / 2), z = actor.z + dz * (actor.radius + CONFIG.projectileSize / 2);
  mesh.position.set(x, 3.2, z);
  renderer.scene.add(mesh);
  shots.push({ owner: actor, x, z, vx: dx * CONFIG.projectileSpeed, vz: dz * CONFIG.projectileSpeed, life: 1.8, mesh });
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
    if (drops.length >= maxDrops) break;
    const local = new THREE.Vector3(piece.position.x + piece.size.x / 2, piece.position.y + piece.size.y / 2, piece.position.z + piece.size.z / 2);
    local.multiplyScalar(CONFIG.characterScale).applyAxisAngle(new THREE.Vector3(0, 1, 0), target.view.root.rotation.y);
    const angle = Math.random() * Math.PI * 2, speed = 11 + Math.random() * 10;
    drops.push({ ownerId: target.id, piece, x: target.x + local.x, y: Math.max(0.5, local.y), z: target.z + local.z, vx: Math.cos(angle) * speed, vy: 4 + Math.random() * 7, vz: Math.sin(angle) * speed, age: 0, settled: false, rotation: Math.random() * Math.PI });
  }
}
function hit(shot: Shot, target: Actor) {
  const wasExposed = target.structure.coreExposed;
  const result = damageStructure(target.structure, damage);
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
  if (result.eliminated) finish(target.id === 'enemy');
}
function updateBounds(a: Actor) {
  if (a.boundsRevision === a.structure.revision) return;
  const b = getBounds(a.structure);
  a.pickupRadius = pickupRadiusForBounds(b);
  a.radius = Math.min(Math.min(CONFIG.arenaWidth, CONFIG.arenaDepth) / 2 - 2,
    Math.max(2.2, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * CONFIG.characterScale * 0.44));
  a.view.ring.scale.setScalar(a.radius / 3.9);
  a.boundsRevision = a.structure.revision;
}
function bot(dt: number) {
  const player = actors[0], enemy = actors[1];
  const action = thinkBot(botState, enemy, player, drops,
    shots.map(shot => ({ ...shot, ownerId: shot.owner.id })), dt, simTime);
  moveBody(enemy, action.x, action.z, action.speed, dt);
  if (action.panic && !botPanic) enemy.cooldown = Math.min(enemy.cooldown, action.shotInterval);
  botPanic = action.panic;
  if (action.fire) fire(enemy, action.aimX, action.aimZ, action.shotInterval);
}
function updateDrops(dt: number, collect: boolean) {
  const damping = Math.exp(-dt * 3.4);
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; d.age += dt;
    if (!d.settled) {
      d.vy -= 25 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.vx *= damping; d.vz *= damping; d.rotation += dt * d.vx * 0.4;
      const floor = d.piece.size.y * CONFIG.characterScale / 2 + 0.04;
      if (d.y <= floor) { d.y = floor; if (Math.abs(d.vy) > 2.2) d.vy = -d.vy * 0.23; else { d.settled = true; d.vy = 0; } }
      d.x = THREE.MathUtils.clamp(d.x, -CONFIG.arenaWidth / 2 + 2, CONFIG.arenaWidth / 2 - 2);
      d.z = THREE.MathUtils.clamp(d.z, -CONFIG.arenaDepth / 2 + 2, CONFIG.arenaDepth / 2 - 2);
    }
  }
  if (!collect) return;
  const results = collectNearbyDrops(drops, actors);
  let repairs = 0, growth = 0;
  for (const { drop, collector, attachment } of results) {
    burst(drop.x, 0.5, drop.z, 2, collector.id === 'player' ? '#ed9963' : '#61a68b');
    if (collector.id !== 'player') continue;
    if (attachment.mode === 'repair') repairs++;
    else growth++;
  }
  if (repairs + growth > 0) {
    stats.repairs += repairs; stats.growth += growth;
    sound.play('pickup');
    if (toastDelay <= 0) {
      ui.toast(`Collected ${repairs + growth} · ${repairs} repaired · ${growth} added`, growth > 0 ? 'growth' : 'repair');
      toastDelay = 1.2;
    }
  }
}
function tick(dt: number) {
  if (phase === 'paused') return;
  simTime += dt;
  if (phase === 'collecting' && victory) {
    const player = actors[0];
    const collected = stepVictoryCollection(victory, drops, player, dt);
    for (const { attachment } of collected.attachments) {
      if (attachment.mode === 'repair') stats.repairs++;
      else stats.growth++;
    }
    if (collected.attachments.length) {
      sound.play('pickup', 0.6);
      if (!reducedMotion.matches) burst(player.x, 2.5, player.z, 2, '#7c3aed');
    }
    player.hurt = Math.max(0, player.hurt - dt);
    updateBounds(player); clampToArena(player);
    if (collected.done) showResult(true);
    return;
  }
  if (phase !== 'playing') { if (phase === 'result') updateDrops(dt, false); return; }
  stats.elapsed += dt; toastDelay -= dt;
  for (const a of actors) { a.cooldown -= dt; a.hurt = Math.max(0, a.hurt - dt); updateBounds(a); }
  const p = actors[0];
  aim = renderer.pointer(pointerPosition.x, pointerPosition.y, { mesh: actors[1].view.body, x: actors[1].x, z: actors[1].z });
  const mx = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const mz = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
  if (dashRequested) { startDash(dash, mx, mz, aim.x - p.x, aim.z - p.z); dashRequested = false; }
  const dashing = dash.remaining > 0;
  movePlayer(p, dash, mx, mz, dt);
  if (dashing && !reducedMotion.matches) burst(p.x, 0.6, p.z, 2, '#7c3aed');
  if (firing) fire(p, aim.x, aim.z);
  bot(dt);
  const e = actors[1], dx = e.x - p.x, dz = e.z - p.z, distance = Math.hypot(dx, dz), separation = (e.radius + p.radius) * 0.8;
  if (distance < separation && distance > 0.001) { const overlap = (separation - distance) / 2; p.x -= dx / distance * overlap; p.z -= dz / distance * overlap; e.x += dx / distance * overlap; e.z += dz / distance * overlap; }
  for (const a of actors) clampToArena(a);
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i], bx = s.x + s.vx * dt, bz = s.z + s.vz * dt;
    const target = actors.find(a => a !== s.owner)!;
    const impact = segmentCircleHit(s.x, s.z, bx, bz, target.x, target.z, target.radius + CONFIG.projectileSize / 2);
    s.life -= dt;
    if (impact !== null) { s.x += (bx - s.x) * impact; s.z += (bz - s.z) * impact; hit(s, target); s.life = 0; }
    else { s.x = bx; s.z = bz; }
    if (Math.abs(s.x) > CONFIG.arenaWidth / 2 || Math.abs(s.z) > CONFIG.arenaDepth / 2) s.life = 0;
    if (s.life <= 0) { renderer.scene.remove(s.mesh); shots.splice(i, 1); }
    if (phase !== 'playing') break;
  }
  if (phase === 'playing') updateDrops(dt, true);
}
function draw(dt: number) {
  actors.forEach((a, index) => {
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
  shots.forEach(s => { s.mesh.position.set(s.x, 3.2, s.z); s.mesh.rotation.set(0.15, simTime * 8, 0.1); });
  drops.forEach((d, i) => {
    transform.position.set(d.x, d.y, d.z); transform.rotation.set(0, d.rotation, 0);
    transform.scale.set(Math.max(0.1, d.piece.size.x * CONFIG.characterScale - 0.015), Math.max(0.1, d.piece.size.y * CONFIG.characterScale - 0.015), Math.max(0.1, d.piece.size.z * CONFIG.characterScale - 0.015));
    transform.updateMatrix(); droppedView.setMatrixAt(i, transform.matrix); droppedView.setColorAt(i, new THREE.Color(d.piece.color));
  });
  droppedView.count = drops.length; droppedView.instanceMatrix.needsUpdate = true;
  if (droppedView.instanceColor) droppedView.instanceColor.needsUpdate = true;
  if (phase !== 'paused') for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy -= dt * 25; p.x += p.vx * dt; p.y = Math.max(0.05, p.y + p.vy * dt); p.z += p.vz * dt;
  }
  particles.forEach((p, i) => { transform.position.set(p.x, p.y, p.z); transform.rotation.set(0, simTime, 0); transform.scale.setScalar(p.scale * p.life / p.max); transform.updateMatrix(); particleView.setMatrixAt(i, transform.matrix); particleView.setColorAt(i, p.color); });
  particleView.count = particles.length; particleView.instanceMatrix.needsUpdate = true;
  if (particleView.instanceColor) particleView.instanceColor.needsUpdate = true;
  renderer.aim(aim.x, aim.z, phase === 'playing');
  renderer.frame(dt);
}
function updateUI() {
  ui.update({ elapsed: stats.elapsed, playerPieces: actors[0]?.structure.pieces.size ?? 0, enemyPieces: actors[1]?.structure.pieces.size ?? 0, repairs: stats.repairs, growth: stats.growth, shots: stats.shots, hits: stats.hits, muted: sound.muted, damage,
    round: round?.number ?? 1,
    playerCoreExposed: actors[0]?.structure.coreExposed ?? false,
    enemyCoreExposed: actors[1]?.structure.coreExposed ?? false,
    playerCoreThreshold: actors[0] ? coreExposureThreshold(actors[0].structure) : 0,
    enemyCoreThreshold: actors[1] ? coreExposureThreshold(actors[1].structure) : 0,
    dashCooldown: dash.cooldown, dashing: dash.remaining > 0,
    botStyle: round?.enemyBehavior ?? 'balanced', botDifficulty: round?.enemyDifficulty ?? 'easy', botPanic,
    victoryCollected: victory?.collected ?? 0, victoryTotal: victory?.total ?? 0,
  });
}

canvas.tabIndex = 0;
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('pointermove', e => { pointerPosition = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 || phase !== 'playing') return;
  firing = true; sound.unlock();
  pointerPosition = { x: e.clientX, y: e.clientY };
  aim = renderer.pointer(e.clientX, e.clientY, { mesh: actors[1].view.body, x: actors[1].x, z: actors[1].z });
  fire(actors[0], aim.x, aim.z);
});
window.addEventListener('pointerup', () => { firing = false; });
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
window.addEventListener('blur', () => { keys.clear(); firing = false; dashRequested = false; if (phase === 'playing' || phase === 'collecting') togglePause(); });
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
Object.defineProperty(window, '__arenaSnapshot', { get: () => ({ phase, elapsed: stats.elapsed, damage, player: actors[0] && { x: actors[0].x, z: actors[0].z, pieces: actors[0].structure.pieces.size, vacancies: actors[0].structure.vacancies.length }, enemy: actors[1] && { x: actors[1].x, z: actors[1].z, pieces: actors[1].structure.pieces.size }, drops: drops.length, projectiles: shots.length, stats: { ...stats }, drawCalls: renderer.renderer.info.render.calls }) });
showPreview();
requestAnimationFrame(frame);
