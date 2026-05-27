const fs = require('fs');
let html = fs.readFileSync('resume.html', 'utf8');

// Fix the last script tag - it should be unescaped
const lastEscaped = html.lastIndexOf('<\\/script>');
if (lastEscaped > -1) {
    html = html.substring(0, lastEscaped) + '</script>' + html.substring(lastEscaped + 10);
}

// Also cleanup duplicate closing logic in acceptAISuggestion
html = html.replace('closeAIModal();\n            updatePreview();\n    document.getElementById(\'aiModal\').classList.remove(\'active\');', 
                   'updatePreview();\n            closeAIModal();');

fs.writeFileSync('resume.html', html, 'utf8');
console.log('Fixed last script tag and cleaned up AI modal logic.');
