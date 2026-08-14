/* ==========================================================================
 * MAIN — bootstrapping de la SPA, navegación entre módulos y medidor de
 * FPS global. Cada módulo se inicializa una única vez (init) y expone
 * un hook onActivate() por si necesita recalcular tamaños de canvas o
 * reanudar estado al cambiar de pestaña. Los módulos que corren su propio
 * requestAnimationFrame gestionan su ciclo de vida internamente (start/
 * pause/reset), por lo que cambiar de pestaña NO detiene una simulación
 * en curso salvo que el usuario la pause explícitamente — esto es
 * intencional: permite, por ejemplo, ver el laberinto generándose en
 * segundo plano mientras se inspecciona otro módulo.
 * ========================================================================== */

(function bootstrap() {
  const modules = {
    pathfinding: PathfindingModule,
    snake: SnakeModule,
    boids: BoidsModule,
    voronoi: VoronoiModule,
    conway: ConwayModule,
    sorting: SortModule,
    mandelbrot: MandelbrotModule,
  };

  function switchTo(name) {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.module === name);
    });
    document.querySelectorAll('.module').forEach(sec => {
      sec.classList.toggle('active', sec.id === `module-${name}`);
    });
    if (modules[name] && modules[name].onActivate) modules[name].onActivate();
  }

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTo(btn.dataset.module));
  });

  // --------------------------------------------------------------------
  // Medidor de FPS global (independiente de los módulos): usa una media
  // móvil simple sobre requestAnimationFrame para evitar parpadeo del
  // número en pantalla.
  // --------------------------------------------------------------------
  let lastTime = performance.now();
  let frames = 0;
  let acc = 0;
  function fpsLoop(now) {
    frames++;
    acc += now - lastTime;
    lastTime = now;
    if (acc >= 500) {
      const fps = Math.round((frames * 1000) / acc);
      document.getElementById('global-fps').textContent = `${fps} FPS`;
      frames = 0; acc = 0;
    }
    requestAnimationFrame(fpsLoop);
  }
  requestAnimationFrame(fpsLoop);

  // --------------------------------------------------------------------
  // Inicialización de todos los módulos al cargar la página.
  // --------------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    PathfindingModule.init();
    SnakeModule.init();
    BoidsModule.init();
    VoronoiModule.init();
    ConwayModule.init();
    SortModule.init();
    MandelbrotModule.init();
  });
})();
