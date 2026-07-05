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
  console.log(`\n=== CSS RULES IN ${file} ===`);
  
  // Split content by selectors (find blocks matching selector { rules })
  const blocks = content.match(/[^{}]+\{[^{}]+\}/g) || [];
  blocks.forEach(block => {
    const cleanBlock = block.trim();
    if (cleanBlock.includes('#7c3aed') || 
        cleanBlock.includes('#a855f7') || 
        cleanBlock.includes('linear-gradient') || 
        cleanBlock.includes('radial-gradient') ||
        cleanBlock.includes('124, 58, 237') || // rgb/rgba for #7c3aed
        cleanBlock.includes('168, 85, 247') || // rgb/rgba for #a855f7
        cleanBlock.includes('purple')) {
      console.log('---');
      console.log(cleanBlock);
    }
  });
});
