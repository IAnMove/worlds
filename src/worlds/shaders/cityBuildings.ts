/**
 * Rascacielos de Data City: un unico InstancedMesh con ShaderMaterial.
 * Las ventanas emisivas se calculan proceduralmente en el fragment shader
 * (rejilla en unidades de mundo -> nunca se estiran, variedad infinita).
 * La matriz de instancia SOLO traslada; la escala viaja en aScale para
 * poder dibujar el patron en metros reales del edificio.
 */

export const BUILDINGS_VERT = /* glsl */ `
// instanceMatrix la declara three automaticamente (USE_INSTANCING)
attribute vec3 aScale;
attribute float aSeed;

varying vec3 vLocal;  // posicion local en metros (0..alto en y)
varying vec3 vUnit;   // posicion en la caja unitaria (para bordes)
varying vec3 vNormal;
varying float vSeed;
varying float vDist;  // distancia a camara (niebla)
varying vec3 vScale;

void main() {
  vLocal = position * aScale;
  vUnit = position;
  vNormal = normal;
  vSeed = aSeed;
  vScale = aScale;
  vec4 world = instanceMatrix * vec4(position * aScale, 1.0);
  world = modelMatrix * world;
  vDist = distance(world.xyz, cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const BUILDINGS_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uFogColor;
uniform float uFogDensity;

varying vec3 vLocal;
varying vec3 vUnit;
varying vec3 vNormal;
varying float vSeed;
varying float vDist;
varying vec3 vScale;

float hash12(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  // Cuerpo: azul noche casi negro, mas oscuro a pie de calle
  vec3 col = vec3(0.010, 0.022, 0.055) * (0.35 + 0.65 * smoothstep(0.0, 10.0, vLocal.y));

  vec3 an = abs(vNormal);
  bool tall = vScale.y > 55.0;

  if (an.y < 0.5) {
    // --- Cara lateral: rejilla de ventanas en metros de mundo ---
    float u = an.x > 0.5 ? vLocal.z : vLocal.x;
    // offset por cara para que cada fachada tenga patron propio
    float faceOff = (vNormal.x > 0.5 ? 7.3 : 0.0) + (vNormal.x < -0.5 ? 13.7 : 0.0)
                  + (vNormal.z > 0.5 ? 29.1 : 0.0) + (vNormal.z < -0.5 ? 41.9 : 0.0);
    vec2 cell = floor(vec2(u / 2.3 + faceOff, vLocal.y / 3.1));
    vec2 f = fract(vec2(u / 2.3, vLocal.y / 3.1));

    float h = hash12(cell + vSeed * 91.7);
    // Marco: solo brilla el hueco interior de la celda
    float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.78);
    // Suavizado a distancia: las ventanas se funden a un brillo medio
    // en vez de chisporrotear (aliasing)
    float aa = clamp(1.0 - (fwidth(u / 2.3) + fwidth(vLocal.y / 3.1)) * 1.2, 0.0, 1.0);

    float lit = step(0.56, h); // ~44% encendidas
    float bright = 0.35 + hash12(cell + 3.7) * 0.75;
    // Algunas parpadean lentamente
    float blink = hash12(cell + 9.2);
    if (blink > 0.93) bright *= 0.55 + 0.45 * sin(uTime * 2.5 + blink * 80.0);
    vec3 winCol = mix(vec3(0.25, 0.85, 1.15), vec3(0.85, 0.95, 1.05), hash12(cell + 17.3));

    vec3 winMix = winCol * bright * lit * win;
    // De lejos: media estadistica de la fachada (evita moire)
    vec3 farGlow = winCol * 0.22;
    col += mix(farGlow, winMix, aa) * smoothstep(2.5, 6.0, vLocal.y);

    // Pilares de las esquinas iluminados (solo torres altas)
    if (tall) {
      float corner = step(0.455, abs(vUnit.x)) * step(0.455, abs(vUnit.z));
      col += vec3(0.15, 0.75, 1.0) * corner * 0.55;
    }
  } else {
    // --- Azotea: borde luminoso tipo helipuerto ---
    float border = step(0.44, max(abs(vUnit.x), abs(vUnit.z)));
    col += vec3(0.12, 0.7, 1.0) * border * (tall ? 0.8 : 0.25);
  }

  // Corona superior: banda emisiva en la cima de las torres altas
  if (tall && vScale.y - vLocal.y < 1.4 && an.y < 0.5) {
    col += vec3(0.35, 1.3, 1.9) * (0.7 + 0.3 * sin(uTime * 1.7 + vSeed * 40.0));
  }

  // Niebla exponencial manual (ShaderMaterial no usa scene.fog)
  float fogF = 1.0 - exp(-pow(vDist * uFogDensity, 2.0));
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
}
`;
