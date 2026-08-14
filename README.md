# ALGO::DASHBOARD
**Dashboard interactivo de algoritmos puros — JavaScript ES6+ vanilla, Canvas2D nativo, cero dependencias externas.**
Siete módulos algorítmicos independientes que cubren búsqueda en grafos, neuroevolución, sistemas de partículas emergentes, geometría computacional, autómatas celulares, algoritmos de ordenamiento sonificados y fractales matemáticos — todos renderizados a mano sobre `<canvas>` sin librerías de gráficos, física, audio ni IA.

## 1. Arquitectura del sistema
### 1.1 Filosofía de diseño
El proyecto sigue una arquitectura de **módulos IIFE aislados** (`(() => { ... })()`), uno por dominio algorítmico. Cada módulo:
- Encapsula su propio estado (grid, población, agentes) en clausuras privadas — no hay variables globales compartidas entre módulos.
- Expone únicamente `{ init, onActivate }` como interfaz pública.
- Gestiona su propio ciclo de animación (`requestAnimationFrame` / `setTimeout` encadenado) de forma autónoma.

Esto evita acoplamiento entre módulos y permite que, por ejemplo, el módulo de Boids siga corriendo en segundo plano mientras el usuario inspecciona el módulo de Voronoi, sin interferencias de estado ni fugas de referencias cruzadas.

```
index.html
├── styles.css                  → design tokens, layout grid, tema oscuro
└── js/
    ├── pathfinding.js          → Módulo 01: BFS, A*, generación de laberintos
    ├── neuralnet.js            → Clase NeuralNetwork reutilizable (MLP 8-12-4)
    ├── snake.js                → Módulo 02: Snake (A* determinista + evolutivo)
    ├── boids.js                → Módulo 03: sistema de bandadas (Reynolds)
    ├── voronoi.js               → Módulo 04: diagramas de Voronoi (raster)
    ├── conway.js                → Módulo 05: autómata celular (Juego de la Vida)
    ├── sorting.js               → Módulo 06: ordenamiento sonificado (Web Audio API)
    ├── mandelbrot.js            → Módulo 07: fractal de Mandelbrot (plano complejo)
    └── main.js                 → Bootstrap SPA, navegación, FPS global
```

### 1.2 Patrón de animación sin bloqueo del event loop
Los algoritmos de búsqueda (BFS/A*) y de generación de laberintos están implementados como **generadores de ES6** (`function*`). Esto permite ejecutar el algoritmo paso a paso, cediendo el control al navegador entre iteraciones mediante `requestAnimationFrame`, en vez de ejecutar la búsqueda completa de forma síncrona. Ventajas:

- El hilo principal nunca se bloquea, incluso en grids grandes.
- El número de pasos por frame es configurable (`stepsPerFrame`), permitiendo animar la exploración en tiempo real a distintas velocidades sin alterar la lógica del algoritmo.
- El estado del algoritmo (heap, cola, nodo actual) vive dentro del generador y se congela automáticamente entre `yield`, sin necesidad de serializarlo manualmente.

### 1.3 Comunicación entre capas
No existe un framework de estado global ni un virtual DOM. Cada módulo lee directamente los controles del DOM (`<select>`, `<input type="range">`) en el momento de ejecutar una acción, y escribe métricas directamente en los nodos `<strong>` correspondientes del panel lateral. Esta elección es deliberada: a esta escala (7 módulos, sin ruteo, sin componentes anidados) un framework reactivo añadiría overhead conceptual sin beneficio medible, y el objetivo del proyecto es exhibir dominio de los algoritmos, no de un stack de frontend.


## 2. Especificación técnica y complejidad algorítmica
### 2.1 Módulo 01 — Pathfinding & Maze Engine
| Algoritmo | Estructura de datos clave | Complejidad temporal | Complejidad espacial |
|---|---|---|---|
| **BFS** | Cola FIFO (array + `shift`) | `O(V + E)` | `O(V)` |
| **A\*** | Min-heap binario a medida, ordenado por `f = g + h` | `O(E log V)` | `O(V)` |
| **Generación de laberintos** (Backtracking DFS) | Pila explícita + `Set` de visitados | `O(V)` | `O(V)` |

