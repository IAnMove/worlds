import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Parametros de bloom que cada mundo define en su WorldConfig. */
export interface BloomSettings {
  strength: number;
  radius: number;
  threshold: number;
}

/**
 * Cadena de postprocesado compartida: render -> bloom -> salida.
 * Si un mundo futuro necesita pases propios, se anadiran aqui
 * de forma configurable, nunca dentro del mundo.
 */
export class PostFX {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloomPass: UnrealBloomPass;
  private scene: THREE.Scene | null = null;
  private w = 1;
  private h = 1;

  constructor(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(new THREE.Scene(), camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.6, 0.8);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  setScene(scene: THREE.Scene | null): void {
    this.scene = scene;
    if (scene) this.renderPass.scene = scene;
  }

  setBloom(settings: BloomSettings): void {
    this.bloomPass.strength = settings.strength;
    this.bloomPass.radius = settings.radius;
    this.bloomPass.threshold = settings.threshold;
  }

  setSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.composer.setSize(w, h);
  }

  /**
   * Escala interna de render (resolucion dinamica). El bloom y toda la
   * escena cuestan por pixel: bajar esto en mundos pesados recupera fluidez.
   */
  setPixelRatio(pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(this.w, this.h);
  }

  render(dt: number): void {
    if (!this.scene) return;
    this.composer.render(dt);
  }
}
