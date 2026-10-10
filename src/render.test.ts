import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHARACTER_TEMPLATES } from './assets/templates';
import { createStructure } from './game/structure';
import { evolutionPlan } from './game/evolution';
import { CharacterView, createArenaDots, createPieceProjectile, createRuneCube, disposePieceProjectile } from './render';
import { projectilePartOffsets } from './game/projectiles';
import { CONFIG } from './game/config';
import type { Piece } from './game/types';

const projectilePieces = (count: number): Piece[] => Array.from({ length: count }, (_, i) => ({
  ...CHARACTER_TEMPLATES[0].pieces[0], id: `volley/${i}`, position: { x: 14, y: 7, z: -3 },
  size: [{ x: 2, y: 1.2, z: 2 }, { x: 1, y: .4, z: 1 }, { x: 2, y: .4, z: 1 }, { x: 1, y: 1.2, z: 2 }][i % 4],
  color: ['#cc3311', '#12aabb', '#1122dd', '#ffffff'][i % 4],
  shape: (['brick', 'brick', 'tile', 'slope'] as const)[i % 4],
}));
const expectVector = (actual: THREE.Vector3, expected: number[]) => actual.toArray().forEach((value, i) => expect(value).toBeCloseTo(expected[i], 5));
const expectColor = (mesh: THREE.InstancedMesh, index: number, expected: string) => {
  const actual = new THREE.Color(); mesh.getColorAt(index, actual);
  const color = new THREE.Color(expected);
  for (const key of ['r', 'g', 'b'] as const) expect(actual[key]).toBeCloseTo(color[key], 6);
};

it.each([1, 3, 20])('renders a %i-part volley in at most two batches with exact packed sizes, colors and studs', count => {
  const pieces = projectilePieces(count), offsets = projectilePartOffsets(pieces), scale = CONFIG.characterScale;
  const group = createPieceProjectile(count === 1 ? pieces[0] : pieces);
  const body = group.getObjectByName('projectile-body') as THREE.InstancedMesh;
  const studs = group.getObjectByName('projectile-studs') as THREE.InstancedMesh;
  expect(group.children.length).toBeLessThanOrEqual(2);
  expect(group.children.every(child => child instanceof THREE.InstancedMesh)).toBe(true);
  expect(body.count).toBe(count); expect(body.material).toBe(studs.material);
  expect(body.castShadow && studs.castShadow).toBe(true);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), size = new THREE.Vector3(), rotation = new THREE.Quaternion();
  let studIndex = 0;
  pieces.forEach((piece, i) => {
    body.getMatrixAt(i, matrix); matrix.decompose(position, rotation, size);
    expectVector(position, [offsets[i].x, offsets[i].y, offsets[i].z]);
    expectVector(size, [piece.size.x * scale, piece.size.y * scale, piece.size.z * scale]);
    expect(rotation.toArray()).toEqual([0, 0, 0, 1]); expectColor(body, i, piece.color);
    if (piece.shape === 'tile' || piece.shape === 'slope') return;
    for (let x = 0; x < Math.floor(piece.size.x); x++) for (let z = 0; z < Math.floor(piece.size.z); z++) {
      studs.getMatrixAt(studIndex, matrix); matrix.decompose(position, rotation, size);
      expectVector(position, [offsets[i].x + (x + .5 - piece.size.x / 2) * scale,
        offsets[i].y + (piece.size.y / 2 + .07) * scale, offsets[i].z + (z + .5 - piece.size.z / 2) * scale]);
      expectVector(size, [scale, scale, scale]); expectColor(studs, studIndex++, piece.color);
    }
  });
  expect(studs.count).toBe(studIndex);
  expect(body.instanceMatrix.version).toBeGreaterThan(0); expect(body.instanceColor!.version).toBeGreaterThan(0);
  disposePieceProjectile(new THREE.Scene(), group);
});

it('does not add studs to an all-tile/slope volley and preserves a single part under the flight rotation', () => {
  const pieces = projectilePieces(4).slice(2), group = createPieceProjectile(pieces);
  expect(group.children).toHaveLength(1);
  expect((group.children[0] as THREE.InstancedMesh).count).toBe(2);
  const single = createPieceProjectile(projectilePieces(1)[0]);
  single.position.set(8, 3.2, -6); single.rotation.y = .7; single.updateMatrixWorld(true);
  const body = single.getObjectByName('projectile-body') as THREE.InstancedMesh, matrix = new THREE.Matrix4();
  body.getMatrixAt(0, matrix); matrix.premultiply(body.matrixWorld);
  const expected = new THREE.Matrix4().compose(single.position, single.quaternion,
    new THREE.Vector3(2, 1.2, 2).multiplyScalar(CONFIG.characterScale));
  matrix.elements.forEach((value, i) => expect(value).toBeCloseTo(expected.elements[i], 5));
  disposePieceProjectile(new THREE.Scene(), group); disposePieceProjectile(new THREE.Scene(), single);
});

it('releases per-volley instance buffers while keeping shared geometry/material and other active volleys alive', () => {
  const scene = new THREE.Scene(), first = createPieceProjectile(projectilePieces(20)), other = createPieceProjectile(projectilePieces(3));
  scene.add(first, other);
  const meshes = first.children as THREE.InstancedMesh[], second = other.children[0] as THREE.InstancedMesh;
  const disposed = meshes.map(() => 0); let geometryDisposes = 0, materialDisposes = 0;
  const onGeometry = () => geometryDisposes++, onMaterial = () => materialDisposes++;
  meshes.forEach((mesh, i) => { mesh.addEventListener('dispose', () => disposed[i]++); mesh.geometry.addEventListener('dispose', onGeometry); });
  const material = meshes[0].material as THREE.Material; material.addEventListener('dispose', onMaterial);
  expect(meshes.every(mesh => mesh.material === second.material)).toBe(true);
  const retainedMatrix = [...second.instanceMatrix.array], retainedColors = [...second.instanceColor!.array];
  disposePieceProjectile(scene, first);
  expect(scene.children).not.toContain(first); expect(scene.children).toContain(other);
  expect(disposed).toEqual([1, 1]); expect(geometryDisposes).toBe(0); expect(materialDisposes).toBe(0);
  expect([...second.instanceMatrix.array]).toEqual(retainedMatrix); expect([...second.instanceColor!.array]).toEqual(retainedColors);
  meshes.forEach(mesh => mesh.geometry.removeEventListener('dispose', onGeometry)); material.removeEventListener('dispose', onMaterial);
  disposePieceProjectile(scene, other);
});

