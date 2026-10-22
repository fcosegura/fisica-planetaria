# AGENTS.md

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> Este proyecto está conectado a [Lovable](https://lovable.dev). Evita
> reescribir la historia de Git publicada: no hagas force push ni rebases,
> amend o squash sobre commits que ya se hayan enviado, porque Lovable podría
> perder el historial del proyecto.
>
> Los commits enviados a la rama conectada se sincronizan con Lovable y
> aparecen en el editor; mantén la rama en un estado funcional.
<!-- LOVABLE:END -->

## Propósito del proyecto

`fisica-planetaria` es un laboratorio orbital 2D para navegador. La v1 debe
priorizar corrección física, reproducibilidad y una interfaz clara sobre la
optimización prematura.

Antes de cambiar arquitectura o alcance, consultar
[`docs/DESIGN-v1.md`](docs/DESIGN-v1.md), que contiene las decisiones técnicas
y las validaciones esperadas.

## Protocolo obligatorio para agentes

Estas reglas aplican a cualquier agente que trabaje en el repositorio:

1. Leer `AGENTS.md` completo antes de explorar el código, buscar archivos o
   proponer cambios. Tratarlo como el índice operativo del proyecto.
2. Usar primero la información de este archivo para decidir qué carpetas,
   comandos y tests son relevantes. No repetir exploración de arquitectura,
   convenciones o comandos ya documentados aquí salvo que haya evidencia de
   que el documento está desactualizado.
3. Antes de editar, identificar el alcance del cambio y consultar únicamente
   los archivos directamente relacionados, además de las referencias que este
   documento indique. Ampliar la exploración solo si los resultados lo exigen.
4. Antes de finalizar, comprobar si el cambio altera comandos, arquitectura,
   contratos, convenciones, alcance, validaciones, estructura de carpetas o
   cualquier otra instrucción de este archivo.
5. Si altera alguno de esos elementos, actualizar `AGENTS.md` en la misma tarea
   y validar que sus instrucciones describen el estado nuevo del proyecto.
6. Incluso cuando el cambio sea local y no requiera modificar el contenido,
   dejar constancia mental de que `AGENTS.md` fue revisado; no crear cambios
   cosméticos solo para generar ruido.
7. No finalizar una tarea con cambios sin ejecutar las validaciones aplicables
   descritas en este archivo ni sin informar si `AGENTS.md` fue actualizado.

### Orden mínimo de trabajo

```text
Leer AGENTS.md → delimitar alcance → explorar solo lo necesario → editar
→ actualizar AGENTS.md si cambió alguna regla o hecho documentado
→ ejecutar validaciones → informar resultado
```

Si existe conflicto entre instrucciones antiguas encontradas durante la
exploración y este archivo, prevalece este `AGENTS.md` y debe corregirse la
documentación obsoleta cuando forme parte del alcance.

## Stack y comandos

- React 19 + TypeScript + Vite.
- Zustand para estado de interfaz.
- Canvas 2D para renderizado.
- Vitest para validación.

Comandos habituales:

```bash
npm install              # instalar dependencias
npm run dev              # servidor local
npm test                 # ejecutar todos los tests
npm run build            # comprobar tipos y build de producción
npm run benchmark        # módulos reales por fase + frames + N-body vs Orbital (Sedna/Kuiper)
npm run benchmark:worker # build + bundle Worker real en node:worker_threads
```

Una modificación se considera lista cuando `npm test` y `npm run build` pasan.
Si el cambio afecta al rendimiento del solver o de un motor, ejecutar también
`npm run benchmark` y describir el entorno y la diferencia observada.

## Arquitectura

```text
SimulationDocument → createSimulationRuntime(engineKind)
                   → SimulationEngine (N-body: DirectNBodySolver + Leapfrog KDK)
                   → OrbitalEngine (experimental Kepler 2D, two-body)
                   → PhysicsState/Snapshot → CanvasRenderer
```

En navegador, `src/runtime/worker-session.ts` envuelve esos motores en una sesión
asíncrona: `src/sim/worker/simulation.worker.ts` ejecuta la física y Canvas/React
permanecen en el hilo principal. «Ejecución: Worker / Hilo principal» selecciona
el transporte; no cambia `engineKind`. Worker es el default si está disponible.

- `src/sim/` contiene la física y no debe depender de React, del DOM ni del
  estado de Zustand.
- `src/sim/solver/` calcula aceleraciones; `src/sim/integrator/` actualiza
  posiciones y velocidades. Mantener ambas responsabilidades separadas.
- `DirectNBodySolver` + Leapfrog KDK es el motor de referencia de la v1
  (`engineKind: 'nbody'`, default). No cambiar su comportamiento físico para
  añadir motores.
- `OrbitalEngine` (`engineKind: 'orbital'`) es experimental: propaga elipses
  de dos cuerpos respecto a un primario dominante. No sustituye al N-body ni
  se activa por heurística. El usuario lo elige en la UI.
- La interfaz `SimulationRuntime` (`getEngineKind`, `runFrame`, `stepOnce`, …)
  es el único contrato compartido por motores físicos. Añadir motores futuros
  implementando esa interfaz, sin reescribir los dos actuales.
- Los motores dentro del Worker siguen implementando `SimulationRuntime` síncrona.
  `WorkerSimulationSession` es un controlador de UI separado: getters del último
  estado confirmado, `stepOnce()` y `pause()` con Promise/acuse. No tratarlo como
  un runtime síncrono ni usar getters del cliente para validación numérica.
  El protocolo lleva id/generación; permite un frame pendiente, descarta respuestas
  anteriores a reset, termina Workers reemplazados y pausa con aviso si falla o
  no responde en 5 s. El usuario puede recuperar el último estado con Hilo principal.
- Posiciones/velocidades viajan en Float64Array transferible; metadatos solo al
  inicializar o fusionar. Los snapshots publicados en React tienen diagnósticos
  frescos del mismo estado; el canvas puede recibir estados posteriores con
  métricas reutilizadas. Interpolación solo visual entre estados confirmados,
  sin extrapolar ni trazar grandes cuerdas que crucen un primario.
- `src/sim/state/` contiene el estado físico de ejecución; los metadatos
  editables del documento y los datos visuales deben permanecer separados.
- `src/render/` y `src/components/` se ocupan de cámara, canvas e interacción,
  no de implementar reglas físicas.
- El render Canvas2D dibuja discos con **mapas fotográficos** (NASA/Solar System Scope en
  `public/textures/planets/`, reducidos a 1024 px al decodificar). Se cachea **un**
  disco sin iluminar por textura (proyección ecuatorial, norte arriba, nunca se
  rota) y **una** máscara de sombra iluminada desde +x que se rota hacia el Sol
  y se multiplica sobre el disco (la sombra solo depende de n·l, así que rotarla
  es exacto; rotar el disco texturizado giraría los polos). Es solo visual: no altera masa, radio físico ni integración.
- Mientras se reproduce, el store publica `snapshot` a React como máximo cada
  `UI_SNAPSHOT_INTERVAL_MS` (100 ms); el canvas se dibuja cada frame. Para
  hit-testing o encuadre de cámara usar `latestSnapshot()`, no `store.snapshot`:
  corresponde al estado dibujado (puede estar interpolado), nunca usarlo como
  entrada física. El estado físico confirmado se obtiene de la sesión/motor.
- `runFrame(nowMs?, { cachedDiagnostics })` permite reutilizar las métricas del
  último snapshot publicado en frames exclusivos del canvas. El store omite
  esta opción al publicar (100 ms): posiciones/velocidades siempre son actuales,
  y las métricas publicadas corresponden a ese mismo estado. `getSnapshot()`,
  `stepOnce()`, pausa y edición calculan métricas frescas. No usar los diagnósticos
  de `latestSnapshot()` para validación física: pedir `engine.getSnapshot()`.
- `scripts/benchmark-nbody.ts` importa los módulos de producción: mide integración,
  colisiones sin solapes, diagnósticos, snapshots y lotes de seis frames con la
  misma física y distinta frecuencia de diagnósticos. Reporta warm-up, mediana,
  p95 y entorno. Es headless; no mide Canvas/React ni acredita FPS de navegador.
- `npm run benchmark:worker` compila y ejecuta el bundle real del Worker en
  `node:worker_threads` con 114 cuerpos; separa bloqueo del hilo llamante y
  tiempo hasta completar el frame. No convertir su ahorro de bloqueo en FPS.
- Estelas N-body: observador opcional `FrameSnapshotOptions.onStep` sobre pasos
  físicos completados. `PhysicsTrailSampler` recoge cada 8 pasos, máximo 128
  muestras por cuerpo/lote, relativas al padre para lunas. Truncamientos/fusiones
  marcan discontinuidad y limpian el historial visual para no unir saltos falsos.
  El canvas no añade duplicados pausado o esperando al Worker. El contador de FPS
  y p95 en la UI mide cadencia de render, separada de años/s de física.
- `DirectNBodySolver` evalúa cada par una sola vez (3.ª ley de Newton).
  `MergeCollisionPolicy` hace primero un sweep-and-prune exacto en x y solo
  ejecuta el bucle O(N²) de fusión si hay algún solape. Compara distancias al
  cuadrado; no usar `Math.hypot`/`sqrt` ni asignaciones en bucles O(N²).
- Efectos visuales 2D en `src/render/` (entrada `body-effects.ts`; módulos
  `planet-lighting.ts`, `planet-atmosphere.ts`, `ring-system.ts`,
  `gas-giant-bands.ts`, `solar-effects.ts`, `starfield.ts`, perfiles en
  `body-visual-profiles.ts`). Pipeline: textura → iluminación/terminador →
  atmósfera/scattering aproximado → anillos procedurales
  de frente (círculos en el plano orbital; la vista es 2D cenital, no hay
  inclinación 3D) → corona solar. Las bandas de gigantes salen del mapa
  fotográfico; no se superponen franjas horizontales extra. Perfiles
  declarativos por cuerpo (no
  ramas `if (name === 'Saturn')` en el renderer). El reloj visual
  (`visual-clock.ts`) anima haze/corona/bandas con tiempo de render; se
  congela si la simulación está en pausa y se anula con
  `prefers-reduced-motion`. Solo render; no cambia física ni documentos.

## Reglas de física y datos

- Usar unidades SI internamente: metros, segundos, kilogramos y
  `G = 6.67430e-11` desde `src/sim/constants.ts`.
- Mantener el almacenamiento numérico en `Float64Array`/SoA cuando el dato sea
  parte del estado físico o del hot path.
- El integrador por defecto del motor N-body es Leapfrog KDK. No sustituirlo
  por Euler ni introducir un integrador no simpléctico sin una justificación y
  tests de conservación. El motor orbital no usa Leapfrog: evalúa el estado
  kepleriano en el instante pedido (`simulationTime`).
- El tiempo de simulación (`physicsDt`) es independiente de la escala temporal
  solicitada por la UI; conservar la distinción entre `requestedTimeScale` y
  `effectiveTimeScale`. La UI debe mostrar Objetivo vs Real y no presentar la
  velocidad pedida como garantizada cuando el motor N-body está limitado por
  CPU. En el motor orbital, `effectiveTimeScale` coincide con lo pedido si el
  escenario es compatible (no hay subpasos Leapfrog).
- Ambos motores avanzan `simulationTimeScale × tiempo real transcurrido`
  (`FrameClock` en `src/sim/engine/frame-clock.ts`), nunca un 60 fps supuesto.
  Huecos > 0.1 s se recortan; sin marca de tiempo (tests) se usa `1/targetFps`.
  El N-body arrastra al frame siguiente el tiempo pendiente menor que
  `physicsDt` (no redondear hacia arriba a un paso por frame) y descarta el
  atraso cuando está limitado por CPU.
- `engineKind` (`nbody` | `orbital`) es propiedad explícita de `SimConfig`.
  Default `nbody`. Nunca auto-cambiar de motor. Un escenario incompatible con
  Orbital debe mostrarse como tal y no avanzar física incorrecta.
- `physicsDt` es fijo durante la integración N-body (reproducibilidad). Se elige por
  preset o, al reconstruir el documento, según composición: sistemas con lunas
  cercanas usan 120 s (o conservan un dt ya fino ≤ 300 s, p.ej. Tierra–Luna);
  escenarios lejanos sin lunas (Kuiper) usan 7200 s. No adaptar dt en cada paso.
- La escala visual, el radio de dibujo y la cámara no deben alterar las
  magnitudes físicas. **Relativo:** el Sol (o el cuerpo de mayor radio) es la
  referencia; los demás se dibujan como `sunDisplayPx × (R / R_ref)` con un
  mínimo legible; `relativeSunDisplayPx` es ajustable (12–64 px). Distancias
  orbitales usan solo el zoom de cámara. **Real:** un solo factor
  `px/m = realSunDisplayPx / R_ref` escala radios, distancias, órbitas, trails e
  interacción; `realSunDisplayPx` es ajustable (12–1M px). Bajar el Sol
  reduce todo el sistema; subirlo da detalle en planetas y lunas (pan/zoom para
  navegar). No inflar solo un cuerpo: las lunas galileanas quedarían dentro del
  disco de Júpiter.
- Las colisiones se implementan mediante `CollisionPolicy` (`merge` o
  `ignore`). No duplicar esa lógica en el renderer o en los componentes.
- Evitar cambios silenciosos de escenarios/catalogo: añadir o modificar un
  preset requiere actualizar sus tests.
- En el catálogo, `orbitRadius` es el semieje mayor y todo cuerpo en órbita
  debe incluir `eccentricity` publicada (J2000 / JPL). `bodyFromSunOrbit` y
  `bodyAroundParent` colocan en periapsis con velocidad vis-viva. El
  laboratorio es 2D: no se modela la inclinación. Los escenarios de
  validación Sol–Tierra circular/elíptica fuerzan e = 0 a propósito.
- Las lunas usan μ = G(M_padre + m) para su órbita relativa. Todo escenario o
  acción del store que añada satélites debe pasar la lista por
  `applySatelliteRecoil` (solo con los ids nuevos) para que el baricentro
  planeta–lunas conserve la órbita original del planeta.

## Testing

Los cambios físicos deben incluir o actualizar tests en
`src/sim/validation/`. Como mínimo, comprobar según corresponda:

- conservación o deriva de energía, momento y momento angular;
- órbitas de dos cuerpos y escenarios existentes;
- edición de masa y reinicialización del estado;
- colisiones y política seleccionada;
- determinismo con las mismas entradas;
- selección de motor (`nbody` vs `orbital`), compatibilidad de escenarios y
  propagación kepleriana de dos cuerpos (circular, elíptica, tiempo ±).

Preferir tests headless sobre tests que necesiten montar React. Si se corrige un
bug numérico, añadir primero un caso de regresión que falle con el código
anterior.

## Alcance de la v1

No introducir WebGPU, WASM ni una implementación completa de
Barnes–Hut como parte de una mejora ordinaria. Esas piezas son fases futuras y
requieren una decisión explícita, benchmarks y una estrategia de validación
equivalente al solver directo. La sesión Worker de fase 2 fue autorizada por el
usuario el 22-10-2026: conserva solver, integrador, dt y motor seleccionados.
El motor orbital v1 tampoco incluye
perturbaciones planetarias, efemérides JPL, híbridos N-body/Kepler, ni
órbitas parabólicas/hiperbólicas.

No cambiar la API pública o el formato de documentos/escenarios sin revisar
compatibilidad con los presets y la UI existentes. `engineKind` es un campo
aditivo de `SimConfig` (default `nbody`); documentos antiguos siguen siendo
N-body.

## Estilo de cambios

- Mantener TypeScript estricto y nombres descriptivos.
- Preferir funciones pequeñas y datos explícitos sobre estado global oculto.
- Evitar dependencias nuevas si la funcionalidad puede resolverse con el stack
  actual.
- No mezclar refactors amplios con cambios de comportamiento físico.
- Actualizar README o `docs/` cuando cambien comandos, decisiones de
  arquitectura o comportamiento visible.

## Git

Mantener la rama en estado funcional. Para cambios históricos o acciones que
puedan afectar a la sincronización con Lovable, pedir confirmación explícita
antes de actuar.
