import * as THREE from 'three';
import { PostFX } from './PostFX';

/**
 * Nucleo del motor: renderer, camara, bucle de animacion y postprocesado.
 * Hay un unico Engine para toda la aplicacion; los mundos no crean
 * renderers ni camaras, reciben las de aqui.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly postfx: PostFX;

  /** Callback por frame; lo conecta WorldManager. */
  onUpdate: ((dt: number, elapsed: number) => void) | null = null;

  private readonly clock = new THREE.Clock();
  private elapsed = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    // Limite de pixelRatio: en pantallas 4K/retina el coste crece al cuadrado
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    // near 0.5: con near 0.1 la precision del z-buffer a centenares de
    // unidades produce z-fighting (slivers) en geometria que se auto-ocluye
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.5, 1200);

    this.postfx = new PostFX(this.renderer, this.camera);

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  /** Escena activa a renderizar. `null` = solo se ve la UI. */
  setScene(scene: THREE.Scene | null): void {
    this.postfx.setScene(scene);
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private tick(): void {
    // dt acotado: evita saltos enormes al volver de una pestana en segundo plano
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.elapsed += dt;
    this.onUpdate?.(dt, this.elapsed);
    this.postfx.render(dt);
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.postfx.setSize(w, h);
  }
}
