import { SIMPLEX_3D, PALETTE } from './noise';

/**
 * Tunel psicodelico: cilindro visto por dentro, deformado por ruido simplex
 * en el vertex shader y pintado proceduralmente en el fragment.
 *
 * Truco "cinta de correr": el mesh va pegado a la camara y es la coordenada
 * de muestreo (uScroll = distancia recorrida) la que fluye, de modo que las
 * paredes parecen un mundo estatico que atravesamos. Sin costuras, sin fin.
 */

export const TUNNEL_VERT = /* glsl */ `
uniform float uTime;
uniform float uScroll;

varying vec3 vView;
varying vec3 vNormal;
varying float vDepth;
varying vec2 vPolar; // (angulo, z local)

${SIMPLEX_3D}

void main() {
  vec3 pos = position;
  float ang = atan(pos.y, pos.x);

  // Coordenada cilindrica que fluye con el viaje (+uScroll = mundo estatico)
  vec3 np = vec3(cos(ang), sin(ang), pos.z * 0.02 + uScroll * 0.02);

  // Paredes organicas que respiran
  float d = fbm2(np * 1.7 + vec3(0.0, 0.0, uTime * 0.05));
  pos.xy *= 1.0 + d * 0.38;

  // Curvatura lenta del tubo; nula cerca de la camara (z local 0)
  // para que nunca nos saque fuera de las paredes
  float bend = smoothstep(10.0, 160.0, abs(position.z));
  pos.x += sin(position.z * 0.011 + uTime * 0.27) * 5.0 * bend;
  pos.y += cos(position.z * 0.008 + uTime * 0.21) * 4.0 * bend;

  vPolar = vec2(ang, position.z);
  vNormal = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vView = -mv.xyz;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const TUNNEL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uScroll;
uniform vec3 uFogColor;

varying vec3 vView;
varying vec3 vNormal;
varying float vDepth;
varying vec2 vPolar;

${SIMPLEX_3D}
${PALETTE}

void main() {
  float ang = vPolar.x;
  float z = vPolar.y;
  vec3 np = vec3(cos(ang), sin(ang), z * 0.02 + uScroll * 0.02);

  float n = fbm3(np * 3.1 + vec3(0.0, 0.0, uTime * 0.06));
  // Detalle fino para que la pared tenga estructura tambien de cerca
  float nd = snoise(np * 9.0 + vec3(0.0, 0.0, uTime * 0.12)) * 0.5 + 0.5;

  // Color base oscuro: la pared es sombra, los trazos de luz son el brillo
  float hue = uTime * 0.012 + z * 0.002 + uScroll * 0.004 + n * 0.22;
  vec3 col = palette(hue) * (0.04 + 0.11 * (n * 0.5 + 0.5)) * (0.6 + 0.8 * nd);

  // Helices de neon enroscadas en la pared (alimentan el bloom)
  float hel = sin(ang * 3.0 + z * 0.09 + uScroll * 0.09 + n * 3.0);
  col += palette(hue + 0.18) * pow(max(hel, 0.0), 26.0) * 1.0;
  float hel2 = sin(-ang * 5.0 + z * 0.05 + uScroll * 0.05 + n * 2.0);
  col += palette(hue + 0.45) * pow(max(hel2, 0.0), 34.0) * 0.7;

  // Aros de energia fijos en el mundo: marcan la velocidad del vuelo
  float ring = smoothstep(0.93, 0.99, fract(z * 0.012 + uScroll * 0.012));
  col += palette(hue + 0.3) * ring * 0.8;

  // Ventanas: zonas donde la pared se abre al "espacio" (color, no alpha:
  // mantener el tunel opaco evita problemas de ordenado con las particulas)
  float gap = smoothstep(0.42, 0.78, snoise(np * 1.05 + vec3(0.0, 0.0, uTime * 0.03)));
  col = mix(col, palette(hue + 0.55) * 0.04, gap * 0.85);
  // Motas de luz flotando dentro de las ventanas
  float spark = pow(max(snoise(np * 6.5 + vec3(0.0, 0.0, uTime * 0.2)), 0.0), 16.0);
  col += palette(hue + 0.6) * spark * gap * 1.2;

  // Borde fresnel: las paredes rasantes brillan
  float rim = pow(1.0 - abs(dot(normalize(vView), normalize(vNormal))), 3.0);
  col += palette(hue + 0.3) * rim * 0.22;

  // Fundido a niebla: el tunel se disuelve a lo lejos, nunca se ve el final
  col = mix(col, uFogColor, smoothstep(130.0, 320.0, vDepth));
  gl_FragColor = vec4(col, 1.0);
}
`;
