const fs = require('fs');

function restore(file) {
    let c = fs.readFileSync(file, 'utf8');
    
    const tags = '\n<script src="ambient3d.js"></script>\n<script src="wow-effects.js"></script>';
    
    // Insert before </body>
    if (c.includes('</body>') && !c.includes('ambient3d.js')) {
        c = c.replace('</body>', tags + '</body>');
    }
    
    fs.writeFileSync(file, c, 'utf8');
}

restore('resume.html');
restore('interview.html');
restore('cover-letter.html');
