/**
 * CareerCraft AI Unified Client SDK (v1.0.0)
 * Centralizes Supabase integration, user auth guards, and common UI elements.
 */
(function () {
  const SUPABASE_URL = 'https://eduogxolvpqdtvtdiqav.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkdW9neG9sdnBxZHR2dGRpcWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjkzMjksImV4cCI6MjA5MDIwNTMyOX0.MmCTr5qceI2iSCBzs2AcLPhn7_aoKfsoWUoKMUwhPhc';

  const appSdk = {
    client: null,

    // Auth modules
    auth: {
      async getSession() {
        await appSdk.ready;
        if (!appSdk.client) return null;
        const { data: { session } } = await appSdk.client.auth.getSession();
        return session;
      },

      async getUser() {
        const session = await this.getSession();
        return session ? session.user : null;
      },

      async requireAuth(redirectPath = 'login.html') {
        const session = await this.getSession();
        if (!session) {
          // Check if redirect has parameter
          const currentPath = window.location.pathname.split('/').pop();
          const target = currentPath ? `${redirectPath}?redirect=${encodeURIComponent(currentPath + window.location.search)}` : redirectPath;
          window.location.href = target;
          return null;
        }
        return session;
      },

      async logout() {
        await appSdk.ready;
        if (appSdk.client) {
          await appSdk.client.auth.signOut();
        }
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userName');
        localStorage.removeItem('userId');
        localStorage.removeItem('userToken');
        window.location.href = 'index.html';
      }
    },

    // UI Modules
    ui: {
      showToast(message, typeOrIsError = 'success') {
        const isError = typeOrIsError === 'error' || typeOrIsError === true;
        const className = isError ? 'error' : 'success';

        let toast = document.getElementById('toast');
        if (!toast) {
          toast = document.createElement('div');
          toast.id = 'toast';
          toast.className = 'toast';
          document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.className = `toast ${className} show`;
        toast.style.display = 'block';

        // Keep displayed during transition, clear after 3 seconds
        if (toast.timeoutId) clearTimeout(toast.timeoutId);
        toast.timeoutId = setTimeout(() => {
          toast.classList.remove('show');
          setTimeout(() => {
            if (!toast.classList.contains('show')) {
              toast.style.display = 'none';
            }
          }, 400); // Wait for CSS transition (0.4s)
        }, 3000);
      },

      escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
      },

      formatDate(dateStr) {
        if (!dateStr) return 'Unknown date';
        return new Date(dateStr).toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric'
        });
      },

      isValidUUID(str) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      }
    }
  };

  // Helper to load external scripts dynamically
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Start initialization immediately
  appSdk.ready = (async function init() {
    if (!window.supabase) {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      } catch (err) {
        console.error('Failed to dynamically load Supabase CDN:', err);
      }
    }

    if (window.supabase && typeof window.supabase.createClient === 'function') {
      appSdk.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
      console.error('Supabase library is not available.');
    }
  })();

  // Bind to global window namespace
  window.appSdk = appSdk;
})();
