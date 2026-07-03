# goldenidea — tareas

Plataforma de viajes procedurales 3D (Three.js + TypeScript + Vite).
La base (tarea 0) ya está hecha: motor, vuelo, menú, HUD, transiciones y
tres mundos placeholder funcionales.

## Reglas de trabajo (leer antes de empezar cualquier tarea)

- **Un commit por tarea**, con mensaje `Tarea N: <título>`.
- Antes de commitear: `npm run build` debe pasar sin errores.
- Verificar en navegador con `npm run dev` que el mundo va fluido (~60 fps) y que
  entrar/salir del mundo (ESC) no deja errores en consola.
- **Nunca crear/destruir objetos dentro de `update()`**: todo se recicla.
  El patrón de referencia está en `src/worlds/DataCityWorld.ts` (posiciones en
  array + `respawnAheadXZ` de `src/core/utils/recycle.ts`).
- **Nunca alocar `Vector3`/`Matrix4`/`Color` por frame**: usar temporales a nivel
  de módulo (ver los `tmp*` en los mundos existentes).
- Usar siempre `createRng(semilla)` de `src/core/utils/random.ts`, nunca `Math.random()`.
- No tocar `src/core/` salvo que la tarea lo pida explícitamente.
- Los mundos no tocan el renderer ni el postprocesado: todo lo suyo se declara
  en su `WorldConfig` y vive dentro de su `scene`.

## Mapa del código

```
src/
├── index.html            lienzo + capa de UI
├── src/main.ts           arranque: conecta motor, vuelo, UI y mundos
├── src/style.css         estilos del menú, HUD y transición
├── src/core/
│   ├── Engine.ts         renderer, cámara, bucle
│   ├── PostFX.ts         composer: render → bloom → salida
│   ├── FlightController.ts  vuelo con inercia, ratón y deriva idle
│   ├── World.ts          clase base + WorldConfig (contrato de los mundos)
│   ├── WorldManager.ts   ciclo de vida menú ↔ mundo
│   └── utils/            random (RNG con semilla), recycle, ObjectPool
├── src/ui/               Menu, HUD, Transition (DOM puro)
└── src/worlds/
    ├── registry.ts       catálogo: para añadir un mundo se registra aquí
    └── *World.ts         un archivo por mundo, autónomos
```

---

## Tarea 0 — Base del proyecto ✅ (hecha)

Motor, vuelo, UI, tres mundos placeholder, script de release. Ya commiteada.

---

## Tarea 1 — Data City: rascacielos de información

**Archivo:** `src/worlds/DataCityWorld.ts` (sustituir el placeholder).

Convertir las cajas planas actuales en una ciudad de datos espectacular:

1. **Ventanas emisivas**: generar UNA textura de ventanas por código en un
   `<canvas>` 2D (128×256): fondo azul muy oscuro `#020818`, rejilla de
   rectángulos 4×8 px, ~40% encendidos en cian/blanco con brillos variables.
   Crear 4 variantes con distinto patrón. Convertir con `THREE.CanvasTexture`
   (`magFilter: NearestFilter`) y usarlas en `MeshBasicMaterial` sobre 4
   `InstancedMesh` (repartir los 700 edificios entre las 4 texturas, ~175 c/u).
   Ajustar `repeat` del UV NO por textura (es compartida): en su lugar hacer que
   la geometría base tenga UVs que repitan por metro usando
   `texture.wrapS/T = RepeatWrapping` y escala del edificio; probar visualmente
   que las ventanas no se estiran de forma fea en torres altas.
2. **Coronas luminosas**: un `InstancedMesh` extra de cajas finas
   (1×0.5×1 escaladas al ancho del edificio) colocadas en la cima de cada torre,
   color cian brillante `setHSL(0.52, 1, 0.7)` para que el bloom las encienda.
   Se recolocan junto con su torre al reciclar (mismo índice).
