/**
 * workspace-manager.js
 * Project state workspace switcher and transition visualizer.
 */
(function () {
  const WorkspaceManager = {
    workspace: 'ai',
    initialized: false,

    init() {
      if (this.initialized) return;
      this.initialized = true;

      this.workspace = (window.StorageManager ? window.StorageManager.get('careercraft_workspace') : localStorage.getItem('careercraft_workspace')) || 'ai';

      this.applyThemeClass();

      if (window.ManualStudio && typeof window.ManualStudio.init === 'function') {
        window.ManualStudio.init();
      }

      window.dispatchEvent(new CustomEvent('workspaceManagerInitialized'));

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
      const label = active ? 'Creator Studio' : 'AI Studio';
      const shortLabel = active ? 'Creator' : 'AI';
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
          title.textContent = target === 'manual' ? 'Opening Creator Studio' : 'Launching AI Studio';
          subtitle.textContent = target === 'manual' 
            ? 'Entering elegant Apple/Notion environment...' 
            : 'Powering up career copilot & ATS suggestions...';
        }

        portal.classList.add('active');
        document.body.classList.add('workspace-transitioning');

        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 80)));
      }

      this.workspace = target;
      if (window.StorageManager) {
        window.StorageManager.set('careercraft_workspace', target);
      } else {
        localStorage.setItem('careercraft_workspace', target);
      }

      this.applyThemeClass();

      const btn = document.getElementById('global-workspace-switcher');
      if (btn) {
        const active = target === 'manual';
        const label = active ? 'Creator Studio' : 'AI Studio';
        const dotColor = active ? '#10b981' : '#7c3aed';
        const dotGlow = active ? 'rgba(16,185,129,0.6)' : 'rgba(124,58,237,0.8)';
        
        btn.innerHTML = `
          <span class="badge-dot" style="background: ${dotColor}; box-shadow: 0 0 10px ${dotGlow}; width: 7px; height: 7px; border-radius: 50%; display: inline-block;"></span>
          <span class="switcher-text-long">${label}</span>
          <span class="switcher-text-short" style="display: none;">${active ? 'Creator' : 'AI'}</span>
          <span style="opacity: 0.5;">↔</span>
        `;
      }

      window.dispatchEvent(new CustomEvent('workspaceChanged', { detail: { workspace: target } }));

      if (animate) {
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 80)));
        document.body.classList.remove('workspace-transitioning');
        const portal = document.getElementById('workspace-portal');
        if (portal) portal.classList.remove('active');
      }
    }
  };

  window.WorkspaceManager = WorkspaceManager;
})();
