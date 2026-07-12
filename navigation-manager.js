/**
 * navigation-manager.js
 * Career Hub — Unified Navigation System v3.0
 *
 * Renders and controls the application navigation across all pages.
 * Components: logo, primary links, workspace toggle, upgrade CTA,
 * profile dropdown, mobile drawer, scroll glass effect, keyboard nav.
 *
 * CSS: styles/premium.css — ch-nav__* namespace
 * Entry: layout-manager.js → NavigationManager.renderNavbarBase(nav, page)
 */
(function () {
  'use strict';

  /* ── SVG icon helpers ──────────────────────────────────── */
  const ICONS = {
    logo: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,

    dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
    </svg>`,

    resume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>`,

    coverLetter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
      <path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>
    </svg>`,

    coldEmail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
    </svg>`,

    interview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>`,

    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>`,

    keyboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2"/>
      <line x1="6" y1="8" x2="6.01" y2="8"/><line x1="10" y1="8" x2="10.01" y2="8"/>
      <line x1="14" y1="8" x2="14.01" y2="8"/><line x1="18" y1="8" x2="18.01" y2="8"/>
      <line x1="8" y1="12" x2="8.01" y2="12"/><line x1="12" y1="12" x2="12.01" y2="12"/>
      <line x1="16" y1="12" x2="16.01" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/>
    </svg>`,

    signout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>`,

    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>`,

    upgrade: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>`,

    cmd: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
    </svg>`,

    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`,

    arrowLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>`,

    arrowLeftRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="ch-nav__ws-icon">
      <path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>
    </svg>`,
  };

  /* ── Internal state ────────────────────────────────────── */
  let _dropdownOpen = false;
  let _drawerOpen   = false;
  let _scrollListener = null;
  let _clickOutsideListener = null;
  let _keyboardListener = null;
  let _currentNav = null;
  let _resizeObserver = null;

  /* ── Page matcher helpers ──────────────────────────────── */
  function _isPage(page, prefix) {
    return page.startsWith(prefix);
  }

  function _activeClass(page, prefix) {
    return _isPage(page, prefix) ? ' ch-nav__link--active' : '';
  }

  function _activeDrawerClass(page, prefix) {
    return _isPage(page, prefix) ? ' ch-drawer__link--active' : '';
  }

  /* ── Build: Logo ───────────────────────────────────────── */
  function _buildLogo(href) {
    return `
      <div class="ch-nav__logo-zone">
        <a href="${href}" class="ch-nav__logo" aria-label="Career Hub — Home">
          ${ICONS.logo}
          <span>Career Hub</span>
        </a>
      </div>`;
  }

  /* ── Build: Primary nav links ──────────────────────────── */
  function _buildNavLinks(page, ws) {
    const isManual = ws === 'manual';
    const links = [
      { href: 'dashboard.html',   label: 'Dashboard',       prefix: 'dashboard' },
      { href: 'resume.html',      label: 'Resume',          prefix: 'resume'    },
      { href: 'cover-letter.html',label: 'Cover Letter',    prefix: 'cover-letter' },
      { href: 'cold-email.html',  label: 'Cold Email',      prefix: 'cold-email'   },
    ];
    // Interview Coach only in AI mode
    if (!isManual) {
      links.push({ href: 'interview.html', label: 'Interview Coach', prefix: 'interview' });
    }

    const items = links.map(l =>
      `<a href="${l.href}" class="ch-nav__link${_activeClass(page, l.prefix)}"
          ${_isPage(page, l.prefix) ? 'aria-current="page"' : ''}>${l.label}</a>`
    ).join('');

    return `
      <div class="ch-nav__link-zone">
        <nav class="ch-nav__links" id="ch-nav-links-container" aria-label="Primary navigation">${items}</nav>
      </div>`;
  }

  /* ── Build: Workspace pill ─────────────────────────────── */
  function _buildWorkspacePill(ws) {
    const isManual = (ws === 'manual');
    const label    = isManual ? 'Creator Studio' : 'AI Studio';
    return `
      <button type="button" class="ch-nav__workspace" id="ch-workspace-toggle"
              onclick="window.WorkspaceManager && window.WorkspaceManager.toggle()"
              title="Switch workspace" aria-label="Switch workspace: currently ${label}">
        <span class="ch-nav__ws-label">${label}</span>
        ${ICONS.arrowLeftRight}
      </button>`;
  }

  /* ── Build: Upgrade CTA ────────────────────────────────── */
  function _buildUpgradeBtn() {
    return `
      <a href="dashboard.html#pricing" class="ch-nav__upgrade" id="ch-upgrade-btn"
         title="Upgrade to Pro" aria-label="Upgrade to Career Hub Pro">
        ${ICONS.upgrade}
        Upgrade
      </a>`;
  }

  /* ── Build: Command palette trigger ────────────────────── */
  function _buildCmdBtn() {
    return `
      <button type="button" class="ch-nav__cmd-btn" id="ch-cmd-btn"
              title="Open command palette" aria-label="Open command palette (Ctrl+K)">
        ${ICONS.cmd}
        <span class="ch-nav__cmd-kbd">⌘K</span>
      </button>`;
  }

  /* ── Build: Avatar + Dropdown ──────────────────────────── */
  function _buildAvatarZone(initial, name, email, isPro) {
    const planLabel = isPro ? 'Pro' : 'Free';
    const planClass = isPro ? 'ch-dropdown__plan ch-dropdown__plan--pro' : 'ch-dropdown__plan';

    return `
      <div class="ch-nav__avatar-wrap">
        <button type="button"
                class="ch-nav__avatar"
                id="ch-avatar-btn"
                aria-haspopup="true"
                aria-expanded="false"
                aria-controls="ch-dropdown"
                title="Open account menu">
          <span class="ch-nav__avatar-inner" aria-hidden="true" id="ch-avatar-initial">${initial}</span>
        </button>

        <div class="ch-dropdown"
             id="ch-dropdown"
             role="menu"
             aria-labelledby="ch-avatar-btn"
             aria-hidden="true">

          <div class="ch-dropdown__header">
            <div class="ch-dropdown__name" id="ch-dropdown-name">${name}</div>
            <div class="ch-dropdown__email" id="ch-dropdown-email">${email}</div>
            <span class="${planClass}" id="ch-dropdown-plan">${planLabel} Plan</span>
          </div>

          <div class="ch-dropdown__section">
            <a href="settings.html" class="ch-dropdown__item" role="menuitem">
              ${ICONS.user}
              Settings
            </a>
            <button type="button" class="ch-dropdown__item" role="menuitem" onclick="window.dispatchEvent(new KeyboardEvent('keydown', {key:'k', metaKey:true}))">
              ${ICONS.keyboard}
              Keyboard Shortcuts
              <span class="ch-dropdown__kbd">⌘K</span>
            </button>
            <div class="ch-dropdown__divider" role="separator"></div>
            <button type="button" class="ch-dropdown__item ch-dropdown__item--danger"
                    id="ch-signout-btn" role="menuitem">
              ${ICONS.signout}
              Sign Out
            </button>
          </div>
        </div>
      </div>`;
  }

  /* ── Build: Hamburger ──────────────────────────────────── */
  function _buildHamburger() {
    return `
      <button type="button"
              class="ch-hamburger"
              id="ch-hamburger"
              aria-label="Open navigation menu"
              aria-expanded="false"
              aria-controls="ch-drawer">
        <span class="ch-hamburger__bar"></span>
        <span class="ch-hamburger__bar"></span>
        <span class="ch-hamburger__bar"></span>
      </button>`;
  }

  /* ── Build: Mobile drawer ──────────────────────────────── */
  function _buildDrawer(page, ws, initial, name, email) {
    const isManual = (ws === 'manual');
    const wsLabel  = isManual ? 'Creator Studio' : 'AI Studio';

    const tools = [
      { href: 'dashboard.html',   label: 'Dashboard',       icon: ICONS.dashboard,   prefix: 'dashboard'    },
      { href: 'resume.html',      label: 'Resume Builder',  icon: ICONS.resume,      prefix: 'resume'       },
      { href: 'cover-letter.html',label: 'Cover Letter',    icon: ICONS.coverLetter, prefix: 'cover-letter' },
      { href: 'cold-email.html',  label: 'Cold Email',      icon: ICONS.coldEmail,   prefix: 'cold-email'   },
    ];
    if (!isManual) {
      tools.push({ href: 'interview.html', label: 'Interview Coach', icon: ICONS.interview, prefix: 'interview' });
    }

    const toolLinks = tools.map(t =>
      `<a href="${t.href}" class="ch-drawer__link${_activeDrawerClass(page, t.prefix)}"
          ${_isPage(page, t.prefix) ? 'aria-current="page"' : ''}>
        ${t.icon}${t.label}
      </a>`
    ).join('');

    return `
      <div class="ch-drawer__backdrop" id="ch-drawer-backdrop" aria-hidden="true"></div>
      <div class="ch-drawer" id="ch-drawer" role="dialog" aria-modal="true" aria-label="Navigation menu">
        <div class="ch-drawer__header">
          ${_buildLogo('dashboard.html')}
          <button type="button" class="ch-drawer__close" id="ch-drawer-close"
                  aria-label="Close navigation menu">
            ${ICONS.close}
          </button>
        </div>
        <div class="ch-drawer__body">
          <div class="ch-drawer__section-label">Navigation</div>
          ${toolLinks}

          <div class="ch-drawer__divider"></div>

          <div class="ch-drawer__section-label">Workspace</div>
          <button type="button" class="ch-drawer__workspace" id="ch-drawer-workspace"
                  onclick="window.WorkspaceManager && window.WorkspaceManager.toggle()"
                  aria-label="Switch workspace: currently ${wsLabel}">
            <span class="ch-nav__ws-label">${wsLabel}</span>
            <div style="margin-left: auto;">${ICONS.arrowLeftRight}</div>
          </button>

          <div class="ch-drawer__divider"></div>

          <a href="dashboard.html#pricing" class="ch-drawer__upgrade" id="ch-drawer-upgrade">
            ${ICONS.upgrade}
            Upgrade to Pro
          </a>

          <div class="ch-drawer__divider"></div>

          <div class="ch-drawer__section-label">Account</div>
          <div class="ch-drawer__account">
            <div class="ch-drawer__name" id="ch-drawer-name">${name}</div>
            <div class="ch-drawer__email" id="ch-drawer-email">${email}</div>
          </div>
          <a href="settings.html" class="ch-drawer__link">
            ${ICONS.settings}
            Settings
          </a>
          <button type="button" class="ch-drawer__link ch-drawer__link--danger"
                  id="ch-drawer-signout">
            ${ICONS.signout}
            Sign Out
          </button>
        </div>
      </div>`;
  }

  /* ── Render variants ───────────────────────────────────── */

  function _renderLanding(topnav) {
    topnav.className = 'ch-nav ch-nav--opaque';
    topnav.setAttribute('aria-label', 'Main navigation');

    topnav.innerHTML = `
      <div class="ch-nav__inner">
        ${_buildLogo('index.html')}

        <div class="ch-nav__link-zone">
          <nav class="ch-nav__landing-links" aria-label="Primary navigation">
            <a href="#features" class="ch-nav__landing-link">Features</a>
            <a href="#pricing"  class="ch-nav__landing-link">Pricing</a>
            <a href="#"         class="ch-nav__landing-link">Enterprise</a>
          </nav>
        </div>

        <div class="ch-nav__util-zone" id="ch-landing-actions">
          <a href="login.html"  class="ch-nav__signin">Sign In</a>
          <a href="signup.html" class="ch-nav__cta">Get Started &rarr;</a>
        </div>
        ${_buildHamburger()}
      </div>
      ${_buildDrawerLanding()}
    `;

    // Check auth: swap buttons → Dashboard + Avatar
    if (window.AuthManager) {
      window.AuthManager.getSession().then(session => {
        if (!session) return;
        const actions = document.getElementById('ch-landing-actions');
        if (!actions) return;
        const name = session.user.user_metadata?.full_name
          || localStorage.getItem('userName')
          || session.user.email.split('@')[0];
        const initial = name.charAt(0).toUpperCase();
        actions.innerHTML = `
          <a href="dashboard.html" class="ch-nav__cta">Dashboard</a>
          <a href="settings.html"  class="ch-nav__avatar" style="display:inline-flex;width:32px;height:32px;border-radius:50%;border:none;padding:0;">
            <span class="ch-nav__avatar-inner">${initial}</span>
          </a>`;
      });
    }

    _initMobileDrawer(topnav);
  }

  function _buildDrawerLanding() {
    return `
      <div class="ch-drawer__backdrop" id="ch-drawer-backdrop" aria-hidden="true"></div>
      <div class="ch-drawer" id="ch-drawer" role="dialog" aria-modal="true" aria-label="Navigation menu">
        <div class="ch-drawer__header">
          ${_buildLogo('index.html')}
          <button type="button" class="ch-drawer__close" id="ch-drawer-close" aria-label="Close navigation menu">
            ${ICONS.close}
          </button>
        </div>
        <div class="ch-drawer__body">
          <a href="#features" class="ch-drawer__link">${ICONS.cmd} Features</a>
          <a href="#pricing"  class="ch-drawer__link">${ICONS.upgrade} Pricing</a>
          <div class="ch-drawer__divider"></div>
          <a href="login.html"  class="ch-drawer__link">${ICONS.user} Sign In</a>
          <a href="signup.html" class="ch-drawer__upgrade">Get Started Free</a>
        </div>
      </div>`;
  }

  function _renderAuth(topnav, page) {
    topnav.className = 'ch-nav ch-nav--opaque';
    topnav.setAttribute('aria-label', 'Main navigation');

    topnav.innerHTML = `
      <div class="ch-nav__inner">
        ${_buildLogo('index.html')}
        <div class="ch-nav__link-zone"></div>
        <div class="ch-nav__util-zone">
          <a href="index.html" class="ch-nav__back">
            ${ICONS.arrowLeft}
            Back to Home
          </a>
        </div>
      </div>`;
  }

  function _renderShare(topnav) {
    topnav.className = 'ch-nav ch-nav--opaque';
    topnav.setAttribute('aria-label', 'Main navigation');

    topnav.innerHTML = `
      <div class="ch-nav__inner">
        ${_buildLogo('index.html')}
        <div class="ch-nav__link-zone"></div>
        <div class="ch-nav__util-zone">
          <a href="signup.html" class="ch-nav__cta">Get Started Free</a>
        </div>
      </div>`;
  }

  function _renderApp(topnav, page) {
    topnav.className = 'ch-nav';
    topnav.setAttribute('aria-label', 'Main navigation');

    const ws = window.WorkspaceManager ? window.WorkspaceManager.workspace : 'ai';

    // Build entire structure synchronously
    // We insert empty placeholder strings for dynamic data until auth resolves
    topnav.innerHTML = `
      <div class="ch-nav__inner">
        ${_buildLogo('dashboard.html')}
        ${_buildNavLinks(page, ws)}
        <div class="ch-nav__util-zone" id="ch-right-zone">
          ${_buildCmdBtn()}
          ${_buildWorkspacePill(ws)}
          ${_buildUpgradeBtn()}
          ${_buildAvatarZone('', '', '', false)}
        </div>
        ${_buildHamburger()}
      </div>
      ${_buildDrawer(page, ws, '', '', '')}
    `;

    _initScrollBehavior(topnav);
    _initCmdPalette();
    _initDropdown();
    _initMobileDrawer(topnav);
    _initKeyboard(topnav);
    _initOverflowMenu();

    // Async: resolve auth then populate user data
    if (window.AuthManager) {
      window.AuthManager.getSession().then(session => {
        const name  = session
          ? (session.user.user_metadata?.full_name || localStorage.getItem('userName') || session.user.email.split('@')[0])
          : 'User';
        const email   = session ? (session.user.email || '') : '';
        const initial = name.charAt(0).toUpperCase();
        const isPro   = !!(session && session.user.user_metadata?.is_pro);

        // Update Avatar Initial
        const avatarInitial = document.getElementById('ch-avatar-initial');
        if (avatarInitial) avatarInitial.textContent = initial;

        // Update Dropdown Data
        const dropdownName = document.getElementById('ch-dropdown-name');
        if (dropdownName) dropdownName.textContent = name;
        const dropdownEmail = document.getElementById('ch-dropdown-email');
        if (dropdownEmail) dropdownEmail.textContent = email;
        const dropdownPlan = document.getElementById('ch-dropdown-plan');
        if (dropdownPlan) {
          dropdownPlan.textContent = isPro ? 'Pro Plan' : 'Free Plan';
          dropdownPlan.className = isPro ? 'ch-dropdown__plan ch-dropdown__plan--pro' : 'ch-dropdown__plan';
        }

        // Update Drawer Data
        const drawerName = document.getElementById('ch-drawer-name');
        if (drawerName) drawerName.textContent = name;
        const drawerEmail = document.getElementById('ch-drawer-email');
        if (drawerEmail) drawerEmail.textContent = email;

        // Handle Upgrade Button Visibility
        if (isPro) {
          const navUpgrade = document.getElementById('ch-upgrade-btn');
          if (navUpgrade) navUpgrade.style.display = 'none';
          const drawerUpgrade = document.getElementById('ch-drawer-upgrade');
          if (drawerUpgrade) drawerUpgrade.style.display = 'none';
        }

        // Sign out wiring
        const signoutBtn = document.getElementById('ch-signout-btn');
        if (signoutBtn) {
          signoutBtn.addEventListener('click', () => {
            if (window.AuthManager) window.AuthManager.logout();
          });
        }
        const drawerSignout = document.getElementById('ch-drawer-signout');
        if (drawerSignout) {
          drawerSignout.addEventListener('click', () => {
            if (window.AuthManager) window.AuthManager.logout();
          });
        }
      }).catch(() => {
        // Auth failed silently
      });
    }

    _currentNav = topnav;
  }

  /* ── Scroll glass effect ───────────────────────────────── */
  function _initScrollBehavior(nav) {
    if (_scrollListener) {
      window.removeEventListener('scroll', _scrollListener, { passive: true });
    }
    _scrollListener = function () {
      if (window.scrollY > 24) {
        nav.classList.add('ch-nav--scrolled');
      } else {
        nav.classList.remove('ch-nav--scrolled');
      }
    };
    window.addEventListener('scroll', _scrollListener, { passive: true });
    // Run immediately in case page is already scrolled
    _scrollListener();
  }

  /* ── Dropdown ──────────────────────────────────────────── */
  function _initDropdown() {
    const avatarBtn = document.getElementById('ch-avatar-btn');
    const dropdown  = document.getElementById('ch-dropdown');
    if (!avatarBtn || !dropdown) return;

    avatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _dropdownOpen ? _closeDropdown() : _openDropdown();
    });

    // Click outside
    if (_clickOutsideListener) {
      document.removeEventListener('click', _clickOutsideListener);
    }
    _clickOutsideListener = function (e) {
      const wrap = document.querySelector('.ch-nav__avatar-wrap');
      if (wrap && !wrap.contains(e.target)) {
        _closeDropdown();
      }
    };
    document.addEventListener('click', _clickOutsideListener);
  }

  function _openDropdown() {
    const avatarBtn = document.getElementById('ch-avatar-btn');
    const dropdown  = document.getElementById('ch-dropdown');
    if (!avatarBtn || !dropdown) return;
    _dropdownOpen = true;
    dropdown.classList.add('ch-dropdown--open');
    dropdown.setAttribute('aria-hidden', 'false');
    avatarBtn.setAttribute('aria-expanded', 'true');
    avatarBtn.classList.add('ch-nav__avatar--open');
    // Focus first item
    const first = dropdown.querySelector('[role="menuitem"]');
    if (first) setTimeout(() => first.focus(), 20);
  }

  function _closeDropdown() {
    const avatarBtn = document.getElementById('ch-avatar-btn');
    const dropdown  = document.getElementById('ch-dropdown');
    if (!avatarBtn || !dropdown) return;
    _dropdownOpen = false;
    dropdown.classList.remove('ch-dropdown--open');
    dropdown.setAttribute('aria-hidden', 'true');
    avatarBtn.setAttribute('aria-expanded', 'false');
    avatarBtn.classList.remove('ch-nav__avatar--open');
  }

  /* ── Mobile drawer ─────────────────────────────────────── */
  function _openMobileDrawer() {
    const drawer   = document.getElementById('ch-drawer');
    const backdrop = document.getElementById('ch-drawer-backdrop');
    const hamburger= document.getElementById('ch-hamburger');
    if (!drawer) return;
    _drawerOpen = true;
    drawer.classList.add('ch-drawer--open');
    if (backdrop) backdrop.classList.add('ch-drawer__backdrop--open');
    if (hamburger) {
      hamburger.classList.add('ch-hamburger--open');
      hamburger.setAttribute('aria-expanded', 'true');
      hamburger.setAttribute('aria-label', 'Close navigation menu');
    }
    document.body.style.overflow = 'hidden';
    if (_currentNav) _currentNav.classList.add('ch-nav--no-glass');

    // Focus first focusable item in drawer
    const firstFocusable = drawer.querySelector('a, button');
    if (firstFocusable) setTimeout(() => firstFocusable.focus(), 50);
  }

  function _closeMobileDrawer() {
    const drawer   = document.getElementById('ch-drawer');
    const backdrop = document.getElementById('ch-drawer-backdrop');
    const hamburger= document.getElementById('ch-hamburger');
    if (!drawer) return;
    _drawerOpen = false;
    drawer.classList.remove('ch-drawer--open');
    if (backdrop) backdrop.classList.remove('ch-drawer__backdrop--open');
    if (hamburger) {
      hamburger.classList.remove('ch-hamburger--open');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.setAttribute('aria-label', 'Open navigation menu');
      hamburger.focus();
    }
    document.body.style.overflow = '';
    if (_currentNav) _currentNav.classList.remove('ch-nav--no-glass');
  }

  function _initMobileDrawer(nav) {
    // Hamburger toggle — may already be in DOM
    const hamburger = document.getElementById('ch-hamburger');
    if (hamburger) {
      // Remove any prior listener by cloning
      const fresh = hamburger.cloneNode(true);
      hamburger.parentNode.replaceChild(fresh, hamburger);
      fresh.addEventListener('click', () => {
        _drawerOpen ? _closeMobileDrawer() : _openMobileDrawer();
      });
    }

    // Backdrop click
    const backdrop = document.getElementById('ch-drawer-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', _closeMobileDrawer);
    }

    // Close button
    const closeBtn = document.getElementById('ch-drawer-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', _closeMobileDrawer);
    }

    // Close on link click (navigation)
    const drawer = document.getElementById('ch-drawer');
    if (drawer) {
      drawer.querySelectorAll('a.ch-drawer__link, a.ch-drawer__upgrade').forEach(link => {
        link.addEventListener('click', () => _closeMobileDrawer());
      });
    }
  }

  /* ── Keyboard navigation ───────────────────────────────── */
  function _initKeyboard(nav) {
    if (_keyboardListener) {
      document.removeEventListener('keydown', _keyboardListener);
    }
    _keyboardListener = function (e) {
      // Escape: close dropdown or drawer
      if (e.key === 'Escape') {
        if (_dropdownOpen) { _closeDropdown(); return; }
        if (_drawerOpen)   { _closeMobileDrawer(); return; }
      }

      // Arrow keys inside dropdown
      if (_dropdownOpen) {
        const dropdown = document.getElementById('ch-dropdown');
        if (!dropdown) return;
        const items = Array.from(dropdown.querySelectorAll('[role="menuitem"]'));
        const idx   = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          items[(idx + 1) % items.length]?.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          items[(idx - 1 + items.length) % items.length]?.focus();
        }
      }

      // Cmd+K / Ctrl+K — command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        _triggerCommandPalette();
      }
    };
    document.addEventListener('keydown', _keyboardListener);
  }

  /* ── Command Palette (Phase 1: placeholder) ────────────── */
  function _initCmdPalette() {
    const cmdBtn = document.getElementById('ch-cmd-btn');
    if (cmdBtn) {
      cmdBtn.addEventListener('click', _triggerCommandPalette);
    }
  }

  function _triggerCommandPalette() {
    if (window.LayoutManager && typeof window.LayoutManager.showToast === 'function') {
      window.LayoutManager.showToast(
        'Command Palette — <strong>coming soon</strong>. Press Escape to dismiss.',
        'success'
      );
    }
  }

  /* ── Overflow Menu (Resize Observer) ───────────────────── */
  function _initOverflowMenu() {
    const container = document.getElementById('ch-nav-links-container');
    const linkZone = document.querySelector('.ch-nav__link-zone');
    if (!container || !linkZone || typeof ResizeObserver === 'undefined') return;

    if (_resizeObserver) _resizeObserver.disconnect();
    
    // Simplistic overflow handling for future-proofing:
    // When 7 links are present, this will detect if it overflows
    // For now we don't strictly hide items as it requires more robust DOM updates
    // but the grid naturally bounds the center area. If needed in the future,
    // we will implement a "More" dropdown here.
  }

  /* ── Update nav links (workspace change) ───────────────── */
  function _updateNavLinks(page) {
    // Update desktop links
    const linksEl = document.querySelector('.ch-nav__links');
    if (linksEl) {
      const ws = window.WorkspaceManager ? window.WorkspaceManager.workspace : 'ai';
      const isManual = ws === 'manual';
      const links = [
        { href: 'dashboard.html',   label: 'Dashboard',    prefix: 'dashboard'    },
        { href: 'resume.html',      label: 'Resume',       prefix: 'resume'       },
        { href: 'cover-letter.html',label: 'Cover Letter', prefix: 'cover-letter' },
        { href: 'cold-email.html',  label: 'Cold Email',   prefix: 'cold-email'   },
      ];
      if (!isManual) links.push({ href: 'interview.html', label: 'Interview Coach', prefix: 'interview' });
      linksEl.innerHTML = links.map(l =>
        `<a href="${l.href}" class="ch-nav__link${_activeClass(page, l.prefix)}"
            ${_isPage(page, l.prefix) ? 'aria-current="page"' : ''}>${l.label}</a>`
      ).join('');
    }
    
    // Update drawer links
    const drawerLinksEl = document.querySelector('.ch-drawer__body');
    if (drawerLinksEl && window.WorkspaceManager) {
       // Future: dynamically rebuild drawer tools if workspace changes dynamically
       // Currently it's fine since we usually reload or navigate.
    }

    // Update workspace pill label + dot
    _refreshWorkspacePill();
  }

  function _refreshWorkspacePill() {
    const ws = window.WorkspaceManager ? window.WorkspaceManager.workspace : 'ai';
    const isManual = ws === 'manual';
    const label  = isManual ? 'Creator Studio' : 'AI Studio';

    // Desktop pill
    const pillBtn = document.getElementById('ch-workspace-toggle');
    if (pillBtn) {
      pillBtn.setAttribute('aria-label', `Switch workspace: currently ${label}`);
      const text = pillBtn.querySelector('.ch-nav__ws-label');
      if (text) { text.textContent = label; }
    }

    // Drawer workspace button
    const drawerWs = document.getElementById('ch-drawer-workspace');
    if (drawerWs) {
      const text = drawerWs.querySelector('.ch-nav__ws-label');
      if (text) { text.textContent = label; }
    }
  }

  /* ── Public API ────────────────────────────────────────── */
  const NavigationManager = {

    renderNavbarBase(topnav, page) {
      _currentNav = topnav;
      page = page || '';

      if (page === 'index.html' || page === '') {
        _renderLanding(topnav);
      } else if (
        page === 'login.html' ||
        page === 'signup.html' ||
        page === 'reset-password.html'
      ) {
        _renderAuth(topnav, page);
      } else if (page === 'resume-share.html') {
        _renderShare(topnav);
      } else {
        _renderApp(topnav, page);
      }
    },

    updateNavLinks(page) {
      _updateNavLinks(page || '');
    },

    openDropdown:  _openDropdown,
    closeDropdown: _closeDropdown,
    openDrawer:    _openMobileDrawer,
    closeDrawer:   _closeMobileDrawer,
  };

  window.NavigationManager = NavigationManager;
})();
