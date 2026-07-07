import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { distanceXZ, respawnAheadXZ } from '../core/utils/recycle';
import { GRID_VERT, GRID_FRAG, SKY_VERT, SKY_FRAG } from './shaders/synthwave';

/**
 * SYNTHWAVE — "Neon Horizon". El ciberespacio de los 90 en su forma mas
 * pura: una rejilla de neon infinita corriendo hacia un sol de bandas que
 * nunca se alcanza, montanas de wireframe a los lados y brasas flotando.
 *
 * Casi todo es GPU (baratisimo): el suelo y el cielo son dos shaders
 * pegados a la camara. Lo unico que anima la CPU son las montanas (un
 * InstancedMesh reciclado) y las brasas (un solo Points), pocas matrices
 * por frame.
 */

const MOUNTAIN_COUNT = 26;
const MOUNTAIN_RADIUS = 620; // se reciclan al pasar de aqui
const EMBER_COUNT = 900;
const EMBER_HALF = 90; // media caja de envoltura alrededor de la camara

const NEON_MAGENTA = new THREE.Color(0xff2e97);
const NEON_CYAN = new THREE.Color(0x21e7ff);

const tmpQuat = new THREE.Quaternion();
const tmpMatrix = new THREE.Matrix4();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface Mountain {
  pos: THREE.Vector3;
  scale: THREE.Vector3;
  yaw: number;
}

