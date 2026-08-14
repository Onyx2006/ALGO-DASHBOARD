/* ==========================================================================
 * MÓDULO 01 — PATHFINDING & MAZE ENGINE
 * --------------------------------------------------------------------------
 * Estructura de datos base: matriz 2D de nodos (grafo implícito en rejilla,
 * 4-conectividad). Cada nodo conoce su estado (muro/libre) y campos auxiliares
 * usados por los algoritmos de búsqueda (gScore, fScore, padre, visitado).
 *
 * Algoritmos implementados:
 *   - BFS  (Breadth-First Search): exploración por capas, cola FIFO.
 *          Complejidad: O(V + E) tiempo, O(V) espacio. Garantiza camino
 *          más corto en grafos no ponderados.
 *   - A*   (A-estrella): cola de prioridad (min-heap binario implementado
 *          a mano) ordenada por f(n) = g(n) + h(n), con h = distancia
 *          Manhattan (admisible y consistente en rejilla 4-conectada,
 *          por lo que A* garantiza optimalidad).
 *          Complejidad: O(E log V) con heap binario.
 *   - Generación de laberintos: Backtracking recursivo iterativo (DFS con
 *          pila explícita) tallando pasillos de 2 en 2 celdas para
 *          garantizar laberintos "perfectos" (árbol de expansión, sin ciclos).
 *          Complejidad: O(V) — cada celda se visita una vez.
 * ========================================================================== */

