const fs = require('fs');
const path = require('path');

const htmlFiles = [
  'index.html',
  'dashboard.html',
  'settings.html',
  'resume.html',
  'cover-letter.html',
  'cold-email.html',
  'interview.html'
];

htmlFiles.forEach(file => {
  const p = path.join(__dirname, '..', file);
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, 'utf8');
  console.log(`\n=== CLASSES IN ${file} ===`);
  const classMatches = content.match(/class=["'][^"']*["']/g) || [];
  const uniqClasses = [...new Set(classMatches.map(c => c.replace(/class=["']|["']/g, '').trim()))];
  uniqClasses.forEach(c => {
    if (c.includes('glow') || c.includes('bg') || c.includes('decor') || c.includes('hero') || c.includes('preview') || c.includes('block') || c.includes('card') || c.includes('avatar') || c.includes('gradient')) {
      console.log(`  ${c}`);
    }
  });
});
