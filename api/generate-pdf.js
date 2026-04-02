'use strict';

const { generateCoverLetterPDF } = require('../utils/pdf-generator');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { letter, jobTitle, companyName, ats_score, relevance_score, keywords_used, matched_keywords } = req.body || {};

  if (!letter || !letter.trim()) {
    return res.status(400).json({ error: 'No letter content provided.' });
  }

  try {
    const pdfBuffer = await generateCoverLetterPDF({
      letter,
      jobTitle: jobTitle || 'Cover Letter',
      companyName: companyName || '',
      ats_score,
      relevance_score,
      keywords_used: Array.isArray(keywords_used) ? keywords_used : [],
      matched_keywords: Array.isArray(matched_keywords) ? matched_keywords : []
    });

    const safe = (jobTitle || 'letter').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 60);
    const filename = `CoverLetter-${safe}-${new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    return res.status(500).json({ error: 'Failed to generate PDF. Please try again.' });
  }
};
