const fs = require('fs');
function recover(file) {
    let c = fs.readFileSync(file, 'utf8');
    // Remove the broken p1 tags
    c = c.replace(/<script\$\{p1\}><\/script>/g, '<script src="ambient3d.js"><\\/script>');
    // Escape all </script> first
    c = c.replace(/<\/script>/g, '<\\/script>');
    // Fix the very last one
    const last = c.lastIndexOf('<\\/script>');
    if (last > -1) {
        c = c.substring(0, last) + '</script>' + c.substring(last + 10);
    }
    // Fix common head scripts
    c = c.replace(/<script src="([^"]+)"><\\/script>/g, '<script src="$1"></script>');
    
    fs.writeFileSync(file, c, 'utf8');
}
recover('resume.html');
recover('interview.html');
recover('cover-letter.html');
