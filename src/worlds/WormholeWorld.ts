import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';

/**
 * WORMHOLE — caida infinita por un agujero de gusano. El tubo va pegado a la
 * camara y lo que fluye es la coordenada de muestreo del shader (uScroll =
 * distancia recorrida); las estrellas se estiran alrededor en su vertex shader.
 */

const TUBE_RADIUS = 20;
const TUBE_LENGTH = 520;
const STAR_COUNT = 2500;
const STAR_HALF = 40;

const TUBE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const TUBE_FRAG = /* glsl */ `
uniform float uScroll;
uniform float uTime;
uniform vec3 uFog;
varying vec2 vUv;
void main() {
  float v = vUv.y * 24.0 - uScroll * 0.06;
  float u = vUv.x * 12.566;
  // Bandas espirales de energia
  float swirl = sin(u + v * 2.0 + uTime) * 0.5 + 0.5;
  float rings = smoothstep(0.75, 1.0, sin(v * 3.0) * 0.5 + 0.5);
  vec3 a = vec3(0.28, 0.08, 0.7);
  vec3 b = vec3(0.08, 0.55, 0.75);
  vec3 col = mix(a, b, swirl) * (0.14 + rings * 0.8);
  col += vec3(0.5, 0.25, 0.9) * pow(swirl, 4.0) * 0.4;
  // Se oscurece hacia el fondo del tubo (lejos en v)
  float depth = clamp(vUv.y, 0.0, 1.0);
  col = mix(uFog, col, smoothstep(0.0, 0.45, depth));
  gl_FragColor = vec4(col, 1.0);
}`;

const tmpForward = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class WormholeWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 60,
    clearColor: 0x03010a,
    fogDensity: 0.004,
    bloom: { strength: 0.85, radius: 0.8, threshold: 0.55 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private readonly rng = createRng(4242);
  private tube!: THREE.Mesh;
  private uniforms!: { [k: string]: THREE.IUniform };
  private stars!: THREE.Points;
  private starPositions!: Float32Array;
  private traveled = 0;
  private readonly prevCam = new THREE.Vector3();

  init(camera: THREE.PerspectiveCamera): void {
    this.prevCam.copy(camera.position);
    const geo = new THREE.CylinderGeometry(TUBE_RADIUS, TUBE_RADIUS, TUBE_LENGTH, 64, 120, true);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, TUBE_LENGTH * 0.32);
    this.uniforms = {
      uScroll: { value: 0 },
      uTime: { value: 0 },
      uFog: { value: new THREE.Color(this.config.clearColor) },
    };
    this.tube = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG, uniforms: this.uniforms, side: THREE.BackSide,
    }));
    this.tube.frustumCulled = false;
    this.scene.add(this.tube);

    this.starPositions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      this.starPositions[i * 3] = camera.position.x + range(this.rng, -STAR_HALF, STAR_HALF);
      this.starPositions[i * 3 + 1] = camera.position.y + range(this.rng, -STAR_HALF, STAR_HALF);
      this.starPositions[i * 3 + 2] = camera.position.z + range(this.rng, -STAR_HALF, STAR_HALF);
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(this.starPositions, 3));
    this.stars = new THREE.Points(sgeo, new THREE.PointsMaterial({
      color: 0xaad4ff, size: 1.4, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.traveled += this.prevCam.distanceTo(camera.position);
    this.prevCam.copy(camera.position);
    this.uniforms.uScroll.value = this.traveled;
    this.uniforms.uTime.value = elapsed;
    camera.getWorldDirection(tmpForward);
    this.tube.position.copy(camera.position);
    tmpQuat.setFromUnitVectors(Z_AXIS, tmpForward);
    this.tube.quaternion.slerp(tmpQuat, 1 - Math.exp(-3 * dt));

    // Envoltura de estrellas alrededor de la camara
    const p = this.starPositions;
    for (let i = 0; i < STAR_COUNT; i++) {
      const o = i * 3;
      for (let a = 0; a < 3; a++) {
        const c = camera.position.getComponent(a);
        if (p[o + a] - c > STAR_HALF) p[o + a] -= STAR_HALF * 2;
        else if (p[o + a] - c < -STAR_HALF) p[o + a] += STAR_HALF * 2;
      }
    }
    this.stars.geometry.attributes.position.needsUpdate = true;
    this.stars.position.set(0, 0, 0);
  }
}
