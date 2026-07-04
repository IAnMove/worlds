import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { TUNNEL_VERT, TUNNEL_FRAG } from './shaders/psyTunnel';
import { NEBULA_VERT, NEBULA_FRAG } from './shaders/psyNebula';
import { DUST_VERT, DUST_FRAG } from './shaders/psyDust';

/**
 * PSYCHEDELIC SPACE — viaje onirico por un tunel organico infinito.
 *
 * Tecnica principal ("cinta de correr"): el tunel y la nebulosa van pegados
 * a la camara; lo que fluye es la coordenada de muestreo de los shaders
 * (uScroll = distancia recorrida). El polvo se envuelve alrededor de la
 * camara directamente en su vertex shader. Solo las criaturas fractales
 * se animan en CPU (y son unas pocas matrices por frame).
 */

const TUNNEL_RADIUS = 17;
const TUNNEL_LENGTH = 500;
const DUST_COUNT = 3000;
const DUST_HALF = 34; // media caja de envoltura: dentro del tunel

// Criaturas fractales: nucleo + 6 petalos + 6 satelites = 13 instancias
const CREATURE_COUNT = 22;
const PARTS_PER_CREATURE = 13;
const CREATURE_MAX_DIST = 300;

const tmpForward = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpMatrix = new THREE.Matrix4();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpSide = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const tmpColor = new THREE.Color();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

interface Creature {
  center: THREE.Vector3;
  hue: number;
  phase: number;
  spin: number;
}

