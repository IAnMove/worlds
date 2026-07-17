import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';

/**
 * PULSAR — una estrella de neutrones gira barriendo el vacio con dos haces de
 * luz opuestos, como un faro cosmico. El eje magnetico esta muy inclinado
 * respecto al de giro, asi los haces precesan y cada vuelta barren la camara:
 * en ese instante el nucleo destella (el "pulso"). Disco de acrecion ecuatorial
 * y campo de estrellas denso alrededor.
 */

const STAR_COUNT = 3000;
const BEAM_LEN = 560;

// Haz volumetrico: brilla en su silueta (fresnel) y se apaga hacia la punta,
// asi lee como un cono de luz translucido y no como un triangulo plano.
const BEAM_VERT = /* glsl */ `
varying float vLen; varying float vFres;
void main(){
  vLen = position.y / ${BEAM_LEN}.0;
  vec3 n = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFres = pow(1.0 - abs(dot(n, normalize(-mv.xyz))), 1.5);
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uFlash;
varying float vLen; varying float vFres;
void main(){
  float lenFade = 1.0 - smoothstep(0.0, 1.0, vLen);   // brillante junto a la estrella
  float a = vFres * lenFade * (0.35 + uFlash * 1.5);
  vec3 col = uColor * (0.7 + uFlash * 2.2);
  gl_FragColor = vec4(col, a);
}`;

const tmpVec = new THREE.Vector3();

export class PulsarWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 18,
    clearColor: 0x02020a,
    fogDensity: 0.0004,
    bloom: { strength: 1.1, radius: 0.9, threshold: 0.5 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private readonly rng = createRng(19677);
  private system!: THREE.Group;
  private core!: THREE.Mesh;
  private halo!: THREE.Mesh;
  private beams!: THREE.Group;
  private beamU!: { [k: string]: THREE.IUniform };
  private ring!: THREE.Mesh;
  private stars!: THREE.Points;

  init(): void {
    this.system = new THREE.Group();
    this.scene.add(this.system);

    this.core = new THREE.Mesh(new THREE.SphereGeometry(16, 32, 32), new THREE.MeshBasicMaterial({ color: 0xdaf0ff, fog: false }));
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 24), new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.system.add(this.core, this.halo);

    // Disco de acrecion ecuatorial (perpendicular al eje de giro vertical)
    const ringGeo = new THREE.RingGeometry(38, 115, 64);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x3f6cff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.ring.frustumCulled = false;
    this.system.add(this.ring);

    // Dos haces opuestos que precesan alrededor del eje de giro
    this.beams = new THREE.Group();
    this.beamU = { uColor: { value: new THREE.Color(0x9cc8ff) }, uFlash: { value: 0 } };
    const beamMat = new THREE.ShaderMaterial({ vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, uniforms: this.beamU, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beamGeo = new THREE.ConeGeometry(80, BEAM_LEN, 32, 1, true);
    beamGeo.translate(0, -BEAM_LEN / 2, 0); // apice (punta) en el origen, junto a la estrella
    beamGeo.rotateX(Math.PI);               // base (ancha) lejos, hacia +Y
    const b1 = new THREE.Mesh(beamGeo, beamMat);
    const b2 = new THREE.Mesh(beamGeo, beamMat);
    b2.rotation.x = Math.PI;                 // haz opuesto (-Y)
    b1.frustumCulled = b2.frustumCulled = false;
    this.beams.add(b1, b2);
    this.beams.rotation.z = 1.35;            // eje magnetico casi horizontal -> barrido amplio
    this.system.add(this.beams);

    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      tmpVec.set(range(this.rng, -1, 1), range(this.rng, -1, 1), range(this.rng, -1, 1)).normalize().multiplyScalar(range(this.rng, 350, 820));
      positions[i * 3] = tmpVec.x; positions[i * 3 + 1] = tmpVec.y; positions[i * 3 + 2] = tmpVec.z;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.4, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  update(_dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.system.position.set(camera.position.x, camera.position.y + 20, camera.position.z - 340);
    this.stars.position.copy(camera.position);

    const spin = elapsed * 1.5;
    this.beams.rotation.y = spin;
    // El haz apunta a la camara dos veces por vuelta -> destello agudo (el pulso)
    const flash = Math.pow(Math.abs(Math.sin(spin)), 8);
    this.beamU.uFlash.value = flash;
    const b = 0.82 + flash * 0.7;
    (this.core.material as THREE.MeshBasicMaterial).color.setRGB(b, b, 1.0);
    (this.halo.material as THREE.MeshBasicMaterial).opacity = 0.28 + flash * 0.55;
    this.core.scale.setScalar(1 + flash * 0.25);
  }
}
