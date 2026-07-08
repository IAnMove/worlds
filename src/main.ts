import { Engine } from './core/Engine';
import { FlightController } from './core/FlightController';
import { WorldManager } from './core/WorldManager';
import { Menu } from './ui/Menu';
import { HUD } from './ui/HUD';
import { Transition } from './ui/Transition';
import { WORLDS } from './worlds/registry';

const canvas = document.querySelector<HTMLCanvasElement>('#gl')!;
const ui = document.querySelector<HTMLElement>('#ui')!;

const engine = new Engine(canvas);
const flight = new FlightController(engine.camera);
const menu = new Menu(ui, WORLDS);
const hud = new HUD(ui);
const transition = new Transition(ui);

new WorldManager(engine, flight, menu, hud, transition);

engine.start();

// Modo captura de miniaturas: ?shot=<id> entra directo a un mundo y avisa
// cuando la escena ya se ha animado (lo usa scripts/thumbnails.mjs).
const shotId = new URLSearchParams(location.search).get('shot');
if (shotId) {
  const def = WORLDS.find((w) => w.id === shotId);
  if (def) {
    setTimeout(() => menu.onSelect?.(def), 150);
    setTimeout(() => {
      (window as unknown as { __shotReady?: boolean }).__shotReady = true;
    }, 2600);
  }
}
