import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range, pick } from '../core/utils/random';
import { distanceXZ, isBehind, respawnAheadXZ } from '../core/utils/recycle';
import { RAIN_VERT, RAIN_FRAG, RAIN_ROWS } from './shaders/matrixRain';

/**
 * MATRIX — mundo oscuro de neones verdes.
 *
 * - Lluvia de glifos katakana con shader propio (100% GPU)
 * - Monolitos tecnologicos con aristas de neon
 * - Autopistas de datos: tubos de luz con pulsos recorriendolos
 * - Paneles holograficos con texto de terminal generado por codigo
 * - Arcos imposibles cruzando el vuelo
 */

const RAIN_COLUMNS = 380;
const RAIN_HALF = 90; // media caja de envoltura alrededor de la camara
const MONOLITH_COUNT = 240;
const FIELD_RADIUS = 380;
const HIGHWAY_COUNT = 7;
const PULSES_PER_HIGHWAY = 7;
const PANEL_COUNT = 36;
const ARC_COUNT = 16;

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();
const tmpVec = new THREE.Vector3();
const tmpFwd = new THREE.Vector3();
const tmpEuler = new THREE.Euler();

interface Highway {
  mesh: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  /** progreso de cada pulso de luz sobre la curva */
  pulses: Float32Array;
}

interface Panel {
  pos: THREE.Vector3;
  phase: number;
  yaw: number;
}

