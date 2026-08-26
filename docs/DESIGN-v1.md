# N-Body Orbital Laboratory — Diseño Técnico v1

> Documento de investigación y arquitectura. **No contiene implementación.**
> Objetivo: que un agente implementador pueda construir la v1 sin volver a investigar los repositorios de referencia.

**Fecha:** 2026-08-22  
**Repositorios analizados:** [Tycho](https://github.com/jshor/tycho), [GalaxySim](https://github.com/haxybaxy/webgpu-galaxy), [Particular](https://github.com/Canleskis/particular), [Solar Sim](https://github.com/ben9583/solar-sim), [GraphGPU](https://github.com/drkameleon/GraphGPU)

---

## Recomendación inequívoca

> **Para v1 recomiendo: simulador 2D en TypeScript puro, con gravedad directa O(N²), integrador Leapfrog KDK, unidades SI, física en el hilo principal con presupuesto de subpasos por frame, render Canvas2D/WebGL2 desacoplado, estado UI con Zustand, y arquitectura de solver intercambiable inspirada en Particular — sin WebGPU, sin WASM y sin Barnes-Hut en la primera entrega.**

**Porque:**

1. **Corrección física:** O(N²) es exacto con ε=0 (default v1). Barnes-Hut introduce error de aproximación innecesario para N ≤ 100.
2. **Estabilidad numérica:** Leapfrog KDK es simpléctico; conserva energía y momento angular mucho mejor que Euler (usado en Solar Sim) o RK4 no simpléctico.
3. **Escala real:** Un laboratorio orbital planetario opera con 2–20 cuerpos típicamente, hasta ~100 en experimentos absurdos. Benchmark riguroso (ver sección C): ~0.04 ms/paso mediana con N=100, ~1.1 ms/paso con N=500 (Node.js v26, Float64Array, 7 runs × 500 pasos, warm-up 200).
4. **Depuración:** TypeScript en el hilo principal permite inspeccionar estado, reproducir escenarios y validar conservación sin fricción WASM/GPU.
5. **Arquitectura:** La separación `GravitySolver` / `Integrator` / `SimulationEngine` (patrón Particular) permite añadir Barnes-Hut, Worker o WebGPU en fases posteriores sin reescribir la aplicación.
6. **No optimización prematura:** WebGPU y WASM aportan complejidad de depuración desproporcionada para el rango de cuerpos de la v1.

---

## A. Comparativa de repositorios

### A.1 Tycho — [github.com/jshor/tycho](https://github.com/jshor/tycho)

| Aspecto | Detalle |
|---------|---------|
| **Qué es** | Visualizador 3D del sistema solar en tiempo real con elementos orbitales keplerianos y efemérides NASA JPL. **No es N-body.** |
| **Stack** | TypeScript, React 19, Three.js / react-three-fiber, **Zustand** (no Redux), Vite, Vitest (62 tests, 90% cobertura) |
| **Física** | Posiciones analíticas: anomalía media → excéntrica → verdadera. `orbitalEnergyConservation()` vía vis-viva. Sin integración de fuerzas. |
| **Tiempo** | `Clock` con `speed = 10^exponent`. Tiempo Unix simulado en store. |
| **Cámara** | Pivot con `Gyroscope`, `OrbitControls` extendido, tween al cambiar objetivo, near-plane dinámico. |
| **Selección** | `targetId`, `highlightedId` en Zustand; click en label → foco de cámara. |
| **Escala** | `UNIT_SCALE = 1e6` km → unidades de escena. Radio visual ≠ físico. |
| **Tests** | Vitest + mocks R3F extensivos. |

**Aprendizajes aplicables a nuestro lab:**

| De Tycho | Para nuestro proyecto |
|----------|----------------------|
| Zustand para estado UI/sim | ✅ Adoptar |
| Separación módulos (lógica) / componentes (presentación) | ✅ Adoptar |
| `Clock` con escala temporal independiente | ✅ Adaptar (ver sección G) |
| Servicios de cámara desacoplados del sim | ✅ Adaptar a 2D |
| Infraestructura de tests con alta cobertura | ✅ Adoptar |
| Kepler + efemérides NASA | ❌ No aplica (somos N-body dinámico) |
| Shaders 3D, atmósferas, anillos | ❌ Fuera de alcance v1 |

**Decisión propia:** Tycho demuestra que la escala de renderizado debe ser independiente de la física, pero su solver kepleriano no es transferible. Tomamos patrones de UX, estado y testing.

---

### A.2 GalaxySim — [github.com/haxybaxy/webgpu-galaxy](https://github.com/haxybaxy/webgpu-galaxy)

| Aspecto | Detalle |
|---------|---------|
| **Qué es** | Simulador de galaxias N-body GPU-first (C++/WASM, WebGPU). Escala: 10³–10⁵ partículas. |
| **Integrador** | **Leapfrog KDK** (Kick-Drift-Kick): `v += a·dt/2` → `x += v·dt` → fuerzas → `v += a·dt/2`. |
| **Fuerzas** | Direct O(N²) shader + Barnes-Hut LBVH (8+ passes GPU). |
| **Softening** | Plummer: `(r² + ε²)^(-3/2)`. Default ε=0.5 en unidades código (G=1). |
| **Diagnósticos** | KE, PE (O(N²) CPU, skip si N>5000), drift relativo de energía, momento lineal, extras two-body (periodo, excentricidad). |
| **Validación** | Two-body N=2, drift ~10⁻⁷/paso con dt=0.001; sweeps dt/softening/θ; CSV headless export. |
| **Datos** | AoS empaquetado: `vec4(x,y,z,mass)`, buffers separados pos/vel/acc. |

**Útil para simulador planetario:**

| De GalaxySim | Para nuestro proyecto |
|--------------|----------------------|
| Leapfrog KDK como integrador principal | ✅ **Adoptar** |
| Softening Plummer como herramienta avanzada opcional | ⚠️ Referencia futura; v1 usa ε=0 (ver sección C) |
| Diagnósticos de conservación con drift relativo | ✅ Adoptar |
| Two-body como test de regresión primario | ✅ Adoptar |
| Separación kick/drift en el integrador | ✅ Adoptar |
| Export CSV headless para tests | ✅ Adoptar |

**Específico de galaxias (no adoptar en v1):**

- LBVH con Morton codes, radix sort, rebuild por paso
- G=1 unidades adimensionales
- Escenarios Plummer, disco rotante
- θ (opening criterion) de Barnes-Hut
- Mass-adaptive opening radius
- GPU-only para evitar readback (innecesario con N<100)

**Decisión propia:** GalaxySim es la referencia numérica principal para integrador y validación. Adaptamos a 2D, SI, y CPU TypeScript.

---

### A.3 Particular — [github.com/Canleskis/particular](https://github.com/Canleskis/particular)

| Aspecto | Detalle |
|---------|---------|
| **Qué es** | Librería Rust de interacciones gravitatorias N-body. **No integra** posiciones/velocidades. |
| **Arquitectura clave** | `Interaction<Storage>` define *qué* calcular; `SequentialCompute` / `ParallelCompute` / `GpuCompute` define *cómo*. |
| **Algoritmos** | BruteForce O(N²), BarnesHut O(N log N), GPU BruteForce (wgpu). |
| **Separación** | Aplicación hace: `accelerations = solver.compute(state)` → `integrator.step(state, accelerations)`. |
| **G** | Absorbido en `μ = G·m` vía trait `Mass::mu()`. |
| **Softening** | Tipos separados: `Acceleration` vs `AccelerationSoftened { ε }`. |
| **Storage** | `Between<affected, affecting>`, `Ordered`, `Reordered`, `RootedOrthtree`. |

**Aprendizajes aplicables:**

| De Particular | Para nuestro proyecto |
|---------------|----------------------|
| Separación estricta interacción ↔ integración | ✅ **Patrón arquitectónico central** |
| Interface `GravitySolver` intercambiable | ✅ Adoptar |
| Softening como propiedad del solver, no global | ✅ Adoptar |
| μ = G·m para evitar multiplicaciones redundantes | ✅ Adoptar en hot path |
| Algoritmos intercambiables sin que la app conozca implementación | ✅ Adoptar |

**Decisión propia:** Particular confirma que la arquitectura intercambiable funciona. En TypeScript usaremos una interface `GravitySolver` con implementaciones `DirectNBodySolver` (v1), `BarnesHutSolver` (fase 2), `GPUDirectSolver` (fase 3).

---

### A.4 Solar Sim — [github.com/ben9583/solar-sim](https://github.com/ben9583/solar-sim)

| Aspecto | Detalle |
|---------|---------|
| **Qué es** | Simulador 2D planetario: Canvas2D + Rust/WASM. Demo educativa de puntos de Lagrange. |
| **Motivación WASM** | JS original "quite bad even on i9 MacBook Pro, lots of stuttering on Firefox". |
| **Worker** | **No usa Worker.** WASM en hilo principal. |
| **Integrador** | **Euler explícito** con sub-pasos (`TIME_STEP` × `NUM_SIMS_PER_STEP`). |
| **Fuerzas** | O(N²) directo, G=6.674e-11, sin softening explícito. |
| **Escala** | ~7 cuerpos default (Sol, Tierra, L1–L5). Usuario puede añadir más. |
| **Comunicación** | wasm-bindgen: `add_body`, `step_time`, `get_positions`, `set_simulation_accuracy`. |
| **Estado dual** | JS mantiene metadatos visuales; WASM solo física. |

**Aprendizajes:**

| De Solar Sim | Para nuestro proyecto |
|--------------|----------------------|
| Separación metadatos visuales / estado físico | ✅ Adoptar |
| Canvas2D para render 2D orbital | ✅ Adoptar |
| API `step()` + `getState()` limpia | ✅ Adoptar |
| WASM por rendimiento O(N²) | ⚠️ **No necesario en v1** (ver sección rendimiento) |
| Euler + sub-pasos | ❌ **Rechazar** — inestable para órbitas largas |

**Decisión propia:** Solar Sim valida el concepto de lab 2D y la separación sim/UI, pero su integrador Euler es un contraejemplo. No adoptamos WASM en v1; reservamos Worker+WASM para fase 2 si N>500 con escala temporal extrema.

---

### A.5 GraphGPU — [github.com/drkameleon/GraphGPU](https://github.com/drkameleon/GraphGPU)

| Aspecto | Detalle |
|---------|---------|
| **Qué es** | Librería TypeScript de visualización de grafos con física force-directed WebGPU. |
| **Arquitectura** | Facade `GraphGPU` → Graph (SoA) + Renderer + Camera + Controls + ForceLayout/GPUForceLayout. |
| **SoA** | `positions: Float32Array [x0,y0,...]`, `velocities`, `sizes`, `colors` separados. |
| **GPU compute** | 5-pass pipeline: reset forces → repulsion O(N²) → attraction → gravity → integrate. Workgroup 64. |
| **Barnes-Hut** | Solo CPU (`QuadTree.ts`, θ=0.3). GPU siempre O(N²). |
| **Loops** | **Dos rAF separados:** render loop continuo + layout loop bajo demanda. |
| **Interacción** | Pan, zoom-to-cursor, hit-test brute-force, selección multi con Shift. |
| **Dirty tracking** | Upload parcial a GPU solo de nodos/aristas modificados. |

**Aprendizajes:**

| De GraphGPU | Para nuestro proyecto |
|-------------|----------------------|
| SoA con TypedArrays para estado físico | ✅ Adoptar |
| Cámara 2D con `screenToWorld` / `worldToScreen` | ✅ Adoptar |
| Loops render ≠ sim desacoplados | ✅ Adoptar |
| Patrón compute shader multi-pass | 📋 Referencia futura WebGPU |
| Barnes-Hut CPU con QuadTree | 📋 Referencia futura fase 2 |
| Física de resortes (vis.js) | ❌ No aplica |

**Decisión propia:** GraphGPU es referencia de arquitectura WebGPU y layout SoA, no de física orbital. Adoptamos SoA, cámara 2D e interacción; posponemos GPU.

---

## B. Decisión tecnológica

| Capa | Decisión v1 | Justificación |
|------|-------------|---------------|
| **Frontend** | React 19 + TypeScript + Vite | Ecosistema maduro, tipado, testing. Tycho demuestra viabilidad. |
| **Simulación** | TypeScript puro, módulo `src/sim/` sin dependencias React | Testeable en Node/Vitest. Desacoplado de UI. |
| **Render** | Canvas 2D (v1) con abstracción `Renderer` | Suficiente para círculos, trails, vectores debug. Pixi.js o WebGL2 en fase 2 si trails complejos. |
| **Estado UI** | Zustand | Ligero, selectores granulares. Tycho migró de Redux a Zustand. |
| **Estado sim** | `SimulationDocument` inmutable-ish + `PhysicsState` SoA mutable interno | Separación clara editable vs runtime. |
| **Worker** | **No en v1** | Con N≤100 y presupuesto de subpasos, el hilo principal no se bloquea. Fase 2: `SimulationWorker` con mismo protocolo de mensajes. |
| **WASM** | **No en v1** | Benchmark riguroso: 100 cuerpos ≈ 0.04 ms/paso (mediana). Solar Sim necesitaba WASM por Euler ineficiente + muchos sub-pasos, no por O(N²) intrínseco. Reservar para N>500 sostenido. |
| **WebGPU** | **No en v1** | Crossover útil ~5000+ cuerpos interactivos. Añade complejidad WGSL, readback, compatibilidad. |
| **Tests** | Vitest (unit) + escenarios físicos como integration tests | Patrón Tycho + GalaxySim headless export. |

---

## C. Decisión del solver gravitacional

### Comparativa explícita

| Solver | Complejidad | Precisión | Estabilidad | Impl. v1 | Debug | Cuándo usar |
|--------|-------------|-----------|-------------|----------|-------|-------------|
| **O(N²) directo** | O(N²) | Exacta (ε=0 en v1) | Depende del integrador | **Baja** | **Fácil** | **N ≤ ~200, v1 default** |
| **Barnes-Hut** | O(N log N) | Aproximada (θ) | Idem integrador; error de árbol | Media-alta | Media | N > ~500–1000, o muchos pasos/frame |
| **WebGPU compute** | O(N²) GPU / O(N log N) GPU | Igual que CPU equivalente | Idem | Alta | Difícil | N > ~2000–5000 interactivo |
| **WASM O(N²)** | O(N²) | Igual que TS | Idem | Media | Media | Mismo rango que TS, ~2–5× más rápido |
| **WASM + Worker** | O(N²) | Igual | Idem | Media-alta | Media | Escala temporal extrema sin bloquear UI |
| **BH + WebGPU** | O(N log N) GPU | Aproximada | Idem | Muy alta | Muy difícil | N > 10⁴ (fuera de alcance) |

### Benchmark propio (Node.js, Float64Array, Leapfrog KDK, G SI)

> **Nota metodológica:** Una primera medición informal mostró N=10 más lento que N=100 (artefacto de JIT sin warm-up). Los números siguientes provienen de un benchmark repetido con metodología explícita. **No usar cifras de una sola pasada para decisiones arquitectónicas.**

**Metodología:**

| Parámetro | Valor |
|-----------|-------|
| Warm-up | 200 pasos (no medidos) |
| Medición | 500 pasos individuales por run |
| Runs | 7 (reportar mediana de medianas) |
| Percentiles | p50 (mediana), p95 por run |
| Inicialización | Medida por separado (bootstrap de fuerzas) |
| Entorno | Node.js v26, macOS, sin paralelismo |
| Validación O(N²) | Coste por par estable ~4.3 ns (N≥50) |

**Resultados (mediana de medianas, ms/paso):**

| N | Pares | Mediana | p95 | Init (bootstrap) | Pasos/8 ms | Pasos/16 ms |
|---|-------|---------|-----|------------------|------------|-------------|
| 10 | 90 | 0.0008 | 0.0008 | 0.43 ms | 10,666 | 21,333 |
| 50 | 2,450 | 0.0107 | 0.0114 | 0.02 ms | 747 | 1,494 |
| 100 | 9,900 | **0.0433** | 0.0539 | 0.07 ms | **184** | 369 |
| 200 | 39,800 | 0.1719 | 0.1984 | 0.12 ms | 46 | 93 |
| 500 | 249,500 | **1.0686** | 1.5939 | 0.64 ms | **7** | 14 |
| 1,000 | 999,000 | 4.2365 | 4.9682 | 2.21 ms | 1 | 3 |

**Análisis de escalado (vs N=10):**

| N | Ratio pares | Ratio tiempo | Coherencia O(N²) |
|---|-------------|--------------|------------------|
| 100 | 110× | 54× | ✅ (~2× overhead fijo JIT ya amortizado) |
| 500 | 2,772× | 1,336× | ✅ |
| 1,000 | 11,100× | 5,296× | ✅ |

**Advertencias:**

- Estos números son **Node.js**, no browser. El navegador puede ser 1.5–3× más lento por GC y falta de optimización JIT equivalente. Tratar como **cota optimista**.
- Repetir en CI con script versionado (`scripts/benchmark-nbody.mjs`) antes de fase 2.
- No extrapolar a 10,000 cuerpos: fuera del alcance del laboratorio.

**Conclusión (conservadora):**

- **10–50 cuerpos:** O(N²) sobrado. Miles de pasos/segundo incluso en browser.
- **~100 cuerpos:** ~184 pasos en 8 ms (Node). En browser ~60–120 pasos/frame → suficiente para la mayoría de presets temporales.
- **~200 cuerpos:** Límite cómodo en hilo principal a 60 fps.
- **~500 cuerpos:** ~7 pasos/8 ms (Node). Barnes-Hut o Worker empiezan a compensar si se necesitan cientos de subpasos/frame.
- **~2000+ cuerpos:** WebGPU directo empieza a tener sentido.
- **10,000 cuerpos:** Fuera del alcance de un laboratorio orbital; no es objetivo.

### Decisión v1

**`DirectNBodySolver`** — suma directa de fuerzas Newtonianas:

```
a_i = Σ_{j≠i} G · m_j · (r_j - r_i) / |r_j - r_i|³     (ε = 0, v1 default)
```

Con softening Plummer opcional (solo modo avanzado):

```
a_i = Σ_{j≠i} G · m_j · (r_j - r_i) / (|r_j - r_i|² + ε²)^(3/2)
```

**Decisión v1 sobre softening:**

| Aspecto | Decisión |
|---------|----------|
| Default | **ε = 0** (gravedad Newtoniana pura) |
| Validación | Siempre ε = 0 |
| UI v1 | Softening **desactivado**; no visible en panel principal |
| Modo avanzado (fase 2) | Toggle explícito con advertencia: *"Altera la física real del sistema"* |
| Singularidades r→0 | Resueltas por **colisión merge**, no por softening |
| Tierra-Luna, etc. | ε = 0; la precisión viene del `physicsDt` del preset, no de artificializar G |

Plummer softening es útil en simulaciones de muchas partículas (GalaxySim) donde las partículas no representan cuerpos físicos reales. En un laboratorio planetario, un ε arbitrario distorsionaría órbitas que queremos estudiar con precisión.

- Cuerpos `fixed` contribuyen a fuerza pero no reciben aceleración.
- Pares simétricos: calcular fuerza de j sobre i, aplicar Newton III.

---

## D. Decisión del integrador

### Comparativa para dinámica orbital

| Integrador | Tipo | Conserva energía (sist. hamiltoniano) | Conserva L (momento angular) | Reversible | Coste/paso | Verdicto |
|------------|------|---------------------------------------|-------------------------------|------------|------------|----------|
| **Euler explícito** | Orden 1 | ❌ Crece sin límite | ❌ | ❌ | 1× eval fuerza | **Rechazar** (Solar Sim) |
| **Euler semi-implícito (Symplectic Euler)** | Orden 1 simpléctico | ✅ Drift O(Δt) | ✅ Drift O(Δt) | ✅ | 1× | Aceptable, inferior a KDK |
| **Velocity Verlet** | Orden 2 simpléctico | ✅ Drift O(Δt²) | ✅ Drift O(Δt²) | ✅ | 1× | Equivalente a Leapfrog |
| **Leapfrog KDK** | Orden 2 simpléctico | ✅ Drift O(Δt²) | ✅ Drift O(Δt²) | ✅ | 1× | **Elegir** (GalaxySim) |
| **RK4** | Orden 4 | ❌ No simpléctico | ❌ | ❌ | 4× eval fuerza | Rechazar para órbitas largas |
| **Adaptive RK45** | Variable | ❌ | ❌ | ❌ | Variable | Fase 3 si necesario |

### Decisión v1: **Leapfrog KDK** (equivalente a Velocity Verlet para dt fijo)

```
Paso con dt = physicsDt:

1. v_i ← v_i + a_i · (dt/2)          // half-kick
2. x_i ← x_i + v_i · dt               // drift
3. a ← GravitySolver.compute(x)       // fuerzas con posiciones nuevas
4. v_i ← v_i + a_i · (dt/2)          // half-kick
```

**Bootstrap:** Al iniciar o tras editar estado, calcular fuerzas iniciales antes del primer kick.

**Propiedades:**
- Reversible (importante para determinismo y step-backward futuro).
- 1 evaluación de fuerzas por paso (mismo coste que Verlet estándar).
- GalaxySim demuestra drift de energía ~10⁻⁷/paso en two-body con dt adecuado.

**No usar Euler explícito** bajo ninguna circunstancia como integrador principal.

---

## E. Arquitectura propuesta

### E.1 Diagrama de capas

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer (React + Zustand)                                 │
│  Toolbar, BodyEditor, TimeControls, MetricsPanel, Scenarios │
└──────────────────────────┬──────────────────────────────────┘
                           │ commands / subscriptions
┌──────────────────────────▼──────────────────────────────────┐
│  SimulationDocument                                         │
│  Cuerpos, escenario, config (physicsDt, ε, collisionMode)   │
│  Serializable, undo/redo, export/import JSON                │
└──────────────────────────┬──────────────────────────────────┘
                           │ build / sync
┌──────────────────────────▼──────────────────────────────────┐
│  SimulationEngine                                           │
│  Loop: substep budget, time scale, pause, step, reset       │
│  Emite Snapshot + Diagnostics por frame                     │
└───────┬──────────────────────────────┬──────────────────────┘
        │                              │
┌───────▼──────────┐          ┌────────▼─────────┐
│  GravitySolver   │          │  Integrator       │
│  (intercambiable)│          │  LeapfrogKDK      │
│  ├ DirectNBody   │          └────────┬─────────┘
│  ├ BarnesHut (*) │                   │
│  └ GPUDirect (*) │          ┌────────▼─────────┐
└───────┬──────────┘          │  CollisionPolicy│
        │                     │  merge | ignore   │
        │                     └────────┬─────────┘
        │                              │
┌───────▼──────────────────────────────▼──────────────────────┐
│  PhysicsState (SoA, Float64Array)                           │
│  pos[2N], vel[2N], acc[2N], mass[N], flags[N]             │
└──────────────────────────┬──────────────────────────────────┘
                           │ Snapshot (readonly, por frame)
┌──────────────────────────▼──────────────────────────────────┐
│  Renderer (Canvas2D)                                        │
│  Camera2D, BodySprites, Trails, DebugOverlay, Selection     │
└─────────────────────────────────────────────────────────────┘

(*) Implementaciones futuras; misma interface GravitySolver.
```

### E.2 Árbol de módulos

```
src/
├── sim/                          # Sin dependencias React — testeable en Node
│   ├── constants.ts              # G, defaults
│   ├── types/
│   │   ├── body.ts               # CelestialBody, BodyVisual, BodyState
│   │   ├── config.ts             # SimConfig, TimeScale, CollisionMode
│   │   ├── snapshot.ts           # SimSnapshot (readonly frame state)
│   │   └── diagnostics.ts        # ConservationMetrics
│   ├── document/
│   │   └── simulation-document.ts
│   ├── state/
│   │   └── physics-state.ts      # SoA mutable
│   ├── solver/
│   │   ├── gravity-solver.ts     # interface
│   │   ├── direct-nbody.ts       # v1
│   │   ├── barnes-hut.ts         # stub fase 2
│   │   └── gpu-direct.ts         # stub fase 3
│   ├── integrator/
│   │   ├── integrator.ts         # interface
│   │   └── leapfrog-kdk.ts
│   ├── collision/
│   │   ├── collision-policy.ts
│   │   ├── merge.ts
│   │   └── ignore.ts
│   ├── engine/
│   │   └── simulation-engine.ts
│   ├── diagnostics/
│   │   └── conservation.ts
│   ├── scenarios/
│   │   ├── sun-earth-circular.ts
│   │   ├── sun-earth-elliptic.ts
│   │   ├── earth-moon.ts
│   │   ├── binary.ts
│   │   ├── three-body.ts
│   │   ├── escape.ts
│   │   ├── radial-fall.ts
│   │   └── collision.ts
│   └── validation/
│       └── scenario-tests.ts     # Vitest integration
├── render/
│   ├── camera2d.ts
│   ├── canvas-renderer.ts
│   ├── trails.ts
│   └── debug-overlay.ts
├── store/
│   └── simulation-store.ts       # Zustand: UI + bridge to engine
├── components/                   # React presentational
└── app/
    └── App.tsx
```

### E.3 Patrón de solver intercambiable (inspirado en Particular)

```typescript
// src/sim/solver/gravity-solver.ts

interface GravitySolver {
  readonly name: string;
  computeAccelerations(state: PhysicsState): void;
  // Escribe en state.accelerations; no modifica pos/vel
}

// src/sim/integrator/integrator.ts

interface Integrator {
  step(state: PhysicsState, solver: GravitySolver, dt: number): void;
}

// src/sim/engine/simulation-engine.ts

class SimulationEngine {
  constructor(
    private solver: GravitySolver,
    private integrator: Integrator,
    private collision: CollisionPolicy,
    private config: SimConfig,
  ) {}

  step(): SimSnapshot { /* orquesta un physicsDt */ }
  runSubsteps(budgetMs: number): SimSnapshot { /* N pasos hasta budget */ }
}
```

La aplicación instancia `DirectNBodySolver` en v1. Cambiar a `BarnesHutSolver` es un one-liner en la factory, sin tocar UI ni renderer.

---

## F. Modelo de datos

### F.1 CelestialBody (documento, editable)

```typescript
interface CelestialBody {
  id: string;
  name: string;
  mass: number;              // kg
  radius: number;            // m (físico; colisiones)
  position: Vec2;            // m
  velocity: Vec2;            // m/s
  state: 'dynamic' | 'fixed';
  visual: BodyVisual;
}

interface BodyVisual {
  color: string;
  displayRadius: number;   // px o unidades de pantalla — NO metros
  showTrail: boolean;
  trailLength: number;       // puntos o segundos simulados
}

interface Vec2 {
  x: number;
  y: number;
}
```

### F.2 SimConfig

```typescript
interface SimConfig {
  physicsDt: number;           // s — fijo, NO escala con time scale
  softening: number;           // m — ε en Plummer; default 0; solo modo avanzado
  gravityConstant: number;     // 6.67430e-11
  collisionMode: 'merge' | 'ignore';
  mergeThreshold: number;    // m — distancia para merge (≈ r1+r2)
  solver: 'direct';            // extensible: 'barnes-hut' | 'gpu'
  integrator: 'leapfrog-kdk';
  maxSubstepsPerFrame: number; // safety cap, e.g. 10_000
  frameBudgetMs: number;       // e.g. 8
}
```

### F.3 PhysicsState (runtime, SoA)

```typescript
interface PhysicsState {
  count: number;
  ids: string[];
  mass: Float64Array;          // kg
  position: Float64Array;      // [x0,y0, x1,y1, ...] metros
  velocity: Float64Array;      // [vx0,vy0, ...] m/s
  acceleration: Float64Array;  // m/s² — escrito por solver
  flags: Uint8Array;           // bit 0: fixed, bit 1: active
}
```

**Decisión:** Float64Array para posición/velocidad/aceleración. En SI con distancias ~10¹¹ m y velocidades ~10⁴ m/s, float32 pierde precisión en sumas repetidas.

### F.4 SimSnapshot (readonly, por frame, para render)

```typescript
interface SimSnapshot {
  time: number;                // s simulados
  step: number;
  bodies: ReadonlyArray<{
    id: string;
    position: Vec2;
    velocity: Vec2;
    mass: number;
    visual: BodyVisual;
    state: 'dynamic' | 'fixed';
  }>;
  diagnostics: ConservationMetrics;
  timeScale: TimeScaleStatus;
}

interface ConservationMetrics {
  kineticEnergy: number;       // J
  potentialEnergy: number;     // J
  totalEnergy: number;         // J
  linearMomentum: Vec2;        // kg·m/s
  angularMomentum: number;     // kg·m²/s (escalar en 2D)
  initial: ConservationMetrics;
  relativeEnergyError: number; // |E - E0| / |E0|
  relativeMomentumError: number;
  relativeAngularMomentumError: number;
}

interface TimeScaleStatus {
  requestedTimeScale: number;    // lo que el usuario seleccionó (e.g. 31557600 = 1 año/s)
  effectiveTimeScale: number;    // lo que realmente se alcanzó el último frame
  physicsDt: number;             // paso físico efectivo del documento (fijo en la corrida)
  substepsRequested: number;     // ceil(targetAdvance / physicsDt)
  substepsExecuted: number;      // pasos realmente ejecutados (≤ budget)
  isCapped: boolean;             // true si effective < requested
  capReason: 'budget' | 'maxSubsteps' | null;
}
```

`TimeScaleStatus` se incluye en `SimSnapshot` y se muestra **siempre visible** en la UI de controles temporales (ver G.7).

### F.5 Separación física / visual / cámara

| Concepto | Unidad | Dónde vive |
|----------|--------|------------|
| Posición física | metros (SI) | `PhysicsState.position` |
| Radio físico | metros | `CelestialBody.radius` (colisiones) |
| Radio visual | px o world-units de cámara | `BodyVisual.displayRadius` |
| Transformación | metros → pantalla | `Camera2D` |
| Zoom | factor multiplicativo | `Camera2D.zoom` |

El renderer **nunca** convierte física a píxeles dentro del solver. Solo la cámara transforma.

---

## G. Estrategia temporal

### G.1 Variables separadas

| Variable | Significado | Ejemplo |
|----------|-------------|---------|
| `physicsDt` | Paso de integración fijo (s), **definido por preset de escenario** | Ver tabla G.5 |
| `simulationTimeScale` | Factor sim-time / real-time | 86400 → 1 día sim / 1 s real |
| `simTime` | Tiempo simulado acumulado (s) | crece con cada substep |
| `frameBudgetMs` | Máximo ms de CPU para física por frame | 8 |

**Regla fundamental:** `simulationTimeScale` **nunca** modifica `physicsDt`.

### G.2 Cálculo de subpasos por frame

```
targetSimAdvance = simulationTimeScale × (1/60)   // sim-seconds per frame at 60fps
substepsNeeded = ceil(targetSimAdvance / physicsDt)
substepsActual = min(substepsNeeded, maxSubstepsPerFrame)
```

Si `substepsNeeded > maxSubstepsPerFrame` **o** el presupuesto de 8 ms se agota antes, la sim avanza menos de lo pedido. El motor calcula y expone `effectiveTimeScale` (ver G.7).

### G.3 Presupuesto adaptativo (anti-bloqueo)

```typescript
function runFrame(engine: SimulationEngine, budgetMs: number): TimeScaleStatus {
  const substepsNeeded = computeSubstepsNeeded(config);
  const start = performance.now();
  let stepsExecuted = 0;

  while (stepsExecuted < substepsNeeded && (performance.now() - start) < budgetMs) {
    engine.step();
    stepsExecuted++;
  }

  const simAdvance = stepsExecuted * config.physicsDt;
  const effectiveTimeScale = simAdvance * 60; // asumiendo 60 fps

  return {
    requestedTimeScale: config.simulationTimeScale,
    effectiveTimeScale,
    substepsRequested: substepsNeeded,
    substepsExecuted: stepsExecuted,
    isCapped: effectiveTimeScale < config.simulationTimeScale * 0.99,
    capReason: stepsExecuted < substepsNeeded ? 'budget' : null,
  };
}
```

Esto garantiza que escala temporal enorme no congela el navegador: avanza menos pasos por frame, reduciendo el time scale efectivo pero manteniendo estabilidad numérica. **El usuario debe ver la diferencia entre lo pedido y lo conseguido.**

### G.4 Presets de escala temporal (UI)

| Preset | simulationTimeScale | Significado |
|--------|---------------------|-------------|
| 1× | 1 | 1 s sim / 1 s real |
| 10× | 10 | | 
| 100× | 100 | |
| 1,000× | 1,000 | |
| 10,000× | 10,000 | |
| 1 día/s | 86,400 | |
| 1 mes/s | 2,592,000 | (~30 días) |
| 1 año/s | 31,557,600 | (~365.25 días) |
| 10 años/s | 315,576,000 | |
| 100 años/s | 3,155,760,000 | |
| 1.000 años/s | 31,557,600,000 | |

Los subpasos necesarios dependen del `physicsDt` del preset activo (no hay dt universal). Ejemplo con preset Sol-Tierra (`physicsDt = 3600 s`):

- 1 día/s → 24 subpasos/frame → trivial con N≤100
- 1 año/s → ~8760 subpasos/frame → requiere budget alto o Worker (fase 2); **effectiveTimeScale << requested**

### G.5 physicsDt: fijo por preset de escenario (no universal)

**Decisión v1:** No existe un `physicsDt` astronómico universal. Cada preset de escenario trae su propio `physicsDt`, elegido manualmente y **validado por tests** que demuestran precisión suficiente para ese sistema concreto.

La regla simplista `physicsDt ≤ T_orbit / 100` es útil como heurística inicial, pero **insuficiente** como criterio general. La estabilidad depende también de:

- excentricidad de la órbita más exigente;
- período del cuerpo más rápido (e.g. Luna, no Tierra);
- distancia mínima entre pares (encuentros, tres cuerpos);
- duración de simulación deseada;
- criterio de error de energía aceptable para ese preset.

| Preset | physicsDt | Pasos/orbita principal | Test de validación |
|--------|-----------|------------------------|-------------------|
| Sol-Tierra circular | 3600 s (1 h) | ~8760/año | \|ΔE/E₀\| < 10⁻⁴ en 1 órbita |
| Sol-Tierra elíptica | 1800 s (30 min) | ~17,520/año | \|ΔE/E₀\| < 10⁻⁴; e estable |
| Tierra-Luna | 300 s (5 min) | ~7800/período lunar | Período lunar ±5%; \|ΔE/E₀\| < 10⁻³ |
| Sistema binario | T_orbit / 1000 | ~1000 | \|ΔE/E₀\| < 10⁻⁴; CM quieto |
| Tres cuerpos (figura-8) | T_char / 2000 | ~2000 | Trayectoria periódica visual + L conservado |
| Caída radial / escape | 60 s (1 min) | variable | Trayectoria qualitativamente correcta |
| Sandbox vacío | 3600 s (default) | — | Usuario responsable; panel advierte |
| Cinturón de Kuiper (sin lunas) | 7200 s (2 h) | cuerpos lejanos | Sin NaN; throughput astronómico; si se añaden lunas → 120 s |
| Sistema solar con lunas | 120 s | lunas galileanas etc. | Estabilidad de lunas; \|ΔE/E₀\| acotado |

**Proceso de adopción de un nuevo preset:**

1. Elegir `physicsDt` candidato (heurística: T_fastest/500 a T_fastest/2000).
2. Ejecutar test de conservación durante N períodos del cuerpo más exigente.
3. Si \|ΔE/E₀\| > umbral del preset → reducir dt y repetir.
4. Documentar dt final en el preset; **no derivarlo automáticamente en runtime**.

Al editar cuerpos (añadir/quitar lunas), `resolvePhysicsDt` puede **apretar** el dt
(p.ej. Kuiper 7200 → 120 si aparece un satélite cercano); nunca lo sube en silencio
al quitar lunas. El nuevo valor queda fijado en `SimConfig` / `TimeScaleStatus.physicsDt`
tras reiniciar el documento.

El usuario **no elige physicsDt en la UI principal** de v1. Solo al cargar un preset o en panel avanzado explícito. Cambiar dt sin re-validar es responsabilidad del usuario con advertencia visible.

### G.6 Modos de control temporal

| Modo | Comportamiento |
|------|----------------|
| Play | runSubsteps con budget |
| Pause | congela simTime |
| Step forward | exactamente 1 × physicsDt |
| Step backward | replay desde snapshot guardado (fase 2) o reinicio (v1) |

### G.7 UI de escala temporal: requested vs effective (obligatorio)

Cuando el presupuesto adaptativo limita los subpasos, el usuario **debe** ver claramente que no está obteniendo la escala pedida. Esto no es un detalle menor: seleccionar "1 año/s" y obtener 0.17 años/s invalida la experiencia si no se comunica.

**Componente `TimeScaleIndicator` (siempre visible junto a controles de play):**

```
┌─────────────────────────────────────────────────────┐
│  Objetivo: 1.000 años/s                             │
│  Real: 12.40 años/s          ⚠ LIMITADO (CPU)       │
│  physicsDt: 7200s · subpasos: 42 / N por frame      │
└─────────────────────────────────────────────────────┘
```

`physicsDt` queda expuesto en `TimeScaleStatus` para que el usuario vea el paso
efectivo del preset. No se muta durante `runFrame`.

**Estados visuales:**

| Condición | Apariencia |
|-----------|------------|
| `effective ≈ requested` (±1%) | Verde/neutral: "1 día/s" |
| `effective < requested` | Ámbar/rojo: "1 año/s → 0.17 años/s ⚠" |
| Pausado | Gris: último effective congelado |

**Datos mostrados:**

- `requestedTimeScale` — label del preset seleccionado
- `effectiveTimeScale` — calculado cada frame: `substepsExecuted × physicsDt × fps`
- `substepsExecuted / substepsRequested` — barra de progreso o fracción
- Tooltip: "El simulador no alcanza la velocidad pedida. Reduce la escala, añade Worker (fase 2), o reduce el número de cuerpos."

**Ejemplo numérico (preset Sol-Tierra, physicsDt=3600, N=100, browser ~0.08 ms/paso):**

- Requested: 1 año/s → 8760 subpasos/frame necesarios
- Budget 8 ms → ~100 pasos ejecutados
- Effective: 100 × 3600 × 60 = 21.6M s sim/frame → **≈ 0.25 años/s** (no 1 año/s)
- UI muestra: **"1 año/s → 0.25 años/s ⚠"**

Sin este indicador, el laboratorio es engañoso en escalas extremas.

---

## H. Estrategia de validación

### H.1 Métricas internas (siempre activas)

Calculadas en CPU (Float64) cada paso o cada N pasos:

```
K = Σ ½ m_i |v_i|²
U = -Σ_{i<j} G m_i m_j / r_ij        (siempre sin softening; ε=0 en v1)
E = K + U
P = Σ m_i v_i
L = Σ m_i (r_i × p_i)_z             (componente z en 2D)
```

Mostrar en panel: valor actual, valor inicial (t=0), error relativo.

**No ocultar errores** con damping, clamps de velocidad, o renormalización de energía.

### H.2 Escenarios de validación

| # | Escenario | Cuerpos | Condiciones iniciales | Criterio de éxito |
|---|-----------|---------|----------------------|-------------------|
| 1 | Órbita circular | Sol + Tierra | M_sun=1.989e30, M_earth=5.972e24, r=1.496e11 m, v=√(GM/r) tangencial | Drift \|ΔE/E0\| < 10⁻⁴ por órbita; \|L\| conservado |
| 2 | Órbita elíptica | Sol + Tierra | v = 0.9 × v_circular | Excentricidad estable; perihelio/aphelio constantes |
| 3 | Tierra + Luna | Sol + Tierra + Luna | Posiciones/velocidades reales SI | Período lunar ~27.3 días ±5%; drift E < 10⁻³/orbita lunar |
| 4 | Sistema binario | 2 estrellas iguales | Separación d, v=√(Gm/4d) tangencial | Centro de masa quieto; \|P\| ≈ 0 |
| 5 | Tres cuerpos | Configuración de Lagrange equilateral o figura-8 | Condiciones analíticas conocidas | Trayectoria periódica (figura-8) o punto estable (L4/L5) |
| 6 | Escape | Sol + probe | v > v_escape = √(2GM/r) | r → ∞ monotónico; E_total > 0 |
| 7 | Caída radial | Sol + probe | v=0, r=1.496e11 | Caída radial; v → √(2GM/r) en impacto |
| 8 | Colisión merge | 2 cuerpos iguales | Head-on, merge mode | M_final = M1+M2; P conservado; posición CM correcta |
| 9 | Conservación global | N cuerpos aleatorios | N=5, posiciones aleatorias | \|ΔE/E0\| < 10⁻³ en 100 órbitas promedio; \|ΔP\|/|P0| < 10⁻⁶ |

### H.3 Implementación de tests

```typescript
// src/sim/validation/scenario-tests.ts
describe('Sun-Earth circular orbit', () => {
  it('conserves energy within 1e-4 per orbit', () => {
    const engine = createEngine(scenarios.sunEarthCircular());
    const T_orbit = 365.25 * 86400;
    const steps = Math.ceil(T_orbit / config.physicsDt);
    for (let i = 0; i < steps; i++) engine.step();
    expect(engine.diagnostics.relativeEnergyError).toBeLessThan(1e-4);
  });
});
```

Tests ejecutables en Node (sin DOM). Escenarios exportables como JSON fixtures.

### H.4 Softening y colisiones (v1)

| Mecanismo | Cuándo | Default v1 |
|-----------|--------|------------|
| **ε = 0** (Newton puro) | Toda simulación y validación | ✅ Activo |
| **Plummer softening** | Modo avanzado explícito | ❌ Desactivado |
| **Colisión merge** | Dos cuerpos con dist < r₁ + r₂ | ✅ Activo (modo merge) |
| **Colisión ignore** | Cuerpos atraviesan sin interacción | ✅ Opción alternativa |

Singularidades en r→0 se resuelven por **política de colisión**, no por softening artificial. Un merge conserva masa y momento lineal; no altera G para el resto del sistema.

Si en fase 2 se añade softening avanzado, los tests de validación siguen ejecutándose con ε=0. El softening nunca debe ser requisito para que pasen los tests analíticos.

---

## I. Roadmap

### Fase 0 — Fundamentos (semana 1)
- [ ] Proyecto Vite + React + TS + Vitest
- [ ] Módulo `sim/` con tipos, constantes, PhysicsState SoA
- [ ] `DirectNBodySolver` + `LeapfrogKDKIntegrator`
- [ ] `ConservationMetrics` calculator
- [ ] Tests: two-body circular + energy conservation
- [ ] Sin UI, solo tests pasando en Node

### Fase 1 — MVP interactivo (semanas 2–3)
- [ ] `SimulationEngine` con time scale + substep budget
- [ ] `SimulationDocument` + escenarios predefinidos
- [ ] Canvas2D renderer: cuerpos, cámara (pan/zoom), trails
- [ ] Zustand store + controles: play/pause/step, time scale presets
- [ ] Panel de métricas de conservación
- [ ] **`TimeScaleIndicator`**: requested vs effective time scale, siempre visible
- [ ] Editor básico: añadir/eliminar cuerpos, editar masa/pos/vel
- [ ] Selección de cuerpos + follow camera
- [ ] Colisión: merge + ignore
- [ ] Todos los escenarios de validación (sección H) como tests

### Fase 2 — Escala y robustez (semana 4+)
- [ ] `SimulationWorker`: física en Worker, mismo protocolo de mensajes
- [ ] `BarnesHutSolver` (CPU, quadtree 2D) — interface idéntica
- [ ] Undo/redo en SimulationDocument
- [ ] Export/import JSON de escenarios
- [ ] Modo debug: vectores velocidad/aceleración, grid, CM marker
- [ ] Step backward via snapshot ring buffer
- [ ] Presets de sistema solar completo

### Fase 3 — Optimización (solo si necesario)
- [ ] WASM port del solver directo (mismo interface via adapter)
- [ ] `GPUDirectSolver` (WebGPU compute, O(N²))
- [ ] Adaptive physicsDt basado en distancia mínima
- [ ] WebGL renderer si Canvas2D limita trails

### Fase 4 — Fuera de alcance v1
- Relatividad, atmósferas, clima, geología, galaxias, fluidos

---

## J. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| **Pérdida de precisión Float64 en distancias ~10¹¹ m** | Media | Alto | Float64Array; evitar restar números grandes similares; CM frame para sistemas binarios |
| **Drift de energía con physicsDt del preset inadecuado** | Media | Medio | Cada preset validado por tests; UI no expone dt sin advertencia |
| **Escala temporal extrema bloquea UI o engaña al usuario** | Alta | Alto | Frame budget + `TimeScaleIndicator` obligatorio (requested vs effective); Worker en fase 2 |
| **Singularidad r→0 sin colisión** | Media | Alto | Colisión merge/ignore; fixed bodies; no softening en v1 |
| **Softening altera órbitas reales** | Baja (v1) | Alto | ε=0 por defecto; softening solo modo avanzado fase 2 |
| **Determinismo entre browsers** | Baja | Medio | Float64, orden fijo de iteración pares, sin paralelismo en v1 |
| **Canvas2D performance con trails largos** | Media | Bajo | Limitar trail points; ring buffer; WebGL en fase 3 |
| **Confusión radio físico vs visual** | Alta | Bajo | UI clara; defaults: displayRadius fijo en px |
| **Usuario espera efemérides reales (estilo Tycho)** | Media | Bajo | Documentar que es N-body dinámico, no kepleriano |
| **Tres cuerpos caótico diverge numéricamente** | Alta | Esperado | Mostrar métricas; no enmascarar; es feature educativa |

---

## K. Render — representación de escalas astronómicas

### K.1 Principios

1. **Física en metros SI.** Siempre.
2. **Cámara** transforma world (metros) → screen (px).
3. **Radio visual** independiente del radio físico en modo relativo; en modo real, radio y distancia comparten `px/m = realSunDisplayPx / R_ref`. Relativo: el Sol es el disco de referencia (`relativeSunDisplayPx`); los demás se dibujan como `sunPx × (R / R☉)` con mínimo legible. Real: una escala para tamaños y órbitas; bajar el Sol muestra más sistema, subirlo da detalle (pan/zoom).
4. **Trails** en coordenadas world, transformadas por cámara al dibujar.
5. **Zoom logarítmico** recomendado para rangos Sol-Tierra (1.5e11 m) a Mercurio (5e10 m).

### K.2 Camera2D

```typescript
interface Camera2D {
  center: Vec2;       // world coords (metros)
  zoom: number;       // px per meter (log scale en UI)
  screenToWorld(sx, sy): Vec2;
  worldToScreen(wx, wy): Vec2;
  fitBodies(bodies: Vec2[], padding: number): void;
}
```

### K.3 Features de render v1

| Feature | Prioridad |
|---------|-----------|
| Círculos coloreados por cuerpo | P0 |
| Pan (drag canvas vacío) | P0 |
| Zoom (rueda, zoom-to-cursor) | P0 |
| Trails (ring buffer por cuerpo) | P0 |
| Selección (click) + highlight | P0 |
| Follow body (cámara sigue seleccionado) | P1 |
| Centrar sistema (fit all) | P1 |
| Debug: vectores v, a | P1 |
| Debug: centro de masa | P2 |
| Labels con nombre | P2 |

---

## L. Determinismo

1. **Float64** en todo el pipeline físico.
2. **Orden determinista** de pares (i, j) con i < j en force summation.
3. **Sin paralelismo** en v1 (no Worker, no SIMD, no GPU).
4. **Sin Math.random()** en el engine salvo escenarios con seed explícita.
5. **physicsDt fijo durante la integración** — elegido por preset/composición al cargar o editar el documento; no adaptive por paso en v1.
6. **Mismo solver + mismo estado inicial → mismo resultado** (dentro de ~10⁻¹⁵ relativo por operación Float64).

Test de regresión: snapshot de estado tras N pasos, comparar con fixture golden.

---

## M. Mapa de decisiones → fuentes

| Decisión | Fuente principal | Tipo |
|----------|-----------------|------|
| Leapfrog KDK integrador | GalaxySim | Basada en referencia |
| O(N²) directo solver v1 | GalaxySim + benchmark propio + Particular | Basada en referencia + propia |
| Separación solver/integrator | Particular | Basada en referencia |
| Interface GravitySolver intercambiable | Particular | Basada en referencia |
| Zustand para UI state | Tycho | Basada en referencia |
| Canvas2D render 2D | Solar Sim | Basada en referencia |
| SoA Float64Array | GraphGPU (SoA) + decisión propia (Float64) | Mixta |
| No WASM v1 | Benchmark propio + análisis Solar Sim | Propia |
| No WebGPU v1 | GalaxySim + GraphGPU análisis escala | Propia |
| No Euler | GalaxySim + rechazo Solar Sim approach | Basada en referencia |
| SI units internally | Requisito usuario | Propia |
| physicsDt ≠ timeScale | Requisito usuario + adaptación Tycho Clock | Mixta |
| physicsDt por preset validado | Decisión propia (revisión post-diseño) | Propia |
| TimeScaleIndicator (requested vs effective) | Decisión propia (revisión post-diseño) | Propia |
| Conservación metrics expuestas | GalaxySim | Basada en referencia |
| Softening Plummer | GalaxySim + Particular | Referencia futura; v1 usa ε=0 |
| μ = G·m en hot path | Particular | Basada en referencia |
| Frame budget anti-blocking | GraphGPU (separate loops) + decisión propia | Mixta |
| Collision merge | Requisito usuario | Propia |
| Escenarios de validación | GalaxySim (two-body) + mecánica orbital clásica | Mixta |

---

## N. Plan de implementación para el agente siguiente

### N.1 Orden de implementación

1. **`src/sim/constants.ts`** — G, defaults
2. **`src/sim/types/*`** — interfaces completas (sección F)
3. **`src/sim/state/physics-state.ts`** — SoA con métodos `fromDocument()`, `toSnapshot()`
4. **`src/sim/solver/gravity-solver.ts`** + **`direct-nbody.ts`**
5. **`src/sim/integrator/leapfrog-kdk.ts`**
6. **`src/sim/diagnostics/conservation.ts`**
7. **`src/sim/scenarios/sun-earth-circular.ts`** + test Vitest
8. **`src/sim/engine/simulation-engine.ts`**
9. **`src/sim/collision/merge.ts`** + **`ignore.ts`**
10. **`src/render/camera2d.ts`** + **`canvas-renderer.ts`**
11. **`src/store/simulation-store.ts`**
12. **React UI** — mínimo funcional
13. **Resto de escenarios** + tests
14. **Trails, selection, debug overlay**

### N.2 Criterio de "v1 done"

- [ ] 9 escenarios de validación pasan
- [ ] UI permite crear/editar cuerpos, play/pause/step, 11 presets de time scale (hasta 1.000 años/s)
- [ ] Métricas de conservación visibles con error relativo
- [ ] **`TimeScaleIndicator` funcional**: si selecciono 1 año/s y el sim no alcanza, lo veo claramente
- [ ] 100 cuerpos a 60 fps con preset razonable (expectativa conservadora: browser ~2× más lento que benchmark Node)
- [ ] Solver intercambiable demostrado con stub `BarnesHutSolver` que lanza "not implemented"
- [ ] Sin WASM, WebGPU, Worker

### N.3 Constantes físicas de referencia

```
G = 6.67430e-11 m³ kg⁻¹ s⁻²
M_sun = 1.989e30 kg
M_earth = 5.972e24 kg
M_moon = 7.342e22 kg
AU = 1.495978707e11 m
Earth orbital velocity (circular at 1 AU) = 29,785.9 m/s
Earth orbital period = 365.256 × 86400 s
```

---

## O. Motor orbital experimental (añadido post-v1)

El motor N-body (`DirectNBodySolver` + Leapfrog KDK) **sigue siendo la referencia**.
Se añade un segundo motor, `OrbitalEngine`, seleccionable explícitamente:

| Campo | Valor |
|-------|--------|
| `SimConfig.engineKind` | `'nbody'` (default) \| `'orbital'` |
| Selección | UI «Motor de simulación». Nunca automática |
| Física | Elipses 2D de dos cuerpos (incl. circulares) respecto a un primario dominante |
| μ | `G M` si el primario es `fixed` (catálogo); `G(M+m)` + baricentro si hay exactamente un satélite dinámico |
| Kepler | `M(t)=M₀+nΔt`; `E−e sin E = M` Newton–Halley, `\|ΔE\|<1e-14` rad, ≤30 iteraciones |
| Tiempo | Estado en el instante pedido; sin subpasos Leapfrog. `effectiveTimeScale ≈ requestedTimeScale` si es compatible |
| Colisiones | No se aplican (no inventar merge N-body) |

**Compatible:** un primario ≥ 20× la siguiente masa; resto en elipses ligadas `e<1`; sin lunas jerárquicas (esfera de Hill).  
**Incompatible (no se avanza):** masas comparables, lunas, hipérbolas/parábolas, caída radial, un solo cuerpo.  
**Fuera de alcance:** perturbaciones planetarias, JPL, híbridos, parabólicas/hiperbólicas, WebGPU/WASM/Workers/Barnes–Hut.

Validación: `src/sim/validation/orbital-engine.test.ts`. Benchmark comparativo: `npm run benchmark`.

---

*Fin del documento de diseño v1.*