**Heurística de A\*:** distancia Manhattan `h(n) = |n.x - end.x| + |n.y - end.y|`. En una rejilla con 4-conectividad y coste uniforme por arista, esta heurística es **admisible** (nunca sobreestima el coste real) y **consistente** (`h(n) ≤ coste(n, n') + h(n')` para todo vecino `n'`), lo que garantiza matemáticamente que A* devuelve el camino de coste mínimo, igual que BFS, pero explorando muchos menos nodos en la práctica gracias a la guía heurística.

**Cola de prioridad:** implementada desde cero como un min-heap binario indexado por array (sin `Array.sort` en cada iteración, que sería `O(n log n)` por operación). Las operaciones `push`/`pop` son `O(log n)`. Se emplea *lazy deletion*: en vez de buscar y actualizar la prioridad de un nodo ya insertado (`decrease-key`, costoso en un heap array-based), se insertan entradas duplicadas y se descartan al extraerlas si el nodo ya fue visitado. Esto simplifica el código a costa de un heap ligeramente más grande, con complejidad amortizada equivalente.

**Generación de laberintos:** Recursive Backtracker operando sobre coordenadas impares (celdas "reales") y tallando las celdas pares intermedias como paredes derribadas. El resultado es un **árbol de expansión perfecto**: exactamente un camino entre cualquier par de celdas, sin ciclos, garantizando que el laberinto siempre tiene solución única.

### 2.2 Módulo 02 — Agentes Autónomos y Redes Evolutivas
**Motor A* (determinista):** en cada frame se ejecuta una búsqueda A* completa sobre una rejilla `20×20` tratando el cuerpo de la serpiente como obstáculo. Complejidad por frame: `O(E log V)` con `V ≤ 400`. Si no existe camino directo a la manzana (la serpiente se ha encerrado a sí misma), se activa un **movimiento de supervivencia** mediante flood-fill acotado (`O(1)` amortizado, limitado a 60 celdas) que elige la dirección con mayor espacio libre alcanzable, evitando así el "camino óptimo suicida" (perseguir la manzana en línea recta hacia un callejón sin salida).

**Motor evolutivo (Neuroevolución):**

- **Red neuronal:** perceptrón multicapa `8 → 12 → 4` con activación `tanh` en ambas capas. Los 8 inputs son sensores tipo *raycast* en 8 direcciones (distancia normalizada al obstáculo/muro más cercano, con señal atractiva especial cuando el rayo intersecta la manzana). La salida se decodifica por `argmax` sobre las 4 neuronas de salida (arriba/abajo/izquierda/derecha).
- **Algoritmo genético:**
  - Población de 150 individuos.
  - **Fitness:** `steps + (2^score + score^2.1 · 500) − score^1.2 · (0.25·steps)^1.3`. La componente exponencial en `score` prioriza fuertemente comer manzanas sobre la mera supervivencia (evita que la población converja al óptimo local de "dar vueltas en círculo sin comer").
  - **Selección:** torneo de tamaño 5 (se muestrean 5 individuos al azar y se elige el de mayor fitness), que mantiene presión selectiva sin perder diversidad genética tan rápido como la selección puramente proporcional.
  - **Elitismo:** el 10% superior de cada generación pasa sin modificar a la siguiente, garantizando que el mejor fitness nunca decrece entre generaciones.
  - **Cruzamiento:** uniforme gen a gen (cada peso de la red hija se hereda al azar de uno de los dos padres con probabilidad 0.5).
  - **Mutación:** gaussiana acotada, aplicada con probabilidad 8% por gen, con magnitud de ruido ±0.35 y clamping a `[-1, 1]` para mantener estabilidad numérica.
- **Complejidad por individuo evaluado:** `O(pasos × (sensores + forward_pass))`, donde el forward pass es `O(8·12 + 12·4)` = `O(1)` respecto al tamaño del problema (arquitectura fija).

### 2.3 Módulo 03 — Boids (Comportamiento de bandadas)
Implementación directa del modelo de Craig Reynolds (1986): cada boid calcula tres fuerzas vectoriales (separación, alineación, cohesión) a partir de sus vecinos dentro de un radio de percepción, más una fuerza de evasión de alta prioridad si hay un depredador (el cursor) cerca.

