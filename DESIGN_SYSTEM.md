# Career Hub Design System

This document outlines the core principles and component standards for the Career Hub platform, ensuring a unified, premium SaaS experience.

## 1. Core Principles

- **Invisible Utility:** UI should fade into the background. The user's content is the focus.
- **Precision Spacing:** Use strict 8-point grid math for padding and margins. No arbitrary spacing.
- **Micro-interactions:** Interactive elements should respond immediately with subtle (150ms-250ms) transitions. No bouncy or exaggerated animations.
- **Restrained Depth:** Avoid heavy drop shadows. Use subtle borders (e.g., `rgba(255, 255, 255, 0.08)`) and controlled box-shadows to establish elevation.

## 2. Global Tokens (CSS Variables)

```css
:root {
  /* Typography */
  --font-display: 'Outfit', sans-serif;
  --font-body: 'Inter', sans-serif;

  /* Neutrals */
  --bg-base: #0a0c12;
  --bg-surface: rgba(255, 255, 255, 0.04);
  --border-subtle: rgba(255, 255, 255, 0.08);

  /* Text */
  --text-1: #ffffff;         /* Primary */
  --text-2: #a1a1aa;         /* Secondary */
  --text-3: #71717a;         /* Tertiary / Disabled */

  /* Accents */
  --accent: #6366f1;         /* Indigo */
}
```

## 3. Navigation Component (`ch-nav`)

The global navigation component represents the top-level architectural layout of the app. It adheres to a strict 3-column grid structure.

- **Height:** 64px
- **Width Constraint:** `max-width: 1280px`
- **Prefix Namespace:** `.ch-nav__*`

### Grid Structure
```css
.ch-nav__inner {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
}
```
1. **Logo Zone:** Left-aligned, no gradient text. 15px font size.
2. **Link Zone:** Center-aligned. Links have an active state marked by a 2px bottom border (`var(--accent)`).
3. **Utility Zone:** Right-aligned cluster containing Workspace Toggle, Search, and Avatar.

### Scroll Behavior
- The navigation starts completely transparent.
- Scrolling down past `24px` triggers the `.ch-nav--scrolled` class.
- Glass effect: `background: rgba(10, 12, 18, 0.82)`, `backdrop-filter: blur(16px)`.

### Mobile Drawer (`ch-drawer`)
- Renders synchronously on load (no async DOM injection) but stays hidden off-screen (`transform: translateX(100%)`).
- Uses standard `#0d0f18` background instead of glassmorphism to improve scrolling performance on lower-end mobile devices.
- Uses semantic structure with labeled sections (Navigation, Workspace, Account).

## 4. Typography

- **Headings:** Always use `Outfit` font family. Letter spacing should be slightly tightened (e.g., `-0.025em`) for larger display text.
- **UI Elements:** Use `Inter` font family (14px). Font weight 500 for standard links, 600 for primary actions.

## 5. Interactions

- **Hover States:** Most elements should lighten background (`rgba(255, 255, 255, 0.04)` to `0.08`) and change border colors, rather than scaling up.
- **Focus Rings:** Use a 2px solid ring (`var(--accent)`) with a 2px offset.
- **Timing:** 
  - Color changes: `150ms ease-out`.
  - Layout shifts (e.g., Drawer sliding): `260ms cubic-bezier(0.16, 1, 0.3, 1)`.
