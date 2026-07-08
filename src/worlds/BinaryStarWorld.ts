import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';

/**
 * BINARY STAR — un sistema estelar doble: dos soles de distinto color orbitan
 * un centro comun mientras derivas por el campo de estrellas. El sistema se
 * mantiene lejano (sigue a la camara) para que nunca se alcance.
 */

const STAR_COUNT = 2200;

const tmpVec = new THREE.Vector3();

interface Sun { core: THREE.Mesh; halo: THREE.Mesh; radius: number; phase: number; }

export class BinaryStarWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 20,
    clearColor: 0x02030b,
    fogDensity: 0.0003,
    bloom: { strength: 1.0, radius: 0.9, threshold: 0.5 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private readonly rng = createRng(20025);
  private system!: THREE.Group;
  private readonly suns: Sun[] = [];
  private stars!: THREE.Points;

  init(): void {
    this.system = new THREE.Group();
    this.scene.add(this.system);

    const specs = [
      { color: 0x9ec8ff, halo: 0x3a5aff, radius: 60, phase: 0 },
      { color: 0xffb35a, halo: 0xff5a1e, radius: 46, phase: Math.PI },
    ];
    for (const s of specs) {
      const core = new THREE.Mesh(new THREE.SphereGeometry(s.radius, 48, 48), new THREE.MeshBasicMaterial({ color: s.color, fog: false }));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(s.radius * 2.4, 32, 32), new THREE.MeshBasicMaterial({ color: s.halo, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      this.system.add(core, halo);
      this.suns.push({ core, halo, radius: s.radius, phase: s.phase });
    }

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
    // El sistema binario, lejano y por delante
    this.system.position.set(camera.position.x - 120, camera.position.y + 30, camera.position.z - 620);
    this.stars.position.copy(camera.position);

    const orbit = elapsed * 0.25;
    for (const s of this.suns) {
      const a = orbit + s.phase;
      const r = 150;
      tmpVec.set(Math.cos(a) * r, Math.sin(a) * r * 0.35, Math.sin(a) * r);
      s.core.position.copy(tmpVec);
      s.halo.position.copy(tmpVec);
      const pulse = 1 + Math.sin(elapsed * 1.5 + s.phase) * 0.06;
      s.core.scale.setScalar(pulse);
      s.halo.scale.setScalar(pulse);
    }
  }
}
