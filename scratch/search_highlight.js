const fs = require('fs');
const path = require('path');

const files = [
  'index.html',
  'dashboard.html',
  'settings.html',
  'resume.html',
  'cover-letter.html',
  'cold-email.html',
  'interview.html',
  'app-sdk.js',
  'manual-studio.js'
];

files.forEach(f => {
  const p = path.join(__dirname, '..', f);
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('highlight')) {
      console.log(`[${f}:${idx + 1}] ${line.trim()}`);
    }
  });
});
