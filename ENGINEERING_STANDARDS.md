# Engineering Standards

This document defines the core engineering standards, quality standards, and code review checklists for all contributors and AI agents working on the Career Hub codebase.

---

## 1. Project Structure

### Folder Hierarchy
- `/api-handlers/`: Place all backend API route handlers here. Ensure each file exports a single express middleware module.
- `/styles/`: Store design system stylesheets. All global styles, dark theme bindings, and design tokens live in `styles/premium.css`.
- `/tests/`: All unit and integration test suites live here, following the `<module-name>.test.js` naming convention.
- `/utils/`: Keep generic helper libraries, configuration checkers, and loaders here.
- Root: Contains markup files (`*.html`) representing core app views (e.g., `index.html`, `dashboard.html`).

### Naming Conventions
- **Files**: Use kebab-case for JavaScript files (e.g., `storage-manager.js`) and kebab-case for HTML pages (e.g., `cover-letter.html`).
- **CSS Classes**: Use kebab-case (e.g., `.pricing-card-v2`, `.upgrade-card`).
- **Variables / Functions**: Use camelCase (e.g., `initiateCheckout`, `userMetadata`).
- **Constants**: Use UPPER_SNAKE_CASE (e.g., `SUPABASE_URL`, `GEMINI_API_KEY`).

---

## 2. Component Architecture

- **Single Responsibility Principle**: Each module, script, or component must focus on a single task. Avoid monolithic client files; delegate DOM manipulations, storage, and auth to their respective managers.
- **Composition over Duplication**: Keep layout components modular. Reuse CSS grid styles and wrapper elements rather than writing custom wrappers.
- **Line Length Guideline**: As a benchmark for clean, readable code, aim to keep component files under roughly 300 lines where practical. Refactor larger files when it improves maintainability and separation of concerns.
- **Logic & UI Separation**:
  - Keep client scripts (e.g., `resume.js`) clean of inline HTML templates. Use DOM element structures or dynamic layouts managed in `layout-manager.js`.
  - Backend handlers must handle HTTP requests, execute validations, and route outputs without embedding layout-level formatting.

---

## 3. JavaScript & TypeScript Standards

While the current codebase is written in clean, modern ES6+ Javascript, the following guidelines are required for maintaining type hygiene and when writing TypeScript additions:
- **Strict Typing**: Enable `strict` mode in compiler configurations. Do not use generic parameters without constraints when more specific types are known.
- **Avoid Implicit `any`**: The use of `any` is prohibited. If `any` is absolutely required due to library compatibility:
  - Document the reason with a `// TS-SAFEGUARD` comment block.
  - Cast values to specific types immediately upon boundary entry.
- **Prefer Interfaces and Type Safety**: Define strong types/interfaces for all core domain structures (e.g., `UserSession`, `ResumeProfile`, `InterviewScore`).

---

## 4. UI / UX Standards

All UI elements must align with Career Hub's premium minimalist design language:
- **Color System**: Always reference premium CSS variables:
  - Base Background: `#0b0d14` (landing page sections use `#09090B`).
  - Cards / Containers: `#111827`.
  - Primary Accent: Indigo (`--accent` / `#6366f1`).
  - Secondary Highlight: Violet (`--accent-2` / `#a855f7`).
  - Text Colors: White (`--text-1`), Gray (`--text-2`), Muted (`--text-3`).
- **Typography Scale**:
  - Headings: Use `Outfit`, sans-serif (font-weight: 700 or 800).
  - Body: Use `Inter`, sans-serif (font-weight: 400 or 500).
- **Spacing Scale**: Follow the `--sp-` scale. Never use ad-hoc layout pixel widths; layout items must align to values of 8px increments.
- **Animations**:
  - Keep transitions elegant (duration: 250ms - 300ms, using ease or cubic-bezier variables).
  - Include page fade-ups (`.animate-fade-up`) on initial loads.
- **Buttons**:
  - Full-width action buttons on mobile must have height: 52px, border-radius: 14px.
  - Hover states should lift gently (`translateY(-2px)`) and scale transitions smoothly.

