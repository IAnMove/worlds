import * as THREE from 'three';

/**
 * Sprite circular suave generado por codigo (degradado radial en canvas 2D).
 * Como `map` de un PointsMaterial/SpriteMaterial convierte los puntos
 * cuadrados en particulas redondas con halo, listas para el bloom.
 *
 * Crear UNA por mundo (World.dispose ya la libera via material.map);
 * no compartirla entre mundos.
 */
export function makeGlowSprite(size = 64, softness = 0.35): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(softness, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
