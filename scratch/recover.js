const fs = require('fs');

function fixFile(filename) {
    let content = fs.readFileSync(filename, 'utf8');
    
    // Fix the mess I just made with ${p1}
    content = content.replace(/<script\$\{p1\}><\/script>/g, ''); 
    // Wait, let's just restore the correct tags manually in the strings
    
    // The correct pattern for the strings in resume.html:
    const fix1 = '<script src="ambient3d.js"><\\/script>';
    const fix2 = '<script src="wow-effects.js"><\\/script>';
    
    // Replace the broken tags
    content = content.replace(/<script\$\{p1\}><\/script>/g, fix1);
    // Actually, I'll just do a global cleanup and then apply the fix properly
    
    fs.writeFileSync(filename, content, 'utf8');
}

// I'll just rewrite the fix script properly
const recoveryScript = `const fs = require('fs');
function recover(file) {
    let c = fs.readFileSync(file, 'utf8');
    // Remove the broken p1 tags
    c = c.replace(/<script\\$\\{p1\\}><\\/script>/g, '<script src="ambient3d.js"><\\\\/script>');
    // Escape all </script> first
    c = c.replace(/<\\/script>/g, '<\\\\/script>');
    // Fix the very last one
    const last = c.lastIndexOf('<\\\\/script>');
    if (last > -1) {
        c = c.substring(0, last) + '</script>' + c.substring(last + 10);
    }
    // Fix common head scripts
    c = c.replace(/<script src="([^"]+)"><\\\\/script>/g, '<script src="$1"></script>');
    
    fs.writeFileSync(file, c, 'utf8');
}
recover('resume.html');
recover('interview.html');
recover('cover-letter.html');
`;

fs.writeFileSync('scratch/recover_scripts.js', recoveryScript, 'utf8');
console.log('Recovery script written.');
