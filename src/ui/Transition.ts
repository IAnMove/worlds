/**
 * Fundido a negro entre menu y mundos. Es deliberadamente simple;
 * la version cinematografica (con rampa de FOV y velocidad) es la tarea 8.
 */
export class Transition {
  private readonly el: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'transition';
    // Inline para ganar a la regla `#ui > * { pointer-events: auto }`
    this.el.style.pointerEvents = 'none';
    container.appendChild(this.el);
  }

  /** Oscurece la pantalla. Resuelve cuando el fundido termina. */
  fadeOut(): Promise<void> {
    return this.animateTo(1);
  }

  /** Revela la pantalla. */
  fadeIn(): Promise<void> {
    return this.animateTo(0);
  }

  private animateTo(opacity: number): Promise<void> {
    this.el.style.pointerEvents = opacity > 0 ? 'auto' : 'none';
    this.el.style.opacity = String(opacity);
    return new Promise((resolve) => {
      const done = () => {
        this.el.removeEventListener('transitionend', done);
        resolve();
      };
      this.el.addEventListener('transitionend', done);
      // Red de seguridad por si transitionend no llega (pestana oculta, etc.)
      setTimeout(done, 900);
    });
  }
}
