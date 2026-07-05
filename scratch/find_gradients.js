const fs = require('fs');
const path = require('path');

const files = [
  'settings.html',
  'index.html',
  'styles/premium.css',
  'app-sdk.js'
];

files.forEach(f => {
  const p = path.join(__dirname, '..', f);
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, 'utf8');
  console.log(`\n=== MATCHES IN ${f} ===`);
  const matches = content.match(/[^\n]*gradient[^\n]*/gi) || [];
  matches.forEach(m => console.log(m.trim()));
});
