import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range, rangeInt } from '../core/utils/random';
import { makeGlowSprite } from './utils/sprites';

/**
 * NEURAL NET — vuelas dentro de una red neuronal. Los nodos viven en el
 * espacio local de un grupo que sigue a la camara y gira despacio, asi las
 * conexiones nunca se estiran. Las senales (pulsos) recorren las aristas.
 */

const NODE_COUNT = 260;
const CLOUD_RADIUS = 150;
const LINK_DIST = 42;   // conecta nodos mas cercanos que esto
const MAX_EDGES = 900;
const PULSE_COUNT = 220;

const tmpMatrix = new THREE.Matrix4();
const tmpScale = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

interface Pulse { edge: number; t: number; speed: number; }

export class NeuralWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 10,
    clearColor: 0x03060f,
    fogDensity: 0.0025,
    bloom: { strength: 0.55, radius: 0.7, threshold: 0.7 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private readonly rng = createRng(90909);
  private readonly group = new THREE.Group();
  private readonly nodes: THREE.Vector3[] = [];
  private readonly edges: Array<[number, number]> = [];
  private linePositions!: Float32Array;
  private lines!: THREE.LineSegments;
  private pulsePositions!: Float32Array;
  private pulses!: THREE.Points;
  private readonly pulseData: Pulse[] = [];

  init(): void {
    this.scene.add(this.group);

    // Nodos distribuidos en una esfera (mas densos hacia el centro)
    for (let i = 0; i < NODE_COUNT; i++) {
      const r = Math.pow(this.rng(), 0.6) * CLOUD_RADIUS;
      const theta = range(this.rng, 0, Math.PI * 2);
      const phi = Math.acos(range(this.rng, -1, 1));
      this.nodes.push(new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      ));
    }

    // Nodos como esferas instanciadas emisivas
    const nodeMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x2f7fb8, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      NODE_COUNT,
    );
    nodeMesh.frustumCulled = false;
    for (let i = 0; i < NODE_COUNT; i++) {
      tmpMatrix.compose(this.nodes[i], new THREE.Quaternion(), tmpScale.setScalar(range(this.rng, 0.6, 1.3)));
      nodeMesh.setMatrixAt(i, tmpMatrix);
    }
    nodeMesh.instanceMatrix.needsUpdate = true;
    this.group.add(nodeMesh);

    // Aristas entre nodos cercanos (con tope)
    for (let i = 0; i < NODE_COUNT && this.edges.length < MAX_EDGES; i++) {
      for (let j = i + 1; j < NODE_COUNT && this.edges.length < MAX_EDGES; j++) {
        if (this.nodes[i].distanceTo(this.nodes[j]) < LINK_DIST) this.edges.push([i, j]);
      }
    }
    this.linePositions = new Float32Array(this.edges.length * 2 * 3);
    for (let e = 0; e < this.edges.length; e++) {
      const [a, b] = this.edges[e];
      this.nodes[a].toArray(this.linePositions, e * 6);
      this.nodes[b].toArray(this.linePositions, e * 6 + 3);
    }
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    this.lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: 0x1a6aa0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.lines.frustumCulled = false;
    this.group.add(this.lines);

    // Pulsos que viajan por las aristas
    this.pulsePositions = new Float32Array(PULSE_COUNT * 3);
    for (let i = 0; i < PULSE_COUNT; i++) {
      this.pulseData.push({ edge: rangeInt(this.rng, 0, this.edges.length - 1), t: this.rng(), speed: range(this.rng, 0.3, 1.1) });
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(this.pulsePositions, 3));
    this.pulses = new THREE.Points(pgeo, new THREE.PointsMaterial({ map: makeGlowSprite(), color: 0x9af0ff, size: 3.0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.pulses.frustumCulled = false;
    this.group.add(this.pulses);
  }

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.group.position.copy(camera.position);
    this.group.rotation.y = elapsed * 0.05;
    this.group.rotation.x = Math.sin(elapsed * 0.03) * 0.2;

    for (let i = 0; i < PULSE_COUNT; i++) {
      const p = this.pulseData[i];
      p.t += p.speed * dt;
      if (p.t > 1) { p.t = 0; p.edge = rangeInt(this.rng, 0, this.edges.length - 1); p.speed = range(this.rng, 0.3, 1.1); }
      const [a, b] = this.edges[p.edge];
      tmpA.copy(this.nodes[a]); tmpB.copy(this.nodes[b]);
      tmpA.lerp(tmpB, p.t);
      tmpA.toArray(this.pulsePositions, i * 3);
    }
    this.pulses.geometry.attributes.position.needsUpdate = true;
  }
}
