const fs = require('fs');

function fix(file) {
    let c = fs.readFileSync(file, 'utf8');
    
    // Find every instance of <script${p1}></script> and replace it
    // Use split/join to avoid regex escaping issues with ${p1}
    const broken = '<script${p1}></script>';
    
    // In resume.html, we have specific contexts
    if (file === 'resume.html') {
        c = c.replace('    <script${p1}></script>\\n<script${p1}></script></body></html>\`;', 
                      '    <script src="ambient3d.js"><\\\\/script>\\n<script src="wow-effects.js"><\\\\/script></body></html>\`;');
        
        // Let\\'s just do a blanket replace of the broken tag
        c = c.split('<script\${p1}></script>').join('<script src="ambient3d.js"></script>');
    } else {
        c = c.split('<script\${p1}></script>').join('<script src="ambient3d.js"></script>');
    }
    
    // Now fix the internal strings to be escaped
    c = c.replace(/<script src="ambient3d\\.js"><\\/script>/g, '<script src="ambient3d.js"><\\\\/script>');
    c = c.replace(/<script src="wow-effects\\.js"><\\/script>/g, '<script src="wow-effects.js"><\\\\/script>');
    
    fs.writeFileSync(file, c, 'utf8');
}

fix('resume.html');
fix('interview.html');
fix('cover-letter.html');
