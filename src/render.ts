import * as THREE from 'three';
import type { EvolutionState, Piece, Structure, Vec3 } from './game/types';
import { CONFIG } from './game/config';
import { projectilePartOffsets } from './game/projectiles';

const box = new THREE.BoxGeometry(1, 1, 1);
const stud = new THREE.CylinderGeometry(0.29, 0.29, 0.16, 8);
const brickMaterial = new THREE.MeshStandardMaterial({ roughness: 0.68, metalness: 0.02 });
const pieceProjectileMaterial = new THREE.MeshStandardMaterial({ roughness: 0.68 });
const dummy = new THREE.Object3D();
const instanceColor = new THREE.Color();
const instanceMatrix = new THREE.Matrix4();
const pickInverse = new THREE.Matrix4();
const pickLocalMatrix = new THREE.Matrix4();
const pickRay = new THREE.Ray();
const pickBox = new THREE.Box3();
const pickSphere = new THREE.Sphere();
const pickMesh: THREE.Mesh = new THREE.Mesh(box, brickMaterial);
const pickIntersections: THREE.Intersection[] = [];

// Character bodies contain axis-aligned boxes in mesh space. Reject missed boxes
// before the exact Three.js triangle test, preserving gaps, sides and near/far limits.
function raycastBricks(this: THREE.InstancedMesh, raycaster: THREE.Raycaster, intersections: THREE.Intersection[]) {
  if (!this.boundingSphere) this.computeBoundingSphere();
  pickSphere.copy(this.boundingSphere!).applyMatrix4(this.matrixWorld);
  if (!raycaster.ray.intersectsSphere(pickSphere)) return;
  pickRay.copy(raycaster.ray).applyMatrix4(pickInverse.copy(this.matrixWorld).invert());
  const matrices = this.instanceMatrix.array;
  pickMesh.geometry = this.geometry;
  pickMesh.material = this.material;
  for (let i = 0; i < this.count; i++) {
    const offset = i * 16;
    const x = matrices[offset + 12], y = matrices[offset + 13], z = matrices[offset + 14];
    const sx = matrices[offset] / 2, sy = matrices[offset + 5] / 2, sz = matrices[offset + 10] / 2;
    pickBox.min.set(x - sx, y - sy, z - sz); pickBox.max.set(x + sx, y + sy, z + sz);
    if (!pickRay.intersectsBox(pickBox)) continue;
    pickLocalMatrix.fromArray(matrices, offset);
    pickMesh.matrixWorld.multiplyMatrices(this.matrixWorld, pickLocalMatrix);
    pickMesh.raycast(raycaster, pickIntersections);
    for (const intersection of pickIntersections) {
      intersection.instanceId = i; intersection.object = this; intersections.push(intersection);
    }
    pickIntersections.length = 0;
  }
}

function scaledTranslation(x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  return instanceMatrix.set(sx, 0, 0, x, 0, sy, 0, y, 0, 0, sz, z, 0, 0, 0, 1);
}

function updateInstances(mesh: THREE.InstancedMesh) {
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.clearUpdateRanges();
    mesh.instanceColor.addUpdateRange(0, mesh.count * 3);
    mesh.instanceColor.needsUpdate = true;
  }
}
const projectileBody = new THREE.BoxGeometry(1, 1.2, 1);
const projectileStud = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
const projectileMaterials = {
  player: new THREE.MeshStandardMaterial({ color: '#ed682d', roughness: 0.35, emissive: '#702307', emissiveIntensity: 0.3 }),
  enemy: new THREE.MeshStandardMaterial({ color: '#248d79', roughness: 0.35, emissive: '#063e33', emissiveIntensity: 0.3 }),
};

/** Readable, oversized 1×1 brick with one stud; geometry is shared between shots. */
export function createProjectile(owner: 'player' | 'enemy'): THREE.Group {
  const group = new THREE.Group();
  const material = projectileMaterials[owner];
  const body = new THREE.Mesh(projectileBody, material);
  const top = new THREE.Mesh(projectileStud, material);
  top.position.y = 0.7;
  body.castShadow = top.castShadow = true;
  group.add(body, top);
  group.scale.setScalar(CONFIG.projectileSize);
  return group;
}

