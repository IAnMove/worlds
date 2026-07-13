import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { makeGlowSprite } from './utils/sprites';

/**
 * SPIRAL GALAXY — vuelo a traves de una galaxia espiral. Todo es un unico
 * Points (cientos de miles de estrellas gastarian memoria; con ~24k y color
 * por vertice basta). La galaxia gira despacio como un disco solido.
 */

const STAR_COUNT = 24000;
const ARMS = 4;
const GALAXY_RADIUS = 900;

const tmpColor = new THREE.Color();

export class GalaxyWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 34,
    clearColor: 0x02030a,
    fogDensity: 0.0006,
    bloom: { strength: 0.6, radius: 0.8, threshold: 0.65 },
    cameraStart: new THREE.Vector3(0, 150, 430),
  };

  private readonly rng = createRng(7777);
  private galaxy!: THREE.Points;
  private nebula!: THREE.Points;

  init(): void {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const core = new THREE.Color(0xfff2c8);
    const mid = new THREE.Color(0xff9d5c);
    const edge = new THREE.Color(0x6a9bff);

    for (let i = 0; i < STAR_COUNT; i++) {
      // Distribucion hacia el centro (mas densa) + brazo espiral
      const t = Math.pow(this.rng(), 1.7);
      const radius = t * GALAXY_RADIUS;
      const arm = Math.floor(this.rng() * ARMS) / ARMS * Math.PI * 2;
      const spin = radius * 0.006;
      const spread = (1 - t) * 0.35 + 0.05;
      const angle = arm + spin + range(this.rng, -spread, spread);
      const jitterY = range(this.rng, -1, 1) * (18 + (1 - t) * 90);

      positions[i * 3] = Math.cos(angle) * radius + range(this.rng, -12, 12);
      positions[i * 3 + 1] = jitterY;
      positions[i * 3 + 2] = Math.sin(angle) * radius + range(this.rng, -12, 12);

      tmpColor.copy(core).lerp(mid, Math.min(1, t * 1.6));
      if (t > 0.55) tmpColor.lerp(edge, (t - 0.55) / 0.45);
      const b = range(this.rng, 0.7, 1.1);
      colors[i * 3] = tmpColor.r * b;
      colors[i * 3 + 1] = tmpColor.g * b;
      colors[i * 3 + 2] = tmpColor.b * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.galaxy = new THREE.Points(geo, new THREE.PointsMaterial({
      map: makeGlowSprite(), size: 2.4, vertexColors: true, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false,
    }));
    this.galaxy.frustumCulled = false;
    this.scene.add(this.galaxy);

    // Neblina de los brazos: pocos sprites enormes y muy tenues dan el volumen
    const NEBULA_COUNT = 70;
    const npos = new Float32Array(NEBULA_COUNT * 3);
    const ncol = new Float32Array(NEBULA_COUNT * 3);
    const pink = new THREE.Color(0xff7a9c);
    const blue = new THREE.Color(0x5a86ff);
    const amber = new THREE.Color(0xffc27a);
    for (let i = 0; i < NEBULA_COUNT; i++) {
      const t = 0.15 + 0.75 * Math.pow(this.rng(), 1.4);
      const radius = t * GALAXY_RADIUS;
      const arm = Math.floor(this.rng() * ARMS) / ARMS * Math.PI * 2;
      const angle = arm + radius * 0.006 + range(this.rng, -0.12, 0.12);
      npos[i * 3] = Math.cos(angle) * radius;
      npos[i * 3 + 1] = range(this.rng, -1, 1) * (10 + (1 - t) * 50);
      npos[i * 3 + 2] = Math.sin(angle) * radius;
      tmpColor.copy(t < 0.4 ? amber : this.rng() < 0.5 ? pink : blue);
      tmpColor.toArray(ncol, i * 3);
    }
    const ngeo = new THREE.BufferGeometry();
    ngeo.setAttribute('position', new THREE.BufferAttribute(npos, 3));
    ngeo.setAttribute('color', new THREE.BufferAttribute(ncol, 3));
    this.nebula = new THREE.Points(ngeo, new THREE.PointsMaterial({
      map: makeGlowSprite(128, 0.25), size: 130, vertexColors: true, transparent: true, opacity: 0.10,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false,
    }));
    this.nebula.frustumCulled = false;
    this.scene.add(this.nebula);

    // Bulbo central: un halo grande y suave
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(55, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    halo.frustumCulled = false;
    this.scene.add(halo);
  }

  update(_dt: number, elapsed: number): void {
    // Rotacion de disco solido, muy lenta
    this.galaxy.rotation.y = elapsed * 0.03;
    this.nebula.rotation.y = elapsed * 0.03;
  }
}
