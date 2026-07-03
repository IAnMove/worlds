import type { WorldDefinition } from '../worlds/registry';

/**
 * Pantalla inicial: titulo + tarjetas de mundos.
 * Las previews animadas por tarjeta (mini escenas WebGL) son la tarea 7;
 * de momento cada tarjeta lleva un degradado animado con el color del mundo.
 */
export class Menu {
  onSelect: ((def: WorldDefinition) => void) | null = null;

  private readonly root: HTMLDivElement;

  constructor(container: HTMLElement, worlds: readonly WorldDefinition[]) {
    this.root = document.createElement('div');
    this.root.className = 'menu';

    const header = document.createElement('header');
    header.className = 'menu-header';
    header.innerHTML = `
      <h1 class="menu-title">goldenidea</h1>
      <p class="menu-subtitle">viajes procedurales por el ciberespacio</p>
    `;

    const grid = document.createElement('div');
    grid.className = 'menu-grid';

    for (const def of worlds) {
      grid.appendChild(this.buildCard(def));
    }

    this.root.append(header, grid);
    container.appendChild(this.root);
  }

  private buildCard(def: WorldDefinition): HTMLButtonElement {
    const card = document.createElement('button');
    card.className = 'card';
    card.style.setProperty('--accent', def.accent);
    // El div .card-preview es el hueco donde la tarea 7 montara la preview animada
    card.innerHTML = `
      <div class="card-preview" data-world="${def.id}"></div>
      <div class="card-body">
        <h2 class="card-name">${def.name}</h2>
        <p class="card-tagline">${def.tagline}</p>
      </div>
    `;
    card.addEventListener('click', () => this.onSelect?.(def));
    return card;
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
