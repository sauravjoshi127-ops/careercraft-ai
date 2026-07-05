/**
 * performance-manager.js
 * Batches DOM mutations and handles requestAnimationFrame visual loop optimizations.
 */
(function () {
  const PerformanceManager = {
    pendingTasks: [],
    frameId: null,

    scheduleUpdate(taskFn) {
      this.pendingTasks.push(taskFn);
      if (!this.frameId) {
        this.frameId = requestAnimationFrame(() => this.runTasks());
      }
    },

    runTasks() {
      this.frameId = null;
      const tasks = [...this.pendingTasks];
      this.pendingTasks = [];
      const start = performance.now();
      
      for (const task of tasks) {
        try {
          task();
        } catch (e) {
          console.error('[PerformanceManager] Task run error:', e);
        }
      }
      const end = performance.now();
      if (end - start > 16) {
        console.warn(`[PerformanceManager] Tasks blocked frame for ${(end - start).toFixed(2)}ms`);
      }
    },

    animateGPU(element, properties, durationMs = 300) {
      if (!element) return Promise.resolve();
      element.style.transition = `all ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`;
      return new Promise(resolve => {
        requestAnimationFrame(() => {
          for (const key in properties) {
            element.style[key] = properties[key];
          }
          setTimeout(resolve, durationMs);
        });
      });
    }
  };

  window.PerformanceManager = PerformanceManager;
})();
