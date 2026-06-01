const fs = require('fs');

function clean(file) {
    let c = fs.readFileSync(file, 'utf8');
    
    // 1. Remove the broken literal ${p1} tag
    c = c.split('<script\${p1}></script>').join(''); 
    
    // 2. Escape all </script> in the file
    c = c.split('</script>').join('<\\/script>');
    
    // 3. Unescape the ones that should be real
    // - Script tags with src
    c = c.replace(/<script([^>]+)><\\\/script>/g, '<script$1></script>');
    
    // - The final closing tag
    const last = c.lastIndexOf('<\\/script>');
    if (last > -1) {
        c = c.substring(0, last) + '</script>' + c.substring(last + 10);
    }
    
    // 4. Specifically fix the ones inside the backtick strings in resume.html
    if (file === 'resume.html') {
        // Find the </body></html>`; pattern
        c = c.split('</body></html>`;').join('</body></html>\\`;'); // Escape the backtick if needed? No, keep it.
        // Actually, the issue was the unescaped script tag before it.
        // My step 2 handled that.
    }

    fs.writeFileSync(file, c, 'utf8');
    console.log('Cleaned ' + file);
}

clean('resume.html');
clean('interview.html');
clean('cover-letter.html');
