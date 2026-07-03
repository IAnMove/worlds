/**
 * HUD minimalista durante el viaje: nombre del mundo y boton de volver.
 * Nada mas: la inmersion manda.
 */
export class HUD {
  onBack: (() => void) | null = null;

  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud hidden';

    this.title = document.createElement('div');
    this.title.className = 'hud-title';

    const back = document.createElement('button');
    back.className = 'hud-back';
    back.textContent = '‹ menu';
    back.addEventListener('click', () => this.onBack?.());

    this.root.append(back, this.title);
    container.appendChild(this.root);
  }

  show(worldName: string): void {
    this.title.textContent = worldName;
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
