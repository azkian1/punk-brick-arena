import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { CHARACTER_TEMPLATES } from '../assets/templates';
import { CONFIG } from './config';
import { createStructure, damageStructure, getBounds } from './structure';
import { firstBattleImpact } from './battle-combat';
import { areBattleAllies } from './bot-squad';
import { pickupRadiusForBounds, canCollectDrop, type PickupState } from './pickup';
import { createPartProjectile, stepPartProjectile, projectilePartOffsets, SHOT_PICKUP_LOCK, type PartProjectile } from './projectiles';
import { segmentBuildingHit } from './arena';
import { debrisFloorY } from './debris';
import { debrisRadius, findNearbyDebrisPosition, clampDebrisToArena, stepDebrisPhysics, type MovingDebris } from './debris-motion';
import type { Piece } from './types';
import { legacyEdgeBuildings } from './test-fixtures/legacy-arena';

// Execute the real main functions with rendering/audio stubbed; catches integration
// regressions that a second copy of the mechanics would conceal.
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
function section(from: string, to: string) { return main.slice(main.indexOf(from), main.indexOf(to)); }
function runtime<T>(code: string, environment: Record<string, unknown>, expression: string): T {
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(environment), `${compiled};return ${expression};`)(...Object.values(environment)) as T;
}
const brick: Piece = { id: 'ammo', position: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1.2, z: 1 }, color: '#aabbcc', shape: 'brick' };

describe('main combat/debris regression', () => {
  it('refreshes the actual hit radius before the second projectile in the same combat frame', () => {
    const structure = createStructure({ ...CHARACTER_TEMPLATES[0], coreId: 'core', pieces: [
      { ...brick, id: 'core' }, { ...brick, id: 'bridge', position: { x: 1, y: 0, z: 0 } },
      { ...brick, id: 'body', position: { x: 2, y: 0, z: 0 }, size: { x: 40, y: 1.2, z: 30 } },
    ] });
    const victim = { id: 'bot-1', x: 0, z: 0, radius: 0, pickupRadius: 0, structure, boundsRevision: -1,
      bounds: getBounds(structure), view: { ring: { scale: { setScalar() {} } } }, hurt: 0 };
    const removed: Piece[] = [];
    const functions = runtime<{ hit: (shot: unknown, target: typeof victim) => void; updateBounds: (target: typeof victim) => void }>(
      section('function hit(shot:', 'function hitBuilding(') + section('function updateBounds(', 'function bot('), {
        round: { number: 1 }, areBattleAllies, recordImpact() {},
        damageStructure: (target: typeof structure, count: number) => damageStructure(target, count, () => 0),
        knockOff: (_target: unknown, parts: Piece[]) => removed.push(...parts), burst() {},
        renderer: { kick() {} }, sound: { play() {} }, stats: { hits: 0, direct: 0, cascade: 0 },
        toastDelay: 0, ui: { toast() {} }, eliminate() {}, getBounds, pickupRadiusForBounds, CONFIG,
      }, '{hit,updateBounds}');
    functions.updateBounds(victim);
    expect(victim.radius).toBeCloseTo(9.24); expect(structure.coreExposed).toBe(false);
    functions.hit({ ...createPartProjectile(brick, 'player', -20, 0, 20, 0), owner: { id: 'player' } }, victim);
    expect([...structure.pieces.keys()]).toEqual(['core']); expect(structure.coreExposed).toBe(true);
    expect(victim.radius).toBe(2.2); expect(victim.boundsRevision).toBe(structure.revision);
    const pending = createPartProjectile(brick, 'bot-3', -20, 6, 20, 6);
    expect(firstBattleImpact(pending, 20, 6, [victim], [])).toBeNull();
    expect(removed.map(piece => piece.id)).toEqual(['bridge', 'body']);
    expect(removed.length + structure.pieces.size).toBe(3);
  });

  it('preserves a safe seed16 edge landing, every real part, and the five-second firing lock through main drop physics', () => {
    const buildings = legacyEdgeBuildings();
    const piece: Piece = { ...brick, id: 'edge/real', size: { x: 1, y: .4, z: 1 }, shape: 'plate' };
    const shot = createPartProjectile(piece, 'player', 75, 6, 100, -16.06);
    const clear = (x: number, z: number, radius: number) => buildings.every(building => segmentBuildingHit(x, z, x, z, building, radius) === null);
    expect(clear(75, 6, 2.2)).toBe(true);
    let sample = 0;
    for (let frame = 0; frame < 600 && !shot.settled; frame++) {
      if (shot.mode === 'shot') expect(firstBattleImpact(shot, shot.x + shot.vx / 60, shot.z + shot.vz / 60, [], buildings)).toBeNull();
      stepPartProjectile(shot, 1 / 60, () => sample++ % 2 ? 1 : 0, clear);
    }
    expect(shot.settled).toBe(true); expect(shot.x).toBeGreaterThan(79);
    const makeDrops = runtime<(shot: PartProjectile) => (MovingDebris & PickupState & { skipAgeOnce?: boolean })[]>(
      section('function projectileDrops(', 'function eliminate('), {
        buildings, projectilePartOffsets, clampDebrisToArena, findNearbyDebrisPosition, debrisRadius, debrisFloorY, SHOT_PICKUP_LOCK,
      }, 'projectileDrops');
    const drops = makeDrops(shot), originalX = drops[0].x, originalZ = drops[0].z;
    const update = runtime<(dt: number, collect: boolean) => void>(section('function updateDrops(', 'function tick('),
      { drops, buildings, stepDebrisPhysics }, 'updateDrops');
    update(1 / 60, false);
    expect(drops).toHaveLength(1); expect(drops[0].piece).toBe(piece);
    expect(drops[0].x).toBe(originalX); expect(drops[0].z).toBe(originalZ);
    expect(clear(drops[0].x, drops[0].z, debrisRadius(piece))).toBe(true);
    expect(drops[0].age).toBe(shot.age); expect(drops[0].lockedUntilAge).toBe(5);
    expect(canCollectDrop(drops[0], 'bot-1')).toBe(false);
    update(1 / 60, false); expect(drops[0].age).toBeCloseTo(shot.age + 1 / 60);
    drops[0].age = 5; drops[0].settled = true;
    expect(canCollectDrop(drops[0], 'bot-1')).toBe(true);
  });
});
