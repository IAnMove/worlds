import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { distanceXZ, respawnAheadXZ, wrapAround } from '../core/utils/recycle';

/**
 * VOLCANO — vuelo sobre un mar de lava con espiras de roca y erupciones que
 * escupen luz. El suelo es un shader emisivo de grietas que fluye; las
 * erupciones son un pool de luces que saltan a un punto y estallan.
 */

const SPIRE_COUNT = 120;
const SPIRE_RADIUS = 520;
const EMBER_COUNT = 800;
const EMBER_HALF = 80;
const ERUPT_COUNT = 3;

const LAVA_VERT = /* glsl */ `
varying vec3 vWorld;
void main(){ vec4 w = modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;

const LAVA_FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uCamPos; uniform vec3 uFog; uniform float uFogDensity;
varying vec3 vWorld;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.0+vec2(uTime*0.05,0.0); a*=0.5;} return v; }
void main(){
  vec2 uv = vWorld.xz*0.01;
  float n = fbm(uv + vec2(0.0, uTime*0.08));
  float crust = smoothstep(0.35,0.55,n);          // roca oscura solida
  float glow = pow(1.0-crust, 2.0);                // grietas incandescentes
  vec3 rock = vec3(0.05,0.02,0.02);
  vec3 hot = mix(vec3(1.0,0.25,0.03), vec3(1.0,0.85,0.3), glow);
  vec3 col = mix(hot*1.4, rock, crust);
  float d = distance(vWorld, uCamPos);
  float fog = 1.0 - exp(-pow(d*uFogDensity,2.0));
  col = mix(col, uFog, fog);
  gl_FragColor = vec4(col,1.0);
}`;

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface Spire { pos: THREE.Vector3; h: number; yaw: number; }
interface Erupt { light: THREE.PointLight; pos: THREE.Vector3; timer: number; peak: number; }

