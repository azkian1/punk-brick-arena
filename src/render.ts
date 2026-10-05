import * as THREE from 'three';
import type { Piece, Structure } from './game/types';
import { CONFIG } from './game/config';

const box = new THREE.BoxGeometry(1, 1, 1);
const stud = new THREE.CylinderGeometry(0.29, 0.29, 0.16, 8);
const brickMaterial = new THREE.MeshStandardMaterial({ roughness: 0.68, metalness: 0.02 });
const dummy = new THREE.Object3D();
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

export class CharacterView {
  root = new THREE.Group();
  body: THREE.InstancedMesh;
  studs: THREE.InstancedMesh;
  ring: THREE.Mesh;
  core: THREE.Mesh;
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
    this.root.remove(previous);
    previous.dispose();
    this.root.add(mesh);
    this[kind] = mesh;
  }
  constructor(scene: THREE.Scene, accent: string) {
    this.body = new THREE.InstancedMesh(box, brickMaterial, 512);
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
    this.growInstances('body', s.pieces.size);
    let studCount = 0;
    for (const p of s.pieces.values()) {
      if (p.shape !== 'tile' && p.shape !== 'slope') studCount += Math.floor(p.size.x) * Math.floor(p.size.z);
    }
    this.growInstances('studs', studCount);
    let i = 0, j = 0;
    for (const p of s.pieces.values()) {
      dummy.position.set(p.position.x + p.size.x / 2, p.position.y + p.size.y / 2, p.position.z + p.size.z / 2);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(Math.max(0.04, p.size.x - 0.035), Math.max(0.04, p.size.y - 0.025), Math.max(0.04, p.size.z - 0.035));
      dummy.updateMatrix();
      this.body.setMatrixAt(i, dummy.matrix);
      this.body.setColorAt(i++, new THREE.Color(p.color));
      if (p.shape === 'tile' || p.shape === 'slope') continue;
      for (let sx = 0; sx < Math.floor(p.size.x); sx++) for (let sz = 0; sz < Math.floor(p.size.z); sz++) {
        dummy.position.set(p.position.x + sx + 0.5, p.position.y + p.size.y + 0.07, p.position.z + sz + 0.5);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.studs.setMatrixAt(j, dummy.matrix);
        this.studs.setColorAt(j++, new THREE.Color(p.color));
      }
    }
    this.body.count = i;
    this.studs.count = j;
    this.body.instanceMatrix.needsUpdate = this.studs.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    if (this.studs.instanceColor) this.studs.instanceColor.needsUpdate = true;
    this.body.computeBoundingSphere();
  }
  dispose(scene: THREE.Scene) {
    scene.remove(this.root, this.ring);
    this.body.dispose(); this.studs.dispose();
    this.ring.geometry.dispose(); (this.ring.material as THREE.Material).dispose();
    this.core.geometry.dispose(); (this.core.material as THREE.Material).dispose();
  }
}

export class ArenaRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-55, 55, 35, -35, 0.1, 300);
  raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -3.2);
  private cameraTarget = new THREE.Vector3(0, 0, 0);
  private ground: THREE.Group;
  private aimRing: THREE.Mesh;
  private shake = 0;
  private previewMode = false;
  width = 1;
  height = 1;
  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
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
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 55, bottom: -55, near: 1, far: 140 });
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
    const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.075, 6), new THREE.MeshBasicMaterial({ color: '#adbfca' }), 5000);
    let n = 0;
    for (let x = -CONFIG.arenaWidth / 2 + 2; x <= CONFIG.arenaWidth / 2 - 2; x += 2) for (let z = -CONFIG.arenaDepth / 2 + 2; z <= CONFIG.arenaDepth / 2 - 2; z += 2) {
      dummy.position.set(x, 0.015, z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); dots.setMatrixAt(n++, dummy.matrix);
    }
    dots.count = n;
    group.add(dots);
    const railMaterial = new THREE.MeshStandardMaterial({ color: '#9cb1bf', roughness: 0.9 });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, CONFIG.arenaDepth + 1), railMaterial);
      rail.position.set(side * (CONFIG.arenaWidth / 2 + 0.35), 0.2, 0);
      rail.castShadow = true; rail.receiveShadow = true; group.add(rail);
      const end = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.arenaWidth + 1.25, 0.85, 0.55), railMaterial);
      end.position.set(0, 0.2, side * (CONFIG.arenaDepth / 2 + 0.35));
      end.castShadow = true; group.add(end);
    }
    for (const [x, color] of [[-CONFIG.arenaWidth * 0.31, '#7c3aed'], [CONFIG.arenaWidth * 0.31, '#638596']] as const) {
      const mark = new THREE.Mesh(new THREE.RingGeometry(5.9, 6, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
      mark.rotation.x = -Math.PI / 2; mark.position.set(x, 0.03, 0); group.add(mark);
      for (let j = 0; j < 3; j++) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
        stripe.rotation.x = -Math.PI / 2; stripe.position.set(x + j * 1.4 - 1.4, 0.035, CONFIG.arenaDepth / 2 - 7); group.add(stripe);
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
    this.renderer.setSize(this.width, this.height, false);
    const aspect = this.width / this.height;
    const halfHeight = this.previewMode ? Math.max(18, 14 / aspect) : Math.max(37 / CONFIG.cameraZoom, (CONFIG.arenaWidth / 2 + 6) / aspect);
    this.camera.left = -halfHeight * aspect; this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight; this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }
  pointer(clientX: number, clientY: number, target?: { mesh: THREE.InstancedMesh; x: number; z: number }) {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / this.width * 2 - 1, -((clientY - rect.top) / this.height) * 2 + 1), this.camera);
    const result = new THREE.Vector3();
    // Any visible part aims at the actor's planar location; height is never a combat requirement.
    if (target && this.raycaster.intersectObject(target.mesh).length) return result.set(target.x, 3.2, target.z);
    this.raycaster.ray.intersectPlane(this.aimPlane, result);
    result.x = THREE.MathUtils.clamp(result.x, -CONFIG.arenaWidth / 2, CONFIG.arenaWidth / 2);
    result.z = THREE.MathUtils.clamp(result.z, -CONFIG.arenaDepth / 2, CONFIG.arenaDepth / 2);
    return result;
  }
  aim(x: number, z: number, visible: boolean) { this.aimRing.visible = visible; this.aimRing.position.set(x, 3.2, z); }
  kick(amount = 0.35) { this.shake = Math.min(0.8, this.shake + amount); }
  frame(dt: number) {
    this.shake *= Math.exp(-dt * 14);
    this.camera.position.set((Math.random() - 0.5) * this.shake, 68, 76 + (Math.random() - 0.5) * this.shake);
    this.camera.lookAt(this.cameraTarget);
    this.renderer.render(this.scene, this.camera);
  }
  pieceMesh(piece: Piece) {
    const mesh = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: piece.color, roughness: 0.65 }));
    mesh.scale.set(piece.size.x * CONFIG.characterScale, piece.size.y * CONFIG.characterScale, piece.size.z * CONFIG.characterScale);
    mesh.castShadow = true;
    this.scene.add(mesh);
    return mesh;
  }
}
