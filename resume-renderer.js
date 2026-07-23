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
    const proj = data.projects || [];
    const font = data.font_family || 'Inter';
    const spacing = data.spacing || 'normal';
    const accent = data.accent_color || '#6366f1';

    // Compute spacing sizes
    let lineH, itemMargin, sectionMargin, padding;
    if (spacing === 'compact') {
      lineH = '1.35'; itemMargin = '8px'; sectionMargin = '12px'; padding = '24px';
    } else if (spacing === 'relaxed') {
      lineH = '1.85'; itemMargin = '18px'; sectionMargin = '26px'; padding = '44px';
    } else {
      lineH = '1.6'; itemMargin = '13px'; sectionMargin = '18px'; padding = '36px';
    }

    let fontStack = "'Geist', sans-serif";
    if (font === 'Inter') fontStack = "'Inter', sans-serif";
    else if (font === 'Plus Jakarta Sans') fontStack = "'Plus Jakarta Sans', sans-serif";
    else if (font === 'Manrope') fontStack = "'Manrope', sans-serif";
    else if (font === 'IBM Plex Sans') fontStack = "'IBM Plex Sans', sans-serif";
    else if (font === 'Source Sans 3') fontStack = "'Source Sans 3', sans-serif";
    else if (font === 'Lato') fontStack = "'Lato', sans-serif";
    else if (font === 'Merriweather') fontStack = "'Merriweather', serif";
    else if (font === 'Georgia') fontStack = "Georgia, serif";
    else if (font === 'Outfit') fontStack = "'Outfit', sans-serif";

    if (templateName === 'classic') {
      return this.classic(data, exp, edu, sk, proj, fontStack, lineH, itemMargin, sectionMargin, padding, accent);
    } else if (templateName === 'executive') {
      return this.executive(data, exp, edu, sk, proj, fontStack, lineH, itemMargin, sectionMargin, padding, accent);
    } else if (templateName === 'creative') {
      return this.creative(data, exp, edu, sk, proj, fontStack, lineH, itemMargin, sectionMargin, padding, accent);
    } else if (templateName === 'minimal') {
      return this.minimal(data, exp, edu, sk, proj, fontStack, lineH, itemMargin, sectionMargin, padding, accent);
    } else {
      return this.modern(data, exp, edu, sk, proj, fontStack, lineH, itemMargin, sectionMargin, padding, accent);
    }
  },

  buildContact(data, esc, separator) {
    const parts = [];
    if (data.email) parts.push(`<span data-editable="email">${esc(data.email)}</span>`);
    if (data.phone) parts.push(`<span data-editable="phone">${esc(data.phone)}</span>`);
    if (data.location) parts.push(`<span data-editable="location">${esc(data.location)}</span>`);
    return parts.join(separator);
  },

  modern(data, exp, edu, sk, proj, font, lineH, itemMargin, sectionMargin, padding, accent) {
    const esc = this.escape;
    const format = this.formatText;
    const name = esc(data.full_name || 'Your Name');
    const headline = esc(data.professional_headline || '');
    const contactHTML = this.buildContact(data, esc, ` <span style="margin:0 6px;color:#cbd5e1;user-select:none;">•</span> `);
    const summary = format(data.professional_summary || '', lineH, esc);
    const certifications = format(data.certifications || '', lineH, esc);

    const expHTML = exp.map((e, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="experience" data-dnd-index="${i}" draggable="true" style="margin-bottom:${itemMargin}; page-break-inside: avoid; position: relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
            <h3 data-editable="exp-title-${i}" style="font-size:14px; margin:0; color:#0f172a; font-weight:700;">${esc(e.title || 'Position')}</h3>
            <span style="font-size:11px;color:#64748b;white-space:nowrap;margin-left:8px;font-weight:500;">
                <span data-editable="exp-start-${i}">${esc(e.start || '')}</span>${e.end ? ' – <span data-editable="exp-end-' + i + '">' + esc(e.end) + '</span>' : ''}
            </span>
        </div>
        <h4 data-editable="exp-company-${i}" style="font-size:13px;color:${accent};font-weight:600;margin:0 0 6px 0;">${esc(e.company || 'Company')}</h4>
        <div data-editable="exp-description-${i}" style="font-size:12px;color:#334155;outline:none;">${format(e.description || '', lineH, esc)}</div>
      </div>`).join('');

    const eduHTML = edu.map((e, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="education" data-dnd-index="${i}" draggable="true" style="margin-bottom:${itemMargin}; page-break-inside: avoid; position: relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
            <h3 data-editable="edu-degree-${i}" style="font-size:14px; margin:0; color:#0f172a; font-weight:700;">${esc(e.degree || 'Degree')}</h3>
            <span data-editable="edu-year-${i}" style="font-size:11px;color:#64748b;margin-left:8px;font-weight:500;">${esc(e.year || '')}</span>
        </div>
        <h4 style="font-size:13px;color:#334155; margin:0; font-weight:500;">
            <span data-editable="edu-school-${i}">${esc(e.school || 'School')}</span>${e.grade ? ' <span style="color:#cbd5e1;user-select:none;">•</span> <span data-editable="edu-grade-' + i + '">' + esc(e.grade) + '</span>' : ''}
        </h4>
      </div>`).join('');

    const projHTML = proj.map((p, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="projects" data-dnd-index="${i}" draggable="true" style="margin-bottom:${itemMargin}; page-break-inside: avoid; position: relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
            <h3 data-editable="proj-name-${i}" style="font-size:14px; margin:0; color:#0f172a; font-weight:700;">${esc(p.name || 'Project Name')}</h3>
            <span data-editable="proj-dates-${i}" style="font-size:11px;color:#64748b;white-space:nowrap;margin-left:8px;font-weight:500;">${esc(p.dates || '')}</span>
        </div>
        <h4 style="font-size:13px;color:${accent};font-weight:600;margin:0 0 6px 0;">
            <span data-editable="proj-role-${i}">${esc(p.role || '')}</span>
            ${p.technologies ? `<span style="color:#64748b;font-weight:500;user-select:none;"> | </span><span data-editable="proj-tech-${i}" style="color:#64748b;font-weight:500;">${esc(p.technologies)}</span>` : ''}
            ${p.link ? `<span style="color:#64748b;font-weight:500;user-select:none;"> | </span><span data-editable="proj-link-${i}" style="color:${accent};text-decoration:none;">${esc(p.link)}</span>` : ''}
        </h4>
        <div data-editable="proj-description-${i}" style="font-size:12px;color:#334155;outline:none;">${format(p.description || '', lineH, esc)}</div>
      </div>`).join('');

    const skHTML = sk.map((s, i) => s ? `<span class="draggable-entry highlight-entry" data-dnd-type="skills" data-dnd-index="${i}" draggable="true" data-editable="skill-${i}" style="display:inline-block;background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);color:#1e293b;padding:4px 12px;border-radius:24px;font-size:11px;margin:4px 6px 4px 0;font-weight:500;position:relative;">${esc(s)}</span>` : '').join('');

    const h2Style = `font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#0f172a;margin:0 0 12px;padding-left:10px;border-left:3px solid ${accent};font-weight:700;`;

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&family=Lato:wght@400;700;900&family=Merriweather:wght@400;700;900&display=swap" rel="stylesheet">
        <meta charset="UTF-8">
        <style>
            *, *::before, *::after { box-sizing: border-box; }
            .pdf-body { font-family: ${font}; margin: 0; padding: 0; color: #334155; background: white; -webkit-print-color-adjust: exact; }
            .pdf-container { max-width: 8.5in; min-height: 11in; margin: 0 auto; padding: ${padding}; background: white; }
            h1 { font-size: 28px; font-weight: 700; margin: 0; color: #0f172a; letter-spacing: -0.01em; outline: none; }
            .header { border-bottom: 2px solid ${accent}; padding-bottom: 16px; margin-bottom: ${sectionMargin}; }
            .contact { margin: 0; color: #64748b; font-size: 12px; font-weight: 500; }
            .section { margin-bottom: ${sectionMargin}; page-break-inside: avoid; }
            h2 { ${h2Style} }
            p, div, ul, li, h3, h4, span { outline: none; }
        </style>
    </head>
    <body class="pdf-body">
        <div class="pdf-container">
            <header class="header">
                <h1 data-editable="fullName">${name}</h1>
                ${headline ? `<div data-editable="headline" style="font-size:15px;font-weight:500;color:#64748b;margin-top:4px;margin-bottom:12px;">${headline}</div>` : ''}
                <p class="contact">${contactHTML}</p>
            </header>
            
            ${summary ? `<section class="section"><h2>Professional Summary</h2><div data-editable="summary" style="font-size:12px;color:#334155;">${summary}</div></section>` : ''}
            ${expHTML ? `<section class="section"><h2>Work Experience</h2>${expHTML}</section>` : ''}
            ${eduHTML ? `<section class="section"><h2>Education</h2>${eduHTML}</section>` : ''}
            ${projHTML ? `<section class="section"><h2>Projects</h2>${projHTML}</section>` : ''}
            ${skHTML ? `<section class="section"><h2>Skills</h2><div style="margin-top: 6px;">${skHTML}</div></section>` : ''}
            ${certifications ? `<section class="section"><h2>Certifications</h2><div data-editable="certifications" style="font-size:12px;color:#334155;">${certifications}</div></section>` : ''}
        </div>
    </body>
    </html>`;
  },

  classic(data, exp, edu, sk, proj, font, lineH, itemMargin, sectionMargin, padding, accent) {
    const esc = this.escape;
    const format = this.formatText;
    const name = esc(data.full_name || 'Your Name');
    const headline = esc(data.professional_headline || '');
    const contactHTML = this.buildContact(data, esc, ` <span style="user-select:none; margin:0 4px;">|</span> `);
    const summary = format(data.professional_summary || '', lineH, esc);
    const certifications = format(data.certifications || '', lineH, esc);

    const expHTML = exp.map((e, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="experience" data-dnd-index="${i}" draggable="true" style="margin-bottom:${itemMargin}; page-break-inside: avoid; position: relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <h3 data-editable="exp-title-${i}" style="font-size:14px; margin:0; color:#111111; font-weight:700;">${esc(e.title || 'Position')}</h3>
            <span style="font-size:11px;color:#555555;font-weight:600;"><span data-editable="exp-start-${i}">${esc(e.start || '')}</span>${e.end ? ' – <span data-editable="exp-end-' + i + '">' + esc(e.end) + '</span>' : ''}</span>
        </div>
        <h4 data-editable="exp-company-${i}" style="font-size:13px; margin:2px 0 6px 0; font-style:italic;color:#444444;font-weight:500;">${esc(e.company || 'Company')}</h4>
        <div data-editable="exp-description-${i}" style="font-size:12px;color:#333333;outline:none;">${format(e.description || '', lineH, esc)}</div>
      </div>`).join('');

    const eduHTML = edu.map((e, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="education" data-dnd-index="${i}" draggable="true" style="margin-bottom:${itemMargin}; page-break-inside: avoid; position: relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <h3 data-editable="edu-degree-${i}" style="font-size:14px; margin:0; color:#111111; font-weight:700;">${esc(e.degree || 'Degree')}</h3>
            <span data-editable="edu-year-${i}" style="font-size:11px;color:#555555;font-weight:600;">${esc(e.year || '')}</span>
        </div>
        <h4 style="font-size:13px; margin:2px 0 0 0; font-style:italic;color:#444444;font-weight:500;"><span data-editable="edu-school-${i}">${esc(e.school || 'School')}</span>${e.grade ? ' <span style="user-select:none;">·</span> <span data-editable="edu-grade-' + i + '">' + esc(e.grade) + '</span>' : ''}</h4>
      </div>`).join('');

    const projHTML = proj.map((p, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="projects" data-dnd-index="${i}" draggable="true" style="margin-bottom:${itemMargin}; page-break-inside: avoid; position: relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <h3 data-editable="proj-name-${i}" style="font-size:14px; margin:0; color:#111111; font-weight:700;">${esc(p.name || 'Project Name')}</h3>
            <span data-editable="proj-dates-${i}" style="font-size:11px;color:#555555;font-weight:600;">${esc(p.dates || '')}</span>
        </div>
        <h4 style="font-size:13px; margin:2px 0 6px 0; font-style:italic;color:#444444;font-weight:500;">
            <span data-editable="proj-role-${i}">${esc(p.role || '')}</span>
            ${p.technologies ? `<span style="user-select:none;"> · </span><span data-editable="proj-tech-${i}">${esc(p.technologies)}</span>` : ''}
            ${p.link ? `<span style="user-select:none;"> · </span><span data-editable="proj-link-${i}">${esc(p.link)}</span>` : ''}
        </h4>
        <div data-editable="proj-description-${i}" style="font-size:12px;color:#333333;outline:none;">${format(p.description || '', lineH, esc)}</div>
      </div>`).join('');

    const skText = sk.map((s, i) => s ? `<span class="draggable-entry highlight-entry" data-dnd-type="skills" data-dnd-index="${i}" draggable="true" data-editable="skill-${i}" style="position:relative;display:inline-block;padding:2px 4px;margin:-2px 0;border-radius:2px;">${esc(s)}</span>` : '').filter(s => s).join('<span style="color:#666;">, </span>');
    const h2Style = `font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#111111;margin:0 0 10px;padding-bottom:4px;border-bottom:1px solid #111;font-weight:700;`;

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            *, *::before, *::after { box-sizing: border-box; }
            .pdf-body { font-family: ${font}; margin: 0; padding: 0; color: #333333; background: white; -webkit-print-color-adjust: exact; }
            .pdf-container { max-width: 8.5in; min-height: 11in; margin: 0 auto; padding: ${padding}; background: white; }
            h1 { font-size: 28px; font-weight: 700; margin: 0; letter-spacing: 0.04em; text-transform: uppercase; text-align: center; color: #111111; outline: none; }
            .header { text-align: center; margin-bottom: ${sectionMargin}; padding-bottom: 18px; border-bottom: 2px solid #111111; }
            .contact { margin: 0; color: #444444; font-size: 12px; font-weight: 500; }
            .section { margin-bottom: ${sectionMargin}; page-break-inside: avoid; }
            h2 { ${h2Style} }
            p, div, ul, li, h3, h4, span { outline: none; }
        </style>
    </head>
    <body class="pdf-body">
        <div class="pdf-container">
            <header class="header">
                <h1 data-editable="fullName">${name}</h1>
                ${headline ? `<div data-editable="headline" style="font-size:14px;font-weight:500;color:#444444;margin-top:8px;margin-bottom:8px;">${headline}</div>` : ''}
                <p class="contact">${contactHTML}</p>
            </header>
            
            ${summary ? `<section class="section"><h2>Summary</h2><div data-editable="summary" style="font-size:12px;color:#333333;">${summary}</div></section>` : ''}
            ${expHTML ? `<section class="section"><h2>Experience</h2>${expHTML}</section>` : ''}
            ${eduHTML ? `<section class="section"><h2>Education</h2>${eduHTML}</section>` : ''}
            ${projHTML ? `<section class="section"><h2>Projects</h2>${projHTML}</section>` : ''}
            ${skText ? `<section class="section"><h2>Skills</h2><div style="font-size:12px;color:#333333;line-height:${lineH};">${skText}</div></section>` : ''}
            ${certifications ? `<section class="section"><h2>Certifications</h2><div data-editable="certifications" style="font-size:12px;color:#333333;">${certifications}</div></section>` : ''}
        </div>
    </body>
    </html>`;
  },

  executive(data, exp, edu, sk, proj, font, lineH, itemMargin, sectionMargin, padding, accent) {
    const esc = this.escape;
    const format = this.formatText;
    const name = esc(data.full_name || 'Your Name');
    const headline = esc(data.professional_headline || '');
    const contactHTML = this.buildContact(data, esc, ` <span style="user-select:none; margin:0 8px; color:#cbd5e1;">|</span> `);
    const summary = format(data.professional_summary || '', lineH, esc);
    const certifications = format(data.certifications || '', lineH, esc);

    const expHTML = exp.map((e, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="experience" data-dnd-index="${i}" draggable="true" style="margin-bottom:${itemMargin}; page-break-inside: avoid; position: relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <h3 data-editable="exp-title-${i}" style="font-size:15px; margin:0; color:#000000; font-weight:700;">${esc(e.title || 'Position')}</h3>
            <span style="font-size:12px;color:#333333;font-weight:600;"><span data-editable="exp-start-${i}">${esc(e.start || '')}</span>${e.end ? ' – <span data-editable="exp-end-' + i + '">' + esc(e.end) + '</span>' : ''}</span>
        </div>
        <h4 data-editable="exp-company-${i}" style="font-size:14px; margin:2px 0 8px 0; color:${accent};font-weight:700;">${esc(e.company || 'Company')}</h4>
        <div data-editable="exp-description-${i}" style="font-size:12px;color:#1a1a1a;outline:none;">${format(e.description || '', lineH, esc)}</div>
      </div>`).join('');

    const eduHTML = edu.map((e, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="education" data-dnd-index="${i}" draggable="true" style="margin-bottom:${itemMargin}; page-break-inside: avoid; position: relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <h3 data-editable="edu-degree-${i}" style="font-size:15px; margin:0; color:#000000; font-weight:700;">${esc(e.degree || 'Degree')}</h3>
            <span data-editable="edu-year-${i}" style="font-size:12px;color:#333333;font-weight:600;">${esc(e.year || '')}</span>
        </div>
        <h4 style="font-size:14px; margin:2px 0 0 0; color:#333333;font-weight:600;"><span data-editable="edu-school-${i}">${esc(e.school || 'School')}</span>${e.grade ? ' <span style="user-select:none;">·</span> <span data-editable="edu-grade-' + i + '">' + esc(e.grade) + '</span>' : ''}</h4>
      </div>`).join('');

    const projHTML = proj.map((p, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="projects" data-dnd-index="${i}" draggable="true" style="margin-bottom:${itemMargin}; page-break-inside: avoid; position: relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <h3 data-editable="proj-name-${i}" style="font-size:15px; margin:0; color:#000000; font-weight:700;">${esc(p.name || 'Project Name')}</h3>
            <span data-editable="proj-dates-${i}" style="font-size:12px;color:#333333;font-weight:600;">${esc(p.dates || '')}</span>
        </div>
        <h4 style="font-size:14px; margin:2px 0 8px 0; color:#333333;font-weight:600;">
            <span data-editable="proj-role-${i}">${esc(p.role || '')}</span>
            ${p.technologies ? `<span style="user-select:none;"> | </span><span data-editable="proj-tech-${i}">${esc(p.technologies)}</span>` : ''}
            ${p.link ? `<span style="user-select:none;"> | </span><span data-editable="proj-link-${i}">${esc(p.link)}</span>` : ''}
        </h4>
        <div data-editable="proj-description-${i}" style="font-size:12px;color:#1a1a1a;outline:none;">${format(p.description || '', lineH, esc)}</div>
      </div>`).join('');

    const skText = sk.map((s, i) => s ? `<span class="draggable-entry highlight-entry" data-dnd-type="skills" data-dnd-index="${i}" draggable="true" data-editable="skill-${i}" style="position:relative;display:inline-block;padding:2px 4px;margin:-2px 0;border-radius:2px;font-weight:600;">${esc(s)}</span>` : '').filter(s => s).join('<span style="color:#cbd5e1;"> | </span>');
    const h2Style = `font-size:13px;text-transform:uppercase;letter-spacing:0.1em;color:${accent};margin:0 0 12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;font-weight:800;`;

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            *, *::before, *::after { box-sizing: border-box; }
            .pdf-body { font-family: ${font}; margin: 0; padding: 0; color: #1a1a1a; background: white; -webkit-print-color-adjust: exact; }
            .pdf-container { max-width: 8.5in; min-height: 11in; margin: 0 auto; padding: ${padding}; background: white; }
            h1 { font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.02em; color: #000000; outline: none; }
            .header { margin-bottom: ${sectionMargin}; padding-bottom: 20px; border-bottom: 4px solid ${accent}; }
            .contact { margin: 0; color: #475569; font-size: 13px; font-weight: 500; }
            .section { margin-bottom: ${sectionMargin}; page-break-inside: avoid; }
            h2 { ${h2Style} }
            p, div, ul, li, h3, h4, span { outline: none; }
        </style>
    </head>
    <body class="pdf-body">
        <div class="pdf-container">
            <header class="header">
                <h1 data-editable="fullName">${name}</h1>
                ${headline ? `<div data-editable="headline" style="font-size:16px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.05em;margin-top:6px;margin-bottom:12px;">${headline}</div>` : ''}
                <p class="contact">${contactHTML}</p>
            </header>
            
            ${summary ? `<section class="section"><h2>Executive Summary</h2><div data-editable="summary" style="font-size:13px;color:#1a1a1a;">${summary}</div></section>` : ''}
            ${expHTML ? `<section class="section"><h2>Professional Experience</h2>${expHTML}</section>` : ''}
            ${eduHTML ? `<section class="section"><h2>Education</h2>${eduHTML}</section>` : ''}
            ${projHTML ? `<section class="section"><h2>Key Initiatives</h2>${projHTML}</section>` : ''}
            ${skText ? `<section class="section"><h2>Core Competencies</h2><div style="font-size:12px;color:#1a1a1a;line-height:${lineH};">${skText}</div></section>` : ''}
            ${certifications ? `<section class="section"><h2>Certifications</h2><div data-editable="certifications" style="font-size:13px;color:#1a1a1a;">${certifications}</div></section>` : ''}
        </div>
    </body>
    </html>`;
  },

  creative(data, exp, edu, sk, proj, font, lineH, itemMargin, sectionMargin, padding, accent) {
    const esc = this.escape;
    const format = this.formatText;
    const name = esc(data.full_name || 'Your Name');
    const headline = esc(data.professional_headline || '');
    
    const contactParts = [];
    if (data.email) contactParts.push(`<div data-editable="email" style="font-size:11px;opacity:0.95;margin-bottom:6px;word-break:break-word;font-weight:500;">${esc(data.email)}</div>`);
    if (data.phone) contactParts.push(`<div data-editable="phone" style="font-size:11px;opacity:0.95;margin-bottom:6px;word-break:break-word;font-weight:500;">${esc(data.phone)}</div>`);
    if (data.location) contactParts.push(`<div data-editable="location" style="font-size:11px;opacity:0.95;margin-bottom:6px;word-break:break-word;font-weight:500;">${esc(data.location)}</div>`);
    const contactHTML = contactParts.join('');

    const summary = format(data.professional_summary || '', lineH, esc);
    const certifications = format(data.certifications || '', lineH, esc);

    const expHTML = exp.map((e, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="experience" data-dnd-index="${i}" draggable="true" style="margin-bottom:${itemMargin}; page-break-inside: avoid; position: relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
            <h3 data-editable="exp-title-${i}" style="font-size:14px; margin:0; color:#0f172a; font-weight:700;">${esc(e.title || 'Position')}</h3>
            <span style="font-size:11px;color:#64748b;white-space:nowrap;margin-left:8px;font-weight:600;"><span data-editable="exp-start-${i}">${esc(e.start || '')}</span>${e.end ? ' – <span data-editable="exp-end-' + i + '">' + esc(e.end) + '</span>' : ''}</span>
        </div>
        <h4 data-editable="exp-company-${i}" style="font-size:13px;color:${accent};margin:0 0 6px 0;font-weight:600;">${esc(e.company || 'Company')}</h4>
        <div data-editable="exp-description-${i}" style="font-size:12px;color:#334155;outline:none;">${format(e.description || '', lineH, esc)}</div>
      </div>`).join('');

    const eduHTML = edu.map((e, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="education" data-dnd-index="${i}" draggable="true" style="margin-bottom:14px; page-break-inside: avoid; position: relative;">
        <h3 data-editable="edu-degree-${i}" style="font-size:13px; margin:0 0 4px 0; color:white; font-weight:700;">${esc(e.degree || 'Degree')}</h3>
        <div style="font-size:11px;color:#e2e8f0;font-weight:500;line-height:1.4;"><span data-editable="edu-school-${i}">${esc(e.school || 'School')}</span>${e.grade ? ' <span style="opacity:0.7;user-select:none;">•</span> <span data-editable="edu-grade-' + i + '">' + esc(e.grade) + '</span>' : ''} ${e.year ? '<br>(<span data-editable="edu-year-' + i + '">' + esc(e.year) + '</span>)' : ''}</div>
      </div>`).join('');

    const projHTML = proj.map((p, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="projects" data-dnd-index="${i}" draggable="true" style="margin-bottom:${itemMargin}; page-break-inside: avoid; position: relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
            <h3 data-editable="proj-name-${i}" style="font-size:14px; margin:0; color:#0f172a; font-weight:700;">${esc(p.name || 'Project Name')}</h3>
            <span data-editable="proj-dates-${i}" style="font-size:11px;color:#64748b;white-space:nowrap;margin-left:8px;font-weight:600;">${esc(p.dates || '')}</span>
        </div>
        <h4 style="font-size:13px;color:${accent};margin:0 0 6px 0;font-weight:600;">
            <span data-editable="proj-role-${i}">${esc(p.role || '')}</span>
            ${p.technologies ? `<span style="user-select:none;color:#64748b;"> | </span><span data-editable="proj-tech-${i}" style="color:#64748b;">${esc(p.technologies)}</span>` : ''}
            ${p.link ? `<span style="user-select:none;color:#64748b;"> | </span><span data-editable="proj-link-${i}" style="color:${accent};">${esc(p.link)}</span>` : ''}
        </h4>
        <div data-editable="proj-description-${i}" style="font-size:12px;color:#334155;outline:none;">${format(p.description || '', lineH, esc)}</div>
      </div>`).join('');

    const skSidebar = sk.map((s, i) => 
      s ? `<div class="draggable-entry highlight-entry" data-dnd-type="skills" data-dnd-index="${i}" draggable="true" data-editable="skill-${i}" style="position:relative;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:6px;padding:5px 10px;font-size:11px;margin:0 6px 6px 0;display:inline-block;font-weight:500;">${esc(s)}</div>` : ''
    ).join('');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            *, *::before, *::after { box-sizing: border-box; }
            .pdf-body { font-family: ${font}; margin: 0; padding: 0; color: #334155; background: white; -webkit-print-color-adjust: exact; }
            .pdf-container { display: flex; min-height: 11in; margin: 0 auto; max-width: 8.5in; background: white; }
            .sidebar { width: 230px; min-width: 230px; background: linear-gradient(165deg, #0f172a, ${accent}); color: white; padding: ${padding} 22px; }
            .main { flex: 1; padding: ${padding} 32px; color: #334155; }
            h1 { font-size: 24px; font-weight: 700; margin: 0 0 16px; line-height: 1.25; color: white; letter-spacing: -0.01em; outline: none; }
            h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: ${accent}; margin: 0 0 12px; font-weight: 700; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; }
            .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; margin: 0 0 12px 0; font-weight: 700; color: white; border-bottom: 1px solid rgba(255,255,255,0.25); padding-bottom: 4px; }
            .sidebar h2 { color: white; }
            p, div, ul, li, h3, h4, span { outline: none; }
        </style>
    </head>
    <body class="pdf-body">
        <div class="pdf-container">
            <aside class="sidebar">
                <header style="margin-bottom:32px;">
                    <h1 data-editable="fullName">${name}</h1>
                </header>
                <section style="margin-bottom:28px;">
                    <h2 class="section-label">Contact</h2>
                    ${contactHTML}
                </section>
                ${sk.length ? `<section style="margin-bottom:28px;"><h2 class="section-label">Skills</h2><div>${skSidebar}</div></section>` : ''}
                ${eduHTML ? `<section><h2 class="section-label">Education</h2>${eduHTML}</section>` : ''}
            </aside>
            <main class="main">
                ${headline ? `<section style="margin-bottom:14px;"><h2 style="border-bottom:none; margin:0 0 8px 0; padding:0; color:${accent}; font-size:15px; font-weight:600; letter-spacing:normal; text-transform:none;">${headline}</h2></section>` : ''}
                ${summary ? `<section style="margin-bottom:${sectionMargin}; page-break-inside: avoid;"><h2>About Me</h2><div data-editable="summary" style="font-size:12px;color:#334155;">${summary}</div></section>` : ''}
                ${expHTML ? `<section style="margin-bottom:${sectionMargin}; page-break-inside: avoid;"><h2>Experience</h2>${expHTML}</section>` : ''}
                ${projHTML ? `<section style="margin-bottom:${sectionMargin}; page-break-inside: avoid;"><h2>Projects</h2>${projHTML}</section>` : ''}
                ${certifications ? `<section style="page-break-inside: avoid;"><h2>Certifications</h2><div data-editable="certifications" style="font-size:12px;color:#334155;">${certifications}</div></section>` : ''}
            </main>
        </div>
    </body>
    </html>`;
  },

  minimal(data, exp, edu, sk, proj, font, lineH, itemMargin, sectionMargin, padding, accent) {
    const esc = this.escape;
    const format = this.formatText;
    const name = esc(data.full_name || 'Your Name');
    const headline = esc(data.professional_headline || '');
    const contactHTML = this.buildContact(data, esc, ` <span style="margin:0 6px;color:#94a3b8;user-select:none;">•</span> `);
    const summary = format(data.professional_summary || '', lineH, esc);
    const certifications = format(data.certifications || '', lineH, esc);

    const expHTML = exp.map((e, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="experience" data-dnd-index="${i}" draggable="true" style="margin-bottom:${itemMargin}; page-break-inside: avoid; position: relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
            <h3 data-editable="exp-title-${i}" style="font-size:13px; margin:0; color:#1e293b; font-weight:700;">${esc(e.title || 'Position')}${e.company ? ` <span style="font-weight:400;">at</span> ${esc(e.company)}` : ''}</h3>
            <span style="font-size:11px;color:#64748b;white-space:nowrap;margin-left:8px;">
                <span data-editable="exp-start-${i}">${esc(e.start || '')}</span>${e.end ? ' – <span data-editable="exp-end-' + i + '">' + esc(e.end) + '</span>' : ''}
            </span>
        </div>
        <div data-editable="exp-description-${i}" style="font-size:12px;color:#475569;outline:none;">${format(e.description || '', lineH, esc)}</div>
      </div>`).join('');

    const eduHTML = edu.map((e, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="education" data-dnd-index="${i}" draggable="true" style="margin-bottom:${itemMargin}; page-break-inside: avoid; position: relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <h3 data-editable="edu-degree-${i}" style="font-size:13px; margin:0; color:#1e293b; font-weight:700;">${esc(e.degree || 'Degree')}</h3>
            <span data-editable="edu-year-${i}" style="font-size:11px;color:#64748b;">${esc(e.year || '')}</span>
        </div>
        <div style="font-size:12px;color:#475569; margin:2px 0 0 0;">
            <span data-editable="edu-school-${i}">${esc(e.school || 'School')}</span>${e.grade ? ' <span style="color:#cbd5e1;user-select:none;">•</span> <span data-editable="edu-grade-' + i + '">' + esc(e.grade) + '</span>' : ''}
        </div>
      </div>`).join('');

    const projHTML = proj.map((p, i) => `
      <div class="draggable-entry highlight-entry" data-dnd-type="projects" data-dnd-index="${i}" draggable="true" style="margin-bottom:${itemMargin}; page-break-inside: avoid; position: relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
            <h3 data-editable="proj-name-${i}" style="font-size:13px; margin:0; color:#1e293b; font-weight:700;">${esc(p.name || 'Project Name')}${p.role ? ` <span style="font-weight:400;">- ${esc(p.role)}</span>` : ''}</h3>
            <span data-editable="proj-dates-${i}" style="font-size:11px;color:#64748b;white-space:nowrap;margin-left:8px;">${esc(p.dates || '')}</span>
        </div>
        ${p.technologies || p.link ? `
        <div style="font-size:12px;color:#64748b;margin:0 0 4px 0;">
            ${p.technologies ? `<span data-editable="proj-tech-${i}">${esc(p.technologies)}</span>` : ''}
            ${p.technologies && p.link ? ' | ' : ''}
            ${p.link ? `<span data-editable="proj-link-${i}">${esc(p.link)}</span>` : ''}
        </div>` : ''}
        <div data-editable="proj-description-${i}" style="font-size:12px;color:#475569;outline:none;">${format(p.description || '', lineH, esc)}</div>
      </div>`).join('');

    const skText = sk.map((s, i) => s ? `<span class="draggable-entry highlight-entry" data-dnd-type="skills" data-dnd-index="${i}" draggable="true" data-editable="skill-${i}" style="display:inline-block;">${esc(s)}</span>` : '').filter(s => s).join('<span style="color:#cbd5e1;margin:0 6px;">•</span>');

    const h2Style = `font-size:12px;color:#1e293b;margin:0 0 10px;padding:0;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;`;

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            *, *::before, *::after { box-sizing: border-box; }
            .pdf-body { font-family: ${font}; margin: 0; padding: 0; color: #475569; background: white; -webkit-print-color-adjust: exact; }
            .pdf-container { max-width: 8.5in; min-height: 11in; margin: 0 auto; padding: ${padding}; background: white; }
            h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px; color: #0f172a; outline: none; }
            .header { margin-bottom: ${sectionMargin}; }
            .contact { margin: 0; color: #64748b; font-size: 11px; }
            .section { margin-bottom: ${sectionMargin}; page-break-inside: avoid; }
            h2 { ${h2Style} }
            p, div, ul, li, h3, h4, span { outline: none; }
        </style>
    </head>
    <body class="pdf-body">
        <div class="pdf-container">
            <header class="header">
                <h1 data-editable="fullName">${name}</h1>
                ${headline ? `<div data-editable="headline" style="font-size:14px;font-weight:500;color:#475569;margin-bottom:6px;">${headline}</div>` : ''}
                <p class="contact">${contactHTML}</p>
            </header>
            
            ${summary ? `<section class="section"><h2>Summary</h2><div data-editable="summary" style="font-size:12px;color:#475569;">${summary}</div></section>` : ''}
            ${expHTML ? `<section class="section"><h2>Experience</h2>${expHTML}</section>` : ''}
            ${eduHTML ? `<section class="section"><h2>Education</h2>${eduHTML}</section>` : ''}
            ${projHTML ? `<section class="section"><h2>Projects</h2>${projHTML}</section>` : ''}
            ${skText ? `<section class="section"><h2>Skills</h2><div style="font-size:12px;color:#475569;line-height:${lineH};">${skText}</div></section>` : ''}
            ${certifications ? `<section class="section"><h2>Certifications</h2><div data-editable="certifications" style="font-size:12px;color:#475569;">${certifications}</div></section>` : ''}
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