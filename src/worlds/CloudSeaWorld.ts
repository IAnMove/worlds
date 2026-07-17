import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';

/**
 * CLOUD SEA — vuelo sereno sobre un mar de nubes al amanecer. Una capa de
 * nubes (plano con shader de ruido fBm) pegada bajo la camara + una cupula
 * de cielo con sol naciente. Cero geometria animada en CPU.
 */

const CLOUD_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const CLOUD_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uLow;
uniform vec3 uHigh;
uniform vec3 uSun;
varying vec3 vWorld;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
}
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.0; a*=0.5; } return v; }
void main(){
  vec2 uv = vWorld.xz * 0.0038 + vec2(uTime*0.012, uTime*0.007);
  float n = fbm(uv);
  // relieve: comparar con una muestra desplazada hacia el sol da cimas iluminadas
  // y flancos en sombra, asi las nubes tienen volumen en vez de un velo plano
  float nl = fbm(uv + vec2(0.05, 0.03));
  float relief = clamp((n - nl) * 7.0 + 0.5, 0.0, 1.0);
  float clouds = smoothstep(0.42, 0.80, n);
  vec3 col = mix(uLow, uHigh, clouds * (0.35 + 0.65 * relief));
  col += uSun * pow(clouds, 3.0) * relief * 0.35;      // borde calido en las cimas al sol
  // huecos entre nubes: se asoma un cielo mas frio y profundo
  vec3 gap = mix(uLow * 0.55, vec3(0.22, 0.24, 0.36), 0.5);
  col = mix(gap, col, smoothstep(0.30, 0.52, n));
  float d = distance(vWorld.xz, uCamPos.xz);
  float fade = 1.0 - exp(-pow(d * 0.0012, 2.0));
  col = mix(col, uHigh, fade);
  gl_FragColor = vec4(col, 1.0);
}`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSun;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y*0.5+0.5, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.7));
  vec3 sunDir = normalize(vec3(0.55, 0.10, -1.0));
  float s = distance(d, sunDir);
  col = mix(col, uSun, smoothstep(0.11, 0.04, s));
  col += uSun * smoothstep(0.55, 0.09, s) * 0.28;
  gl_FragColor = vec4(col, 1.0);
}`;

export class CloudSeaWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 30,
    clearColor: 0xe0a074,
    fogDensity: 0.0009,
    bloom: { strength: 0.45, radius: 0.9, threshold: 0.72 },
    cameraStart: new THREE.Vector3(0, 30, 0),
    bounds: { minY: 14, maxY: 90, margin: 22 },
  };

  private clouds!: THREE.Mesh;
  private cloudU!: { [k: string]: THREE.IUniform };
  private sky!: THREE.Mesh;

  init(): void {
    this.cloudU = {
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uLow: { value: new THREE.Color(0x7a4028) },
      uHigh: { value: new THREE.Color(0xe6bf90) },
      uSun: { value: new THREE.Color(0xffb264) },
    };
    const geo = new THREE.PlaneGeometry(3000, 3000);
    geo.rotateX(-Math.PI / 2);
    this.clouds = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, uniforms: this.cloudU,
    }));
    this.clouds.frustumCulled = false;
    this.scene.add(this.clouds);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
        uniforms: {
          uHorizon: { value: new THREE.Color(0xffc98a) },
          uZenith: { value: new THREE.Color(0x2a4a8c) },
          uSun: { value: new THREE.Color(0xfff1d0) },
        },
      }),
    );
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  update(_dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.cloudU.uTime.value = elapsed;
    (this.cloudU.uCamPos.value as THREE.Vector3).copy(camera.position);
    this.clouds.position.set(camera.position.x, 8, camera.position.z);
    this.sky.position.copy(camera.position);
  }
}