---

## 5. Accessibility Standards (WCAG 2.1 compliance)

- **Semantic Layout HTML**: Avoid nested generic `div` trees for key page sections. Use `<header>`, `<nav>`, `<main>`, `<section>`, and `<footer>` elements.
- **Keyboard Navigation**:
  - All buttons, links, and text inputs must be focusable using keyboard navigation.
  - Visibly define focus styles (`outline: 2px solid var(--border-focus); outline-offset: 2px`).
- **Color Contrast**: Verify all copy text meets WCAG AA guidelines (minimum contrast ratio of 4.5:1 against dark backgrounds).
- **Aria Attributes**: Include clear descriptions (`aria-label`, `aria-hidden`) on all visual icon components.

---

## 6. Performance Standards

- **Asset Optimizations**: Optimize vector icons as inline SVGs. Avoid importing heavy external asset libraries.
- **Caching Policies**: Cache configurations and static tokens on the client to avoid unnecessary fetch roundtrips.
- **Layout Shift Mitigation**: Define explicit width and height properties on mocks and dashboard wrappers to prevent layout shifts (CLS).

---

## 7. Security Standards

- **Authentication**: Restrict all client-side pages (e.g., `dashboard.html`, `resume.html`) using secure guards.
- **Input Validation**: Check input parameters at the backend handler layer:
  - File upload payloads must be limited to 5MB.
  - Enforce explicit check-ins on MIME file types.
- **Secret Protection**: Store API keys in `.env` variables. Never commit credentials to the code repository.
- **Rate Limiting**: Apply custom rate-limiting middleware to all Gemini API endpoints to prevent request loops.

---

## 8. AI Engineering Standards

- **Prompt Versioning**: Maintain and document all LLM prompt versions directly inside handler files.
- **Hallucination Mitigation**: Configure low temperatures (e.g., 0.2 to 0.4) for resume suggestions to ensure data critiques are grounded and accurate.
- **Graceful Error Handling**: All LLM queries must include catch blocks that return user-friendly fallback text or structured templates during outages.

---

## 9. API & Database Standards

- **RESTful Endpoints**: Match routes to resource mappings (e.g., `POST /api/upload-resume`, `POST /api/create-order`).
- **Clear Status Codes**: Return standard status codes:
  - `200 OK` / `201 Created` for successes.
  - `400 Bad Request` for parameter validation errors.
  - `401 Unauthorized` / `403 Forbidden` for credential checks.
  - `422 Unprocessable Entity` for parsing errors (e.g., corrupt resumes).
  - `503 Service Unavailable` for gateway or third-party downstream timeouts.

---

## 10. Git Standards

- **Commit Message Format**: Write messages matching `feat: <description>`, `fix: <description>`, or `docs: <description>`.
- **References**: Mention issue trackers or ADR numbers in merge descriptions where applicable.

---

## 11. Code Review Checklist

Before approving any pull request or merge, verify compliance against this checklist:
- [ ] **No Regressions**: Local test suite (`npm test`) passes with 100% success.
- [ ] **Responsive Design**: Viewport scaling is verified down to 320px mobile screens.
- [ ] **Access Compliance**: Contrast matches WCAG AA, focus states are visible.
- [ ] **Secret Hygiene**: Checked that no local keys, `.env` details, or testing credentials got tracked.
- [ ] **Standard Compliance**: Verify design alignment (fonts, variables, buttons) with `premium.css`.
- [ ] **PROJECT_HEALTH.md Updated**: Incremented version tags, added technical debt items, and updated feature logs.
- [ ] **ADR Created**: Added new Architecture Decision Records if architectural structures changed.

---

## 12. Final Rule

If any proposed implementation violates the guidelines outlined in `PROJECT_HEALTH.md`, `ARCHITECTURE_DECISIONS.md`, or `ENGINEERING_STANDARDS.md`, **stop development immediately**. Document the violation, recommend a compliant solution, and proceed only once the implementation fully aligns with these engineering standards.
