import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { isBehind, respawnAheadXZ } from '../core/utils/recycle';

/**
 * CLOCKWORK — campo de engranajes de laton girando, un mecanismo infinito por
 * el que vuelas. Los dientes, radios y cubo se dibujan en el fragment shader
 * de un disco; girar la instancia hace girar el patron con ella.
 */

const GEAR_COUNT = 150;
const FIELD_RADIUS = 300;

const GEAR_VERT = /* glsl */ `
attribute float aSeed;
varying vec2 vUv; varying vec3 vWorld; varying float vSeed;
void main(){
  vUv=uv; vSeed=aSeed;
  vec4 w = modelMatrix * instanceMatrix * vec4(position,1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const GEAR_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor; uniform vec3 uFog; uniform float uFogDensity; uniform vec3 uCamPos;
varying vec2 vUv; varying vec3 vWorld; varying float vSeed;
void main(){
  vec2 p = vUv - 0.5; float r = length(p)*2.0; float a = atan(p.y, p.x);
  float teeth = 12.0 + floor(vSeed*4.0)*2.0;
  float tooth = 0.5 + 0.5*cos(a*teeth + vSeed*6.28318);
  float outer = 0.80 + tooth*0.18;
  if(r > outer) discard;
  // ventanas caladas entre los radios: se ve a traves del engranaje
  float spokeMask = abs(cos(a*3.0 + vSeed*3.14159));
  if(r > 0.30 && r < 0.60 && spokeMask < 0.72) discard;
  // metal por semilla: laton / cobre / acero
  vec3 metal = uColor;
  metal = mix(metal, vec3(0.72,0.35,0.18), step(0.62, vSeed));
  metal = mix(metal, vec3(0.45,0.44,0.48), step(0.85, vSeed));
  float ring = 0.75 + 0.25*sin(r*24.0 + vSeed*10.0);
  vec3 col = metal * (0.30 + 0.45*r) * ring;
  float hub = smoothstep(0.20, 0.15, r);
  col = mix(col, metal*1.1, hub);
  col += vec3(1.0, 0.85, 0.5) * smoothstep(outer-0.05, outer, r) * 0.35; // borde
  // niebla manual (ShaderMaterial ignora la niebla de la escena)
  float d = distance(vWorld, uCamPos);
  col = mix(col, uFog, 1.0 - exp(-pow(d*uFogDensity, 2.0)));
  gl_FragColor = vec4(col, 1.0);
}`;

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

interface Gear { pos: THREE.Vector3; radius: number; angle: number; speed: number; }

export class ClockworkWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 22,
    clearColor: 0x0e0903,
    fogDensity: 0.0024,
    bloom: { strength: 0.45, radius: 0.6, threshold: 0.8 },
    cameraStart: new THREE.Vector3(0, 6, 0),
  };

  private readonly rng = createRng(160934);
  private gears!: THREE.InstancedMesh;
  private uniforms!: { [k: string]: THREE.IUniform };
  private readonly data: Gear[] = [];

  init(camera: THREE.PerspectiveCamera): void {
    const geo = new THREE.CircleGeometry(1, 48);
    const seeds = new Float32Array(GEAR_COUNT);
    for (let i = 0; i < GEAR_COUNT; i++) seeds[i] = this.rng();
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    this.uniforms = {
      uColor: { value: new THREE.Color(0xd9a441) },
      uFog: { value: new THREE.Color(this.config.clearColor) },
      uFogDensity: { value: this.config.fogDensity },
      uCamPos: { value: new THREE.Vector3() },
    };
    this.gears = new THREE.InstancedMesh(
      geo,
      new THREE.ShaderMaterial({ vertexShader: GEAR_VERT, fragmentShader: GEAR_FRAG, uniforms: this.uniforms, side: THREE.DoubleSide }),
      GEAR_COUNT,
    );
    this.gears.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gears.frustumCulled = false;
    for (let i = 0; i < GEAR_COUNT; i++) {
      const g: Gear = { pos: new THREE.Vector3(), radius: 0, angle: 0, speed: 0 };
      this.data.push(g);
      this.placeGear(g, camera, true);
    }
    this.scene.add(this.gears);
  }

  private placeGear(g: Gear, camera: THREE.PerspectiveCamera, initial: boolean): void {
    if (initial) g.pos.set(camera.position.x + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS), range(this.rng, -45, 55), camera.position.z + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS));
    else { respawnAheadXZ(g.pos, camera, FIELD_RADIUS * 0.35, FIELD_RADIUS * 0.85, Math.PI * 0.9, this.rng); g.pos.y = range(this.rng, -45, 55); }
    g.radius = range(this.rng, 10, 40);
    g.angle = range(this.rng, 0, Math.PI * 2);
    g.speed = range(this.rng, 0.2, 0.9) * (this.rng() < 0.5 ? -1 : 1);
  }

  update(dt: number, _elapsed: number, camera: THREE.PerspectiveCamera): void {
    (this.uniforms.uCamPos.value as THREE.Vector3).copy(camera.position);
    for (let i = 0; i < GEAR_COUNT; i++) {
      const g = this.data[i];
      if (isBehind(g.pos, camera, 50)) this.placeGear(g, camera, false);
      g.angle += g.speed * dt;
      tmpQuat.setFromAxisAngle(Z_AXIS, g.angle);
      tmpMatrix.compose(g.pos, tmpQuat, tmpScale.setScalar(g.radius));
      this.gears.setMatrixAt(i, tmpMatrix);
    }
    this.gears.instanceMatrix.needsUpdate = true;
  }
}
