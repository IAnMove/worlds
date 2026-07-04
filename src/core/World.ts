import * as THREE from 'three';
import type { BloomSettings } from './PostFX';
import type { FlightBounds } from './FlightController';

/**
 * Configuracion declarativa de un mundo. El WorldManager la aplica
 * al entrar (niebla, fondo, velocidad de vuelo, bloom); el mundo
 * no toca el motor directamente.
 */
export interface WorldConfig {
  /** Velocidad de crucero del vuelo (unidades/segundo). */
  flySpeed: number;
  /** Color de fondo y de la niebla exponencial. */
  clearColor: number;
  fogDensity: number;
  bloom: BloomSettings;
  /** Posicion inicial de la camara (por defecto 0,12,0). */
  cameraStart?: THREE.Vector3;
  /**
   * Colliders invisibles: limites blandos que reconducen el vuelo hacia la
   * zona con contenido (rebote suave, nunca un tope seco). Sin definir = libre.
   */
  bounds?: FlightBounds;
}

/**
 * Clase base de todos los mundos. Un mundo es totalmente autonomo:
 * construye su escena en init(), la mantiene viva en update() y
 * libera GPU en dispose(). Para crear un mundo nuevo basta con
 * extender esta clase y registrarlo en worlds/registry.ts.
 *
 * Reglas para update():
 * - NO crear ni destruir objetos: reciclar (ver utils/recycle.ts)
 * - NO alocar Vector3/Matrix4 por frame: reutilizar temporales de modulo
 */
export abstract class World {
  readonly scene = new THREE.Scene();
  abstract readonly config: WorldConfig;

  /** Construye el contenido inicial. Se llama una vez al entrar. */
  abstract init(camera: THREE.PerspectiveCamera): void;

  /** Avance por frame: animar, reciclar elementos, generar sensacion de vida. */
  abstract update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void;

  /**
   * Opcional: empuje de esquiva. El mundo escribe en `out` un sesgo de rumbo
   * [-1,1] (x = guinada, y = cabeceo) que el FlightController suma al stick:
   * una corriente invisible que aparta el vuelo de los obstaculos.
   */
  steerBias?(camera: THREE.PerspectiveCamera, out: THREE.Vector2): void;

  /** Libera geometrias, materiales y texturas. Override solo si hay recursos extra. */
  dispose(): void {
    this.scene.traverse((obj) => {
      const anyObj = obj as THREE.Mesh;
      anyObj.geometry?.dispose();
      const mats = Array.isArray(anyObj.material)
        ? anyObj.material
        : anyObj.material
          ? [anyObj.material]
          : [];
      for (const mat of mats) {
        for (const value of Object.values(mat)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        mat.dispose();
      }
    });
    this.scene.clear();
  }
}
