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
- Efectos visuales vivos (solo Canvas2D): pipeline de iluminación y atmósfera, anillos procedurales con oclusión/sombra, bandas de gigantes, corona/ondas solares y fondo estelar. La animación visual se congela en pausa y respeta `prefers-reduced-motion`.
- Escala de cuerpos: modo **Relativo** (todos visibles, mínimo legible) o modo **Real** (una escala física única: tamaños y distancias proporcionales al Sol; slider del Sol 12 px–1M px, default 1000 px)
- Colisiones: fusionar o atravesar (solo motor N-body; las fusiones muestran una onda y etiqueta de impacto)
- Solver N-body intercambiable (`DirectNBodySolver` + stub `BarnesHutSolver`) + `OrbitalEngine` Kepler
- Ejecución en Web Worker (default si está disponible), con opción Hilo principal
  para comparar. El Worker mantiene el motor seleccionado y la física de referencia;
  su objetivo es liberar la interfaz, no garantizar la velocidad simulada pedida.
- Interpolación exclusivamente visual y estelas N-body muestreadas durante la
  integración, con memoria acotada y cortes si se pierde historial. FPS/p95 del
  canvas visibles, separados del indicador de tiempo simulado.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests físicos (Vitest)
npm run build    # producción
npm run benchmark  # módulos reales por fase + frames + N-body vs Orbital
npm run benchmark:worker # build + bundle Worker real, bloqueo del llamante vs tiempo completo
```

## Arquitectura

```
SimulationDocument → createSimulationRuntime(engineKind)
                   → SimulationEngine (N-body) | OrbitalEngine (Kepler)
                   → Snapshot → CanvasRenderer
```

Ver [docs/DESIGN-v1.md](docs/DESIGN-v1.md) para el diseño completo. El motor orbital es experimental: no incluye perturbaciones N-body ni efemérides JPL.

Durante la reproducción, el canvas recibe posiciones y velocidades en cada frame.
Los diagnósticos de conservación se recalculan al publicar el estado a la interfaz
(cada 100 ms); los frames intermedios reutilizan las últimas métricas publicadas.
Pausar, avanzar un paso o consultar `engine.getSnapshot()` obtiene métricas frescas.
La integración, el paso físico y las colisiones mantienen su comportamiento.

Con Worker, el canvas dibuja el último estado confirmado y puede interpolar
desplazamientos cortos para suavizar la presentación. Los paneles publican estados
con métricas frescas; pausa y paso manual esperan la confirmación del Worker.
Los cambios de escenario descartan respuestas antiguas y terminan el Worker
reemplazado. Si falla, la reproducción se detiene con un aviso: Hilo principal
permite continuar desde el último estado confirmado. La sesión asíncrona vive
en `src/runtime/`; los motores físicos síncronos conservan su contrato.

El benchmark utiliza el solver e integrador reales y separa el coste de integración,
colisiones sin solapes, diagnósticos y snapshots. Compara además seis frames con
diagnósticos en cada frame frente a una publicación por lote, con idéntica física.
Las mediciones son de CPU en Node, excluyen Canvas/React y no representan FPS del
navegador. Barnes–Hut sigue siendo un esqueleto; las mediciones sirven para decidir
la siguiente fase sin introducir aproximaciones en la física actual.
Resultados y límites de la medición: [docs/PERFORMANCE.md](docs/PERFORMANCE.md).
Implementación Worker, uso y mediciones: [docs/WORKER.md](docs/WORKER.md).

## Stack

- React 19 + TypeScript + Vite
- Zustand (estado UI)
- Vitest (validación física)
- Canvas 2D (render)
