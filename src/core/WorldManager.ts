import * as THREE from 'three';
import { Engine } from './Engine';
import { FlightController } from './FlightController';
import { World } from './World';
import type { WorldDefinition } from '../worlds/registry';
import { Menu } from '../ui/Menu';
import { HUD } from '../ui/HUD';
import { Transition } from '../ui/Transition';

/**
 * Orquesta el ciclo de vida: menu -> transicion -> mundo -> transicion -> menu.
 * Es el unico sitio que conoce a la vez el motor, la UI y los mundos.
 */
export class WorldManager {
  private current: World | null = null;
  private busy = false;

  constructor(
    private readonly engine: Engine,
    private readonly flight: FlightController,
    private readonly menu: Menu,
    private readonly hud: HUD,
    private readonly transition: Transition,
  ) {
    engine.onUpdate = (dt, elapsed) => this.update(dt, elapsed);
    menu.onSelect = (def) => void this.enter(def);
    hud.onBack = () => void this.exitToMenu();
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') void this.exitToMenu();
    });
  }

  private async enter(def: WorldDefinition): Promise<void> {
    if (this.busy || this.current) return;
    this.busy = true;

    await this.transition.fadeOut();
    this.menu.hide();

    const world = def.create();
    const cfg = world.config;
    world.scene.background = new THREE.Color(cfg.clearColor);
    world.scene.fog = new THREE.FogExp2(cfg.clearColor, cfg.fogDensity);

    this.flight.reset(cfg.cameraStart);
    this.flight.speed = cfg.flySpeed;
    world.init(this.engine.camera);

    this.engine.postfx.setBloom(cfg.bloom);
    this.engine.setScene(world.scene);
    this.current = world;
    this.flight.enabled = true;
    this.hud.show(def.name);

    await this.transition.fadeIn();
    this.busy = false;
  }

  private async exitToMenu(): Promise<void> {
    if (this.busy || !this.current) return;
    this.busy = true;

    await this.transition.fadeOut();

    this.flight.enabled = false;
    this.hud.hide();
    this.engine.setScene(null);
    this.current.dispose();
    this.current = null;

    this.menu.show();
    await this.transition.fadeIn();
    this.busy = false;
  }

  private update(dt: number, elapsed: number): void {
    if (!this.current) return;
    this.flight.update(dt, elapsed);
    this.current.update(dt, elapsed, this.engine.camera);
  }
}
