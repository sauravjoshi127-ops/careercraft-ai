const fs = require('fs');
let html = fs.readFileSync('resume.html', 'utf8');

// Fix 1: Escape </script> tags inside string literals to prevent premature script closing
html = html.replace(/<\/script>/g, '<\\/script>');
// But wait, the main script tag should stay. The replace above will escape it too.
// Let's be more specific. We only want to escape it if it's NOT the actual closing tag.
// Actually, escaping all of them and then fixing the last one or using a different strategy is safer.

// Strategy: Replace all </script> with <\/script>, then fix the actual closing tag at the end of the file.
// Or better: only replace </script> if it's followed by a backtick, quote, or semicolon (likely inside JS).

html = html.replace(/<\/script>/g, '<\\/script>');
// Now fix the real one(s). Usually there's only one main script block we're worried about.
// But we might have legitimate script tags in the head.
// Let's use a safer approach: look for strings that contain </script>
html = html.replace(/<script src="ambient3d\.js"><\/script>/g, '<script src="ambient3d.js"><\\/script>');
html = html.replace(/<script src="wow-effects\.js"><\/script>/g, '<script src="wow-effects.js"><\\/script>');

// Fix 2: Repair the messy single-quote concatenation in updatePreview
// I'll replace the whole updatePreview function with a clean backtick version.
const previewFnStart = html.indexOf('function updatePreview() {');
const previewFnEnd = html.indexOf('function selectTemplate', previewFnStart);

if (previewFnStart > -1 && previewFnEnd > -1) {
    const newPreviewFn = `function updatePreview() {
    const name = document.getElementById('fullName')?.value || '';
    const email = document.getElementById('email')?.value || '';
    const phone = document.getElementById('phone')?.value || '';
    const loc = document.getElementById('location')?.value || '';
    const summary = document.getElementById('summary')?.value || '';
    const certs = document.getElementById('certifications')?.value || '';
    const font = document.getElementById('custFont')?.value || 'Inter';
    const spacing = document.getElementById('custSpacing')?.value || 'normal';
    
    const lineH = spacing === 'compact' ? '1.4' : spacing === 'relaxed' ? '1.9' : '1.65';

    if (!name && !email) {
        document.getElementById('previewBody').innerHTML = \`
            <div class="preview-placeholder">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <p>Start filling in your details<br>and see your resume update live.</p>
            </div>\`;
        return;
    }

    // Collect experience
    let expHtml = '';
    document.querySelectorAll('#experienceContainer .entry-card').forEach(card => {
        const id = card.id.replace('exp-', '');
        const title = document.getElementById(\`expTitle-\${id}\`)?.value || '';
        const company = document.getElementById(\`expCompany-\${id}\`)?.value || '';
        const start = document.getElementById(\`expStart-\${id}\`)?.value || '';
        const end = document.getElementById(\`expEnd-\${id}\`)?.value || '';
        const desc = document.getElementById(\`expDesc-\${id}\`)?.value || '';
        
        if (title || company) {
            expHtml += \`
                <div style="margin-bottom:0.5rem;">
                    <div class="preview-exp-title" style="color:\${accentColor}">\${esc(title)}</div>
                    <div class="preview-exp-meta">\${esc(company)}\${start ? ' · ' + esc(start) : ''}\${end ? ' – ' + esc(end) : ''}</div>
                    \${desc ? \`<div class="preview-text">\${esc(desc)}</div>\` : ''}
                </div>\`;
        }
    });

    // Collect education
    let eduHtml = '';
    document.querySelectorAll('#educationContainer .entry-card').forEach(card => {
        const id = card.id.replace('edu-', '');
        const deg = document.getElementById(\`eduDegree-\${id}\`)?.value || '';
        const sch = document.getElementById(\`eduSchool-\${id}\`)?.value || '';
        const yr = document.getElementById(\`eduYear-\${id}\`)?.value || '';
        
        if (deg || sch) {
            eduHtml += \`
                <div style="margin-bottom:0.4rem;">
                    <div class="preview-exp-title">\${esc(deg)}</div>
                    <div class="preview-exp-meta">\${esc(sch)}\${yr ? ' · ' + esc(yr) : ''}</div>
                </div>\`;
        }
    });

    const skillsHtml = skills.length ? \`<div class="preview-skills">\${skills.map(s => \`<span class="preview-skill">\${esc(s)}</span>\`).join('')}</div>\` : '';
    const contact = [email, phone, loc].filter(Boolean).join(' · ');
    const cc = currentTemplate === 'creative' ? accentColor : '';
    const tpl = 'tpl-' + currentTemplate;

    document.getElementById('previewBody').innerHTML = \`
        <div id="livePreviewContent" class="\${tpl}" style="font-family:'\${font}', sans-serif; line-height:\${lineH}">
            <h1 style="margin-bottom:0.15rem;">\${esc(name)}</h1>
            \${contact ? \`<div class="preview-contact">\${esc(contact)}</div>\` : ''}
            <div class="preview-divider"></div>
            \${summary ? \`<div class="preview-section-title" style="color:\${cc}">SUMMARY</div><div class="preview-text">\${esc(summary)}</div>\` : ''}
            \${expHtml ? \`<div class="preview-section-title" style="color:\${cc}">EXPERIENCE</div>\${expHtml}\` : ''}
            \${eduHtml ? \`<div class="preview-section-title" style="color:\${cc}">EDUCATION</div>\${eduHtml}\` : ''}
            \${skillsHtml ? \`<div class="preview-section-title" style="color:\${cc}">SKILLS</div>\${skillsHtml}\` : ''}
            \${certs ? \`<div class="preview-section-title" style="color:\${cc}">CERTIFICATIONS</div><div class="preview-text">\${esc(certs)}</div>\` : ''}
        </div>\`;
}
`;
    html = html.substring(0, previewFnStart) + newPreviewFn + html.substring(previewFnEnd);
}

// Fix 3: Standardize the final closing script tag (it might have been escaped by the global replace)
html = html.replace(/<\\\/script>\s*<\/body>\s*<\/html>/g, '</script></body></html>');
// Also find any other occurrences that should be real tags. 
// Actually, it's safer to just fix the very last one.
const lastIndex = html.lastIndexOf('<\\/script>');
if (lastIndex > -1) {
    html = html.substring(0, lastIndex) + '</script>' + html.substring(lastIndex + 10);
}

fs.writeFileSync('resume.html', html, 'utf8');
console.log('Fixed script leaks and updatePreview function.');
