import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';

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
    bloom: { strength: 0.7, radius: 0.9, threshold: 0.6 },
    cameraStart: new THREE.Vector3(0, 150, 430),
  };

  private readonly rng = createRng(7777);
  private galaxy!: THREE.Points;

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
      size: 1.5, vertexColors: true, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false,
    }));
    this.galaxy.frustumCulled = false;
    this.scene.add(this.galaxy);

    // Bulbo central: un halo grande y suave
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(45, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    halo.frustumCulled = false;
    this.scene.add(halo);
  }

  update(_dt: number, elapsed: number): void {
    // Rotacion de disco solido, muy lenta
    this.galaxy.rotation.y = elapsed * 0.03;
  }
}