- **Complejidad por frame:** `O(n²)`, ya que cada boid inspecciona a todos los demás para determinar su vecindario. Es una elección deliberada: un *spatial hashing* o *quad-tree* reduciría esto a `O(n log n)` o `O(n)` amortizado, pero se priorizó la legibilidad pedagógica del código sobre la escalabilidad — a las poblaciones soportadas por el slider (≤400 agentes), `O(n²)` sigue corriendo a 60 FPS en hardware moderno.
- **Espacial:** `O(n)` (posición + velocidad + aceleración por boid).
- Las fuerzas se limitan (`limit(maxForce)`) y la velocidad resultante se acota (`limit(maxSpeed)`) para evitar aceleraciones no físicas y mantener el movimiento visualmente coherente.

### 2.4 Módulo 04 — Geometría Computacional (Voronoi)
Enfoque **raster por fuerza bruta**: para cada bloque de píxeles de tamaño `resolution × resolution`, se calcula la semilla más cercana probando la distancia euclídea al cuadrado (se omite la raíz cuadrada, innecesaria para comparar distancias, ahorrando una operación costosa por comparación) a **todas** las semillas.

- **Complejidad:** `O((W·H / r²) · n)`, con `W×H` la resolución del canvas, `r` el factor de resolución (submuestreo) y `n` el número de semillas.
- **Alternativa no implementada (documentada por completitud):** el algoritmo de *Fortune* (barrido de línea) resuelve el diagrama exacto por vértices en `O(n log n)`, independiente de la resolución de pantalla. Se optó por el enfoque raster porque el resultado es visualmente idéntico a la resolución de renderizado empleada, y su implementación es an orden de magnitud más simple de razonar y verificar matemáticamente para fines de portfolio técnico.

### 2.5 Módulo 05 — Autómatas Celulares (El Juego de la Vida de Conway)
Autómata celular clásico sobre una matriz binaria `90×60` con vecindad de Moore (8 vecinos). Las 4 reglas se evalúan de forma estrictamente local y simultánea (todas las celdas se actualizan a la vez, nunca en el sitio, para no contaminar el cálculo de vecinos de celdas aún no procesadas en la misma generación):

| Regla | Condición | Efecto |
|---|---|---|
| Soledad | viva, `< 2` vecinas vivas | muere |
| Supervivencia | viva, `2` o `3` vecinas vivas | sigue viva |
| Sobrepoblación | viva, `> 3` vecinas vivas | muere |
| Reproducción | muerta, exactamente `3` vecinas vivas | nace |

- **Complejidad temporal:** `O(W·H)` por generación — cada celda calcula su vecindad en `O(1)` (8 comparaciones fijas), sin recursión ni estructuras auxiliares dinámicas.
- **Complejidad espacial:** `O(W·H)` — se mantienen dos matrices (`grid` y `nextGrid`, técnica de *doble buffer*) que se intercambian por referencia (`[grid, nextGrid] = [nextGrid, grid]`) en cada paso, evitando reasignar memoria nueva en cada generación.
- **Patrones incluidos:** Glider (el patrón viajero más simple), Pulsar (oscilador de periodo 3) y el Gosper Glider Gun (la primera estructura descubierta capaz de generar gliders indefinidamente, demostrando que el sistema es Turing-completo y puede crecer sin límite).

### 2.6 Módulo 06 — Visualizador de Ordenamiento con Banda Sonora
| Algoritmo | Complejidad temporal | Complejidad espacial | Estable |
|---|---|---|---|
| **Bubble Sort** | `O(n²)` peor/medio caso, `O(n)` mejor caso (con optimización de corte temprano) | `O(1)` in-place | Sí |
| **QuickSort** | `O(n log n)` medio, `O(n²)` peor caso (pivote siempre mínimo/máximo) | `O(log n)` (pila de recursión) | No |
| **Merge Sort** | `O(n log n)` garantizado en todos los casos | `O(n)` (arrays auxiliares en cada fusión) | Sí |

