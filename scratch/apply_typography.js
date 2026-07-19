const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'styles', 'premium.css');
let css = fs.readFileSync(cssPath, 'utf8');

const regex = /body\s*\{[^}]*\}\s*h1,h2,h3,h4,h5,h6\s*\{[^}]*\}/;
const newBodyHeadings = `body {
  /* Subtle ambient depth (static) */
  background:
    radial-gradient(900px 650px at 18% 22%, rgba(99,102,241,0.10), transparent 55%),
    radial-gradient(850px 600px at 82% 26%, rgba(168,85,247,0.08), transparent 56%),
    linear-gradient(180deg, rgba(11,13,20,0.98), rgba(11,13,20,1));
  color: var(--text-1);
  font-family: var(--font-primary);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.6;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-primary);
  letter-spacing: -0.02em;
  color: var(--text-1);
  margin-bottom: 0.5rem;
}

h1, .display-title { font-size: 32px; font-weight: 700; line-height: 1.2; letter-spacing: -0.03em; }
h2, .greeting-title { font-size: 28px; font-weight: 700; line-height: 1.25; letter-spacing: -0.025em; }
h3, .page-title { font-size: 24px; font-weight: 600; line-height: 1.3; }
h4, .section-title { font-size: 20px; font-weight: 600; line-height: 1.35; }
h5, .card-title { font-size: 18px; font-weight: 600; line-height: 1.4; }
h6 { font-size: 16px; font-weight: 600; line-height: 1.4; }

p, .body-text { font-family: var(--font-primary); font-size: 16px; font-weight: 400; line-height: 1.6; }
.text-secondary { font-size: 14px; font-weight: 400; line-height: 1.5; color: var(--text-2); }
label, .form-label { font-size: 13px; font-weight: 500; line-height: 1.4; }
.caption-text, small { font-size: 12px; font-weight: 400; line-height: 1.4; color: var(--text-3); }`;

css = css.replace(regex, newBodyHeadings);
fs.writeFileSync(cssPath, css);
console.log('Fixed premium.css body/headings');
