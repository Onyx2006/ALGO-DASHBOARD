/* ==========================================================================
 * MÓDULO 05 — AUTÓMATAS CELULARES: EL JUEGO DE LA VIDA DE CONWAY
 * --------------------------------------------------------------------------
 * Un autómata celular es un sistema discreto donde el estado de cada celda
 * en el instante t+1 depende únicamente del estado de sus 8 vecinas (vecindad
 * de Moore) en el instante t. El Juego de la Vida (John Conway, 1970) define
 * cuatro reglas deterministas sobre una matriz binaria (viva=1 / muerta=0):
 *
 *   1) SOLEDAD:        celda viva con < 2 vecinas vivas → muere.
 *   2) SUPERVIVENCIA:  celda viva con 2 o 3 vecinas vivas → sigue viva.
 *   3) SOBREPOBLACIÓN: celda viva con > 3 vecinas vivas → muere.
 *   4) REPRODUCCIÓN:   celda muerta con exactamente 3 vecinas vivas → nace.
 *
 * A pesar de la simplicidad de las reglas, el sistema es Turing-completo:
 * es un ejemplo canónico de "comportamiento emergente" a partir de reglas
 * locales sin ningún controlador central.
 *
 * Complejidad por generación: O(W·H) — cada celda se visita una vez y su
 * vecindad de Moore se calcula en O(1) (8 vecinos fijos), sin recursión.
 * ========================================================================== */

