import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';

/**
 * KALEIDOSCOPE — simetria radial sobre un patron de ruido animado (quad a
 * pantalla completa, efecto 2D puro). El rumbo de la camara desplaza y gira
 * el patron, asi el vuelo y el raton siguen teniendo efecto.
 */

const FS_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uPan; uniform float uRot;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.0+1.3; a*=0.5;} return v; }
void main(){
  vec2 uv = vUv-0.5; uv.x *= uRes.x/uRes.y;
  // a polar
  float r = length(uv);
  float a = atan(uv.y, uv.x) + uRot;
  // plegado en N sectores (simetria de espejo)
  const float N = 8.0;
  a = mod(a, 6.28318/N);
  a = abs(a - 3.14159/N);
  vec2 k = vec2(cos(a), sin(a)) * r;
  // patron animado
  vec2 p = k*3.5 + uPan + vec2(uTime*0.1, 0.0);
  float n = fbm(p + fbm(p*1.5 - uTime*0.05));
  float rings = 0.5+0.5*sin(r*24.0 - uTime*1.5);
  vec3 col = 0.5+0.5*cos(vec3(0.0,2.1,4.2) + n*5.0 + uTime*0.3);
  col *= mix(0.6, 1.2, rings);
  col *= smoothstep(0.9, 0.1, r);      // vineta suave
  gl_FragColor = vec4(col, 1.0);
}`;

const tmpFwd = new THREE.Vector3();

export class KaleidoscopeWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 6,
    clearColor: 0x000000,
    fogDensity: 0.0001,
    bloom: { strength: 0.8, radius: 0.8, threshold: 0.55 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private uniforms!: { [k: string]: THREE.IUniform };
  private traveled = 0;
  private readonly prevCam = new THREE.Vector3();

  init(camera: THREE.PerspectiveCamera): void {
    this.prevCam.copy(camera.position);
    this.uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uPan: { value: new THREE.Vector2() },
      uRot: { value: 0 },
    };
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: FRAG, uniforms: this.uniforms, depthTest: false, depthWrite: false }),
    );
    quad.frustumCulled = false;
    quad.renderOrder = -1;
    this.scene.add(quad);
  }

  update(_dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.traveled += this.prevCam.distanceTo(camera.position);
    this.prevCam.copy(camera.position);
    this.uniforms.uTime.value = elapsed;
    (this.uniforms.uRes.value as THREE.Vector2).set(window.innerWidth, window.innerHeight);
    camera.getWorldDirection(tmpFwd);
    (this.uniforms.uPan.value as THREE.Vector2).set(this.traveled * 0.02, Math.atan2(tmpFwd.x, tmpFwd.z));
    this.uniforms.uRot.value = elapsed * 0.05 + tmpFwd.y;
  }
}
