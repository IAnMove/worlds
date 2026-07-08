import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';

/**
 * PULSAR — una estrella de neutrones gira barriendo el vacio con dos haces de
 * luz opuestos, como un faro cosmico. Nucleo brillante + dos conos emisivos
 * que rotan sobre un eje inclinado, dentro de un campo de estrellas denso.
 */

const STAR_COUNT = 3000;

const tmpVec = new THREE.Vector3();

export class PulsarWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 18,
    clearColor: 0x02020a,
    fogDensity: 0.0004,
    bloom: { strength: 1.15, radius: 0.9, threshold: 0.45 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private readonly rng = createRng(19677);
  private system!: THREE.Group;
  private core!: THREE.Mesh;
  private beams!: THREE.Group;
  private stars!: THREE.Points;

  init(): void {
    this.system = new THREE.Group();
    this.scene.add(this.system);

    this.core = new THREE.Mesh(new THREE.SphereGeometry(16, 32, 32), new THREE.MeshBasicMaterial({ color: 0xdaf0ff, fog: false }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 24), new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.system.add(this.core, halo);

    // Dos haces opuestos: conos largos y estrechos, muy translucidos
    this.beams = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x8ac0ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const beamGeo = new THREE.ConeGeometry(60, 520, 24, 1, true);
    for (const sign of [1, -1]) {
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = sign * 260;
      if (sign < 0) beam.rotation.z = Math.PI; // apuntar al lado opuesto
      this.beams.add(beam);
    }
    this.beams.rotation.z = 0.5; // eje magnetico inclinado
    this.system.add(this.beams);

    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      tmpVec.set(range(this.rng, -1, 1), range(this.rng, -1, 1), range(this.rng, -1, 1)).normalize().multiplyScalar(range(this.rng, 350, 820));
      positions[i * 3] = tmpVec.x; positions[i * 3 + 1] = tmpVec.y; positions[i * 3 + 2] = tmpVec.z;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.4, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  update(_dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.system.position.set(camera.position.x, camera.position.y + 20, camera.position.z - 340);
    this.stars.position.copy(camera.position);
    this.beams.rotation.y = elapsed * 2.2;                    // barrido rapido del faro
    const flash = 0.9 + Math.sin(elapsed * 4.4) * 0.1;
    (this.core.material as THREE.MeshBasicMaterial).color.setRGB(flash, flash, 1.0);
  }
}
