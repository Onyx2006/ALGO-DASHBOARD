/* ==========================================================================
 * MÓDULO 03 — COMPORTAMIENTO DE BANDADAS (BOIDS, Craig Reynolds, 1986)
 * --------------------------------------------------------------------------
 * Sistema emergente: no hay un controlador central. Cada agente ("boid")
 * calcula, en cada frame, un vector de aceleración resultante de sumar
 * tres fuerzas vectoriales locales:
 *
 *   1) SEPARACIÓN: vector opuesto a los vecinos demasiado cercanos,
 *      ponderado por 1/distancia (repulsión inversamente proporcional).
 *   2) ALINEACIÓN: promedio de las velocidades de los vecinos en el
 *      radio de percepción (el boid tiende a igualar la velocidad local).
 *   3) COHESIÓN: vector hacia el centro de masa de los vecinos locales
 *      (el boid tiende a acercarse al grupo).
 *
 * Además: evasión de un "depredador" controlado por el ratón (fuerza de
 * repulsión de alta prioridad).
 *
 * Complejidad: cada boid inspecciona a todos los demás -> O(n²) por frame
 * (sin particionado espacial, elección deliberada y documentada en el
 * README para mantener el código pedagógico y legible).
 * ========================================================================== */

const BoidsModule = (() => {
  let canvas, ctx;
  let boids = [];
  let predator = null;
  let running = false, paused = false;
  let rafId = null;
  let lastFrameTime = performance.now();
  let fpsAccum = 0, fpsFrames = 0, fpsDisplay = 0;

  const PERCEPTION_RADIUS = 55;
  const SEPARATION_RADIUS = 24;
  const WEIGHTS = { separation: 1.5, alignment: 1.0, cohesion: 1.0, predator: 3.0 };

  class Vector2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    add(v) { this.x += v.x; this.y += v.y; return this; }
    sub(v) { return new Vector2(this.x - v.x, this.y - v.y); }
    mul(s) { return new Vector2(this.x * s, this.y * s); }
    mag() { return Math.hypot(this.x, this.y); }
    normalize() { const m = this.mag(); return m > 0 ? new Vector2(this.x / m, this.y / m) : new Vector2(); }
    limit(max) { const m = this.mag(); if (m > max) return this.normalize().mul(max); return this; }
    setMag(m) { return this.normalize().mul(m); }
  }

  class Boid {
    constructor(x, y) {
      this.pos = new Vector2(x, y);
      const angle = Math.random() * Math.PI * 2;
      this.vel = new Vector2(Math.cos(angle), Math.sin(angle)).mul(2);
      this.acc = new Vector2();
      this.maxSpeed = 4;
      this.maxForce = 0.18;
    }

    // Regla 1: Separación
    separation(neighbors) {
      const steer = new Vector2();
      let count = 0;
      for (const other of neighbors) {
        const d = this.pos.sub(other.pos);
        const dist = d.mag();
        if (dist > 0 && dist < SEPARATION_RADIUS) {
          steer.add(d.normalize().mul(1 / dist)); // repulsión inversa a la distancia
          count++;
        }
      }
      if (count > 0) steer.x /= count, steer.y /= count;
      if (steer.mag() > 0) {
        return steer.setMag(this.maxSpeed).sub(this.vel).limit(this.maxForce);
      }
      return steer;
    }

    // Regla 2: Alineación
    alignment(neighbors) {
      const avgVel = new Vector2();
      if (neighbors.length === 0) return avgVel;
      for (const other of neighbors) avgVel.add(other.vel);
      avgVel.x /= neighbors.length; avgVel.y /= neighbors.length;
      return avgVel.setMag(this.maxSpeed).sub(this.vel).limit(this.maxForce);
    }

    // Regla 3: Cohesión
    cohesion(neighbors) {
      const center = new Vector2();
      if (neighbors.length === 0) return center;
      for (const other of neighbors) center.add(other.pos);
      center.x /= neighbors.length; center.y /= neighbors.length;
      const desired = center.sub(this.pos);
      if (desired.mag() === 0) return desired;
      return desired.setMag(this.maxSpeed).sub(this.vel).limit(this.maxForce);
    }

    // Evasión del depredador
    evade() {
      if (!predator) return new Vector2();
      const d = this.pos.sub(predator);
      const dist = d.mag();
      if (dist < 120 && dist > 0) {
        return d.normalize().mul((120 - dist) / 120).setMag(this.maxForce * 4);
      }
      return new Vector2();
    }

    flock(all) {
      const neighbors = [];
      for (const other of all) {
        if (other === this) continue;
        if (this.pos.sub(other.pos).mag() < PERCEPTION_RADIUS) neighbors.push(other);
      }
      const sep = this.separation(neighbors).mul(WEIGHTS.separation);
      const ali = this.alignment(neighbors).mul(WEIGHTS.alignment);
      const coh = this.cohesion(neighbors).mul(WEIGHTS.cohesion);
      const eva = this.evade().mul(WEIGHTS.predator);
      this.acc = new Vector2();
      this.acc.add(sep).add(ali).add(coh).add(eva);
      return neighbors.length;
    }

    update(maxSpeed) {
      this.maxSpeed = maxSpeed;
      this.vel.add(this.acc);
      this.vel = this.vel.limit(this.maxSpeed);
      this.pos.add(this.vel);
      this.wrapEdges();
    }

    wrapEdges() {
      const w = canvas.width, h = canvas.height;
      if (this.pos.x < 0) this.pos.x = w;
      if (this.pos.x > w) this.pos.x = 0;
      if (this.pos.y < 0) this.pos.y = h;
      if (this.pos.y > h) this.pos.y = 0;
    }

    draw() {
      const angle = Math.atan2(this.vel.y, this.vel.x);
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-6, 4);
      ctx.lineTo(-6, -4);
      ctx.closePath();
      ctx.fillStyle = '#4d9fff';
      ctx.fill();
      ctx.restore();
    }
  }

  function spawn(count) {
    boids = [];
    for (let i = 0; i < count; i++) {
      boids.push(new Boid(Math.random() * canvas.width, Math.random() * canvas.height));
    }
  }

  function frame() {
    if (!running || paused) return;
    const t0 = performance.now();

    ctx.fillStyle = 'rgba(10,14,20,1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const maxSpeed = parseInt(document.getElementById('bd-speed').value, 10);
    let totalForces = 0;
    for (const b of boids) totalForces += b.flock(boids);
    for (const b of boids) { b.update(maxSpeed); b.draw(); }

    if (predator) {
      ctx.beginPath();
      ctx.arc(predator.x, predator.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5c7a';
      ctx.shadowColor = '#ff5c7a';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    const elapsed = performance.now() - t0;
    const now = performance.now();
    fpsAccum += now - lastFrameTime; fpsFrames++;
    lastFrameTime = now;
    if (fpsAccum > 500) { fpsDisplay = Math.round(1000 / (fpsAccum / fpsFrames)); fpsAccum = 0; fpsFrames = 0; }

    document.getElementById('bd-time').textContent = elapsed.toFixed(2) + ' ms';
    document.getElementById('bd-agents').textContent = boids.length;
    document.getElementById('bd-forces').textContent = totalForces;
    document.getElementById('bd-fps').textContent = fpsDisplay;
    document.getElementById('bd-state').textContent = 'Ejecutando';

    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (boids.length === 0) spawn(parseInt(document.getElementById('bd-count').value, 10));
    running = true; paused = false;
    lastFrameTime = performance.now();
    frame();
  }
  function pause() { paused = true; document.getElementById('bd-state').textContent = 'Pausado'; }
  function reset() {
    running = false; paused = false;
    cancelAnimationFrame(rafId);
    predator = null;
    spawn(parseInt(document.getElementById('bd-count').value, 10));
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    boids.forEach(b => b.draw());
    document.getElementById('bd-state').textContent = 'Inactivo';
  }

  function attachEvents() {
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
      predator = new Vector2((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
    });
    canvas.addEventListener('mouseleave', () => { predator = null; });

    document.getElementById('bd-run').addEventListener('click', start);
    document.getElementById('bd-pause').addEventListener('click', pause);
    document.getElementById('bd-reset').addEventListener('click', reset);
    document.getElementById('bd-count').addEventListener('change', () => {
      if (!running) spawn(parseInt(document.getElementById('bd-count').value, 10));
    });
  }

  function init() {
    canvas = document.getElementById('bd-canvas');
    ctx = canvas.getContext('2d');
    spawn(parseInt(document.getElementById('bd-count').value, 10));
    attachEvents();
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    boids.forEach(b => b.draw());
  }

  function onActivate() {}

  return { init, onActivate };
})();