export class SynthwaveWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 42,
    clearColor: 0x1a0533,
    fogDensity: 0.0016,
    bloom: { strength: 1.05, radius: 0.85, threshold: 0.5 },
    cameraStart: new THREE.Vector3(0, 14, 0),
    // Vuelo bajo, cerca de la rejilla: rebota si sube o baja demasiado
    bounds: { minY: 6, maxY: 70, margin: 24 },
  };

  private readonly rng = createRng(1984);

  private grid!: THREE.Mesh;
  private gridUniforms!: { [k: string]: THREE.IUniform };
  private sky!: THREE.Mesh;
  private skyUniforms!: { [k: string]: THREE.IUniform };

  private mountains!: THREE.InstancedMesh;
  private readonly mountainData: Mountain[] = [];

  private embers!: THREE.Points;
  private emberPositions!: Float32Array;
  private emberSeeds!: Float32Array;

  init(camera: THREE.PerspectiveCamera): void {
    this.initSky();
    this.initGrid();
    this.initMountains(camera);
    this.initEmbers(camera);
  }

  // -------------------------------------------------------------- cielo

  private initSky(): void {
    this.skyUniforms = {
      uTime: { value: 0 },
      uHorizon: { value: new THREE.Color(0xff5a2b) },
      uZenith: { value: new THREE.Color(0x120233) },
      uSun: { value: new THREE.Color(0xffd23f) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  // -------------------------------------------------------------- suelo

  private initGrid(): void {
    this.gridUniforms = {
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Color(this.config.clearColor) },
      uFogDensity: { value: this.config.fogDensity },
      uCamPos: { value: new THREE.Vector3() },
      uNeonA: { value: NEON_MAGENTA.clone() },
      uNeonB: { value: NEON_CYAN.clone() },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      uniforms: this.gridUniforms,
    });
    const geo = new THREE.PlaneGeometry(3000, 3000);
    geo.rotateX(-Math.PI / 2);
    this.grid = new THREE.Mesh(geo, mat);
    this.grid.frustumCulled = false;
    this.scene.add(this.grid);
  }

  // ------------------------------------------------------------ montanas

  private initMountains(camera: THREE.PerspectiveCamera): void {
    // Piramide de 4 caras: en wireframe parece una montana retro de neon
    const geo = new THREE.ConeGeometry(1, 1, 4, 1);
    geo.translate(0, 0.5, 0); // base sobre y=0
    const mat = new THREE.MeshBasicMaterial({
      color: 0x2bf0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
      fog: false,
    });
    this.mountains = new THREE.InstancedMesh(geo, mat, MOUNTAIN_COUNT);
    this.mountains.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mountains.frustumCulled = false;

    for (let i = 0; i < MOUNTAIN_COUNT; i++) {
      const m: Mountain = {
        pos: new THREE.Vector3(),
        scale: new THREE.Vector3(),
        yaw: 0,
      };
      this.mountainData.push(m);
      this.placeMountain(m, camera, false);
      this.writeMountain(i, m);
    }
    this.mountains.instanceMatrix.needsUpdate = true;
    this.scene.add(this.mountains);
  }

  /**
   * Situa una montana lejos, a un flanco del corredor de vuelo (nunca
   * justo encima del rumbo, para dejar el pasillo despejado).
   */
  private placeMountain(m: Mountain, camera: THREE.PerspectiveCamera, ahead: boolean): void {
    respawnAheadXZ(
      m.pos, camera,
      ahead ? MOUNTAIN_RADIUS * 0.75 : 60,
      MOUNTAIN_RADIUS * 0.98,
      Math.PI * 1.3,
      this.rng,
    );
    // Empujar a un lado: deja libre una franja central de +/-70
    const side = m.pos.x >= camera.position.x ? 1 : -1;
    m.pos.x += side * range(this.rng, 70, 180);
    m.pos.y = 0;
    const base = range(this.rng, 40, 110);
    m.scale.set(base * range(this.rng, 0.7, 1.3), base * range(this.rng, 1.2, 2.4), base * range(this.rng, 0.7, 1.3));
    m.yaw = range(this.rng, 0, Math.PI);
  }

  private writeMountain(index: number, m: Mountain): void {
    tmpQuat.setFromAxisAngle(Y_AXIS, m.yaw);
    tmpMatrix.compose(m.pos, tmpQuat, m.scale);
    this.mountains.setMatrixAt(index, tmpMatrix);
  }

  // -------------------------------------------------------------- brasas

  private initEmbers(camera: THREE.PerspectiveCamera): void {
    this.emberPositions = new Float32Array(EMBER_COUNT * 3);
    this.emberSeeds = new Float32Array(EMBER_COUNT);
    for (let i = 0; i < EMBER_COUNT; i++) {
      this.emberPositions[i * 3 + 0] = camera.position.x + range(this.rng, -EMBER_HALF, EMBER_HALF);
      this.emberPositions[i * 3 + 1] = range(this.rng, 2, EMBER_HALF);
      this.emberPositions[i * 3 + 2] = camera.position.z + range(this.rng, -EMBER_HALF, EMBER_HALF);
      this.emberSeeds[i] = this.rng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.emberPositions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xff7ac6,
      size: 2.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.embers = new THREE.Points(geo, mat);
    this.embers.frustumCulled = false;
    this.scene.add(this.embers);
  }

  // -------------------------------------------------------------- update

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    // Suelo y cielo pegados a la camara
    this.gridUniforms.uTime.value = elapsed;
    (this.gridUniforms.uCamPos.value as THREE.Vector3).copy(camera.position);
    this.grid.position.set(camera.position.x, 0, camera.position.z);
    this.skyUniforms.uTime.value = elapsed;
    this.sky.position.copy(camera.position);

    // Montanas: reciclar las que quedaron atras/lejos hacia delante
    let dirty = false;
    for (let i = 0; i < MOUNTAIN_COUNT; i++) {
      const m = this.mountainData[i];
      if (distanceXZ(m.pos, camera) > MOUNTAIN_RADIUS) {
        this.placeMountain(m, camera, true);
        this.writeMountain(i, m);
        dirty = true;
      }
    }
    if (dirty) this.mountains.instanceMatrix.needsUpdate = true;

    this.updateEmbers(dt, elapsed, camera);
  }

  /** Brasas: ascienso lento y envoltura toroidal alrededor de la camara. */
  private updateEmbers(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    const p = this.emberPositions;
    for (let i = 0; i < EMBER_COUNT; i++) {
      const s = this.emberSeeds[i];
      let x = p[i * 3 + 0];
      let y = p[i * 3 + 1];
      let z = p[i * 3 + 2];

      y += dt * (3 + s * 6);
      x += Math.sin(elapsed * 0.5 + s * 20) * dt * 4;

      // Envoltura: mantener cada brasa dentro de la caja centrada en la camara
      if (y > EMBER_HALF) y = 2;
      const dx = x - camera.position.x;
      const dz = z - camera.position.z;
      if (dx > EMBER_HALF) x -= EMBER_HALF * 2;
      else if (dx < -EMBER_HALF) x += EMBER_HALF * 2;
      if (dz > EMBER_HALF) z -= EMBER_HALF * 2;
      else if (dz < -EMBER_HALF) z += EMBER_HALF * 2;

      p[i * 3 + 0] = x;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z;
    }
    this.embers.geometry.attributes.position.needsUpdate = true;
  }
}
