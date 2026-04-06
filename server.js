require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const mammoth = require('mammoth');
const { calculateAtsScore, calculateRelevanceScore } = require('./utils/scoring');
const { generateCoverLetterPDF } = require('./utils/pdf-generator');
const coldEmailHandler = require('./api/cold-email');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── Multer (resume upload) ──────────────────────────────────────────────────

const RESUME_ALLOWED_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const RESUME_ALLOWED_EXTS = ['.pdf', '.docx'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype || '';
    const ext = path.extname(file.originalname || '').toLowerCase();
    // Accept if MIME type matches OR if MIME is generic/unknown but extension is allowed
    // (some browsers — especially mobile — send application/octet-stream for all files)
    const mimeOk = RESUME_ALLOWED_MIMES.includes(mime);
    const extOk  = RESUME_ALLOWED_EXTS.includes(ext);
    if (mimeOk || (mime === 'application/octet-stream' && extOk) || (!mime && extOk)) {
      return cb(null, true);
    }
    console.warn(`[upload] Rejected file: originalname="${file.originalname}" mime="${mime}" ext="${ext}"`);
    cb(new Error(`Only PDF and DOCX files are accepted. Received: ${mime || 'unknown type'}.`));
  }
});


// ─── Helpers ────────────────────────────────────────────────────────────────

function parseGeminiResponse(text) {
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];

  if (text.startsWith('{') && !text.endsWith('}')) {
    console.warn('Gemini response appears truncated; appending closing brace for recovery.');
    text = text + '}';
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('JSON parse error:', e.message, '\nText snippet:', text.substring(0, 500));
    const letterMatch = text.match(/"letter"\s*:\s*"([\s\S]*?)"/);
    data = {
      letter: letterMatch ? letterMatch[1].replace(/\\n/g, '\n') : text,
      variants: [],
      keywords_used: [],
      ats_score: null,
      relevance_score: null
    };
  }

  // Normalize types regardless of parse path
  data.letter = typeof data.letter === 'string' ? data.letter : '';
  data.variants = Array.isArray(data.variants) ? data.variants : [];
  data.keywords_used = Array.isArray(data.keywords_used) ? data.keywords_used : [];
  data.ats_score = typeof data.ats_score === 'number' ? data.ats_score : null;
  data.relevance_score = typeof data.relevance_score === 'number' ? data.relevance_score : null;

  return data;
}

