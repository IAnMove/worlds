import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { isBehind, respawnAheadXZ } from '../core/utils/recycle';

/**
 * COMET SWARM — un enjambre de cometas cruzando el vacio, cada uno con su
 * cola apuntando en direccion contraria a un "sol" lejano. Cabezas y colas
 * son dos InstancedMesh reciclados; estrellas de fondo.
 */

const COMET_COUNT = 60;
const FIELD_RADIUS = 620;
const STAR_COUNT = 1400;

const SUN_DIR = new THREE.Vector3(0.4, 0.5, 1).normalize(); // las colas huyen de aqui

// Cola con degradado: densa junto a la cabeza (apice) y desvanecida en la punta
const TAIL_VERT = /* glsl */ `
varying float vY;
void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
const TAIL_FRAG = /* glsl */ `
uniform vec3 uColor; varying float vY;
void main(){
  float a = smoothstep(-1.0, -0.05, vY);   // 0 en la punta lejana (y=-1), 1 junto a la cabeza (y=0)
  gl_FragColor = vec4(uColor, a * a * 0.55);
}`;

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpPos = new THREE.Vector3();
const tmpColor = new THREE.Color();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface Comet { pos: THREE.Vector3; scale: number; }

export class CometWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 34,
    clearColor: 0x03040c,
    fogDensity: 0.0008,
    bloom: { strength: 1.0, radius: 0.85, threshold: 0.5 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private readonly rng = createRng(51234);
  private heads!: THREE.InstancedMesh;
  private tails!: THREE.InstancedMesh;
  private readonly data: Comet[] = [];
  private stars!: THREE.Points;
  private starPos!: Float32Array;

  init(camera: THREE.PerspectiveCamera): void {
    this.heads = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      COMET_COUNT,
    );
    this.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.heads.frustumCulled = false;

    // Cola: cono estirado, base ancha detras de la cabeza, con degradado propio
    const tailGeo = new THREE.ConeGeometry(1, 1, 8, 1, true);
    tailGeo.translate(0, -0.5, 0); // apice en el origen (cabeza), se abre hacia -Y local
    this.tails = new THREE.InstancedMesh(
      tailGeo,
      new THREE.ShaderMaterial({ vertexShader: TAIL_VERT, fragmentShader: TAIL_FRAG, uniforms: { uColor: { value: new THREE.Color(0x74d0ff) } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      COMET_COUNT,
    );
    this.tails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tails.frustumCulled = false;

    for (let i = 0; i < COMET_COUNT; i++) {
      const c: Comet = { pos: new THREE.Vector3(), scale: 1 };
      this.data.push(c);
      this.placeComet(c, camera, true);
      this.writeComet(i, c);
      tmpColor.setHSL(range(this.rng, 0.5, 0.62), 0.6, 0.75);
      this.heads.setColorAt(i, tmpColor);
    }
    this.heads.instanceMatrix.needsUpdate = true;
    this.tails.instanceMatrix.needsUpdate = true;
    if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
    this.scene.add(this.tails, this.heads);

    this.starPos = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      tmpPos.set(range(this.rng, -1, 1), range(this.rng, -1, 1), range(this.rng, -1, 1)).normalize().multiplyScalar(range(this.rng, 400, 800));
      this.starPos[i * 3] = tmpPos.x; this.starPos[i * 3 + 1] = tmpPos.y; this.starPos[i * 3 + 2] = tmpPos.z;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(this.starPos, 3));
    this.stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xbfd0ff, size: 1.4, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  private placeComet(c: Comet, camera: THREE.PerspectiveCamera, initial: boolean): void {
    if (initial) c.pos.set(camera.position.x + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS), range(this.rng, -FIELD_RADIUS * 0.5, FIELD_RADIUS * 0.5), camera.position.z + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS));
    else { respawnAheadXZ(c.pos, camera, FIELD_RADIUS * 0.5, FIELD_RADIUS * 0.95, Math.PI * 1.2, this.rng); c.pos.y = range(this.rng, -FIELD_RADIUS * 0.5, FIELD_RADIUS * 0.5); }
    c.scale = range(this.rng, 1.5, 5);
  }

  private writeComet(i: number, c: Comet): void {
    // cabeza
    tmpMatrix.compose(c.pos, tmpQuat.identity(), tmpScale.setScalar(c.scale));
    this.heads.setMatrixAt(i, tmpMatrix);
    // cola: orientar el eje -Y local hacia SUN_DIR (la cola huye del sol)
    tmpQuat.setFromUnitVectors(Y_AXIS, SUN_DIR);
    const len = c.scale * 9; // largo de cola proporcional a la cabeza
    tmpScale.set(c.scale * 1.6, len, c.scale * 1.6);
    tmpMatrix.compose(c.pos, tmpQuat, tmpScale);
    this.tails.setMatrixAt(i, tmpMatrix);
  }

  update(_dt: number, _elapsed: number, camera: THREE.PerspectiveCamera): void {
    let dirty = false;
    for (let i = 0; i < COMET_COUNT; i++) {
      if (isBehind(this.data[i].pos, camera, 60)) { this.placeComet(this.data[i], camera, false); this.writeComet(i, this.data[i]); dirty = true; }
    }
    if (dirty) { this.heads.instanceMatrix.needsUpdate = true; this.tails.instanceMatrix.needsUpdate = true; }
    this.stars.position.copy(camera.position);
  }
}