/** A shot displays the consumed inventory piece, including its color and studs. */
export function createPieceProjectile(piece: Piece | Piece[]): THREE.Group {
  const group = new THREE.Group();
  const pieces = Array.isArray(piece) ? piece : [piece];
  if (!pieces.length) return group;
  const offsets = projectilePartOffsets(pieces), scale = CONFIG.characterScale;
  const studCount = pieces.reduce((count, part) => count + (part.shape === 'tile' || part.shape === 'slope'
    ? 0 : Math.floor(part.size.x) * Math.floor(part.size.z)), 0);
  const body = new THREE.InstancedMesh(box, pieceProjectileMaterial, pieces.length);
  body.name = 'projectile-body'; body.castShadow = true;
  const tops = studCount ? new THREE.InstancedMesh(stud, pieceProjectileMaterial, studCount) : null;
  if (tops) { tops.name = 'projectile-studs'; tops.castShadow = true; }
  let j = 0;
  pieces.forEach((part, i) => {
    const offset = offsets[i];
    instanceColor.set(part.color);
    body.setMatrixAt(i, scaledTranslation(offset.x, offset.y, offset.z,
      part.size.x * scale, part.size.y * scale, part.size.z * scale));
    body.setColorAt(i, instanceColor);
    if (!tops || part.shape === 'tile' || part.shape === 'slope') return;
    for (let x = 0; x < Math.floor(part.size.x); x++) for (let z = 0; z < Math.floor(part.size.z); z++) {
      tops.setMatrixAt(j, scaledTranslation(offset.x + (x + 0.5 - part.size.x / 2) * scale,
        offset.y + (part.size.y / 2 + 0.07) * scale, offset.z + (z + 0.5 - part.size.z / 2) * scale,
        scale, scale, scale));
      tops.setColorAt(j++, instanceColor);
    }
  });
  updateInstances(body); group.add(body);
  if (tops) { updateInstances(tops); group.add(tops); }
  return group;
}

/** A cosmetic collectible: a polished cube assembled from 27 metal bricks. */
export function createRuneCube(): THREE.Group {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#adbaca', metalness: .85, roughness: .23,
    emissive: '#324d68', emissiveIntensity: .16 });
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const cube = new THREE.Mesh(box, metal);
    cube.position.set(x * .93, y * .93, z * .93); cube.scale.setScalar(.86);
    cube.castShadow = true; group.add(cube);
  }
  return group;
}

export function disposePieceProjectile(scene: THREE.Scene, group: THREE.Group): void {
  scene.remove(group);
  const materials = new Set<THREE.Material>();
  group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      if (object instanceof THREE.InstancedMesh) object.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material !== pieceProjectileMaterial) materials.add(material);
      }
    }
  });
  materials.forEach(material => material.dispose());
}

/** Allocate every floor marker before writing instance matrices. */
export function createArenaDots(): THREE.InstancedMesh {
  const columns = Math.max(0, Math.floor((CONFIG.arenaWidth - 4) / 2) + 1);
  const rows = Math.max(0, Math.floor((CONFIG.arenaDepth - 4) / 2) + 1);
  const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.075, 6), new THREE.MeshBasicMaterial({ color: '#adbfca' }), columns * rows);
  let count = 0;
  for (let x = -CONFIG.arenaWidth / 2 + 2; x <= CONFIG.arenaWidth / 2 - 2; x += 2) for (let z = -CONFIG.arenaDepth / 2 + 2; z <= CONFIG.arenaDepth / 2 - 2; z += 2) {
    dummy.position.set(x, 0.015, z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    dots.setMatrixAt(count++, dummy.matrix);
  }
  dots.count = count;
  dots.instanceMatrix.needsUpdate = true;
  return dots;
}

