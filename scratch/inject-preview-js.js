const fs = require('fs');
let html = fs.readFileSync('resume.html', 'utf8');

const marker = `        let shareViewMap = {};      // resumeId \u2192 { shareToken, viewCount }\r\n        let currentAISuggestion = '';\r\n        let currentAISection = '';`;

const newVarsAndFunctions = `        let shareViewMap = {};
        let currentAISuggestion = '';
        let currentAISection = '';
        let currentTemplate = 'modern';
        let accentColor = '#00d2ff';

        // \u2500\u2500 Live Preview \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
        function switchTemplate(name, btn) {
            currentTemplate = name;
            document.getElementById('templateName').value = name;
            document.querySelectorAll('.template-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            updatePreview();
        }
        function setAccentColor(el) {
            accentColor = el.dataset.color;
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            el.classList.add('active');
            updatePreview();
        }
        function applyCustomization() { updatePreview(); }
        function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
        function updatePreview() {
            const name = document.getElementById('fullName')?.value || '';
            const email = document.getElementById('email')?.value || '';
            const phone = document.getElementById('phone')?.value || '';
            const loc = document.getElementById('location')?.value || '';
            const summary = document.getElementById('summary')?.value || '';
            const certs = document.getElementById('certifications')?.value || '';
            const font = document.getElementById('custFont')?.value || 'Inter';
            const spacing = document.getElementById('custSpacing')?.value || 'normal';
            const lineH = spacing==='compact'?'1.4':spacing==='relaxed'?'1.9':'1.65';
            if (!name && !email) {
                document.getElementById('previewBody').innerHTML = '<div class="preview-placeholder"><p>Start filling in your details to see live preview.</p></div>';
                return;
            }
            let expHtml = '';
            document.querySelectorAll('#experienceContainer .entry-card').forEach(card => {
                const id = card.id.replace('exp-','');
                const title = document.getElementById('expTitle-'+id)?.value||'';
                const company = document.getElementById('expCompany-'+id)?.value||'';
                const start = document.getElementById('expStart-'+id)?.value||'';
                const end = document.getElementById('expEnd-'+id)?.value||'';
                const desc = document.getElementById('expDesc-'+id)?.value||'';
                if (title||company) expHtml += '<div style="margin-bottom:0.5rem;"><div class="preview-exp-title" style="color:'+accentColor+'">'+esc(title)+'</div><div class="preview-exp-meta">'+esc(company)+(start?' \u00b7 '+esc(start):'')+(end?' \u2013 '+esc(end):'')+'</div>'+(desc?'<div class="preview-text">'+esc(desc)+'</div>':'')+'</div>';
            });
            let eduHtml = '';
            document.querySelectorAll('#educationContainer .entry-card').forEach(card => {
                const id = card.id.replace('edu-','');
                const deg = document.getElementById('eduDegree-'+id)?.value||'';
                const sch = document.getElementById('eduSchool-'+id)?.value||'';
                const yr = document.getElementById('eduYear-'+id)?.value||'';
                if (deg||sch) eduHtml += '<div style="margin-bottom:0.4rem;"><div class="preview-exp-title">'+esc(deg)+'</div><div class="preview-exp-meta">'+esc(sch)+(yr?' \u00b7 '+esc(yr):'')+'</div></div>';
            });
            const skillsHtml = skills.length?'<div class="preview-skills">'+skills.map(s=>'<span class="preview-skill">'+esc(s)+'</span>').join('')+'</div>':'';
            const contact = [email,phone,loc].filter(Boolean).join(' \u00b7 ');
            const cc = currentTemplate==='creative'?accentColor:'';
            const tpl = 'tpl-'+currentTemplate;
            document.getElementById('previewBody').innerHTML =
                '<div id="livePreviewContent" class="'+tpl+'" style="font-family:\''+font+'\',sans-serif;line-height:'+lineH+'">'+
                '<h1 style="margin-bottom:0.15rem;">'+esc(name)+'</h1>'+
                (contact?'<div class="preview-contact">'+esc(contact)+'</div>':'')+
                '<div class="preview-divider"></div>'+
                (summary?'<div class="preview-section-title" style="color:'+cc+'">SUMMARY</div><div class="preview-text">'+esc(summary)+'</div>':'')+
                (expHtml?'<div class="preview-section-title" style="color:'+cc+'">EXPERIENCE</div>'+expHtml:'')+
                (eduHtml?'<div class="preview-section-title" style="color:'+cc+'">EDUCATION</div>'+eduHtml:'')+
                (skillsHtml?'<div class="preview-section-title" style="color:'+cc+'">SKILLS</div>'+skillsHtml:'')+
                (certs?'<div class="preview-section-title" style="color:'+cc+'">CERTIFICATIONS</div><div class="preview-text">'+esc(certs)+'</div>':'')+
                '</div>';
        }
        function selectTemplate(name) { const t=document.querySelector('.template-tab[onclick*="\''+name+'\'"]'); if(t) switchTemplate(name,t); }
        function showTemplateScreen() {}`;

if (!html.includes(marker.split('\n')[0].trim())) {
    // Try without Windows CRLF
    const alt = `        let shareViewMap = {};      // resumeId → { shareToken, viewCount }
        let currentAISuggestion = '';
        let currentAISection = '';`;
    const pos = html.indexOf('let shareViewMap');
    if (pos === -1) { console.error('Could not find marker'); process.exit(1); }
    const endLine = html.indexOf('\n', html.indexOf("let currentAISection = '';", pos)) + 1;
    html = html.substring(0, pos) + newVarsAndFunctions.trim() + '\n' + html.substring(endLine);
} else {
    html = html.replace(marker, newVarsAndFunctions);
}

fs.writeFileSync('resume.html', html, 'utf8');
console.log('Done. Size:', html.length);
