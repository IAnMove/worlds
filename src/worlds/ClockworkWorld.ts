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

const GEAR_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }`;
const GEAR_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5; float r = length(p)*2.0; float a = atan(p.y, p.x);
  const float TEETH = 14.0;
  float tooth = 0.5 + 0.5*cos(a*TEETH);
  float outer = 0.80 + tooth*0.18;
  if(r > outer) discard;
  float ring = 0.6 + 0.4*sin(r*20.0);
  vec3 col = uColor * (0.45 + 0.55*r) * ring;
  float hub = smoothstep(0.18, 0.14, r);
  col = mix(col, uColor*1.5, hub);
  float spokes = smoothstep(0.85, 1.0, abs(cos(a*3.0))) * step(0.2, r) * step(r, 0.7);
  col += uColor*0.4*spokes;
  col += vec3(1.0, 0.85, 0.5) * smoothstep(outer-0.06, outer, r) * 0.7; // borde brillante
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
    clearColor: 0x140d05,
    fogDensity: 0.0011,
    bloom: { strength: 0.85, radius: 0.7, threshold: 0.55 },
    cameraStart: new THREE.Vector3(0, 6, 0),
  };

  private readonly rng = createRng(160934);
  private gears!: THREE.InstancedMesh;
  private readonly data: Gear[] = [];

  init(camera: THREE.PerspectiveCamera): void {
    const geo = new THREE.CircleGeometry(1, 48);
    this.gears = new THREE.InstancedMesh(
      geo,
      new THREE.ShaderMaterial({ vertexShader: GEAR_VERT, fragmentShader: GEAR_FRAG, uniforms: { uColor: { value: new THREE.Color(0xd9a441) } }, side: THREE.DoubleSide }),
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
