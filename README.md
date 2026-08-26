# N-Body Orbital Laboratory

Simulador interactivo 2D de física planetaria/orbital para navegador.

## Características v1

- Gravedad Newtoniana directa O(N²) con integrador Leapfrog KDK (motor **N-body**, referencia)
- Motor **Orbital** experimental (Kepler 2D de dos cuerpos): seleccionable en la UI, nunca automático
- Unidades SI internas (m, s, kg)
- Escenarios predefinidos: Sol-Tierra, Tierra-Luna, Sol-Sedna, binario, tres cuerpos, escape, colisión, Kuiper…
- Escala temporal desacoplada de `physicsDt` con indicador Objetivo/Real (`requestedTimeScale` vs `effectiveTimeScale`); Kuiper usa `physicsDt = 7200` s sin lunas. El motor orbital evalúa el instante pedido sin subpasos Leapfrog.
- Métricas de conservación (energía, momento, momento angular)
- Canvas 2D: pan, zoom, trails, selección, follow camera; los trails de lunas se muestran relativos a su planeta padre
- Discos con **mapas fotográficos** (`public/textures/planets/`) e iluminación desde el Sol; fallback a color si aún no cargaron
- Escala de cuerpos: modo **Relativo** (todos visibles, mínimo legible) o modo **Real** (una escala física única: tamaños y distancias proporcionales al Sol; slider del Sol 12 px–1M px, default 1000 px)
- Colisiones: fusionar o atravesar (solo motor N-body; las fusiones muestran una onda y etiqueta de impacto)
- Solver N-body intercambiable (`DirectNBodySolver` + stub `BarnesHutSolver`) + `OrbitalEngine` Kepler

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests físicos (Vitest)
npm run build    # producción
npm run benchmark  # O(N²) + comparativa N-body vs Orbital
```

## Arquitectura

```
SimulationDocument → createSimulationRuntime(engineKind)
                   → SimulationEngine (N-body) | OrbitalEngine (Kepler)
                   → Snapshot → CanvasRenderer
```

Ver [docs/DESIGN-v1.md](docs/DESIGN-v1.md) para el diseño completo. El motor orbital es experimental: no incluye perturbaciones N-body ni efemérides JPL.

## Stack

- React 19 + TypeScript + Vite
- Zustand (estado UI)
- Vitest (validación física)
- Canvas 2D (render)
