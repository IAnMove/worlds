/**
 * Suelo de Data City: plano infinito con grid procedural anti-aliasado
 * (lineas menores/mayores) y pulsos de energia que se expanden desde el
 * rumbo de la camara. El plano va pegado a la camara; el patron usa
 * coordenadas de mundo, asi que parece un suelo estatico infinito.
 */

export const GROUND_VERT = /* glsl */ `
varying vec3 vWorld;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const GROUND_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCamPos;

varying vec3 vWorld;

// Linea de grid anti-aliasada: 1 en la linea, 0 fuera, ancho constante en px
float gridLine(vec2 coord) {
  vec2 g = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
  return 1.0 - min(min(g.x, g.y), 1.0);
}

void main() {
  vec3 col = vec3(0.004, 0.010, 0.024);

  float minor = gridLine(vWorld.xz / 10.0);
  float major = gridLine(vWorld.xz / 100.0);
  col += vec3(0.0, 0.35, 0.5) * minor * 0.30;
  col += vec3(0.1, 0.6, 0.85) * major * 0.55;

  // Pulso de energia: anillo que se expande desde la camara cada pocos segundos
  float dist = distance(vWorld.xz, uCamPos.xz);
  float r = mod(uTime * 90.0, 800.0);
  float ring = smoothstep(14.0, 0.0, abs(dist - r));
  col += vec3(0.1, 0.8, 1.1) * ring * (minor * 0.8 + 0.08);

  float fogF = 1.0 - exp(-pow(distance(vWorld, uCamPos) * uFogDensity, 2.0));
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
}
`;
