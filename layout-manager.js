/**
 * CareerCraft AI Unified Layout & Theme Manager (layout-manager.js)
 * Responsible for:
 *   - Early theme restoration before first paint (blocking FOIT)
 *   - Reusable header, navigation, and footer shells
 *   - Dynamic user menus and workspace switcher controls
 *   - Morphing workspace transition portal animation
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

  // ─── 2. Unified Workspace Manager ───
  const WorkspaceManager = {
    workspace: localStorage.getItem('careercraft_workspace') || 'ai',
    initialized: false,

    init() {
      if (this.initialized) return;
      this.initialized = true;

      this.applyThemeClass();

      // Trigger ManualStudio initialization if it is loaded
      if (window.ManualStudio && typeof window.ManualStudio.init === 'function') {
        window.ManualStudio.init();
      }

      window.dispatchEvent(new CustomEvent('workspaceManagerInitialized'));

      // Listen to cross-tab storage changes
      window.addEventListener('storage', (e) => {
        if (e.key === 'careercraft_workspace') {
          const val = e.newValue || 'ai';
          if (val !== this.workspace) {
            this.setWorkspace(val, false);
          }
        }
      });
    },

    applyThemeClass() {
      const page = window.location.pathname.split('/').pop() || 'index.html';
      const isAppPage = page !== 'index.html' && page !== 'login.html' && page !== 'signup.html' && page !== 'reset-password.html' && page !== '';
      const isDocPage = isAppPage && (page.startsWith('resume') || page.startsWith('cover-letter') || page.startsWith('cold-email') || page.startsWith('dashboard'));

      if (isAppPage) {
        const targetClass = this.workspace === 'manual' ? 'theme-manual-active' : 'theme-ai-active';
        const removeClass = this.workspace === 'manual' ? 'theme-ai-active' : 'theme-manual-active';

        document.documentElement.classList.remove(removeClass);
        document.documentElement.classList.add(targetClass);

        if (this.workspace === 'manual' && isDocPage) {
          document.documentElement.classList.add('manual-studio-active');
        } else {
          document.documentElement.classList.remove('manual-studio-active');
        }

        if (document.body) {
          document.body.classList.remove(removeClass);
          document.body.classList.add(targetClass);
          if (this.workspace === 'manual' && isDocPage) {
            document.body.classList.add('manual-studio-active');
          } else {
            document.body.classList.remove('manual-studio-active');
          }
        }
      }
    },

    getButtonHtml() {
      const active = this.workspace === 'manual';
      const label = active ? 'Manual Studio' : 'AI Studio';
      const shortLabel = active ? 'Manual' : 'AI';
      const dotColor = active ? '#10b981' : '#7c3aed';
      const dotGlow = active ? 'rgba(16,185,129,0.6)' : 'rgba(124,58,237,0.8)';
      return `
        <button type="button" class="workspace-toggle-btn" id="global-workspace-switcher" onclick="window.WorkspaceManager.toggle()">
          <span class="badge-dot" style="background: ${dotColor}; box-shadow: 0 0 10px ${dotGlow}; width: 7px; height: 7px; border-radius: 50%; display: inline-block;"></span>
          <span class="switcher-text-long">${label}</span>
          <span class="switcher-text-short" style="display: none;">${shortLabel}</span>
          <span style="opacity: 0.5;">↔</span>
        </button>
      `;
    },

    async toggle() {
      const target = this.workspace === 'ai' ? 'manual' : 'ai';
      await this.setWorkspace(target, true);
    },

    async setWorkspace(target, animate = true) {
      if (animate) {
        let portal = document.getElementById('workspace-portal');
        if (!portal) {
          portal = document.createElement('div');
          portal.id = 'workspace-portal';
          portal.className = 'workspace-portal-overlay';
          portal.innerHTML = `
            <div class="workspace-portal-card">
              <div class="workspace-portal-spinner"></div>
              <div class="workspace-portal-title" id="portal-title">Aligning Workspace...</div>
              <div class="workspace-portal-subtitle" id="portal-subtitle">Applying design system tokens</div>
            </div>
          `;
          document.body.appendChild(portal);
        }

        const title = document.getElementById('portal-title');
        const subtitle = document.getElementById('portal-subtitle');
        if (title && subtitle) {
          title.textContent = target === 'manual' ? 'Opening Manual Studio' : 'Launching AI Studio';
          subtitle.textContent = target === 'manual' 
            ? 'Entering elegant Apple/Notion environment...' 
            : 'Powering up career copilot & ATS suggestions...';
        }

        portal.classList.add('active');
        document.body.classList.add('workspace-transitioning');

        // Allow visual portal transition
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      this.workspace = target;
      localStorage.setItem('careercraft_workspace', target);

      const page = window.location.pathname.split('/').pop() || 'index.html';
      if (target === 'manual' && page.startsWith('interview')) {
        if (animate) {
          await new Promise(resolve => setTimeout(resolve, 100));
          document.body.classList.remove('workspace-transitioning');
          const portal = document.getElementById('workspace-portal');
          if (portal) portal.classList.remove('active');
        }
        window.location.href = 'dashboard.html';
        return;
      }

      this.applyThemeClass();

      // Update button labels in navbar dynamically
      const btn = document.getElementById('global-workspace-switcher');
      if (btn) {
        const active = target === 'manual';
        const label = active ? 'Manual Studio' : 'AI Studio';
        const shortLabel = active ? 'Manual' : 'AI';
        const dotColor = active ? '#10b981' : '#7c3aed';
        const dotGlow = active ? 'rgba(16,185,129,0.6)' : 'rgba(124,58,237,0.8)';
        
        btn.innerHTML = `
          <span class="badge-dot" style="background: ${dotColor}; box-shadow: 0 0 10px ${dotGlow}; width: 7px; height: 7px; border-radius: 50%; display: inline-block;"></span>
          <span class="switcher-text-long">${label}</span>
          <span class="switcher-text-short" style="display: none;">${shortLabel}</span>
          <span style="opacity: 0.5;">↔</span>
        `;
      }

      window.dispatchEvent(new CustomEvent('workspaceChanged', { detail: { workspace: target } }));

      if (animate) {
        await new Promise(resolve => setTimeout(resolve, 100));
        document.body.classList.remove('workspace-transitioning');
        const portal = document.getElementById('workspace-portal');
        if (portal) portal.classList.remove('active');
      }
    }
  };

  // ─── 3. Shared Reusable Header/Footer & Layout Manager ───
  const LayoutManager = {
    initialized: false,

    init() {
      if (this.initialized) return;
      this.initialized = true;

      // Make sure WorkspaceManager is set up early
      window.WorkspaceManager.init();

      this.initSharedComponents();
    },

    initSharedComponents() {
      const page = window.location.pathname.split('/').pop() || 'index.html';
      const topnav = document.querySelector('.topnav') || document.querySelector('nav');
      
      if (topnav) {
        // Build the base shell of the navbar once
        this.renderNavbarBase(topnav, page);
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
    },

    renderNavbarBase(topnav, page) {
      if (page === 'index.html' || page === '') {
        // Landing Page Header
        topnav.innerHTML = `
          <a href="index.html" class="logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              CareerCraft
          </a>
          <ul class="nav-links">
              <li><a href="#features">Features</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="#">Enterprise</a></li>
          </ul>
          <div class="nav-buttons" id="navButtonsPlaceholder" style="display:flex; align-items:center; gap:0.5rem;">
              <a href="login.html" class="btn-signin">Sign In</a>
              <a href="signup.html" class="btn-primary">Get Started</a>
          </div>
        `;
        // Load session and update dynamic elements without full rewrite
        if (window.appSdk && window.appSdk.ready) {
          window.appSdk.auth.getSession().then(session => {
            if (session) {
              const placeholder = document.getElementById('navButtonsPlaceholder');
              if (placeholder) {
                const initial = (session.user.user_metadata?.full_name || session.user.email || 'U').charAt(0).toUpperCase();
                placeholder.innerHTML = `
                  <a href="dashboard.html" class="btn-primary">Dashboard</a>
                  <div class="user-avatar" onclick="window.location.href='settings.html'" title="Go to settings" style="margin-left:0.5rem; display:inline-flex; align-items:center; justify-content:center;">${initial}</div>
                `;
              }
            }
          });
        }
      } else if (page === 'login.html' || page === 'signup.html' || page === 'reset-password.html') {
        // Simple auth header
        topnav.innerHTML = `
          <a href="index.html" class="logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              CareerCraft AI
          </a>
          <a href="index.html" class="btn-primary" style="background: transparent; border: 1px solid var(--border-color); color: var(--text-primary); padding: 0.5rem 1rem; width: auto; font-size: 0.85rem;">← Back to Home</a>
        `;
      } else if (page === 'resume-share.html') {
        // Shared resume view header
        topnav.innerHTML = `
          <a href="index.html" class="logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              CareerCraft AI
          </a>
          <a href="signup.html" class="btn-accent" style="padding: 0.5rem 1.2rem; width: auto; font-size: 0.85rem;">Get Started for Free</a>
        `;
      } else {
        // App Page Header
        const resumeActive = page.startsWith('resume') ? 'class="nav-btn active"' : 'class="nav-btn"';
        const coverLetterActive = page.startsWith('cover-letter') ? 'class="nav-btn active"' : 'class="nav-btn"';
        const coldEmailActive = page.startsWith('cold-email') ? 'class="nav-btn active"' : 'class="nav-btn"';
        const interviewActive = (page.startsWith('interview') || page.startsWith('mock')) ? 'class="nav-btn active"' : 'class="nav-btn"';

        topnav.innerHTML = `
          <a href="dashboard.html" class="logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="premium-gradient-text">CareerCraft AI</span>
          </a>
          <div class="nav-links" style="display:flex; gap:0.5rem;">
              <a href="resume.html" ${resumeActive}>Resume</a>
              <a href="cover-letter.html" ${coverLetterActive}>Cover Letter</a>
              <a href="cold-email.html" ${coldEmailActive}>Cold Email</a>
              <a href="interview.html" ${interviewActive}>Interview</a>
          </div>
          <div class="user-menu" id="userMenuPlaceholder" style="display:flex; align-items:center; gap:0.75rem;">
              <div style="width: 120px; height: 32px; background: rgba(255,255,255,0.03); border-radius: 9999px;"></div>
              <div class="user-avatar" style="width:32px; height:32px; border-radius:50%; background:rgba(255,255,255,0.05);"></div>
          </div>
        `;

        // Update user state dynamic elements
        if (window.appSdk && window.appSdk.ready) {
          window.appSdk.auth.getSession().then(session => {
            const name = session ? (session.user.user_metadata?.full_name 
              || localStorage.getItem('userName') 
              || session.user.email.split('@')[0]) : 'User';
            const initial = name.charAt(0).toUpperCase();

            const menu = document.getElementById('userMenuPlaceholder');
            if (menu) {
              menu.innerHTML = `
                ${window.WorkspaceManager.getButtonHtml()}
                <div class="user-avatar" id="avatarInitial" onclick="window.location.href='settings.html'" title="Account" style="display:flex; align-items:center; justify-content:center; cursor:pointer;">${initial}</div>
                <a href="settings.html" class="nav-btn" title="Settings">⚙️<span class="nav-btn-text"> Settings</span></a>
                <button class="nav-btn" onclick="window.appSdk.auth.logout()" title="Sign Out">🚪<span class="nav-btn-text"> Sign Out</span></button>
              `;
            }
          });
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

      toast.textContent = message;
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

  // Bind to global window namespace
  window.WorkspaceManager = WorkspaceManager;
  window.LayoutManager = LayoutManager;

  // Auto-init layouts when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.LayoutManager.init());
  } else {
    window.LayoutManager.init();
  }
})();
