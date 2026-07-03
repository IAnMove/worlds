import type { World } from '../core/World';
import { DataCityWorld } from './DataCityWorld';
import { MatrixWorld } from './MatrixWorld';
import { PsychedelicWorld } from './PsychedelicWorld';

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
  {
    id: 'data-city',
    name: 'Data City',
    tagline: 'La ciudad infinita de la informacion',
    accent: '#00e5ff',
    create: () => new DataCityWorld(),
  },
  {
    id: 'matrix',
    name: 'Matrix',
    tagline: 'Lluvia digital y arquitectura imposible',
    accent: '#39ff6e',
    create: () => new MatrixWorld(),
  },
  {
    id: 'psychedelic',
    name: 'Psychedelic Space',
    tagline: 'Un sueno abstracto sin final',
    accent: '#ff4dd8',
    create: () => new PsychedelicWorld(),
  },
];
