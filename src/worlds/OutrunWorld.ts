import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { distanceXZ, respawnAheadXZ } from '../core/utils/recycle';
import { ROAD_VERT, ROAD_FRAG, DUSK_VERT, DUSK_FRAG } from './shaders/outrun';

/**
 * OUTRUN — "Violet Drive". La imagen tipica del vaporware: conduces por una
 * carretera de neon sobre una rejilla violeta, atravesando aros de luz, hacia
 * un sol de barras que nunca llega. Negro y morado, puro synth de los 90.
 *
 * Suelo y cielo son dos shaders pegados a la camara (coste casi nulo). La CPU
 * solo mueve dos InstancedMesh reciclados: los aros y los postes del arcen.
 */

const RING_COUNT = 14;
const RING_RADIUS = 480;   // se reciclan al pasar de aqui
const RING_HOLE = 26;      // radio del hueco por el que se pasa
const PYLON_COUNT = 40;
const PYLON_RADIUS = 420;

const RING_COLORS = [0xb26bff, 0xff5ce1, 0x6bd4ff];

const tmpForward = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpMatrix = new THREE.Matrix4();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface Ring {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}
interface Pylon {
  pos: THREE.Vector3;
  height: number;
}

export class OutrunWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 46,
    clearColor: 0x0a0018,
    fogDensity: 0.0019,
    bloom: { strength: 1.15, radius: 0.85, threshold: 0.48 },
    cameraStart: new THREE.Vector3(0, 15, 0),
    bounds: { minY: 7, maxY: 60, margin: 22 },
  };

  private readonly rng = createRng(198407);

  private road!: THREE.Mesh;
  private roadUniforms!: { [k: string]: THREE.IUniform };
  private sky!: THREE.Mesh;
  private skyUniforms!: { [k: string]: THREE.IUniform };

  private rings!: THREE.InstancedMesh;
  private readonly ringData: Ring[] = [];

  private pylons!: THREE.InstancedMesh;
  private readonly pylonData: Pylon[] = [];

  init(camera: THREE.PerspectiveCamera): void {
    this.initSky();
    this.initRoad();
    this.initRings(camera);
    this.initPylons(camera);
  }

  // -------------------------------------------------------------- cielo

  private initSky(): void {
    this.skyUniforms = {
      uTime: { value: 0 },
      uHorizon: { value: new THREE.Color(0x5a1a8c) },
      uZenith: { value: new THREE.Color(0x05010f) },
      uSun: { value: new THREE.Color(0xff67d8) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: DUSK_VERT,
      fragmentShader: DUSK_FRAG,
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  // -------------------------------------------------------------- suelo

  private initRoad(): void {
    this.roadUniforms = {
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Color(this.config.clearColor) },
      uFogDensity: { value: this.config.fogDensity },
      uCamPos: { value: new THREE.Vector3() },
      uViolet: { value: new THREE.Color(0x7a2ff2) },
      uHot: { value: new THREE.Color(0xff5ce1) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: ROAD_VERT,
      fragmentShader: ROAD_FRAG,
      uniforms: this.roadUniforms,
    });
    const geo = new THREE.PlaneGeometry(3000, 3000);
    geo.rotateX(-Math.PI / 2);
    this.road = new THREE.Mesh(geo, mat);
    this.road.frustumCulled = false;
    this.scene.add(this.road);
  }

  // --------------------------------------------------------------- aros

  private initRings(camera: THREE.PerspectiveCamera): void {
    const geo = new THREE.TorusGeometry(RING_HOLE, 0.7, 10, 48);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.rings = new THREE.InstancedMesh(geo, mat, RING_COUNT);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.frustumCulled = false;
    for (let i = 0; i < RING_COUNT; i++) {
      const r: Ring = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
      this.ringData.push(r);
      this.placeRing(r, camera, false);
      this.writeRing(i, r);
      tmpColor.setHex(RING_COLORS[i % RING_COLORS.length]);
      this.rings.setColorAt(i, tmpColor);
    }
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    this.scene.add(this.rings);
  }

  /** Aro en el corredor de vuelo, de pie y mirando al rumbo actual. */
  private placeRing(r: Ring, camera: THREE.PerspectiveCamera, ahead: boolean): void {
    respawnAheadXZ(
      r.pos, camera,
      ahead ? RING_RADIUS * 0.85 : 40,
      RING_RADIUS * 0.98,
      Math.PI * 0.1, // abanico estrecho: forman un pasillo recto
      this.rng,
    );
    r.pos.y = 15; // el hueco queda a la altura de vuelo
    camera.getWorldDirection(tmpForward);
    r.quat.setFromUnitVectors(Z_AXIS, tmpForward); // el eje del toro apunta al rumbo
  }

  private writeRing(index: number, r: Ring): void {
    tmpMatrix.compose(r.pos, r.quat, tmpScale.setScalar(1));
    this.rings.setMatrixAt(index, tmpMatrix);
  }

  // ------------------------------------------------------------- postes

  private initPylons(camera: THREE.PerspectiveCamera): void {
    const geo = new THREE.BoxGeometry(0.8, 1, 0.8);
    geo.translate(0, 0.5, 0); // base sobre y=0
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff5ce1,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.pylons = new THREE.InstancedMesh(geo, mat, PYLON_COUNT);
    this.pylons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pylons.frustumCulled = false;
    for (let i = 0; i < PYLON_COUNT; i++) {
      const p: Pylon = { pos: new THREE.Vector3(), height: 0 };
      this.pylonData.push(p);
      this.placePylon(p, camera, false);
      this.writePylon(i, p);
    }
    this.pylons.instanceMatrix.needsUpdate = true;
    this.scene.add(this.pylons);
  }

  /** Poste luminoso pegado a uno de los bordes de la carretera. */
  private placePylon(p: Pylon, camera: THREE.PerspectiveCamera, ahead: boolean): void {
    respawnAheadXZ(
      p.pos, camera,
      ahead ? PYLON_RADIUS * 0.8 : 30,
      PYLON_RADIUS * 0.98,
      Math.PI * 0.14,
      this.rng,
    );
    // A un borde u otro de la carretera (ancho ~17)
    const side = this.rng() < 0.5 ? -1 : 1;
    p.pos.x += side * range(this.rng, 19, 24);
    p.pos.y = 0;
    p.height = range(this.rng, 8, 20);
  }

  private writePylon(index: number, p: Pylon): void {
    tmpQuat.setFromAxisAngle(Y_AXIS, 0);
    tmpScale.set(1, p.height, 1);
    tmpMatrix.compose(p.pos, tmpQuat, tmpScale);
    this.pylons.setMatrixAt(index, tmpMatrix);
  }

  // -------------------------------------------------------------- update

  update(_dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.roadUniforms.uTime.value = elapsed;
    (this.roadUniforms.uCamPos.value as THREE.Vector3).copy(camera.position);
    this.road.position.set(camera.position.x, 0, camera.position.z);
    this.skyUniforms.uTime.value = elapsed;
    this.sky.position.copy(camera.position);

    let ringsDirty = false;
    for (let i = 0; i < RING_COUNT; i++) {
      const r = this.ringData[i];
      if (distanceXZ(r.pos, camera) > RING_RADIUS) {
        this.placeRing(r, camera, true);
        this.writeRing(i, r);
        ringsDirty = true;
      }
    }
    if (ringsDirty) this.rings.instanceMatrix.needsUpdate = true;

    let pylonsDirty = false;
    for (let i = 0; i < PYLON_COUNT; i++) {
      const p = this.pylonData[i];
      if (distanceXZ(p.pos, camera) > PYLON_RADIUS) {
        this.placePylon(p, camera, true);
        this.writePylon(i, p);
        pylonsDirty = true;
      }
    }
    if (pylonsDirty) this.pylons.instanceMatrix.needsUpdate = true;
  }
}