3. **Distritos**: al generar/reciclar una torre, decidir su altura con la
   distancia a un "centro de distrito" ficticio:
   `h = 8 + 90 * suavizado(ruido)` donde el ruido puede ser
   `Math.sin(x*0.011) * Math.cos(z*0.013)` normalizado a [0,1]. Resultado:
   clusters de torres altas separados por zonas bajas, como downtown/suburbio.
4. **Avenidas**: dejar libres dos franjas perpendiculares cada 160 unidades
   (si `|x mod 160| < 18` o `|z mod 160| < 18`, no colocar torre: reintentar
   posición hasta 4 veces, si no, escalar la torre a altura 2 como "losa").
5. Mantener el grid del suelo pero bajar su opacidad a 0.25 para que no compita.

**Criterio de aceptación:** desde el aire se ven clusters de rascacielos con
ventanas iluminadas, coronas brillando con bloom y avenidas oscuras; 60 fps;
`update()` sin alocaciones nuevas (verificar que no hay `new` dentro del bucle).

---

## Tarea 2 — Data City: tráfico de datos

**Archivo:** `src/worlds/DataCityWorld.ts`.

Añadir la sensación de red viva:

1. **Líneas de conexión**: 60 líneas (`THREE.Line` con `LineBasicMaterial`
   transparente, opacidad 0.35, color cian) que unen cimas de torres cercanas.
   Generarlas como pool fijo: cada línea tiene 2 extremos elegidos entre las
   posiciones de torres a menos de 150 unidades entre sí. Cuando cualquiera de
   sus torres se recicla, la línea se reasigna a otro par de torres cercanas a
   la cámara. Usar UNA `BufferGeometry` con 120 segmentos (240 vértices) y
   `LineSegments` en vez de 60 objetos Line — un solo draw call.
2. **Paquetes de datos**: 300 puntos brillantes (`THREE.Points`, tamaño 1.5,
   blanco) que viajan por las líneas: cada paquete guarda índice de línea y
   `t ∈ [0,1]`, avanza `t += velocidad * dt` y su posición es
   `lerp(extremoA, extremoB, t)`; al llegar a 1 salta a otra línea aleatoria.
   Reescribir el `Float32Array` de posiciones cada frame (300×3 floats es barato).
3. **Haces verticales**: 12 columnas de luz (cilindros altos, radio 1.5,
   `MeshBasicMaterial` aditivo `blending: AdditiveBlending`, opacidad 0.15,
   color blanco-cian) sobre las torres más altas visibles, reciclándose con
   el mismo criterio de distancia que las torres.

**Criterio de aceptación:** se ven paquetes de luz recorriendo líneas entre
torres constantemente en cualquier dirección de vuelo; 60 fps estables.

---

## Tarea 3 — [FABLE] Matrix: lluvia de glifos con shader propio

**Archivo:** `src/worlds/MatrixWorld.ts` + nuevo `src/worlds/shaders/matrixRain.ts`.

Sustituir los `THREE.Points` verdes por auténtica lluvia de código:

1. Generar un **atlas de glifos** por código en canvas 2D (512×512, rejilla 8×8
   = 64 glifos): katakana half-width (U+FF66–U+FF9D), dígitos y algún símbolo,
   pintados en blanco sobre transparente con fuente monospace.
2. **ShaderMaterial propio** sobre un `InstancedBufferGeometry` de quads
   (una columna de lluvia = un quad vertical de 1×16 unidades, ~800 instancias):
   - vertex shader: billboard cilíndrico (mira a cámara solo en Y).
   - fragment shader: cada columna muestrea el atlas en una rejilla vertical de
     16 celdas; el índice de glifo por celda cambia con
     `floor(hash(celda + floor(time*8)))`; brillo por celda decae desde la
     "cabeza" que baja con el tiempo (`fract(time*velocidadColumna)`) — cabeza
     blanca, cola verde `#39ff66` desvaneciéndose.
   - atributos por instancia: offset, velocidad, semilla.
3. Las columnas envuelven a la cámara con `wrapAround` en XZ (igual que ahora).
4. Mantener sincronizado `uniform float uTime` desde `update()`.

Esta tarea requiere escribir GLSL desde cero y afinar el resultado a ojo:
la hace FABLE.