const ConwayModule = (() => {
  const COLS = 90, ROWS = 60;
  let cellSize;
  let canvas, ctx;
  let grid, nextGrid;
  let running = false, paused = true;
  let rafId = null;
  let isDrawing = false;
  let drawValue = 1;
  let lastStepTime = 0;
  let generation = 0;

  const PATTERNS = {
    glider: [[0,1],[1,2],[2,0],[2,1],[2,2]],
    pulsar: (() => {
      const coords = [];
      const arm = [[0,2],[0,3],[0,4],[2,0],[3,0],[4,0],[2,5],[3,5],[4,5],[5,2],[5,3],[5,4]];
      for (const [dy, dx] of arm) {
        for (const [sy, sx] of [[0,0],[0,6],[6,0],[6,6]]) {
          coords.push([dy + sy, dx + sx]);
        }
      }
      return coords;
    })(),
    gosper: [ // Gosper Glider Gun — patrón clásico generador de gliders infinitos
      [5,1],[5,2],[6,1],[6,2],
      [5,11],[6,11],[7,11],[4,12],[8,12],[3,13],[9,13],[3,14],[9,14],
      [6,15],[4,16],[8,16],[5,17],[6,17],[7,17],[6,18],
      [3,21],[4,21],[5,21],[3,22],[4,22],[5,22],[2,23],[6,23],
      [1,25],[2,25],[6,25],[7,25],
      [3,35],[4,35],[3,36],[4,36],
    ],
  };

  function makeGrid() {
    return Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  }

  function countNeighbors(g, x, y) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) count += g[ny][nx];
      }
    }
    return count;
  }

  function stepGeneration() {
    let alive = 0, born = 0, died = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const n = countNeighbors(grid, x, y);
        const isAlive = grid[y][x] === 1;
        let willLive = 0;
        if (isAlive && (n === 2 || n === 3)) { willLive = 1; }
        else if (!isAlive && n === 3) { willLive = 1; born++; }
        else if (isAlive) { died++; }
        nextGrid[y][x] = willLive;
        if (willLive) alive++;
      }
    }
    [grid, nextGrid] = [nextGrid, grid];
    generation++;
    return { alive, born, died };
  }

  function draw() {
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#39ff9c';
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x]) ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
      }
    }
    // rejilla sutil para facilitar el dibujo manual
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * cellSize, 0); ctx.lineTo(x * cellSize, ROWS * cellSize); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * cellSize); ctx.lineTo(COLS * cellSize, y * cellSize); ctx.stroke();
    }
  }

  function loop(now) {
    if (!running || paused) return;
    const speed = parseInt(document.getElementById('cv-speed').value, 10);
    const interval = 1000 / (speed * 2);
    if (now - lastStepTime >= interval) {
      const t0 = performance.now();
      const stats = stepGeneration();
      const elapsed = performance.now() - t0;
      draw();
      updateMetrics(elapsed, stats);
      lastStepTime = now;
    }
    rafId = requestAnimationFrame(loop);
  }

  function updateMetrics(elapsed, stats) {
    document.getElementById('cv-time').textContent = elapsed.toFixed(2) + ' ms';
    document.getElementById('cv-gen').textContent = generation;
    document.getElementById('cv-alive').textContent = stats.alive;
    document.getElementById('cv-born').textContent = stats.born;
    document.getElementById('cv-died').textContent = stats.died;
    document.getElementById('cv-state').textContent = 'Ejecutando';
  }

  function start() {
    running = true; paused = false;
    lastStepTime = 0;
    document.getElementById('cv-state').textContent = 'Ejecutando';
    rafId = requestAnimationFrame(loop);
  }
  function pause() {
    paused = true;
    document.getElementById('cv-state').textContent = 'Pausado (modo dibujo)';
  }
  function reset() {
    running = false; paused = true;
    cancelAnimationFrame(rafId);
    grid = makeGrid();
    nextGrid = makeGrid();
    generation = 0;
    draw();
    document.getElementById('cv-state').textContent = 'Inactivo';
    document.getElementById('cv-gen').textContent = '0';
    document.getElementById('cv-alive').textContent = '0';
    document.getElementById('cv-born').textContent = '0';
    document.getElementById('cv-died').textContent = '0';
    document.getElementById('cv-time').textContent = '0.00 ms';
  }

  function placePattern(name) {
    const coords = PATTERNS[name];
    if (!coords) return;
    const offY = Math.floor(ROWS / 2) - 4;
    const offX = Math.floor(COLS / 2) - 10;
    for (const [dy, dx] of coords) {
      const y = offY + dy, x = offX + dx;
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) grid[y][x] = 1;
    }
    draw();
  }

  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX, py = (e.clientY - rect.top) * scaleY;
    const x = Math.floor(px / cellSize), y = Math.floor(py / cellSize);
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null;
    return { x, y };
  }

  function attachEvents() {
    canvas.addEventListener('mousedown', (e) => {
      if (!paused) return;
      const cell = cellFromEvent(e);
      if (!cell) return;
      isDrawing = true;
      drawValue = grid[cell.y][cell.x] ? 0 : 1;
      grid[cell.y][cell.x] = drawValue;
      draw();
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!isDrawing || !paused) return;
      const cell = cellFromEvent(e);
      if (!cell) return;
      grid[cell.y][cell.x] = drawValue;
      draw();
    });
    window.addEventListener('mouseup', () => { isDrawing = false; });

    document.getElementById('cv-run').addEventListener('click', start);
    document.getElementById('cv-pause').addEventListener('click', pause);
    document.getElementById('cv-reset').addEventListener('click', reset);
    document.getElementById('cv-step').addEventListener('click', () => {
      if (!paused) return;
      const t0 = performance.now();
      const stats = stepGeneration();
      draw();
      updateMetrics(performance.now() - t0, stats);
    });
    document.getElementById('cv-random').addEventListener('click', () => {
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) grid[y][x] = Math.random() < 0.25 ? 1 : 0;
      draw();
    });
    document.getElementById('cv-pattern').addEventListener('change', (e) => {
      if (e.target.value === 'none') return;
      placePattern(e.target.value);
      e.target.value = 'none';
    });
  }

  function init() {
    canvas = document.getElementById('cv-canvas');
    ctx = canvas.getContext('2d');
    cellSize = canvas.width / COLS;
    grid = makeGrid();
    nextGrid = makeGrid();
    attachEvents();
    placePattern('glider');
    draw();
  }

  function onActivate() {}

  return { init, onActivate };
})();