export class PsychedelicWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 36,
    clearColor: 0x08010f,
    fogDensity: 0.006,
    bloom: { strength: 0.75, radius: 0.7, threshold: 0.62 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private readonly rng = createRng(777);

  private tunnel!: THREE.Mesh;
  private tunnelUniforms!: { [k: string]: THREE.IUniform };
  private nebula!: THREE.Mesh;
  private nebulaUniforms!: { [k: string]: THREE.IUniform };
  private dustUniforms!: { [k: string]: THREE.IUniform };

  private creatures!: THREE.InstancedMesh;
  private readonly creatureData: Creature[] = [];
  private creatureMat!: THREE.MeshStandardMaterial;
  private lights: THREE.PointLight[] = [];

  /** Distancia total recorrida: hace fluir los shaders. */
  private traveled = 0;
  private readonly prevCamPos = new THREE.Vector3();

  init(camera: THREE.PerspectiveCamera): void {
    this.prevCamPos.copy(camera.position);
    this.initTunnel();
    this.initNebula();
    this.initDust(camera);
    this.initCreatures(camera);
    this.initLights();
  }

  private initTunnel(): void {
    const geo = new THREE.CylinderGeometry(
      TUNNEL_RADIUS, TUNNEL_RADIUS, TUNNEL_LENGTH, 96, 140, true,
    );
    geo.rotateX(Math.PI / 2); // eje del tubo a lo largo de +Z
    geo.translate(0, 0, TUNNEL_LENGTH * 0.3); // camara al 30% del tubo
    this.tunnelUniforms = {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uFogColor: { value: new THREE.Color(this.config.clearColor) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: TUNNEL_VERT,
      fragmentShader: TUNNEL_FRAG,
      uniforms: this.tunnelUniforms,
      side: THREE.BackSide,
    });
    this.tunnel = new THREE.Mesh(geo, mat);
    this.tunnel.frustumCulled = false; // el vertex shader lo deforma: no fiarse del bounding
    this.scene.add(this.tunnel);
  }

  private initNebula(): void {
    this.nebulaUniforms = { uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERT,
      fragmentShader: NEBULA_FRAG,
      uniforms: this.nebulaUniforms,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.nebula = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 24), mat);
    // Se dibuja al final: el z-buffer del tunel descarta lo oculto (early-z)
    this.nebula.renderOrder = 10;
    this.nebula.frustumCulled = false;
    this.scene.add(this.nebula);
  }

  private initDust(camera: THREE.PerspectiveCamera): void {
    const positions = new Float32Array(DUST_COUNT * 3);
    const seeds = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      positions[i * 3 + 0] = camera.position.x + range(this.rng, -DUST_HALF, DUST_HALF);
      positions[i * 3 + 1] = camera.position.y + range(this.rng, -DUST_HALF, DUST_HALF);
      positions[i * 3 + 2] = camera.position.z + range(this.rng, -DUST_HALF, DUST_HALF);
      seeds[i] = this.rng() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.dustUniforms = {
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uHalf: { value: DUST_HALF },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      uniforms: this.dustUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(geo, mat);
    dust.frustumCulled = false;
    this.scene.add(dust);
  }

  private initCreatures(camera: THREE.PerspectiveCamera): void {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    this.creatureMat = new THREE.MeshStandardMaterial({
      flatShading: true,
      roughness: 0.35,
      metalness: 0.05, // sin envMap, el metal se ve negro: casi dielectrico
      color: 0xffffff,
      emissive: 0x2a1a44,
    });
    this.creatures = new THREE.InstancedMesh(
      geo, this.creatureMat, CREATURE_COUNT * PARTS_PER_CREATURE,
    );
    this.creatures.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.creatures.frustumCulled = false;

    camera.getWorldDirection(tmpForward);
    for (let c = 0; c < CREATURE_COUNT; c++) {
      const creature: Creature = {
        center: new THREE.Vector3(),
        hue: this.rng(),
        phase: range(this.rng, 0, Math.PI * 2),
        spin: range(this.rng, 0.25, 0.7) * (this.rng() < 0.5 ? -1 : 1),
      };
      this.spawnCreatureAhead(creature, camera, range(this.rng, 40, CREATURE_MAX_DIST * 0.9));
      this.creatureData.push(creature);
      this.paintCreature(c, creature);
    }
    if (this.creatures.instanceColor) this.creatures.instanceColor.needsUpdate = true;
    this.scene.add(this.creatures);

    // Luz de relleno tenue para que la cara no iluminada no sea negra pura
    this.scene.add(new THREE.AmbientLight(0x6644aa, 1.4));
  }

  private initLights(): void {
    // Tres luces de colores complementarios orbitando delante de la camara:
    // son las que "pintan" las criaturas al pasar
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffffff, 1400, 120, 2);
      this.lights.push(light);
      this.scene.add(light);
    }
  }

  /** Coloca una criatura delante de la camara, dentro del radio del tunel. */
  private spawnCreatureAhead(
    creature: Creature, camera: THREE.PerspectiveCamera, dist: number,
  ): void {
    camera.getWorldDirection(tmpForward);
    // Base perpendicular al rumbo para el desplazamiento lateral
    tmpSide.crossVectors(tmpForward, WORLD_UP).normalize();
    if (tmpSide.lengthSq() < 0.01) tmpSide.set(1, 0, 0);
    tmpUp.crossVectors(tmpSide, tmpForward);
    const ang = range(this.rng, 0, Math.PI * 2);
    const r = range(this.rng, 2, TUNNEL_RADIUS * 0.55);
    creature.center
      .copy(camera.position)
      .addScaledVector(tmpForward, dist)
      .addScaledVector(tmpSide, Math.cos(ang) * r)
      .addScaledVector(tmpUp, Math.sin(ang) * r);
    creature.hue = this.rng();
  }

  private paintCreature(index: number, creature: Creature): void {
    for (let p = 0; p < PARTS_PER_CREATURE; p++) {
      // Nucleo mas claro, petalos saturados, satelites como chispas palidas
      const level = p === 0 ? 0 : p <= 6 ? 1 : 2;
      tmpColor.setHSL(
        (creature.hue + level * 0.09) % 1,
        level === 1 ? 0.95 : 0.6,
        level === 2 ? 0.8 : 0.6,
      );
      this.creatures.setColorAt(index * PARTS_PER_CREATURE + p, tmpColor);
    }
  }

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.traveled += this.prevCamPos.distanceTo(camera.position);
    this.prevCamPos.copy(camera.position);
    camera.getWorldDirection(tmpForward);

    // --- shaders ---
    this.tunnelUniforms.uTime.value = elapsed;
    this.tunnelUniforms.uScroll.value = this.traveled;
    this.nebulaUniforms.uTime.value = elapsed;
    this.dustUniforms.uTime.value = elapsed;
    (this.dustUniforms.uCamPos.value as THREE.Vector3).copy(camera.position);

    // El tunel sigue a la camara; su orientacion persigue el rumbo con
    // suavidad, asi girar se siente como si el propio tunel se curvara
    this.tunnel.position.copy(camera.position);
    tmpQuat.setFromUnitVectors(Z_AXIS, tmpForward);
    this.tunnel.quaternion.slerp(tmpQuat, 1 - Math.exp(-2.2 * dt));
    this.nebula.position.copy(camera.position);

    this.updateCreatures(elapsed, camera);
    this.updateLights(elapsed, camera);
  }

  private updateCreatures(elapsed: number, camera: THREE.PerspectiveCamera): void {
    let repainted = false;
    for (let c = 0; c < CREATURE_COUNT; c++) {
      const cr = this.creatureData[c];

      // Reciclar si quedo atras o demasiado lejos
      tmpVec.subVectors(cr.center, camera.position);
      const along = tmpVec.dot(tmpForward);
      if (along < -25 || tmpVec.lengthSq() > CREATURE_MAX_DIST * CREATURE_MAX_DIST) {
        this.spawnCreatureAhead(cr, camera, range(this.rng, 180, CREATURE_MAX_DIST * 0.95));
        this.paintCreature(c, cr);
        repainted = true;
      }

      const t = elapsed * cr.spin + cr.phase;
      const breathe = 1 + Math.sin(elapsed * 1.1 + cr.phase) * 0.18;

      // Nucleo
      tmpQuat.setFromEuler(tmpEuler.set(t * 0.6, t * 0.4, 0));
      tmpMatrix.compose(cr.center, tmpQuat, tmpVec2.setScalar(2.1 * breathe));
      this.creatures.setMatrixAt(c * PARTS_PER_CREATURE, tmpMatrix);

      // Petalos y satelites: dos coronas contrarrotantes
      for (let p = 1; p < PARTS_PER_CREATURE; p++) {
        const outer = p > 6;
        const k = outer ? p - 7 : p - 1;
        const orbitT = outer ? -t * 1.4 : t;
        const ang = (k / 6) * Math.PI * 2 + orbitT;
        const radius = (outer ? 6.0 : 3.4) * breathe;
        const tilt = Math.sin(t * 0.7 + k) * 0.9;
        tmpVec2.set(
          Math.cos(ang) * radius,
          Math.sin(ang) * radius * Math.cos(tilt),
          Math.sin(ang) * radius * Math.sin(tilt),
        );
        tmpVec.copy(cr.center).add(tmpVec2);
        tmpQuat.setFromEuler(tmpEuler.set(ang, t, k));
        tmpMatrix.compose(tmpVec, tmpQuat, tmpVec2.setScalar(outer ? 0.42 : 0.95));
        this.creatures.setMatrixAt(c * PARTS_PER_CREATURE + p, tmpMatrix);
      }
    }
    this.creatures.instanceMatrix.needsUpdate = true;
    if (repainted && this.creatures.instanceColor) {
      this.creatures.instanceColor.needsUpdate = true;
    }
    // Latido emisivo global
    this.creatureMat.emissiveIntensity = 0.7 + Math.sin(elapsed * 1.8) * 0.4;
  }

  private updateLights(elapsed: number, camera: THREE.PerspectiveCamera): void {
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i];
      const t = elapsed * (0.35 + i * 0.13) + (i * Math.PI * 2) / 3;
      // Orbitan un punto delante de la camara, barriendo el tunel
      tmpVec
        .copy(camera.position)
        .addScaledVector(tmpForward, 28 + Math.sin(t * 0.7) * 14);
      light.position.set(
        tmpVec.x + Math.cos(t) * 11,
        tmpVec.y + Math.sin(t * 1.3) * 9,
        tmpVec.z + Math.sin(t) * 11,
      );
      light.color.setHSL((elapsed * 0.03 + i / 3) % 1, 0.9, 0.6);
    }
  }
}
