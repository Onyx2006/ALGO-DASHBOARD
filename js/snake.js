/* ==========================================================================
 * MÓDULO 02 — AGENTES AUTÓNOMOS: SNAKE
 * --------------------------------------------------------------------------
 * Dos motores de decisión intercambiables, mismo tablero y mismas reglas:
 *
 *  (A) MOTOR A* — reutiliza el mismo principio de búsqueda informada del
 *      módulo 01: en cada frame se recalcula el camino óptimo hacia la
 *      manzana tratando el cuerpo de la serpiente como muro dinámico.
 *      Complejidad por frame: O(E log V) sobre una rejilla N x N.
 *
 *  (B) MOTOR EVOLUTIVO — población de NeuralNetwork (perceptrón 8-12-4).
 *      Cada individuo juega una partida completa; su "fitness" combina
 *      manzanas comidas y pasos de supervivencia. Al terminar la
 *      generación se aplica selección por torneo + elitismo, cruzamiento
 *      uniforme y mutación gaussiana para producir la siguiente
 *      generación (algoritmo genético clásico, ver neuralnet.js).
 * ========================================================================== */

const SnakeModule = (() => {
  const GRID = 20;
  let cellSize;
  let canvas, ctx, nnCanvas, nnCtx;

  let mode = 'astar';
  let running = false;
  let paused = false;
  let tickHandle = null;

  // estado compartido de una partida
  let snake, dir, apple, score, steps, stepsSinceApple;

  // estado del algoritmo genético
  const POP_SIZE = 150;
  const MUTATION_RATE = 0.08;
  const ELITE_FRACTION = 0.10;
  let population = [];
  let genIndex = 0;
  let currentIndividual = 0;
  let bestFitnessEver = 0;

  function resetGame() {
    const mid = Math.floor(GRID / 2);
    snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
    dir = { x: 1, y: 0 };
    score = 0;
    steps = 0;
    stepsSinceApple = 0;
    placeApple();
  }

  function placeApple() {
    let pos;
    do {
      pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (snake.some(s => s.x === pos.x && s.y === pos.y));
    apple = pos;
  }

  // MOTOR A*: adapta el pathfinding del módulo 01 a un grafo GRID x GRID
  // donde los "muros" son las celdas ocupadas por el propio cuerpo.
  function astarNextDirection() {
    const key = (x, y) => y * GRID + x;
    const blocked = new Set(snake.slice(0, -1).map(s => key(s.x, s.y))); // la cola se libera al moverse
    const startNode = { x: snake[0].x, y: snake[0].y };

    const gScore = new Map([[key(startNode.x, startNode.y), 0]]);
    const fScore = new Map([[key(startNode.x, startNode.y), manhattan(startNode, apple)]]);
    const parent = new Map();
    const open = [startNode];
    const openKeys = new Set([key(startNode.x, startNode.y)]);
    const closed = new Set();

    while (open.length > 0) {
      // extracción del mínimo f (heap simplificado: array + búsqueda lineal,
      // suficiente para GRID=20 -> máx 400 nodos por frame)
      let bi = 0;
      for (let i = 1; i < open.length; i++) {
        if (fScore.get(key(open[i].x, open[i].y)) < fScore.get(key(open[bi].x, open[bi].y))) bi = i;
      }
      const current = open.splice(bi, 1)[0];
      const ck = key(current.x, current.y);
      openKeys.delete(ck);
      closed.add(ck);

      if (current.x === apple.x && current.y === apple.y) {
        // reconstruir primer paso del camino
        let cur = current, prev = null;
        while (parent.has(key(cur.x, cur.y))) {
          prev = cur;
          cur = parent.get(key(cur.x, cur.y));
        }
        if (!prev) return null;
        return { x: prev.x - cur.x, y: prev.y - cur.y };
      }

      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of dirs) {
        const nx = current.x + dx, ny = current.y + dy;
        if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
        const nk = key(nx, ny);
        if (blocked.has(nk) || closed.has(nk)) continue;
        const tentativeG = gScore.get(ck) + 1;
        if (!gScore.has(nk) || tentativeG < gScore.get(nk)) {
          gScore.set(nk, tentativeG);
          fScore.set(nk, tentativeG + manhattan({ x: nx, y: ny }, apple));
          parent.set(nk, current);
          if (!openKeys.has(nk)) { open.push({ x: nx, y: ny }); openKeys.add(nk); }
        }
      }
    }
    return null; // sin camino: se aplicará movimiento de supervivencia
  }

  function manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  function safeFallbackDirection() {
    // Si A* no encuentra camino a la manzana (encierro), busca cualquier
    // movimiento válido que no choque, priorizando maximizar espacio libre.
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    const head = snake[0];
    const body = new Set(snake.slice(0, -1).map(s => `${s.x},${s.y}`));
    let best = null, bestScore = -1;
    for (const d of dirs) {
      const nx = head.x + d.x, ny = head.y + d.y;
      if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
      if (body.has(`${nx},${ny}`)) continue;
      const openSpace = floodFillCount(nx, ny, body);
      if (openSpace > bestScore) { bestScore = openSpace; best = d; }
    }
    return best;
  }

  function floodFillCount(sx, sy, blockedSet) {
    const seen = new Set([`${sx},${sy}`]);
    const stack = [[sx, sy]];
    let count = 0;
    while (stack.length && count < 60) { // límite para mantener O(1) acotado por frame
      const [x, y] = stack.pop();
      count++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
        if (blockedSet.has(k) || seen.has(k)) continue;
        seen.add(k);
        stack.push([nx, ny]);
      }
    }
    return count;
  }

  // MOTOR EVOLUTIVO: sensores raycast + forward pass de la red.
  function computeSensors() {
    // 8 direcciones (N, NE, E, SE, S, SW, W, NW). Por cada una: distancia
    // normalizada al muro más cercano en esa línea de visión.
    const head = snake[0];
    const dirs = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
    const body = new Set(snake.map(s => `${s.x},${s.y}`));
    const sensors = new Float32Array(8);
    for (let i = 0; i < dirs.length; i++) {
      const [dx, dy] = dirs[i];
      let dist = 0, x = head.x, y = head.y;
      let hit = 0;
      while (true) {
        x += dx; y += dy; dist++;
        if (x < 0 || x >= GRID || y < 0 || y >= GRID) { hit = 1; break; }
        if (body.has(`${x},${y}`)) { hit = 1; break; }
        if (x === apple.x && y === apple.y) { hit = -1; break; } // señal atractiva
      }
      sensors[i] = hit === -1 ? 1.0 : 1 / dist; // normalizado en (0,1]
    }
    return sensors;
  }

  const DIRS4 = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

  function geneticNextDirection(brain) {
    const sensors = computeSensors();
    brain.forward(sensors);
    const idx = brain.argmaxDirection();
    return DIRS4[idx];
  }

  // ALGORITMO GENÉTICO: inicialización, fitness, selección, evolución.
  function initPopulation() {
    population = [];
    for (let i = 0; i < POP_SIZE; i++) {
      population.push({ brain: new NeuralNetwork(8, 12, 4), fitness: 0 });
    }
    genIndex = 1;
    currentIndividual = 0;
  }

  function tournamentSelect(pool, k = 5) {
    let best = null;
    for (let i = 0; i < k; i++) {
      const c = pool[Math.floor(Math.random() * pool.length)];
      if (!best || c.fitness > best.fitness) best = c;
    }
    return best;
  }

  function evolvePopulation() {
    const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
    bestFitnessEver = Math.max(bestFitnessEver, sorted[0].fitness);
    const eliteCount = Math.max(2, Math.floor(POP_SIZE * ELITE_FRACTION));
    const nextGen = [];

    // Elitismo: los mejores pasan intactos (preservan el óptimo hallado).
    for (let i = 0; i < eliteCount; i++) {
      nextGen.push({ brain: sorted[i].brain.clone(), fitness: 0 });
    }
    // Resto de la población: cruzamiento + mutación por selección de torneo.
    while (nextGen.length < POP_SIZE) {
      const parentA = tournamentSelect(sorted);
      const parentB = tournamentSelect(sorted);
      const child = NeuralNetwork.crossover(parentA.brain, parentB.brain);
      child.mutate(MUTATION_RATE);
      nextGen.push({ brain: child, fitness: 0 });
    }
    population = nextGen;
    genIndex++;
    currentIndividual = 0;
  }

  // BUCLE PRINCIPAL
  function stepAstar() {
    let nd = astarNextDirection();
    if (!nd) nd = safeFallbackDirection();
    if (!nd) { endGame(); return; }
    advance(nd);
  }

  let currentBrain = null;

  function stepGenetic() {
    if (!currentBrain) startNextIndividual();
    const nd = geneticNextDirection(currentBrain);
    advance(nd, true);
  }

  function startNextIndividual() {
    if (currentIndividual >= population.length) evolvePopulation();
    currentBrain = population[currentIndividual].brain;
    resetGame();
  }

  function advance(direction, genetic = false) {
    dir = direction;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    steps++; stepsSinceApple++;

    const outOfBounds = head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID;
    const selfCollision = snake.some(s => s.x === head.x && s.y === head.y);
    const starved = stepsSinceApple > GRID * GRID * 2;

    if (outOfBounds || selfCollision || starved) {
      if (genetic) {
        population[currentIndividual].fitness = fitnessFn(score, steps);
        currentIndividual++;
        currentBrain = null;
      } else {
        endGame();
      }
      return;
    }

    snake.unshift(head);
    if (head.x === apple.x && head.y === apple.y) {
      score++; stepsSinceApple = 0;
      placeApple();
    } else {
      snake.pop();
    }
  }

  // Fitness: prioriza manzanas comidas exponencialmente sobre la
  // supervivencia bruta, para evitar que la población converja a
  // "dar vueltas sin comer" (óptimo local clásico en este problema).
  function fitnessFn(score, steps) {
    return steps + (Math.pow(2, score) + Math.pow(score, 2.1) * 500) - Math.pow(score, 1.2) * Math.pow(0.25 * steps, 1.3);
  }

  function endGame() {
    document.getElementById('sn-state').textContent = 'Terminado';
    running = false;
    clearTimeout(tickHandle);
  }

  // RENDER
  function draw() {
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ff5c7a';
    ctx.fillRect(apple.x * cellSize, apple.y * cellSize, cellSize - 1, cellSize - 1);

    snake.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#39ff9c' : '#1f8f5c';
      ctx.fillRect(seg.x * cellSize, seg.y * cellSize, cellSize - 1, cellSize - 1);
    });
  }

  function drawNeuralNet(sensors) {
    if (!nnCtx) return;
    const w = nnCanvas.width, h = nnCanvas.height;
    nnCtx.fillStyle = '#0a0e14';
    nnCtx.fillRect(0, 0, w, h);

    const layers = [8, 12, 4];
    const xs = [50, w / 2, w - 50];
    const positions = layers.map((n, li) => {
      const arr = [];
      const gap = (h - 40) / (n - 1 || 1);
      for (let i = 0; i < n; i++) arr.push({ x: xs[li], y: 20 + i * gap });
      return arr;
    });

    const brain = mode === 'genetic' ? currentBrain : null;

    // conexiones capa 0 -> 1
    nnCtx.lineWidth = 1;
    for (let i = 0; i < positions[0].length; i++) {
      for (let j = 0; j < positions[1].length; j++) {
        const wgt = brain ? brain.W1[j * 8 + i] : 0;
        nnCtx.strokeStyle = wgt > 0 ? `rgba(77,159,255,${Math.min(Math.abs(wgt), 0.9)})` : `rgba(255,92,122,${Math.min(Math.abs(wgt), 0.9)})`;
        nnCtx.beginPath();
        nnCtx.moveTo(positions[0][i].x, positions[0][i].y);
        nnCtx.lineTo(positions[1][j].x, positions[1][j].y);
        nnCtx.stroke();
      }
    }
    // conexiones capa 1 -> 2
    for (let i = 0; i < positions[1].length; i++) {
      for (let j = 0; j < positions[2].length; j++) {
        const wgt = brain ? brain.W2[j * 12 + i] : 0;
        nnCtx.strokeStyle = wgt > 0 ? `rgba(77,159,255,${Math.min(Math.abs(wgt), 0.9)})` : `rgba(255,92,122,${Math.min(Math.abs(wgt), 0.9)})`;
        nnCtx.beginPath();
        nnCtx.moveTo(positions[1][i].x, positions[1][i].y);
        nnCtx.lineTo(positions[2][j].x, positions[2][j].y);
        nnCtx.stroke();
      }
    }

    // nodos
    const labels = ['↑','↓','←','→'];
    for (let li = 0; li < positions.length; li++) {
      for (let i = 0; i < positions[li].length; i++) {
        const p = positions[li][i];
        let activation = 0.5;
        if (li === 0 && sensors) activation = sensors[i];
        if (li === 1 && brain) activation = (brain.lastHidden[i] + 1) / 2;
        if (li === 2 && brain) activation = (brain.lastOutput[i] + 1) / 2;
        nnCtx.beginPath();
        nnCtx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        nnCtx.fillStyle = `rgba(57,255,156,${0.25 + activation * 0.75})`;
        nnCtx.fill();
        nnCtx.strokeStyle = '#26303f';
        nnCtx.stroke();
        if (li === 2) {
          nnCtx.fillStyle = '#e7edf5';
          nnCtx.font = '11px JetBrains Mono';
          nnCtx.fillText(labels[i], p.x + 14, p.y + 4);
        }
      }
    }
    nnCtx.fillStyle = '#5b6b80';
    nnCtx.font = '10px JetBrains Mono';
    nnCtx.fillText('input (8)', xs[0] - 22, h - 6);
    nnCtx.fillText('oculta (12)', xs[1] - 30, h - 6);
    nnCtx.fillText('salida (4)', xs[2] - 26, h - 6);
  }

  // LOOP DE TICKS
  function loop() {
    if (!running || paused) return;
    const t0 = performance.now();

    if (mode === 'astar') stepAstar();
    else stepGenetic();

    const elapsed = performance.now() - t0;
    draw();
    if (mode === 'genetic') drawNeuralNet(computeSensorsSafe());
    updateMetrics(elapsed);

    const speed = parseInt(document.getElementById('sn-speed').value, 10);
    const delay = Math.max(1000 / (speed * 6), 8);
    tickHandle = setTimeout(() => requestAnimationFrame(loop), delay);
  }

  function computeSensorsSafe() {
    try { return computeSensors(); } catch (e) { return null; }
  }

  function updateMetrics(elapsed) {
    document.getElementById('sn-time').textContent = elapsed.toFixed(2) + ' ms';
    document.getElementById('sn-score').textContent = score;
    document.getElementById('sn-state').textContent = 'Ejecutando';
    if (mode === 'genetic') {
      document.getElementById('sn-gen').textContent = genIndex;
      document.getElementById('sn-fitness').textContent = Math.round(bestFitnessEver);
      document.getElementById('sn-alive').textContent = `${population.length - currentIndividual}/${population.length}`;
    } else {
      document.getElementById('sn-gen').textContent = '—';
      document.getElementById('sn-fitness').textContent = '—';
      document.getElementById('sn-alive').textContent = '—';
    }
  }

  function start() {
    if (running) { paused = false; loop(); return; }
    mode = document.getElementById('sn-mode').value;
    running = true; paused = false;
    if (mode === 'genetic') {
      initPopulation();
      startNextIndividual();
    } else {
      resetGame();
    }
    loop();
  }

  function pause() { paused = true; document.getElementById('sn-state').textContent = 'Pausado'; }

  function reset() {
    running = false; paused = false;
    clearTimeout(tickHandle);
    resetGame();
    currentBrain = null;
    population = [];
    genIndex = 0; currentIndividual = 0; bestFitnessEver = 0;
    draw();
    document.getElementById('sn-state').textContent = 'Inactivo';
    document.getElementById('sn-gen').textContent = '—';
    document.getElementById('sn-fitness').textContent = '—';
    document.getElementById('sn-alive').textContent = '—';
  }

  function init() {
    canvas = document.getElementById('sn-canvas');
    ctx = canvas.getContext('2d');
    cellSize = canvas.width / GRID;
    nnCanvas = document.getElementById('nn-canvas');
    nnCtx = nnCanvas.getContext('2d');

    resetGame();
    draw();
    drawNeuralNet(null);

    document.getElementById('sn-run').addEventListener('click', start);
    document.getElementById('sn-pause').addEventListener('click', pause);
    document.getElementById('sn-reset').addEventListener('click', reset);
    document.getElementById('sn-mode').addEventListener('change', reset);
  }

  function onActivate() {}

  return { init, onActivate };
})();