/* ==========================================================================
 * MÓDULO 07 — FRACTALES MATEMÁTICOS: CONJUNTO DE MANDELBROT
 * --------------------------------------------------------------------------
 * El conjunto de Mandelbrot es el subconjunto del plano complejo formado
 * por los puntos C para los cuales la sucesión definida por la recurrencia
 *
 *      Z(0) = 0
 *      Z(n+1) = Z(n)² + C
 *
 * permanece acotada (no escapa al infinito) cuando n → ∞. En la práctica,
 * se itera hasta un límite máximo de iteraciones y se considera que un
 * punto "escapa" cuando |Z(n)| > 2 (radio de escape estándar, ya que se
 * demuestra que si |Z| supera 2 en algún punto, diverge inevitablemente).
 *
 * El número de iteraciones necesarias para escapar determina el color del
 * píxel — esto es lo que produce el patrón fractal de bandas de color en
 * el borde del conjunto.
 *
 * Complejidad: O(W · H · maxIter) en el peor caso (los puntos DENTRO del
 * conjunto nunca escapan y consumen las maxIter completas). El zoom no
 * cambia la complejidad asintótica por frame, pero sí exige recalcular
 * TODOS los píxeles desde cero en cada nivel de zoom, ya que no existe
 * forma de reutilizar iteraciones previas al cambiar el rango del plano
 * complejo muestreado.
 * ========================================================================== */

const MandelbrotModule = (() => {
  let canvas, ctx;
  let W, H;
  let centerX = -0.5, centerY = 0, scale = 3; // 'scale' = ancho visible del plano complejo
  let maxIter = 100;
  let isDragging = false;
  let dragStart = null;
  let selectionRect = null;

  // Paleta suave por interpolación (evita el "banding" duro típico de
  // paletas de módulo simple, usando una función seno desfasada por canal).
  function iterToColor(iter, maxIter) {
    if (iter === maxIter) return [8, 10, 16]; // dentro del conjunto: casi negro
    const t = iter / maxIter;
    const r = Math.floor(9 + 200 * Math.pow(t, 0.35));
    const g = Math.floor(20 + 180 * Math.pow(t, 0.6));
    const b = Math.floor(40 + 215 * (1 - Math.pow(1 - t, 2)));
    return [Math.min(r,255), Math.min(g,255), Math.min(b,255)];
  }

  function render() {
    const t0 = performance.now();
    const img = ctx.createImageData(W, H);
    const data = img.data;

    const aspect = W / H;
    const rangeX = scale, rangeY = scale / aspect;
    const xMin = centerX - rangeX / 2, xMax = centerX + rangeX / 2;
    const yMin = centerY - rangeY / 2, yMax = centerY + rangeY / 2;

    let pixelsInSet = 0;

    for (let py = 0; py < H; py++) {
      const cy = yMin + (py / H) * (yMax - yMin);
      for (let px = 0; px < W; px++) {
        const cx = xMin + (px / W) * (xMax - xMin);

        // Iteración Z = Z² + C con aritmética compleja expandida a
        // componentes reales (zr, zi) para evitar overhead de objetos.
        let zr = 0, zi = 0, iter = 0;
        while (zr * zr + zi * zi <= 4 && iter < maxIter) {
          const zrNew = zr * zr - zi * zi + cx;
          zi = 2 * zr * zi + cy;
          zr = zrNew;
          iter++;
        }
        if (iter === maxIter) pixelsInSet++;

        const [r, g, b] = iterToColor(iter, maxIter);
        const idx = (py * W + px) * 4;
        data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const elapsed = performance.now() - t0;
    document.getElementById('mb-time').textContent = elapsed.toFixed(2) + ' ms';
    document.getElementById('mb-iter').textContent = maxIter;
    document.getElementById('mb-zoom').textContent = (3 / scale).toFixed(1) + '×';
    document.getElementById('mb-inset').textContent = pixelsInSet;
    document.getElementById('mb-state').textContent = 'Renderizado';
  }

  function screenToComplex(px, py) {
    const aspect = W / H;
    const rangeX = scale, rangeY = scale / aspect;
    const xMin = centerX - rangeX / 2, yMin = centerY - rangeY / 2;
    return {
      x: xMin + (px / W) * rangeX,
      y: yMin + (py / H) * rangeY,
    };
  }

  function zoomTo(px1, py1, px2, py2) {
    const c1 = screenToComplex(px1, py1);
    const c2 = screenToComplex(px2, py2);
    centerX = (c1.x + c2.x) / 2;
    centerY = (c1.y + c2.y) / 2;
    const newRangeX = Math.abs(c2.x - c1.x);
    scale = Math.max(newRangeX, 1e-13); // límite de precisión de punto flotante
    // Aumenta iteraciones progresivamente al hacer zoom, para revelar más
    // detalle fino donde la escala lo justifica.
    maxIter = Math.min(1000, Math.floor(100 + Math.log2(3 / scale) * 40));
    render();
  }

  function canvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function drawSelection() {
    render();
    if (!selectionRect) return;
    ctx.strokeStyle = '#39ff9c';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
  }

  function attachEvents() {
    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStart = canvasCoords(e);
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const cur = canvasCoords(e);
      // Selección cuadrada centrada en el arrastre, respetando el aspecto.
      const side = Math.max(Math.abs(cur.x - dragStart.x), Math.abs(cur.y - dragStart.y));
      const x = dragStart.x < cur.x ? dragStart.x : dragStart.x - side;
      const y = dragStart.y < cur.y ? dragStart.y : dragStart.y - side;
      selectionRect = { x, y, w: side, h: side };
      drawSelection();
    });
    window.addEventListener('mouseup', (e) => {
      if (!isDragging) return;
      isDragging = false;
      if (selectionRect && selectionRect.w > 6) {
        zoomTo(selectionRect.x, selectionRect.y, selectionRect.x + selectionRect.w, selectionRect.y + selectionRect.h);
      }
      selectionRect = null;
    });
    canvas.addEventListener('dblclick', (e) => {
      const c = canvasCoords(e);
      const pt = screenToComplex(c.x, c.y);
      centerX = pt.x; centerY = pt.y;
      scale = scale / 2.5;
      maxIter = Math.min(1000, Math.floor(100 + Math.log2(3 / scale) * 40));
      render();
    });
    document.getElementById('mb-reset').addEventListener('click', () => {
      centerX = -0.5; centerY = 0; scale = 3; maxIter = 100;
      render();
    });
    document.getElementById('mb-iterations').addEventListener('input', (e) => {
      maxIter = parseInt(e.target.value, 10);
      render();
    });
  }

  function init() {
    canvas = document.getElementById('mb-canvas');
    ctx = canvas.getContext('2d');
    W = canvas.width; H = canvas.height;
    attachEvents();
    render();
  }

  function onActivate() {}

  return { init, onActivate };
})();