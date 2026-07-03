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
