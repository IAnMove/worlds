import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { respawnAheadXZ } from '../core/utils/recycle';

/**
 * SOLAR SURFACE — vuelo rasante sobre el plasma del sol. El suelo es un shader
 * de granulacion turbulenta que fluye; las erupciones son un pool de luces que
 * estallan sobre la superficie. Cielo de corona.
 */

const FLARE_COUNT = 4;

const SUN_VERT = /* glsl */ `varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const SUN_FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uCamPos; uniform vec3 uFog; uniform float uFogDensity;
varying vec3 vWorld;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.0+vec2(uTime*0.1,uTime*0.06); a*=0.5;} return v; }
void main(){
  vec2 uv = vWorld.xz*0.02;
  float n = fbm(uv);
  float cell = fbm(uv*3.0 + 10.0);
  vec3 hot = vec3(1.0, 0.9, 0.4);
  vec3 deep = vec3(0.7, 0.12, 0.02);
  vec3 col = mix(deep, hot, pow(n, 1.5));
  col += hot * pow(cell, 3.0) * 0.6;              // granulos brillantes
  float d = distance(vWorld, uCamPos);
  col = mix(col, uFog, 1.0-exp(-pow(d*uFogDensity,2.0)));
  gl_FragColor = vec4(col*0.95, 1.0);
}`;

const SKY_VERT = /* glsl */ `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const SKY_FRAG = /* glsl */ `varying vec3 vDir; uniform vec3 uA; uniform vec3 uB;
void main(){ float h=clamp(normalize(vDir).y*0.5+0.5,0.0,1.0); gl_FragColor=vec4(mix(uA,uB,h),1.0); }`;

interface Flare { light: THREE.PointLight; pos: THREE.Vector3; peak: number; timer: number; }

export class SolarWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 40,
    clearColor: 0x2a0803,
    fogDensity: 0.0016,
    bloom: { strength: 0.8, radius: 0.8, threshold: 0.72 },
    cameraStart: new THREE.Vector3(0, 24, 0),
    bounds: { minY: 14, maxY: 120, margin: 22 },
  };

  private readonly rng = createRng(30303);
  private ground!: THREE.Mesh;
  private groundU!: { [k: string]: THREE.IUniform };
  private readonly flares: Flare[] = [];

  init(): void {
    this.scene.add(new THREE.AmbientLight(0xff9a4a, 1.0));

    this.groundU = { uTime: { value: 0 }, uCamPos: { value: new THREE.Vector3() }, uFog: { value: new THREE.Color(this.config.clearColor) }, uFogDensity: { value: this.config.fogDensity } };
    const gg = new THREE.PlaneGeometry(3000, 3000);
    gg.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(gg, new THREE.ShaderMaterial({ vertexShader: SUN_VERT, fragmentShader: SUN_FRAG, uniforms: this.groundU }));
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
      uniforms: { uA: { value: new THREE.Color(0xff6a1e) }, uB: { value: new THREE.Color(0x2a0602) } },
    }));
    sky.frustumCulled = false;
    this.scene.add(sky);

    for (let i = 0; i < FLARE_COUNT; i++) {
      const light = new THREE.PointLight(0xffc060, 0, 320, 2);
      this.scene.add(light);
      this.flares.push({ light, pos: new THREE.Vector3(), peak: 0, timer: range(this.rng, 0.2, 2.4) });
    }
  }

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.groundU.uTime.value = elapsed;
    (this.groundU.uCamPos.value as THREE.Vector3).copy(camera.position);
    this.ground.position.set(camera.position.x, 0, camera.position.z);

    for (const f of this.flares) {
      f.timer -= dt;
      if (f.timer <= 0 && f.peak <= 0) {
        respawnAheadXZ(f.pos, camera, 60, 500, Math.PI * 0.8, this.rng);
        f.pos.y = 10;
        f.light.position.copy(f.pos);
        f.peak = 1;
      }
      if (f.peak > 0) {
        f.peak -= dt * 1.1;
        f.light.intensity = Math.max(0, f.peak) * 6000;
        if (f.peak <= 0) { f.light.intensity = 0; f.timer = range(this.rng, 0.5, 2.8); }
      }
    }
  }
}
