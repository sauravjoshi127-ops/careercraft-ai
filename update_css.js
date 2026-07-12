const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'styles', 'premium.css');
let css = fs.readFileSync(cssPath, 'utf8');

// 1. Update the legacy nav selector
css = css.replace(/nav, \.topnav \{/g, 'nav:not(.ch-nav), .topnav:not(.ch-nav) {');

// 2. Update .container max-width
css = css.replace(/\.container \{\s*max-width: 1200px;/g, '.container {\n  max-width: 1280px;');

// 3. Replace CC-NAV block with CH-NAV block
const ccNavStartStr = 'CC-NAV COMPONENT SYSTEM v1.0';
const startIndexStr = css.indexOf(ccNavStartStr);
const startIndex = css.lastIndexOf('/*', startIndexStr);
const endIndex = css.indexOf('/* ═══════════════════════════════════════════════════════════════ */', startIndex + 50);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find cc-nav block", {startIndex, endIndex, startIndexStr});
  process.exit(1);
}

const newChNavCSS = `/* ═══════════════════════════════════════════════════════════════
   CH-NAV COMPONENT SYSTEM v3.0
   Unified navigation for Career Hub
   Class namespace: ch-nav__
   ─────────────────────────────────────────────────────────────── */

.ch-nav {
  position: sticky;
  top: 0;
  z-index: 1000;
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 24px;
  background: rgba(10, 12, 18, 0);
  border-bottom: 1px solid transparent;
  transition:
    background 0.2s ease-out,
    border-color 0.2s ease-out,
    box-shadow 0.2s ease-out;
}

.ch-nav--scrolled {
  background: rgba(10, 12, 18, 0.82);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03), 0 4px 16px rgba(0, 0, 0, 0.24);
}

.ch-nav--opaque {
  background: rgba(10, 12, 18, 0.82);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

@keyframes ch-nav-in {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.ch-nav { animation: ch-nav-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

.ch-nav__inner {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  width: 100%;
  height: 100%;
  max-width: 1280px;
  margin: 0 auto;
}

/* ─── Left zone: Logo ─── */
.ch-nav__logo-zone {
  display: flex;
  align-items: center;
}

.ch-nav__logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Outfit', sans-serif;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-1);
  letter-spacing: -0.025em;
  text-decoration: none;
  transition: opacity 150ms ease-out;
}
.ch-nav__logo:hover { opacity: 0.8; }
.ch-nav__logo svg { color: var(--accent); flex-shrink: 0; }

/* ─── Center zone: Primary links ─── */
.ch-nav__link-zone {
  display: flex;
  align-items: center;
  justify-content: center;
}

.ch-nav__links {
  display: flex;
  align-items: center;
  gap: 4px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.ch-nav__link {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-2);
  border-radius: 6px;
  text-decoration: none;
  transition: color 150ms ease-out, background 150ms ease-out;
  white-space: nowrap;
}
.ch-nav__link:hover {
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.04);
}
.ch-nav__link--active {
  color: var(--text-1);
  font-weight: 500;
  border-bottom: 2px solid var(--accent);
  border-radius: 0;
  background: transparent;
  padding-bottom: 4px; /* 6px - 2px */
}
.ch-nav__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 6px;
}

/* ─── Right zone: Actions cluster ─── */
.ch-nav__util-zone {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

/* Command palette trigger ⌘K */
.ch-nav__cmd-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 32px;
  padding: 0 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;
  color: var(--text-3);
  cursor: pointer;
  transition: background 150ms ease-out, color 150ms ease-out, border-color 150ms ease-out;
}
.ch-nav__cmd-btn:hover {
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-2);
  border-color: rgba(255, 255, 255, 0.14);
}
.ch-nav__cmd-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.ch-nav__cmd-kbd {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 500;
}

/* Workspace toggle pill */
.ch-nav__workspace {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-2);
  cursor: pointer;
  transition: background 150ms ease-out, border-color 150ms ease-out, color 150ms ease-out;
  white-space: nowrap;
}
.ch-nav__workspace:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.14);
  color: var(--text-1);
}
.ch-nav__workspace:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.ch-nav__ws-icon {
  width: 14px;
  height: 14px;
  color: var(--text-3);
}

/* Upgrade CTA */
.ch-nav__upgrade {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  background: rgba(99, 102, 241, 0.10);
  border: 1px solid rgba(99, 102, 241, 0.22);
  border-radius: 999px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: #a5b4fc;
  cursor: pointer;
  text-decoration: none;
  transition: background 150ms ease-out, border-color 150ms ease-out, color 150ms ease-out;
  white-space: nowrap;
  position: relative;
  overflow: hidden;
}
.ch-nav__upgrade:hover {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.35);
  color: #c4b5fd;
}
.ch-nav__upgrade:hover::after {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(165, 180, 252, 0.15), transparent);
  animation: ch-upgrade-shimmer 2s ease infinite;
}
.ch-nav__upgrade:not(:hover)::after {
  animation-play-state: paused;
}
@keyframes ch-upgrade-shimmer {
  0%   { left: -100%; }
  100% { left: 100%; }
}
.ch-nav__upgrade:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Avatar button ─── */
.ch-nav__avatar {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: transparent;
  border: none;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.ch-nav__avatar-inner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.14));
  border: 1.5px solid rgba(255,255,255,0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Outfit', sans-serif;
  font-weight: 700;
  font-size: 13px;
  color: var(--text-1);
  transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
}
.ch-nav__avatar:hover .ch-nav__avatar-inner {
  border-color: rgba(255,255,255,0.28);
}
.ch-nav__avatar--open .ch-nav__avatar-inner {
  border-color: rgba(255,255,255,0.28);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.22);
}
.ch-nav__avatar:focus-visible .ch-nav__avatar-inner {
  outline: none;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.40);
}

/* ─── Profile Dropdown ─── */
.ch-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 220px;
  background: #141520;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06);
  z-index: 2000;
  overflow: hidden;
  opacity: 0;
  transform: scale(0.97) translateY(-4px);
  transform-origin: top right;
  pointer-events: none;
  transition: opacity 160ms cubic-bezier(0.16, 1, 0.3, 1), transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.ch-dropdown--open {
  opacity: 1;
  transform: scale(1) translateY(0);
  pointer-events: auto;
}

.ch-nav__avatar-wrap {
  position: relative;
}

.ch-dropdown__header {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.ch-dropdown__name {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ch-dropdown__email {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ch-dropdown__plan {
  display: inline-flex;
  align-items: center;
  margin-top: 6px;
  padding: 2px 8px;
  background: rgba(99, 102, 241, 0.10);
  border: 1px solid rgba(99, 102, 241, 0.22);
  border-radius: 999px;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #a5b4fc;
}
.ch-dropdown__plan--pro {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.22);
  color: #6ee7b7;
}

.ch-dropdown__section {
  padding: 6px;
}

.ch-dropdown__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-2);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-decoration: none;
  font-family: 'Inter', sans-serif;
  transition: background 150ms ease-out, color 150ms ease-out;
  text-align: left;
}
.ch-dropdown__item svg {
  width: 16px;
  height: 16px;
  opacity: 0.65;
  flex-shrink: 0;
  transition: opacity 150ms ease-out;
}
.ch-dropdown__item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-1);
}
.ch-dropdown__item:hover svg { opacity: 1; }
.ch-dropdown__item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.ch-dropdown__item--danger { color: #fca5a5; }
.ch-dropdown__item--danger:hover { background: rgba(239, 68, 68, 0.08); color: #fca5a5; }
.ch-dropdown__item--danger svg { color: #ef4444; }

.ch-dropdown__kbd {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
  font-family: 'Inter', sans-serif;
}
.ch-dropdown__item:hover .ch-dropdown__kbd {
  color: var(--text-2);
}

.ch-dropdown__divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin: 4px 0;
}

/* ─── Landing page nav links ─── */
.ch-nav__landing-links {
  display: flex;
  align-items: center;
  gap: 4px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.ch-nav__landing-link {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-2);
  border-radius: 6px;
  text-decoration: none;
  transition: color 150ms ease-out, background 150ms ease-out;
}
.ch-nav__landing-link:hover {
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.04);
}

/* Landing CTA buttons */
.ch-nav__signin {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-2);
  border-radius: 6px;
  text-decoration: none;
  transition: color 150ms ease-out, background 150ms ease-out;
  border: none;
  background: transparent;
  cursor: pointer;
}
.ch-nav__signin:hover { color: var(--text-1); background: rgba(255, 255, 255, 0.04); }

.ch-nav__cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: var(--accent);
  border-radius: 6px;
  text-decoration: none;
  transition: background 150ms ease-out, transform 150ms ease-out, box-shadow 150ms ease-out;
  white-space: nowrap;
  border: none;
  cursor: pointer;
}
.ch-nav__cta:hover {
  background: var(--gradient-cyan);
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.25);
}
.ch-nav__cta:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Auth/slim nav back link */
.ch-nav__back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-2);
  border-radius: 6px;
  text-decoration: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  transition: color 150ms ease-out, background 150ms ease-out, border-color 150ms ease-out;
}
.ch-nav__back:hover {
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.18);
}

/* ─── Hamburger button ─── */
.ch-hamburger {
  display: none;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: background 150ms ease-out, border-color 150ms ease-out;
  flex-shrink: 0;
  padding: 0;
}
.ch-hamburger:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.16);
}
.ch-hamburger:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ch-hamburger__bar {
  width: 16px;
  height: 1.5px;
  background: var(--text-2);
  border-radius: 1px;
  transform-origin: center;
  transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease;
}
.ch-hamburger--open .ch-hamburger__bar:nth-child(1) { transform: translateY(5.5px) rotate(45deg); }
.ch-hamburger--open .ch-hamburger__bar:nth-child(2) { opacity: 0; transform: scaleX(0); }
.ch-hamburger--open .ch-hamburger__bar:nth-child(3) { transform: translateY(-5.5px) rotate(-45deg); }

/* ─── Mobile drawer ─── */
.ch-drawer__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1100;
  opacity: 0;
  pointer-events: none;
  transition: opacity 280ms ease;
}
.ch-drawer__backdrop--open {
  opacity: 1;
  pointer-events: auto;
}

/* No backdrop-filter on nav when drawer is open */
.ch-nav--no-glass {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.ch-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(320px, 90vw);
  background: #0d0f18;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 1200;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
  overflow-y: auto;
}
.ch-drawer--open {
  transform: translateX(0);
}

.ch-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  height: 64px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}
.ch-drawer__close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-2);
  cursor: pointer;
  transition: background 150ms ease-out, color 150ms ease-out;
}
.ch-drawer__close:hover { background: rgba(255, 255, 255, 0.08); color: var(--text-1); }
.ch-drawer__close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.ch-drawer__body {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.ch-drawer__section-label {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
  padding: 8px 10px 4px;
}

.ch-drawer__link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-2);
  text-decoration: none;
  border-radius: 6px;
  transition: background 150ms ease-out, color 150ms ease-out;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}
.ch-drawer__link svg {
  width: 20px;
  height: 20px;
  opacity: 0.55;
  flex-shrink: 0;
  transition: opacity 150ms ease-out;
}
.ch-drawer__link:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-1);
}
.ch-drawer__link:hover svg { opacity: 0.85; }
.ch-drawer__link--active {
  color: var(--text-1);
  background: rgba(99, 102, 241, 0.08);
  font-weight: 500;
  border-left: 2px solid var(--accent);
  border-radius: 0 6px 6px 0;
}
.ch-drawer__link--active svg { opacity: 1; }
.ch-drawer__link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ch-drawer__link--danger { color: #fca5a5; }
.ch-drawer__link--danger:hover { background: rgba(239, 68, 68, 0.07); }

.ch-drawer__divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin: 8px 4px;
}

/* Workspace toggle in drawer — full width */
.ch-drawer__workspace {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-2);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 6px;
  cursor: pointer;
  transition: background 150ms ease-out, border-color 150ms ease-out;
  width: 100%;
  text-align: left;
}
.ch-drawer__workspace:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.13);
  color: var(--text-1);
}

/* Upgrade CTA in drawer */
.ch-drawer__upgrade {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: 6px;
  cursor: pointer;
  text-decoration: none;
  transition: background 150ms ease-out, border-color 150ms ease-out;
  width: 100%;
  text-align: center;
}
.ch-drawer__upgrade:hover {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.35);
  color: #c4b5fd;
}

/* Account Info in Drawer */
.ch-drawer__account {
  padding: 8px 14px;
}
.ch-drawer__name {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
}
.ch-drawer__email {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: var(--text-3);
  margin-top: 2px;
}

/* ─── RESPONSIVE BREAKPOINTS ─── */
@media (max-width: 1024px) {
  .ch-nav__util-zone .ch-nav__workspace {
    /* Optionally hide text here if space is tight */
  }
}

@media (max-width: 880px) {
  /* Hide center links, show hamburger */
  .ch-nav__link-zone     { display: none; }
  .ch-nav__landing-links { display: none; }
  .ch-nav__util-zone .ch-nav__cmd-btn   { display: none; }
  .ch-nav__util-zone .ch-nav__workspace { display: none; }
  .ch-nav__util-zone .ch-nav__upgrade   { display: none; }
  .ch-hamburger          { display: flex; }
}

@media (max-width: 480px) {
  .ch-nav { padding: 0 16px; }
}
`;

css = css.substring(0, startIndex) + newChNavCSS + '\n' + css.substring(endIndex + 73);

fs.writeFileSync(cssPath, css);
console.log('Successfully updated premium.css');
