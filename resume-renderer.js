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

  formatText(text, lineH, esc) {
    if (!text) return '';
    const lines = text.split('\n');
    let inList = false;
    let html = '';
    lines.forEach(line => {
      let trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*')) {
        if (!inList) {
          html += `<ul style="margin: 4px 0 0 0; padding-left: 18px; line-height: ${lineH};">`;
          inList = true;
        }
        trimmed = trimmed.replace(/^[-•*]\s*/, '');
        html += `<li style="margin-bottom: 3px;">${esc(trimmed)}</li>`;
      } else {
        if (inList) {
          html += `</ul>`;
          inList = false;
        }
        if (trimmed) {
          html += `<div style="margin-bottom: 4px; line-height: ${lineH};">${esc(trimmed)}</div>`;
        }
      }
    });
    if (inList) html += '</ul>';
    return html;
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
    const format = this.formatText;
    const name = esc(data.full_name || 'Your Name');
    const contactParts = [data.email, data.phone, data.location].filter(Boolean).map(esc).join(' <span style="margin:0 4px;color:#cbd5e1;">•</span> ');
    const summary = format(data.professional_summary || '', lineH, esc);
    const certifications = format(data.certifications || '', lineH, esc);

    const expHTML = exp.filter(e => e.title || e.company).map(e => `
        <div style="margin-bottom:${itemMargin}; page-break-inside: avoid;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
                <h3 style="font-size:14px; margin:0; color:#0f172a; font-weight:700;">${esc(e.title || 'Position')}</h3>
                <span style="font-size:11px;color:#64748b;white-space:nowrap;margin-left:8px;font-weight:500;">${esc(e.start || '')}${e.end ? ' – ' + esc(e.end) : ''}</span>
            </div>
            <h4 style="font-size:13px;color:${accent};font-weight:600;margin:0 0 6px 0;">${esc(e.company || 'Company')}</h4>
            <div style="font-size:12px;color:#334155;">${format(e.description || '', lineH, esc)}</div>
        </div>
    `).join('');

    const eduHTML = edu.filter(e => e.degree || e.school).map(e => `
        <div style="margin-bottom:${itemMargin}; page-break-inside: avoid;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
                <h3 style="font-size:14px; margin:0; color:#0f172a; font-weight:700;">${esc(e.degree || 'Degree')}</h3>
                <span style="font-size:11px;color:#64748b;margin-left:8px;font-weight:500;">${esc(e.year || '')}</span>
            </div>
            <h4 style="font-size:13px;color:#334155; margin:0; font-weight:500;">${esc(e.school || 'School')}${e.grade ? ' <span style="color:#cbd5e1;">•</span> ' + esc(e.grade) : ''}</h4>
        </div>
    `).join('');

    const skHTML = sk.filter(s => s).map(s => 
        `<span style="display:inline-block;background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);color:#1e293b;padding:4px 12px;border-radius:24px;font-size:11px;margin:4px 6px 4px 0;font-weight:500;">${esc(s)}</span>`
    ).join('');

    const h2Style = `font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#0f172a;margin:0 0 12px;padding-left:10px;border-left:3px solid ${accent};font-weight:700;`;

    return \`<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            *, *::before, *::after { box-sizing: border-box; }
            .pdf-body { font-family: \${font}; margin: 0; padding: 0; color: #334155; background: white; -webkit-print-color-adjust: exact; }
            .pdf-container { max-width: 8.5in; min-height: 11in; margin: 0 auto; padding: \${padding}; background: white; }
            h1 { font-size: 28px; font-weight: 700; margin: 0 0 8px; color: #0f172a; letter-spacing: -0.01em; }
            .header { border-bottom: 2px solid \${accent}; padding-bottom: 16px; margin-bottom: \${sectionMargin}; }
            .contact { margin: 0; color: #64748b; font-size: 12px; font-weight: 500; }
            .section { margin-bottom: \${sectionMargin}; }
            h2 { \${h2Style} }
            p, div, ul, li { margin: 0; padding: 0; }
        </style>
    </head>
    <body class="pdf-body">
        <div class="pdf-container">
            <header class="header">
                <h1>\${name}</h1>
                <p class="contact">\${contactParts}</p>
            </header>
            
            \${summary ? \`<section class="section"><h2>Professional Summary</h2><div style="font-size:12px;color:#334155;">\${summary}</div></section>\` : ''}
            \${expHTML ? \`<section class="section"><h2>Work Experience</h2>\${expHTML}</section>\` : ''}
            \${eduHTML ? \`<section class="section"><h2>Education</h2>\${eduHTML}</section>\` : ''}
            \${skHTML ? \`<section class="section"><h2>Skills</h2><div style="margin-top: 6px;">\${skHTML}</div></section>\` : ''}
            \${certifications ? \`<section class="section"><h2>Certifications</h2><div style="font-size:12px;color:#334155;">\${certifications}</div></section>\` : ''}
        </div>
    </body>
    </html>\`;
  },

  classic(data, exp, edu, sk, font, lineH, itemMargin, sectionMargin, padding, accent) {
    const esc = this.escape;
    const format = this.formatText;
    const name = esc(data.full_name || 'Your Name');
    const contactParts = [data.email, data.phone, data.location].filter(Boolean).map(esc).join(' | ');
    const summary = format(data.professional_summary || '', lineH, esc);
    const certifications = format(data.certifications || '', lineH, esc);

    const expHTML = exp.filter(e => e.title || e.company).map(e => `
        <div style="margin-bottom:${itemMargin}; page-break-inside: avoid;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
                <h3 style="font-size:14px; margin:0; color:#111111; font-weight:700;">${esc(e.title || 'Position')}</h3>
                <span style="font-size:11px;color:#555555;font-weight:600;">${esc(e.start || '')}${e.end ? ' – ' + esc(e.end) : ''}</span>
            </div>
            <h4 style="font-size:13px; margin:2px 0 6px 0; font-style:italic;color:#444444;font-weight:500;">${esc(e.company || 'Company')}</h4>
            <div style="font-size:12px;color:#333333;">${format(e.description || '', lineH, esc)}</div>
        </div>
    `).join('');

    const eduHTML = edu.filter(e => e.degree || e.school).map(e => `
        <div style="margin-bottom:${itemMargin}; page-break-inside: avoid;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
                <h3 style="font-size:14px; margin:0; color:#111111; font-weight:700;">${esc(e.degree || 'Degree')}</h3>
                <span style="font-size:11px;color:#555555;font-weight:600;">${esc(e.year || '')}</span>
            </div>
            <h4 style="font-size:13px; margin:2px 0 0 0; font-style:italic;color:#444444;font-weight:500;">${esc(e.school || 'School')}${e.grade ? ' · ' + esc(e.grade) : ''}</h4>
        </div>
    `).join('');

    const skText = sk.filter(s => s).map(esc).join(', ');
    const h2Style = `font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#111111;margin:0 0 10px;padding-bottom:4px;border-bottom:1px solid ${accent};font-weight:700;`;

    return \`<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            *, *::before, *::after { box-sizing: border-box; }
            .pdf-body { font-family: \${font}; margin: 0; padding: 0; color: #333333; background: white; -webkit-print-color-adjust: exact; }
            .pdf-container { max-width: 8.5in; min-height: 11in; margin: 0 auto; padding: \${padding}; background: white; }
            h1 { font-size: 28px; font-weight: 700; margin: 0 0 8px; letter-spacing: 0.04em; text-transform: uppercase; text-align: center; color: #111111; }
            .header { text-align: center; margin-bottom: \${sectionMargin}; padding-bottom: 18px; border-bottom: 2px solid #222222; }
            .contact { margin: 0; color: #444444; font-size: 12px; font-weight: 500; }
            .section { margin-bottom: \${sectionMargin}; }
            h2 { \${h2Style} }
            p, div, ul, li { margin: 0; padding: 0; }
        </style>
    </head>
    <body class="pdf-body">
        <div class="pdf-container">
            <header class="header">
                <h1>\${name}</h1>
                <p class="contact">\${contactParts}</p>
            </header>
            
            \${summary ? \`<section class="section"><h2>Summary</h2><div style="font-size:12px;color:#333333;">\${summary}</div></section>\` : ''}
            \${expHTML ? \`<section class="section"><h2>Experience</h2>\${expHTML}</section>\` : ''}
            \${eduHTML ? \`<section class="section"><h2>Education</h2>\${eduHTML}</section>\` : ''}
            \${skText ? \`<section class="section"><h2>Skills</h2><div style="font-size:12px;color:#333333;line-height:\${lineH};">\${skText}</div></section>\` : ''}
            \${certifications ? \`<section class="section"><h2>Certifications</h2><div style="font-size:12px;color:#333333;">\${certifications}</div></section>\` : ''}
        </div>
    </body>
    </html>\`;
  },

  creative(data, exp, edu, sk, font, lineH, itemMargin, sectionMargin, padding, accent) {
    const esc = this.escape;
    const format = this.formatText;
    const name = esc(data.full_name || 'Your Name');
    const contactParts = [data.email, data.phone, data.location].filter(Boolean);
    const summary = format(data.professional_summary || '', lineH, esc);
    const certifications = format(data.certifications || '', lineH, esc);

    const expHTML = exp.filter(e => e.title || e.company).map(e => `
        <div style="margin-bottom:${itemMargin}; page-break-inside: avoid;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
                <h3 style="font-size:14px; margin:0; color:#0f172a; font-weight:700;">${esc(e.title || 'Position')}</h3>
                <span style="font-size:11px;color:#64748b;white-space:nowrap;margin-left:8px;font-weight:600;">${esc(e.start || '')}${e.end ? ' – ' + esc(e.end) : ''}</span>
            </div>
            <h4 style="font-size:13px;color:${accent};margin:0 0 6px 0;font-weight:600;">${esc(e.company || 'Company')}</h4>
            <div style="font-size:12px;color:#334155;">${format(e.description || '', lineH, esc)}</div>
        </div>
    `).join('');

    const eduHTML = edu.filter(e => e.degree || e.school).map(e => `
        <div style="margin-bottom:14px; page-break-inside: avoid;">
            <h3 style="font-size:13px; margin:0 0 4px 0; color:white; font-weight:700;">${esc(e.degree || 'Degree')}</h3>
            <div style="font-size:11px;color:#e2e8f0;font-weight:500;line-height:1.4;">${esc(e.school || 'School')}${e.grade ? ' <span style="opacity:0.7;">•</span> ' + esc(e.grade) : ''} ${e.year ? '<br>(' + esc(e.year) + ')' : ''}</div>
        </div>
    `).join('');

    const skSidebar = sk.filter(s => s).map(s => 
        `<div style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:6px;padding:5px 10px;font-size:11px;margin:0 6px 6px 0;display:inline-block;font-weight:500;">${esc(s)}</div>`
    ).join('');

    return \`<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            *, *::before, *::after { box-sizing: border-box; }
            .pdf-body { font-family: \${font}; margin: 0; padding: 0; color: #334155; background: white; -webkit-print-color-adjust: exact; }
            .pdf-container { display: flex; min-height: 11in; margin: 0 auto; max-width: 8.5in; background: white; }
            .sidebar { width: 230px; min-width: 230px; background: linear-gradient(165deg, #0f172a, \${accent}); color: white; padding: \${padding} 22px; }
            .main { flex: 1; padding: \${padding} 32px; color: #334155; }
            h1 { font-size: 24px; font-weight: 700; margin: 0 0 16px; line-height: 1.25; color: white; letter-spacing: -0.01em; }
            h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: \${accent}; margin: 0 0 12px; font-weight: 700; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; }
            .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; margin: 0 0 12px 0; font-weight: 700; color: white; border-bottom: 1px solid rgba(255,255,255,0.25); padding-bottom: 4px; }
            .sidebar h2 { color: white; }
            p, div, ul, li { margin: 0; padding: 0; }
        </style>
    </head>
    <body class="pdf-body">
        <div class="pdf-container">
            <aside class="sidebar">
                <header style="margin-bottom:32px;">
                    <h1>\${name}</h1>
                </header>
                <section style="margin-bottom:28px;">
                    <h2 class="section-label" style="border-bottom:1px solid rgba(255,255,255,0.25); margin-bottom:10px; padding-bottom:4px; font-size:10px;">Contact</h2>
                    \${contactParts.map(c => \`<div style="font-size:11px;opacity:0.95;margin-bottom:6px;word-break:break-word;font-weight:500;">\${esc(c)}</div>\`).join('')}
                </section>
                \${sk.length ? \`<section style="margin-bottom:28px;"><h2 class="section-label" style="border-bottom:1px solid rgba(255,255,255,0.25); margin-bottom:12px; padding-bottom:4px; font-size:10px;">Skills</h2><div>\${skSidebar}</div></section>\` : ''}
                \${eduHTML ? \`<section><h2 class="section-label" style="border-bottom:1px solid rgba(255,255,255,0.25); margin-bottom:12px; padding-bottom:4px; font-size:10px;">Education</h2>\${eduHTML}</section>\` : ''}
            </aside>
            <main class="main">
                \${summary ? \`<section style="margin-bottom:\${sectionMargin};"><h2>About Me</h2><div style="font-size:12px;color:#334155;">\${summary}</div></section>\` : ''}
                \${expHTML ? \`<section style="margin-bottom:\${sectionMargin};"><h2>Experience</h2>\${expHTML}</section>\` : ''}
                \${certifications ? \`<section><h2>Certifications</h2><div style="font-size:12px;color:#334155;">\${certifications}</div></section>\` : ''}
            </main>
        </div>
    </body>
    </html>\`;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResumeRenderer;
} else {
  window.ResumeRenderer = ResumeRenderer;
}
