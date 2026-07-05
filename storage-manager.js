/**
 * storage-manager.js
 * Unified key-value caching layer over localStorage to reduce physical reads/writes.
 */
(function () {
  const StorageManager = {
    cache: new Map(),

    get(key) {
      if (this.cache.has(key)) {
        return this.cache.get(key);
      }
      try {
        const val = localStorage.getItem(key);
        this.cache.set(key, val);
        return val;
      } catch (e) {
        return null;
      }
    },

    set(key, val) {
      try {
        localStorage.setItem(key, val);
        this.cache.set(key, val);
      } catch (e) {
        console.error('LocalStorage write failed:', e);
      }
    },

    remove(key) {
      try {
        localStorage.removeItem(key);
        this.cache.delete(key);
      } catch (e) {}
    },

    clear() {
      try {
        localStorage.clear();
        this.cache.clear();
      } catch (e) {}
    },

    getCache(key, fetcherFn, ttlMs = 5000) {
      const cachedKey = `_cache_${key}`;
      const cached = this.cache.get(cachedKey);
      const now = Date.now();
      if (cached && (now - cached.timestamp < ttlMs)) {
        return Promise.resolve(cached.data);
      }
      
      const fetchPromise = fetcherFn().then(data => {
        this.cache.set(cachedKey, { data, timestamp: Date.now() });
        return data;
      }).catch(err => {
        this.cache.delete(cachedKey);
        throw err;
      });

      this.cache.set(cachedKey, { data: fetchPromise, timestamp: now });
      return fetchPromise;
    },

    invalidate(key) {
      this.cache.delete(`_cache_${key}`);
    }
  };

  window.StorageManager = StorageManager;
})();