it('makes the center rune a metallic cube assembled from 27 bricks', () => {
  const rune = createRuneCube(); expect(rune.children).toHaveLength(27);
  for (const cube of rune.children as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[]) {
    expect(cube.material.metalness).toBeGreaterThan(.8);
    expect(cube.position.toArray().every(n => Math.abs(n) <= .93)).toBe(true);
  }
  let disposed = 0; const material = (rune.children[0] as THREE.Mesh).material as THREE.Material;
  material.addEventListener('dispose', () => disposed++);
  disposePieceProjectile(new THREE.Scene(), rune); expect(disposed).toBe(1);
});

it('keeps every marker of the enlarged arena inside its GPU instance buffer', () => {
  const dots = createArenaDots(), matrix = new THREE.Matrix4();
  expect(dots.count).toBe(6241);
  expect(dots.count).toBeLessThanOrEqual(dots.instanceMatrix.count);
  dots.getMatrixAt(dots.count - 1, matrix);
  expect(matrix.elements.every(Number.isFinite)).toBe(true);
  expect(matrix.determinant()).toBeCloseTo(1);
  expect(new THREE.Vector3().setFromMatrixPosition(matrix).toArray()).toEqual([78, expect.closeTo(0.015, 6), 78]);
  expect(dots.instanceMatrix.version).toBeGreaterThan(0);
  dots.dispose(); dots.geometry.dispose(); (dots.material as THREE.Material).dispose();
});

function compareRaycast(view: CharacterView, raycaster: THREE.Raycaster) {
  const accelerated: THREE.Intersection[] = [], original: THREE.Intersection[] = [];
  view.body.raycast(raycaster, accelerated);
  THREE.InstancedMesh.prototype.raycast.call(view.body, raycaster, original);
  const summarize = (hits: THREE.Intersection[]) => hits.map(hit => ({ id: hit.instanceId, distance: hit.distance })).sort((a, b) => a.distance - b.distance || a.id! - b.id!);
  expect(summarize(accelerated)).toEqual(summarize(original));
}

describe('character picking', () => {
  it('matches exact Three.js triangle intersections through every base silhouette', () => {
    const scene = new THREE.Scene();
    for (const template of CHARACTER_TEMPLATES) {
      const view = new CharacterView(scene, '#ffffff');
      view.sync(createStructure(template));
      view.root.position.set(3, .2, -2); view.root.rotation.y = .31;
      scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(view.root);
      for (let x = 0; x < 9; x++) for (let y = 0; y < 9; y++) {
        const origin = new THREE.Vector3(THREE.MathUtils.lerp(bounds.min.x - 1, bounds.max.x + 1, x / 8), THREE.MathUtils.lerp(bounds.min.y - 1, bounds.max.y + 1, y / 8), bounds.max.z + 20);
        compareRaycast(view, new THREE.Raycaster(origin, new THREE.Vector3(0, 0, -1)));
      }
      view.dispose(scene);
    }
  });

  it('preserves gaps, inside origins, clipping, and picking after a buffer grows', () => {
    const scene = new THREE.Scene(), view = new CharacterView(scene, '#ffffff');
    const template = CHARACTER_TEMPLATES[0];
    const pieces = Array.from({ length: 700 }, (_, i) => ({ ...template.pieces[0], id: `piece-${i}`, position: { x: i * 2, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }));
    view.sync(createStructure({ ...template, pieces, coreId: pieces[0].id }));
    scene.updateMatrixWorld(true);
    for (const [x, z, near, far] of [[.25, 10, 0, 100], [.75, 10, 0, 100], [.25, .25, 0, 100], [.25, 10, 0, 1], [.25, 10, 20, 100]]) {
      compareRaycast(view, new THREE.Raycaster(new THREE.Vector3(x, .25, z), new THREE.Vector3(0, 0, -1), near, far));
    }
    expect(view.body.instanceMatrix.count).toBeGreaterThan(512);
    view.dispose(scene);
  });

  it('keeps detailed picking after syncing a complete final body and subsequent damage', () => {
    const scene = new THREE.Scene(), view = new CharacterView(scene, '#ffffff');
    const template = CHARACTER_TEMPLATES[0], plan = evolutionPlan(template, 'mosher', 3);
    const pieces = plan.slots.map((piece, i) => ({ ...piece, id: `full-${i}` }));
    const structure = createStructure({ ...template, pieces, coreId: pieces[0].id });
    for (let pass = 0; pass < 2; pass++) {
      view.sync(structure); view.root.rotation.y = -.23; scene.updateMatrixWorld(true);
      for (let x = -12; x <= 12; x += 3) for (let y = 2; y <= 34; y += 4) {
        compareRaycast(view, new THREE.Raycaster(new THREE.Vector3(x, y, 60), new THREE.Vector3(0, 0, -1)));
      }
      for (const piece of [...structure.pieces.values()].slice(200, 500)) structure.pieces.delete(piece.id);
      structure.revision++;
    }
    view.dispose(scene);
  });
});
