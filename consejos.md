# Consejos: rendimiento y mundos nuevos

Guía práctica para este proyecto (motor Three.js + mundos procedurales tipo
salvapantallas). Todo lo de aquí sale de cómo está montado el motor: mira
`src/core/World.ts`, `src/core/utils/` y cualquier mundo existente como plantilla.

---

## 1. Rendimiento

### La regla de oro: nada de `new` en `update()`
El bucle corre 60 veces por segundo. Crear objetos por frame (Vector3, Matrix4,
Color, geometrías…) llena la memoria de basura y provoca micro-tirones cuando el
recolector se activa. En su lugar:

- **Temporales de módulo**: declara `const tmpVec = new THREE.Vector3()` (etc.)
  arriba del archivo y reutilízalos. Todos los mundos lo hacen.
- **No destruyas ni crees mallas al vuelo**: usa reciclado (ver abajo).

### El "cinturón de correr" (treadmill) — mundos infinitos baratos
El truco central del proyecto: el mundo no es infinito de verdad, **te sigue**.

- **Suelo/cielo pegados a la cámara**: un solo plano/esfera cuya posición se
  copia de la cámara cada frame; el shader usa coordenadas de mundo (o dirección
  de mirada) para *parecer* estático e infinito. Coste: 1 draw call.
  Ejemplo: `shaders/cityGround.ts`, `shaders/outrun.ts`.
- **Elementos reciclados**: cuando algo queda lejos o detrás, se **recoloca
  delante** en vez de destruirse. Herramientas en `src/core/utils/recycle.ts`:
  `distanceXZ`, `isBehind`, `respawnAheadXZ`, `wrapAround`. El número de objetos
  es constante; el recolector, en silencio.

### Dibuja mucho con pocas llamadas
El cuello de botella no suele ser el número de triángulos, sino el número de
**draw calls**.

- **`InstancedMesh`** para miles de copias de la misma geometría (edificios,
  pirámides, aros, montañas): una sola llamada. Escribe matrices con
  `setMatrixAt` + `instanceMatrix.needsUpdate = true` **solo cuando cambian**
  (usa un flag `dirty`, no lo marques cada frame porque sí).
- **`Points`** para partículas (ascuas, polvo, estrellas): un buffer, una
  llamada. Anima en el vertex shader si puedes en vez de en CPU.
- **`LineSegments`** para aristas/wireframe: uno agrupado en vez de N líneas.

### Deja el trabajo pesado en la GPU
Un shader que dibuja rejillas, nebulosas o campos de estrellas es casi gratis
comparado con mover geometría en CPU. Si algo se puede expresar como función de
la posición o del tiempo, hazlo en el fragment/vertex shader.

- Anima con **uniforms** (`uTime`, `uScroll`), no reconstruyendo geometría.
- El desplazamiento infinito se hace moviendo la *coordenada de muestreo*, no la
  malla (ver `PsychedelicWorld` y su `uScroll`).

### `frustumCulled = false` cuando toque
Si un shader deforma la geometría o la malla va pegada a la cámara, Three puede
descartarla por error al calcular su bounding box. Ponlo en `false` en esos
casos (lo verás en todos los mundos). No lo pongas en todo: el culling ayuda.

### Cuida el bloom y la resolución
- El **bloom** (`PostFX`) cuesta *por píxel*. Es el pase más caro. Sube
  `threshold` para que brille menos cosa, o baja `strength`/`radius` en mundos
  cargados. Cada mundo fija el suyo en `config.bloom`.
- La **resolución dinámica** ya está en `Engine.ts`: baja la escala de render si
  el frame se pasa de ~20 ms y la recupera cuando hay holgura. No hace falta
  tocarla; si un mundo va mal, lo primero es reducir su carga, no subir la escala.
- `pixelRatio` está topado a 2: en pantallas retina el coste crece al cuadrado.

### Luces: pocas y con `distance`
Cada luz dinámica multiplica el coste de sombreado de los materiales `Standard`.

- Reutiliza un **pool** de luces (los meteoritos de `PyramidWorld` usan 4 y las
  reciclan; `PsychedelicWorld` orbita 3).
- Da siempre `distance` y `decay` a las `PointLight`: acota su influencia y evita
  que iluminen toda la escena.
- Para elementos que solo tienen que *brillar* (aros, marcas, ascuas), usa
  `MeshBasicMaterial` con `AdditiveBlending` + bloom en vez de luz real: cero
  coste de iluminación.

### Presupuesto orientativo por mundo
- Objetos reciclados (instancias): cientos, sin problema (Data City ~ y Pyramid
  usa 240 pirámides).
- Partículas `Points`: unos pocos miles.
- Luces dinámicas: ≤ 4–5.
- Draw calls totales: mantenlo en decenas, no cientos.

### Cómo medir
- Abre las DevTools → pestaña *Performance*, graba unos segundos y mira si hay
  *long tasks* o picos de GC (dientes de sierra en memoria = estás creando
  objetos por frame).
- Prueba en una ventana grande / pantalla 4K: ahí es donde se nota el bloom.

---

## 2. Crear un mundo nuevo (salvapantallas)

### Los dos pasos mecánicos
1. Crea una clase en `src/worlds/` que extienda `World` (copia el esqueleto de
   uno existente).
2. Añádela a `src/worlds/registry.ts`. **Nada más**: el menú, las transiciones y
   el ciclo de vida (`init` → `update` → `dispose`) son automáticos.

