import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { distanceXZ, isBehind, respawnAheadXZ, wrapAround } from '../core/utils/recycle';

/**
 * PYRAMID DUSK — desierto azul oscuro con piramides, fuego y formas cosmicas.
 *
 * - Piramides: un InstancedMesh reciclado hacia delante
 * - Aristas: pool fijo de LineSegments pegado a las primeras instancias
 * - Tentaculos: TubeGeometry fija, buffer de posiciones reescrito al reciclar
 * - Ascuas y estrellas: puntos persistentes envueltos alrededor de la camara
 */

const PYRAMID_COUNT = 240;
const PYRAMID_RADIUS = 520;
const EDGE_COUNT = 24;
const TENTACLE_COUNT = 10;
const TENTACLE_POINTS = 6;
const TENTACLE_SEGMENTS = 64;
const TENTACLE_RADIAL = 8;
const EMBER_COUNT = 700;
const EMBER_HALF = 90;
const STAR_COUNT = 900;

// Meteoritos: caen del cielo, impactan el suelo y lo iluminan con un fogonazo
const METEOR_COUNT = 4;
const METEOR_FLASH_DUR = 1.1;   // duracion del destello tras el impacto (s)
const METEOR_FLASH_PEAK = 6500; // intensidad pico de la luz de impacto
const METEOR_FALL_GLOW = 500;   // luz de la bola mientras cae
const METEOR_RING_MAX = 90;     // radio final de la onda de choque

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const tmpColor = new THREE.Color();
const tmpEuler = new THREE.Euler();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const RING_COS = new Float32Array(TENTACLE_RADIAL + 1);
const RING_SIN = new Float32Array(TENTACLE_RADIAL + 1);
for (let i = 0; i <= TENTACLE_RADIAL; i++) {
  const a = (i / TENTACLE_RADIAL) * Math.PI * 2;
  RING_COS[i] = Math.cos(a);
  RING_SIN[i] = Math.sin(a);
}

interface Tentacle {
  mesh: THREE.Mesh<THREE.TubeGeometry, THREE.MeshStandardMaterial>;
  curve: THREE.CatmullRomCurve3;
  phase: number;
  anchor: THREE.Vector3;
}

