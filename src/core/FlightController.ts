import * as THREE from 'three';

const { damp, clamp } = THREE.MathUtils;

/**
 * Vuelo cinematografico en primera persona:
 * - avance constante hacia delante (velocidad fijada por el mundo)
 * - el raton orienta el rumbo con inercia (no hay controles de videojuego)
 * - al soltar el raton, deriva suave y "respiracion" automatica
 * - alabeo (banking) sutil al girar
 */
export class FlightController {
  /** Unidades por segundo; cada mundo fija la suya via WorldConfig. */
  speed = 20;
  enabled = false;

  /** Segundos sin mover el raton antes de pasar a deriva automatica. */
  private static readonly IDLE_AFTER = 2.5;
  private static readonly MAX_PITCH = Math.PI * 0.35;
  private static readonly TURN_RATE = 0.9; // rad/s a desviacion maxima del raton
  private static readonly DEADZONE = 0.06;

  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private yawVel = 0;
  private pitchVel = 0;

  private readonly mouse = new THREE.Vector2();
  private lastMouseMove = -Infinity;

  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly forward = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    window.addEventListener('pointermove', (e) => {
      // Coordenadas normalizadas [-1, 1] respecto al centro de pantalla
      this.mouse.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1,
      );
      this.lastMouseMove = performance.now() / 1000;
    });
  }

  /** Coloca la camara en el origen mirando a -Z. Se llama al entrar a un mundo. */
  reset(position = new THREE.Vector3(0, 12, 0)): void {
    this.camera.position.copy(position);
    this.yaw = this.pitch = this.roll = 0;
    this.yawVel = this.pitchVel = 0;
    this.lastMouseMove = -Infinity;
  }

  update(dt: number, elapsed: number): void {
    if (!this.enabled) return;

    const now = performance.now() / 1000;
    const idle = now - this.lastMouseMove > FlightController.IDLE_AFTER;

    let steerX: number;
    let steerY: number;
    if (idle) {
      // Deriva "viva": suma de senos desfasados, nunca se repite de forma obvia
      steerX = Math.sin(elapsed * 0.13) * 0.28 + Math.sin(elapsed * 0.047) * 0.18;
      steerY = Math.sin(elapsed * 0.09 + 1.7) * 0.1 - this.pitch * 0.35;
    } else {
      steerX = applyDeadzone(this.mouse.x, FlightController.DEADZONE);
      steerY = applyDeadzone(this.mouse.y, FlightController.DEADZONE);
    }

    // La desviacion del raton fija una velocidad angular objetivo;
    // damp() aporta la inercia (aceleracion y frenada suaves).
    this.yawVel = damp(this.yawVel, -steerX * FlightController.TURN_RATE, 2.5, dt);
    this.pitchVel = damp(this.pitchVel, -steerY * FlightController.TURN_RATE * 0.55, 2.5, dt);

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
    this.camera.position.addScaledVector(this.forward, this.speed * dt);
  }
}

function applyDeadzone(v: number, dz: number): number {
  const a = Math.abs(v);
  if (a < dz) return 0;
  return Math.sign(v) * ((a - dz) / (1 - dz));
}