Los tres algoritmos están implementados como **generadores ES6 recursivos** (`function*` con `yield*` para delegar en sub-generadores, en el caso de QuickSort y Merge Sort), lo que permite pausar la ejecución en cada comparación/intercambio individual sin necesidad de reescribir los algoritmos en forma iterativa explícita con pilas manuales.

**Sonificación (Web Audio API):** se crea un único `AudioContext` con un único `OscillatorNode` de tipo `sine`, reutilizado durante toda la ejecución del algoritmo — nunca se instancia un oscilador nuevo por nota, ya que cada `OscillatorNode` en Web Audio API solo puede iniciarse una vez y su creación/destrucción repetida generaría *garbage collection* excesivo y clics audibles. En su lugar, se modula dinámicamente su `frequency` (mapeada linealmente desde la altura de la barra comparada/movida al rango 120–780 Hz) usando `setTargetAtTime`, y se controla la envolvente de volumen con un `GainNode` que sube y decae rápidamente en cada evento (ataque de 5 ms, decaimiento de 50 ms), simulando percusión y evitando el "pitido continuo" de un tono sostenido.

### 2.7 Módulo 07 — Fractal de Mandelbrot
Para cada píxel `(px, py)` se traduce su posición a un número complejo `C = cx + cy·i` dentro del rango visible del plano, y se itera `Z(n+1) = Z(n)² + C` (expandido a componentes reales `zr`, `zi` para evitar el overhead de crear objetos complejos por iteración) hasta que `|Z|² > 4` (condición de escape) o se alcance el máximo de iteraciones.

- **Complejidad temporal:** `O(W · H · maxIter)` en el peor caso — los puntos interiores al conjunto nunca "escapan" y consumen siempre el máximo de iteraciones configurado.
- **Complejidad espacial:** `O(W · H)` para el buffer de píxeles (`ImageData`), sin estructuras adicionales.
- **Zoom interactivo:** al seleccionar una región (arrastrando el ratón) se recalculan `centerX`, `centerY` y `scale` (el ancho del plano complejo visible) y se **re-renderiza el fractal completo desde cero** — no existe forma de reutilizar cómputo del nivel de zoom anterior, ya que cada nuevo píxel corresponde a una coordenada distinta del plano complejo. El número máximo de iteraciones aumenta logarítmicamente con el nivel de zoom (`maxIter = 100 + log2(3/scale) · 40`, acotado a 1000) para seguir revelando detalle fino en la frontera fractal a medida que la escala se reduce, sin penalizar el rendimiento en la vista inicial.


