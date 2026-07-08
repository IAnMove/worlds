import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';

/**
 * LAVA LAMP — metaballs que se funden y separan (raymarching en quad a
 * pantalla completa). Los blobs flotan delante; la orientacion de la camara
 * mueve la mirada. Superficie iridiscente por su normal.
 */

const FS_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec3 uFwd, uRight, uUp;
varying vec2 vUv;
float smin(float a, float b, float k){ float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0); return mix(b,a,h)-k*h*(1.0-h); }
vec3 blob(int i){ float f=float(i);
  return vec3(sin(uTime*0.6+f*1.3)*3.2, cos(uTime*0.45+f*2.1)*2.6, sin(uTime*0.5+f)*2.4 - 9.0); }
float de(vec3 p){ float d=20.0; for(int i=0;i<6;i++){ d=smin(d, length(p-blob(i))-1.7, 1.5); } return d; }
vec3 normal(vec3 p){ vec2 e=vec2(0.002,0.0);
  return normalize(vec3(de(p+e.xyy)-de(p-e.xyy), de(p+e.yxy)-de(p-e.yxy), de(p+e.yyx)-de(p-e.yyx))); }
void main(){
  vec2 uv = vUv-0.5; uv.x *= uRes.x/uRes.y;
  vec3 rd = normalize(uFwd + uRight*uv.x*1.15 + uUp*uv.y*1.15);
  vec3 ro = vec3(0.0);
  float t=0.0; bool hit=false;
  for(int i=0;i<56;i++){ vec3 p=ro+rd*t; float d=de(p); if(d<0.002){hit=true;break;} t+=d; if(t>30.0) break; }
  vec3 col = vec3(0.03, 0.01, 0.05);
  if(hit){
    vec3 p=ro+rd*t; vec3 n=normal(p);
    float fres = pow(1.0-max(dot(n,-rd),0.0), 2.0);
    // color iridiscente segun la normal
    vec3 ir = 0.5+0.5*cos(vec3(0.0,2.0,4.0) + n.x*3.0 + n.y*2.0 + uTime*0.5);
    col = ir*0.7 + fres*vec3(1.0,0.6,1.0);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const tmpFwd = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class MetaballWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 8,
    clearColor: 0x08020f,
    fogDensity: 0.0001,
    bloom: { strength: 0.9, radius: 0.85, threshold: 0.5 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private uniforms!: { [k: string]: THREE.IUniform };

  init(): void {
    this.uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uFwd: { value: new THREE.Vector3(0, 0, -1) },
      uRight: { value: new THREE.Vector3(1, 0, 0) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
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
    (this.uniforms.uFwd.value as THREE.Vector3).copy(tmpFwd);
    (this.uniforms.uRight.value as THREE.Vector3).copy(tmpRight);
    (this.uniforms.uUp.value as THREE.Vector3).copy(tmpUp);
  }
}
