import type { World } from '../core/World';
import { AsteroidWorld } from './AsteroidWorld';
import { CircuitWorld } from './CircuitWorld';
import { ClockworkWorld } from './ClockworkWorld';
import { CloudSeaWorld } from './CloudSeaWorld';
import { DataCityWorld } from './DataCityWorld';
import { FieldWorld } from './FieldWorld';
import { GalaxyWorld } from './GalaxyWorld';
import { KaleidoscopeWorld } from './KaleidoscopeWorld';
import { MandelbulbWorld } from './MandelbulbWorld';
import { MatrixWorld } from './MatrixWorld';
import { MetaballWorld } from './MetaballWorld';
import { NeuralWorld } from './NeuralWorld';
import { OutrunWorld } from './OutrunWorld';
import { PsychedelicWorld } from './PsychedelicWorld';
import { PyramidWorld } from './PyramidWorld';
import { SnowForestWorld } from './SnowForestWorld';
import { SynthwaveWorld } from './SynthwaveWorld';
import { VolcanoWorld } from './VolcanoWorld';
import { WormholeWorld } from './WormholeWorld';

/**
 * Catalogo de mundos. Para anadir un mundo nuevo:
 *   1. Crear la clase en worlds/ extendiendo World
 *   2. Anadir una entrada aqui
 * Nada mas: el menu, las transiciones y el ciclo de vida son automaticos.
 */
export interface WorldDefinition {
  id: string;
  name: string;
  tagline: string;
  /** Color CSS de acento para la tarjeta del menu. */
  accent: string;
  create(): World;
}

export const WORLDS: readonly WorldDefinition[] = [
  { id: 'data-city', name: 'Data City', tagline: 'La ciudad infinita de la informacion', accent: '#00e5ff', create: () => new DataCityWorld() },
  { id: 'matrix', name: 'Matrix', tagline: 'Lluvia digital y arquitectura imposible', accent: '#39ff6e', create: () => new MatrixWorld() },
  { id: 'psychedelic', name: 'Psychedelic Space', tagline: 'Un sueno abstracto sin final', accent: '#ff4dd8', create: () => new PsychedelicWorld() },
  { id: 'outrun', name: 'Violet Drive', tagline: 'Carretera de neon hacia el sol infinito', accent: '#b26bff', create: () => new OutrunWorld() },
  { id: 'synthwave', name: 'Neon Horizon', tagline: 'Rejilla de neon hacia un sol de bandas', accent: '#ff2e97', create: () => new SynthwaveWorld() },
  { id: 'pyramid-dusk', name: 'Pyramid Dusk', tagline: 'Piramides, meteoritos y cielo en llamas', accent: '#ff8c1a', create: () => new PyramidWorld() },
  { id: 'wormhole', name: 'Wormhole', tagline: 'Caida infinita por un agujero de gusano', accent: '#7d5cff', create: () => new WormholeWorld() },
  { id: 'galaxy', name: 'Spiral Galaxy', tagline: 'Vuelo a traves de una galaxia espiral', accent: '#a9c4ff', create: () => new GalaxyWorld() },
  { id: 'asteroids', name: 'Asteroid Belt', tagline: 'El cinturon y un planeta anillado', accent: '#c9b79a', create: () => new AsteroidWorld() },
  { id: 'cloud-sea', name: 'Cloud Sea', tagline: 'Sobre un mar de nubes al amanecer', accent: '#ffb98a', create: () => new CloudSeaWorld() },
  { id: 'volcano', name: 'Volcano', tagline: 'Rios de lava y erupciones de luz', accent: '#ff5a1e', create: () => new VolcanoWorld() },
  { id: 'field', name: 'Golden Field', tagline: 'Campo de trigo al viento, hora dorada', accent: '#ffcf40', create: () => new FieldWorld() },
  { id: 'snow-forest', name: 'Snow Forest', tagline: 'Bosque de pinos nevado bajo la luna', accent: '#cfe6ff', create: () => new SnowForestWorld() },
  { id: 'circuit', name: 'Circuit Board', tagline: 'Placa base infinita con pulsos de datos', accent: '#35ffa6', create: () => new CircuitWorld() },
  { id: 'neural', name: 'Neural Net', tagline: 'Dentro de una red de neuronas que dispara', accent: '#66d9ff', create: () => new NeuralWorld() },
  { id: 'fractal', name: 'Fractal', tagline: 'Inmersion en mandelbulbs infinitos', accent: '#66ffcc', create: () => new MandelbulbWorld() },
  { id: 'lava-lamp', name: 'Lava Lamp', tagline: 'Metaballs iridiscentes que se funden', accent: '#ff77e0', create: () => new MetaballWorld() },
  { id: 'kaleidoscope', name: 'Kaleidoscope', tagline: 'Simetria radial hipnotica sin fin', accent: '#ff4d6d', create: () => new KaleidoscopeWorld() },
  { id: 'clockwork', name: 'Clockwork', tagline: 'Un mecanismo de engranajes infinito', accent: '#e0b050', create: () => new ClockworkWorld() },
];
