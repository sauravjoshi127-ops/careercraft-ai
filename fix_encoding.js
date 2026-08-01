const fs = require('fs');

function fixHTML() {
    let text = fs.readFileSync('cover-letter.html', 'utf-8');
    
    // Remove BOM if present
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }
    
    text = text.replace(/â”€â”€/g, '--');
    text = text.replace(/â† /g, '←');
    text = text.replace(/âœ•/g, '<i data-lucide="x" width="16"></i>');
    text = text.replace(/ðŸ“ /g, '<i data-lucide="file-text" width="48" height="48"></i>');
    text = text.replace(/â— /g, '<i data-lucide="check-circle" width="14"></i>');
    text = text.replace(/—/g, '—'); // Keep em dashes
    
    // It's also requested to use lucide icons. So we inject lucide if it's missing in <head>.
    // It should already be there from last time, but just in case:
    if (!text.includes('lucide@latest')) {
        text = text.replace('</head>', '  <script src="https://unpkg.com/lucide@latest"></script>\n</head>');
    }
    
    fs.writeFileSync('cover-letter.html', text, 'utf-8');
    console.log("Fixed remaining html mojibake");
}

fixHTML();
