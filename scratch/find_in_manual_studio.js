const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '..', 'manual-studio.js'), 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('profile') || line.includes('avatar') || line.includes('banner') || line.includes('header')) {
    console.log(`[Line ${idx + 1}] ${line.trim()}`);
  }
});
