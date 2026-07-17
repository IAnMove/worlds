import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { makeGlowSprite } from './utils/sprites';

/**
 * BINARY STAR — un sistema estelar doble: dos soles de distinto color orbitan
 * un centro comun mientras derivas por el campo de estrellas. Sus superficies
 * hierven (granulacion en shader) y un puente de plasma en espiral transfiere
 * masa de la enana a la gigante. El sistema sigue a la camara (nunca se alcanza).
 */

const STAR_COUNT = 2200;
const BRIDGE_COUNT = 320;

const SUN_VERT = /* glsl */ `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const SUN_FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uColor; uniform vec3 uHot;
varying vec3 vDir;
float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float noise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }
float fbm(vec3 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.0; a*=0.5;} return v; }
void main(){
  float n = fbm(vDir*4.0 + vec3(0.0, 0.0, uTime*0.18));
  float gran = fbm(vDir*9.0 - uTime*0.12);
  vec3 col = mix(uColor, uHot, pow(gran, 1.5));
  col *= 0.65 + 0.65*n;
  gl_FragColor = vec4(col, 1.0);
}`;

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpPerp1 = new THREE.Vector3();
const tmpPerp2 = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

interface Sun { core: THREE.Mesh; halo: THREE.Mesh; radius: number; phase: number; pos: THREE.Vector3; }

export class BinaryStarWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 20,
    clearColor: 0x02030b,
    fogDensity: 0.0003,
    bloom: { strength: 1.0, radius: 0.9, threshold: 0.55 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private readonly rng = createRng(20025);
  private system!: THREE.Group;
  private readonly suns: Sun[] = [];
  private stars!: THREE.Points;
  private readonly sunTime: THREE.IUniform = { value: 0 };
  private bridge!: THREE.Points;
  private bridgePos!: Float32Array;
  private readonly bridgeT: number[] = [];
  private readonly bridgeAng: number[] = [];
  private readonly bridgeR: number[] = [];

  init(): void {
    this.system = new THREE.Group();
    this.scene.add(this.system);

    const specs = [
      { color: 0x9ec8ff, hot: 0xf0f6ff, halo: 0x3a5aff, radius: 60, phase: 0 },
      { color: 0xffb35a, hot: 0xffe6b0, halo: 0xff5a1e, radius: 46, phase: Math.PI },
    ];
    for (const s of specs) {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(s.radius, 48, 48),
        new THREE.ShaderMaterial({ vertexShader: SUN_VERT, fragmentShader: SUN_FRAG, uniforms: { uTime: this.sunTime, uColor: { value: new THREE.Color(s.color) }, uHot: { value: new THREE.Color(s.hot) } } }),
      );
      const halo = new THREE.Mesh(new THREE.SphereGeometry(s.radius * 2.4, 32, 32), new THREE.MeshBasicMaterial({ color: s.halo, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      this.system.add(core, halo);
      this.suns.push({ core, halo, radius: s.radius, phase: s.phase, pos: new THREE.Vector3() });
    }

    // Puente de plasma: particulas que espiralan de la enana a la gigante
    this.bridgePos = new Float32Array(BRIDGE_COUNT * 3);
    for (let i = 0; i < BRIDGE_COUNT; i++) {
      this.bridgeT.push(this.rng());
      this.bridgeAng.push(range(this.rng, 0, Math.PI * 2));
      this.bridgeR.push(range(this.rng, 6, 22));
    }
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.BufferAttribute(this.bridgePos, 3));
    this.bridge = new THREE.Points(bgeo, new THREE.PointsMaterial({ map: makeGlowSprite(), color: 0xffd089, size: 6, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.bridge.frustumCulled = false;
    this.system.add(this.bridge);

    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      tmpVec.set(range(this.rng, -1, 1), range(this.rng, -1, 1), range(this.rng, -1, 1)).normalize().multiplyScalar(range(this.rng, 400, 850));
      positions[i * 3] = tmpVec.x; positions[i * 3 + 1] = tmpVec.y; positions[i * 3 + 2] = tmpVec.z;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.5, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  update(_dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.system.position.set(camera.position.x - 120, camera.position.y + 30, camera.position.z - 620);
    this.stars.position.copy(camera.position);
    this.sunTime.value = elapsed;

    const orbit = elapsed * 0.25;
    for (const s of this.suns) {
      const a = orbit + s.phase;
      const r = 150;
      s.pos.set(Math.cos(a) * r, Math.sin(a) * r * 0.35, Math.sin(a) * r);
      s.core.position.copy(s.pos);
      s.halo.position.copy(s.pos);
      const pulse = 1 + Math.sin(elapsed * 1.5 + s.phase) * 0.06;
      s.core.scale.setScalar(pulse);
      s.halo.scale.setScalar(pulse);
    }

    // Puente en espiral de la enana (suns[1]) a la gigante (suns[0])
    tmpA.copy(this.suns[1].pos);
    tmpB.copy(this.suns[0].pos);
    tmpDir.subVectors(tmpB, tmpA);
    const span = tmpDir.length() || 1;
    tmpDir.normalize();
    tmpPerp1.crossVectors(tmpDir, UP).normalize();
    tmpPerp2.crossVectors(tmpDir, tmpPerp1).normalize();
    const p = this.bridgePos;
    for (let i = 0; i < BRIDGE_COUNT; i++) {
      const t = (this.bridgeT[i] + elapsed * 0.14) % 1;
      const ang = this.bridgeAng[i] + t * 7.0;                 // espiral
      const rad = this.bridgeR[i] * Math.sin(t * Math.PI) * (0.4 + 0.6 * (span / 300));
      tmpVec.copy(tmpA).lerp(tmpB, t);
      tmpVec.addScaledVector(tmpPerp1, Math.cos(ang) * rad);
      tmpVec.addScaledVector(tmpPerp2, Math.sin(ang) * rad);
      p[i * 3] = tmpVec.x; p[i * 3 + 1] = tmpVec.y; p[i * 3 + 2] = tmpVec.z;
    }
    this.bridge.geometry.attributes.position.needsUpdate = true;
  }
}