async function callGeminiWithRetry(apiKey, body, maxRetries = 3) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (r.status !== 429) return r;

    const retryAfter = parseInt(r.headers.get('Retry-After') || '0', 10);
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt + 1) * 1000;
    console.warn(`Gemini rate limited (429). Waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}.`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  // Final attempt
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (r.status === 429) {
    const err = new Error('AI service is busy (rate limited). Please try again in a moment.');
    err.status = 429;
    throw err;
  }
  return r;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// ─── Resume Upload & Parse ────────────────────────────────────────────────────

app.post('/api/upload-resume', (req, res, next) => {
  upload.single('resume')(req, res, err => {
    if (err) {
      // Multer validation errors (file type, size limit) — return JSON, not HTML
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large. Maximum size is 5 MB.'
        : (err.message || 'Invalid file.');
      console.error('[upload] Multer error:', message);
      return res.status(status).json({ error: message });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Please upload a PDF or DOCX file.' });
  }

  const { originalname, mimetype, size } = req.file;
  const ext = path.extname(originalname || '').toLowerCase();
  console.log(`[upload] Received: name="${originalname}" mime="${mimetype}" ext="${ext}" size=${size}B`);

  // Determine effective file type by MIME first, then fall back to extension
  const isPDF  = mimetype === 'application/pdf' || ext === '.pdf';
  const isDOCX = mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx';

  if (!isPDF && !isDOCX) {
    console.warn(`[upload] Unsupported file type: mime="${mimetype}" ext="${ext}"`);
    return res.status(400).json({ error: `Unsupported file type (${mimetype || ext || 'unknown'}). Please upload a PDF or DOCX file.` });
  }

  try {
    let resumeText = '';

    if (isPDF) {
    console.log('[upload] Parsing PDF…');
    const parsed = await pdfParse(req.file.buffer);
    resumeText = parsed.text || '';
} else {
    console.log('[upload] Parsing DOCX…');
      console.log('[upload] Parsing DOCX…');
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      resumeText = result.value || '';
    }

    resumeText = resumeText.trim();
    console.log(`[upload] Extracted ${resumeText.length} characters from "${originalname}"`);

    if (!resumeText) {
      return res.status(422).json({ error: 'Could not extract text from the uploaded file. Please ensure the file is not scanned/image-only.' });
    }

    return res.status(200).json({ resumeText });
  } catch (err) {
    console.error('[upload] Parse error:', err);
    // Parsing failures are client-side issues (bad/corrupted/encrypted file) — use 422
    return res.status(422).json({ error: `Failed to parse resume: ${err.message}. Please ensure the file is a valid, non-encrypted PDF or DOCX.` });
  }
});

app.post('/api/cover-letter', async (req, res) => {
  const body = req.body || {};
  const jobTitle = String(body.jobTitle || '').trim();
  const companyName = String(body.companyName || '').trim();
  const jobDescription = String(body.jobDescription || '').trim();
  const highlights = String(body.highlights || '').trim();
  const tone = String(body.tone || 'Professional').trim();
  const length = String(body.length || 'Medium').trim();
  const opening = String(body.opening || '').trim();
  const closing = String(body.closing || '').trim();
  const resumeText = String(body.resumeText || '').trim();
  const mirrorStructure = Boolean(body.mirrorStructure);

  if (!jobTitle || !companyName || !jobDescription) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set. Please add it to your .env file.' });
  }

  const resumeSection = resumeText
    ? `\nCANDIDATE RESUME (use for context, skills and achievements):\n${resumeText.slice(0, 3000)}\n`
    : '';

  const mirrorNote = mirrorStructure && resumeText
    ? `\nSTRUCTURE NOTE: The candidate has requested their cover letter mirror the structure and style of their resume. Analyze the resume sections, order, and phrasing style, then shape the cover letter layout to reflect that structure and voice.\n`
    : '';

  const prompt = `You are an elite professional career writer. Write a compelling, well-crafted cover letter that strictly follows the standard professional structure used by hiring managers worldwide (as described by Indeed Career Advice).

QUALITY STANDARDS:
- If the candidate's input is generic or weak, actively improve and elevate it — never write bland output
- Use specific, confident, results-oriented language
- Show genuine enthusiasm for the role and company
- Avoid clichés like "I am writing to apply" or "I believe I would be a great fit"
- Every sentence should add value and demonstrate suitability
- AI must enhance weak or missing details with strong, plausible professional language

REQUIRED LETTER STRUCTURE (follow this exactly, in order):
1. DATE: Write today's date on its own line (e.g. "April 2, 2026")
2. GREETING: Formal salutation — use "Dear Hiring Manager," unless a specific name is inferable from the job description; end with a comma
3. OPENING PARAGRAPH: Introduce yourself, name the exact role you are applying for, name the company, and express genuine enthusiasm for the opportunity. Make a strong first impression — do NOT open with "I am writing to apply…"
4. SKILLS & EXPERIENCE PARAGRAPH: Highlight 2–3 of the most relevant technical skills, accomplishments, or experiences that directly match the job requirements. Quantify achievements where possible (e.g. "reduced load time by 40%"). Connect your background to the role's core needs.
5. COMPANY FIT PARAGRAPH: Explain why this specific company excites you — its mission, culture, product, or values. Show that you have researched the company and that your work style, values, and approach make you a natural fit for their team.
6. CLOSING PARAGRAPH: Thank the reader for their time, express eagerness for an interview to discuss your qualifications further, and provide a clear call to action.
7. PROFESSIONAL SIGN-OFF: Use "Sincerely," or "Best regards," on its own line, followed by a blank line, then the candidate's name (if provided, otherwise leave a blank signature line).
${resumeSection}${mirrorNote}
FORMATTING RULES:
- Use "\\n\\n" between each section/paragraph (double newline for spacing)
- Use "\\n" for line breaks within the greeting and sign-off
- Tone: ${tone || 'Professional'}
- Length: ${length || 'Medium'} (Short=4 paragraphs, Medium=5 paragraphs, Long=6 paragraphs)
- Write in first person
- Do NOT include placeholder text like [Your Name], [Date], [Address] — write real content only
- Do NOT include contact info blocks or address headers unless specifically provided
${opening ? `- Start with this custom opening line: "${opening}"` : ''}
${closing ? `- End with this custom closing: "${closing}"` : ''}

CANDIDATE DETAILS:
Job Title Applying For: ${jobTitle}
Target Company: ${companyName}
Job Description: ${jobDescription}
Key Highlights: ${highlights || 'Not provided — infer from resume if available and enhance with strong, plausible professional language'}

ALSO GENERATE:
1. Three (3) alternative cover letter variants (different tones/angles), each fully written with all required sections
2. Extract 6-12 important ATS keywords from the job description
3. ATS score (0-100): how well the letter matches the job description keywords
4. Relevance score (0-100): how well the candidate's profile matches the job requirements

Return ONLY a single valid JSON object. No markdown fences. No explanatory text outside the JSON.

{
  "letter": "Full cover letter with \\n\\n between paragraphs...",
  "variants": [
    "Variant 1 full text...",
    "Variant 2 full text...",
    "Variant 3 full text..."
  ],
  "keywords_used": ["keyword1", "keyword2", "keyword3"],
  "ats_score": 85,
  "relevance_score": 90
}`;

  try {
    let r;
    try {
      r = await callGeminiWithRetry(apiKey, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.75, maxOutputTokens: 4096 }
      });
    } catch (retryErr) {
      console.error('Gemini API rate limit exhausted:', retryErr.message);
      return res.status(429).json({ error: retryErr.message });
    }

    if (!r.ok) {
      const errText = await r.text();
      console.error('Gemini API HTTP error:', r.status, errText);
      return res.status(502).json({ error: `AI service error: ${r.status}. Please try again.` });
    }

    const result = await r.json();

    if (!result?.candidates?.[0]?.content?.parts?.[0]) {
      console.error('Unexpected Gemini response structure:', JSON.stringify(result));
      return res.status(502).json({ error: 'Unexpected response from AI service. Please try again.' });
    }

    const rawText = result.candidates[0].content.parts[0].text || '';
    console.log('Gemini raw response snippet:', rawText.substring(0, 200));

    const data = parseGeminiResponse(rawText);

    // ── Override AI-provided scores with server-side calculated scores ─────────
    const atsResult = calculateAtsScore(data.letter, jobDescription);
    const relResult = calculateRelevanceScore(data.letter, jobDescription, highlights);

    data.ats_score = atsResult.score;
    data.relevance_score = relResult.score;
    data.matched_keywords = atsResult.matchedKeywords;
    data.missing_keywords = atsResult.missingKeywords;
    data.score_details = {
      ats: {
        totalKeywords: atsResult.totalKeywords,
        matchCount: atsResult.matchCount
      },
      relevance: relResult.details
    };

    // Merge keywords_used: AI-provided list is a good starting point; keep it
    // but also ensure our matched_keywords are available for the UI.
    if (!data.keywords_used || data.keywords_used.length === 0) {
      data.keywords_used = atsResult.matchedKeywords.concat(atsResult.missingKeywords).slice(0, 15);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Cover letter generation error:', err);
    return res.status(500).json({ error: 'Failed to generate cover letter. Please try again.' });
  }
});

// ─── Cold Email ──────────────────────────────────────────────────────────────

app.post('/api/cold-email', async (req, res) => coldEmailHandler(req, res));

// ─── PDF Generation ──────────────────────────────────────────────────────────

app.post('/api/generate-pdf', async (req, res) => {
  const { letter, jobTitle, companyName, candidateName } = req.body || {};

  if (!letter || !letter.trim()) {
    return res.status(400).json({ error: 'No letter content provided.' });
  }

  try {
    // Only pass content fields — no scores or metrics included in the PDF
    const pdfBuffer = await generateCoverLetterPDF({
      letter,
      jobTitle: jobTitle || 'Cover Letter',
      companyName: companyName || '',
      candidateName: candidateName || ''
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
});

// Serve index for all non-API routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Global error handler ────────────────────────────────────────────────────
// Catches any unhandled errors (including async throws in Express 4 routes)
// and always returns a JSON response so clients never receive an HTML error page.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  const status = typeof err.status === 'number' ? err.status : 500;
  const message = err.message || 'An unexpected server error occurred. Please try again.';
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 CareerCraft AI server running at http://localhost:${PORT}`);
    console.log(`   Press Ctrl+C to stop\n`);
  });
}

module.exports = app;
