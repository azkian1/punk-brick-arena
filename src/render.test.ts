import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHARACTER_TEMPLATES } from './assets/templates';
import { createStructure } from './game/structure';
import { evolutionPlan } from './game/evolution';
import { CharacterView, createArenaDots, createPieceProjectile, createRuneCube, disposePieceProjectile } from './render';
import { projectilePartOffsets } from './game/projectiles';

it('renders a real twenty-part volley as one group with each original size and color', () => {
  const pieces = CHARACTER_TEMPLATES[0].pieces.slice(0, 20), offsets = projectilePartOffsets(pieces);
  const scene = new THREE.Scene(), group = createPieceProjectile(pieces);
  expect(group.children).toHaveLength(20);
  group.children.forEach((child, i) => {
    expect(child.position.toArray()).toEqual([offsets[i].x, offsets[i].y, offsets[i].z]);
    const body = child.children[0] as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
    expect(body.material.color.getHexString()).toBe(new THREE.Color(pieces[i].color).getHexString());
    expect(body.scale.toArray()).toEqual([pieces[i].size.x, pieces[i].size.y, pieces[i].size.z]);
  });
  scene.add(group); disposePieceProjectile(scene, group); expect(scene.children).not.toContain(group);
});

it('makes the center rune a metallic cube assembled from 27 bricks', () => {
  const rune = createRuneCube(); expect(rune.children).toHaveLength(27);
  for (const cube of rune.children as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[]) {
    expect(cube.material.metalness).toBeGreaterThan(.8);
    expect(cube.position.toArray().every(n => Math.abs(n) <= .93)).toBe(true);
  }
  disposePieceProjectile(new THREE.Scene(), rune);
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
