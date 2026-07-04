import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { distanceXZ, respawnAheadXZ, wrapAround } from '../core/utils/recycle';

/**
 * MATRIX — mundo oscuro de neones verdes.
 *
 * ESTADO: placeholder de la tarea 0. Las tareas 3 y 4 lo convierten en el
 * mundo definitivo: lluvia de glifos con shader propio, tuneles, autopistas
 * de datos, paneles holograficos y arquitectura imposible.
 */

const RAIN_COUNT = 6000;
const RAIN_HALF = 150; // media caja de la nube de lluvia que envuelve a la camara
const MONOLITH_COUNT = 260;
const FIELD_RADIUS = 380;

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();

export class MatrixWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 24,
    clearColor: 0x010502,
    fogDensity: 0.009,
    bloom: { strength: 1.1, radius: 0.8, threshold: 0.4 },
    cameraStart: new THREE.Vector3(0, 20, 0),
    // Colliders blandos: ni bajo el suelo ni perderse por encima
    bounds: { minY: 6, maxY: 200, margin: 24 },
  };

  private readonly rng = createRng(2049);
  private rain!: THREE.Points;
  private rainPositions!: Float32Array;
  private readonly rainSpeeds = new Float32Array(RAIN_COUNT);
  private monoliths!: THREE.InstancedMesh;
  private readonly positions: THREE.Vector3[] = [];
  private readonly scales: THREE.Vector3[] = [];

  init(camera: THREE.PerspectiveCamera): void {
    // --- Lluvia digital: nube de puntos que cae y envuelve a la camara ---
    // (la tarea 3 la sustituye por glifos con ShaderMaterial)
    this.rainPositions = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainPositions[i * 3 + 0] = camera.position.x + range(this.rng, -RAIN_HALF, RAIN_HALF);
      this.rainPositions[i * 3 + 1] = camera.position.y + range(this.rng, -RAIN_HALF, RAIN_HALF);
      this.rainPositions[i * 3 + 2] = camera.position.z + range(this.rng, -RAIN_HALF, RAIN_HALF);
      this.rainSpeeds[i] = range(this.rng, 9, 30);
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0x33ff66,
      size: 0.6,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.rain = new THREE.Points(rainGeo, rainMat);
    this.rain.frustumCulled = false; // la nube siempre rodea a la camara
    this.scene.add(this.rain);

    // --- Monolitos tecnologicos con aristas de neon ---
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: true });
    this.monoliths = new THREE.InstancedMesh(geo, mat, MONOLITH_COUNT);
    this.monoliths.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MONOLITH_COUNT; i++) {
      const pos = new THREE.Vector3(
        camera.position.x + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS),
        0,
        camera.position.z + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS),
      );
      const scale = new THREE.Vector3(
        range(this.rng, 6, 20),
        range(this.rng, 15, 120),
        range(this.rng, 6, 20),
      );
      this.positions.push(pos);
      this.scales.push(scale);
      this.writeInstance(i);
      const glow = this.rng() < 0.15;
      tmpColor.setHSL(0.36, 1, glow ? 0.55 : 0.03 + this.rng() * 0.05);
      this.monoliths.setColorAt(i, tmpColor);
    }
    this.monoliths.instanceMatrix.needsUpdate = true;
    if (this.monoliths.instanceColor) this.monoliths.instanceColor.needsUpdate = true;
    this.scene.add(this.monoliths);
  }

  update(dt: number, _elapsed: number, camera: THREE.PerspectiveCamera): void {
    // Lluvia: cae y se envuelve alrededor de la camara en los tres ejes
    const p = this.rainPositions;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const y = p[i * 3 + 1] - this.rainSpeeds[i] * dt;
      p[i * 3 + 0] = wrapAround(p[i * 3 + 0], camera.position.x, RAIN_HALF);
      p[i * 3 + 1] = wrapAround(y, camera.position.y, RAIN_HALF);
      p[i * 3 + 2] = wrapAround(p[i * 3 + 2], camera.position.z, RAIN_HALF);
    }
    this.rain.geometry.attributes.position.needsUpdate = true;

    // Monolitos: mismo patron de reciclado que DataCity
    let dirty = false;
    for (let i = 0; i < MONOLITH_COUNT; i++) {
      const pos = this.positions[i];
      if (distanceXZ(pos, camera) > FIELD_RADIUS) {
        respawnAheadXZ(pos, camera, FIELD_RADIUS * 0.5, FIELD_RADIUS * 0.95, Math.PI, this.rng);
        this.writeInstance(i);
        dirty = true;
      }
    }
    if (dirty) this.monoliths.instanceMatrix.needsUpdate = true;
  }

  private writeInstance(i: number): void {
    tmpMatrix.compose(this.positions[i], tmpQuat, tmpScale.copy(this.scales[i]));
    this.monoliths.setMatrixAt(i, tmpMatrix);
  }
}
