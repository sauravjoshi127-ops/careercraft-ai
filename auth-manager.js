/**
 * auth-manager.js
 * Project state auth guard and cached session retriever.
 */
(function () {
  const AuthManager = {
    sessionCache: null,

    async getSession() {
      if (this.sessionCache) return this.sessionCache;
      if (window.appSdk && window.appSdk.ready) {
        await window.appSdk.ready;
      }
      if (window.appSdk && window.appSdk.client) {
        const { data: { session } } = await window.appSdk.client.auth.getSession();
        if (session) {
          this.sessionCache = session;
          return session;
        }
      }
      return null;
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
