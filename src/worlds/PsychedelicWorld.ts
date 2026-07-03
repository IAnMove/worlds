import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { isBehind, respawnAheadXZ } from '../core/utils/recycle';

/**
 * PSYCHEDELIC SPACE — viaje abstracto e infinito.
 *
 * ESTADO: placeholder de la tarea 0. Las tareas 5 y 6 lo convierten en el
 * tunel onirico definitivo: deformacion por vertex shader, particulas
 * organicas, fractales sencillos y luces dinamicas.
 */

const RING_COUNT = 90;
const RING_SPACING = 14;
const BLOB_COUNT = 400;
const FIELD_RADIUS = 300;

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();
const tmpForward = new THREE.Vector3();

export class PsychedelicWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 34,
    clearColor: 0x0a0114,
    fogDensity: 0.011,
    bloom: { strength: 1.3, radius: 0.9, threshold: 0.3 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private readonly rng = createRng(777);
  private rings!: THREE.InstancedMesh;
  /** Distancia (en "anillos" recorridos) de cada anillo; define su posicion y color. */
  private readonly ringPositions: THREE.Vector3[] = [];
  private blobs!: THREE.InstancedMesh;
  private readonly blobPositions: THREE.Vector3[] = [];
  private readonly blobPhases = new Float32Array(BLOB_COUNT);

  init(camera: THREE.PerspectiveCamera): void {
    // --- Anillos del tunel: se colocan hacia delante y se reciclan al pasar ---
    const ringGeo = new THREE.TorusGeometry(9, 0.35, 8, 48);
    const ringMat = new THREE.MeshBasicMaterial({ toneMapped: true });
    this.rings = new THREE.InstancedMesh(ringGeo, ringMat, RING_COUNT);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    camera.getWorldDirection(tmpForward);
    for (let i = 0; i < RING_COUNT; i++) {
      const pos = new THREE.Vector3()
        .copy(camera.position)
        .addScaledVector(tmpForward, i * RING_SPACING)
        .add(
          new THREE.Vector3(
            range(this.rng, -3, 3),
            range(this.rng, -3, 3),
            range(this.rng, -3, 3),
          ),
        );
      this.ringPositions.push(pos);
    }
    this.scene.add(this.rings);

    // --- Blobs organicos flotando alrededor del tunel ---
    const blobGeo = new THREE.IcosahedronGeometry(1, 1);
    const blobMat = new THREE.MeshBasicMaterial({ toneMapped: true });
    this.blobs = new THREE.InstancedMesh(blobGeo, blobMat, BLOB_COUNT);
    this.blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < BLOB_COUNT; i++) {
      this.blobPositions.push(
        new THREE.Vector3(
          camera.position.x + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS),
          camera.position.y + range(this.rng, -60, 60),
          camera.position.z + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS),
        ),
      );
      this.blobPhases[i] = range(this.rng, 0, Math.PI * 2);
    }
    this.scene.add(this.blobs);
  }

  update(_dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    camera.getWorldDirection(tmpForward);

    // Anillos: los que quedan detras saltan al frente de la fila.
    // Color ciclando por matiz: cada anillo respira su propio arcoiris.
    for (let i = 0; i < RING_COUNT; i++) {
      const pos = this.ringPositions[i];
      if (isBehind(pos, camera, RING_SPACING)) {
        pos
          .copy(camera.position)
          .addScaledVector(tmpForward, RING_COUNT * RING_SPACING * 0.98)
          .add(
            new THREE.Vector3(
              range(this.rng, -6, 6),
              range(this.rng, -6, 6),
              range(this.rng, -6, 6),
            ),
          );
      }
      // Orientar el anillo perpendicular al rumbo, con un giro lento propio
      tmpEuler.set(tmpForward.y * -1.2, Math.atan2(tmpForward.x, tmpForward.z), elapsed * 0.3 + i);
      tmpQuat.setFromEuler(tmpEuler);
      const pulse = 1 + Math.sin(elapsed * 2 + i * 0.7) * 0.06;
      tmpMatrix.compose(pos, tmpQuat, tmpScale.setScalar(pulse));
      this.rings.setMatrixAt(i, tmpMatrix);
      tmpColor.setHSL((elapsed * 0.05 + i * 0.023) % 1, 0.9, 0.55);
      this.rings.setColorAt(i, tmpColor);
    }
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;

    // Blobs: flotan con ondas suaves y se reciclan al alejarse
    for (let i = 0; i < BLOB_COUNT; i++) {
      const pos = this.blobPositions[i];
      if (pos.distanceTo(camera.position) > FIELD_RADIUS) {
        respawnAheadXZ(pos, camera, FIELD_RADIUS * 0.4, FIELD_RADIUS * 0.9, Math.PI * 1.2, this.rng);
        pos.y = camera.position.y + range(this.rng, -60, 60);
      }
      const phase = this.blobPhases[i];
      const bob = Math.sin(elapsed * 0.8 + phase) * 1.5;
      const scale = 1.2 + Math.sin(elapsed * 1.3 + phase * 2) * 0.5;
      tmpQuat.setFromEuler(tmpEuler.set(elapsed * 0.2 + phase, phase, 0));
      tmpMatrix.compose(posWithBob.set(pos.x, pos.y + bob, pos.z), tmpQuat, tmpScale.setScalar(scale));
      this.blobs.setMatrixAt(i, tmpMatrix);
      tmpColor.setHSL((0.7 + Math.sin(phase) * 0.3 + elapsed * 0.02) % 1, 0.85, 0.5);
      this.blobs.setColorAt(i, tmpColor);
    }
    this.blobs.instanceMatrix.needsUpdate = true;
    if (this.blobs.instanceColor) this.blobs.instanceColor.needsUpdate = true;
  }
}

const posWithBob = new THREE.Vector3();
