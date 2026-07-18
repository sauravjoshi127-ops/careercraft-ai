const fs = require('fs');
const file = 'c:/Users/saura/.gemini/antigravity-ide/scratch/careercraft-ai/resume-renderer.js';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/\\\`/g, '`');
content = content.replace(/\\\$/g, '$');
fs.writeFileSync(file, content);