**Criterio de aceptación:** columnas de glifos cayendo con cabeza brillante y
estela, indistinguibles a primera vista de la lluvia de Matrix; 60 fps con ~800
columnas.

---

## Tarea 4 — Matrix: autopistas de datos y arquitectura imposible

**Archivo:** `src/worlds/MatrixWorld.ts`.

1. **Autopista**: el vuelo debe encontrarse a menudo con "autopistas": tubos de
   luz (`THREE.TubeGeometry` sobre `CatmullRomCurve3` de 6 puntos generados
   hacia delante, radio 0.8, material aditivo verde). Pool de 8 tubos; cuando
   uno queda atrás (usar `isBehind` con margen 100), regenerar su curva delante
   de la cámara. Como `TubeGeometry` no se puede regenerar sin alocar, crear las
   8 geometrías con los mismos parámetros y actualizar los `position` del
   atributo escribiendo sobre el buffer existente a partir de la nueva curva
   (mismo número de segmentos ⇒ mismo tamaño de buffer).
2. **Paneles holográficos**: 40 planos (`PlaneGeometry` 8×5) con
   `CanvasTexture` generada por código (texto verde estilo terminal: hex dumps,
   "SYSTEM BREACH", coordenadas…, 4 variantes de textura). Material
   `MeshBasicMaterial` transparente, opacidad 0.7, `side: DoubleSide`,
   ligero balanceo senoidal en `update()`. Reciclado con `respawnAheadXZ`,
   altura aleatoria entre 5 y 60.
3. **Arcos imposibles**: 20 marcos rectangulares gigantes (`BoxGeometry` en 4
   piezas instanciadas o `TorusGeometry` de sección cuadrada baja) que cruzan
   por encima del vuelo, verde neón oscuro con aristas brillantes.
4. Bajar `RAIN_COUNT`/columnas si hiciera falta para mantener 60 fps.

**Criterio de aceptación:** volar 2 minutos sin mover el ratón atraviesa
autopistas, paneles y arcos sin cortes visibles de generación; 60 fps.

---

## Tarea 5 — [FABLE] Psychedelic: túnel deformado con vertex shader ✅ (hecha por FABLE)

**Archivo:** `src/worlds/PsychedelicWorld.ts` + `src/worlds/shaders/psyTunnel.ts`.

1. Sustituir los anillos por un **túnel continuo**: `CylinderGeometry` abierto
   (radio 12, largo 400, 64×200 segmentos, `side: BackSide`) centrado en la
   cámara y orientado al rumbo, con `ShaderMaterial`:
   - vertex: desplazar el radio con 2–3 octavas de ruido simplex 3D
     (`posición * escala + uTime * deriva`) → paredes orgánicas que ondulan.
   - fragment: color por `hsl(uTime*0.03 + coordenadaLongitudinal*0.15, …)`,
     bandas y patrones de interferencia (`sin` de coordenadas deformadas),
     borde fresnel brillante para alimentar el bloom.
   - incluir el simplex GLSL clásico (webgl-noise de Ashima) en el shader.
2. El túnel NO se mueve con precisión con la cámara: mantenerlo centrado en
   `cámara + forward*150` re-orientándolo suavemente (slerp del quaternion del
   mesh hacia el rumbo, factor 0.02) para que girar se sienta como si el túnel
   se curvara.
3. Mantener los blobs actuales pero reducirlos a 200 y meterlos DENTRO del
   radio del túnel.

Shader art no trivial que hay que afinar a ojo: FABLE.

**Criterio de aceptación:** sensación de viajar por un túnel orgánico infinito
que respira y cambia de color continuamente, sin costuras visibles; 60 fps.

---

## Tarea 6 — Psychedelic: partículas orgánicas y luces dinámicas

**Archivo:** `src/worlds/PsychedelicWorld.ts`.

