/**
 * OUTRUN — shaders del "Violet Drive".
 *
 * La estampa vaporware: una carretera que se pierde en el horizonte sobre
 * una rejilla violeta, cielo negro degradado y un sol de barras. Todo GPU
 * y pegado a la camara: el suelo usa coordenadas de mundo (parece infinito
 * y estatico) y el cielo solo depende de la direccion de mirada.
 */

// --- SUELO: carretera + rejilla violeta ---------------------------------
export const ROAD_VERT = /* glsl */ `
varying vec3 vWorld;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const ROAD_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCamPos;
uniform vec3 uViolet; // rejilla
uniform vec3 uHot;    // marcas de la carretera

varying vec3 vWorld;

float gridLine(vec2 coord) {
  vec2 g = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
  return 1.0 - min(min(g.x, g.y), 1.0);
}

// Marca de linea a lo largo de Z, opcionalmente discontinua
float stripe(float x, float center, float halfWidth) {
  return smoothstep(halfWidth, halfWidth * 0.4, abs(x - center));
}

void main() {
  vec3 col = vec3(0.012, 0.003, 0.026); // asfalto casi negro

  // Corre hacia el horizonte con el tiempo
  float scroll = vWorld.z + uTime * 34.0;

  // Rejilla violeta de fondo
  vec2 uv = vec2(vWorld.x, scroll);
  float minor = gridLine(uv / 8.0);
  float major = gridLine(uv / 64.0);
  col += uViolet * minor * 0.16;
  col += uViolet * major * 0.55;

  // La carretera va centrada bajo la camara (siempre vas "encima")
  float rx = vWorld.x - uCamPos.x;
  float onRoad = smoothstep(19.0, 17.0, abs(rx));
  col = mix(col, vec3(0.02, 0.006, 0.045), onRoad * 0.7);

  // Bordes solidos, carriles y linea central discontinua
  float dash = step(0.5, fract(scroll / 11.0));
  float marks = 0.0;
  marks += stripe(rx, -17.0, 0.7);         // borde izq
  marks += stripe(rx,  17.0, 0.7);         // borde der
  marks += stripe(rx,  -6.0, 0.45) * dash; // carril
  marks += stripe(rx,   6.0, 0.45) * dash; // carril
  marks += stripe(rx,   0.0, 0.35) * dash; // eje central
  col += uHot * marks * 0.9;

  float fogF = 1.0 - exp(-pow(distance(vWorld, uCamPos) * uFogDensity, 2.0));
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
}
`;

// --- CIELO: degradado violeta + sol de barras + CRT ---------------------
export const DUSK_VERT = /* glsl */ `
varying vec3 vDir;
varying vec2 vScreen;

void main() {
  vDir = normalize(position);
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vScreen = clip.xy / clip.w; // para las lineas de escaneo CRT
  gl_Position = clip;
}
`;

export const DUSK_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uHorizon; // violeta caliente
uniform vec3 uZenith;  // negro azulado
uniform vec3 uSun;

varying vec3 vDir;
varying vec2 vScreen;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

void main() {
  vec3 dir = normalize(vDir);
  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));

  // Sol bajo, al frente
  vec3 sunDir = normalize(vec3(0.0, 0.14, -1.0));
  float d = distance(dir, sunDir);
  float disc = smoothstep(0.32, 0.28, d);
  // Barras horizontales que recortan la mitad inferior del disco
  float bars = smoothstep(0.0, 0.03, sin(dir.y * 80.0 - 1.2));
  float barMask = mix(1.0, bars, smoothstep(0.14, 0.09, dir.y));
  col = mix(col, uSun, disc * barMask);
  col += uSun * smoothstep(0.6, 0.28, d) * 0.4;   // halo
  col += uSun * smoothstep(0.05, 0.0, abs(dir.y)) * 0.25; // brillo del horizonte

  // Estrellas dispersas en lo alto
  if (dir.y > 0.2) {
    vec2 cell = floor(dir.xz / max(dir.y, 0.2) * 55.0);
    float s = hash(cell);
    float star = step(0.986, s) * smoothstep(0.2, 0.6, dir.y);
    col += vec3(0.8, 0.75, 1.0) * star * (0.6 + 0.4 * sin(uTime * 3.0 + s * 40.0));
  }

  // Lineas de escaneo CRT sutiles (fijas en pantalla)
  float scan = 0.5 + 0.5 * sin(vScreen.y * 400.0);
  col *= 1.0 - scan * 0.04;

  gl_FragColor = vec4(col, 1.0);
}
`;
