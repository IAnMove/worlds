import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { isBehind, respawnAheadXZ, wrapAround } from '../core/utils/recycle';
import { makeGlowSprite } from './utils/sprites';

/**
 * RING DIVE — vuelas dentro de los anillos de un gigante gaseoso: una lamina de
 * hielo y roca (InstancedMesh reciclado, confinado a y~0) mas un polvo de hielo
 * fino que llena el plano del anillo, con el planeta rayado y anillado de fondo.
 */

const CHUNK_COUNT = 520;
const FIELD_RADIUS = 640;
const ICE_COUNT = 1700;   // polvo de hielo que da densidad al plano del anillo
const ICE_HALF = 230;
const ICE_Y = 36;

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();

interface Chunk { pos: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; scale: number; }

export class RingDiveWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 44,
    clearColor: 0x060810,
    fogDensity: 0.0012,
    bloom: { strength: 0.7, radius: 0.7, threshold: 0.6 },
    cameraStart: new THREE.Vector3(0, 0, 0),
    bounds: { minY: -18, maxY: 18, margin: 10 }, // te mantiene dentro del plano del anillo
  };

  private readonly rng = createRng(60607);
  private chunks!: THREE.InstancedMesh;
  private readonly data: Chunk[] = [];
  private planet!: THREE.Group;
  private ice!: THREE.Points;
  private icePos!: Float32Array;

  init(camera: THREE.PerspectiveCamera): void {
    this.scene.add(new THREE.AmbientLight(0x556680, 0.9));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(0.5, 0.4, -0.6).normalize();
    this.scene.add(sun);

    const geo = new THREE.DodecahedronGeometry(1, 0);
    this.chunks = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05, flatShading: true, color: 0xffffff }), CHUNK_COUNT);
    this.chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chunks.frustumCulled = false;
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const c: Chunk = { pos: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), scale: 1 };
      this.data.push(c);
      this.placeChunk(c, camera, true);
      this.writeChunk(i, c);
      // hielo azulado a roca parda
      tmpColor.setHSL(range(this.rng, 0.55, 0.62), 0.25, range(this.rng, 0.55, 0.85));
      if (this.rng() < 0.3) tmpColor.setHSL(0.08, 0.3, range(this.rng, 0.3, 0.5));
      this.chunks.setColorAt(i, tmpColor);
    }
    this.chunks.instanceMatrix.needsUpdate = true;
    if (this.chunks.instanceColor) this.chunks.instanceColor.needsUpdate = true;
    this.scene.add(this.chunks);

    // Polvo de hielo: una losa fina de motas que envuelve a la camara en el
    // plano del anillo. Da densidad y esconde el vacio negro de arriba/abajo.
    this.icePos = new Float32Array(ICE_COUNT * 3);
    for (let i = 0; i < ICE_COUNT; i++) {
      this.icePos[i * 3] = camera.position.x + range(this.rng, -ICE_HALF, ICE_HALF);
      this.icePos[i * 3 + 1] = range(this.rng, -ICE_Y, ICE_Y) * Math.abs(range(this.rng, -1, 1)); // mas denso hacia y=0
      this.icePos[i * 3 + 2] = camera.position.z + range(this.rng, -ICE_HALF, ICE_HALF);
    }
    const igeo = new THREE.BufferGeometry();
    igeo.setAttribute('position', new THREE.BufferAttribute(this.icePos, 3));
    this.ice = new THREE.Points(igeo, new THREE.PointsMaterial({ map: makeGlowSprite(64, 0.5), color: 0xcfe6ff, size: 1.7, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    this.ice.frustumCulled = false;
    this.scene.add(this.ice);

    // Gigante gaseoso rayado con sus anillos, casi de canto (alineados con el
    // plano por el que vuelas) y una division tipo Cassini entre las bandas.
    this.planet = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(220, 64, 64), new THREE.MeshStandardMaterial({ color: 0xe8b370, roughness: 1, emissive: 0x3a2410, emissiveIntensity: 0.9 }));
    this.planet.add(body);
    const ringA = new THREE.Mesh(new THREE.RingGeometry(255, 330, 128), new THREE.MeshBasicMaterial({ color: 0xe4cfa8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    const ringB = new THREE.Mesh(new THREE.RingGeometry(345, 470, 128), new THREE.MeshBasicMaterial({ color: 0xc7ab84, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    ringA.rotation.x = ringB.rotation.x = Math.PI * 0.5 - 0.14; // casi de canto
    this.planet.add(ringA, ringB);
    this.planet.position.set(-330, -30, -900);
    this.scene.add(this.planet);
  }

  private placeChunk(c: Chunk, camera: THREE.PerspectiveCamera, initial: boolean): void {
    if (initial) c.pos.set(camera.position.x + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS), range(this.rng, -14, 14), camera.position.z + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS));
    else { respawnAheadXZ(c.pos, camera, FIELD_RADIUS * 0.5, FIELD_RADIUS * 0.95, Math.PI * 1.1, this.rng); c.pos.y = range(this.rng, -14, 14); }
    c.rot.set(range(this.rng, 0, 6.28), range(this.rng, 0, 6.28), range(this.rng, 0, 6.28));
    c.spin.set(range(this.rng, -0.6, 0.6), range(this.rng, -0.6, 0.6), range(this.rng, -0.6, 0.6));
    c.scale = range(this.rng, 1, 6) * (this.rng() < 0.15 ? 2.4 : 1);
  }

  private writeChunk(i: number, c: Chunk): void {
    tmpQuat.setFromEuler(c.rot);
    tmpMatrix.compose(c.pos, tmpQuat, tmpScale.setScalar(c.scale));
    this.chunks.setMatrixAt(i, tmpMatrix);
  }

  update(dt: number, _elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.planet.position.set(camera.position.x - 330, -30, camera.position.z - 900);
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const c = this.data[i];
      if (isBehind(c.pos, camera, 60)) this.placeChunk(c, camera, false);
      c.rot.set(c.rot.x + c.spin.x * dt, c.rot.y + c.spin.y * dt, c.rot.z + c.spin.z * dt);
      this.writeChunk(i, c);
    }
    this.chunks.instanceMatrix.needsUpdate = true;

    // El polvo de hielo se envuelve alrededor de la camara (losa en el plano)
    const p = this.icePos;
    for (let i = 0; i < ICE_COUNT; i++) {
      p[i * 3] = wrapAround(p[i * 3], camera.position.x, ICE_HALF);
      p[i * 3 + 2] = wrapAround(p[i * 3 + 2], camera.position.z, ICE_HALF);
    }
    this.ice.geometry.attributes.position.needsUpdate = true;
  }
}
