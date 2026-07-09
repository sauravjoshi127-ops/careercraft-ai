/**
 * CareerCraft AI Unified Layout & Theme Manager (layout-manager.js)
 * Responsible for:
 *   - Early theme restoration before first paint (blocking FOIT)
 *   - Entry point coordinating sub-managers: auth, workspace, theme, navigation, storage.
 *   - Global toast alerts
 */

(function () {
  // ─── 1. Immediate Synchronous Theme Guard (Executes synchronously in Head) ───
  function restoreThemeSync() {
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
  restoreThemeSync();

  // ─── 2. Layout Manager Core ───
  const LayoutManager = {
    initialized: false,

    init() {
      if (this.initialized) return;
      this.initialized = true;

      // Initialize sub-managers
      if (window.WorkspaceManager && typeof window.WorkspaceManager.init === 'function') {
        window.WorkspaceManager.init();
      }

      this.initSharedComponents();

      window.addEventListener('workspaceChanged', () => {
        const page = window.location.pathname.split('/').pop() || 'index.html';
        if (window.NavigationManager) {
          window.NavigationManager.updateNavLinks(page);
        }
        this.checkInterviewAccess();
      });
    },

    initSharedComponents() {
      const page = window.location.pathname.split('/').pop() || 'index.html';
      const topnav = document.querySelector('.topnav') || document.querySelector('nav');
      
      if (topnav && window.NavigationManager) {
        window.NavigationManager.renderNavbarBase(topnav, page);
      }

      // Render shared footer on landing page
      const footer = document.querySelector('footer');
      if (footer && (page === 'index.html' || page === '')) {
        footer.innerHTML = `
          <div class="footer-brand">
              <div class="logo" style="margin-bottom: 0.5rem; font-size: 1.2rem;">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  CareerCraft AI
              </div>
              <p>&copy; 2026 CareerCraft AI Inc.<br>All rights reserved.</p>
          </div>
          <div class="footer-links">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
              <a href="#">Contact Support</a>
          </div>
        `;
      } else if (page !== 'index.html' && page !== 'login.html' && page !== 'signup.html' && page !== 'reset-password.html' && page !== '') {
        // Insert standard footer inside containers of app pages
        const container = document.querySelector('.container') || document.querySelector('.shell');
        if (container && !document.querySelector('.app-mini-footer')) {
          const miniFooter = document.createElement('div');
          miniFooter.className = 'app-mini-footer';
          miniFooter.style.cssText = 'text-align: center; color: var(--text-3); font-size: 0.8rem; margin: 4rem 0 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border);';
          miniFooter.innerHTML = `&copy; 2026 CareerCraft AI &bull; Premium AI Career Toolkit`;
          container.appendChild(miniFooter);
        }
      }

      this.checkInterviewAccess();
    },

    checkInterviewAccess() {
      const page = window.location.pathname.split('/').pop() || 'index.html';
      const isInterviewPage = page.startsWith('interview') || page.startsWith('mock');
      const ws = window.WorkspaceManager ? window.WorkspaceManager.workspace : 'ai';
      
      let overlay = document.getElementById('exclusive-interview-overlay');
      
      if (isInterviewPage && ws === 'manual') {
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'exclusive-interview-overlay';
          overlay.className = 'exclusive-feature-overlay';
          overlay.innerHTML = `
            <div class="exclusive-feature-card">
              <div class="exclusive-feature-icon">✨</div>
              <div class="exclusive-feature-title">Interview Coach is available exclusively in AI Studio.</div>
              <div class="exclusive-feature-desc">
                Switch to AI Studio to start an AI-powered mock interview, receive adaptive feedback, and improve your interview performance.
              </div>
              <button type="button" class="exclusive-feature-btn" id="btn-switch-to-ai-studio">Switch to AI Studio</button>
            </div>
          `;
          document.body.appendChild(overlay);
          
          document.getElementById('btn-switch-to-ai-studio').onclick = async () => {
            if (window.WorkspaceManager) {
              await window.WorkspaceManager.setWorkspace('ai');
            }
          };
        }
        overlay.style.display = 'flex';
      } else {
        if (overlay) {
          overlay.style.display = 'none';
        }
      }
    },

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

      toast.innerHTML = message;
      toast.className = `toast ${className} show`;
      toast.style.display = 'block';

      if (toast.timeoutId) clearTimeout(toast.timeoutId);
      toast.timeoutId = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
          if (!toast.classList.contains('show')) {
            toast.style.display = 'none';
          }
        }, 400);
      }, 3000);
    }
  };

  window.LayoutManager = LayoutManager;

  // Auto-init layouts when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.LayoutManager.init());
  } else {
    window.LayoutManager.init();
  }
})();
