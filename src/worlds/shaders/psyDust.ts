import { PALETTE } from './noise';

/**
 * Polvo de sueno: THREE.Points cuyo envolvido alrededor de la camara se
 * calcula integramente en el vertex shader (mod sobre la posicion relativa).
 * CPU por frame: cero. Las particulas se desvanecen antes del salto de
 * envoltura, asi que nunca se ve un "pop".
 */

export const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCamPos;
uniform float uHalf;      // media caja de envoltura
uniform float uPixelRatio;

attribute float aSeed;

varying float vHue;
varying float vAlpha;

void main() {
  // Envoltura: la nube siempre rodea a la camara
  vec3 rel = mod(position - uCamPos, uHalf * 2.0) - uHalf;

  // Deriva organica propia de cada mota
  rel += vec3(
    sin(uTime * 0.40 + aSeed * 17.0),
    cos(uTime * 0.31 + aSeed * 29.0),
    sin(uTime * 0.23 + aSeed * 41.0)
  ) * 1.6;

  vec3 wpos = uCamPos + rel;
  vec4 mv = viewMatrix * vec4(wpos, 1.0);
  float dist = max(-mv.z, 0.001);

  float twinkle = 0.65 + 0.35 * sin(uTime * 2.6 + aSeed * 80.0);
  gl_PointSize = (1.4 + 2.2 * fract(aSeed * 7.31)) * uPixelRatio * (90.0 / dist) * twinkle;

  vHue = fract(aSeed * 3.7 + uTime * 0.015);
  // Desvanecer cerca del borde de la caja (oculta la envoltura) y muy cerca
  vAlpha = smoothstep(uHalf * 0.98, uHalf * 0.55, length(rel)) * smoothstep(1.5, 6.0, dist);

  gl_Position = projectionMatrix * mv;
}
`;

export const DUST_FRAG = /* glsl */ `
varying float vHue;
varying float vAlpha;

${PALETTE}

void main() {
  // Disco suave
  float d = length(gl_PointCoord - 0.5);
  float disc = smoothstep(0.5, 0.08, d);
  vec3 col = palette(vHue) * 0.9 + 0.1;
  gl_FragColor = vec4(col, disc * vAlpha * 0.55);
}
`;
