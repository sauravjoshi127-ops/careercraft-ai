const fs = require('fs');
const path = 'c:/Users/saura/.gemini/antigravity/scratch/careercraft-ai/resume.html';
let content = fs.readFileSync(path, 'utf8');

// The updatePreview function is broken. Let's find it and replace it completely.
// We'll look for the function start and end markers

const newUpdatePreview = `        function updatePreview() {
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
                if (title||company) expHtml += '<div style="margin-bottom:0.5rem;"><div class="preview-exp-title" style="color:'+accentColor+'">'+esc(title)+'</div><div class="preview-exp-meta">'+esc(company)+(start?' · '+esc(start):'')+(end?' – '+esc(end):'')+  '</div>'+(desc?'<div class="preview-text">'+esc(desc)+'</div>':'')+  '</div>';
            });
            let eduHtml = '';
            document.querySelectorAll('#educationContainer .entry-card').forEach(card => {
                const id = card.id.replace('edu-','');
                const deg = document.getElementById('eduDegree-'+id)?.value||'';
                const sch = document.getElementById('eduSchool-'+id)?.value||'';
                const yr = document.getElementById('eduYear-'+id)?.value||'';
                if (deg||sch) eduHtml += '<div style="margin-bottom:0.4rem;"><div class="preview-exp-title">'+esc(deg)+'</div><div class="preview-exp-meta">'+esc(sch)+(yr?' · '+esc(yr):'')+  '</div></div>';
            });
            const skillsHtml = skills.length?'<div class="preview-skills">'+skills.map(s=>'<span class="preview-skill">'+esc(s)+'</span>').join('')+'</div>':'';
            const contact = [email,phone,loc].filter(Boolean).join(' · ');
            const cc = currentTemplate==='creative'?accentColor:'';
            const tpl = 'tpl-'+currentTemplate;
            document.getElementById('previewBody').innerHTML =
                '<div id="livePreviewContent" class="'+tpl+'" style="font-family:'+font+',sans-serif;line-height:'+lineH+'">' +
                '<h1 style="margin-bottom:0.15rem;">'+esc(name)+'</h1>'+
                (contact?'<div class="preview-contact">'+esc(contact)+'</div>':'')+
                '<div class="preview-divider"></div>'+
                (summary?'<div class="preview-section-title" style="color:'+cc+'">SUMMARY</div><div class="preview-text">'+esc(summary)+'</div>':'')+
                (expHtml?'<div class="preview-section-title" style="color:'+cc+'">EXPERIENCE</div>'+expHtml:'')+
                (eduHtml?'<div class="preview-section-title" style="color:'+cc+'">EDUCATION</div>'+eduHtml:'')+
                (skillsHtml?'<div class="preview-section-title" style="color:'+cc+'">SKILLS</div>'+skillsHtml:'')+
                (certs?'<div class="preview-section-title" style="color:'+cc+'">CERTIFICATIONS</div><div class="preview-text">'+esc(certs)+'</div>':'')+
                '</div>';
        }`;

// Find and replace the entire updatePreview function
// It starts at "        function updatePreview() {" and ends before "        function selectTemplate"
const updatePreviewRegex = /        function updatePreview\(\) \{[\s\S]*?        }\s*\n        function selectTemplate/;

if (updatePreviewRegex.test(content)) {
    content = content.replace(updatePreviewRegex, newUpdatePreview + '\n        function selectTemplate');
    console.log('Replaced updatePreview function successfully');
} else {
    console.log('Could not find updatePreview function');
    // Try a different pattern
    const start = content.indexOf('        function updatePreview() {');
    const end = content.indexOf('        function selectTemplate(');
    if (start !== -1 && end !== -1) {
        content = content.substring(0, start) + newUpdatePreview + '\n' + content.substring(end);
        console.log('Replaced using index approach');
    } else {
        console.log('FAILED: Could not find update preview boundaries');
    }
}

fs.writeFileSync(path, content);
console.log('Done');
