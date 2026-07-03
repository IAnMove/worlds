/**
 * Pool generico de objetos reutilizables. Para elementos que aparecen y
 * desaparecen (rafagas de particulas, paneles, paquetes de datos):
 * se crean todos al inicio y se piden/devuelven, nunca new en el bucle.
 */
export class ObjectPool<T> {
  private readonly free: T[] = [];
  readonly all: readonly T[];

  constructor(size: number, factory: (index: number) => T) {
    const all: T[] = [];
    for (let i = 0; i < size; i++) {
      const item = factory(i);
      all.push(item);
      this.free.push(item);
    }
    this.all = all;
  }

  /** null si el pool esta agotado: el llamador debe tolerarlo (no crear mas). */
  acquire(): T | null {
    return this.free.pop() ?? null;
  }

  release(item: T): void {
    this.free.push(item);
  }
}
