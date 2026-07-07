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

  // Resolucion dinamica: el tope depende de la pantalla, pero si un mundo va
  // pesado se baja la escala para no perder fluidez (y se recupera al aflojar).
  private readonly basePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  private resScale = 1;
  private emaFrame = 1 / 60; // tiempo de frame suavizado (EMA)
  private sinceAdjust = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
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
    this.adapt(dt);
    this.onUpdate?.(dt, this.elapsed);
    this.postfx.render(dt);
  }

  /** Ajusta la escala de render segun el ritmo de frames medido. */
  private adapt(dt: number): void {
    if (dt < 1 / 12) this.emaFrame = this.emaFrame * 0.9 + dt * 0.1;
    this.sinceAdjust += dt;
    if (this.sinceAdjust < 0.5) return;
    this.sinceAdjust = 0;

    const MIN_SCALE = 0.6;
    let s = this.resScale;
    if (this.emaFrame > 1 / 50 && s > MIN_SCALE) {
      s = Math.max(MIN_SCALE, s - 0.1); // por debajo de ~50fps: bajar
    } else if (this.emaFrame < 1 / 58 && s < 1) {
      s = Math.min(1, s + 0.08); // con holgura: subir de nuevo
    }
    if (s !== this.resScale) {
      this.resScale = s;
      this.applyResolution();
    }
  }

  private applyResolution(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = this.basePixelRatio * this.resScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.postfx.setPixelRatio(pr);
    this.postfx.setSize(w, h);
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyResolution();
  }
}
