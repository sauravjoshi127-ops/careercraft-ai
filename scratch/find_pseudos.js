const fs = require('fs');
const path = require('path');

const cssFiles = [
  'styles/premium.css',
  'manual-studio.css'
];

cssFiles.forEach(file => {
  const p = path.join(__dirname, '..', file);
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, 'utf8');
  console.log(`\n=== PSEUDOS IN ${file} ===`);
  const matches = content.match(/[^\n]*:(:)?(before|after)[^\n]*/gi) || [];
  matches.forEach(m => console.log(m.trim()));
});