1. **Partículas polvo de sueño**: 3000 `THREE.Points` con `PointsMaterial`
   aditivo, tamaño 0.4, envueltas alrededor de la cámara (`wrapAround` en XYZ,
   media caja 80). Movimiento: velocidad base + oscilación
   `sin(elapsed * f + fase)` por eje con f y fase por partícula (precalcular
   arrays `Float32Array` en `init`). Color por vértice ciclando matices.
2. **Fractales sencillos**: 30 "flores" hechas cada una con un
   `InstancedMesh` compartido de octaedros (90 instancias = 30 flores × 3
   niveles): nivel 0 escala 3, nivel 1 seis hijos a escala 1.2 orbitando,
   nivel 2 pequeños a 0.5. Rotación jerárquica animada en `update()`
   componiendo matrices (sin `Object3D` anidados, solo matemáticas).
   Reciclado con `respawnAheadXZ`.
3. **Luces**: 2 `PointLight` de colores complementarios que orbitan la cámara
   (radio 25) ciclando matiz; cambiar el material de las flores a
   `MeshStandardMaterial` (`roughness` 0.3, `emissive` según matiz) para que
   las luces se noten. Solo las flores usan luz: partículas y túnel siguen
   siendo unlit.

**Criterio de aceptación:** el espacio se siente vivo y onírico: polvo aditivo,
flores fractales girando y luz de color barriendo las formas; 60 fps.

---

## Tarea 7 — Previews animadas en las tarjetas del menú

**Archivos:** `src/ui/Menu.ts`, nuevo `src/ui/CardPreview.ts`, `src/worlds/registry.ts`.

1. Añadir a `WorldDefinition` un campo opcional
   `preview?: (ctx: CanvasRenderingContext2D, t: number) => void` que pinta un
   frame de preview en 2D (300×150). Implementar una preview por mundo:
   - data-city: skyline de rectángulos azules con ventanas parpadeantes y
     puntos blancos moviéndose entre ellas.
   - matrix: columnas de caracteres katakana cayendo (canvas 2D `fillText`).
   - psychedelic: círculos concéntricos que respiran ciclando matiz.
2. `CardPreview`: gestiona UN solo `requestAnimationFrame` para todas las
   tarjetas; pinta cada canvas a 30 fps máximo (throttle por timestamp);
   **se detiene por completo cuando el menú está oculto** (llamar a
   `pause()`/`resume()` desde `Menu.hide()`/`show()`).
3. Insertar el `<canvas>` dentro de `.card-preview` (que ya existe con
   `data-world="<id>"`); mantener el degradado CSS como fondo de respaldo.

**Criterio de aceptación:** las tres tarjetas muestran animaciones distintas y
reconocibles; con el menú oculto no se consume CPU en previews (verificar en
la pestaña Performance que no hay rAF activo durante un viaje).

---

## Tarea 8 — Transición cinematográfica

**Archivos:** `src/ui/Transition.ts`, `src/core/WorldManager.ts`, `src/core/FlightController.ts`.

1. En `FlightController`, añadir `speedMultiplier` (por defecto 1) que
   multiplica a `speed` en `update()`.
2. Al **entrar** a un mundo: empezar con `speedMultiplier = 3` y FOV 95, y
   relajar ambos hacia 1 y 70 durante ~2 s con `THREE.MathUtils.damp` en el
   `update()` del `WorldManager` (recordar `camera.updateProjectionMatrix()`
   cuando cambie el FOV). Sensación de "aterrizar" en el mundo a toda velocidad.
3. Al **salir**: invertir — 1 s acelerando (multiplier hacia 4, FOV hacia 100)
   mientras el fundido oscurece.
4. El fundido de `Transition` pasa de negro plano a un degradado radial
   (centro transparente que se cierra), con `background: radial-gradient` y
   animando `--radius` vía `transition` de una custom property registrada con
   `@property`, o más simple: dos capas con opacidades escalonadas.
5. Mantener las promesas `fadeOut()`/`fadeIn()` con la misma firma: el
   `WorldManager` no debe cambiar su lógica de `await`.

**Criterio de aceptación:** entrar a un mundo se siente como una zambullida
(veloz → crucero) y salir como despegar; sin saltos bruscos de imagen.

---

