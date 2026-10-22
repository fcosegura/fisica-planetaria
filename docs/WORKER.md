# Ejecución en Worker — 22 de octubre de 2026

La física puede ejecutarse en un Web Worker mientras el hilo principal atiende
Canvas y React. Se conservan solver directo, Leapfrog KDK, Float64, paso físico
fijo y políticas de colisión. Worker es un transporte independiente del motor
N-body/Orbital, no una aproximación física nueva.

## Uso y coherencia

En **Ejecución**, elegir **Worker** o **Hilo principal**. El cambio pausa y
conserva cuerpos, posiciones, velocidades y tiempo confirmado; reconstruye el
motor, reiniciando contador de pasos y referencia de diagnósticos. Worker es el
default si está disponible. Si falla o no responde en 5 s, se detiene con un
aviso; Hilo principal permite recuperar el último estado confirmado.

La sesión asíncrona está en `src/runtime/worker-session.ts`. Sus getters leen
estados confirmados; pausa y paso manual esperan un acuse. Los motores dentro
del Worker mantienen el contrato síncrono `SimulationRuntime`.

El protocolo identifica peticiones por id/generación. Admite un frame pendiente
como máximo, descarta respuestas anteriores al reset y termina Workers
reemplazados. Cinemática y estelas viajan en Float64Array transferibles;
metadatos se envían al inicializar o cambiar el número de cuerpos por colisión.
React publica estados con diagnósticos frescos. El canvas puede dibujar estados
posteriores con métricas reutilizadas e interpolar movimientos cortos entre
confirmaciones. La interpolación nunca se reinyecta en la física; selección y
cámara usan el estado dibujado.

Las estelas N-body muestrean estados integrados cada 8 pasos, máximo 128 muestras
por cuerpo/lote. Si se pierde historia, se corta la estela anterior para no unir
saltos mediante rectas falsas. Las lunas se muestrean respecto a su padre.
Orbital corta tramos con saltos angulares grandes. Pausa y espera no duplican
puntos; editar la composición limpia las trayectorias anteriores.

## Mediciones

Windows x64, Node v24.21.0, Intel Core i7-12700KF; sin aislamiento de carga ni
frecuencia de CPU fijada. El benchmark largo y navegador estuvieron activos
durante parte de las mediciones: son observaciones locales, no garantías.

`npm run benchmark:worker` compila y ejecuta el bundle real en
`node:worker_threads`: 114 cuerpos, paso 120 s, objetivo 1 año/s, presupuesto
12 ms. Tres runs, cinco frames de warm-up y cuarenta muestras por run.
Mediana de medianas y mediana de p95. Excluye Canvas/React.

| Modo | Llamada síncrona mediana | Llamada síncrona p95 | Frame completo mediana |
|---|---:|---:|---:|
| Hilo principal | 12,126 ms | 12,155 ms | 12,126 ms |
| Worker | 0,077 ms | 0,158 ms | 12,430 ms |

La llamada Worker mide envío, interpolación y consumo del lote anterior; la
recepción/desempaquetado asíncronos quedan fuera de ese intervalo. El tiempo
completo espera una barrera posterior al frame e incluye respuesta con métricas
frescas. Ambos modos tienen la misma configuración/presupuesto; los subpasos
pueden variar al agotar CPU. La paridad numérica se prueba aparte con pasos
controlados, no comparando corridas limitadas por reloj.

Resultado: menos bloqueo síncrono del hilo llamante, sin aceleración demostrada
del cálculo físico total. [Salida completa](benchmark-worker-transport-2026-10-22.txt).

Observaciones puntuales del navegador integrado, con 114 cuerpos y objetivo
1 año/s:

| Modo | FPS observados | p95 de trabajo de tick/render | Velocidad simulada |
|---|---:|---:|---:|
| Hilo principal | ~35 | 13,5 ms | ~0,06 años/s |
| Worker | ~35 | 1,7 ms | ~0,06 años/s |

No se observó aumento claro de FPS. Tampoco se demostró reducir el p95 del
intervalo entre frames: primeras lecturas ~33,5 ms en principal y ~49,9 ms con
Worker, en condiciones no aisladas. La mejora comprobada es menos trabajo
dentro del bucle del hilo principal. Este contador excluye React diferido y
recepción async; no mide toda la UI. Ventanas con huecos >250 ms se reinician
para no presentar una pestaña en segundo plano como benchmark de fluidez.

## Validación y límites

Las pruebas comprueban paridad física de ambos motores y los 114 cuerpos,
conservación, colisiones y cambios de política, transferencia Float64, pausa y
paso ordenados, reset/respuestas obsoletas, recuperación/timeout, publicación
coherente, interpolación y estelas acotadas. La revisión final se delegó en dos
subagentes GPT-6 Luna con razonamiento High: `npm test` pasa con 162 tests en
14 archivos y `npm run build` pasa. Se añadieron regresiones de cambio de
política de colisiones y selección sobre estados interpolados tras publicación.

`npm run benchmark` terminó también los 12 casos existentes, incluido Kuiper a
10.000 años (43.830.000 pasos N-body). Su divergencia respecto a Kepler sigue
siendo ~0,169 del semieje mayor, incluidas perturbaciones planetarias; no se
interpreta como error de integración.
[Salida completa](benchmark-worker-2026-10-22.txt).

El solver sigue siendo O(N²). Worker no garantiza 1 año/s con 114 cuerpos ni
60 FPS. Aumentar años/s requiere medir una optimización del solver con validación
de precisión. Aumentar FPS requiere perfilar dibujo, React y cadencia del
navegador con carga aislada. La reducción de bloqueo no demuestra esos objetivos.