export class CharacterView {
  root = new THREE.Group();
  body: THREE.InstancedMesh;
  studs: THREE.InstancedMesh;
  ring: THREE.Mesh;
  core: THREE.Mesh;
  groundOffset = 0;
  private bodyBounds = new THREE.Box3();
  private revision = -1;
  private growInstances(kind: 'body' | 'studs', required: number) {
    const previous = this[kind];
    if (required <= previous.instanceMatrix.count) return;
    const capacity = 2 ** Math.ceil(Math.log2(required));
    const mesh = new THREE.InstancedMesh(previous.geometry, previous.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = previous.castShadow;
    mesh.receiveShadow = previous.receiveShadow;
    mesh.frustumCulled = false;
    if (kind === 'body') mesh.raycast = raycastBricks;
    this.root.remove(previous);
    previous.dispose();
    this.root.add(mesh);
    this[kind] = mesh;
  }
  constructor(scene: THREE.Scene, accent: string) {
    this.body = new THREE.InstancedMesh(box, brickMaterial, 512);
    this.body.raycast = raycastBricks;
    this.studs = new THREE.InstancedMesh(stud, brickMaterial, 2048);
    this.body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.studs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.body.frustumCulled = this.studs.frustumCulled = false;
    this.root.add(this.body, this.studs);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(3.9, 4.07, 64), ringMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.055;
    this.core = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.8 }));
    this.core.visible = false;
    scene.add(this.root, this.ring);
    this.root.add(this.core);
    this.root.scale.setScalar(CONFIG.characterScale);
  }
  sync(s: Structure) {
    if (s.revision === this.revision) return;
    this.revision = s.revision;
    this.groundOffset = 0;
    if (s.pieces.size) {
      this.groundOffset = Infinity;
      for (const p of s.pieces.values()) this.groundOffset = Math.min(this.groundOffset, p.position.y);
    }
    this.body.position.y = this.studs.position.y = this.core.position.y = -this.groundOffset;
    this.growInstances('body', s.pieces.size);
    let studCount = 0;
    for (const p of s.pieces.values()) {
      if (p.shape !== 'tile' && p.shape !== 'slope') studCount += Math.floor(p.size.x) * Math.floor(p.size.z);
    }
    this.growInstances('studs', studCount);
    // A grown instance buffer is a new mesh and needs the same floor offset.
    this.body.position.y = this.studs.position.y = -this.groundOffset;
    let i = 0, j = 0;
    this.bodyBounds.makeEmpty();
    for (const p of s.pieces.values()) {
      const x = p.position.x + p.size.x / 2, y = p.position.y + p.size.y / 2, z = p.position.z + p.size.z / 2;
      const sx = Math.max(0.04, p.size.x - 0.035), sy = Math.max(0.04, p.size.y - 0.025), sz = Math.max(0.04, p.size.z - 0.035);
      this.body.setMatrixAt(i, scaledTranslation(x, y, z, sx, sy, sz));
      instanceColor.set(p.color);
      this.body.setColorAt(i++, instanceColor);
      this.bodyBounds.min.min(pickBox.min.set(x - sx / 2, y - sy / 2, z - sz / 2));
      this.bodyBounds.max.max(pickBox.max.set(x + sx / 2, y + sy / 2, z + sz / 2));
      if (p.shape === 'tile' || p.shape === 'slope') continue;
      for (let sx = 0; sx < Math.floor(p.size.x); sx++) for (let sz = 0; sz < Math.floor(p.size.z); sz++) {
        this.studs.setMatrixAt(j, scaledTranslation(p.position.x + sx + 0.5, p.position.y + p.size.y + 0.07, p.position.z + sz + 0.5, 1, 1, 1));
        this.studs.setColorAt(j++, instanceColor);
      }
    }
    this.body.count = i;
    this.studs.count = j;
    updateInstances(this.body); updateInstances(this.studs);
    this.body.boundingBox = this.bodyBounds;
    this.body.boundingSphere ??= new THREE.Sphere();
    this.bodyBounds.getBoundingSphere(this.body.boundingSphere);
    // Include float32 instance-matrix rounding at the broad-phase boundary.
    this.body.boundingSphere.radius += 1e-5;
  }
  dispose(scene: THREE.Scene) {
    scene.remove(this.root, this.ring);
    this.body.dispose(); this.studs.dispose();
    this.ring.geometry.dispose(); (this.ring.material as THREE.Material).dispose();
    this.core.geometry.dispose(); (this.core.material as THREE.Material).dispose();
  }
}

