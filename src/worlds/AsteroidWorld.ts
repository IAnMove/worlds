import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { isBehind, respawnAheadXZ } from '../core/utils/recycle';

/**
 * ASTEROID BELT — cruzas un cinturon de asteroides con un planeta anillado
 * de fondo. Las rocas son un InstancedMesh reciclado hacia delante; el
 * planeta va pegado a la camara (lejano, no se alcanza nunca).
 */

const ROCK_COUNT = 400;
const FIELD_RADIUS = 700;

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();

interface Rock {
  pos: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  scale: number;
}

export class AsteroidWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 40,
    clearColor: 0x05060c,
    fogDensity: 0.0009,
    bloom: { strength: 0.7, radius: 0.7, threshold: 0.6 },
    cameraStart: new THREE.Vector3(0, 8, 0),
  };

  private readonly rng = createRng(31415);
  private rocks!: THREE.InstancedMesh;
  private readonly data: Rock[] = [];
  private planet!: THREE.Group;

  init(camera: THREE.PerspectiveCamera): void {
    this.scene.add(new THREE.AmbientLight(0x445577, 1.0));
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
    sun.position.set(-0.6, 0.3, 0.4).normalize();
    this.scene.add(sun);

    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a8b76, roughness: 0.95, metalness: 0.05, flatShading: true, emissive: 0x141210, emissiveIntensity: 0.5 });
    this.rocks = new THREE.InstancedMesh(geo, mat, ROCK_COUNT);
    this.rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rocks.frustumCulled = false;
    for (let i = 0; i < ROCK_COUNT; i++) {
      const r: Rock = { pos: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), scale: 1 };
      this.data.push(r);
      this.placeRock(r, camera, true);
      this.writeRock(i, r);
    }
    this.rocks.instanceMatrix.needsUpdate = true;
    this.scene.add(this.rocks);

    // Planeta anillado
    this.planet = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(140, 48, 48),
      new THREE.MeshStandardMaterial({ color: 0x9c5a3c, roughness: 1, metalness: 0, emissive: 0x1a0d08, emissiveIntensity: 0.4 }),
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(180, 300, 96),
      new THREE.MeshBasicMaterial({ color: 0xcfa678, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    ring.rotation.x = Math.PI * 0.42;
    this.planet.add(body, ring);
    this.planet.position.set(-500, 160, -700);
    this.scene.add(this.planet);
  }

  private placeRock(r: Rock, camera: THREE.PerspectiveCamera, initial: boolean): void {
    if (initial) {
      r.pos.set(
        camera.position.x + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS),
        range(this.rng, -70, 70),
        camera.position.z + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS),
      );
    } else {
      respawnAheadXZ(r.pos, camera, FIELD_RADIUS * 0.5, FIELD_RADIUS * 0.95, Math.PI * 1.1, this.rng);
      r.pos.y = range(this.rng, -70, 70);
    }
    r.rot.set(range(this.rng, 0, 6.28), range(this.rng, 0, 6.28), range(this.rng, 0, 6.28));
    r.spin.set(range(this.rng, -0.5, 0.5), range(this.rng, -0.5, 0.5), range(this.rng, -0.5, 0.5));
    r.scale = range(this.rng, 1.5, 9);
  }

  private writeRock(i: number, r: Rock): void {
    tmpQuat.setFromEuler(r.rot);
    tmpMatrix.compose(r.pos, tmpQuat, tmpScale.setScalar(r.scale));
    this.rocks.setMatrixAt(i, tmpMatrix);
  }

  update(dt: number, _elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.planet.position.set(camera.position.x - 500, 160, camera.position.z - 700);
    for (let i = 0; i < ROCK_COUNT; i++) {
      const r = this.data[i];
      if (isBehind(r.pos, camera, 60)) this.placeRock(r, camera, false);
      r.rot.set(r.rot.x + r.spin.x * dt, r.rot.y + r.spin.y * dt, r.rot.z + r.spin.z * dt);
      this.writeRock(i, r);
    }
    this.rocks.instanceMatrix.needsUpdate = true;
  }
}
