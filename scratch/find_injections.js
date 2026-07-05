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
  console.log(`\n=== STYLES IN ${f} ===`);
  
  // Find <style> tags and their contents
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = styleRegex.exec(content)) !== null) {
    console.log(`Found <style> tag:`);
    console.log(match[1].trim());
  }

  // Find dynamic style injections like insertAdjacentHTML or innerHTML with styles
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('style=') || line.includes('createElement(\'style\')') || line.includes('document.head.appendChild')) {
      console.log(`[Line ${idx+1}] ${line.trim()}`);
    }
  });
});