export class VolcanoWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 32,
    clearColor: 0x1a0805,
    fogDensity: 0.0055,
    bloom: { strength: 1.0, radius: 0.75, threshold: 0.5 },
    cameraStart: new THREE.Vector3(0, 20, 0),
    bounds: { minY: 10, maxY: 120, margin: 22 },
  };

  private readonly rng = createRng(66613);
  private ground!: THREE.Mesh;
  private groundU!: { [k: string]: THREE.IUniform };
  private spires!: THREE.InstancedMesh;
  private readonly spireData: Spire[] = [];
  private embers!: THREE.Points;
  private emberPos!: Float32Array;
  private readonly erupts: Erupt[] = [];

  init(camera: THREE.PerspectiveCamera): void {
    this.scene.add(new THREE.AmbientLight(0x3a1408, 0.7));
    const key = new THREE.DirectionalLight(0xff6a2a, 0.6);
    key.position.set(0, 1, 0.3).normalize();
    this.scene.add(key);

    this.groundU = {
      uTime: { value: 0 }, uCamPos: { value: new THREE.Vector3() },
      uFog: { value: new THREE.Color(this.config.clearColor) }, uFogDensity: { value: this.config.fogDensity },
    };
    const geo = new THREE.PlaneGeometry(3000, 3000);
    geo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: LAVA_VERT, fragmentShader: LAVA_FRAG, uniforms: this.groundU }));
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);

    const sgeo = new THREE.CylinderGeometry(0.4, 1, 1, 6);
    sgeo.translate(0, 0.5, 0);
    this.spires = new THREE.InstancedMesh(sgeo, new THREE.MeshStandardMaterial({ color: 0x140a08, roughness: 1, metalness: 0, flatShading: true, emissive: 0x2a0a02, emissiveIntensity: 0.5 }), SPIRE_COUNT);
    this.spires.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.spires.frustumCulled = false;
    for (let i = 0; i < SPIRE_COUNT; i++) {
      const s: Spire = { pos: new THREE.Vector3(), h: 0, yaw: 0 };
      this.spireData.push(s);
      this.placeSpire(s, camera, true);
      this.writeSpire(i, s);
    }
    this.spires.instanceMatrix.needsUpdate = true;
    this.scene.add(this.spires);

    this.emberPos = new Float32Array(EMBER_COUNT * 3);
    for (let i = 0; i < EMBER_COUNT; i++) {
      this.emberPos[i * 3] = camera.position.x + range(this.rng, -EMBER_HALF, EMBER_HALF);
      this.emberPos[i * 3 + 1] = range(this.rng, 2, EMBER_HALF);
      this.emberPos[i * 3 + 2] = camera.position.z + range(this.rng, -EMBER_HALF, EMBER_HALF);
    }
    const egeo = new THREE.BufferGeometry();
    egeo.setAttribute('position', new THREE.BufferAttribute(this.emberPos, 3));
    this.embers = new THREE.Points(egeo, new THREE.PointsMaterial({ color: 0xff8a3a, size: 1.5, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.embers.frustumCulled = false;
    this.scene.add(this.embers);

    for (let i = 0; i < ERUPT_COUNT; i++) {
      const light = new THREE.PointLight(0xff7a2a, 0, 260, 2);
      this.scene.add(light);
      this.erupts.push({ light, pos: new THREE.Vector3(), timer: range(this.rng, 0.2, 2.5), peak: 0 });
    }
  }

  private placeSpire(s: Spire, camera: THREE.PerspectiveCamera, initial: boolean): void {
    if (initial) s.pos.set(camera.position.x + range(this.rng, -SPIRE_RADIUS, SPIRE_RADIUS), 0, camera.position.z + range(this.rng, -SPIRE_RADIUS, SPIRE_RADIUS));
    else { respawnAheadXZ(s.pos, camera, SPIRE_RADIUS * 0.5, SPIRE_RADIUS * 0.95, Math.PI * 0.95, this.rng); s.pos.y = 0; }
    s.h = range(this.rng, 18, 70);
    s.yaw = range(this.rng, 0, Math.PI);
  }

  private writeSpire(i: number, s: Spire): void {
    tmpQuat.setFromAxisAngle(Y_AXIS, s.yaw);
    tmpScale.set(s.h * 0.18, s.h, s.h * 0.18);
    tmpMatrix.compose(s.pos, tmpQuat, tmpScale);
    this.spires.setMatrixAt(i, tmpMatrix);
  }

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.groundU.uTime.value = elapsed;
    (this.groundU.uCamPos.value as THREE.Vector3).copy(camera.position);
    this.ground.position.set(camera.position.x, 0, camera.position.z);

    let dirty = false;
    for (let i = 0; i < SPIRE_COUNT; i++) {
      if (distanceXZ(this.spireData[i].pos, camera) > SPIRE_RADIUS) { this.placeSpire(this.spireData[i], camera, false); this.writeSpire(i, this.spireData[i]); dirty = true; }
    }
    if (dirty) this.spires.instanceMatrix.needsUpdate = true;

    const p = this.emberPos;
    for (let i = 0; i < EMBER_COUNT; i++) {
      p[i * 3 + 1] += dt * range(this.rng, 4, 10);
      if (p[i * 3 + 1] > EMBER_HALF) p[i * 3 + 1] = 2;
      p[i * 3] = wrapAround(p[i * 3], camera.position.x, EMBER_HALF);
      p[i * 3 + 2] = wrapAround(p[i * 3 + 2], camera.position.z, EMBER_HALF);
    }
    this.embers.geometry.attributes.position.needsUpdate = true;

    for (const e of this.erupts) {
      e.timer -= dt;
      if (e.timer <= 0 && e.peak <= 0) {
        // nueva erupcion delante, en el suelo
        respawnAheadXZ(e.pos, camera, 80, SPIRE_RADIUS * 0.6, Math.PI * 0.8, this.rng);
        e.pos.y = 8;
        e.light.position.copy(e.pos);
        e.peak = 1;
      }
      if (e.peak > 0) {
        e.peak -= dt * 1.2;
        e.light.intensity = Math.max(0, e.peak) * 5000;
        if (e.peak <= 0) { e.light.intensity = 0; e.timer = range(this.rng, 0.6, 3.0); }
      }
    }
  }
}
