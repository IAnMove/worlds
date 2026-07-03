# goldenidea

Viajes procedurales por mundos 3D inspirados en cómo los 90 imaginaban el
ciberespacio. Three.js + TypeScript + Vite.

## Comandos

```bash
npm install        # una vez
npm run dev        # desarrollo con recarga en caliente
npm run build      # typecheck + build de producción en dist/
npm run preview    # servir la build localmente
npm run release    # build + copiar dist/ a ../public (lo publicado)
```

## Cómo funciona

- `src/core/` — motor compartido: renderer, postprocesado (bloom), vuelo
  cinematográfico y ciclo de vida de los mundos.
- `src/worlds/` — un archivo por mundo. Cada mundo extiende `World`, declara su
  `WorldConfig` (velocidad, niebla, bloom) y se registra en `registry.ts`.
  Con eso aparece automáticamente en el menú.
- `src/ui/` — menú, HUD y transiciones (DOM puro, sin frameworks).

Las tareas pendientes, sus detalles y las reglas de trabajo están en
[task.md](./task.md).
