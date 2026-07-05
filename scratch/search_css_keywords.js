const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '..', 'manual-studio.css'), 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('avatar') || line.includes('banner') || line.includes('header') || line.includes('logo')) {
    console.log(`[Line ${idx + 1}] ${line.trim()}`);
  }
});
