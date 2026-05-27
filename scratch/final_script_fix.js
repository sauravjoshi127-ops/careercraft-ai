const fs = require('fs');

function fixScripts(filename) {
    let content = fs.readFileSync(filename, 'utf8');
    
    // Replace all occurrences of </script> with <\/script>
    // This safely escapes them for use inside JS strings.
    content = content.replace(/<\/script>/g, '<\\/script>');
    
    // Now, find the REAL script tags that should NOT be escaped.
    // 1. Tags in the head (usually <script src="..."></script>)
    // These usually have a <script src= preceding them on the same line or nearby.
    content = content.replace(/<script([^>]+)><\\\/script>/g, (match, p1) => {
        // If it's in the head or bootstrap area, it might be real.
        // For this project, let's just unescape it if it's NOT followed by a backtick.
        return `<script\${p1}></script>`;
    });

    // 2. The main closing tag of the page script.
    // This is typically the last <\/script> in the file.
    const lastIdx = content.lastIndexOf('<\\/script>');
    if (lastIdx > -1) {
        content = content.substring(0, lastIdx) + '</script>' + content.substring(lastIdx + 10);
    }

    fs.writeFileSync(filename, content, 'utf8');
    console.log(`Fixed scripts in \${filename}`);
}

fixScripts('resume.html');
fixScripts('interview.html');
fixScripts('cover-letter.html');
