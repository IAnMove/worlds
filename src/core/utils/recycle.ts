import * as THREE from 'three';

/**
 * Helpers para mundos infinitos: los elementos nunca se destruyen,
 * cuando quedan lejos/detras de la camara se recolocan delante.
 * Esto mantiene el numero de objetos constante y el GC en silencio.
 */

const tmpForward = new THREE.Vector3();
const tmpDelta = new THREE.Vector3();

/** Distancia horizontal (XZ) entre una posicion y la camara. */
export function distanceXZ(pos: THREE.Vector3, camera: THREE.Camera): number {
  const dx = pos.x - camera.position.x;
  const dz = pos.z - camera.position.z;
  return Math.hypot(dx, dz);
}

/** true si la posicion quedo detras de la camara mas alla de `margin`. */
export function isBehind(pos: THREE.Vector3, camera: THREE.Camera, margin: number): boolean {
  camera.getWorldDirection(tmpForward);
  tmpDelta.subVectors(pos, camera.position);
  return tmpDelta.dot(tmpForward) < -margin;
}

/**
 * Escribe en `out` una posicion nueva DELANTE de la camara (en el plano XZ),
 * a una distancia entre minDist y maxDist, dentro de un abanico de
 * `spreadAngle` radianes alrededor del rumbo actual.
 */
export function respawnAheadXZ(
  out: THREE.Vector3,
  camera: THREE.Camera,
  minDist: number,
  maxDist: number,
  spreadAngle: number,
  rng: () => number,
): void {
  camera.getWorldDirection(tmpForward);
  const heading = Math.atan2(tmpForward.x, tmpForward.z);
  const angle = heading + (rng() - 0.5) * spreadAngle;
  const dist = minDist + rng() * (maxDist - minDist);
  out.x = camera.position.x + Math.sin(angle) * dist;
  out.z = camera.position.z + Math.cos(angle) * dist;
}

/**
 * Envuelve `value` dentro de una ventana [center - half, center + half].
 * Util para nubes de particulas que deben seguir a la camara sin teletransportes visibles.
 */
export function wrapAround(value: number, center: number, half: number): number {
  const size = half * 2;
  let v = value;
  while (v < center - half) v += size;
  while (v > center + half) v -= size;
  return v;
}
