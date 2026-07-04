import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { distanceXZ, respawnAheadXZ } from '../core/utils/recycle';

/**
 * DATA CITY — ciudad infinita de informacion (azul / blanco / cian).
 *
 * ESTADO: placeholder de la tarea 0. Vuela y recicla, pero es la version
 * minima. Las tareas 1 y 2 lo convierten en la ciudad espectacular:
 * rascacielos con ventanas emisivas, grid infinito real, puentes,
 * paquetes de datos viajando por lineas de conexion.
 *
 * El patron de reciclado de este archivo (posiciones en array + respawnAheadXZ)
 * es la referencia a seguir en el resto de mundos.
 */

const BUILDING_COUNT = 700;
const CITY_RADIUS = 420; // si un edificio queda mas lejos que esto, se recicla delante

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();

export class DataCityWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 28,
    clearColor: 0x020714,
    fogDensity: 0.0065,
    bloom: { strength: 0.9, radius: 0.7, threshold: 0.55 },
    cameraStart: new THREE.Vector3(0, 26, 0),
    // Colliders blandos: ni bajo el suelo ni perderse por encima de la ciudad
    bounds: { minY: 7, maxY: 190, margin: 24 },
  };

  private readonly rng = createRng(1337);
  private buildings!: THREE.InstancedMesh;
  /** Posicion (base) y escala de cada instancia; la verdad vive aqui, no en la matriz. */
  private readonly positions: THREE.Vector3[] = [];
  private readonly scales: THREE.Vector3[] = [];
  private grid!: THREE.GridHelper;

  init(camera: THREE.PerspectiveCamera): void {
    // --- Edificios instanciados: una geometria, un material, un draw call ---
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0); // origen en la base para escalar en altura
    const mat = new THREE.MeshBasicMaterial({ toneMapped: true });
    this.buildings = new THREE.InstancedMesh(geo, mat, BUILDING_COUNT);
    this.buildings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < BUILDING_COUNT; i++) {
      const pos = new THREE.Vector3(
        camera.position.x + range(this.rng, -CITY_RADIUS, CITY_RADIUS),
        0,
        camera.position.z + range(this.rng, -CITY_RADIUS, CITY_RADIUS),
      );
      const scale = new THREE.Vector3(
        range(this.rng, 4, 14),
        range(this.rng, 8, 90),
        range(this.rng, 4, 14),
      );
      this.positions.push(pos);
      this.scales.push(scale);
      this.writeInstance(i);
      // Paleta: azules profundos con torres cian brillantes ocasionales
      const bright = this.rng() < 0.12;
      tmpColor.setHSL(0.55 + this.rng() * 0.06, 1, bright ? 0.65 : 0.06 + this.rng() * 0.08);
      this.buildings.setColorAt(i, tmpColor);
    }
    this.buildings.instanceMatrix.needsUpdate = true;
    if (this.buildings.instanceColor) this.buildings.instanceColor.needsUpdate = true;
    this.scene.add(this.buildings);

    // --- Suelo: grid ciberespacio. Se recoloca bajo la camara cada frame ---
    this.grid = new THREE.GridHelper(2400, 120, 0x00ffff, 0x0a2a4a);
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.35;
    this.scene.add(this.grid);
  }

  update(_dt: number, _elapsed: number, camera: THREE.PerspectiveCamera): void {
    // El grid persigue a la camara saltando de celda en celda (20 = 2400/120):
    // al ser periodico, el salto es invisible y parece infinito.
    const cell = 20;
    this.grid.position.x = Math.round(camera.position.x / cell) * cell;
    this.grid.position.z = Math.round(camera.position.z / cell) * cell;

    // Reciclado: lo que queda fuera del radio reaparece delante del rumbo
    let dirty = false;
    for (let i = 0; i < BUILDING_COUNT; i++) {
      const pos = this.positions[i];
      if (distanceXZ(pos, camera) > CITY_RADIUS) {
        respawnAheadXZ(pos, camera, CITY_RADIUS * 0.55, CITY_RADIUS * 0.98, Math.PI * 0.9, this.rng);
        this.writeInstance(i);
        dirty = true;
      }
    }
    if (dirty) this.buildings.instanceMatrix.needsUpdate = true;
  }

  private writeInstance(i: number): void {
    tmpMatrix.compose(this.positions[i], tmpQuat, tmpScale.copy(this.scales[i]));
    this.buildings.setMatrixAt(i, tmpMatrix);
  }
}
