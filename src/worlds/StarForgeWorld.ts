import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { isBehind, respawnAheadXZ } from '../core/utils/recycle';
import { makeGlowSprite } from './utils/sprites';

/**
 * STAR FORGE — un vivero estelar: pilares de polvo oscuro recortados contra el
 * resplandor de una nebulosa, con estrellas recien nacidas encendiendose entre
 * ellos. Pilares = InstancedMesh reciclado; estrellas = Points envueltos.
 */

const PILLAR_COUNT = 90;
const FIELD_RADIUS = 560;
const STAR_COUNT = 1200;
const STAR_HALF = 260;

const SKY_VERT = /* glsl */ `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const SKY_FRAG = /* glsl */ `
varying vec3 vDir; uniform float uTime;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.0; a*=0.5;} return v; }
void main(){
  vec3 d = normalize(vDir);
  vec2 uv = d.xy*1.5 + d.z*0.5;
  float n = fbm(uv*2.0 + uTime*0.01);
  vec3 col = mix(vec3(0.06,0.02,0.12), vec3(0.9,0.3,0.5), smoothstep(0.4,0.9,n));
  col += vec3(0.3,0.5,0.9) * smoothstep(0.6,1.0,fbm(uv*3.0+5.0)) * 0.5;
  gl_FragColor = vec4(col, 1.0);
}`;

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface Pillar { pos: THREE.Vector3; h: number; yaw: number; }
interface Ignition { sprite: THREE.Sprite; light: THREE.PointLight; pos: THREE.Vector3; peak: number; timer: number; }

export class StarForgeWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 28,
    clearColor: 0x0a0418,
    fogDensity: 0.0022,
    bloom: { strength: 1.0, radius: 0.9, threshold: 0.5 },
    cameraStart: new THREE.Vector3(0, 30, 0),
    bounds: { minY: 12, maxY: 160, margin: 24 },
  };

  private readonly rng = createRng(70401);
  private skyU!: { [k: string]: THREE.IUniform };
  private pillars!: THREE.InstancedMesh;
  private readonly data: Pillar[] = [];
  private stars!: THREE.Points;
  private starPos!: Float32Array;
  private glow!: THREE.CanvasTexture;
  private readonly ignitions: Ignition[] = [];

  init(camera: THREE.PerspectiveCamera): void {
    this.scene.add(new THREE.AmbientLight(0x442a55, 0.9));
    const key = new THREE.DirectionalLight(0xff9ac0, 0.6);
    key.position.set(0.3, 0.4, -1).normalize();
    this.scene.add(key);

    this.skyU = { uTime: { value: 0 } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false }));
    sky.frustumCulled = false;
    this.scene.add(sky);

    const geo = new THREE.CylinderGeometry(0.5, 1.4, 1, 6);
    geo.translate(0, 0.5, 0);
    this.pillars = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x1a0e2a, roughness: 1, metalness: 0, flatShading: true, emissive: 0x2a1030, emissiveIntensity: 0.4 }), PILLAR_COUNT);
    this.pillars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pillars.frustumCulled = false;
    for (let i = 0; i < PILLAR_COUNT; i++) {
      const p: Pillar = { pos: new THREE.Vector3(), h: 0, yaw: 0 };
      this.data.push(p);
      this.placePillar(p, camera, true);
      this.writePillar(i, p);
    }
    this.pillars.instanceMatrix.needsUpdate = true;
    this.scene.add(this.pillars);

    this.starPos = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const c = new THREE.Color();
    for (let i = 0; i < STAR_COUNT; i++) {
      this.starPos[i * 3] = camera.position.x + range(this.rng, -STAR_HALF, STAR_HALF);
      this.starPos[i * 3 + 1] = range(this.rng, 6, STAR_HALF);
      this.starPos[i * 3 + 2] = camera.position.z + range(this.rng, -STAR_HALF, STAR_HALF);
      c.setHSL(range(this.rng, 0.5, 0.95), 0.5, range(this.rng, 0.6, 0.95));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(this.starPos, 3));
    sgeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ size: 2.4, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    // Estrellas recien nacidas: se encienden entre los pilares con un fogonazo.
    // La PointLight ilumina de rebote los pilares (material Standard) y los saca
    // de la silueta negra en el instante de la ignicion.
    this.glow = makeGlowSprite(128, 0.3);
    for (let i = 0; i < 3; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffe2f0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      this.scene.add(sprite);
      const light = new THREE.PointLight(0xffc8e0, 0, 360, 2);
      this.scene.add(light);
      this.ignitions.push({ sprite, light, pos: new THREE.Vector3(), peak: 0, timer: range(this.rng, 0.3, 3.2) });
    }
  }

  private placePillar(p: Pillar, camera: THREE.PerspectiveCamera, initial: boolean): void {
    if (initial) p.pos.set(camera.position.x + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS), 0, camera.position.z + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS));
    else { respawnAheadXZ(p.pos, camera, FIELD_RADIUS * 0.5, FIELD_RADIUS * 0.95, Math.PI * 0.95, this.rng); p.pos.y = 0; }
    p.h = range(this.rng, 60, 160);
    p.yaw = range(this.rng, 0, Math.PI);
  }

  private writePillar(i: number, p: Pillar): void {
    tmpQuat.setFromAxisAngle(Y_AXIS, p.yaw);
    tmpScale.set(p.h * 0.35, p.h, p.h * 0.35);
    tmpMatrix.compose(p.pos, tmpQuat, tmpScale);
    this.pillars.setMatrixAt(i, tmpMatrix);
  }

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.skyU.uTime.value = elapsed;
    let dirty = false;
    for (let i = 0; i < PILLAR_COUNT; i++) {
      if (isBehind(this.data[i].pos, camera, 80)) { this.placePillar(this.data[i], camera, false); this.writePillar(i, this.data[i]); dirty = true; }
    }
    if (dirty) this.pillars.instanceMatrix.needsUpdate = true;

    for (const g of this.ignitions) {
      g.timer -= dt;
      if (g.timer <= 0 && g.peak <= 0) {
        respawnAheadXZ(g.pos, camera, 70, FIELD_RADIUS * 0.6, Math.PI * 0.9, this.rng);
        g.pos.y = range(this.rng, 24, 130);
        g.light.position.copy(g.pos);
        g.sprite.position.copy(g.pos);
        g.peak = 1;
      }
      if (g.peak > 0) {
        g.peak -= dt * 0.75;
        const p = Math.max(0, g.peak);
        g.light.intensity = p * 5200;
        g.sprite.scale.setScalar(30 + (1 - p) * 70);
        (g.sprite.material as THREE.SpriteMaterial).opacity = p;
        if (g.peak <= 0) { g.light.intensity = 0; (g.sprite.material as THREE.SpriteMaterial).opacity = 0; g.timer = range(this.rng, 0.6, 3.6); }
      }
    }

    const p = this.starPos;
    for (let i = 0; i < STAR_COUNT; i++) {
      if (p[i * 3] - camera.position.x > STAR_HALF) p[i * 3] -= STAR_HALF * 2;
      else if (p[i * 3] - camera.position.x < -STAR_HALF) p[i * 3] += STAR_HALF * 2;
      if (p[i * 3 + 2] - camera.position.z > STAR_HALF) p[i * 3 + 2] -= STAR_HALF * 2;
      else if (p[i * 3 + 2] - camera.position.z < -STAR_HALF) p[i * 3 + 2] += STAR_HALF * 2;
    }
    this.stars.geometry.attributes.position.needsUpdate = true;
  }
}