export class MatrixWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 26,
    clearColor: 0x010603,
    fogDensity: 0.0065,
    bloom: { strength: 0.9, radius: 0.7, threshold: 0.5 },
    cameraStart: new THREE.Vector3(0, 24, 0),
    bounds: { minY: 6, maxY: 200, margin: 24 },
  };

  private readonly rng = createRng(2049);

  private rainUniforms!: { [k: string]: THREE.IUniform };

  private monoliths!: THREE.InstancedMesh;
  private readonly positions: THREE.Vector3[] = [];
  private readonly scales: THREE.Vector3[] = [];

  private readonly highways: Highway[] = [];
  private pulsePoints!: THREE.Points;
  private pulsePositions!: Float32Array;

  private panels!: THREE.InstancedMesh[];
  private readonly panelData: Panel[] = [];

  private arcs!: THREE.InstancedMesh;
  private readonly arcPositions: THREE.Vector3[] = [];
  private readonly arcYaws = new Float32Array(ARC_COUNT);

  init(camera: THREE.PerspectiveCamera): void {
    this.initRain(camera);
    this.initMonoliths(camera);
    this.initHighways(camera);
    this.initPanels(camera);
    this.initArcs(camera);
  }

  // ------------------------------------------------------ lluvia de glifos

  private initRain(camera: THREE.PerspectiveCamera): void {
    // Glifos grandes (2 m): legibles al pasar, como en la peli
    const plane = new THREE.PlaneGeometry(2.1, RAIN_ROWS * 2.0, 1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.setAttribute('position', plane.getAttribute('position'));
    geo.setAttribute('uv', plane.getAttribute('uv'));
    geo.instanceCount = RAIN_COLUMNS;

    const offsets = new Float32Array(RAIN_COLUMNS * 3);
    const speeds = new Float32Array(RAIN_COLUMNS);
    const seeds = new Float32Array(RAIN_COLUMNS);
    for (let i = 0; i < RAIN_COLUMNS; i++) {
      offsets[i * 3 + 0] = camera.position.x + range(this.rng, -RAIN_HALF, RAIN_HALF);
      offsets[i * 3 + 1] = range(this.rng, 0, 55); // altura de la base
      offsets[i * 3 + 2] = camera.position.z + range(this.rng, -RAIN_HALF, RAIN_HALF);
      speeds[i] = range(this.rng, 0.5, 1.6);
      seeds[i] = this.rng() * 100;
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));

    this.rainUniforms = {
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uHalf: { value: RAIN_HALF },
      uAtlas: { value: buildGlyphAtlas() },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      uniforms: this.rainUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const rain = new THREE.Mesh(geo, mat);
    rain.frustumCulled = false;
    rain.renderOrder = 5; // encima de la arquitectura, aditivo
    this.scene.add(rain);
  }

  // ------------------------------------------------------------ monolitos

  private initMonoliths(camera: THREE.PerspectiveCamera): void {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: true });
    this.monoliths = new THREE.InstancedMesh(geo, mat, MONOLITH_COUNT);
    this.monoliths.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.monoliths.frustumCulled = false;
    for (let i = 0; i < MONOLITH_COUNT; i++) {
      const pos = new THREE.Vector3(
        camera.position.x + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS),
        0,
        camera.position.z + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS),
      );
      const scale = new THREE.Vector3(
        range(this.rng, 6, 20),
        range(this.rng, 15, 120),
        range(this.rng, 6, 20),
      );
      this.positions.push(pos);
      this.scales.push(scale);
      this.writeMonolith(i);
      // Lightness en lineal: el paso a sRGB lo aclara mucho — mantener bajo.
      // La luz del mundo la ponen la lluvia, autopistas, paneles y arcos.
      tmpColor.setHSL(0.36, 0.9, 0.006 + this.rng() * 0.03);
      this.monoliths.setColorAt(i, tmpColor);
    }
    this.monoliths.instanceMatrix.needsUpdate = true;
    if (this.monoliths.instanceColor) this.monoliths.instanceColor.needsUpdate = true;
    this.scene.add(this.monoliths);
  }

  private writeMonolith(i: number): void {
    tmpMatrix.compose(this.positions[i], tmpQuat.identity(), tmpScale.copy(this.scales[i]));
    this.monoliths.setMatrixAt(i, tmpMatrix);
  }

  // ----------------------------------------------------------- autopistas

  private initHighways(camera: THREE.PerspectiveCamera): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x14ff5f,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    for (let h = 0; h < HIGHWAY_COUNT; h++) {
      const curve = new THREE.CatmullRomCurve3(
        [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
        false,
        'catmullrom',
        0.6,
      );
      const highway: Highway = {
        curve,
        mesh: new THREE.Mesh(undefined, mat),
        pulses: new Float32Array(PULSES_PER_HIGHWAY),
      };
      for (let p = 0; p < PULSES_PER_HIGHWAY; p++) highway.pulses[p] = this.rng();
      highway.mesh.frustumCulled = false;
      this.regenHighway(highway, camera);
      this.highways.push(highway);
      this.scene.add(highway.mesh);
    }

    // Pulsos de luz que recorren los tubos
    this.pulsePositions = new Float32Array(HIGHWAY_COUNT * PULSES_PER_HIGHWAY * 3);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(this.pulsePositions, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0xccffdd,
      size: 3.2,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.pulsePoints = new THREE.Points(pGeo, pMat);
    this.pulsePoints.frustumCulled = false;
    this.scene.add(this.pulsePoints);
  }

  /** Regenera la curva de una autopista por delante de la camara. */
  private regenHighway(h: Highway, camera: THREE.PerspectiveCamera): void {
    camera.getWorldDirection(tmpFwd);
    tmpFwd.y = 0;
    if (tmpFwd.lengthSq() < 0.01) tmpFwd.set(0, 0, -1);
    tmpFwd.normalize();
    const lateral0 = range(this.rng, -60, 60);
    let y = range(this.rng, 8, 60);
    for (let p = 0; p < 5; p++) {
      const pt = h.curve.points[p];
      pt.copy(camera.position)
        .addScaledVector(tmpFwd, -60 + p * 120)
        .add(tmpVec.set(-tmpFwd.z, 0, tmpFwd.x).multiplyScalar(lateral0 + range(this.rng, -70, 70)));
      pt.y = y = THREE.MathUtils.clamp(y + range(this.rng, -25, 25), 5, 80);
    }
    h.curve.updateArcLengths();
    // Reconstruir el tubo (evento raro ~cada muchos segundos, no por frame)
    h.mesh.geometry?.dispose();
    h.mesh.geometry = new THREE.TubeGeometry(h.curve, 48, 0.7, 6, false);
  }

  // -------------------------------------------------------------- paneles

  private initPanels(camera: THREE.PerspectiveCamera): void {
    const textures = [0, 1, 2, 3].map((v) => buildPanelTexture(this.rng, v));
    const geo = new THREE.PlaneGeometry(9, 5.5);
    this.panels = textures.map((tex) => {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const im = new THREE.InstancedMesh(geo, mat, PANEL_COUNT / 4);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.renderOrder = 4;
      this.scene.add(im);
      return im;
    });
    for (let i = 0; i < PANEL_COUNT; i++) {
      const panel: Panel = {
        pos: new THREE.Vector3(
          camera.position.x + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS),
          range(this.rng, 6, 55),
          camera.position.z + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS),
        ),
        phase: range(this.rng, 0, Math.PI * 2),
        yaw: range(this.rng, 0, Math.PI * 2),
      };
      this.panelData.push(panel);
    }
  }

  // ----------------------------------------------------------------- arcos

  private initArcs(camera: THREE.PerspectiveCamera): void {
    // Toro de 4 segmentos = marco cuadrado girado 45 grados
    const geo = new THREE.TorusGeometry(34, 1.1, 4, 4);
    geo.rotateZ(Math.PI / 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0fff55,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.arcs = new THREE.InstancedMesh(geo, mat, ARC_COUNT);
    this.arcs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arcs.frustumCulled = false;
    for (let i = 0; i < ARC_COUNT; i++) {
      const pos = new THREE.Vector3(
        camera.position.x + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS),
        range(this.rng, 6, 30),
        camera.position.z + range(this.rng, -FIELD_RADIUS, FIELD_RADIUS),
      );
      this.arcPositions.push(pos);
      this.arcYaws[i] = this.rng() < 0.5 ? 0 : Math.PI / 2;
      this.writeArc(i);
    }
    this.scene.add(this.arcs);
  }

  private writeArc(i: number): void {
    tmpQuat.setFromEuler(tmpEuler.set(0, this.arcYaws[i], 0));
    tmpMatrix.compose(this.arcPositions[i], tmpQuat, tmpScale.setScalar(1));
    this.arcs.setMatrixAt(i, tmpMatrix);
  }

  // --------------------------------------------------------------- esquiva

  /** Igual que Data City: aparta el rumbo de los monolitos. */
  steerBias(camera: THREE.PerspectiveCamera, out: THREE.Vector2): void {
    camera.getWorldDirection(tmpFwd);
    const norm = Math.hypot(tmpFwd.x, tmpFwd.z) || 1;
    const hx = tmpFwd.x / norm;
    const hz = tmpFwd.z / norm;
    for (let i = 0; i < MONOLITH_COUNT; i++) {
      const p = this.positions[i];
      if (camera.position.y > this.scales[i].y + 12) continue;
      const dx = p.x - camera.position.x;
      const dz = p.z - camera.position.z;
      const along = dx * hx + dz * hz;
      if (along < 15 || along > 170) continue;
      const lateral = dx * -hz + dz * hx;
      const halfW = this.scales[i].x * 0.5 + 14;
      if (Math.abs(lateral) > halfW) continue;
      const urgency = (1 - along / 170) * (1 - Math.abs(lateral) / halfW);
      out.x += (lateral >= 0 ? -1 : 1) * urgency * 0.9;
      if (this.scales[i].y - camera.position.y < 30) out.y -= urgency * 0.35;
    }
    out.x = THREE.MathUtils.clamp(out.x, -1, 1);
    out.y = THREE.MathUtils.clamp(out.y, -1, 1);
  }

  // ---------------------------------------------------------------- update

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.rainUniforms.uTime.value = elapsed;
    (this.rainUniforms.uCamPos.value as THREE.Vector3).copy(camera.position);

    // Monolitos
    let dirty = false;
    for (let i = 0; i < MONOLITH_COUNT; i++) {
      if (distanceXZ(this.positions[i], camera) > FIELD_RADIUS) {
        respawnAheadXZ(this.positions[i], camera, FIELD_RADIUS * 0.5, FIELD_RADIUS * 0.95, Math.PI, this.rng);
        this.writeMonolith(i);
        dirty = true;
      }
    }
    if (dirty) this.monoliths.instanceMatrix.needsUpdate = true;

    // Autopistas + pulsos
    for (let h = 0; h < HIGHWAY_COUNT; h++) {
      const hw = this.highways[h];
      // punto medio de la curva como referencia de reciclado
      hw.curve.getPointAt(0.5, tmpVec);
      if (isBehind(tmpVec, camera, 220)) this.regenHighway(hw, camera);
      for (let p = 0; p < PULSES_PER_HIGHWAY; p++) {
        let t = hw.pulses[p] + dt * 0.09;
        if (t > 1) t -= 1;
        hw.pulses[p] = t;
        hw.curve.getPointAt(t, tmpVec);
        const o = (h * PULSES_PER_HIGHWAY + p) * 3;
        this.pulsePositions[o] = tmpVec.x;
        this.pulsePositions[o + 1] = tmpVec.y;
        this.pulsePositions[o + 2] = tmpVec.z;
      }
    }
    this.pulsePoints.geometry.attributes.position.needsUpdate = true;

    // Paneles: balanceo suave + reciclado
    for (let i = 0; i < PANEL_COUNT; i++) {
      const panel = this.panelData[i];
      if (distanceXZ(panel.pos, camera) > FIELD_RADIUS) {
        respawnAheadXZ(panel.pos, camera, 60, FIELD_RADIUS * 0.9, Math.PI * 0.8, this.rng);
        panel.pos.y = range(this.rng, 6, 55);
        panel.yaw = range(this.rng, 0, Math.PI * 2);
      }
      const sway = Math.sin(elapsed * 0.6 + panel.phase) * 0.12;
      const bob = Math.sin(elapsed * 0.4 + panel.phase * 2) * 0.8;
      tmpQuat.setFromEuler(tmpEuler.set(sway * 0.4, panel.yaw + sway, 0));
      tmpMatrix.compose(
        tmpVec.set(panel.pos.x, panel.pos.y + bob, panel.pos.z),
        tmpQuat,
        tmpScale.setScalar(1),
      );
      this.panels[i % 4].setMatrixAt(Math.floor(i / 4), tmpMatrix);
    }
    for (const im of this.panels) im.instanceMatrix.needsUpdate = true;

    // Arcos
    let arcsDirty = false;
    for (let i = 0; i < ARC_COUNT; i++) {
      if (distanceXZ(this.arcPositions[i], camera) > FIELD_RADIUS) {
        respawnAheadXZ(this.arcPositions[i], camera, FIELD_RADIUS * 0.4, FIELD_RADIUS * 0.9, Math.PI * 0.7, this.rng);
        this.arcPositions[i].y = range(this.rng, 6, 30);
        camera.getWorldDirection(tmpFwd);
        // orientado aprox. perpendicular al rumbo: se atraviesa al volar
        this.arcYaws[i] = Math.atan2(tmpFwd.x, tmpFwd.z) + range(this.rng, -0.4, 0.4);
        this.writeArc(i);
        arcsDirty = true;
      }
    }
    if (arcsDirty) this.arcs.instanceMatrix.needsUpdate = true;
  }
}

