import { SIMPLEX_3D } from './noise';

/**
 * Cielo en llamas de Pyramid Dusk (tarea 14): cupula BackSide con degradado
 * azul profundo -> negro, vetas de fuego estiradas en horizontal sobre el
 * horizonte, remolinos azules a media altura y resplandor rojo en la base.
 * Energia de cuadro pintado, no cielo realista.
 */

export const FIRESKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const FIRESKY_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
varying vec3 vDir;
${SIMPLEX_3D}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;                                   // -1 nadir .. 1 cenit
  // base: azul noche que muere en negro hacia el cenit (color de la niebla en el horizonte)
  vec3 col = mix(vec3(0.043, 0.039, 0.15), vec3(0.004, 0.003, 0.018), smoothstep(0.0, 0.65, h));
  // vetas de fuego estiradas en horizontal, lamiendo el horizonte
  float veins = fbm3(vec3(d.x*2.6, d.y*11.0, d.z*2.6) + vec3(0.0, -uTime*0.04, uTime*0.025));
  float band = exp(-abs(h - 0.10) * 5.5);
  float fire = smoothstep(0.12, 0.72, veins) * band;
  vec3 fireCol = mix(vec3(0.85, 0.20, 0.02), vec3(1.0, 0.72, 0.18), smoothstep(0.25, 0.85, veins));
  col += fireCol * fire * 1.5;
  // remolinos azul electrico a media altura, muy tenues
  float swirl = fbm2(vec3(d.x*2.0, d.y*4.0 - uTime*0.02, d.z*2.0 + 10.0));
  col += vec3(0.10, 0.16, 0.45) * smoothstep(0.35, 0.9, swirl) * exp(-abs(h - 0.45) * 3.5) * 0.7;
  // resplandor rojo sangre pegado al horizonte bajo
  col += vec3(0.45, 0.03, 0.02) * exp(-max(h + 0.02, 0.0) * 9.0) * 0.9;
  gl_FragColor = vec4(col, 1.0);
}`;
