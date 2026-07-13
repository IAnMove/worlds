import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';

/**
 * FRACTAL — inmersion en una red infinita de mandelbulbs (raymarching en un
 * quad a pantalla completa). El vuelo mueve el origen del rayo por un dominio
 * repetido; la orientacion de la camara apunta el rayo (mirar alrededor).
 */

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec2 uRes; uniform float uTime;
uniform vec3 uRo, uFwd, uRight, uUp;
varying vec2 vUv;

float de(vec3 p){
  p = mod(p, 10.0) - 5.0;              // lattice infinita
  vec3 z = p; float dr = 1.0; float r = 0.0;
  float power = 7.0 + sin(uTime*0.2)*1.0;
  for(int i=0;i<5;i++){
    r = length(z); if(r>2.0) break;
    float theta = acos(z.z/r);
    float phi = atan(z.y, z.x);
    dr = pow(r, power-1.0)*power*dr + 1.0;
    float zr = pow(r, power);
    theta *= power; phi *= power;
    z = zr*vec3(sin(theta)*cos(phi), sin(phi)*sin(theta), cos(theta)) + p;
  }
  return 0.5*log(max(r,1e-4))*r/dr;
}

float hash1(vec3 c){ return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719)))*43758.5453); }

void main(){
  vec2 uv = vUv - 0.5; uv.x *= uRes.x/uRes.y;
  vec3 rd = normalize(uFwd + uRight*uv.x*1.15 + uUp*uv.y*1.15);
  vec3 ro = uRo;
  float t = 0.0; float glow = 0.0; bool hit=false; float steps = 0.0;
  for(int i=0;i<64;i++){
    vec3 p = ro + rd*t;
    float d = de(p);
    glow += 0.006/(1.0 + d*d*120.0);
    if(d < 0.0015){ hit=true; break; }
    t += d*0.6;                          // paso conservador (DE imperfecta)
    steps += 1.0;
    if(t > 40.0) break;
  }
  // fondo: gradiente vertical tenue
  vec3 col = mix(vec3(0.012, 0.010, 0.045), vec3(0.030, 0.015, 0.075), rd.y*0.5+0.5);
  if(hit){
    float shade = exp(-t*0.09);
    float ao = 1.0 - steps/64.0;         // oclusion barata: mas pasos = mas hendidura
    ao = ao*ao;
    // tinte propio por celda de la reticula: cada bulbo tiene su color
    float ch = hash1(floor((ro + rd*t)/10.0));
    vec3 a = vec3(0.08, 0.85, 0.65);
    vec3 b = vec3(0.60, 0.20, 1.00);
    vec3 c = vec3(1.00, 0.55, 0.25);
    vec3 tint = mix(a, b, ch);
    tint = mix(tint, c, smoothstep(0.75, 1.0, ch));
    col = tint * shade * ao * 1.5;
  }
  col += vec3(0.15, 0.7, 0.65) * min(glow, 0.35);  // halo de proximidad (acotado)
  gl_FragColor = vec4(col, 1.0);
}`;

const tmpFwd = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class MandelbulbWorld extends World {
  readonly config: WorldConfig = {
    flySpeed: 12,
    clearColor: 0x02010a,
    fogDensity: 0.0001,
    bloom: { strength: 0.7, radius: 0.7, threshold: 0.6 },
    cameraStart: new THREE.Vector3(0, 0, 0),
  };

  private uniforms!: { [k: string]: THREE.IUniform };

  init(): void {
    this.uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uRo: { value: new THREE.Vector3() },
      uFwd: { value: new THREE.Vector3(0, 0, -1) },
      uRight: { value: new THREE.Vector3(1, 0, 0) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
    };
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: FRAG, uniforms: this.uniforms, depthTest: false, depthWrite: false }),
    );
    quad.frustumCulled = false;
    quad.renderOrder = -1;
    this.scene.add(quad);
  }

  update(_dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.uniforms.uTime.value = elapsed;
    (this.uniforms.uRes.value as THREE.Vector2).set(window.innerWidth, window.innerHeight);
    camera.getWorldDirection(tmpFwd);
    tmpRight.crossVectors(tmpFwd, WORLD_UP).normalize();
    if (tmpRight.lengthSq() < 0.01) tmpRight.set(1, 0, 0);
    tmpUp.crossVectors(tmpRight, tmpFwd).normalize();
    (this.uniforms.uRo.value as THREE.Vector3).copy(camera.position);
    (this.uniforms.uFwd.value as THREE.Vector3).copy(tmpFwd);
    (this.uniforms.uRight.value as THREE.Vector3).copy(tmpRight);
    (this.uniforms.uUp.value as THREE.Vector3).copy(tmpUp);
  }
}