## Tarea 9 — Afinado del vuelo

**Archivo:** `src/core/FlightController.ts`.

1. **Respiración**: en modo idle, añadir un bob vertical sutil a la posición
   (`sin(elapsed*0.5) * 0.3` unidades) y variación de ±8% en la velocidad con
   otro seno lento — como flotar respirando.
2. **Transición manual↔idle sin salto**: al entrar en idle, los senos de deriva
   deben arrancar desde el valor actual: guardar el steer actual y mezclarlo
   con el steer idle con un blend que sube de 0→1 en 2 s.
3. **Suelo blando**: exponer `minY`/`maxY` opcionales (configurables por mundo
   en `WorldConfig`, p. ej. Data City `minY: 6`) y aplicar una fuerza suave que
   empuja el pitch hacia arriba cuando la cámara se acerca a `minY` (nunca un
   clamp seco de posición).
4. Añadir los campos opcionales a `WorldConfig` y valores sensatos en los tres
   mundos (Matrix `minY: 4`; Psychedelic sin límites).

**Criterio de aceptación:** dejar el ratón quieto 60 s produce un vuelo que
parece pilotado por alguien soñando; es imposible estrellarse contra el suelo
en Data City/Matrix; retomar el ratón nunca produce un tirón.

---

## Tarea 10 — Rendimiento adaptativo

**Archivos:** nuevo `src/core/Quality.ts`, `src/core/Engine.ts`.

1. `Quality`: mide el tiempo de frame con media móvil (ventana 60 frames).
   Si la media supera 20 ms durante 3 s seguidos, baja un escalón; si baja de
   13 ms durante 10 s, sube un escalón (con histéresis para no oscilar).
2. Escalones: `high` (pixelRatio hasta 2, bloom on), `medium` (pixelRatio 1.25,
   bloom on), `low` (pixelRatio 1, bloom off — saltarse el `bloomPass` con
   `bloomPass.enabled = false`).
3. `Engine` consulta a `Quality` y aplica cambios SOLO cuando cambia el escalón
   (cambiar pixelRatio implica `setSize`, es caro).
4. Log discreto en consola al cambiar de escalón (`console.info`).

**Criterio de aceptación:** en un portátil sin GPU dedicada la experiencia se
mantiene fluida degradando resolución en vez de tartamudear; en equipos
potentes nada cambia.

---

## Tarea 11 — [FABLE] Pulido final y dirección de arte

**Archivos:** todos los mundos, `PostFX.ts` si hace falta.

Pasada final con criterio estético (por eso FABLE):

1. Revisar paletas, densidades de niebla y parámetros de bloom mundo a mundo
   con capturas comparadas.
2. Añadir un pase de **viñeta + grano de película** sutil (ShaderPass propio al
   final de la cadena, intensidad configurable por mundo, por defecto muy bajo).
3. Micro-variaciones: parpadeos de luces en Data City, glitches ocasionales en
   Matrix (1 frame de desplazamiento de UVs cada ~20 s), pulsos de saturación
   en Psychedelic.
4. Ajustar velocidades de vuelo por mundo tras probar todas las tareas juntas.

**Criterio de aceptación:** las tres experiencias se sienten de la misma
familia visual y cada una provoca el "quiero seguir explorando".

---

## Tarea 12 — Release a public

1. `npm run release` (compila y copia `dist/` → `../public/`, vaciándolo antes).
2. Abrir lo servido desde `public/` y verificar menú + los tres mundos.
3. Commit `Tarea 12: release vX.Y` (subir `version` en `package.json` antes).

**Criterio de aceptación:** `public/` contiene una build funcional y ninguna
ruta rota (la build usa rutas relativas, `base: './'`).

---

## Ideas futuras (no son tareas todavía)

- Música generativa + audio reactivo (analizador → uniforms de shaders).
- Más mundos: océano de datos, biblioteca infinita, red neuronal, vaporwave.
- Modo "deriva eterna" que rota de mundo en mundo con crossfade.
- Compartir semilla por URL (`?seed=`) para viajes reproducibles.
