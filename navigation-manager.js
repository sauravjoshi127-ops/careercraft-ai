/**
 * navigation-manager.js
 * Renders and dynamically updates the header navigation link elements.
 */
(function () {
  const NavigationManager = {
    renderNavbarBase(topnav, page) {
      if (page === 'index.html' || page === '') {
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
        if (window.AuthManager) {
          window.AuthManager.getSession().then(session => {
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
        topnav.innerHTML = `
          <a href="dashboard.html" class="logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="premium-gradient-text">CareerCraft AI</span>
          </a>
          <div class="nav-links" id="navLinksContainer" style="display:flex; gap:0.5rem;"></div>
          <div class="user-menu" id="userMenuPlaceholder" style="display:flex; align-items:center; gap:0.75rem;">
              <div style="width: 120px; height: 32px; background: rgba(255,255,255,0.03); border-radius: 9999px;"></div>
              <div class="user-avatar" style="width:32px; height:32px; border-radius:50%; background:rgba(255,255,255,0.05);"></div>
          </div>
        `;

        this.updateNavLinks(page);

        if (window.AuthManager) {
          window.AuthManager.getSession().then(session => {
            const name = session ? (session.user.user_metadata?.full_name 
              || localStorage.getItem('userName') 
              || session.user.email.split('@')[0]) : 'User';
            const initial = name.charAt(0).toUpperCase();

            const menu = document.getElementById('userMenuPlaceholder');
            if (menu && window.WorkspaceManager) {
              menu.innerHTML = `
                ${window.WorkspaceManager.getButtonHtml()}
                <div class="user-avatar" id="avatarInitial" onclick="window.location.href='settings.html'" title="Account" style="display:flex; align-items:center; justify-content:center; cursor:pointer;">${initial}</div>
                <a href="settings.html" class="nav-btn" title="Settings">⚙️<span class="nav-btn-text"> Settings</span></a>
                <button class="nav-btn" onclick="window.AuthManager.logout()" title="Sign Out">🚪<span class="nav-btn-text"> Sign Out</span></button>
              `;
            }
          });
        }
      }
    },

    updateNavLinks(page) {
      const container = document.getElementById('navLinksContainer');
      if (!container) return;

      const ws = window.WorkspaceManager ? window.WorkspaceManager.workspace : 'ai';
      const isManual = ws === 'manual';

      const dashboardActive = page.startsWith('dashboard') ? 'class="nav-btn active"' : 'class="nav-btn"';
      const resumeActive = page.startsWith('resume') ? 'class="nav-btn active"' : 'class="nav-btn"';
      const coverLetterActive = page.startsWith('cover-letter') ? 'class="nav-btn active"' : 'class="nav-btn"';
      const coldEmailActive = page.startsWith('cold-email') ? 'class="nav-btn active"' : 'class="nav-btn"';
      const interviewActive = (page.startsWith('interview') || page.startsWith('mock')) ? 'class="nav-btn active"' : 'class="nav-btn"';

      let linksHtml = `<a href="dashboard.html" ${dashboardActive}>Dashboard</a>`;
      linksHtml += `<a href="resume.html" ${resumeActive}>Resume</a>`;
      linksHtml += `<a href="cover-letter.html" ${coverLetterActive}>Cover Letter</a>`;
      linksHtml += `<a href="cold-email.html" ${coldEmailActive}>Cold Email</a>`;

      if (!isManual) {
        linksHtml += `<a href="interview.html" ${interviewActive}>Interview Coach</a>`;
      }

      container.innerHTML = linksHtml;
    }
  };

  window.NavigationManager = NavigationManager;
})();
