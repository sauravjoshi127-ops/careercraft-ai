'use strict';

const PDFDocument = require('pdfkit');

/**
 * Generate a premium, minimalist cover letter PDF using PDFKit.
 * No ATS/relevance scores or keyword metrics are included in the output.
 *
 * @param {object} data
 * @param {string} data.letter       - Full cover letter text
 * @param {string} data.jobTitle     - Job title being applied for
 * @param {string} data.companyName  - Target company name
 * @param {string} [data.candidateName] - Applicant's name (optional)
 * @returns {Promise<Buffer>} - PDF as a Buffer
 */
function generateCoverLetterPDF(data) {
  return new Promise((resolve, reject) => {
    const {
      letter = '',
      jobTitle = 'Cover Letter',
      companyName = '',
      candidateName = ''
    } = data;

    // Premium A4 layout with generous margins for a letter feel
    const doc = new PDFDocument({
      margins: { top: 72, bottom: 72, left: 80, right: 80 },
      size: 'A4',
      info: {
        Title: `Cover Letter – ${jobTitle}`,
        Author: candidateName || 'CareerCraft AI',
        Subject: `Application for ${jobTitle}${companyName ? ` at ${companyName}` : ''}`
      }
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // ── Header ─────────────────────────────────────────────────────────────────
    // Candidate name (if provided)
    if (candidateName) {
      doc
        .fontSize(18)
        .fillColor('#111111')
        .font('Helvetica-Bold')
        .text(candidateName, { align: 'left' });
      doc.moveDown(0.3);
    }

    // Date line
    doc
      .fontSize(10)
      .fillColor('#666666')
      .font('Helvetica')
      .text(dateStr, { align: 'left' });

    doc.moveDown(0.3);

    // Job title + company (subtle, clean)
    if (jobTitle) {
      doc
        .fontSize(10)
        .fillColor('#333333')
        .font('Helvetica-Bold')
        .text(`Re: ${jobTitle}${companyName ? ` — ${companyName}` : ''}`, { align: 'left' });
    }

    // Thin separator
    doc
      .moveDown(0.8)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.margins.left + pageWidth, doc.y)
      .strokeColor('#dddddd')
      .lineWidth(0.75)
      .stroke()
      .moveDown(1.2);

    // ── Letter body ────────────────────────────────────────────────────────────
    doc
      .fontSize(11)
      .fillColor('#1a1a1a')
      .font('Helvetica');

    // Normalize line endings from escaped \n sequences
    const cleanLetter = letter
      .replace(/\\n\\n/g, '\n\n')
      .replace(/\\n/g, '\n')
      .replace(/\\/g, '');

    // Split into paragraphs, preserving single-line breaks as part of a paragraph
    const paragraphs = cleanLetter
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(Boolean);

    paragraphs.forEach((para, idx) => {
      // Preserve internal single newlines (e.g. greeting/sign-off lines)
      const lines = para.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 1) {
        doc.text(lines[0], { align: 'justify', lineGap: 4 });
      } else {
        lines.forEach((line) => {
          doc.text(line, { align: 'left', lineGap: 2 });
        });
      }
      if (idx < paragraphs.length - 1) doc.moveDown(0.9);
    });

    // ── Footer ─────────────────────────────────────────────────────────────────
    doc
      .fontSize(8)
      .fillColor('#bbbbbb')
      .font('Helvetica')
      .text('CareerCraft AI', doc.page.margins.left, doc.page.height - 50, {
        align: 'center',
        width: pageWidth
      });

    doc.end();
  });
}

module.exports = { generateCoverLetterPDF };
