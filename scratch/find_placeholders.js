const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const filesToSearch = [
  'index.html',
  'dashboard.html',
  'settings.html',
  'resume.html',
  'cover-letter.html',
  'cold-email.html',
  'interview.html',
  'app-sdk.js',
  'manual-studio.css',
  'styles/premium.css'
];

console.log('=== Searching for Gradient, Background, and Placeholder elements ===');

filesToSearch.forEach(file => {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${file}`);
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, idx) => {
    // Search for purple colors, background gradients, or visual placeholders
    if (line.includes('linear-gradient') || 
        line.includes('radial-gradient') || 
        line.includes('background:') ||
        line.includes('background-image:') ||
        line.includes('placeholder') || 
        line.includes('purple') || 
        line.includes('#7c3aed') ||
        line.includes('#a855f7')) {
      // Print first matching lines with line numbers
      console.log(`[${file}:${idx + 1}] ${line.trim()}`);
    }
  });
});
