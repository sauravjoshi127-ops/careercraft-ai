const fs = require('fs');

function auditFile(filename) {
    console.log(`\n=== Auditing ${filename} ===`);
    const content = fs.readFileSync(filename, 'utf8');
    const lines = content.split('\n');
    let inScript = false;
    let leaks = [];

    lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.includes('<script')) inScript = true;
        
        // If </script> is found, check if it's likely a tag or a string
        if (trimmed.includes('</script>')) {
            // If it's on a line that looks like JS (e.g. ends with ` or contains +)
            if (line.includes('`') || line.includes("'") || line.includes('"')) {
                // If it's NOT just the closing tag at the start of the line
                if (!trimmed.startsWith('</script>')) {
                    leaks.push({ line: i+1, content: trimmed });
                }
            }
            // If it is just </script>, it's probably the end of a block
            if (trimmed === '</script>') {
                inScript = false;
            }
        }

        // Check for ${} outside script tags
        if (!inScript && line.includes('${')) {
            // Exclude some common patterns
            if (!line.includes('`') && !line.includes('//')) {
                leaks.push({ line: i+1, content: trimmed, type: 'Template literal outside script' });
            }
        }
    });

    if (leaks.length === 0) {
        console.log('  No obvious script leaks found.');
    } else {
        leaks.forEach(l => console.log(`  L${l.line}: ${l.content} (${l.type || 'Potential string leak'})`));
    }
}

auditFile('interview.html');
auditFile('cover-letter.html');
auditFile('resume.html');
