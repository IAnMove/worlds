import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';

/**
 * EMISSION NEBULA — atraviesas una nube de gas incandescente. Raymarching
 * volumetrico en un quad a pantalla completa: se acumula emision a lo largo
 * del rayo muestreando un campo de ruido 3D desplazado por la posicion de la
 * camara (asi el vuelo te lleva a traves de la nebulosa).
 */

const FS_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec3 uRo, uFwd, uRight, uUp;
varying vec2 vUv;
float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float noise(vec3 p){
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float n000=hash(i), n100=hash(i+vec3(1,0,0)), n010=hash(i+vec3(0,1,0)), n110=hash(i+vec3(1,1,0));
  float n001=hash(i+vec3(0,0,1)), n101=hash(i+vec3(1,0,1)), n011=hash(i+vec3(0,1,1)), n111=hash(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y), mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y), f.z);
}
float fbm(vec3 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.0+7.0; a*=0.5; } return v; }
void main(){
  vec2 uv = vUv-0.5; uv.x *= uRes.x/uRes.y;
  vec3 rd = normalize(uFwd + uRight*uv.x*1.1 + uUp*uv.y*1.1);
  vec3 col = vec3(0.0);
  float t = 0.0;
  for(int i=0;i<34;i++){
    vec3 p = (uRo + rd*t) * 0.012;
    float d = fbm(p + vec3(0.0, 0.0, uTime*0.02));
    d = smoothstep(0.45, 0.85, d);
    // color segun densidad: magenta -> naranja -> azul frio
    vec3 tint = mix(vec3(0.7,0.1,0.5), vec3(1.0,0.5,0.2), d);
    tint = mix(tint, vec3(0.2,0.4,0.9), smoothstep(0.5,1.0,fbm(p*0.5)));
    col += tint * d * 0.06;
    t += 6.0;
  }
  // estrellas de fondo
  vec3 sc = floor(rd*260.0);
  float star = step(0.995, hash(sc)) ;
  col += vec3(0.9,0.95,1.0) * star * 0.8;
  gl_FragColor = vec4(col, 1.0);
}`;

const tmpFwd = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class NebulaWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 26,
    clearColor: 0x040108,
    fogDensity: 0.0001,
    bloom: { strength: 0.9, radius: 0.9, threshold: 0.5 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private uniforms!: { [k: string]: THREE.IUniform };

  init(): void {
    this.uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
      uRo: { value: new THREE.Vector3() }, uFwd: { value: new THREE.Vector3(0, 0, -1) },
      uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) },
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
    this.uniforms.uTime.value = elapsed;
    (this.uniforms.uRes.value as THREE.Vector2).set(window.innerWidth, window.innerHeight);
    camera.getWorldDirection(tmpFwd);
    tmpRight.crossVectors(tmpFwd, WORLD_UP).normalize();
    if (tmpRight.lengthSq() < 0.01) tmpRight.set(1, 0, 0);
    tmpUp.crossVectors(tmpRight, tmpFwd).normalize();
    (this.uniforms.uRo.value as THREE.Vector3).copy(camera.position);
    (this.uniforms.uFwd.value as THREE.Vector3).copy(tmpFwd);
    (this.uniforms.uRight.value as THREE.Vector3).copy(tmpRight);
    (this.uniforms.uUp.value as THREE.Vector3).copy(tmpUp);
  }
}