interface Meteor {
  state: 'fall' | 'flash' | 'idle';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  impact: THREE.Vector3;
  timer: number;
  light: THREE.PointLight;
  head: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

export class PyramidWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 26,
    clearColor: 0x0b0a26,
    fogDensity: 0.0072,
    bloom: { strength: 0.9, radius: 0.6, threshold: 0.55 },
    cameraStart: new THREE.Vector3(0, 18, 0),
    bounds: { minY: 8, maxY: 160, margin: 24 },
  };

  private readonly rng = createRng(9314);

  private pyramids!: THREE.InstancedMesh;
  private readonly positions: THREE.Vector3[] = [];
  private readonly bases = new Float32Array(PYRAMID_COUNT);
  private readonly heights = new Float32Array(PYRAMID_COUNT);
  private readonly yaws = new Float32Array(PYRAMID_COUNT);

  private readonly edgeLines: THREE.LineSegments[] = [];

  private ground!: THREE.Mesh;
  private readonly tentacles: Tentacle[] = [];
  private readonly meteors: Meteor[] = [];

  private embers!: THREE.Points;
  private emberPositions!: Float32Array;
  private readonly emberBaseX = new Float32Array(EMBER_COUNT);
  private readonly emberBaseY = new Float32Array(EMBER_COUNT);
  private readonly emberBaseZ = new Float32Array(EMBER_COUNT);
  private readonly emberPhase = new Float32Array(EMBER_COUNT);
  private readonly emberFreq = new Float32Array(EMBER_COUNT);
  private readonly emberRise = new Float32Array(EMBER_COUNT);

  private stars!: THREE.Points;

  init(camera: THREE.PerspectiveCamera): void {
    // Luz de cielo/suelo: da volumen sin aplanar la escena
    this.scene.add(new THREE.HemisphereLight(0x3a4c8c, 0x241436, 0.85));
    this.scene.add(new THREE.AmbientLight(0x1c2a5a, 0.45));

    // Sol de ocaso rasante, mas presente que antes
    const sun = new THREE.DirectionalLight(0xff8c3a, 1.9);
    sun.position.set(0.3, 0.22, -1).normalize();
    this.scene.add(sun);

    this.initGround();
    this.initPyramids(camera);
    this.initEdges();
    this.initTentacles(camera);
    this.initMeteors();
    this.initEmbers(camera);
    this.initStars(camera);
  }

  // ------------------------------------------------------------- piramides

  private initPyramids(camera: THREE.PerspectiveCamera): void {
    const geo = new THREE.ConeGeometry(1, 1, 4);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x16305c,
      roughness: 0.65,
      metalness: 0.04,
      flatShading: true,
    });
    this.pyramids = new THREE.InstancedMesh(geo, mat, PYRAMID_COUNT);
    this.pyramids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pyramids.frustumCulled = false;

    for (let i = 0; i < PYRAMID_COUNT; i++) {
      this.positions.push(new THREE.Vector3());
      this.placePyramid(i, camera, true);
    }
    this.pyramids.instanceMatrix.needsUpdate = true;
    if (this.pyramids.instanceColor) this.pyramids.instanceColor.needsUpdate = true;
    this.scene.add(this.pyramids);
  }

  private placePyramid(i: number, camera: THREE.PerspectiveCamera, initial: boolean): void {
    const pos = this.positions[i];
    for (let attempt = 0; attempt < 6; attempt++) {
      if (initial) {
        pos.set(
          camera.position.x + range(this.rng, -PYRAMID_RADIUS, PYRAMID_RADIUS),
          0,
          camera.position.z + range(this.rng, -PYRAMID_RADIUS, PYRAMID_RADIUS),
        );
      } else {
        respawnAheadXZ(pos, camera, PYRAMID_RADIUS * 0.45, PYRAMID_RADIUS * 0.95, Math.PI * 0.9, this.rng);
        pos.y = 0;
      }
      if (this.lateralDistanceToFlight(pos, camera) > 30 || attempt === 5) break;
    }

    const base = range(this.rng, 18, 80);
    const height = base * range(this.rng, 0.7, 1.1);
    this.bases[i] = base;
    this.heights[i] = height;
    this.yaws[i] = Math.floor(this.rng() * 8) * (Math.PI / 4);
    this.writePyramid(i);

    tmpColor.setRGB(
      range(this.rng, 0x10 / 255, 0x2a / 255),
      range(this.rng, 0x20 / 255, 0x50 / 255),
      range(this.rng, 0x3a / 255, 0x82 / 255),
    );
    this.pyramids.setColorAt(i, tmpColor);
    if (i < EDGE_COUNT) this.writeEdge(i);
  }

  private writePyramid(i: number): void {
    tmpQuat.setFromEuler(tmpEuler.set(0, this.yaws[i], 0));
    tmpMatrix.compose(
      this.positions[i],
      tmpQuat,
      tmpScale.set(this.bases[i], this.heights[i], this.bases[i]),
    );
    this.pyramids.setMatrixAt(i, tmpMatrix);
  }

  private lateralDistanceToFlight(pos: THREE.Vector3, camera: THREE.PerspectiveCamera): number {
    camera.getWorldDirection(tmpForward);
    tmpForward.y = 0;
    if (tmpForward.lengthSq() < 0.01) tmpForward.set(0, 0, -1);
    tmpForward.normalize();
    const dx = pos.x - camera.position.x;
    const dz = pos.z - camera.position.z;
    return Math.abs(dx * -tmpForward.z + dz * tmpForward.x);
  }

  // --------------------------------------------------------------- aristas

  private initEdges(): void {
    const cone = new THREE.ConeGeometry(1, 1, 4);
    cone.translate(0, 0.5, 0);
    const edgeGeo = new THREE.EdgesGeometry(cone);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    for (let i = 0; i < EDGE_COUNT; i++) {
      const line = new THREE.LineSegments(edgeGeo, edgeMat);
      line.frustumCulled = false;
      line.matrixAutoUpdate = false;
      this.edgeLines.push(line);
      this.scene.add(line);
      this.writeEdge(i);
    }
  }

  private writeEdge(i: number): void {
    const line = this.edgeLines[i];
    if (!line) return;
    this.pyramids.getMatrixAt(i, tmpMatrix);
    line.matrix.copy(tmpMatrix);
  }

  // --------------------------------------------------------------- suelo

  private initGround(): void {
    const geo = new THREE.PlaneGeometry(4000, 4000);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x120d24,
      roughness: 0.88,
      metalness: 0,
    });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);
  }

  // ------------------------------------------------------------ tentaculos

  private initTentacles(camera: THREE.PerspectiveCamera): void {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a2050,
      roughness: 0.55,
      metalness: 0.02,
      emissive: 0x14071f,
      emissiveIntensity: 0.35,
    });
    for (let i = 0; i < TENTACLE_COUNT; i++) {
      const curve = new THREE.CatmullRomCurve3(
        Array.from({ length: TENTACLE_POINTS }, () => new THREE.Vector3()),
        false,
        'catmullrom',
        0.55,
      );
      const tentacle: Tentacle = {
        mesh: new THREE.Mesh(new THREE.TubeGeometry(curve, TENTACLE_SEGMENTS, 1.6, TENTACLE_RADIAL, false), mat),
        curve,
        phase: range(this.rng, 0, Math.PI * 2),
        anchor: new THREE.Vector3(),
      };
      tentacle.mesh.frustumCulled = false;
      this.regenTentacle(tentacle, camera, i < TENTACLE_COUNT / 2);
      this.tentacles.push(tentacle);
      this.scene.add(tentacle.mesh);
    }
  }

  private regenTentacle(t: Tentacle, camera: THREE.PerspectiveCamera, initial: boolean): void {
    camera.getWorldDirection(tmpForward);
    tmpForward.y = 0;
    if (tmpForward.lengthSq() < 0.01) tmpForward.set(0, 0, -1);
    tmpForward.normalize();
    tmpRight.set(-tmpForward.z, 0, tmpForward.x);

    const startDist = initial ? range(this.rng, -PYRAMID_RADIUS * 0.4, PYRAMID_RADIUS * 0.7) : range(this.rng, 120, 280);
    const lateral = range(this.rng, -170, 170);
    for (let p = 0; p < TENTACLE_POINTS; p++) {
      const k = p / (TENTACLE_POINTS - 1);
      const sway = Math.sin(k * Math.PI * 2 + t.phase) * range(this.rng, 14, 38);
      const pt = t.curve.points[p];
      pt.copy(camera.position)
        .addScaledVector(tmpForward, startDist + p * range(this.rng, 32, 58))
        .addScaledVector(tmpRight, lateral + sway + range(this.rng, -32, 32));
      pt.y = range(this.rng, 0.4, 12);
    }
    t.anchor.copy(t.curve.points[Math.floor(TENTACLE_POINTS / 2)]);
    t.curve.updateArcLengths();
    this.rewriteTentacleGeometry(t);
  }

  private rewriteTentacleGeometry(t: Tentacle): void {
    const attr = t.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    let o = 0;
    for (let s = 0; s <= TENTACLE_SEGMENTS; s++) {
      const u = s / TENTACLE_SEGMENTS;
      t.curve.getPointAt(u, tmpVec);
      const u0 = Math.max(0, u - 1 / TENTACLE_SEGMENTS);
      const u1 = Math.min(1, u + 1 / TENTACLE_SEGMENTS);
      t.curve.getPointAt(u0, tmpVec2);
      tmpUp.copy(tmpVec);
      t.curve.getPointAt(u1, tmpForward);
      tmpForward.sub(tmpVec2).normalize();
      tmpRight.crossVectors(WORLD_UP, tmpForward);
      if (tmpRight.lengthSq() < 0.001) tmpRight.set(1, 0, 0);
      tmpRight.normalize();
      tmpUp.crossVectors(tmpForward, tmpRight).normalize();

      for (let r = 0; r <= TENTACLE_RADIAL; r++) {
        const radius = 1.6 * (0.8 + Math.sin(u * Math.PI * 3 + t.phase) * 0.2);
        arr[o++] = tmpVec.x + tmpRight.x * RING_COS[r] * radius + tmpUp.x * RING_SIN[r] * radius;
        arr[o++] = tmpVec.y + tmpRight.y * RING_COS[r] * radius + tmpUp.y * RING_SIN[r] * radius;
        arr[o++] = tmpVec.z + tmpRight.z * RING_COS[r] * radius + tmpUp.z * RING_SIN[r] * radius;
      }
    }
    attr.needsUpdate = true;
    t.mesh.geometry.computeVertexNormals();
  }

  // ------------------------------------------------------------ meteoritos

  private initMeteors(): void {
    // Geometrias compartidas: cabeza (cometa) y onda de choque (aro plano)
    const headGeo = new THREE.ConeGeometry(1.6, 8, 6);
    const ringGeo = new THREE.RingGeometry(0.82, 1.0, 56);
    ringGeo.rotateX(-Math.PI / 2); // tumbado sobre el suelo

    for (let i = 0; i < METEOR_COUNT; i++) {
      const head = new THREE.Mesh(
        headGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffd27a,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        }),
      );
      head.frustumCulled = false;
      head.visible = false;

      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: 0xff9a3c,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        }),
      );
      ring.frustumCulled = false;
      ring.visible = false;

      const light = new THREE.PointLight(0xffb055, 0, 340, 2);

      const meteor: Meteor = {
        state: 'idle',
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        impact: new THREE.Vector3(),
        // Arranque escalonado: los impactos no llegan todos a la vez
        timer: i * 0.8 + range(this.rng, 0.3, 1.2),
        light,
        head,
        ring,
      };
      this.meteors.push(meteor);
      this.scene.add(head, ring, light);
    }
  }

  /** Lanza un meteorito nuevo hacia un punto del suelo por delante. */
  private spawnMeteor(m: Meteor, camera: THREE.PerspectiveCamera): void {
    respawnAheadXZ(m.impact, camera, 90, PYRAMID_RADIUS * 0.6, Math.PI * 0.85, this.rng);
    m.impact.y = 0;

    const height = range(this.rng, 220, 360);
    const ang = range(this.rng, 0, Math.PI * 2);
    const spread = range(this.rng, 70, 170); // entra en diagonal
    m.pos.set(
      m.impact.x + Math.cos(ang) * spread,
      height,
      m.impact.z + Math.sin(ang) * spread,
    );
    const speed = range(this.rng, 170, 260);
    m.vel.subVectors(m.impact, m.pos).normalize().multiplyScalar(speed);

    // Tono calido, de ambar a blanco dorado
    tmpColor.setHSL(range(this.rng, 0.03, 0.11), 0.85, 0.6);
    m.head.material.color.copy(tmpColor);
    m.ring.material.color.copy(tmpColor);
    m.light.color.copy(tmpColor);

    m.state = 'fall';
    m.head.visible = true;
    m.head.position.copy(m.pos);
    m.light.position.copy(m.pos);
    m.light.intensity = METEOR_FALL_GLOW;
    m.ring.visible = false;
    m.ring.material.opacity = 0;

    tmpVec.copy(m.vel).normalize();
    tmpQuat.setFromUnitVectors(WORLD_UP, tmpVec); // la punta apunta al avance
    m.head.quaternion.copy(tmpQuat);
  }

  private updateMeteors(dt: number, camera: THREE.PerspectiveCamera): void {
    for (let i = 0; i < METEOR_COUNT; i++) {
      const m = this.meteors[i];

      if (m.state === 'idle') {
        m.timer -= dt;
        if (m.timer <= 0) this.spawnMeteor(m, camera);
        continue;
      }

      if (m.state === 'fall') {
        m.pos.addScaledVector(m.vel, dt);
        if (m.pos.y <= 0) {
          // Impacto: el destello sustituye a la bola
          m.state = 'flash';
          m.timer = METEOR_FLASH_DUR;
          m.head.visible = false;
          m.ring.visible = true;
          m.ring.position.set(m.impact.x, 0.5, m.impact.z);
          m.light.position.set(m.impact.x, 6, m.impact.z);
        } else {
          m.head.position.copy(m.pos);
          m.light.position.copy(m.pos);
        }
        continue;
      }

      // flash
      m.timer -= dt;
      const k = Math.max(0, m.timer / METEOR_FLASH_DUR); // 1 -> 0
      m.light.intensity = METEOR_FLASH_PEAK * k * k;      // caida rapida
      const radius = METEOR_RING_MAX * (1 - k);           // onda que crece
      m.ring.scale.set(radius, radius, radius);
      m.ring.material.opacity = k * 0.9;
      if (m.timer <= 0) {
        m.state = 'idle';
        m.timer = range(this.rng, 0.6, 2.8);
        m.light.intensity = 0;
        m.ring.visible = false;
      }
    }
  }

  // --------------------------------------------------------------- ascuas

  private initEmbers(camera: THREE.PerspectiveCamera): void {
    this.emberPositions = new Float32Array(EMBER_COUNT * 3);
    const colors = new Float32Array(EMBER_COUNT * 3);
    const orange = new THREE.Color(0xff6a00);
    const gold = new THREE.Color(0xffd24d);
    for (let i = 0; i < EMBER_COUNT; i++) {
      this.emberBaseX[i] = camera.position.x + range(this.rng, -EMBER_HALF, EMBER_HALF);
      this.emberBaseY[i] = camera.position.y + range(this.rng, -EMBER_HALF * 0.35, EMBER_HALF);
      this.emberBaseZ[i] = camera.position.z + range(this.rng, -EMBER_HALF, EMBER_HALF);
      this.emberPhase[i] = range(this.rng, 0, Math.PI * 2);
      this.emberFreq[i] = range(this.rng, 0.4, 1.4);
      this.emberRise[i] = range(this.rng, 0.5, 2);
      tmpColor.lerpColors(orange, gold, this.rng());
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.emberPositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.embers = new THREE.Points(geo, mat);
    this.embers.frustumCulled = false;
    this.scene.add(this.embers);
  }

  // -------------------------------------------------------------- estrellas

  private initStars(camera: THREE.PerspectiveCamera): void {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const yaw = range(this.rng, 0, Math.PI * 2);
      const pitch = range(this.rng, 0.15, 1.15);
      const radius = range(this.rng, 250, 450);
      positions[i * 3] = Math.cos(yaw) * Math.cos(pitch) * radius;
      positions[i * 3 + 1] = Math.sin(pitch) * radius;
      positions[i * 3 + 2] = Math.sin(yaw) * Math.cos(pitch) * radius;
      tmpColor.setHSL(0.62, 0.35, range(this.rng, 0.65, 1));
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(geo, mat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
    this.stars.position.set(camera.position.x, 0, camera.position.z);
  }

  // --------------------------------------------------------------- esquiva

  steerBias(camera: THREE.PerspectiveCamera, out: THREE.Vector2): void {
    camera.getWorldDirection(tmpForward);
    const norm = Math.hypot(tmpForward.x, tmpForward.z) || 1;
    const hx = tmpForward.x / norm;
    const hz = tmpForward.z / norm;
    for (let i = 0; i < PYRAMID_COUNT; i++) {
      const p = this.positions[i];
      if (camera.position.y > this.heights[i] + 14) continue;
      const dx = p.x - camera.position.x;
      const dz = p.z - camera.position.z;
      const along = dx * hx + dz * hz;
      if (along < 20 || along > 190) continue;
      const lateral = dx * -hz + dz * hx;
      const halfW = this.bases[i] * 0.55 + 16;
      if (Math.abs(lateral) > halfW) continue;
      const urgency = (1 - along / 190) * (1 - Math.abs(lateral) / halfW);
      out.x += (lateral >= 0 ? -1 : 1) * urgency * 0.85;
      if (this.heights[i] - camera.position.y < 26) out.y -= urgency * 0.35;
    }
    out.x = THREE.MathUtils.clamp(out.x, -1, 1);
    out.y = THREE.MathUtils.clamp(out.y, -1, 1);
  }

  // ---------------------------------------------------------------- update

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.ground.position.set(
      Math.round(camera.position.x / 200) * 200,
      0,
      Math.round(camera.position.z / 200) * 200,
    );
    this.stars.position.set(camera.position.x, 0, camera.position.z);

    let pyramidsDirty = false;
    let colorsDirty = false;
    for (let i = 0; i < PYRAMID_COUNT; i++) {
      if (distanceXZ(this.positions[i], camera) > PYRAMID_RADIUS) {
        this.placePyramid(i, camera, false);
        pyramidsDirty = true;
        colorsDirty = true;
      }
    }
    if (pyramidsDirty) this.pyramids.instanceMatrix.needsUpdate = true;
    if (colorsDirty && this.pyramids.instanceColor) this.pyramids.instanceColor.needsUpdate = true;

    for (let i = 0; i < EDGE_COUNT; i++) this.writeEdge(i);

    this.updateMeteors(dt, camera);

    for (let i = 0; i < TENTACLE_COUNT; i++) {
      const tentacle = this.tentacles[i];
      if (isBehind(tentacle.anchor, camera, 120) || distanceXZ(tentacle.anchor, camera) > PYRAMID_RADIUS) {
        this.regenTentacle(tentacle, camera, false);
      }
      tentacle.mesh.rotation.z = Math.sin(elapsed * 0.4 + tentacle.phase) * 0.04;
    }

    for (let i = 0; i < EMBER_COUNT; i++) {
      this.emberBaseX[i] = wrapAround(this.emberBaseX[i], camera.position.x, EMBER_HALF);
      this.emberBaseZ[i] = wrapAround(this.emberBaseZ[i], camera.position.z, EMBER_HALF);
      this.emberBaseY[i] = wrapAround(this.emberBaseY[i] + this.emberRise[i] * dt, camera.position.y + 22, EMBER_HALF);
      const o = i * 3;
      this.emberPositions[o] =
        this.emberBaseX[i] + Math.sin(elapsed * this.emberFreq[i] + this.emberPhase[i]) * 2.5;
      this.emberPositions[o + 1] = this.emberBaseY[i];
      this.emberPositions[o + 2] = this.emberBaseZ[i];
    }
    this.embers.geometry.attributes.position.needsUpdate = true;
  }
}
