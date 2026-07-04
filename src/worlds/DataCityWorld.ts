import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { distanceXZ, respawnAheadXZ } from '../core/utils/recycle';
import { BUILDINGS_VERT, BUILDINGS_FRAG } from './shaders/cityBuildings';
import { GROUND_VERT, GROUND_FRAG } from './shaders/cityGround';

/**
 * DATA CITY — la ciudad infinita de la informacion (azul / blanco / cian).
 *
 * - Rascacielos: un InstancedMesh con ventanas emisivas procedurales (shader)
 * - Distritos: la altura sale de un campo de ruido -> clusters tipo downtown
 * - Avenidas: franjas libres periodicas con trafico de luz circulando
 * - Red viva: lineas de conexion entre azoteas + paquetes de datos viajando
 * - Suelo: grid infinito con pulsos de energia (shader, coords de mundo)
 */

const BUILDING_COUNT = 650;
const CITY_RADIUS = 420;
const AVENUE_SPACING = 170;
const AVENUE_HALF_WIDTH = 20;
const LINE_COUNT = 64;
const PACKET_COUNT = 380;
const TRAFFIC_COUNT = 90;
const BEAM_COUNT = 10;

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpFwd = new THREE.Vector3();
const tmpColor = new THREE.Color();
const QUAT_X = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
const QUAT_Z = new THREE.Quaternion();

interface Traffic {
  axis: 0 | 1; // 0 = circula a lo largo de X, 1 = a lo largo de Z
  dir: number;
  speed: number;
  pos: THREE.Vector3;
}

