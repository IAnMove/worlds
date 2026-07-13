import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { isBehind, respawnAheadXZ } from '../core/utils/recycle';
import { makeGlowSprite } from './utils/sprites';

/**
 * ASTEROID BELT — cruzas un cinturon de asteroides con un planeta anillado
 * de fondo. Las rocas son un InstancedMesh reciclado hacia delante; el
 * planeta va pegado a la camara (lejano, no se alcanza nunca).
 */

const ROCK_COUNT = 400;
const FIELD_RADIUS = 700;
const STAR_COUNT = 1500;
const SUN_DIR = new THREE.Vector3(-0.6, 0.3, 0.4).normalize();

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();

interface Rock {
  pos: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  scale: number;
}

export class AsteroidWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 40,
    clearColor: 0x04050a,
    fogDensity: 0.0006,
    bloom: { strength: 0.6, radius: 0.6, threshold: 0.7 },
    cameraStart: new THREE.Vector3(0, 8, 0),
  };

  private readonly rng = createRng(31415);
  private rocks!: THREE.InstancedMesh;
  private readonly data: Rock[] = [];
  private planet!: THREE.Group;
  private stars!: THREE.Points;
  private sunGlow!: THREE.Sprite;

  init(camera: THREE.PerspectiveCamera): void {
    this.scene.add(new THREE.AmbientLight(0x445577, 0.8));
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
    sun.position.copy(SUN_DIR);
    this.scene.add(sun);

    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.05, flatShading: true, emissive: 0x141210, emissiveIntensity: 0.5 });
    this.rocks = new THREE.InstancedMesh(geo, mat, ROCK_COUNT);
    this.rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rocks.frustumCulled = false;
    for (let i = 0; i < ROCK_COUNT; i++) {
      const r: Rock = { pos: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), scale: 1 };
      this.data.push(r);
      this.placeRock(r, camera, true);
      this.writeRock(i, r);
      this.paintRock(i);
    }
    this.rocks.instanceMatrix.needsUpdate = true;
    if (this.rocks.instanceColor) this.rocks.instanceColor.needsUpdate = true;
    this.scene.add(this.rocks);

    // Campo de estrellas: cascaron lejano que sigue a la camara
    const starPos = new Float32Array(STAR_COUNT * 3);
    const starCol = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const yaw = range(this.rng, 0, Math.PI * 2);
      const pitch = Math.asin(range(this.rng, -1, 1));
      const radius = range(this.rng, 1500, 2400);
      starPos[i * 3] = Math.cos(yaw) * Math.cos(pitch) * radius;
      starPos[i * 3 + 1] = Math.sin(pitch) * radius;
      starPos[i * 3 + 2] = Math.sin(yaw) * Math.cos(pitch) * radius;
      tmpColor.setHSL(range(this.rng, 0.55, 0.68), range(this.rng, 0.1, 0.45), range(this.rng, 0.55, 1));
      tmpColor.toArray(starCol, i * 3);
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    sgeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    this.stars = new THREE.Points(sgeo, new THREE.PointsMaterial({
      map: makeGlowSprite(), size: 6, vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    // Sol: halo aditivo en la direccion de la luz
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowSprite(128, 0.2), color: 0xffe8c0, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.sunGlow.scale.setScalar(420);
    this.scene.add(this.sunGlow);

    // Planeta anillado
    this.planet = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(140, 48, 48),
      new THREE.MeshStandardMaterial({ color: 0x9c5a3c, roughness: 1, metalness: 0, emissive: 0x1a0d08, emissiveIntensity: 0.4 }),
    );
    const ringInner = new THREE.Mesh(
      new THREE.RingGeometry(170, 235, 96),
      new THREE.MeshBasicMaterial({ color: 0xd8b088, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    const ringOuter = new THREE.Mesh(
      new THREE.RingGeometry(245, 310, 96),
      new THREE.MeshBasicMaterial({ color: 0xb89a78, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    ringInner.rotation.x = ringOuter.rotation.x = Math.PI * 0.42;
    // atmosfera: halo calido en el limbo del planeta
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(146, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0xff9a50, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false }),
    );
    this.planet.add(body, ringInner, ringOuter, atmo);
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

  private paintRock(i: number): void {
    // grises pardos con alguna roca oscura o rojiza
    const k = this.rng();
    if (k < 0.15) tmpColor.setRGB(0.32, 0.28, 0.24);
    else if (k < 0.3) tmpColor.setRGB(0.62, 0.44, 0.32);
    else tmpColor.setRGB(range(this.rng, 0.5, 0.72), range(this.rng, 0.45, 0.62), range(this.rng, 0.38, 0.5));
    this.rocks.setColorAt(i, tmpColor);
  }

  update(dt: number, _elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.planet.position.set(camera.position.x - 500, 160, camera.position.z - 700);
    this.stars.position.copy(camera.position);
    this.sunGlow.position.copy(camera.position).addScaledVector(SUN_DIR, 1900);
    let colorsDirty = false;
    for (let i = 0; i < ROCK_COUNT; i++) {
      const r = this.data[i];
      if (isBehind(r.pos, camera, 60)) {
        this.placeRock(r, camera, false);
        this.paintRock(i);
        colorsDirty = true;
      }
      r.rot.set(r.rot.x + r.spin.x * dt, r.rot.y + r.spin.y * dt, r.rot.z + r.spin.z * dt);
      this.writeRock(i, r);
    }
    this.rocks.instanceMatrix.needsUpdate = true;
    if (colorsDirty && this.rocks.instanceColor) this.rocks.instanceColor.needsUpdate = true;
  }
}
