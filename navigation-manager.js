/**
 * navigation-manager.js
 * CareerCraft AI — Unified Navigation System v2.0
 *
 * Renders and controls the application navigation across all pages.
 * Components: logo, primary links, workspace toggle, upgrade CTA,
 * profile dropdown, mobile drawer, scroll glass effect, keyboard nav.
 *
 * CSS: styles/premium.css — cc-nav__* namespace
 * Entry: layout-manager.js → NavigationManager.renderNavbarBase(nav, page)
 */
(function () {
  'use strict';

  /* ── SVG icon helpers ──────────────────────────────────── */
  const ICONS = {
    logo: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
  };

  /* ── Internal state ────────────────────────────────────── */
  let _dropdownOpen = false;
  let _drawerOpen   = false;
  let _scrollListener = null;
  let _clickOutsideListener = null;
  let _keyboardListener = null;
  let _currentNav = null;

  /* ── Page matcher helpers ──────────────────────────────── */
  function _isPage(page, prefix) {
    return page.startsWith(prefix);
  }

  function _activeClass(page, prefix) {
    return _isPage(page, prefix) ? ' cc-nav__link--active' : '';
  }

  function _activeDrawerClass(page, prefix) {
    return _isPage(page, prefix) ? ' cc-drawer__link--active' : '';
  }

  /* ── Build: Logo ───────────────────────────────────────── */
  function _buildLogo(href) {
    return `
      <a href="${href}" class="cc-nav__logo" aria-label="CareerCraft AI — Home">
        ${ICONS.logo}
        <span class="cc-nav__logo-word">CareerCraft AI</span>
      </a>`;
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
    if (!isManual) {
      links.push({ href: 'interview.html', label: 'Interview Coach', prefix: 'interview' });
    }

    const items = links.map(l =>
      `<a href="${l.href}" class="cc-nav__link${_activeClass(page, l.prefix)}"
          ${_isPage(page, l.prefix) ? 'aria-current="page"' : ''}>${l.label}</a>`
    ).join('');

    return `<nav class="cc-nav__links" aria-label="Primary navigation">${items}</nav>`;
  }

  /* ── Build: Workspace pill ─────────────────────────────── */
  function _buildWorkspacePill(ws) {
    const isManual = (ws === 'manual');
    const label    = isManual ? 'Creator Studio' : 'AI Studio';
    const dotClass = isManual ? 'cc-nav__ws-dot--creator' : 'cc-nav__ws-dot--ai';
    return `
      <button type="button" class="cc-nav__workspace" id="cc-workspace-toggle"
              onclick="window.WorkspaceManager && window.WorkspaceManager.toggle()"
              title="Switch workspace" aria-label="Switch workspace: currently ${label}">
        <span class="cc-nav__ws-dot ${dotClass}"></span>
        <span>${label}</span>
        <span class="cc-nav__ws-swap" aria-hidden="true">⇄</span>
      </button>`;
  }

  /* ── Build: Upgrade CTA ────────────────────────────────── */
  function _buildUpgradeBtn() {
    return `
      <a href="dashboard.html#pricing" class="cc-nav__upgrade" id="cc-upgrade-btn"
         title="Upgrade to Pro" aria-label="Upgrade to CareerCraft Pro">
        ${ICONS.upgrade}
        Upgrade
      </a>`;
  }

  /* ── Build: Command palette trigger ────────────────────── */
  function _buildCmdBtn() {
    return `
      <button type="button" class="cc-nav__cmd-btn" id="cc-cmd-btn"
              title="Open command palette" aria-label="Open command palette (Ctrl+K)">
        ${ICONS.cmd}
        <span>Search</span>
        <span class="cc-nav__cmd-kbd">⌘K</span>
      </button>`;
  }

  /* ── Build: Avatar + Dropdown ──────────────────────────── */
  function _buildAvatarZone(initial, name, email, isPro) {
    const planLabel = isPro ? 'Pro' : 'Free';
    const planClass = isPro ? 'cc-dropdown__plan cc-dropdown__plan--pro' : 'cc-dropdown__plan';

    return `
      <div class="cc-nav__avatar-wrap">
        <button type="button"
                class="cc-nav__avatar"
                id="cc-avatar-btn"
                aria-haspopup="true"
                aria-expanded="false"
                aria-controls="cc-dropdown"
                title="Open account menu">
          <span class="cc-nav__avatar-inner" aria-hidden="true">${initial}</span>
        </button>

        <div class="cc-dropdown"
             id="cc-dropdown"
             role="menu"
             aria-labelledby="cc-avatar-btn"
             aria-hidden="true">

          <div class="cc-dropdown__header">
            <div class="cc-dropdown__name">${name}</div>
            <div class="cc-dropdown__email">${email}</div>
            <span class="${planClass}">${planLabel} Plan</span>
          </div>

          <div class="cc-dropdown__section">
            <a href="settings.html" class="cc-dropdown__item" role="menuitem">
              ${ICONS.user}
              Profile &amp; Settings
            </a>
            <div class="cc-dropdown__divider" role="separator"></div>
            <button type="button" class="cc-dropdown__item cc-dropdown__item--danger"
                    id="cc-signout-btn" role="menuitem">
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
              class="cc-hamburger"
              id="cc-hamburger"
              aria-label="Open navigation menu"
              aria-expanded="false"
              aria-controls="cc-drawer">
        <span class="cc-hamburger__bar"></span>
        <span class="cc-hamburger__bar"></span>
        <span class="cc-hamburger__bar"></span>
      </button>`;
  }

  /* ── Build: Mobile drawer ──────────────────────────────── */
  function _buildDrawer(page, ws, initial, name, email) {
    const isManual = (ws === 'manual');
    const wsLabel  = isManual ? 'Creator Studio' : 'AI Studio';
    const wsDotCls = isManual ? 'cc-nav__ws-dot--creator' : 'cc-nav__ws-dot--ai';

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
      `<a href="${t.href}" class="cc-drawer__link${_activeDrawerClass(page, t.prefix)}"
          ${_isPage(page, t.prefix) ? 'aria-current="page"' : ''}>
        ${t.icon}${t.label}
      </a>`
    ).join('');

    return `
      <div class="cc-drawer__backdrop" id="cc-drawer-backdrop" aria-hidden="true"></div>
      <div class="cc-drawer" id="cc-drawer" role="dialog" aria-modal="true" aria-label="Navigation menu">
        <div class="cc-drawer__header">
          ${_buildLogo('dashboard.html')}
          <button type="button" class="cc-drawer__close" id="cc-drawer-close"
                  aria-label="Close navigation menu">
            ${ICONS.close}
          </button>
        </div>
        <div class="cc-drawer__body">
          <div class="cc-drawer__section-label">Tools</div>
          ${toolLinks}

          <div class="cc-drawer__divider"></div>

          <button type="button" class="cc-drawer__workspace" id="cc-drawer-workspace"
                  onclick="window.WorkspaceManager && window.WorkspaceManager.toggle()"
                  aria-label="Switch workspace: currently ${wsLabel}">
            <span class="cc-nav__ws-dot ${wsDotCls}"></span>
            <span>${wsLabel}</span>
            <span class="cc-nav__ws-swap" aria-hidden="true">⇄</span>
          </button>

          <div class="cc-drawer__divider"></div>

          <a href="dashboard.html#pricing" class="cc-drawer__upgrade" id="cc-drawer-upgrade">
            ${ICONS.upgrade}
            Upgrade to Pro
          </a>

          <div class="cc-drawer__divider"></div>

          <a href="settings.html" class="cc-drawer__link">
            ${ICONS.settings}
            Settings
          </a>
          <button type="button" class="cc-drawer__link cc-drawer__link--danger"
                  id="cc-drawer-signout">
            ${ICONS.signout}
            Sign Out
          </button>
        </div>
      </div>`;
  }

  /* ── Render variants ───────────────────────────────────── */

  function _renderLanding(topnav) {
    topnav.className = 'cc-nav cc-nav--opaque';
    topnav.setAttribute('aria-label', 'Main navigation');

    topnav.innerHTML = `
      <div class="cc-nav__inner">
        ${_buildLogo('index.html')}

        <nav class="cc-nav__landing-links" aria-label="Primary navigation">
          <a href="#features" class="cc-nav__landing-link">Features</a>
          <a href="#pricing"  class="cc-nav__landing-link">Pricing</a>
          <a href="#"         class="cc-nav__landing-link">Enterprise</a>
        </nav>

        <div class="cc-nav__right" id="cc-landing-actions">
          <a href="login.html"  class="cc-nav__signin">Sign In</a>
          <a href="signup.html" class="cc-nav__cta">Get Started</a>
        </div>
        ${_buildHamburger()}
      </div>
      ${_buildDrawerLanding()}
    `;

    // Check auth: swap buttons → Dashboard + Avatar
    if (window.AuthManager) {
      window.AuthManager.getSession().then(session => {
        if (!session) return;
        const actions = document.getElementById('cc-landing-actions');
        if (!actions) return;
        const name = session.user.user_metadata?.full_name
          || localStorage.getItem('userName')
          || session.user.email.split('@')[0];
        const initial = name.charAt(0).toUpperCase();
        actions.innerHTML = `
          <a href="dashboard.html" class="cc-nav__cta">Dashboard</a>
          <a href="settings.html"  class="cc-nav__avatar" style="display:inline-flex;width:34px;height:34px;border-radius:50%;border:none;padding:0;">
            <span class="cc-nav__avatar-inner">${initial}</span>
          </a>`;
      });
    }

    _initMobileDrawer(topnav);
  }

  function _buildDrawerLanding() {
    return `
      <div class="cc-drawer__backdrop" id="cc-drawer-backdrop" aria-hidden="true"></div>
      <div class="cc-drawer" id="cc-drawer" role="dialog" aria-modal="true" aria-label="Navigation menu">
        <div class="cc-drawer__header">
          ${_buildLogo('index.html')}
          <button type="button" class="cc-drawer__close" id="cc-drawer-close" aria-label="Close navigation menu">
            ${ICONS.close}
          </button>
        </div>
        <div class="cc-drawer__body">
          <a href="#features" class="cc-drawer__link">${ICONS.cmd} Features</a>
          <a href="#pricing"  class="cc-drawer__link">${ICONS.upgrade} Pricing</a>
          <div class="cc-drawer__divider"></div>
          <a href="login.html"  class="cc-drawer__link">${ICONS.user} Sign In</a>
          <a href="signup.html" class="cc-drawer__upgrade">Get Started Free</a>
        </div>
      </div>`;
  }

  function _renderAuth(topnav, page) {
    topnav.className = 'cc-nav cc-nav--opaque';
    topnav.setAttribute('aria-label', 'Main navigation');

    topnav.innerHTML = `
      <div class="cc-nav__inner">
        ${_buildLogo('index.html')}
        <div class="cc-nav__right">
          <a href="index.html" class="cc-nav__back">
            ${ICONS.arrowLeft}
            Back to Home
          </a>
        </div>
      </div>`;
  }

  function _renderShare(topnav) {
    topnav.className = 'cc-nav cc-nav--opaque';
    topnav.setAttribute('aria-label', 'Main navigation');

    topnav.innerHTML = `
      <div class="cc-nav__inner">
        ${_buildLogo('index.html')}
        <div class="cc-nav__right">
          <a href="signup.html" class="cc-nav__cta">Get Started Free</a>
        </div>
      </div>`;
  }

  function _renderApp(topnav, page) {
    topnav.className = 'cc-nav';
    topnav.setAttribute('aria-label', 'Main navigation');

    const ws = window.WorkspaceManager ? window.WorkspaceManager.workspace : 'ai';

    // Skeleton right zone while auth resolves
    topnav.innerHTML = `
      <div class="cc-nav__inner">
        ${_buildLogo('dashboard.html')}
        ${_buildNavLinks(page, ws)}
        <div class="cc-nav__right" id="cc-right-zone">
          ${_buildCmdBtn()}
          ${_buildWorkspacePill(ws)}
          <div style="width:80px;height:28px;background:rgba(255,255,255,0.03);border-radius:999px;"></div>
          <div style="width:34px;height:34px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
        </div>
        ${_buildHamburger()}
      </div>`;

    _initScrollBehavior(topnav);
    _initCmdPalette();

    // Async: resolve auth then rebuild right zone fully
    if (window.AuthManager) {
      window.AuthManager.getSession().then(session => {
        const name  = session
          ? (session.user.user_metadata?.full_name || localStorage.getItem('userName') || session.user.email.split('@')[0])
          : 'User';
        const email   = session ? (session.user.email || '') : '';
        const initial = name.charAt(0).toUpperCase();
        const isPro   = !!(session && session.user.user_metadata?.is_pro);

        const rightZone = document.getElementById('cc-right-zone');
        if (!rightZone) return;

        rightZone.innerHTML =
          _buildCmdBtn() +
          _buildWorkspacePill(ws) +
          (isPro ? '' : _buildUpgradeBtn()) +
          _buildAvatarZone(initial, name, email, isPro);

        // Append mobile drawer (now we have user data)
        const drawerHtml = _buildDrawer(page, ws, initial, name, email);
        const drawerFrag = document.createRange().createContextualFragment(drawerHtml);
        document.body.appendChild(drawerFrag);

        _initDropdown();
        _initMobileDrawer(topnav);
        _initKeyboard(topnav);
        _initCmdPalette();

        // Sign out wiring
        const signoutBtn = document.getElementById('cc-signout-btn');
        if (signoutBtn) {
          signoutBtn.addEventListener('click', () => {
            if (window.AuthManager) window.AuthManager.logout();
          });
        }
        const drawerSignout = document.getElementById('cc-drawer-signout');
        if (drawerSignout) {
          drawerSignout.addEventListener('click', () => {
            if (window.AuthManager) window.AuthManager.logout();
          });
        }
      }).catch(() => {
        // Auth failed silently — leave skeleton
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
      if (window.scrollY > 10) {
        nav.classList.add('cc-nav--scrolled');
      } else {
        nav.classList.remove('cc-nav--scrolled');
      }
    };
    window.addEventListener('scroll', _scrollListener, { passive: true });
    // Run immediately in case page is already scrolled
    _scrollListener();
  }

  /* ── Dropdown ──────────────────────────────────────────── */
  function _initDropdown() {
    const avatarBtn = document.getElementById('cc-avatar-btn');
    const dropdown  = document.getElementById('cc-dropdown');
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
      const wrap = document.querySelector('.cc-nav__avatar-wrap');
      if (wrap && !wrap.contains(e.target)) {
        _closeDropdown();
      }
    };
    document.addEventListener('click', _clickOutsideListener);
  }

  function _openDropdown() {
    const avatarBtn = document.getElementById('cc-avatar-btn');
    const dropdown  = document.getElementById('cc-dropdown');
    if (!avatarBtn || !dropdown) return;
    _dropdownOpen = true;
    dropdown.classList.add('cc-dropdown--open');
    dropdown.setAttribute('aria-hidden', 'false');
    avatarBtn.setAttribute('aria-expanded', 'true');
    avatarBtn.classList.add('cc-nav__avatar--open');
    // Focus first item
    const first = dropdown.querySelector('[role="menuitem"]');
    if (first) setTimeout(() => first.focus(), 20);
  }

  function _closeDropdown() {
    const avatarBtn = document.getElementById('cc-avatar-btn');
    const dropdown  = document.getElementById('cc-dropdown');
    if (!avatarBtn || !dropdown) return;
    _dropdownOpen = false;
    dropdown.classList.remove('cc-dropdown--open');
    dropdown.setAttribute('aria-hidden', 'true');
    avatarBtn.setAttribute('aria-expanded', 'false');
    avatarBtn.classList.remove('cc-nav__avatar--open');
  }

  /* ── Mobile drawer ─────────────────────────────────────── */
  function _openMobileDrawer() {
    const drawer   = document.getElementById('cc-drawer');
    const backdrop = document.getElementById('cc-drawer-backdrop');
    const hamburger= document.getElementById('cc-hamburger');
    if (!drawer) return;
    _drawerOpen = true;
    drawer.classList.add('cc-drawer--open');
    if (backdrop) backdrop.classList.add('cc-drawer__backdrop--open');
    if (hamburger) {
      hamburger.classList.add('cc-hamburger--open');
      hamburger.setAttribute('aria-expanded', 'true');
      hamburger.setAttribute('aria-label', 'Close navigation menu');
    }
    document.body.style.overflow = 'hidden';
    // Focus first focusable item in drawer
    const firstFocusable = drawer.querySelector('a, button');
    if (firstFocusable) setTimeout(() => firstFocusable.focus(), 50);
  }

  function _closeMobileDrawer() {
    const drawer   = document.getElementById('cc-drawer');
    const backdrop = document.getElementById('cc-drawer-backdrop');
    const hamburger= document.getElementById('cc-hamburger');
    if (!drawer) return;
    _drawerOpen = false;
    drawer.classList.remove('cc-drawer--open');
    if (backdrop) backdrop.classList.remove('cc-drawer__backdrop--open');
    if (hamburger) {
      hamburger.classList.remove('cc-hamburger--open');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.setAttribute('aria-label', 'Open navigation menu');
      hamburger.focus();
    }
    document.body.style.overflow = '';
  }

  function _initMobileDrawer(nav) {
    // Hamburger toggle — may already be in DOM
    const hamburger = document.getElementById('cc-hamburger');
    if (hamburger) {
      // Remove any prior listener by cloning
      const fresh = hamburger.cloneNode(true);
      hamburger.parentNode.replaceChild(fresh, hamburger);
      fresh.addEventListener('click', () => {
        _drawerOpen ? _closeMobileDrawer() : _openMobileDrawer();
      });
    }

    // Backdrop click
    const backdrop = document.getElementById('cc-drawer-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', _closeMobileDrawer);
    }

    // Close button
    const closeBtn = document.getElementById('cc-drawer-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', _closeMobileDrawer);
    }

    // Close on link click (navigation)
    const drawer = document.getElementById('cc-drawer');
    if (drawer) {
      drawer.querySelectorAll('a.cc-drawer__link').forEach(link => {
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
        const dropdown = document.getElementById('cc-dropdown');
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
    const cmdBtn = document.getElementById('cc-cmd-btn');
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

  /* ── Update nav links (workspace change) ───────────────── */
  function _updateNavLinks(page) {
    // Update desktop links
    const linksEl = document.querySelector('.cc-nav__links');
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
        `<a href="${l.href}" class="cc-nav__link${_activeClass(page, l.prefix)}"
            ${_isPage(page, l.prefix) ? 'aria-current="page"' : ''}>${l.label}</a>`
      ).join('');
    }

    // Update workspace pill label + dot
    _refreshWorkspacePill();
  }

  function _refreshWorkspacePill() {
    const ws = window.WorkspaceManager ? window.WorkspaceManager.workspace : 'ai';
    const isManual = ws === 'manual';
    const label  = isManual ? 'Creator Studio' : 'AI Studio';
    const dotCls = isManual ? 'cc-nav__ws-dot--creator' : 'cc-nav__ws-dot--ai';

    // Desktop pill
    const pillBtn = document.getElementById('cc-workspace-toggle');
    if (pillBtn) {
      pillBtn.setAttribute('aria-label', `Switch workspace: currently ${label}`);
      const dot  = pillBtn.querySelector('.cc-nav__ws-dot');
      const text = pillBtn.querySelector('span:not(.cc-nav__ws-dot):not(.cc-nav__ws-swap)');
      if (dot)  { dot.className  = `cc-nav__ws-dot ${dotCls}`; }
      if (text) { text.textContent = label; }
    }

    // Drawer workspace button
    const drawerWs = document.getElementById('cc-drawer-workspace');
    if (drawerWs) {
      const dot  = drawerWs.querySelector('.cc-nav__ws-dot');
      const text = drawerWs.querySelector('span:not(.cc-nav__ws-dot):not(.cc-nav__ws-swap)');
      if (dot)  { dot.className  = `cc-nav__ws-dot ${dotCls}`; }
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
