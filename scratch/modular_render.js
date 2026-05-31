const fs = require('fs');
let html = fs.readFileSync('resume.html', 'utf8');

// ── REFACTOR: Modular Rendering Logic ──────────────────────────────────────

const newRenderers = `
        // ── Rendering Components ──────────────────────────────────────────────
        const Renderer = {
            experience(exp, color) {
                if (!exp || exp.length === 0) return '';
                return exp.map(e => {
                    if (!e.title && !e.company) return '';
                    return \`
                        <div class="preview-entry">
                            <div class="preview-exp-title" style="color:\${color}">\${esc(e.title)}</div>
                            <div class="preview-exp-meta">\${esc(e.company)}\${e.start ? ' · ' + esc(e.start) : ''}\${e.end ? ' – ' + esc(e.end) : ''}</div>
                            \${e.description ? \`<div class="preview-text">\${esc(e.description)}</div>\` : ''}
                        </div>\`;
                }).join('');
            },

            education(edu) {
                if (!edu || edu.length === 0) return '';
                return edu.map(e => {
                    if (!e.degree && !e.school) return '';
                    return \`
                        <div class="preview-entry">
                            <div class="preview-exp-title">\${esc(e.degree)}</div>
                            <div class="preview-exp-meta">\${esc(e.school)}\${e.year ? ' · ' + esc(e.year) : ''}</div>
                        </div>\`;
                }).join('');
            },

            skills(sk) {
                if (!sk || sk.length === 0) return '';
                return \`<div class="preview-skills">\${sk.map(s => \`<span class="preview-skill">\${esc(s)}</span>\`).join('')}</div>\`;
            }
        };

        function updatePreview() {
            const data = collectFormData();
            const font = document.getElementById('custFont')?.value || 'Inter';
            const spacing = document.getElementById('custSpacing')?.value || 'normal';
            const lineH = spacing === 'compact' ? '1.4' : spacing === 'relaxed' ? '1.9' : '1.65';
            
            const previewEl = document.getElementById('previewBody');
            if (!previewEl) return;

            if (!data.full_name && !data.email) {
                previewEl.innerHTML = \`
                    <div class="preview-placeholder">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                        <p>Start filling in your details<br>and see your resume update live.</p>
                    </div>\`;
                return;
            }

            const expHtml = Renderer.experience(data.experience, accentColor);
            const eduHtml = Renderer.education(data.education);
            const skillsHtml = Renderer.skills(skills);
            const contact = [data.email, data.phone, data.location].filter(Boolean).join(' · ');
            const cc = currentTemplate === 'creative' ? accentColor : '';
            const tpl = 'tpl-' + currentTemplate;

            previewEl.innerHTML = \`
                <div id="livePreviewContent" class="\${tpl}" style="font-family:'\${font}', sans-serif; line-height:\${lineH}">
                    <h1 style="margin-bottom:0.15rem;">\${esc(data.full_name)}</h1>
                    \${contact ? \`<div class="preview-contact">\${esc(contact)}</div>\` : ''}
                    <div class="preview-divider"></div>
                    \${data.professional_summary ? \`<div class="preview-section-title" style="color:\${cc}">SUMMARY</div><div class="preview-text">\${esc(data.professional_summary)}</div>\` : ''}
                    \${expHtml ? \`<div class="preview-section-title" style="color:\${cc}">EXPERIENCE</div>\${expHtml}\` : ''}
                    \${eduHtml ? \`<div class="preview-section-title" style="color:\${cc}">EDUCATION</div>\${eduHtml}\` : ''}
                    \${skillsHtml ? \`<div class="preview-section-title" style="color:\${cc}">SKILLS</div>\${skillsHtml}\` : ''}
                    \${data.certifications ? \`<div class="preview-section-title" style="color:\${cc}">CERTIFICATIONS</div><div class="preview-text">\${esc(data.certifications)}</div>\` : ''}
                </div>\`;
        }
`;

// Insert the new renderers and updatePreview function
const previewStart = html.indexOf('// ── Live Preview');
const previewEnd = html.indexOf('// ── Auth Check');

if (previewStart > -1 && previewEnd > -1) {
    html = html.substring(0, previewStart) + '// ── Live Preview Rendering Engine ──' + newRenderers + html.substring(previewEnd);
}

// Ensure collectFormData correctly captures all fields
const collectFnStart = html.indexOf('function collectFormData() {');
const collectFnEnd = html.indexOf('}', collectFnStart + 28) + 1; // Basic find, will improve if needed

// I'll actually replace collectFormData entirely to be safe
const newCollectFn = `function collectFormData() {
            const exp = [];
            document.querySelectorAll('#experienceContainer .entry-card').forEach(card => {
                const id = card.id.replace('exp-', '');
                exp.push({
                    title: document.getElementById(\`expTitle-\${id}\`)?.value || '',
                    company: document.getElementById(\`expCompany-\${id}\`)?.value || '',
                    location: document.getElementById(\`expLocation-\${id}\`)?.value || '',
                    start: document.getElementById(\`expStart-\${id}\`)?.value || '',
                    end: document.getElementById(\`expEnd-\${id}\`)?.value || '',
                    description: document.getElementById(\`expDesc-\${id}\`)?.value || ''
                });
            });

            const edu = [];
            document.querySelectorAll('#educationContainer .entry-card').forEach(card => {
                const id = card.id.replace('edu-', '');
                edu.push({
                    school: document.getElementById(\`eduSchool-\${id}\`)?.value || '',
                    degree: document.getElementById(\`eduDegree-\${id}\`)?.value || '',
                    year: document.getElementById(\`eduYear-\${id}\`)?.value || '',
                    grade: document.getElementById(\`eduGrade-\${id}\`)?.value || ''
                });
            });

            return {
                full_name: document.getElementById('fullName')?.value || '',
                email: document.getElementById('email')?.value || '',
                phone: document.getElementById('phone')?.value || '',
                location: document.getElementById('location')?.value || '',
                professional_summary: document.getElementById('summary')?.value || '',
                skills: skills,
                certifications: document.getElementById('certifications')?.value || '',
                template: document.getElementById('templateName')?.value || 'modern',
                experience: exp,
                education: edu
            };
        }`;

// Replace collectFormData
const cStart = html.indexOf('function collectFormData() {');
// Find the matching closing brace for collectFormData
let cEnd = cStart;
let braceCount = 0;
for (let i = cStart; i < html.length; i++) {
    if (html[i] === '{') braceCount++;
    if (html[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
            cEnd = i + 1;
            break;
        }
    }
}
if (cStart > -1) {
    html = html.substring(0, cStart) + newCollectFn + html.substring(cEnd);
}

fs.writeFileSync('resume.html', html, 'utf8');
console.log('Modularized rendering and stabilized data collection.');
