# Rendimiento de diagnósticos — 22 de octubre de 2026

Se elimina el cálculo repetido de diagnósticos de conservación en los frames
que solo actualizan el canvas. La integración, fuerzas, colisiones y posiciones
se siguen calculando con la misma frecuencia y algoritmos. Las publicaciones a
React (como máximo cada 100 ms), pausa, paso manual y lecturas explícitas de
`getSnapshot()` conservan métricas frescas.

## Medición reproducible

Comando: `npm run benchmark`.

Salida completa de esta ejecución: [benchmark-2026-10-22.txt](benchmark-2026-10-22.txt).

Entorno: Windows x64, Node v24.21.0, Intel Core i7-12700KF. No se fijó la
frecuencia de CPU ni se aisló el equipo. Las cifras son observaciones locales,
no garantías de rendimiento para otros dispositivos.

El nuevo `scripts/benchmark-nbody.ts` importa las implementaciones de producción,
en lugar de duplicar un solver e integrador antiguos en un script independiente.
Usa semilla 42, Float64, paso de 120 s, 60 invocaciones de calentamiento y 120
muestras por run, con 5 runs. Reporta mediana de medianas y mediana de p95.

Se miden por separado integración, colisiones sin solapes, diagnósticos y snapshots.
La comparación siguiente mide **lotes completos de seis frames**, incluido el
frame que publica métricas. Ambos modos ejecutan el mismo trabajo físico: un
subpaso N-body por frame o una evaluación orbital. El modo anterior recalcula
diagnósticos seis veces por lote; el optimizado, una. Representa publicaciones
a 10 Hz con render a 60 Hz, sin limitar por presupuesto de CPU.

| Cuerpos | Motor | Cada frame (ms/lote) | Cada publicación (ms/lote) | Reducción CPU |
|---:|---|---:|---:|---:|
| 100 | N-body | 0,4307 | 0,1967 | 54,3 % |
| 500 | N-body | 10,2976 | 7,9737 | 22,6 % |
| 1.000 | N-body | 41,3851 | 31,7059 | 23,4 % |
| 100 | Orbital | 0,3222 | 0,0862 | 73,2 % |
| 500 | Orbital | 14,1322 | 2,7209 | 80,7 % |
| 1.000 | Orbital | 57,7439 | 9,9542 | 82,8 % |

No son FPS de navegador: se excluyen Canvas, texturas, estelas y React. No se
extrapolan a escenarios con cientos o miles de subpasos por frame: al aumentar
ese trabajo, la gravedad domina y el ahorro porcentual de diagnósticos disminuye.
Los costes de fases aisladas pueden diferir de los costes dentro del runtime por
calentamiento/JIT, asignaciones y variación de carga; no deben sumarse como una
predicción de FPS.

## Siguiente decisión

El solver directo sigue siendo O(N²). Barnes–Hut continúa sin implementar y
es candidato para muchos cuerpos con muchos subpasos. El ahorro anterior no
demuestra su rendimiento ni establece un umbral de activación. Antes de adoptarlo
hay que comparar el solver aproximado con el directo en las mismas condiciones,
medir error de aceleración y deriva de energía/momentos, validar colisiones y
determinismo, y mantener selección explícita. El motor orbital conserva sus
limitaciones físicas actuales; no sustituye al N-body para sistemas con lunas o
perturbaciones.

## Verificación

`npm test`: 142 tests pasan. `npm run build`: tipos y producción correctos.
`npm run benchmark`: completado, incluido Kuiper a 10.000 años (43.830.000
subpasos N-body). La diferencia frente a Kepler en este escenario incluye
perturbaciones planetarias y no se interpreta como error de integración.
Siete tests nuevos cubren ambos motores: mismo estado físico con diagnósticos
reutilizados, actualización tras reset/edición, publicación del store, pausa y
paso manual y escenario orbital incompatible congelado. El benchmark también comprueba compatibilidad y valores finitos en
sus fixtures. El script nuevo pasa una comprobación TypeScript estricta adicional.

Comprobación local en Chrome: la reproducción avanza el tiempo y las métricas;
pausar conserva el estado, y el paso manual incrementa de 1.232 a 1.233 pasos.
No se observaron errores en la consola durante esta comprobación. Esta prueba
funcional no mide el rendimiento del navegador.
