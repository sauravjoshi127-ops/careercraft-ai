require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const { calculateAtsScore, calculateRelevanceScore } = require('./utils/scoring');
const { generateCoverLetterPDF } = require('./utils/pdf-generator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── Multer (resume upload) ──────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PDF and DOCX files are accepted.'));
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
      return res.status(status).json({ error: message });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Please upload a PDF or DOCX file.' });
  }

  try {
    let resumeText = '';

    if (req.file.mimetype === 'application/pdf') {
      const parser = new PDFParse({ data: req.file.buffer });
      const parsed = await parser.getText();
      await parser.destroy();
      resumeText = parsed.text || '';
    } else {
      // DOCX
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      resumeText = result.value || '';
    }

    resumeText = resumeText.trim();

    if (!resumeText) {
      return res.status(422).json({ error: 'Could not extract text from the uploaded file. Please ensure the file is not scanned/image-only.' });
    }

    return res.status(200).json({ resumeText });
  } catch (err) {
    console.error('Resume parse error:', err);
    return res.status(500).json({ error: 'Failed to parse resume. Please try a different file.' });
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

  const prompt = `You are an elite professional career writer specializing in world-class cover letters. Your task is to write a polished, compelling cover letter that makes a strong first impression.

QUALITY STANDARDS:
- If the candidate's input is generic or weak, actively improve and elevate it — never write bland output
- Use specific, confident, results-oriented language
- Show genuine enthusiasm for the role and company
- Avoid clichés like "I am writing to apply" or "I believe I would be a great fit"
- Every sentence should add value

REQUIRED LETTER STRUCTURE:
1. Greeting: Professional salutation (e.g. "Dear Hiring Manager," or addressed to a specific person if inferable)
2. Introduction (1 paragraph): Powerful opening that names the specific role and company, establishes the candidate's strongest selling point immediately
3. Skills & Experience (1-2 paragraphs): 2-3 most relevant skills/achievements, quantified where possible; connect directly to job requirements
4. Company Connection (1 paragraph): Show knowledge of the company, explain why this role/company specifically excites the candidate
5. Closing (1 paragraph): Confident call to action, express readiness for an interview
6. Sign-off: "Sincerely," or "Best regards," followed by a blank line for signature
${resumeSection}${mirrorNote}
FORMATTING RULES:
- Use "\\n\\n" between each section/paragraph (double newline for spacing)
- Use "\\n" for greeting and sign-off line breaks within the same section
- Tone: ${tone || 'Professional'}
- Length: ${length || 'Medium'} (Short=4 paragraphs, Medium=5 paragraphs, Long=6 paragraphs)
- Write in first person
- Do NOT use placeholder text like [Your Name] or [Date] — write the letter body only
${opening ? `- Start with this custom opening line: "${opening}"` : ''}
${closing ? `- End with this custom closing: "${closing}"` : ''}

CANDIDATE DETAILS:
Job Title Applying For: ${jobTitle}
Target Company: ${companyName}
Job Description: ${jobDescription}
Key Highlights: ${highlights || 'Not provided — infer from resume if available and enhance with strong, plausible professional language'}

ALSO GENERATE:
1. Three (3) alternative cover letter variants (different angles/emphasis), each fully written
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

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 CareerCraft AI server running at http://localhost:${PORT}`);
  console.log(`   Press Ctrl+C to stop\n`);
});