const PathfindingModule = (() => {

  const COLS = 41, ROWS = 27; // dimensiones impares -> laberintos perfectos
  let cellSize = 20;

  let canvas, ctx;
  let grid = [];
  let start = { x: 1, y: 1 };
  let end = { x: COLS - 2, y: ROWS - 2 };

  let isRunning = false;
  let isPaintingWalls = false;
  let paintMode = 1; // 1 = añadir muro, 0 = borrar

  let animFrameId = null;
  let visitedCount = 0;
  let frontierCount = 0;

  // Min-Heap binario genérico usado como cola de prioridad para A*.
  // Se implementa a mano (sin librerías) para O(log n) en push/pop.
  class MinHeap {
    constructor(scoreFn) {
      this.items = [];
      this.scoreFn = scoreFn;
    }
    get size() { return this.items.length; }
    push(item) {
      this.items.push(item);
      this._bubbleUp(this.items.length - 1);
    }
    pop() {
      const top = this.items[0];
      const last = this.items.pop();
      if (this.items.length > 0) {
        this.items[0] = last;
        this._bubbleDown(0);
      }
      return top;
    }
    _bubbleUp(i) {
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (this.scoreFn(this.items[i]) < this.scoreFn(this.items[parent])) {
          [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
          i = parent;
        } else break;
      }
    }
    _bubbleDown(i) {
      const n = this.items.length;
      while (true) {
        let smallest = i, l = 2 * i + 1, r = 2 * i + 2;
        if (l < n && this.scoreFn(this.items[l]) < this.scoreFn(this.items[smallest])) smallest = l;
        if (r < n && this.scoreFn(this.items[r]) < this.scoreFn(this.items[smallest])) smallest = r;
        if (smallest === i) break;
        [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
        i = smallest;
      }
    }
  }

  function makeNode(x, y) {
    return {
      x, y,
      wall: false,
      visited: false,
      inFrontier: false,
      parent: null,
      g: Infinity,
      f: Infinity,
    };
  }

  function initGrid() {
    grid = [];
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) row.push(makeNode(x, y));
      grid.push(row);
    }
  }

  function resetSearchState() {
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        grid[y][x].visited = false;
        grid[y][x].inFrontier = false;
        grid[y][x].parent = null;
        grid[y][x].g = Infinity;
        grid[y][x].f = Infinity;
      }
    visitedCount = 0;
    frontierCount = 0;
  }

  function neighbors4(node) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const out = [];
    for (const [dx, dy] of dirs) {
      const nx = node.x + dx, ny = node.y + dy;
      if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && !grid[ny][nx].wall) {
        out.push(grid[ny][nx]);
      }
    }
    return out;
  }

  function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function reconstructPath(node) {
    const path = [];
    let cur = node;
    while (cur) { path.push(cur); cur = cur.parent; }
    return path.reverse();
  }

  // BFS generator: se implementa como generador para poder "pausar"
  // la ejecución frame a frame y animar la exploración sin bloquear
  // el hilo principal (evita saturar el event loop).
  function* bfsGenerator() {
    const startNode = grid[start.y][start.x];
    const endNode = grid[end.y][end.x];
    const queue = [startNode];
    startNode.visited = true;
    startNode.g = 0;

    while (queue.length > 0) {
      const current = queue.shift(); // O(n) en array; aceptable a esta escala docente
      visitedCount++;

      if (current === endNode) {
        yield { done: true, path: reconstructPath(current) };
        return;
      }

      for (const nb of neighbors4(current)) {
        if (!nb.visited) {
          nb.visited = true;
          nb.parent = current;
          nb.g = current.g + 1;
          queue.push(nb);
        }
      }
      frontierCount = queue.length;
      yield { done: false, current };
    }
    yield { done: true, path: null };
  }

  // A* generator: cola de prioridad por f = g + h (Manhattan).
  function* astarGenerator() {
    const startNode = grid[start.y][start.x];
    const endNode = grid[end.y][end.x];

    const openHeap = new MinHeap(n => n.f);
    startNode.g = 0;
    startNode.f = manhattan(startNode, endNode);
    openHeap.push(startNode);
    startNode.inFrontier = true;

    while (openHeap.size > 0) {
      const current = openHeap.pop();
      if (current.visited) continue; // entrada obsoleta (lazy deletion)
      current.visited = true;
      current.inFrontier = false;
      visitedCount++;

      if (current === endNode) {
        yield { done: true, path: reconstructPath(current) };
        return;
      }

      for (const nb of neighbors4(current)) {
        if (nb.visited) continue;
        const tentativeG = current.g + 1;
        if (tentativeG < nb.g) {
          nb.g = tentativeG;
          nb.f = tentativeG + manhattan(nb, endNode);
          nb.parent = current;
          nb.inFrontier = true;
          openHeap.push(nb); // duplicados permitidos; se filtran al pop (lazy deletion)
        }
      }
      frontierCount = openHeap.size;
      yield { done: false, current };
    }
    yield { done: true, path: null };
  }

  // Generación de laberintos: Recursive Backtracker (DFS con pila).
  // Se opera sobre celdas "impares" (nodos reales del laberinto) y se
  // tallan las celdas "pares" intermedias como paredes derribadas,
  // produciendo un árbol de expansión perfecto (sin ciclos, totalmente
  // conexo) sobre la rejilla.
  function* mazeGenerator() {
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) grid[y][x].wall = true;

    const visited = new Set();
    const key = (x, y) => `${x},${y}`;
    const stack = [{ x: 1, y: 1 }];
    grid[1][1].wall = false;
    visited.add(key(1, 1));

    while (stack.length > 0) {
      const cur = stack[stack.length - 1];
      const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
      // Fisher-Yates shuffle para aleatorizar el orden de exploración
      for (let i = dirs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
      }

      let advanced = false;
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx > 0 && nx < COLS - 1 && ny > 0 && ny < ROWS - 1 && !visited.has(key(nx, ny))) {
          // Derriba el muro intermedio
          grid[cur.y + dy / 2][cur.x + dx / 2].wall = false;
          grid[ny][nx].wall = false;
          visited.add(key(nx, ny));
          stack.push({ x: nx, y: ny });
          advanced = true;
          break;
        }
      }
      if (!advanced) stack.pop();
      yield;
    }
  }

  // RENDER
  function draw(currentExploring) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const node = grid[y][x];
        let color = '#0a0e14';
        if (node.wall) color = '#3a4456';
        else if (node.visited) color = '#264a6b';
        else if (node.inFrontier) color = '#7a5a1e';
        ctx.fillStyle = color;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
      }
    }
    if (currentExploring) {
      ctx.fillStyle = '#ffb454';
      ctx.fillRect(currentExploring.x * cellSize, currentExploring.y * cellSize, cellSize - 1, cellSize - 1);
    }
    ctx.fillStyle = '#39ff9c';
    ctx.fillRect(start.x * cellSize, start.y * cellSize, cellSize - 1, cellSize - 1);
    ctx.fillStyle = '#ff5c7a';
    ctx.fillRect(end.x * cellSize, end.y * cellSize, cellSize - 1, cellSize - 1);
  }

  function drawPath(path) {
    ctx.fillStyle = '#39ff9c';
    for (const node of path) {
      ctx.shadowColor = '#39ff9c';
      ctx.shadowBlur = 6;
      ctx.fillRect(node.x * cellSize, node.y * cellSize, cellSize - 1, cellSize - 1);
    }
    ctx.shadowBlur = 0;
  }

  // ORQUESTACIÓN: ejecuta el generador N pasos por frame (según velocidad)
  // para animar sin recursión profunda ni bloqueos del event loop.
  function runGenerator(gen, onDone) {
    isRunning = true;
    const startTime = performance.now();
    const speed = parseInt(document.getElementById('pf-speed').value, 10);
    const stepsPerFrame = speed * speed; // escala cuadrática para rango útil

    function step() {
      let result;
      for (let i = 0; i < stepsPerFrame; i++) {
        result = gen.next();
        if (result.done) break;
      }
      const val = result.value;

      updateMetrics(performance.now() - startTime);

      if (val && val.done) {
        draw(null);
        if (val.path) drawPath(val.path);
        document.getElementById('pf-pathlen').textContent = val.path ? val.path.length : 'sin solución';
        document.getElementById('pf-state').textContent = val.path ? 'Completado' : 'Sin solución';
        isRunning = false;
        if (onDone) onDone();
        return;
      }
      draw(val ? val.current : null);
      animFrameId = requestAnimationFrame(step);
    }
    step();
  }

  function updateMetrics(elapsed) {
    document.getElementById('pf-time').textContent = elapsed.toFixed(2) + ' ms';
    document.getElementById('pf-visited').textContent = visitedCount;
    document.getElementById('pf-frontier').textContent = frontierCount;
  }

  function runSearch() {
    if (isRunning) return;
    resetSearchState();
    const algo = document.getElementById('pf-algo').value;
    document.getElementById('pf-complexity').textContent = algo === 'astar' ? 'O(E log V)' : 'O(V + E)';
    document.getElementById('pf-state').textContent = 'Ejecutando…';
    const gen = algo === 'astar' ? astarGenerator() : bfsGenerator();
    runGenerator(gen);
  }

  function runMaze() {
    if (isRunning) return;
    isRunning = true;
    resetSearchState();
    const gen = mazeGenerator();
    const startTime = performance.now();
    function step() {
      let result;
      for (let i = 0; i < 6; i++) {
        result = gen.next();
        if (result.done) break;
      }
      draw(null);
      document.getElementById('pf-time').textContent = (performance.now() - startTime).toFixed(2) + ' ms';
      document.getElementById('pf-state').textContent = 'Tallando laberinto…';
      if (!result.done) {
        animFrameId = requestAnimationFrame(step);
      } else {
        document.getElementById('pf-state').textContent = 'Laberinto listo';
        isRunning = false;
      }
    }
    step();
  }

  function clearWalls() {
    if (isRunning) return;
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) grid[y][x].wall = false;
    resetSearchState();
    draw(null);
  }

  function fullReset() {
    cancelAnimationFrame(animFrameId);
    isRunning = false;
    initGrid();
    document.getElementById('pf-state').textContent = 'Inactivo';
    document.getElementById('pf-time').textContent = '0.00 ms';
    document.getElementById('pf-visited').textContent = '0';
    document.getElementById('pf-frontier').textContent = '0';
    document.getElementById('pf-pathlen').textContent = '0';
    draw(null);
  }

  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const x = Math.floor(px / cellSize);
    const y = Math.floor(py / cellSize);
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null;
    return { x, y };
  }

  function attachEvents() {
    canvas.addEventListener('mousedown', (e) => {
      const cell = cellFromEvent(e);
      if (!cell || isRunning) return;
      if (e.button === 2) { start = cell; draw(null); return; }
      if (e.shiftKey) { end = cell; draw(null); return; }
      if (cell.x === start.x && cell.y === start.y) return;
      if (cell.x === end.x && cell.y === end.y) return;
      isPaintingWalls = true;
      paintMode = grid[cell.y][cell.x].wall ? 0 : 1;
      grid[cell.y][cell.x].wall = !!paintMode;
      draw(null);
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!isPaintingWalls || isRunning) return;
      const cell = cellFromEvent(e);
      if (!cell) return;
      if (cell.x === start.x && cell.y === start.y) return;
      if (cell.x === end.x && cell.y === end.y) return;
      grid[cell.y][cell.x].wall = !!paintMode;
      draw(null);
    });
    window.addEventListener('mouseup', () => { isPaintingWalls = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.getElementById('pf-run').addEventListener('click', runSearch);
    document.getElementById('pf-maze').addEventListener('click', runMaze);
    document.getElementById('pf-clear').addEventListener('click', clearWalls);
    document.getElementById('pf-reset').addEventListener('click', fullReset);
  }

  function init() {
    canvas = document.getElementById('pf-canvas');
    ctx = canvas.getContext('2d');
    cellSize = canvas.width / COLS;
    initGrid();
    attachEvents();
    draw(null);
  }

  function onActivate() { /* no-op: el estado persiste entre pestañas */ }

  return { init, onActivate };
})();
