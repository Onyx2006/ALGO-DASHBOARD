/* ==========================================================================
 * MÓDULO 04 — GEOMETRÍA COMPUTACIONAL: DIAGRAMAS DE VORONOI
 * --------------------------------------------------------------------------
 * Dado un conjunto de "semillas" P = {p1..pn} en el plano, la celda de
 * Voronoi de pi es el conjunto de puntos del plano más cercanos a pi
 * (distancia euclídea) que a cualquier otra semilla:
 *
 *      V(pi) = { x ∈ R² : d(x, pi) ≤ d(x, pj) ∀ j ≠ i }
 *
 * Implementación: enfoque RASTER por fuerza bruta (no Fortune's sweep-line,
 * que sería O(n log n) pero mucho más complejo de implementar y explicar).
 * Se recorre la rejilla de píxeles a la resolución elegida y para cada
 * celda se calcula la semilla más cercana probando todas las semillas.
 *
 * Complejidad: O(W · H · n / r²) donde r es el factor de resolución
 * (tamaño de bloque de píxeles muestreado), W×H la resolución del canvas
 * y n el número de semillas. Es la implementación menos eficiente
 * asintóticamente de las cuatro del dashboard, pero la más directa de
 * razonar matemáticamente (álgebra lineal pura: distancia euclídea al
 * cuadrado, sin raíz cuadrada para ahorrar cómputo — la comparación de
 * distancias no requiere normalizar).
 * ========================================================================== */

const VoronoiModule = (() => {
  let canvas, ctx;
  let seeds = [];
  const PALETTE = [
    '#4d9fff', '#39ff9c', '#ffb454', '#ff5c7a', '#b388ff',
    '#40e0d0', '#ff8a65', '#7cd992', '#5c9eff', '#f06292',
  ];
  let mode = 'pixel';
  let resolution = 3;
  let rafId = null;
  let followActive = false;
  let mouseSeed = null;

  function squaredDist(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy; // se evita sqrt: innecesaria para comparar distancias
  }

  function nearestSeedIndex(x, y, seedList) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < seedList.length; i++) {
      const d = squaredDist(x, y, seedList[i].x, seedList[i].y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function render() {
    const t0 = performance.now();
    const activeSeeds = mode === 'follow' && mouseSeed ? [...seeds, mouseSeed] : seeds;

    if (activeSeeds.length === 0) {
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      updateMetrics(0, 0, 0);
      return;
    }

    const w = canvas.width, h = canvas.height;
    const img = ctx.createImageData(w, h);
    let cellsComputed = 0;

    for (let y = 0; y < h; y += resolution) {
      for (let x = 0; x < w; x += resolution) {
        const idx = nearestSeedIndex(x, y, activeSeeds);
        cellsComputed++;
        const hex = PALETTE[idx % PALETTE.length];
        const [r, g, b] = hexToRgb(hex);
        for (let by = 0; by < resolution && y + by < h; by++) {
          for (let bx = 0; bx < resolution && x + bx < w; bx++) {
            const p = ((y + by) * w + (x + bx)) * 4;
            img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = 60;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    // Bordes de celda (aprox.): resaltar transiciones de región
    drawSeeds(activeSeeds);

    const elapsed = performance.now() - t0;
    updateMetrics(elapsed, activeSeeds.length, cellsComputed);
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function drawSeeds(activeSeeds) {
    for (const s of activeSeeds) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#e7edf5';
      ctx.fill();
      ctx.strokeStyle = '#0a0e14';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function updateMetrics(elapsed, seedCount, cells) {
    document.getElementById('vr-time').textContent = elapsed.toFixed(2) + ' ms';
    document.getElementById('vr-seeds').textContent = seedCount;
    document.getElementById('vr-cells').textContent = cells;
    document.getElementById('vr-state').textContent = seedCount > 0 ? 'Renderizado' : 'Inactivo';
  }

  function loopFollow() {
    if (!followActive) return;
    render();
    rafId = requestAnimationFrame(loopFollow);
  }

  function attachEvents() {
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      seeds.push({ x, y });
      render();
    });
    canvas.addEventListener('mousemove', (e) => {
      if (mode !== 'follow') return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
      mouseSeed = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    });

    document.getElementById('vr-add').addEventListener('click', () => {
      for (let i = 0; i < 5; i++) {
        seeds.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height });
      }
      render();
    });
    document.getElementById('vr-clear').addEventListener('click', () => {
      seeds = [];
      cancelAnimationFrame(rafId);
      followActive = false;
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      updateMetrics(0, 0, 0);
    });
    document.getElementById('vr-mode').addEventListener('change', (e) => {
      mode = e.target.value;
      cancelAnimationFrame(rafId);
      followActive = false;
      if (mode === 'follow') { followActive = true; loopFollow(); }
      else render();
    });
    document.getElementById('vr-res').addEventListener('change', (e) => {
      resolution = parseInt(e.target.value, 10);
      if (!followActive) render();
    });
  }

  function init() {
    canvas = document.getElementById('vr-canvas');
    ctx = canvas.getContext('2d');
    attachEvents();
    // Semillas iniciales de ejemplo
    for (let i = 0; i < 8; i++) {
      seeds.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height });
    }
    render();
  }

  function onActivate() {}

  return { init, onActivate };
})();