/** A DOM-aligned stock preview rendered through the arena's existing WebGL context. */
export class ReserveView {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  private root = new THREE.Group();
  private bricks = new THREE.InstancedMesh(box, brickMaterial, 240);
  private tops = new THREE.InstancedMesh(stud, brickMaterial, 7680);
  private state?: EvolutionState;
  private revision = -1;
  private bounds = new THREE.Sphere(new THREE.Vector3(), 10);
  constructor(private stage: HTMLElement, private side: -1 | 1) {
    this.scene.background = new THREE.Color(side < 0 ? '#f5f0ff' : '#eff4f7');
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#99a1b5', 2.5));
    const light = new THREE.DirectionalLight('#ffffff', 3.1);
    light.position.set(-12, 22, 18);
    this.scene.add(light);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 14), new THREE.MeshStandardMaterial({ color: side < 0 ? '#e6dcf5' : '#dbe6ed', roughness: .85 }));
    pad.position.y = -0.1;
    const edge = new THREE.MeshStandardMaterial({ color: side < 0 ? '#ac8cd4' : '#97afbe', roughness: .75 });
    for (const direction of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(.25, .55, 14), edge);
      rail.position.set(direction * 4.9, .1, 0);
      const end = new THREE.Mesh(new THREE.BoxGeometry(10, .55, .25), edge);
      end.position.set(0, .1, direction * 6.9);
      this.root.add(rail, end);
    }
    this.bricks.count = this.tops.count = 0;
    this.bricks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bricks.frustumCulled = this.tops.frustumCulled = false;
    this.root.add(pad, this.bricks, this.tops);
    this.scene.add(this.root);
  }
  sync(state: EvolutionState | undefined, visible: boolean) {
    this.root.visible = visible;
    if (this.state === state && this.revision === (state?.reserveRevision ?? -1)) return;
    this.state = state; this.revision = state?.reserveRevision ?? -1;
    const pieces = state?.reserve ?? [], heights = new Float32Array(9 * 13);
    const random = (seed: number) => { const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
    const pose = new THREE.Matrix4(), unit = new THREE.Vector3(1, 1, 1);
    let j = 0;
    const count = Math.min(240, pieces.length);
    for (let i = 0; i < count; i++) {
      const piece = pieces[Math.floor(i * pieces.length / count)];
      const w = Math.min(8, Math.max(1, Math.ceil(piece.size.x * .4))), d = Math.min(12, Math.max(1, Math.ceil(piece.size.z * .4)));
      const x = Math.floor((random(i * 4) + random(i * 4 + 1)) / 2 * (10 - w));
      const z = Math.floor((random(i * 4 + 2) + random(i * 4 + 3)) / 2 * (14 - d));
      let y = 0.2;
      for (let a = x; a < x + w; a++) for (let b = z; b < z + d; b++) y = Math.max(y, heights[a + b * 9]);
      const sx = piece.size.x * .4, sy = piece.size.y * .4, sz = piece.size.z * .4;
      for (let a = x; a < x + w; a++) for (let b = z; b < z + d; b++) heights[a + b * 9] = y + sy + .04;
      dummy.position.set(x - 4.5 + sx / 2, y + sy / 2, z - 6.5 + sz / 2);
      dummy.rotation.set((random(i + 19) - .5) * .18, (random(i + 53) - .5) * .65, (random(i + 101) - .5) * .18);
      dummy.scale.set(sx - .015, sy - .01, sz - .015); dummy.updateMatrix();
      pose.compose(dummy.position, dummy.quaternion, unit);
      instanceColor.set(piece.color);
      this.bricks.setMatrixAt(i, dummy.matrix); this.bricks.setColorAt(i, instanceColor);
      if (piece.shape === 'tile' || piece.shape === 'slope') continue;
      for (let a = 0; a < piece.size.x; a++) for (let b = 0; b < piece.size.z && j < 7680; b++) {
        dummy.position.set((a + .5) * .4 - sx / 2, sy / 2 + .028, (b + .5) * .4 - sz / 2).applyMatrix4(pose);
        dummy.scale.setScalar(.4); dummy.updateMatrix();
        this.tops.setMatrixAt(j, dummy.matrix); this.tops.setColorAt(j++, instanceColor);
      }
    }
    this.bricks.count = count; this.tops.count = j;
    for (const mesh of [this.bricks, this.tops]) {
      updateInstances(mesh);
      mesh.computeBoundingBox();
    }
    new THREE.Box3().setFromObject(this.root).getBoundingSphere(this.bounds);
  }
  sideInset(width: number) {
    const rect = this.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return 0;
    return (this.side < 0 ? rect.right : width - rect.left) + 18;
  }
  render(renderer: THREE.WebGLRenderer) {
    if (!this.root.visible) return;
    const rect = this.stage.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const canvas = renderer.domElement.getBoundingClientRect();
    const aspect = rect.width / rect.height;
    const halfHeight = this.bounds.radius * 1.08 / Math.min(1, aspect);
    this.camera.left = -halfHeight * aspect; this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight; this.camera.bottom = -halfHeight;
    this.camera.position.copy(this.bounds.center).add(new THREE.Vector3(16, 24, 28));
    this.camera.lookAt(this.bounds.center);
    this.camera.updateProjectionMatrix();
    const x = rect.left - canvas.left, y = canvas.bottom - rect.bottom;
    renderer.setViewport(x, y, rect.width, rect.height);
    renderer.setScissor(x, y, rect.width, rect.height);
    renderer.render(this.scene, this.camera);
  }
}

