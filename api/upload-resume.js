'use strict';

const path = require('path');
const Busboy = require('busboy');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Parse a multipart/form-data request using busboy and return the uploaded files.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Array<{fieldname: string, originalname: string, mimetype: string, buffer: Buffer}>>}
 */
function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      // Set busboy limit to MAX_FILE_SIZE + 1 so the 'limit' event fires for
      // files that exceed the threshold, letting us return an actionable error.
      bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_SIZE + 1 } });
    } catch (err) {
      return reject(new Error('Invalid or missing multipart/form-data content-type.'));
    }

    const files = [];

    bb.on('file', (fieldname, fileStream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      let truncated = false;

      fileStream.on('data', chunk => chunks.push(chunk));
      fileStream.on('limit', () => { truncated = true; });
      fileStream.on('close', () => {
        files.push({ fieldname, originalname: filename, mimetype: mimeType, buffer: Buffer.concat(chunks), truncated });
      });
    });

    bb.on('close', () => resolve(files));
    bb.on('error', reject);

    req.pipe(bb);
  });
}

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

  let files;
  try {
    files = await parseMultipartForm(req);
  } catch (err) {
    console.error('Multipart parse error:', err.message);
    return res.status(400).json({ error: err.message || 'Failed to read uploaded file.' });
  }

  const resumeFile = files.find(f => f.fieldname === 'resume');
  if (!resumeFile) {
    return res.status(400).json({ error: 'No file uploaded. Please upload a PDF or DOCX file.' });
  }

  if (!resumeFile.buffer || resumeFile.buffer.length === 0) {
    return res.status(422).json({ error: 'File appears to be empty.' });
  }

  if (resumeFile.truncated || resumeFile.buffer.length > MAX_FILE_SIZE) {
    return res.status(413).json({ error: 'File too large. Maximum size is 5 MB.' });
  }

  const ext = path.extname(resumeFile.originalname || '').toLowerCase();

  if (!ALLOWED_MIME_TYPES.includes(resumeFile.mimetype)) {
    // Accept generic MIME types when the file extension is explicitly allowed
    // (some browsers send application/octet-stream for all file types)
    const genericMime = resumeFile.mimetype === 'application/octet-stream' || !resumeFile.mimetype;
    if (!(genericMime && ALLOWED_EXTENSIONS.includes(ext))) {
      console.warn(`[upload] Rejected: mime="${resumeFile.mimetype}" ext="${ext}"`);
      return res.status(400).json({ error: `Only PDF and DOCX files are accepted. Received: ${resumeFile.mimetype || 'unknown type'}.` });
    }
  }

  const isPDF  = resumeFile.mimetype === 'application/pdf' || ext === '.pdf';
  const isDOCX = resumeFile.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx';

  console.log(`[upload] Received: name="${resumeFile.originalname}" mime="${resumeFile.mimetype}" ext="${ext}" size=${resumeFile.buffer.length}B`);

  try {
    let resumeText = '';

    if (isPDF) {
      console.log('[upload] Parsing PDF…');
      const parser = new PDFParse({ data: resumeFile.buffer });
      const parsed = await parser.getText();
      await parser.destroy();
      resumeText = parsed.text || '';
    } else if (isDOCX) {
      console.log('[upload] Parsing DOCX…');
      const result = await mammoth.extractRawText({ buffer: resumeFile.buffer });
      resumeText = result.value || '';
    }

    resumeText = resumeText.trim();
    console.log(`[upload] Extracted ${resumeText.length} characters`);

    if (!resumeText) {
      return res.status(422).json({ error: 'Could not extract text from the uploaded file. Please ensure the file is not scanned/image-only.' });
    }

    return res.status(200).json({ resumeText });
  } catch (err) {
    console.error('[upload] Parse error:', err);
    // Parsing failures are client-side issues (bad/corrupted/encrypted file) — use 422
    return res.status(422).json({ error: `Failed to parse resume: ${err.message}. Please ensure the file is a valid, non-encrypted PDF or DOCX.` });
  }
};

// Disable Vercel's default body parser so busboy can receive the raw multipart stream.
// This MUST be set after `module.exports = ...` so it is not overwritten.
module.exports.config = {
  api: {
    bodyParser: false
  }
};
