import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';

/**
 * EVENT HORIZON — caes hacia un agujero negro. Esfera negra (horizonte),
 * disco de acrecion incandescente que gira con brillo Doppler en un lado, y
 * anillo de fotones. El conjunto sigue a la camara para no perderlo de vista.
 */

const STAR_COUNT = 2600;

const DISK_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const DISK_FRAG = /* glsl */ `
uniform float uTime; varying vec2 vUv;
void main(){
  // RingGeometry uv: x = angulo [0,1], y = radio [0,1]
  float ang = vUv.x * 6.2831;
  float rad = vUv.y;
  float spiral = sin(ang*3.0 - rad*30.0 + uTime*3.0)*0.5+0.5;
  float heat = pow(1.0 - rad, 1.5);                 // mas caliente por dentro
  vec3 col = mix(vec3(1.0,0.9,0.6), vec3(1.0,0.35,0.05), rad);
  col *= 0.5 + spiral*0.8;
  col *= 0.6 + heat*1.6;
  float doppler = 0.5 + 0.5*cos(ang);               // un lado se acerca (mas brillo azulado)
  col += vec3(0.4,0.6,1.0) * pow(doppler,3.0) * 0.6;
  gl_FragColor = vec4(col, 1.0);
}`;

const tmpFwd = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();

export class BlackHoleWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 14,
    clearColor: 0x01010a,
    fogDensity: 0.0002,
    bloom: { strength: 1.1, radius: 0.85, threshold: 0.5 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private readonly rng = createRng(88231);
  private group!: THREE.Group;
  private diskU!: { [k: string]: THREE.IUniform };
  private stars!: THREE.Points;
  private starPos!: Float32Array;

  init(camera: THREE.PerspectiveCamera): void {
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Horizonte de sucesos
    const hole = new THREE.Mesh(new THREE.SphereGeometry(22, 48, 48), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
    this.group.add(hole);

    // Anillo de fotones (halo fino brillante)
    const photon = new THREE.Mesh(new THREE.RingGeometry(23, 27, 96), new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.group.add(photon);

    // Disco de acrecion
    this.diskU = { uTime: { value: 0 } };
    const disk = new THREE.Mesh(
      new THREE.RingGeometry(30, 120, 160, 1),
      new THREE.ShaderMaterial({ vertexShader: DISK_VERT, fragmentShader: DISK_FRAG, uniforms: this.diskU, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    disk.rotation.x = Math.PI * 0.46; // casi de canto
    this.group.add(disk);

    // Campo de estrellas envolvente
    this.starPos = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const dir = new THREE.Vector3(range(this.rng, -1, 1), range(this.rng, -1, 1), range(this.rng, -1, 1)).normalize().multiplyScalar(range(this.rng, 400, 800));
      this.starPos[i * 3] = dir.x; this.starPos[i * 3 + 1] = dir.y; this.starPos[i * 3 + 2] = dir.z;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(this.starPos, 3));
    this.stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.5, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    // Coloca el conjunto por delante de la mirada inicial
    camera.getWorldDirection(tmpFwd);
    this.group.position.copy(camera.position).addScaledVector(tmpFwd, 180);
  }

  update(_dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.diskU.uTime.value = elapsed;
    camera.getWorldDirection(tmpFwd);
    // El agujero negro se mantiene delante de la camara (siempre cayendo hacia el)
    tmpTarget.copy(camera.position).addScaledVector(tmpFwd, 180);
    this.group.position.lerp(tmpTarget, 0.02);
    this.group.rotation.z = elapsed * 0.04;
    this.stars.position.copy(camera.position);
  }
}
