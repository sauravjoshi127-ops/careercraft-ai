'use strict';

const { generateCoverLetterPDF, generateColdEmailPDF } = require('../utils/pdf-generator');
const { authenticateRequest } = require('../utils/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    letter,
    jobTitle,
    companyName,
    candidateName,
    type,
    subject,
    body,
    recipientName,
    senderName
  } = req.body || {};

  if (type === 'cold-email') {
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'No email body content provided.' });
    }
  } else {
    if (!letter || !letter.trim()) {
      return res.status(400).json({ error: 'No letter content provided.' });
    }
  }

  try {
    // Authenticate request to prevent resource abuse
    await authenticateRequest(req);
    
    let pdfBuffer;
    let filename;

    if (type === 'cold-email') {
      pdfBuffer = await generateColdEmailPDF({
        subject: subject || '',
        body: body || '',
        companyName: companyName || '',
        recipientName: recipientName || '',
        senderName: senderName || ''
      });
      const safe = (companyName || 'email').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 60);
      filename = `ColdEmail-${safe}-${new Date().toISOString().split('T')[0]}.pdf`;
    } else {
      pdfBuffer = await generateCoverLetterPDF({
        letter,
        jobTitle: jobTitle || 'Cover Letter',
        companyName: companyName || '',
        candidateName: candidateName || ''
      });
      const safe = (jobTitle || 'letter').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 60);
      filename = `CoverLetter-${safe}-${new Date().toISOString().split('T')[0]}.pdf`;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    return res.status(500).json({ error: 'Failed to generate PDF. Please try again.' });
  }
};
