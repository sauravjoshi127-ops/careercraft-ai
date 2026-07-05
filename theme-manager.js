/**
 * theme-manager.js
 * Synchronous theme restoration manager to prevent FOIT (Flash of Incorrect Theme).
 */
(function () {
  const ThemeManager = {
    restoreThemeSync() {
      const savedWorkspace = localStorage.getItem('careercraft_workspace') || 'ai';
      const page = window.location.pathname.split('/').pop() || 'index.html';
      const isAppPage = page !== 'index.html' && page !== 'login.html' && page !== 'signup.html' && page !== 'reset-password.html' && page !== '';
      const isDocPage = isAppPage && (page.startsWith('resume') || page.startsWith('cover-letter') || page.startsWith('cold-email') || page.startsWith('dashboard'));

      if (isAppPage) {
        if (savedWorkspace === 'manual') {
          document.documentElement.classList.add('theme-manual-active');
          document.documentElement.classList.remove('theme-ai-active');
          if (isDocPage) {
            document.documentElement.classList.add('manual-studio-active');
          } else {
            document.documentElement.classList.remove('manual-studio-active');
          }
        } else {
          document.documentElement.classList.add('theme-ai-active');
          document.documentElement.classList.remove('theme-manual-active');
          document.documentElement.classList.remove('manual-studio-active');
        }
      }
    }
  };

  window.ThemeManager = ThemeManager;
  ThemeManager.restoreThemeSync();
})();
