/**
 * auth-manager.js
 * Project state auth guard and cached session retriever.
 */
(function () {
  const AuthManager = {
    sessionCache: null,

    async getSession() {
      if (this.sessionCache) return this.sessionCache;

      try {
        const cached = sessionStorage.getItem('careercraft_session');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.expires_at && parsed.expires_at > (Date.now() / 1000)) {
            this.sessionCache = parsed;
            this.verifySessionBackground();
            return parsed;
          }
        }
      } catch (_) {}

      if (window.appSdk && window.appSdk.ready) {
        await window.appSdk.ready;
      }
      if (window.appSdk && window.appSdk.client) {
        const { data: { session } } = await window.appSdk.client.auth.getSession();
        if (session) {
          this.sessionCache = session;
          try {
            sessionStorage.setItem('careercraft_session', JSON.stringify(session));
          } catch (_) {}
          return session;
        }
      }
      return null;
    },

    async verifySessionBackground() {
      if (window.appSdk && window.appSdk.ready) {
        await window.appSdk.ready;
      }
      if (window.appSdk && window.appSdk.client) {
        try {
          const { data: { session } } = await window.appSdk.client.auth.getSession();
          if (session) {
            this.sessionCache = session;
            sessionStorage.setItem('careercraft_session', JSON.stringify(session));
          } else {
            this.sessionCache = null;
            sessionStorage.removeItem('careercraft_session');
            window.location.href = 'login.html';
          }
        } catch (e) {
          console.warn('[AuthManager] Background session verification failed:', e);
        }
      }
    },

    async getUser() {
      const session = await this.getSession();
      return session ? session.user : null;
    },

    async requireAuth(redirectPath = 'login.html') {
      const session = await this.getSession();
      if (!session) {
        const currentPath = window.location.pathname.split('/').pop();
        const target = currentPath ? `${redirectPath}?redirect=${encodeURIComponent(currentPath + window.location.search)}` : redirectPath;
        window.location.href = target;
        return null;
      }

      if (window.WorkspaceManager && !window.WorkspaceManager.initialized) {
        window.WorkspaceManager.init();
      }

      return session;
    },

    async logout() {
      this.sessionCache = null;
      try {
        sessionStorage.removeItem('careercraft_session');
      } catch (_) {}
      if (window.appSdk && window.appSdk.client) {
        await window.appSdk.client.auth.signOut();
      }
      if (window.StorageManager) {
        window.StorageManager.remove('userEmail');
        window.StorageManager.remove('userName');
        window.StorageManager.remove('userId');
        window.StorageManager.remove('userToken');
      } else {
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userName');
        localStorage.removeItem('userId');
        localStorage.removeItem('userToken');
      }
      window.location.href = 'index.html';
    }
  };

  window.AuthManager = AuthManager;
})();
