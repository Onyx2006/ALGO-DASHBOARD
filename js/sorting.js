/* ==========================================================================
 * MÓDULO 06 — VISUALIZADOR DE ORDENAMIENTO CON BANDA SONORA
 * --------------------------------------------------------------------------
 * Tres algoritmos de ordenamiento clásicos implementados como generadores
 * ES6 que emiten (yield) un "evento" por cada comparación o intercambio
 * relevante. El bucle de animación consume estos eventos a un ritmo
 * configurable, actualizando tanto el canvas (barras) como un oscilador
 * de la Web Audio API cuya frecuencia es proporcional a la altura del
 * valor comparado/movido — así cada algoritmo "suena" distinto según su
 * patrón de acceso a memoria.
 *
 *   - BUBBLE SORT:  compara adyacentes repetidamente. O(n²) tiempo, O(1) espacio.
 *   - QUICKSORT:    particiona en torno a un pivote. O(n log n) medio,
 *                   O(n²) peor caso, O(log n) espacio (pila de recursión).
 *   - MERGE SORT:   divide y vencerás con fusión. O(n log n) tiempo
 *                   garantizado, O(n) espacio (arrays auxiliares).
 * ========================================================================== */

const SortModule = (() => {
  const BAR_COUNT = 70;
  let canvas, ctx;
  let array = [];
  let running = false, paused = false;
  let genInstance = null;
  let audioCtx = null;
  let oscillator = null;
  let gainNode = null;
  let comparisons = 0, swaps = 0;
  let lastStepTime = 0;

  function randomArray(n) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(Math.floor(Math.random() * 95) + 5);
    return arr;
  }

  // AUDIO — Web Audio API: un único oscilador sinusoidal reutilizado
  // (no se crea uno nuevo por nota, para evitar fugas de nodos y
  // saturar el grafo de audio). Se modula su frecuencia en tiempo real.
  function ensureAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    oscillator = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();
    oscillator.type = 'sine';
    gainNode.gain.value = 0; // silencio hasta la primera nota
    oscillator.connect(gainNode).connect(audioCtx.destination);
    oscillator.start();
  }

  function playTone(value) {
    if (!audioCtx || document.getElementById('so-mute').checked) return;
    const freq = 120 + (value / 100) * 660; // mapea altura de barra -> frecuencia audible
    const now = audioCtx.currentTime;
    oscillator.frequency.setTargetAtTime(freq, now, 0.01);
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setTargetAtTime(0.06, now, 0.005);
    gainNode.gain.setTargetAtTime(0, now + 0.05, 0.05); // decaimiento corto (evita "pitido" continuo)
  }

  function stopAudio() {
    if (gainNode) gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
  }

  function teardownAudio() {
    if (oscillator) { try { oscillator.stop(); } catch (e) {} oscillator.disconnect(); }
    if (gainNode) gainNode.disconnect();
    if (audioCtx) audioCtx.close();
    audioCtx = null; oscillator = null; gainNode = null;
  }

  // BUBBLE SORT
  function* bubbleSort(arr) {
    const n = arr.length;
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - i - 1; j++) {
        comparisons++;
        yield { type: 'compare', indices: [j, j + 1] };
        if (arr[j] > arr[j + 1]) {
          [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
          swaps++;
          yield { type: 'swap', indices: [j, j + 1] };
        }
      }
    }
    yield { type: 'done' };
  }

  // QUICKSORT (partición Lomuto, in-place)
  function* quickSort(arr, lo = 0, hi = arr.length - 1) {
    if (lo < hi) {
      let pivot = arr[hi], i = lo - 1;
      for (let j = lo; j < hi; j++) {
        comparisons++;
        yield { type: 'compare', indices: [j, hi] };
        if (arr[j] < pivot) {
          i++;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          swaps++;
          yield { type: 'swap', indices: [i, j] };
        }
      }
      [arr[i + 1], arr[hi]] = [arr[hi], arr[i + 1]];
      swaps++;
      yield { type: 'swap', indices: [i + 1, hi] };
      yield* quickSort(arr, lo, i);
      yield* quickSort(arr, i + 2, hi);
    }
    if (lo === 0 && hi === arr.length - 1) yield { type: 'done' };
  }

  // MERGE SORT (bottom-up sobre generador, con array auxiliar)
  function* mergeSort(arr, lo = 0, hi = arr.length - 1) {
    if (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      yield* mergeSort(arr, lo, mid);
      yield* mergeSort(arr, mid + 1, hi);
      yield* merge(arr, lo, mid, hi);
    }
    if (lo === 0 && hi === arr.length - 1) yield { type: 'done' };
  }

  function* merge(arr, lo, mid, hi) {
    const left = arr.slice(lo, mid + 1);
    const right = arr.slice(mid + 1, hi + 1);
    let i = 0, j = 0, k = lo;
    while (i < left.length && j < right.length) {
      comparisons++;
      yield { type: 'compare', indices: [lo + i, mid + 1 + j] };
      if (left[i] <= right[j]) { arr[k] = left[i]; i++; }
      else { arr[k] = right[j]; j++; }
      swaps++;
      yield { type: 'overwrite', indices: [k], value: arr[k] };
      k++;
    }
    while (i < left.length) { arr[k] = left[i]; yield { type: 'overwrite', indices: [k], value: arr[k] }; i++; k++; }
    while (j < right.length) { arr[k] = right[j]; yield { type: 'overwrite', indices: [k], value: arr[k] }; j++; k++; }
  }

  // RENDER
  function draw(highlight = []) {
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, w, h);
    const barWidth = w / array.length;
    for (let i = 0; i < array.length; i++) {
      const val = array[i];
      const barHeight = (val / 100) * (h - 10);
      let color = '#4d9fff';
      if (highlight.includes(i)) color = '#ffb454';
      ctx.fillStyle = color;
      ctx.fillRect(i * barWidth, h - barHeight, barWidth - 2, barHeight);
    }
  }

  function updateMetrics(elapsed) {
    document.getElementById('so-time').textContent = elapsed.toFixed(2) + ' ms';
    document.getElementById('so-comparisons').textContent = comparisons;
    document.getElementById('so-swaps').textContent = swaps;
  }

  function loop(now) {
    if (!running || paused) return;
    const speed = parseInt(document.getElementById('so-speed').value, 10);
    const interval = Math.max(200 / speed, 1);
    if (now - lastStepTime >= interval) {
      const t0 = performance.now();
      const result = genInstance.next();
      if (result.done || (result.value && result.value.type === 'done')) {
        draw([]);
        stopAudio();
        document.getElementById('so-state').textContent = 'Completado';
        running = false;
        return;
      }
      const ev = result.value;
      if (ev.type === 'overwrite') {
        playTone(ev.value);
        draw(ev.indices);
      } else {
        playTone(array[ev.indices[0]]);
        draw(ev.indices);
      }
      updateMetrics(performance.now() - t0);
      lastStepTime = now;
    }
    requestAnimationFrame(loop);
  }

  function start() {
    if (running) { paused = false; requestAnimationFrame(loop); return; }
    ensureAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const algo = document.getElementById('so-algo').value;
    comparisons = 0; swaps = 0;
    document.getElementById('so-state').textContent = 'Ordenando…';
    genInstance = algo === 'bubble' ? bubbleSort(array)
                : algo === 'quick' ? quickSort(array)
                : mergeSort(array);
    running = true; paused = false;
    lastStepTime = 0;
    requestAnimationFrame(loop);
  }

  function pause() {
    paused = true;
    stopAudio();
    document.getElementById('so-state').textContent = 'Pausado';
  }

  function reset() {
    running = false; paused = false;
    stopAudio();
    array = randomArray(BAR_COUNT);
    comparisons = 0; swaps = 0;
    draw([]);
    document.getElementById('so-state').textContent = 'Inactivo';
    document.getElementById('so-time').textContent = '0.00 ms';
    document.getElementById('so-comparisons').textContent = '0';
    document.getElementById('so-swaps').textContent = '0';
  }

  function attachEvents() {
    document.getElementById('so-run').addEventListener('click', start);
    document.getElementById('so-pause').addEventListener('click', pause);
    document.getElementById('so-reset').addEventListener('click', reset);
    document.getElementById('so-algo').addEventListener('change', () => {
      const algo = document.getElementById('so-algo').value;
      const complexities = {
        bubble: 'O(n²) / O(1) espacio',
        quick: 'O(n log n) medio, O(n²) peor caso',
        merge: 'O(n log n) garantizado, O(n) espacio',
      };
      document.getElementById('so-complexity').textContent = complexities[algo];
    });
  }

  // Libera el AudioContext al abandonar la página para evitar fugas de
  // recursos del sistema (los AudioContext no se recolectan automáticamente).
  window.addEventListener('beforeunload', teardownAudio);

  function init() {
    canvas = document.getElementById('so-canvas');
    ctx = canvas.getContext('2d');
    array = randomArray(BAR_COUNT);
    attachEvents();
    draw([]);
  }

  function onActivate() {}

  return { init, onActivate };
})();