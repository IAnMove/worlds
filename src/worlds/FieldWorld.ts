import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';

/**
 * GOLDEN FIELD — campo de trigo infinito meciendose al viento a la hora
 * dorada. Las briznas son un InstancedMesh cuyo vertex shader las curva con
 * el viento; el campo va pegado a la camara (patron world-coord infinito).
 */

const BLADE_COUNT = 9000;
const FIELD_HALF = 130; // media caja de siembra alrededor de la camara

const BLADE_VERT = /* glsl */ `
uniform float uTime;
attribute float aPhase;
varying float vH;
void main(){
  vH = position.y / 3.0; // altura normalizada: 0 base, 1 punta (plano de 3u)
  vec4 world = instanceMatrix * vec4(position, 1.0);
  float sway = sin(uTime*1.4 + aPhase + world.x*0.05 + world.z*0.05);
  float bend = sway * vH * vH * 2.4; // se dobla mas cuanto mas arriba
  world.x += bend;
  world.z += bend * 0.4;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const BLADE_FRAG = /* glsl */ `
varying float vH;
void main(){
  vec3 base = vec3(0.55, 0.32, 0.08);
  vec3 tip = vec3(1.0, 0.82, 0.35);
  gl_FragColor = vec4(mix(base, tip, vH), 1.0);
}`;

const SKY_VERT = /* glsl */ `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSun; varying vec3 vDir;
void main(){ vec3 d=normalize(vDir); float h=clamp(d.y*0.5+0.5,0.0,1.0);
  vec3 col=mix(uHorizon,uZenith,pow(h,0.8));
  vec3 sd=normalize(vec3(0.1,0.05,-1.0)); float s=distance(d,sd);
  col=mix(col,uSun,smoothstep(0.2,0.06,s)); col+=uSun*smoothstep(0.8,0.1,s)*0.4;
  gl_FragColor=vec4(col,1.0); }`;

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export class FieldWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 22,
    clearColor: 0xffcf8a,
    fogDensity: 0.004,
    bloom: { strength: 0.6, radius: 0.8, threshold: 0.65 },
    cameraStart: new THREE.Vector3(0, 6, 0),
    bounds: { minY: 3, maxY: 30, margin: 12 },
  };

  private readonly rng = createRng(24680);
  private blades!: THREE.InstancedMesh;
  private bladeU!: { [k: string]: THREE.IUniform };
  private ground!: THREE.Mesh;
  private sky!: THREE.Mesh;
  private readonly baseX = new Float32Array(BLADE_COUNT);
  private readonly baseZ = new Float32Array(BLADE_COUNT);

  init(camera: THREE.PerspectiveCamera): void {
    this.scene.add(new THREE.HemisphereLight(0xffe0b0, 0x4a3010, 1.0));

    const geo = new THREE.PlaneGeometry(0.18, 3, 1, 1);
    geo.translate(0, 1.5, 0); // base en y=0, altura 3, y-normalizada aprox via position.y/3 -> uso vH crudo
    // Normalizamos la altura a [0,1] escalando el atributo y en el shader via position.y/3:
    this.bladeU = { uTime: { value: 0 } };
    this.blades = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ vertexShader: BLADE_VERT, fragmentShader: BLADE_FRAG, uniforms: this.bladeU, side: THREE.DoubleSide }), BLADE_COUNT);
    this.blades.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blades.frustumCulled = false;

    const phase = new Float32Array(BLADE_COUNT);
    for (let i = 0; i < BLADE_COUNT; i++) {
      this.baseX[i] = camera.position.x + range(this.rng, -FIELD_HALF, FIELD_HALF);
      this.baseZ[i] = camera.position.z + range(this.rng, -FIELD_HALF, FIELD_HALF);
      phase[i] = range(this.rng, 0, Math.PI * 2);
      this.writeBlade(i);
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    this.blades.instanceMatrix.needsUpdate = true;
    this.scene.add(this.blades);

    // Suelo dorado bajo las briznas
    const gg = new THREE.PlaneGeometry(3000, 3000);
    gg.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ color: 0x6b4718, fog: true }));
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
      uniforms: { uHorizon: { value: new THREE.Color(0xffd89a) }, uZenith: { value: new THREE.Color(0x5a7abf) }, uSun: { value: new THREE.Color(0xfff0cf) } },
    }));
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  private writeBlade(i: number): void {
    tmpPos.set(this.baseX[i], 0, this.baseZ[i]);
    tmpQuat.setFromAxisAngle(Y_AXIS, this.rng() * Math.PI);
    tmpScale.set(1, range(this.rng, 0.7, 1.3), 1);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    this.blades.setMatrixAt(i, tmpMatrix);
  }

  update(_dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.bladeU.uTime.value = elapsed;
    this.ground.position.set(camera.position.x, 0, camera.position.z);
    this.sky.position.copy(camera.position);

    // Resiembra: las briznas que quedan lejos se recolocan alrededor de la camara
    let dirty = false;
    for (let i = 0; i < BLADE_COUNT; i++) {
      let moved = false;
      if (this.baseX[i] - camera.position.x > FIELD_HALF) { this.baseX[i] -= FIELD_HALF * 2; moved = true; }
      else if (this.baseX[i] - camera.position.x < -FIELD_HALF) { this.baseX[i] += FIELD_HALF * 2; moved = true; }
      if (this.baseZ[i] - camera.position.z > FIELD_HALF) { this.baseZ[i] -= FIELD_HALF * 2; moved = true; }
      else if (this.baseZ[i] - camera.position.z < -FIELD_HALF) { this.baseZ[i] += FIELD_HALF * 2; moved = true; }
      if (moved) { this.writeBlade(i); dirty = true; }
    }
    if (dirty) this.blades.instanceMatrix.needsUpdate = true;
  }
}
