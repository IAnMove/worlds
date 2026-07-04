import * as THREE from 'three';

const { damp, clamp } = THREE.MathUtils;

/** Limites blandos del mundo (colliders invisibles). Ver WorldConfig.bounds. */
export interface FlightBounds {
  minY?: number;
  maxY?: number;
  /** Anchura de la zona colchon donde se empieza a empujar (def. 20). */
  margin?: number;
}

/**
 * Vuelo cinematografico en primera persona:
 * - avance constante hacia delante (velocidad fijada por el mundo)
 * - el raton orienta el rumbo con inercia (no hay controles de videojuego)
 * - con pointer lock: deltas de raton mueven un "stick" virtual que se
 *   auto-centra; al soltar el raton, el rumbo vuelve solo a estabilizarse
 * - al quedar idle, deriva suave y "respiracion" automatica
 * - limites blandos: cerca de un limite el morro se reconduce y un colchon
 *   empuja la posicion — rebote suave y deslizamiento, nunca un choque seco
 */
export class FlightController {
  /** Unidades por segundo; cada mundo fija la suya via WorldConfig. */
  speed = 20;
  enabled = false;
  bounds: FlightBounds | null = null;

  /** Segundos sin mover el raton antes de pasar a deriva automatica. */
  private static readonly IDLE_AFTER = 2.5;
  private static readonly MAX_PITCH = Math.PI * 0.35;
  private static readonly TURN_RATE = 0.9; // rad/s a desviacion maxima
  private static readonly DEADZONE = 0.06;
  private static readonly LOCK_SENS = 1 / 350; // px de raton -> stick virtual

  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private yawVel = 0;
  private pitchVel = 0;

  /** Stick virtual [-1,1]: posicion absoluta del raton o acumulado de deltas. */
  private readonly stick = new THREE.Vector2();
  private lastMouseMove = -Infinity;

  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly forward = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    window.addEventListener('pointermove', (e) => {
      if (document.pointerLockElement) {
        // Pointer lock: deltas acumulados en el stick virtual
        this.stick.x = clamp(this.stick.x + e.movementX * FlightController.LOCK_SENS, -1, 1);
        this.stick.y = clamp(this.stick.y + e.movementY * FlightController.LOCK_SENS, -1, 1);
      } else {
        // Sin lock: posicion normalizada respecto al centro de pantalla
        this.stick.set(
          (e.clientX / window.innerWidth) * 2 - 1,
          (e.clientY / window.innerHeight) * 2 - 1,
        );
      }
      this.lastMouseMove = performance.now() / 1000;
    });
  }

  /** Coloca la camara en el origen mirando a -Z. Se llama al entrar a un mundo. */
  reset(position = new THREE.Vector3(0, 12, 0)): void {
    this.camera.position.copy(position);
    this.yaw = this.pitch = this.roll = 0;
    this.yawVel = this.pitchVel = 0;
    this.stick.set(0, 0);
    this.lastMouseMove = -Infinity;
  }

  update(dt: number, elapsed: number): void {
    if (!this.enabled) return;

    const now = performance.now() / 1000;
    const idle = now - this.lastMouseMove > FlightController.IDLE_AFTER;

    // El stick se auto-centra: si dejas el raton quieto, el giro se apaga
    // solo y el vuelo vuelve a estabilizarse (pedido del usuario)
    if (document.pointerLockElement) {
      this.stick.multiplyScalar(Math.exp(-0.7 * dt));
    }

    let steerX: number;
    let steerY: number;
    if (idle) {
      // Deriva "viva": senos desfasados + recuperacion firme del horizonte
      steerX = Math.sin(elapsed * 0.13) * 0.28 + Math.sin(elapsed * 0.047) * 0.18;
      steerY = Math.sin(elapsed * 0.09 + 1.7) * 0.08 - this.pitch * 0.9;
    } else {
      steerX = applyDeadzone(this.stick.x, FlightController.DEADZONE);
      steerY = applyDeadzone(this.stick.y, FlightController.DEADZONE);
    }

    // La desviacion del stick fija una velocidad angular objetivo;
    // damp() aporta la inercia (aceleracion y frenada suaves).
    this.yawVel = damp(this.yawVel, -steerX * FlightController.TURN_RATE, 2.5, dt);
    this.pitchVel = damp(this.pitchVel, -steerY * FlightController.TURN_RATE * 0.55, 2.5, dt);

    // Limites blandos: reconducir el morro antes de tocar el limite
    this.applyBoundsSteering(dt);

    this.yaw += this.yawVel * dt;
    this.pitch = clamp(
      this.pitch + this.pitchVel * dt,
      -FlightController.MAX_PITCH,
      FlightController.MAX_PITCH,
    );
    // Alabeo proporcional al giro, como un avion inclinandose en las curvas
    this.roll = damp(this.roll, this.yawVel * 0.6, 3, dt);

    this.euler.set(this.pitch, this.yaw, this.roll);
    this.camera.quaternion.setFromEuler(this.euler);

    this.camera.getWorldDirection(this.forward);
    // Respiracion: variacion sutil de velocidad + bob vertical en idle
    const breathe = idle ? 1 + Math.sin(elapsed * 0.5) * 0.06 : 1;
    this.camera.position.addScaledVector(this.forward, this.speed * breathe * dt);
    if (idle) this.camera.position.y += Math.sin(elapsed * 0.47) * 0.35 * dt;

    this.applyBoundsCushion(dt);
  }

  /** Empuje angular: cerca del limite, el morro gira suavemente hacia dentro. */
  private applyBoundsSteering(dt: number): void {
    if (!this.bounds) return;
    const m = this.bounds.margin ?? 20;
    const y = this.camera.position.y;
    if (this.bounds.minY !== undefined) {
      const k = clamp((this.bounds.minY + m - y) / m, 0, 1.5);
      if (k > 0) this.pitchVel += k * k * 1.4 * dt;
    }
    if (this.bounds.maxY !== undefined) {
      const k = clamp((y - (this.bounds.maxY - m)) / m, 0, 1.5);
      if (k > 0) this.pitchVel -= k * k * 1.4 * dt;
    }
  }

  /** Colchon posicional: rebote blando + deslizamiento a lo largo del limite. */
  private applyBoundsCushion(dt: number): void {
    if (!this.bounds) return;
    const m = this.bounds.margin ?? 20;
    const p = this.camera.position;
    if (this.bounds.minY !== undefined) {
      const k = clamp((this.bounds.minY + m - p.y) / m, 0, 1);
      if (k > 0) p.y += k * k * this.speed * 0.55 * dt;
      if (p.y < this.bounds.minY) p.y = this.bounds.minY; // ultimo recurso
    }
    if (this.bounds.maxY !== undefined) {
      const k = clamp((p.y - (this.bounds.maxY - m)) / m, 0, 1);
      if (k > 0) p.y -= k * k * this.speed * 0.55 * dt;
      if (p.y > this.bounds.maxY) p.y = this.bounds.maxY;
    }
  }
}

function applyDeadzone(v: number, dz: number): number {
  const a = Math.abs(v);
  if (a < dz) return 0;
  return Math.sign(v) * ((a - dz) / (1 - dz));
}