export class ArenaRenderer {
  renderer: THREE.WebGLRenderer;
  reserveViews: ReserveView[] = [];
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-55, 55, 35, -35, 0.1, 300);
  raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -3.2);
  private cameraTarget = new THREE.Vector3(0, 0, 0);
  private ground: THREE.Group;
  private aimRing: THREE.Mesh;
  private shake = 0;
  private previewMode = false;
  private combatHalfHeight = 37 / CONFIG.cameraZoom;
  private hudElement: HTMLElement | null = null;
  private hudAnchor = '';
  private hudPoint = new THREE.Vector3();
  width = 1;
  height = 1;
  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    // One frame includes the arena and the player's stock preview.
    this.renderer.info.autoReset = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.background = new THREE.Color('#f2f5f7');
    this.scene.fog = new THREE.Fog('#f2f5f7', 155, 250);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8e9fab', 2.5));
    const sun = new THREE.DirectionalLight('#ffffff', 3.1);
    sun.position.set(-26, 58, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 80, bottom: -80, near: 1, far: 180 });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.camera.position.set(0, 68, 76);
    this.camera.lookAt(this.cameraTarget);
    this.ground = this.buildArena();
    this.scene.add(this.ground);
    this.aimRing = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.58, 24), new THREE.MeshBasicMaterial({ color: '#6d28d9', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.position.y = 0.09;
    this.scene.add(this.aimRing);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(canvas);
  }
  private buildArena() {
    const group = new THREE.Group();
    const surface = new THREE.MeshStandardMaterial({ color: '#e3ebef', roughness: 1 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.arenaWidth + 3, 1.4, CONFIG.arenaDepth + 3), new THREE.MeshStandardMaterial({ color: '#b9cbd5', roughness: 1 }));
    base.position.y = -0.8;
    base.receiveShadow = true;
    group.add(base);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.arenaWidth, CONFIG.arenaDepth), surface);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);
    group.add(createArenaDots());
    const railMaterial = new THREE.MeshStandardMaterial({ color: '#9cb1bf', roughness: 0.9 });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, CONFIG.arenaDepth + 1), railMaterial);
      rail.position.set(side * (CONFIG.arenaWidth / 2 + 0.35), 0.2, 0);
      rail.castShadow = true; rail.receiveShadow = true; group.add(rail);
      const end = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.arenaWidth + 1.25, 0.85, 0.55), railMaterial);
      end.position.set(0, 0.2, side * (CONFIG.arenaDepth / 2 + 0.35));
      end.castShadow = true; group.add(end);
    }
    for (const [x, z, color] of [
      [-CONFIG.arenaWidth * .36, CONFIG.arenaDepth * .36, '#7c3aed'],
      [CONFIG.arenaWidth * .36, -CONFIG.arenaDepth * .36, '#248d79'],
      [-CONFIG.arenaWidth * .36, -CONFIG.arenaDepth * .36, '#e56b3d'],
      [CONFIG.arenaWidth * .36, CONFIG.arenaDepth * .36, '#ca9b24'],
    ] as const) {
      const mark = new THREE.Mesh(new THREE.RingGeometry(5.9, 6, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
      mark.rotation.x = -Math.PI / 2; mark.position.set(x, 0.03, z); group.add(mark);
      for (let j = 0; j < 3; j++) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
        stripe.rotation.x = -Math.PI / 2; stripe.position.set(x + j * 1.4 - 1.4, 0.035, z + 7); group.add(stripe);
      }
    }
    const center = new THREE.Mesh(new THREE.RingGeometry(8.9, 9, 80), new THREE.MeshBasicMaterial({ color: '#9eb2bf', transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    center.rotation.x = -Math.PI / 2; center.position.y = 0.026; group.add(center);
    return group;
  }
  setPreviewMode(preview: boolean) {
    this.previewMode = preview;
    this.ground.visible = !preview;
    const background = preview ? '#638596' : '#f2f5f7';
    this.scene.background = new THREE.Color(background);
    (this.scene.fog as THREE.Fog).color.set(background);
    this.cameraTarget.set(0, preview ? 10 : 0, 0);
    this.resize();
  }
  resize() {
    this.width = Math.max(1, this.canvas.clientWidth); this.height = Math.max(1, this.canvas.clientHeight);
    const density = Math.min(window.devicePixelRatio, 1.75);
    if (this.renderer.getPixelRatio() !== density) this.renderer.setPixelRatio(density);
    this.renderer.setSize(this.width, this.height, false);
    const aspect = this.width / this.height;
    const desktop = this.width > 760;
    const sidebar = document.querySelector<HTMLElement>('.player-sidebar')?.getBoundingClientRect();
    const actions = document.querySelector<HTMLElement>('.action-panel')?.getBoundingClientRect();
    const left = this.previewMode || !desktop ? 0 : sidebar?.width ? sidebar.right + 12 : 214;
    const right = this.previewMode || !desktop ? 0 : actions?.width ? this.width - actions.left + 12 : 214;
    const top = this.previewMode ? 0 : desktop ? 78 : 54, bottom = this.previewMode ? 0 : 16;
    const arenaAspect = Math.max(1, this.width - left - right) / this.height;
    const halfHeight = this.previewMode ? Math.max(18, 14 / aspect) : Math.max(
      this.combatHalfHeight * this.height / Math.max(1, this.height - top - bottom),
      (CONFIG.arenaWidth / 2 + 3) / arenaAspect);
    const offsetX = -halfHeight * aspect * (left - right) / this.width;
    const offsetY = halfHeight * (top - bottom) / this.height;
    this.camera.left = -halfHeight * aspect + offsetX; this.camera.right = halfHeight * aspect + offsetX;
    this.camera.top = halfHeight + offsetY; this.camera.bottom = -halfHeight + offsetY;
    this.camera.updateProjectionMatrix();
  }
  /** HUD rails follow the visible arena base, independently of camera shake. */
  private alignArenaHUD() {
    this.hudElement ??= document.querySelector<HTMLElement>('.game-ui');
    if (!this.hudElement) return;
    if (this.previewMode || this.width <= 1280 || this.height < 600) {
      if (this.hudAnchor) {
        this.hudElement.style.removeProperty('--arena-hud-top');
        this.hudElement.style.removeProperty('--arena-hud-height');
        this.hudAnchor = '';
      }
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    let top = Infinity, bottom = -Infinity;
    // The outer base includes the thin visible front face beneath the floor.
    for (const x of [-1, 1]) for (const z of [-1, 1]) for (const y of [-1.5, -.1]) {
      this.hudPoint.set(x * (CONFIG.arenaWidth + 3) / 2, y, z * (CONFIG.arenaDepth + 3) / 2).project(this.camera);
      const screenY = rect.top + (1 - this.hudPoint.y) * rect.height / 2;
      top = Math.min(top, screenY); bottom = Math.max(bottom, screenY);
    }
    const screenTop = Math.round(Math.max(88, top) * 2) / 2;
    const screenBottom = Math.round(Math.min(rect.bottom - 20, bottom) * 2) / 2;
    const height = Math.max(0, screenBottom - screenTop);
    const anchor = `${screenTop}/${height}`;
    if (anchor === this.hudAnchor) return;
    this.hudElement.style.setProperty('--arena-hud-top', `${screenTop}px`);
    this.hudElement.style.setProperty('--arena-hud-height', `${height}px`);
    this.hudAnchor = anchor;
  }
  fitCombat(actors: { x: number; z: number; bounds: { min: Vec3; max: Vec3 } }[]) {
    if (this.previewMode) return;
    const length = Math.hypot(68, 76), upY = 76 / length, upZ = -68 / length;
    let low = -CONFIG.arenaDepth / 2 * -upZ, high = -low;
    for (const { z, bounds } of actors) {
      for (const y of [0, (bounds.max.y - bounds.min.y) * CONFIG.characterScale]) {
        for (const dz of [bounds.min.z, bounds.max.z]) {
          const projected = y * upY + (z + dz * CONFIG.characterScale) * upZ;
          low = Math.min(low, projected); high = Math.max(high, projected);
        }
      }
    }
    const center = (low + high) / 2;
    this.cameraTarget.set(0, center * upY, center * upZ);
    const next = Math.max(37 / CONFIG.cameraZoom, (high - low) * .53);
    if (Math.abs(next - this.combatHalfHeight) > .1) { this.combatHalfHeight = next; this.resize(); }
  }
  pointer(clientX: number, clientY: number, targets?: { mesh: THREE.InstancedMesh; x: number; z: number; kind?: 'building' } | { mesh: THREE.InstancedMesh; x: number; z: number; kind?: 'building' }[]) {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / this.width * 2 - 1, -((clientY - rect.top) / this.height) * 2 + 1), this.camera);
    const result = new THREE.Vector3();
    // Any visible part aims at the actor's planar location; height is never a combat requirement.
    let nearest: { distance: number; x: number; z: number } | undefined;
    for (const target of targets ? Array.isArray(targets) ? targets : [targets] : []) {
      const hit = this.raycaster.intersectObject(target.mesh)[0];
      if (hit && (!nearest || hit.distance < nearest.distance)) nearest = {
        distance: hit.distance, x: target.kind === 'building' ? hit.point.x : target.x, z: target.kind === 'building' ? hit.point.z : target.z,
      };
    }
    if (nearest) return result.set(nearest.x, 3.2, nearest.z);
    this.raycaster.ray.intersectPlane(this.aimPlane, result);
    result.x = THREE.MathUtils.clamp(result.x, -CONFIG.arenaWidth / 2, CONFIG.arenaWidth / 2);
    result.z = THREE.MathUtils.clamp(result.z, -CONFIG.arenaDepth / 2, CONFIG.arenaDepth / 2);
    return result;
  }
  aim(x: number, z: number, visible: boolean) { this.aimRing.visible = visible; this.aimRing.position.set(x, 3.2, z); }
  kick(amount = 0.35) { this.shake = Math.min(0.8, this.shake + amount); }
  frame(dt: number) {
    this.shake *= Math.exp(-dt * 14);
    this.camera.position.set(0, 68, 76);
    if (!this.previewMode) this.camera.position.add(this.cameraTarget);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateMatrixWorld();
    this.alignArenaHUD();
    this.camera.position.x += (Math.random() - 0.5) * this.shake;
    this.camera.position.z += (Math.random() - 0.5) * this.shake;
    this.camera.lookAt(this.cameraTarget);
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    if (!this.previewMode) {
      this.renderer.setScissorTest(true);
      for (const view of this.reserveViews) view.render(this.renderer);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.width, this.height);
    }
  }
  pieceMesh(piece: Piece) {
    const mesh = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: piece.color, roughness: 0.65 }));
    mesh.scale.set(piece.size.x * CONFIG.characterScale, piece.size.y * CONFIG.characterScale, piece.size.z * CONFIG.characterScale);
    mesh.castShadow = true;
    this.scene.add(mesh);
    return mesh;
  }
}
