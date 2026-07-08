import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { distanceXZ, respawnAheadXZ, wrapAround } from '../core/utils/recycle';

/**
 * SNOW FOREST — bosque de pinos nevado bajo la luna. Los pinos son un
 * InstancedMesh reciclado; la nieve, un Points envuelto alrededor de la
 * camara. Niebla azul densa para la profundidad.
 */

const TREE_COUNT = 220;
const TREE_RADIUS = 460;
const SNOW_COUNT = 2200;
const SNOW_HALF = 70;

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface Tree { pos: THREE.Vector3; h: number; yaw: number; }

export class SnowForestWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 26,
    clearColor: 0x0a1226,
    fogDensity: 0.006,
    bloom: { strength: 0.7, radius: 0.8, threshold: 0.55 },
    cameraStart: new THREE.Vector3(0, 16, 0),
    bounds: { minY: 8, maxY: 90, margin: 20 },
  };

  private readonly rng = createRng(1221);
  private trees!: THREE.InstancedMesh;
  private readonly data: Tree[] = [];
  private ground!: THREE.Mesh;
  private snow!: THREE.Points;
  private snowPos!: Float32Array;
  private moon!: THREE.Mesh;

  init(camera: THREE.PerspectiveCamera): void {
    this.scene.add(new THREE.HemisphereLight(0x3a4a7a, 0x0a1020, 0.7));
    const moonLight = new THREE.DirectionalLight(0xbcd0ff, 1.1);
    moonLight.position.set(0.4, 0.6, -0.5).normalize();
    this.scene.add(moonLight);

    const gg = new THREE.PlaneGeometry(3000, 3000);
    gg.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: 0x2a3a5a, roughness: 1, metalness: 0 }));
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);

    const geo = new THREE.ConeGeometry(1, 1, 7);
    geo.translate(0, 0.5, 0);
    this.trees = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x16324a, roughness: 0.9, metalness: 0, flatShading: true, emissive: 0x0a1826, emissiveIntensity: 0.3 }), TREE_COUNT);
    this.trees.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trees.frustumCulled = false;
    for (let i = 0; i < TREE_COUNT; i++) {
      const t: Tree = { pos: new THREE.Vector3(), h: 0, yaw: 0 };
      this.data.push(t);
      this.placeTree(t, camera, true);
      this.writeTree(i, t);
    }
    this.trees.instanceMatrix.needsUpdate = true;
    this.scene.add(this.trees);

    this.snowPos = new Float32Array(SNOW_COUNT * 3);
    for (let i = 0; i < SNOW_COUNT; i++) {
      this.snowPos[i * 3] = camera.position.x + range(this.rng, -SNOW_HALF, SNOW_HALF);
      this.snowPos[i * 3 + 1] = camera.position.y + range(this.rng, -SNOW_HALF, SNOW_HALF);
      this.snowPos[i * 3 + 2] = camera.position.z + range(this.rng, -SNOW_HALF, SNOW_HALF);
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);

    this.moon = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 24), new THREE.MeshBasicMaterial({ color: 0xeaf2ff, fog: false }));
    this.moon.frustumCulled = false;
    this.scene.add(this.moon);
  }

  private placeTree(t: Tree, camera: THREE.PerspectiveCamera, initial: boolean): void {
    if (initial) t.pos.set(camera.position.x + range(this.rng, -TREE_RADIUS, TREE_RADIUS), 0, camera.position.z + range(this.rng, -TREE_RADIUS, TREE_RADIUS));
    else { respawnAheadXZ(t.pos, camera, TREE_RADIUS * 0.5, TREE_RADIUS * 0.95, Math.PI * 0.95, this.rng); t.pos.y = 0; }
    t.h = range(this.rng, 24, 60);
    t.yaw = range(this.rng, 0, Math.PI);
  }

  private writeTree(i: number, t: Tree): void {
    tmpQuat.setFromAxisAngle(Y_AXIS, t.yaw);
    tmpScale.set(t.h * 0.4, t.h, t.h * 0.4);
    tmpMatrix.compose(t.pos, tmpQuat, tmpScale);
    this.trees.setMatrixAt(i, tmpMatrix);
  }

  update(dt: number, _elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.ground.position.set(camera.position.x, 0, camera.position.z);
    this.moon.position.set(camera.position.x + 240, camera.position.y + 300, camera.position.z - 500);

    let dirty = false;
    for (let i = 0; i < TREE_COUNT; i++) {
      if (distanceXZ(this.data[i].pos, camera) > TREE_RADIUS) { this.placeTree(this.data[i], camera, false); this.writeTree(i, this.data[i]); dirty = true; }
    }
    if (dirty) this.trees.instanceMatrix.needsUpdate = true;

    const p = this.snowPos;
    for (let i = 0; i < SNOW_COUNT; i++) {
      p[i * 3 + 1] -= dt * range(this.rng, 6, 12);       // cae
      p[i * 3] += Math.sin(p[i * 3 + 1] * 0.1) * dt * 2;  // deriva lateral
      p[i * 3] = wrapAround(p[i * 3], camera.position.x, SNOW_HALF);
      p[i * 3 + 1] = wrapAround(p[i * 3 + 1], camera.position.y, SNOW_HALF);
      p[i * 3 + 2] = wrapAround(p[i * 3 + 2], camera.position.z, SNOW_HALF);
    }
    this.snow.geometry.attributes.position.needsUpdate = true;
  }
}
