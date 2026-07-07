/**
 * SYNTHWAVE — shaders del "Neon Horizon".
 *
 * Dos piezas puramente GPU (baratas): el suelo de rejilla y el cielo con
 * sol de bandas. Ambos van pegados a la camara; el suelo usa coordenadas
 * de mundo para parecer un plano infinito estatico, y el cielo es una
 * cupula que solo depende de la direccion de mirada, no de la posicion.
 */

// --- SUELO: rejilla de neon infinita ------------------------------------
export const GRID_VERT = /* glsl */ `
varying vec3 vWorld;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const GRID_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCamPos;
uniform vec3 uNeonA; // magenta
uniform vec3 uNeonB; // cian

varying vec3 vWorld;

// Linea de rejilla anti-aliasada: 1 sobre la linea, 0 fuera, grosor en px
float gridLine(vec2 coord) {
  vec2 g = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
  return 1.0 - min(min(g.x, g.y), 1.0);
}

void main() {
  vec3 col = vec3(0.02, 0.006, 0.05);

  // Las lineas que corren hacia el horizonte se desplazan con el tiempo
  vec2 uv = vec2(vWorld.x, vWorld.z + uTime * 24.0);
  float minor = gridLine(uv / 6.0);
  float major = gridLine(uv / 48.0);

  // Tinte lateral: magenta a un lado del rumbo, cian al otro
  float side = smoothstep(-40.0, 40.0, vWorld.x - uCamPos.x);
  vec3 neon = mix(uNeonA, uNeonB, side);

  col += neon * minor * 0.35;
  col += neon * major * 0.9;

  // Reflejo del sol: una franja brillante bajo el horizonte, en el eje de vuelo
  float lane = smoothstep(26.0, 0.0, abs(vWorld.x - uCamPos.x));
  float shimmer = 0.5 + 0.5 * sin(vWorld.z * 0.4 - uTime * 6.0);
  col += uNeonA * lane * shimmer * (minor * 0.5 + 0.12) * 0.8;

  float fogF = 1.0 - exp(-pow(distance(vWorld, uCamPos) * uFogDensity, 2.0));
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
}
`;

// --- CIELO: gradiente + sol de bandas + estrellas -----------------------
export const SKY_VERT = /* glsl */ `
varying vec3 vDir;

void main() {
  // Direccion local del vertice: la cupula se centra siempre en la camara,
  // asi que basta la posicion normalizada para saber a donde mira el pixel.
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uHorizon; // color caliente del horizonte
uniform vec3 uZenith;  // color frio de lo alto
uniform vec3 uSun;     // color del sol

varying vec3 vDir;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

void main() {
  vec3 dir = normalize(vDir);
  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

  // Gradiente vertical: horizonte calido -> cenit frio y oscuro
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.6));

  // Sol: disco en el frente, ligeramente sobre el horizonte
  vec3 sunDir = normalize(vec3(0.0, 0.16, 1.0));
  float d = distance(dir, sunDir);
  float disc = smoothstep(0.34, 0.30, d);
  // Bandas horizontales que "recortan" la mitad baja del sol (clasico synth)
  float bands = smoothstep(0.0, 0.02, sin(dir.y * 90.0 - 1.0));
  float bandMask = mix(1.0, bands, smoothstep(0.16, 0.10, dir.y));
  col = mix(col, uSun, disc * bandMask);
  // Halo suave alrededor del sol
  col += uSun * smoothstep(0.62, 0.30, d) * 0.35;

  // Estrellas en la parte alta del cielo (fijas, muy dispersas)
  if (dir.y > 0.18) {
    vec2 cell = floor(dir.xz / max(dir.y, 0.2) * 60.0);
    float s = hash(cell);
    float star = step(0.985, s) * smoothstep(0.18, 0.6, dir.y);
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 40.0);
    col += vec3(0.9, 0.85, 1.0) * star * tw;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;
