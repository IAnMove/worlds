import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { TUNNEL_VERT, TUNNEL_FRAG } from './shaders/psyTunnel';
import { NEBULA_VERT, NEBULA_FRAG } from './shaders/psyNebula';

/**
 * PSYCHEDELIC SPACE — viaje onirico por un tunel organico infinito.
 *
 * Tecnica principal ("cinta de correr"): el tunel y la nebulosa van pegados
 * a la camara; lo que fluye es la coordenada de muestreo de los shaders
 * (uScroll = distancia recorrida). El mundo nunca se genera ni se destruye:
 * se calcula.
 */

const TUNNEL_RADIUS = 17;
const TUNNEL_LENGTH = 500;

const tmpForward = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class PsychedelicWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 36,
    clearColor: 0x08010f,
    fogDensity: 0.006,
    bloom: { strength: 0.85, radius: 0.75, threshold: 0.5 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private tunnel!: THREE.Mesh;
  private tunnelUniforms!: { [k: string]: THREE.IUniform };
  private nebula!: THREE.Mesh;
  private nebulaUniforms!: { [k: string]: THREE.IUniform };

  /** Distancia total recorrida: hace fluir los shaders. */
  private traveled = 0;
  private readonly prevCamPos = new THREE.Vector3();

  init(camera: THREE.PerspectiveCamera): void {
    this.prevCamPos.copy(camera.position);

    // --- Tunel: cilindro abierto visto desde dentro, deformado en GPU ---
    const tunnelGeo = new THREE.CylinderGeometry(
      TUNNEL_RADIUS, TUNNEL_RADIUS, TUNNEL_LENGTH, 96, 140, true,
    );
    tunnelGeo.rotateX(Math.PI / 2); // eje del tubo a lo largo de +Z
    tunnelGeo.translate(0, 0, TUNNEL_LENGTH * 0.3); // camara al 30% del tubo
    this.tunnelUniforms = {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uFogColor: { value: new THREE.Color(this.config.clearColor) },
    };
    const tunnelMat = new THREE.ShaderMaterial({
      vertexShader: TUNNEL_VERT,
      fragmentShader: TUNNEL_FRAG,
      uniforms: this.tunnelUniforms,
      side: THREE.BackSide,
    });
    this.tunnel = new THREE.Mesh(tunnelGeo, tunnelMat);
    this.tunnel.frustumCulled = false; // el vertex shader lo deforma: no fiarse del bounding
    this.scene.add(this.tunnel);

    // --- Nebulosa: fondo esferico procedural, siempre centrado en camara ---
    this.nebulaUniforms = { uTime: { value: 0 } };
    const nebulaMat = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERT,
      fragmentShader: NEBULA_FRAG,
      uniforms: this.nebulaUniforms,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.nebula = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 24), nebulaMat);
    // Se dibuja al final: el z-buffer del tunel descarta lo oculto (early-z)
    this.nebula.renderOrder = 10;
    this.nebula.frustumCulled = false;
    this.scene.add(this.nebula);
  }

  update(_dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.traveled += this.prevCamPos.distanceTo(camera.position);
    this.prevCamPos.copy(camera.position);

    this.tunnelUniforms.uTime.value = elapsed;
    this.tunnelUniforms.uScroll.value = this.traveled;
    this.nebulaUniforms.uTime.value = elapsed;

    // El tunel sigue a la camara; su orientacion persigue el rumbo con
    // suavidad, asi girar se siente como si el propio tunel se curvara
    this.tunnel.position.copy(camera.position);
    camera.getWorldDirection(tmpForward);
    tmpQuat.setFromUnitVectors(Z_AXIS, tmpForward);
    this.tunnel.quaternion.slerp(tmpQuat, 0.03);

    this.nebula.position.copy(camera.position);
  }
}
