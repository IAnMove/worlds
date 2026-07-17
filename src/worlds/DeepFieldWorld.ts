import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { wrapAround } from '../core/utils/recycle';

/**
 * DEEP FIELD — a la deriva por el espacio profundo, entre galaxias lejanas.
 * Cada galaxia es un punto grande dibujado por su shader (disco con nucleo y
 * un guino espiral); se envuelven alrededor de la camara. Negro y sereno.
 */

const GALAXY_COUNT = 820;
const HALF = 520;

const VERT = /* glsl */ `
uniform float uSize;
attribute float aSeed; attribute vec3 aColor;
varying vec3 vColor; varying float vSeed;
void main(){
  vColor = aColor; vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (300.0 / -mv.z) * (0.5 + aSeed);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vColor; varying float vSeed;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float r = length(uv);
  if(r > 0.5) discard;
  float glow = smoothstep(0.5, 0.0, r);
  float ang = atan(uv.y, uv.x);
  // los brazos giran despacio, cada galaxia a su ritmo y sentido
  float spin = uTime * (0.15 + vSeed*0.3) * (vSeed > 0.5 ? 1.0 : -1.0);
  float spiral = 0.55 + 0.45*sin(ang*2.0 + r*20.0 + vSeed*12.0 + spin);
  float twinkle = 0.78 + 0.22*sin(uTime*0.6 + vSeed*25.0);
  vec3 col = vColor * glow * spiral * twinkle;
  col += vColor * pow(glow, 4.0) * 0.9;   // nucleo brillante
  gl_FragColor = vec4(col, glow);
}`;

export class DeepFieldWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 16,
    clearColor: 0x010104,
    fogDensity: 0.0001,
    bloom: { strength: 0.85, radius: 0.9, threshold: 0.5 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private readonly rng = createRng(99881);
  private field!: THREE.Points;
  private positions!: Float32Array;

  init(camera: THREE.PerspectiveCamera): void {
    this.positions = new Float32Array(GALAXY_COUNT * 3);
    const seeds = new Float32Array(GALAXY_COUNT);
    const colors = new Float32Array(GALAXY_COUNT * 3);
    const c = new THREE.Color();
    for (let i = 0; i < GALAXY_COUNT; i++) {
      this.positions[i * 3] = camera.position.x + range(this.rng, -HALF, HALF);
      this.positions[i * 3 + 1] = camera.position.y + range(this.rng, -HALF, HALF);
      this.positions[i * 3 + 2] = camera.position.z + range(this.rng, -HALF, HALF);
      seeds[i] = this.rng();
      c.setHSL(range(this.rng, 0.05, 0.7), 0.5, range(this.rng, 0.55, 0.8));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.field = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uSize: { value: 14 }, uTime: { value: 0 } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.field.frustumCulled = false;
    this.scene.add(this.field);
  }

  update(_dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    (this.field.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
    const p = this.positions;
    for (let i = 0; i < GALAXY_COUNT; i++) {
      p[i * 3] = wrapAround(p[i * 3], camera.position.x, HALF);
      p[i * 3 + 1] = wrapAround(p[i * 3 + 1], camera.position.y, HALF);
      p[i * 3 + 2] = wrapAround(p[i * 3 + 2], camera.position.z, HALF);
    }
    // Solo hace falta reescribir cuando la envoltura mueve algun punto; barato
    this.field.geometry.attributes.position.needsUpdate = true;
  }
}