// --------------------------------------------------------------- texturas

/** Atlas 8x8 de glifos katakana + digitos, blanco sobre transparente. */
function buildGlyphAtlas(): THREE.CanvasTexture {
  const size = 512;
  const cell = size / 8;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.floor(cell * 0.78)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const glyphs: string[] = [];
  for (let c = 0xff66; c <= 0xff9d && glyphs.length < 56; c++) {
    glyphs.push(String.fromCharCode(c));
  }
  for (const ch of '0123456789Z:・"*+-=') {
    if (glyphs.length < 64) glyphs.push(ch);
  }

  for (let i = 0; i < 64; i++) {
    const x = (i % 8) * cell + cell / 2;
    const y = Math.floor(i / 8) * cell + cell / 2 + 2;
    ctx.save();
    ctx.translate(x, y);
    if (i % 3 === 0) ctx.scale(-1, 1); // algunos en espejo, como en la peli
    ctx.fillText(glyphs[i % glyphs.length], 0, 0);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Panel holografico: texto de terminal verde generado por codigo. */
function buildPanelTexture(rng: () => number, variant: number): THREE.CanvasTexture {
  const w = 256;
  const h = 160;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0, 18, 6, 0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(40, 255, 120, 0.8)';
  ctx.strokeRect(2, 2, w - 4, h - 4);

  const phrases = [
    'WAKE UP...',
    'SYSTEM BREACH',
    'FOLLOW THE WHITE RABBIT',
    'ACCESS GRANTED',
    'TRACE PROGRAM: RUNNING',
    'KNOCK KNOCK',
  ];
  ctx.font = '11px monospace';
  for (let line = 0; line < 11; line++) {
    const y = 16 + line * 13;
    const roll = rng();
    ctx.fillStyle = roll > 0.85 ? 'rgba(180,255,200,0.95)' : 'rgba(50,255,120,0.75)';
    if (roll > 0.92) {
      ctx.fillText(pick(rng, phrases), 8, y);
    } else {
      let text = '';
      for (let k = 0; k < 7; k++) {
        text += Math.floor(rng() * 0xffff).toString(16).padStart(4, '0') + ' ';
      }
      ctx.fillText(text.toUpperCase(), 8, y);
    }
  }
  void variant;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
