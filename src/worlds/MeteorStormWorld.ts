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

const METEOR_COUNT = 420;
const HALF = 120;
const STAR_COUNT = 1800;
const STAR_HALF = 300;

const STREAK_DIR = new THREE.Vector3(-0.35, -0.5, -1).normalize();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpPos = new THREE.Vector3();

export class MeteorStormWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 20,
    clearColor: 0x02030c,
    fogDensity: 0.0006,
    bloom: { strength: 1.05, radius: 0.85, threshold: 0.45 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private readonly rng = createRng(40921);
  private meteors!: THREE.InstancedMesh;
  private readonly pos: THREE.Vector3[] = [];
  private readonly speed: number[] = [];
  private stars!: THREE.Points;
  private starPos!: Float32Array;

  init(camera: THREE.PerspectiveCamera): void {
    // barra fina y larga a lo largo de +Z local (se orienta a STREAK_DIR)
    const geo = new THREE.CylinderGeometry(0.35, 0.05, 16, 6);
    geo.rotateX(Math.PI / 2); // afila la estria: gruesa detras, fina delante
    this.meteors = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xeaf2ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), METEOR_COUNT);
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
      this.speed.push(range(this.rng, 120, 280));
      const len = range(this.rng, 1.0, 2.6);
      const w = range(this.rng, 0.8, 1.8);
      tmpMatrix.compose(p, tmpQuat, tmpScale.set(w, w, len));
      this.meteors.setMatrixAt(i, tmpMatrix);
    }
    this.meteors.instanceMatrix.needsUpdate = true;
    this.scene.add(this.meteors);

    this.starPos = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      tmpPos.set(range(this.rng, -1, 1), range(this.rng, -1, 1), range(this.rng, -1, 1)).normalize().multiplyScalar(range(this.rng, 350, STAR_HALF + 500));
      this.starPos[i * 3] = tmpPos.x; this.starPos[i * 3 + 1] = tmpPos.y; this.starPos[i * 3 + 2] = tmpPos.z;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(this.starPos, 3));
    this.stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0x9fb4e0, size: 1.2, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
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
      this.meteors.getMatrixAt(i, tmpMatrix);
      tmpMatrix.decompose(tmpPos, tmpQuat, tmpScale); // conservar escala
      tmpMatrix.compose(p, tmpQuat, tmpScale);
      this.meteors.setMatrixAt(i, tmpMatrix);
    }
    this.meteors.instanceMatrix.needsUpdate = true;
    this.stars.position.copy(camera.position);
  }
}
