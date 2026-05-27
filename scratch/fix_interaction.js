const fs = require('fs');

// 1. Fix premium.css z-index issues
let css = fs.readFileSync('styles/premium.css', 'utf8');
// Move texture to z-index: -1 and background
css = css.replace(/body::after \{/, 'body::before {');
css = css.replace(/z-index: 5000;/, 'z-index: -1;');
// Ensure ambient-canvas is also behind everything
css = css.replace(/#ambient-canvas \{[^{]*z-index: 0;/, '#ambient-canvas {\n  position: fixed;\n  inset: 0;\n  width: 100vw;\n  height: 100vh;\n  z-index: -2;');

fs.writeFileSync('styles/premium.css', css, 'utf8');

// 2. Fix acceptAISuggestion in resume.html
let html = fs.readFileSync('resume.html', 'utf8');

const acceptFnStart = html.indexOf('function acceptAISuggestion() {');
let acceptFnEnd = acceptFnStart;
let braceCount = 0;
for (let i = acceptFnStart; i < html.length; i++) {
    if (html[i] === '{') braceCount++;
    if (html[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
            acceptFnEnd = i + 1;
            break;
        }
    }
}

if (acceptFnStart > -1) {
    let acceptFn = html.substring(acceptFnStart, acceptFnEnd);
    // Add updatePreview() call before the closing brace if not present
    if (!acceptFn.includes('updatePreview()')) {
        acceptFn = acceptFn.replace(/\}$/, '    updatePreview();\n    document.getElementById(\'aiModal\').classList.remove(\'active\');\n}');
    }
    html = html.substring(0, acceptFnStart) + acceptFn + html.substring(acceptFnEnd);
}

// 3. Add AI loading state visual feedback
html = html.replace(/box\.textContent = '⏳ Getting AI suggestions…';/, 
    "box.textContent = '⏳ Getting AI suggestions…';\n    const aiBtn = document.querySelector(\"button[onclick*='getAISuggestions(\\\"' + section + '\\\")']\");\n    if (aiBtn) {\n        aiBtn.disabled = true;\n        aiBtn.innerHTML = '⏳ Processing...';\n    }");

// Add cleanup of loading state in getAISuggestions catch and success
// I'll just append a finally-like behavior or clean it up in try/catch
const aiSuccessPos = html.indexOf('box.textContent = currentAISuggestion || \'(No suggestion returned)\';');
if (aiSuccessPos > -1) {
    html = html.replace(/box\.textContent = currentAISuggestion || '\(No suggestion returned\)';/, 
        "box.textContent = currentAISuggestion || '(No suggestion returned)';\n        resetAIButton();");
}

const aiErrorPos = html.indexOf('box.textContent = \'❌ Error: \' + err.message;');
if (aiErrorPos > -1) {
    html = html.replace(/box\.textContent = '❌ Error: ' \+ err\.message;/, 
        "box.textContent = '❌ Error: ' + err.message;\n        resetAIButton();");
}

// Add resetAIButton helper
if (!html.includes('function resetAIButton()')) {
    html = html.replace('async function getAISuggestions(section) {', 
        'function resetAIButton() {\n    document.querySelectorAll(\'.btn-ai\').forEach(b => {\n        b.disabled = false;\n        b.innerHTML = \'💡 AI Suggest\';\n    });\n}\n\nasync function getAISuggestions(section) {');
}

fs.writeFileSync('resume.html', html, 'utf8');
console.log('Fixed z-index issues and synchronized AI suggestion preview.');