## 3. Decisiones de rendimiento y optimización del renderizado
1. **Generadores en vez de recursión para BFS/A*/laberintos:** evita *stack overflows* en grids grandes y permite animación sin bloquear el hilo principal (ver §1.2).
2. **`Float32Array` en la red neuronal:** los pesos y activaciones se almacenan en arrays tipados en vez de arrays JS genéricos, reduciendo la presión sobre el recolector de basura durante la evaluación de 150 individuos por generación (miles de forward passes por segundo).
3. **Reutilización de buffers (`this.lastHidden`, `this.lastOutput`):** la red neuronal no reasigna memoria en cada `forward()`; escribe sobre los mismos `Float32Array` ya reservados en el constructor, eliminando *garbage collection* innecesario en el hot path.
4. **`ImageData` directo para Voronoi:** en vez de dibujar miles de rectángulos individuales con `fillRect` (cada uno implica un cambio de estado del contexto 2D), se escribe directamente sobre el buffer de píxeles (`ctx.createImageData` + `putImageData`), una operación varios órdenes de magnitud más rápida para renderizado denso.
5. **Lazy deletion en el heap de A\*** (ver §2.1): evita implementar `decrease-key` sobre un heap array-based, que requeriría mantener un índice inverso nodo→posición y complicaría el código sin beneficio asintótico relevante a esta escala.
6. **Sin asignaciones por frame en Boids:** los vectores de fuerza (`Vector2`) se instancian, pero no se retienen referencias cruzadas entre frames — el motor de generación de basura de V8 maneja eficientemente objetos de vida corta ("nursery generation"), por lo que se priorizó la claridad matemática (una clase `Vector2` con métodos nombrados) sobre micro-optimizar con aritmética escalar inline.
7. **Desacoplo de simulación y render:** cada módulo separa claramente el paso de cómputo (`step`, `flock`, `render`) de las llamadas a `ctx.*`, facilitando medir el tiempo de cada fase por separado con `performance.now()` (ver panel de métricas).
8. **Prevención de fugas de memoria:** todos los `requestAnimationFrame`/`setTimeout` se cancelan explícitamente (`cancelAnimationFrame`, `clearTimeout`) en las rutinas de `reset()` y antes de reprogramar el siguiente frame, evitando bucles de animación huérfanos acumulándose al cambiar de configuración o pestaña.
9. **Doble buffer en el Juego de la Vida:** en vez de reasignar una matriz nueva en cada generación (`Array.from` es costoso si se repite 10-30 veces por segundo), se mantienen dos matrices `Uint8Array` reservadas una única vez y se intercambian por referencia (`[grid, nextGrid] = [nextGrid, grid]`), reduciendo la presión sobre el recolector de basura a cero en el estado estacionario de la simulación.
10. **Ciclo de vida del `AudioContext` en el visualizador de ordenamiento:** se crea un único `AudioContext`/`OscillatorNode` reutilizado durante toda la sesión de ordenamiento (nunca uno por nota), y se cierra explícitamente con `audioCtx.close()` en el evento `beforeunload` de la ventana — los `AudioContext` son un recurso del sistema operativo (no solo de JS) y no se liberan automáticamente por el recolector de basura del navegador si quedan referencias activas, por lo que omitir este cierre explícito es una fuente común de fugas de memoria en aplicaciones de audio web.
11. **`ImageData` para Mandelbrot:** igual que en Voronoi, el fractal completo se escribe en un único buffer de píxeles (`ctx.createImageData` + `putImageData`) en vez de miles de llamadas a `fillRect`, indispensable aquí porque cada frame de renderizado implica calcular *todos* los píxeles del canvas (hasta 460.000 en la resolución por defecto) con su propia iteración de escape.


## 4. Accesibilidad y explicaciones en lenguaje llano
Cada módulo incluye, justo debajo de su cabecera, un cuadro "¿Qué es esto?" con una explicación del algoritmo en lenguaje no técnico, pensada para que cualquier visitante del portfolio (no solo reclutadores técnicos) entienda qué está viendo sin necesidad de conocer la notación Big O ni la jerga de estructuras de datos. La documentación técnica rigurosa (este README y los comentarios en el código) convive así con una capa divulgativa en la propia interfaz.

La paleta de color se ajustó para mantener un contraste alto entre texto y fondo (texto principal `#f3f6fa` y texto secundario `#b4c3d6` sobre fondos `#0a0e14`–`#151b26`, con ratios de contraste muy por encima del mínimo AA de WCAG de 4.5:1), de forma que el dashboard sea legible tanto para usuarios con visión reducida como en pantallas con brillo bajo.


## 5. Estructura de archivos
```
.
├── index.html
├── styles.css
├── README.md
└── js/
    ├── pathfinding.js
    ├── neuralnet.js
    ├── snake.js
    ├── boids.js
    ├── voronoi.js
    └── main.js
```


## 7. Controles rápidos por módulo
| Módulo | Interacción principal |
|---|---|
| Pathfinding | Click+arrastrar pinta muros · click derecho mueve origen · Shift+click mueve destino |
| Snake | Selector de motor (A* / Evolutivo), slider de velocidad |
| Boids | Mover el ratón sobre el canvas coloca un depredador que dispersa la bandada |
| Voronoi | Click añade una semilla · modo "Seguir ratón" convierte el cursor en semilla viva |
| Autómatas Celulares | Pausa la simulación y click+arrastra para dibujar células · selector de patrones clásicos |
| Ordenamiento + Audio | Selector de algoritmo · casilla "Silenciar" desactiva el sonido sin detener la animación |
| Mandelbrot | Click+arrastrar selecciona una región para zoom · doble click hace zoom rápido centrado en el cursor |


## 8. Licencia
Proyecto de portfolio personal. Libre de usar como referencia educativa.