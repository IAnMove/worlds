import { SIMPLEX_3D, PALETTE } from './noise';

/**
 * Nebulosa de fondo: esfera gigante vista por dentro, centrada en la camara.
 * fbm con domain warping (el ruido deforma las coordenadas de otro ruido)
 * + estrellas titilantes. Se dibuja LA ULTIMA con depthTest para que el
 * early-z descarte todo lo que el tunel ya tapa.
 */

export const NEBULA_VERT = /* glsl */ `
varying vec3 vDir;

void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const NEBULA_FRAG = /* glsl */ `
uniform float uTime;

varying vec3 vDir;

${SIMPLEX_3D}
${PALETTE}

void main() {
  vec3 dir = normalize(vDir);

  // Domain warping: q deforma el espacio donde se evalua el fbm final
  vec2 q = vec2(
    fbm2(dir * 2.1 + vec3(0.0, 0.0, uTime * 0.010)),
    fbm2(dir * 2.1 + vec3(5.2, 1.3, -uTime * 0.008))
  );
  float f = fbm3(dir * 2.6 + vec3(q * 0.9, uTime * 0.006));

  // Base casi negra violeta; las nubes emergen suaves
  vec3 col = vec3(0.015, 0.004, 0.035);
  float glow = smoothstep(0.05, 0.85, f);
  col += palette(0.70 + f * 0.30 + uTime * 0.004) * glow * 0.30;

  // Estrellas: picos muy estrechos de un ruido de alta frecuencia
  float s = snoise(dir * 55.0);
  float star = pow(max(s, 0.0), 22.0);
  star *= 0.65 + 0.35 * sin(uTime * 2.0 + s * 40.0);
  col += vec3(0.85, 0.9, 1.0) * star * 1.4;

  gl_FragColor = vec4(col, 1.0);
}
`;
