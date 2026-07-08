import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range, pick } from '../core/utils/random';
import { distanceXZ, respawnAheadXZ } from '../core/utils/recycle';

/**
 * CIRCUIT BOARD — sobrevuelas una placa base infinita: pistas de cobre que
 * brillan, pads y pulsos de datos corriendo por la rejilla (shader). Los
 * chips son un InstancedMesh reciclado.
 */

const CHIP_COUNT = 90;
const CHIP_RADIUS = 480;

const PCB_VERT = /* glsl */ `varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const PCB_FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uCamPos; uniform vec3 uFog; uniform float uFogDensity;
varying vec3 vWorld;
float line(vec2 c){ vec2 g=abs(fract(c-0.5)-0.5)/fwidth(c); return 1.0-min(min(g.x,g.y),1.0); }
void main(){
  vec3 col = vec3(0.01, 0.05, 0.03);            // sustrato verde oscuro
  vec2 uv = vWorld.xz;
  float fine = line(uv/6.0);
  float trace = line(uv/24.0);
  col += vec3(0.0, 0.5, 0.3) * fine * 0.15;
  col += vec3(0.1, 0.9, 0.5) * trace * 0.5;     // pistas de cobre
  // Pulsos de datos: viajan a lo largo de las pistas verticales
  float pulse = smoothstep(0.9, 1.0, sin(uv.y*0.25 - uTime*4.0)) * trace;
  col += vec3(0.4, 1.0, 0.7) * pulse;
  // Pads: puntos brillantes en la interseccion de la rejilla gruesa
  vec2 pad = abs(fract(uv/24.0)-0.5);
  float dot = smoothstep(0.06, 0.0, length(pad));
  col += vec3(0.6, 1.0, 0.8) * dot * (0.5 + 0.5*sin(uTime*2.0 + uv.x));
  float d = distance(vWorld, uCamPos);
  col = mix(col, uFog, 1.0 - exp(-pow(d*uFogDensity,2.0)));
  gl_FragColor = vec4(col, 1.0);
}`;

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const CHIP_COLORS = [0x0a0a0a, 0x141414, 0x1a1408];

interface Chip { pos: THREE.Vector3; w: number; d: number; h: number; yaw: number; }

export class CircuitWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 34,
    clearColor: 0x020a06,
    fogDensity: 0.0022,
    bloom: { strength: 1.0, radius: 0.7, threshold: 0.5 },
    cameraStart: new THREE.Vector3(0, 22, 0),
    bounds: { minY: 10, maxY: 90, margin: 20 },
  };

  private readonly rng = createRng(555001);
  private board!: THREE.Mesh;
  private boardU!: { [k: string]: THREE.IUniform };
  private chips!: THREE.InstancedMesh;
  private readonly data: Chip[] = [];

  init(camera: THREE.PerspectiveCamera): void {
    this.scene.add(new THREE.AmbientLight(0x2a4a3a, 0.8));
    const key = new THREE.DirectionalLight(0x9affd0, 0.7);
    key.position.set(0.2, 1, 0.3).normalize();
    this.scene.add(key);

    this.boardU = { uTime: { value: 0 }, uCamPos: { value: new THREE.Vector3() }, uFog: { value: new THREE.Color(this.config.clearColor) }, uFogDensity: { value: this.config.fogDensity } };
    const gg = new THREE.PlaneGeometry(3000, 3000);
    gg.rotateX(-Math.PI / 2);
    this.board = new THREE.Mesh(gg, new THREE.ShaderMaterial({ vertexShader: PCB_VERT, fragmentShader: PCB_FRAG, uniforms: this.boardU }));
    this.board.frustumCulled = false;
    this.scene.add(this.board);

    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    this.chips = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.3, flatShading: true }), CHIP_COUNT);
    this.chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chips.frustumCulled = false;
    for (let i = 0; i < CHIP_COUNT; i++) {
      const c: Chip = { pos: new THREE.Vector3(), w: 0, d: 0, h: 0, yaw: 0 };
      this.data.push(c);
      this.placeChip(c, camera, true);
      this.writeChip(i, c);
      tmpColor.setHex(pick(this.rng, CHIP_COLORS));
      this.chips.setColorAt(i, tmpColor);
    }
    this.chips.instanceMatrix.needsUpdate = true;
    if (this.chips.instanceColor) this.chips.instanceColor.needsUpdate = true;
    this.scene.add(this.chips);
  }

  private placeChip(c: Chip, camera: THREE.PerspectiveCamera, initial: boolean): void {
    if (initial) c.pos.set(camera.position.x + range(this.rng, -CHIP_RADIUS, CHIP_RADIUS), 0, camera.position.z + range(this.rng, -CHIP_RADIUS, CHIP_RADIUS));
    else { respawnAheadXZ(c.pos, camera, CHIP_RADIUS * 0.5, CHIP_RADIUS * 0.95, Math.PI * 0.95, this.rng); c.pos.y = 0; }
    c.w = range(this.rng, 12, 40);
    c.d = range(this.rng, 12, 40);
    c.h = range(this.rng, 3, 10);
    c.yaw = Math.floor(this.rng() * 4) * (Math.PI / 2);
  }

  private writeChip(i: number, c: Chip): void {
    tmpQuat.setFromAxisAngle(Y_AXIS, c.yaw);
    tmpScale.set(c.w, c.h, c.d);
    tmpMatrix.compose(c.pos, tmpQuat, tmpScale);
    this.chips.setMatrixAt(i, tmpMatrix);
  }

  update(_dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.boardU.uTime.value = elapsed;
    (this.boardU.uCamPos.value as THREE.Vector3).copy(camera.position);
    this.board.position.set(camera.position.x, 0, camera.position.z);

    let dirty = false;
    for (let i = 0; i < CHIP_COUNT; i++) {
      if (distanceXZ(this.data[i].pos, camera) > CHIP_RADIUS) { this.placeChip(this.data[i], camera, false); this.writeChip(i, this.data[i]); dirty = true; }
    }
    if (dirty) this.chips.instanceMatrix.needsUpdate = true;
  }
}
