const ResumeRenderer = {
  escape(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  render(data, templateName) {
    const exp = data.experience || [];
    const edu = data.education || [];
    const sk = data.skills || [];
    const font = data.font_family || 'Inter';
    const spacing = data.spacing || 'normal';
    const accent = data.accent_color || '#6366f1';

    // Compute spacing sizes
    let lineH, itemMargin, sectionMargin, padding;
    if (spacing === 'compact') {
      lineH = '1.35';
      itemMargin = '8px';
      sectionMargin = '12px';
      padding = '24px';
    } else if (spacing === 'relaxed') {
      lineH = '1.85';
      itemMargin = '18px';
      sectionMargin = '26px';
      padding = '44px';
    } else {
      lineH = '1.6';
      itemMargin = '13px';
      sectionMargin = '18px';
      padding = '36px';
    }

    // Compute font family stack
    let fontStack = "'Inter', sans-serif";
    if (font === 'Georgia') fontStack = "Georgia, serif";
    else if (font === 'Outfit') fontStack = "'Outfit', sans-serif";

    if (templateName === 'classic') {
      return this.classic(data, exp, edu, sk, fontStack, lineH, itemMargin, sectionMargin, padding, accent);
    } else if (templateName === 'creative') {
      return this.creative(data, exp, edu, sk, fontStack, lineH, itemMargin, sectionMargin, padding, accent);
    } else {
      return this.modern(data, exp, edu, sk, fontStack, lineH, itemMargin, sectionMargin, padding, accent);
    }
  },

  modern(data, exp, edu, sk, font, lineH, itemMargin, sectionMargin, padding, accent) {
    const esc = this.escape;
    const name = esc(data.full_name || 'Your Name');
    const contactParts = [data.email, data.phone, data.location].filter(Boolean).map(esc).join(' · ');
    const summary = esc(data.professional_summary || '');
    const certifications = esc(data.certifications || '');

    const expHTML = exp.filter(e => e.title || e.company).map(e => `
        <div style="margin-bottom:${itemMargin};">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
                <strong style="font-size:13px;color:#1a1a2e;">${esc(e.title || 'Position')}</strong>
                <span style="font-size:11px;color:#64748b;white-space:nowrap;margin-left:8px;">${esc(e.start || '')}${e.end ? ' – ' + esc(e.end) : ''}</span>
            </div>
            <div style="font-size:12px;color:${accent};font-weight:600;margin-bottom:4px;">${esc(e.company || 'Company')}</div>
            <div style="font-size:12px;color:#475569;line-height:${lineH};">${esc(e.description || '').replace(/\n/g, '<br>')}</div>
        </div>
    `).join('');

    const eduHTML = edu.filter(e => e.degree || e.school).map(e => `
        <div style="margin-bottom:${itemMargin};">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
                <strong style="font-size:13px;color:#1a1a2e;">${esc(e.degree || 'Degree')}</strong>
                <span style="font-size:11px;color:#64748b;margin-left:8px;">${esc(e.year || '')}</span>
            </div>
            <div style="font-size:12px;color:#222222;">${esc(e.school || 'School')}${e.grade ? ' · ' + esc(e.grade) : ''}</div>
        </div>
    `).join('');

    const skHTML = sk.filter(s => s).map(s => 
        `<span style="display:inline-block;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);color:#222222;padding:3px 10px;border-radius:20px;font-size:11px;margin:3px;white-space:nowrap;">${esc(s)}</span>`
    ).join('');

    const h2Style = `font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#1a1a2e;margin:0 0 10px;padding-left:8px;border-left:3px solid ${accent};font-weight:700;`;

    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
            .pdf-body { font-family: ${font}; margin: 0; padding: 0; color: #1a1a2e; background: white; -webkit-print-color-adjust: exact; }
            .pdf-container { max-width: 8.5in; min-height: 11in; margin: 0 auto; padding: ${padding}; background: white; box-sizing: border-box; }
            h1 { font-size: 24px; font-weight: 700; margin: 0 0 5px; color: #1a1a2e; }
            .header { border-bottom: 2px solid ${accent}; padding-bottom: 14px; margin-bottom: ${sectionMargin}; }
            .contact { margin: 0; color: #475569; font-size: 12px; }
            .section { margin-bottom: ${sectionMargin}; }
            h2 { ${h2Style} }
        </style>
    </head>
    <body class="pdf-body">
        <div class="pdf-container">
            <div class="header">
                <h1>${name}</h1>
                <p class="contact">${contactParts}</p>
            </div>
            
            ${summary ? `<div class="section"><h2>Professional Summary</h2><p style="font-size:12px;color:#475569;line-height:${lineH};margin:0;">${summary}</p></div>` : ''}
            ${expHTML ? `<div class="section"><h2>Work Experience</h2>${expHTML}</div>` : ''}
            ${eduHTML ? `<div class="section"><h2>Education</h2>${eduHTML}</div>` : ''}
            ${skHTML ? `<div class="section"><h2>Skills</h2><div style="margin-top: 4px;">${skHTML}</div></div>` : ''}
            ${certifications ? `<div class="section"><h2>Certifications</h2><p style="font-size:12px;color:#475569;line-height:${lineH};margin:0;">${certifications.replace(/\n/g, '<br>')}</p></div>` : ''}
        </div>
    </body>
    </html>`;
  },

  classic(data, exp, edu, sk, font, lineH, itemMargin, sectionMargin, padding, accent) {
    const esc = this.escape;
    const name = esc(data.full_name || 'Your Name');
    const contactParts = [data.email, data.phone, data.location].filter(Boolean).map(esc).join(' | ');
    const summary = esc(data.professional_summary || '');
    const certifications = esc(data.certifications || '');

    const expHTML = exp.filter(e => e.title || e.company).map(e => `
        <div style="margin-bottom:${itemMargin};">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
                <strong style="font-size:13px;color:#111111;">${esc(e.title || 'Position')}</strong>
                <span style="font-size:11px;color:#555555;">${esc(e.start || '')}${e.end ? ' – ' + esc(e.end) : ''}</span>
            </div>
            <div style="font-size:12px;font-style:italic;color:#444444;margin-bottom:4px;">${esc(e.company || 'Company')}</div>
            <div style="font-size:12px;color:#333333;line-height:${lineH};">${esc(e.description || '').replace(/\n/g, '<br>')}</div>
        </div>
    `).join('');

    const eduHTML = edu.filter(e => e.degree || e.school).map(e => `
        <div style="margin-bottom:${itemMargin};">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
                <strong style="font-size:13px;color:#111111;">${esc(e.degree || 'Degree')}</strong>
                <span style="font-size:11px;color:#555555;">${esc(e.year || '')}</span>
            </div>
            <div style="font-size:12px;font-style:italic;color:#444444;">${esc(e.school || 'School')}${e.grade ? ' · ' + esc(e.grade) : ''}</div>
        </div>
    `).join('');

    const skText = sk.filter(s => s).map(esc).join(', ');
    const h2Style = `font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#222222;margin:0 0 8px;padding-bottom:4px;border-bottom:1px solid ${accent};font-weight:700;`;

    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
            .pdf-body { font-family: ${font}; margin: 0; padding: 0; color: #1a1a1a; background: white; -webkit-print-color-adjust: exact; }
            .pdf-container { max-width: 8.5in; min-height: 11in; margin: 0 auto; padding: ${padding}; background: white; box-sizing: border-box; }
            h1 { font-size: 26px; font-weight: 700; margin: 0 0 5px; letter-spacing: 0.05em; text-transform: uppercase; text-align: center; color: #111111; }
            .header { text-align: center; margin-bottom: ${sectionMargin}; padding-bottom: 16px; border-bottom: 2px solid #222222; }
            .contact { margin: 0; color: #444444; font-size: 12px; }
            .section { margin-bottom: ${sectionMargin}; }
            h2 { ${h2Style} }
        </style>
    </head>
    <body class="pdf-body">
        <div class="pdf-container">
            <div class="header">
                <h1>${name}</h1>
                <p class="contact">${contactParts}</p>
            </div>
            
            ${summary ? `<div class="section"><h2>Summary</h2><p style="font-size:12px;color:#333333;line-height:${lineH};margin:0;">${summary}</p></div>` : ''}
            ${expHTML ? `<div class="section"><h2>Experience</h2>${expHTML}</div>` : ''}
            ${eduHTML ? `<div class="section"><h2>Education</h2>${eduHTML}</div>` : ''}
            ${skText ? `<div class="section"><h2>Skills</h2><p style="font-size:12px;color:#333333;line-height:${lineH};margin:0;">${skText}</p></div>` : ''}
            ${certifications ? `<div class="section"><h2>Certifications</h2><p style="font-size:12px;color:#333333;line-height:${lineH};margin:0;">${certifications.replace(/\n/g, '<br>')}</p></div>` : ''}
        </div>
    </body>
    </html>`;
  },

  creative(data, exp, edu, sk, font, lineH, itemMargin, sectionMargin, padding, accent) {
    const esc = this.escape;
    const name = esc(data.full_name || 'Your Name');
    const contactParts = [data.email, data.phone, data.location].filter(Boolean);
    const summary = esc(data.professional_summary || '');
    const certifications = esc(data.certifications || '');

    const expHTML = exp.filter(e => e.title || e.company).map(e => `
        <div style="margin-bottom:${itemMargin};">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
                <strong style="font-size:13px;color:#1a1a2e;">${esc(e.title || 'Position')}</strong>
                <span style="font-size:11px;color:#64748b;white-space:nowrap;margin-left:8px;">${esc(e.start || '')}${e.end ? ' – ' + esc(e.end) : ''}</span>
            </div>
            <div style="font-size:12px;color:${accent};margin-bottom:4px;font-weight:600;">${esc(e.company || 'Company')}</div>
            <div style="font-size:12px;color:#475569;line-height:${lineH};">${esc(e.description || '').replace(/\n/g, '<br>')}</div>
        </div>
    `).join('');

    const eduHTML = edu.filter(e => e.degree || e.school).map(e => `
        <div style="margin-bottom:12px;">
            <strong style="font-size:12px;color:white;">${esc(e.degree || 'Degree')}</strong>
            <div style="font-size:11px;color:#e2e8f0;margin-top:2px;">${esc(e.school || 'School')}${e.grade ? ' · ' + esc(e.grade) : ''} ${e.year ? '(' + esc(e.year) + ')' : ''}</div>
        </div>
    `).join('');

    const skSidebar = sk.filter(s => s).map(s => 
        `<div style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:4px 8px;font-size:11px;margin-bottom:4px;display:inline-block;margin-right:4px;">${esc(s)}</div>`
    ).join('');

    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
            .pdf-body { font-family: ${font}; margin: 0; padding: 0; color: #1a1a2e; background: white; -webkit-print-color-adjust: exact; }
            .pdf-container { display: flex; min-height: 11in; margin: 0 auto; max-width: 8.5in; background: white; box-sizing: border-box; }
            .sidebar { width: 220px; min-width: 220px; background: linear-gradient(165deg, #111111, ${accent}); color: white; padding: ${padding} 18px; box-sizing: border-box; }
            .main { flex: 1; padding: ${padding} 24px; color: #1a1a2e; box-sizing: border-box; }
            h1 { font-size: 19px; font-weight: 700; margin: 0 0 6px; line-height: 1.3; color: white; }
            h2 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: ${accent}; margin: 0 0 10px; font-weight: 700; padding-bottom: 3px; border-bottom: 1.5px solid #e2e8f0; }
            .section-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.85; margin-bottom: 8px; font-weight: 700; color: white; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; }
            .sidebar h2 { color: white; }
        </style>
    </head>
    <body class="pdf-body">
        <div class="pdf-container">
            <div class="sidebar">
                <div style="margin-bottom:24px;">
                    <h1>${name}</h1>
                </div>
                <div style="margin-bottom:20px;">
                    <div class="section-label">Contact</div>
                    ${contactParts.map(c => `<div style="font-size:11px;opacity:0.9;margin-bottom:5px;word-break:break-all;">${esc(c)}</div>`).join('')}
                </div>
                ${sk.length ? `<div style="margin-bottom:20px;"><div class="section-label">Skills</div><div style="margin-top:4px;">${skSidebar}</div></div>` : ''}
                ${eduHTML ? `<div><div class="section-label">Education</div>${eduHTML}</div>` : ''}
            </div>
            <div class="main">
                ${summary ? `<div style="margin-bottom:${sectionMargin};"><h2>About Me</h2><p style="font-size:12px;color:#475569;line-height:${lineH};margin:0;">${summary}</p></div>` : ''}
                ${expHTML ? `<div style="margin-bottom:${sectionMargin};"><h2>Experience</h2>${expHTML}</div>` : ''}
                ${certifications ? `<div><h2>Certifications</h2><p style="font-size:12px;color:#475569;line-height:${lineH};margin:0;">${certifications.replace(/\n/g, '<br>')}</p></div>` : ''}
            </div>
        </div>
    </body>
    </html>`;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResumeRenderer;
} else {
  window.ResumeRenderer = ResumeRenderer;
}
