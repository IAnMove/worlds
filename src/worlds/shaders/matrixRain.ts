/**
 * Lluvia de glifos de Matrix. Cada instancia es UNA columna de lluvia:
 * un quad vertical de 16 celdas que muestrea un atlas de katakana generado
 * por codigo. La cabeza blanca desciende y deja estela verde; los glifos
 * mutan a saltos. Todo (caida, envolvido alrededor de la camara, billboard)
 * se calcula en GPU: el update() de CPU solo actualiza uTime y uCamPos.
 */

export const RAIN_ROWS = 16;

export const RAIN_VERT = /* glsl */ `
attribute vec3 aOffset;  // base de la columna (x, yBase, z)
attribute float aSpeed;
attribute float aSeed;

uniform vec3 uCamPos;
uniform float uHalf;

varying vec2 vUv;
varying float vSpeed;
varying float vSeed;
varying float vDist;

void main() {
  // Envolvido: la nube de columnas siempre rodea a la camara
  vec3 base = aOffset;
  base.xz = mod(base.xz - uCamPos.xz, uHalf * 2.0) - uHalf + uCamPos.xz;

  // Billboard cilindrico: la columna mira a la camara solo en horizontal
  vec3 toCam = uCamPos - base;
  toCam.y = 0.0;
  float dl = max(length(toCam), 0.001);
  vec3 fwd = toCam / dl;
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 world = base + right * position.x + vec3(0.0, 1.0, 0.0) * (position.y + 10.0);

  vUv = uv;
  vSpeed = aSpeed;
  vSeed = aSeed;
  vDist = dl;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const RAIN_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTime;

varying vec2 vUv;
varying float vSpeed;
varying float vSeed;
varying float vDist;

float hash11(float p) {
  p = fract(p * 443.8975);
  p += p * (p + 19.19);
  return fract(p * p);
}

void main() {
  const float ROWS = ${RAIN_ROWS}.0;
  float row = floor(vUv.y * ROWS);

  // La cabeza desciende en bucle; below = celdas por encima de la cabeza
  float phase = fract(uTime * vSpeed * 0.35 + hash11(vSeed));
  float head = (1.0 - phase) * ROWS;
  float below = row - head;
  if (below < 0.0) below += ROWS;
  float tail = exp(-below * 0.32);

  // Glifo de la celda: muta a saltos, cada celda a su ritmo
  float mutate = floor(uTime * (1.5 + hash11(vSeed + row * 0.61) * 6.0));
  float glyph = floor(hash11(vSeed * 13.7 + row * 7.31 + mutate * 0.173) * 64.0);
  vec2 cell = vec2(mod(glyph, 8.0), floor(glyph / 8.0));
  vec2 uvLocal = vec2(vUv.x, fract(vUv.y * ROWS));
  float a = texture2D(uAtlas, (cell + uvLocal) / 8.0).a;

  // Cabeza blanca-verdosa, estela verde Matrix
  float isHead = smoothstep(2.0, 0.3, below);
  vec3 col = mix(vec3(0.10, 0.95, 0.28), vec3(0.85, 1.0, 0.88), isHead);

  float alpha = a * tail;
  // Desvanecer pegado a camara y a lo lejos (niebla manual): la lluvia
  // debe leerse cerca, no acumularse en una sopa de puntos al fondo
  alpha *= smoothstep(3.0, 10.0, vDist) * (1.0 - smoothstep(42.0, 85.0, vDist));

  gl_FragColor = vec4(col * (0.3 + tail * 1.3), alpha);
}
`;
