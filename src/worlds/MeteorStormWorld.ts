import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { wrapAround } from '../core/utils/recycle';

/**
 * METEOR STORM — una tormenta de meteoros: cientos de estrias paralelas
 * cruzando el vacio a toda velocidad. Son un InstancedMesh de barras finas
 * (todas orientadas a la misma direccion) que se envuelven alrededor de la
 * camara. Campo de estrellas quieto de fondo.
 */

const METEOR_COUNT = 440;
const HALF = 185;
const STAR_COUNT = 1800;
const STAR_HALF = 300;

const STREAK_DIR = new THREE.Vector3(-0.35, -0.5, -1).normalize();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpColor = new THREE.Color();

export class MeteorStormWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 24,
    clearColor: 0x02030c,
    fogDensity: 0.0004,
    bloom: { strength: 0.8, radius: 0.85, threshold: 0.62 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private readonly rng = createRng(40921);
  private meteors!: THREE.InstancedMesh;
  private readonly pos: THREE.Vector3[] = [];
  private readonly speed: number[] = [];
  private readonly scale: THREE.Vector3[] = [];
  private stars!: THREE.Points;
  private starPos!: Float32Array;

  init(camera: THREE.PerspectiveCamera): void {
    // barra fina y larga a lo largo de +Z local (se orienta a STREAK_DIR)
    const geo = new THREE.CylinderGeometry(0.3, 0.02, 16, 6);
    geo.rotateX(Math.PI / 2); // afila la estria: gruesa detras, fina delante
    this.meteors = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), METEOR_COUNT);
    this.meteors.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.meteors.frustumCulled = false;
    tmpQuat.setFromUnitVectors(Z_AXIS, STREAK_DIR);
    for (let i = 0; i < METEOR_COUNT; i++) {
      const p = new THREE.Vector3(
        camera.position.x + range(this.rng, -HALF, HALF),
        camera.position.y + range(this.rng, -HALF, HALF),
        camera.position.z + range(this.rng, -HALF, HALF),
      );
      this.pos.push(p);
      this.speed.push(range(this.rng, 120, 300));
      // Pocas estrias brillantes destacan sobre muchas tenues: evita el velo blanco
      const bright = this.rng() < 0.14;
      const len = bright ? range(this.rng, 2.4, 4.2) : range(this.rng, 0.8, 2.0);
      const w = bright ? range(this.rng, 1.0, 1.6) : range(this.rng, 0.5, 1.0);
      const s = new THREE.Vector3(w, w, len);
      this.scale.push(s);
      tmpMatrix.compose(p, tmpQuat, s);
      this.meteors.setMatrixAt(i, tmpMatrix);
      // blanco-azulado frio; las tenues muy apagadas para no saturar el bloom
      const b = bright ? range(this.rng, 0.9, 1.15) : range(this.rng, 0.28, 0.6);
      tmpColor.setRGB(b * 0.82, b * 0.9, b);
      this.meteors.setColorAt(i, tmpColor);
    }
    this.meteors.instanceMatrix.needsUpdate = true;
    if (this.meteors.instanceColor) this.meteors.instanceColor.needsUpdate = true;
    this.scene.add(this.meteors);

    this.starPos = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      tmpPos.set(range(this.rng, -1, 1), range(this.rng, -1, 1), range(this.rng, -1, 1)).normalize().multiplyScalar(range(this.rng, 350, STAR_HALF + 500));
      this.starPos[i * 3] = tmpPos.x; this.starPos[i * 3 + 1] = tmpPos.y; this.starPos[i * 3 + 2] = tmpPos.z;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(this.starPos, 3));
    this.stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0x8296c0, size: 1.1, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  update(dt: number, _elapsed: number, camera: THREE.PerspectiveCamera): void {
    tmpQuat.setFromUnitVectors(Z_AXIS, STREAK_DIR);
    for (let i = 0; i < METEOR_COUNT; i++) {
      const p = this.pos[i];
      p.addScaledVector(STREAK_DIR, this.speed[i] * dt);
      p.x = wrapAround(p.x, camera.position.x, HALF);
      p.y = wrapAround(p.y, camera.position.y, HALF);
      p.z = wrapAround(p.z, camera.position.z, HALF);
      tmpMatrix.compose(p, tmpQuat, this.scale[i]);
      this.meteors.setMatrixAt(i, tmpMatrix);
    }
    this.meteors.instanceMatrix.needsUpdate = true;
    this.stars.position.copy(camera.position);
  }
}