export class DataCityWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 30,
    clearColor: 0x020714,
    fogDensity: 0.0045,
    bloom: { strength: 0.9, radius: 0.7, threshold: 0.55 },
    cameraStart: new THREE.Vector3(30, 46, 0),
    bounds: { minY: 7, maxY: 190, margin: 24 },
  };

  private readonly rng = createRng(1337);

  // Edificios
  private buildings!: THREE.InstancedMesh;
  private readonly positions: THREE.Vector3[] = [];
  private readonly heights = new Float32Array(BUILDING_COUNT);
  /** Celda de manzana ocupada por cada edificio: evita solapes (z-fighting). */
  private readonly occupied = new Set<number>();
  private readonly cellKeys = new Int32Array(BUILDING_COUNT);
  private scaleAttr!: THREE.InstancedBufferAttribute;
  private seedAttr!: THREE.InstancedBufferAttribute;
  private buildingUniforms!: { [k: string]: THREE.IUniform };

  // Suelo
  private ground!: THREE.Mesh;
  private groundUniforms!: { [k: string]: THREE.IUniform };

  // Red de datos
  private lines!: THREE.LineSegments;
  private linePositions!: Float32Array;
  private readonly lineTowers = new Uint16Array(LINE_COUNT * 2);
  private packets!: THREE.Points;
  private packetPositions!: Float32Array;
  private readonly packetLine = new Uint16Array(PACKET_COUNT);
  private readonly packetT = new Float32Array(PACKET_COUNT);
  private readonly packetSpeed = new Float32Array(PACKET_COUNT);

  // Trafico y haces
  private traffic!: THREE.InstancedMesh;
  private readonly trafficData: Traffic[] = [];
  private beams!: THREE.InstancedMesh;
  private beamMat!: THREE.MeshBasicMaterial;
  private readonly beamPositions: THREE.Vector3[] = [];

  init(camera: THREE.PerspectiveCamera): void {
    this.initBuildings(camera);
    this.initGround();
    this.initNetwork(camera);
    this.initTraffic(camera);
    this.initBeams(camera);
  }

  // ------------------------------------------------------------- edificios

  private initBuildings(camera: THREE.PerspectiveCamera): void {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0); // origen en la base

    const scales = new Float32Array(BUILDING_COUNT * 3);
    const seeds = new Float32Array(BUILDING_COUNT);
    this.scaleAttr = new THREE.InstancedBufferAttribute(scales, 3);
    this.seedAttr = new THREE.InstancedBufferAttribute(seeds, 1);
    geo.setAttribute('aScale', this.scaleAttr);
    geo.setAttribute('aSeed', this.seedAttr);

    this.buildingUniforms = {
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Color(this.config.clearColor) },
      uFogDensity: { value: this.config.fogDensity },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: BUILDINGS_VERT,
      fragmentShader: BUILDINGS_FRAG,
      uniforms: this.buildingUniforms,
    });

    this.buildings = new THREE.InstancedMesh(geo, mat, BUILDING_COUNT);
    this.buildings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.buildings.frustumCulled = false;

    for (let i = 0; i < BUILDING_COUNT; i++) {
      this.positions.push(new THREE.Vector3());
      this.placeBuilding(i, camera, true);
    }
    this.scene.add(this.buildings);
  }

  /**
   * Coloca/recicla un edificio: snap a manzanas, avenidas libres y altura
   * por distritos (campo de ruido suave -> clusters de torres).
   */
  private placeBuilding(i: number, camera: THREE.PerspectiveCamera, initial: boolean): void {
    const pos = this.positions[i];
    if (!initial) this.occupied.delete(this.cellKeys[i]);
    let slab = false;
    let gx = 0;
    let gz = 0;
    for (let attempt = 0; ; attempt++) {
      if (initial) {
        pos.x = camera.position.x + range(this.rng, -CITY_RADIUS, CITY_RADIUS);
        pos.z = camera.position.z + range(this.rng, -CITY_RADIUS, CITY_RADIUS);
      } else {
        respawnAheadXZ(pos, camera, CITY_RADIUS * 0.55, CITY_RADIUS * 0.98, Math.PI * 0.9, this.rng);
      }
      // Manzanas: snap a una rejilla de 26
      gx = Math.round(pos.x / 26);
      gz = Math.round(pos.z / 26);
      pos.x = gx * 26 + range(this.rng, -2, 2);
      pos.z = gz * 26 + range(this.rng, -2, 2);
      pos.y = 0;

      const ax = Math.abs(((pos.x % AVENUE_SPACING) + AVENUE_SPACING) % AVENUE_SPACING - AVENUE_SPACING / 2);
      const az = Math.abs(((pos.z % AVENUE_SPACING) + AVENUE_SPACING) % AVENUE_SPACING - AVENUE_SPACING / 2);
      const onAvenue =
        ax > AVENUE_SPACING / 2 - AVENUE_HALF_WIDTH || az > AVENUE_SPACING / 2 - AVENUE_HALF_WIDTH;
      // Celda ya ocupada por otra torre => dos cajas solapadas parpadeando
      const taken = this.occupied.has(gx * 100000 + gz);
      if (!onAvenue && !taken) break;
      if (attempt >= 7) {
        slab = true; // sin hueco: losa baja (si ademas solapa, quedara oculta)
        break;
      }
    }
    this.cellKeys[i] = gx * 100000 + gz;
    this.occupied.add(this.cellKeys[i]);

    // Distritos: altura segun un campo suave -> downtown / suburbio
    const district = 0.5 + 0.5 * Math.sin(pos.x * 0.011) * Math.cos(pos.z * 0.013);
    let h = 8 + 130 * district * district * range(this.rng, 0.75, 1.25);
    if (slab) h = range(this.rng, 2, 4);
    h = Math.min(h, 175);
    this.heights[i] = h;

    this.scaleAttr.array[i * 3 + 0] = range(this.rng, 8, 17);
    this.scaleAttr.array[i * 3 + 1] = h;
    this.scaleAttr.array[i * 3 + 2] = range(this.rng, 8, 17);
    this.seedAttr.array[i] = this.rng() * 10;

    tmpMatrix.makeTranslation(pos.x, 0, pos.z);
    this.buildings.setMatrixAt(i, tmpMatrix);

    this.buildings.instanceMatrix.needsUpdate = true;
    this.scaleAttr.needsUpdate = true;
    this.seedAttr.needsUpdate = true;
  }

  // ----------------------------------------------------------------- suelo

  private initGround(): void {
    this.groundUniforms = {
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Color(this.config.clearColor) },
      uFogDensity: { value: this.config.fogDensity },
      uCamPos: { value: new THREE.Vector3() },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      uniforms: this.groundUniforms,
    });
    const geo = new THREE.PlaneGeometry(2400, 2400);
    geo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);
  }

  // ---------------------------------------------------------- red de datos

  private initNetwork(camera: THREE.PerspectiveCamera): void {
    // Lineas de conexion entre azoteas: un solo LineSegments
    this.linePositions = new Float32Array(LINE_COUNT * 2 * 3);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x2ee6ff,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.lines = new THREE.LineSegments(lineGeo, lineMat);
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
    for (let li = 0; li < LINE_COUNT; li++) this.assignLine(li, camera);

    // Paquetes de datos recorriendo las lineas
    this.packetPositions = new Float32Array(PACKET_COUNT * 3);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(this.packetPositions, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0xdffaff,
      size: 1.7,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.packets = new THREE.Points(pGeo, pMat);
    this.packets.frustumCulled = false;
    this.scene.add(this.packets);
    for (let p = 0; p < PACKET_COUNT; p++) {
      this.packetLine[p] = Math.floor(this.rng() * LINE_COUNT);
      this.packetT[p] = this.rng();
      this.packetSpeed[p] = range(this.rng, 0.15, 0.7);
    }
  }

  /** Une la linea `li` entre dos torres altas cercanas a la camara. */
  private assignLine(li: number, camera: THREE.PerspectiveCamera): void {
    let a = -1;
    let b = -1;
    for (let attempt = 0; attempt < 14 && b < 0; attempt++) {
      const cand = Math.floor(this.rng() * BUILDING_COUNT);
      if (this.heights[cand] < 45) continue;
      if (distanceXZ(this.positions[cand], camera) > CITY_RADIUS * 0.8) continue;
      if (a < 0) {
        a = cand;
        continue;
      }
      const d = this.positions[cand].distanceTo(this.positions[a]);
      if (cand !== a && d > 40 && d < 240) b = cand;
    }
    if (a < 0 || b < 0) {
      // sin candidatos: linea degenerada invisible hasta el proximo intento
      a = 0;
      b = 0;
    }
    this.lineTowers[li * 2] = a;
    this.lineTowers[li * 2 + 1] = b;
    this.writeLineEndpoints(li);
  }

  private writeLineEndpoints(li: number): void {
    for (let e = 0; e < 2; e++) {
      const tower = this.lineTowers[li * 2 + e];
      const o = (li * 2 + e) * 3;
      this.linePositions[o] = this.positions[tower].x;
      this.linePositions[o + 1] = this.heights[tower] - 0.5;
      this.linePositions[o + 2] = this.positions[tower].z;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }

  // -------------------------------------------------------------- trafico

  private initTraffic(camera: THREE.PerspectiveCamera): void {
    const geo = new THREE.BoxGeometry(0.6, 0.3, 1);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.traffic = new THREE.InstancedMesh(geo, mat, TRAFFIC_COUNT);
    this.traffic.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.traffic.frustumCulled = false;
    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      const t: Traffic = { axis: 0, dir: 1, speed: 0, pos: new THREE.Vector3() };
      this.trafficData.push(t);
      this.spawnTraffic(t, camera);
      // blanco-cian con algun taxi ambar
      if (this.rng() < 0.12) tmpColor.setHSL(0.09, 1, 0.62);
      else tmpColor.setHSL(0.52 + this.rng() * 0.06, 0.9, 0.75);
      this.traffic.setColorAt(i, tmpColor);
    }
    if (this.traffic.instanceColor) this.traffic.instanceColor.needsUpdate = true;
    this.scene.add(this.traffic);
  }

  /** Situa un vehiculo en una avenida cercana. */
  private spawnTraffic(t: Traffic, camera: THREE.PerspectiveCamera): void {
    t.axis = this.rng() < 0.5 ? 0 : 1;
    t.dir = this.rng() < 0.5 ? -1 : 1;
    t.speed = range(this.rng, 55, 130);
    // La avenida es una franja centrada en multiplos de AVENUE_SPACING
    const laneCenter =
      Math.round(
        ((t.axis === 0 ? camera.position.z : camera.position.x) +
          range(this.rng, -CITY_RADIUS, CITY_RADIUS)) / AVENUE_SPACING,
      ) * AVENUE_SPACING;
    const lane = laneCenter + range(this.rng, -9, 9);
    const along =
      (t.axis === 0 ? camera.position.x : camera.position.z) +
      range(this.rng, -CITY_RADIUS, CITY_RADIUS);
    const y = range(this.rng, 2.5, 42);
    if (t.axis === 0) t.pos.set(along, y, lane);
    else t.pos.set(lane, y, along);
  }

  // ----------------------------------------------------------------- haces

  private initBeams(camera: THREE.PerspectiveCamera): void {
    const geo = new THREE.CylinderGeometry(0.9, 0.9, 260, 10, 1, true);
    geo.translate(0, 130, 0);
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0x8fe8ff,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.beams = new THREE.InstancedMesh(geo, this.beamMat, BEAM_COUNT);
    this.beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.beams.frustumCulled = false;
    for (let i = 0; i < BEAM_COUNT; i++) {
      const pos = new THREE.Vector3(
        camera.position.x + range(this.rng, -CITY_RADIUS, CITY_RADIUS),
        0,
        camera.position.z + range(this.rng, -CITY_RADIUS, CITY_RADIUS),
      );
      this.beamPositions.push(pos);
      tmpMatrix.makeTranslation(pos.x, 0, pos.z);
      this.beams.setMatrixAt(i, tmpMatrix);
    }
    this.scene.add(this.beams);
  }

  // --------------------------------------------------------------- esquiva

  /**
   * Corriente de esquiva: mira las torres en un cono delante del rumbo y
   * empuja la guinada hacia el lado libre (y un pelin hacia arriba si la
   * torre es mas alta que nosotros). El usuario conserva el mando.
   */
  steerBias(camera: THREE.PerspectiveCamera, out: THREE.Vector2): void {
    camera.getWorldDirection(tmpFwd);
    const fx = tmpFwd.x;
    const fz = tmpFwd.z;
    const norm = Math.hypot(fx, fz) || 1;
    const hx = fx / norm;
    const hz = fz / norm;

    for (let i = 0; i < BUILDING_COUNT; i++) {
      const p = this.positions[i];
      const h = this.heights[i];
      // Solo torres que invaden nuestra altitud
      if (camera.position.y > h + 12) continue;
      const dx = p.x - camera.position.x;
      const dz = p.z - camera.position.z;
      const along = dx * hx + dz * hz; // distancia por delante
      if (along < 15 || along > 170) continue;
      const lateral = dx * -hz + dz * hx; // + = a la derecha del rumbo
      const halfW = this.scaleAttr.array[i * 3] * 0.5 + 14;
      if (Math.abs(lateral) > halfW) continue;

      // Cuanto mas cerca y mas centrada la torre, mas fuerte el empuje
      const urgency = (1 - along / 170) * (1 - Math.abs(lateral) / halfW);
      const side = lateral >= 0 ? -1 : 1; // esquivar hacia el lado contrario
      out.x += side * urgency * 0.9;
      // Si la cima esta cerca por encima, tambien invita a remontar
      if (h - camera.position.y < 30) out.y -= urgency * 0.35;
    }
    out.x = THREE.MathUtils.clamp(out.x, -1, 1);
    out.y = THREE.MathUtils.clamp(out.y, -1, 1);
  }

  // ---------------------------------------------------------------- update

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.buildingUniforms.uTime.value = elapsed;
    this.groundUniforms.uTime.value = elapsed;
    (this.groundUniforms.uCamPos.value as THREE.Vector3).copy(camera.position);
    this.ground.position.set(camera.position.x, 0, camera.position.z);

    // Reciclado de edificios
    for (let i = 0; i < BUILDING_COUNT; i++) {
      if (distanceXZ(this.positions[i], camera) > CITY_RADIUS) {
        this.placeBuilding(i, camera, false);
      }
    }

    // Lineas cuyas torres quedaron fuera -> reasignar
    for (let li = 0; li < LINE_COUNT; li++) {
      const a = this.lineTowers[li * 2];
      const b = this.lineTowers[li * 2 + 1];
      if (
        a === b ||
        distanceXZ(this.positions[a], camera) > CITY_RADIUS ||
        distanceXZ(this.positions[b], camera) > CITY_RADIUS
      ) {
        this.assignLine(li, camera);
      } else {
        this.writeLineEndpoints(li); // por si sus torres se reciclaron este frame
      }
    }

    // Paquetes de datos
    for (let p = 0; p < PACKET_COUNT; p++) {
      let t = this.packetT[p] + this.packetSpeed[p] * dt;
      if (t > 1) {
        t = 0;
        this.packetLine[p] = Math.floor(this.rng() * LINE_COUNT);
      }
      this.packetT[p] = t;
      const li = this.packetLine[p];
      const oa = li * 2 * 3;
      const ob = oa + 3;
      const op = p * 3;
      this.packetPositions[op] =
        this.linePositions[oa] + (this.linePositions[ob] - this.linePositions[oa]) * t;
      this.packetPositions[op + 1] =
        this.linePositions[oa + 1] + (this.linePositions[ob + 1] - this.linePositions[oa + 1]) * t;
      this.packetPositions[op + 2] =
        this.linePositions[oa + 2] + (this.linePositions[ob + 2] - this.linePositions[oa + 2]) * t;
    }
    this.packets.geometry.attributes.position.needsUpdate = true;

    // Trafico circulando por las avenidas
    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      const t = this.trafficData[i];
      if (t.axis === 0) t.pos.x += t.dir * t.speed * dt;
      else t.pos.z += t.dir * t.speed * dt;
      if (distanceXZ(t.pos, camera) > CITY_RADIUS) this.spawnTraffic(t, camera);
      tmpQuat.copy(t.axis === 0 ? QUAT_X : QUAT_Z);
      // estela alargada segun velocidad
      tmpMatrix.compose(t.pos, tmpQuat, tmpScale.set(1, 1, 4 + t.speed * 0.06));
      this.traffic.setMatrixAt(i, tmpMatrix);
    }
    this.traffic.instanceMatrix.needsUpdate = true;

    // Haces de luz verticales
    let beamsDirty = false;
    for (let i = 0; i < BEAM_COUNT; i++) {
      const pos = this.beamPositions[i];
      if (distanceXZ(pos, camera) > CITY_RADIUS) {
        respawnAheadXZ(pos, camera, CITY_RADIUS * 0.5, CITY_RADIUS * 0.95, Math.PI, this.rng);
        tmpMatrix.makeTranslation(pos.x, 0, pos.z);
        this.beams.setMatrixAt(i, tmpMatrix);
        beamsDirty = true;
      }
    }
    if (beamsDirty) this.beams.instanceMatrix.needsUpdate = true;
    this.beamMat.opacity = 0.045 + Math.sin(elapsed * 0.9) * 0.015;
  }
}
