const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..'); // careercraft-ai dir

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    content = content.replace(/font-family:\s*[^;]*Inter[^;]*;/gi, '');
    content = content.replace(/font-family:\s*[^;]*Outfit[^;]*;/gi, '');
    content = content.replace(/font-family:\s*[^;]*-apple-system[^;]*;/gi, '');
    
    if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated fonts in ${filePath}`);
    }
}

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            const base = path.basename(fullPath);
            if (base !== 'node_modules' && base !== '.git' && base !== 'scratch') {
                walk(fullPath);
            }
        } else if (fullPath.endsWith('.html') || fullPath.endsWith('.css')) {
            processFile(fullPath);
        }
    }
}

walk(rootDir);
console.log('Done stripping old fonts.');