### Anatomía de un mundo
- `config`: velocidad de vuelo, color de fondo/niebla, bloom, posición inicial y
  límites blandos (`bounds`) que reconducen el vuelo. Es la "personalidad".
- `init(camera)`: construye la escena **una vez**. Reparte en métodos pequeños
  (`initSuelo`, `initCielo`, …) para que se lea.
- `update(dt, elapsed, camera)`: anima, recicla, da sensación de vida. Sin `new`.
- `steerBias?` (opcional): empuja el rumbo para esquivar obstáculos — una
  corriente invisible, nunca un tope seco (ver `PyramidWorld`).

### Usa el RNG determinista
`createRng(semilla)` de `utils/random.ts`, no `Math.random()`. Con la misma
semilla el mundo es reproducible: puedes afinar la estética sin que cambie cada
recarga. Helpers: `range`, `rangeInt`, `pick`.

---

## 3. Ideas para mundos interesantes

Un buen salvapantallas tiene **una idea visual fuerte**, ritmo (algo que pasa
cada pocos segundos) y **profundidad** (capas cerca/lejos que dan parallax).

### Conceptos que encajan con el motor
- **Océano bioluminiscente**: plano de olas (vertex shader senoidal), plancton
  que brilla al pasar, medusas recicladas que suben y bajan.
- **Cañón de cristal**: paredes de prismas instanciados a los lados de un
  corredor, luz que refracta y cambia de color; vuelas por el desfiladero.
- **Tormenta eléctrica**: nubes volumétricas (shader), relámpagos procedurales
  (líneas ramificadas) que iluminan la escena en destellos — mismo truco que los
  meteoritos de Pyramid.
- **Bosque de fibra óptica / hongos de neón**: tallos instanciados con puntas
  emisivas que laten al ritmo de `elapsed`.
- **Autopista de tráfico de datos** (variación cyber): cintas de luz que fluyen,
  nodos que pulsan, paquetes que viajan por las líneas.
- **Enjambre / boids**: nube de instancias con reglas simples de bandada; barato
  si evitas el O(n²) (usa una rejilla espacial o vecindad aproximada).
- **Ciudad submarina / ruinas**: columnas recicladas, rayos de luz (god rays),
  partículas de sedimento envueltas alrededor de la cámara.
- **Aurora boreal**: cortinas de luz (planos con shader de ruido animado) sobre
  un campo de estrellas y montañas oscuras en silueta.

### Recetas de "efecto por poco coste"
- **Destello que ilumina**: un objeto que aparece y dispara una `PointLight` que
  decae (`intensidad = pico * k²`) + una onda que crece y se desvanece. Da vida y
  cambia la iluminación de toda la escena. (Meteoritos de Pyramid.)
- **Pulsos que se expanden**: un anillo `smoothstep(|dist - r|)` en el shader del
  suelo, con `r = mod(tiempo * v, max)`. (Data City.)
- **Sol de barras retro**: disco en el cielo recortado por bandas horizontales.
  (`shaders/synthwave.ts`, `shaders/outrun.ts`.)
- **Campo de estrellas en shader**: `hash` de celdas + `step` para dispersión +
  parpadeo con `sin(tiempo)`. Cero geometría.
- **Niebla como herramienta estética**: sube `fogDensity` para acortar la
  distancia visible y esconder el reciclado; el color de niebla = `clearColor`.

### Paletas que funcionan
- Cada mundo tiene un **acento** en el registry (color de su tarjeta). Elige una
  paleta con 1–2 colores dominantes + un acento que brille con el bloom.
- El contraste importa: fondo oscuro + neón brillante = el look del proyecto.
  Si algo "se ve apagado", el problema suele ser falta de luz o de contraste, no
  de detalle.

### Checklist antes de dar por bueno un mundo
- [ ] Se ve bien **desde el primer frame** (no hay que esperar a que "cargue").
- [ ] Nada aparece/desaparece de golpe delante de la cámara (recicla con margen y
      esconde el pop con niebla o distancia).
- [ ] Hay **movimiento a varias escalas**: fondo lento, cerca rápido.
- [ ] Pasa algo cada pocos segundos (un destello, un pulso, un cambio de color).
- [ ] `npm run check` y `npm run build` pasan.
- [ ] Frame estable en pantalla grande (mira la resolución dinámica: si baja
      mucho la escala, el mundo es demasiado pesado).

---

## 4. Plantilla mínima para empezar

Cópiala en `src/worlds/MiMundo.ts`, rellénala y regístrala en `registry.ts`:

```ts
import * as THREE from 'three';
import { World, WorldConfig } from '../core/World';
import { createRng, range } from '../core/utils/random';
import { distanceXZ, respawnAheadXZ } from '../core/utils/recycle';

const COUNT = 200;
const RADIUS = 500;

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();

export class MiMundo extends World {
  readonly config: WorldConfig = {
    flySpeed: 40,
    clearColor: 0x050510,
    fogDensity: 0.002,
    bloom: { strength: 1.0, radius: 0.8, threshold: 0.5 },
    cameraStart: new THREE.Vector3(0, 14, 0),
  };

  private readonly rng = createRng(1234);
  // ...campos (InstancedMesh, Points, uniforms de shaders)...

  init(camera: THREE.PerspectiveCamera): void {
    // construir cielo/suelo pegados a la cámara + elementos reciclados
  }

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    // mover shaders con uniforms, reciclar lo que quedó lejos, animar
  }
}
```
