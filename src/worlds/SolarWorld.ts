import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { respawnAheadXZ } from '../core/utils/recycle';
import { makeGlowSprite } from './utils/sprites';

/**
 * SOLAR SURFACE — vuelo rasante sobre el plasma del sol. El suelo es un shader
 * de granulacion turbulenta (celdas de conveccion con carriles oscuros) que
 * fluye; las erupciones encienden la superficie (hotspot en el shader) y lanzan
 * una prominencia de luz que se eleva. Cielo de corona.
 *
 * Nota: el suelo es un ShaderMaterial y NO recibe luces de la escena, asi que
 * las erupciones se dibujan dentro del shader (uFlare) + un sprite aditivo.
 */

const FLARE_COUNT = 4;

const SUN_VERT = /* glsl */ `varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const SUN_FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uCamPos; uniform vec3 uFog; uniform float uFogDensity;
uniform vec3 uFlare[${FLARE_COUNT}];   // xy = posicion mundo (x,z), z = intensidad
varying vec3 vWorld;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.0+vec2(uTime*0.12,uTime*0.07); a*=0.5;} return v; }
void main(){
  vec2 uv = vWorld.xz*0.02;
  float n = fbm(uv);
  float cell = fbm(uv*2.6 + 12.0);                 // granulos de conveccion
  float lane = abs(fbm(uv*1.7 + 3.0) - 0.5);       // carriles intergranulares
  vec3 deep = vec3(0.32, 0.04, 0.01);
  vec3 mid  = vec3(1.0, 0.42, 0.06);
  vec3 hot  = vec3(1.0, 0.86, 0.46);
  vec3 col = mix(deep, mid, smoothstep(0.18, 0.72, n));
  col = mix(col, hot, pow(cell, 2.6));             // puntos calientes de los granulos
  col *= 0.45 + smoothstep(0.06, 0.24, lane) * 0.55; // oscurece los carriles = contraste
  // Erupciones: hotspot que enciende la superficie
  for(int i=0;i<${FLARE_COUNT};i++){
    float inten = uFlare[i].z;
    if(inten <= 0.0) continue;
    float d = distance(vWorld.xz, uFlare[i].xy);
    col += vec3(1.0, 0.78, 0.42) * inten * exp(-d*d*0.00007);
  }
  float d = distance(vWorld, uCamPos);
  col = mix(col, uFog, 1.0-exp(-pow(d*uFogDensity,2.0)));
  gl_FragColor = vec4(col, 1.0);
}`;

const SKY_VERT = /* glsl */ `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const SKY_FRAG = /* glsl */ `varying vec3 vDir; uniform vec3 uA; uniform vec3 uB; uniform float uTime;
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y*0.5+0.5, 0.0, 1.0);
  vec3 col = mix(uA, uB, h);
  // corona: velo tenue que tiembla cerca del horizonte
  float veil = pow(1.0-h, 3.0) * (0.6 + 0.4*sin(atan(d.z,d.x)*8.0 + uTime*0.5));
  col += vec3(1.0, 0.5, 0.15) * veil * 0.18;
  gl_FragColor = vec4(col, 1.0);
}`;

interface Flare { sprite: THREE.Sprite; pos: THREE.Vector3; peak: number; timer: number; }

export class SolarWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 40,
    clearColor: 0x2a0803,
    fogDensity: 0.0016,
    bloom: { strength: 0.85, radius: 0.8, threshold: 0.74 },
    cameraStart: new THREE.Vector3(0, 24, 0),
    bounds: { minY: 14, maxY: 120, margin: 22 },
  };

  private readonly rng = createRng(30303);
  private ground!: THREE.Mesh;
  private groundU!: { [k: string]: THREE.IUniform };
  private glow!: THREE.CanvasTexture;
  private readonly flares: Flare[] = [];

  init(): void {
    this.groundU = {
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uFog: { value: new THREE.Color(this.config.clearColor) },
      uFogDensity: { value: this.config.fogDensity },
      uFlare: { value: Array.from({ length: FLARE_COUNT }, () => new THREE.Vector3()) },
    };
    const gg = new THREE.PlaneGeometry(3000, 3000);
    gg.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(gg, new THREE.ShaderMaterial({ vertexShader: SUN_VERT, fragmentShader: SUN_FRAG, uniforms: this.groundU }));
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
      uniforms: { uA: { value: new THREE.Color(0xff6a1e) }, uB: { value: new THREE.Color(0x1e0402) }, uTime: this.groundU.uTime },
    }));
    sky.frustumCulled = false;
    this.scene.add(sky);

    // Prominencias: sprite aditivo por erupcion que se eleva y se apaga
    this.glow = makeGlowSprite(128, 0.28);
    for (let i = 0; i < FLARE_COUNT; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glow, color: 0xffb060, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      sprite.scale.setScalar(1);
      this.scene.add(sprite);
      this.flares.push({ sprite, pos: new THREE.Vector3(), peak: 0, timer: range(this.rng, 0.2, 2.4) });
    }
  }

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.groundU.uTime.value = elapsed;
    (this.groundU.uCamPos.value as THREE.Vector3).copy(camera.position);
    this.ground.position.set(camera.position.x, 0, camera.position.z);

    const flareU = this.groundU.uFlare.value as THREE.Vector3[];
    for (let i = 0; i < this.flares.length; i++) {
      const f = this.flares[i];
      f.timer -= dt;
      if (f.timer <= 0 && f.peak <= 0) {
        respawnAheadXZ(f.pos, camera, 80, 520, Math.PI * 0.8, this.rng);
        f.pos.y = 8;
        f.peak = 1;
      }
      if (f.peak > 0) {
        f.peak -= dt * 1.1;
        const p = Math.max(0, f.peak);
        // hotspot en la superficie (xy = xz del mundo, z = intensidad)
        flareU[i].set(f.pos.x, f.pos.z, p * 1.3);
        // prominencia: crece y se eleva a medida que se apaga
        const rise = 1 - p;
        f.sprite.position.set(f.pos.x, 8 + rise * 70, f.pos.z);
        f.sprite.scale.setScalar(40 + rise * 120);
        (f.sprite.material as THREE.SpriteMaterial).opacity = p * 0.9;
        if (f.peak <= 0) { flareU[i].z = 0; f.timer = range(this.rng, 0.5, 2.8); (f.sprite.material as THREE.SpriteMaterial).opacity = 0; }
      } else {
        flareU[i].z = 0;
      }
    }
  }
}
