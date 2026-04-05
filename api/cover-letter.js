const { calculateAtsScore, calculateRelevanceScore } = require('../utils/scoring');

function parseGeminiResponse(text) {
  // Remove code fences if present
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Extract the JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    text = jsonMatch[0];
  }

  // If JSON is missing the closing brace, add it (best-effort recovery; may yield partial data)
  if (text.startsWith('{') && !text.endsWith('}')) {
    console.warn('Gemini response appears truncated; appending closing brace for recovery.');
    text = text + '}';
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('JSON parse error:', e.message, '\nText snippet:', text.substring(0, 500));
    // Fallback: try to extract just the letter field (best-effort; complex escapes may not be handled)
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

// Collect all configured Gemini API keys from environment variables.
// Supports:
//   GEMINI_API_KEYS=key1,key2,key3  (comma-separated list)
//   GEMINI_API_KEY_1, GEMINI_API_KEY_2, ... GEMINI_API_KEY_N  (indexed vars)
//   GEMINI_API_KEY  (single key, backward-compatible)
const MAX_INDEXED_KEYS = 10;

function getApiKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEYS) {
    keys.push(...process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean));
  }
  for (let i = 1; i <= MAX_INDEXED_KEYS; i++) {
    const key = process.env[`GEMINI_API_KEY_${i}`];
    if (key && key.trim()) keys.push(key.trim());
  }
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    const single = process.env.GEMINI_API_KEY.trim();
    if (!keys.includes(single)) keys.push(single);
  }
  return keys;
}

async function callGeminiWithRetry(apiKey, body, maxRetries = 2) {
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
    console.warn(`Gemini API rate limited (429). Waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}.`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  // Final attempt (no retry after this)
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

// Try each API key in sequence; rotate to the next key when one is rate-limited (429).
async function callGeminiWithKeyFallback(apiKeys, body) {
  let lastError = null;
  for (let i = 0; i < apiKeys.length; i++) {
    try {
      const r = await callGeminiWithRetry(apiKeys[i], body);
      return r;
    } catch (err) {
      if (err.status === 429) {
        console.warn(`API key ${i + 1} rate limited, rotating to next key...`);
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  const err = new Error('All API keys are rate limited. Please wait a few minutes for your quota to reset, then try again.');
  err.status = 429;
  throw err;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

  // Score Optimizer inputs
  const mustHaveSkills = String(body.mustHaveSkills || '').trim();
  const keyAchievements = String(body.keyAchievements || '').trim();
  const workHistoryAlignment = String(body.workHistoryAlignment || '').trim();
  const softSkills = String(body.softSkills || '').trim();
  const companyResearch = String(body.companyResearch || '').trim();
  const volunteerProjects = String(body.volunteerProjects || '').trim();
  const extraKeywords = String(body.extraKeywords || '').trim();

  if (!jobTitle || !companyName || !jobDescription) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const apiKeys = getApiKeys();
  if (!apiKeys.length) return res.status(500).json({ error: 'No Gemini API key configured. Set GEMINI_API_KEY in your environment.' });

  const resumeSection = resumeText
    ? `\nCANDIDATE RESUME (use for context, skills and achievements):\n${resumeText.slice(0, 3000)}\n`
    : '';

  const mirrorNote = mirrorStructure && resumeText
    ? `\nSTRUCTURE NOTE: The candidate has requested their cover letter mirror the structure and style of their resume. Analyze the resume sections, order, and phrasing style, then shape the cover letter layout to reflect that structure and voice.\n`
    : '';

  // Build score optimizer section from user answers
  const optimizerLines = [];
  if (mustHaveSkills) optimizerLines.push(`MUST-HAVE SKILLS/REQUIREMENTS (from job posting — incorporate these exact terms for ATS): ${mustHaveSkills}`);
  if (keyAchievements) optimizerLines.push(`MEASURABLE ACHIEVEMENTS (use these quantified results in the letter): ${keyAchievements}`);
  if (workHistoryAlignment) optimizerLines.push(`WORK HISTORY ALIGNMENT (past roles/projects that match this job — emphasize these): ${workHistoryAlignment}`);
  if (softSkills) optimizerLines.push(`SOFT SKILLS / PERSONALITY TRAITS (weave these naturally into the letter for culture fit): ${softSkills}`);
  if (companyResearch) optimizerLines.push(`COMPANY ENTHUSIASM (why this company specifically — include this genuine detail in the company-fit paragraph): ${companyResearch}`);
  if (volunteerProjects) optimizerLines.push(`VOLUNTEER WORK / SIDE PROJECTS (mention to demonstrate passion and initiative): ${volunteerProjects}`);
  if (extraKeywords) optimizerLines.push(`EXTRA KEYWORDS / TECHNOLOGIES TO INCLUDE (ensure every one of these appears in the letter): ${extraKeywords}`);
  const optimizerSection = optimizerLines.length > 0
    ? `\nSCORE OPTIMIZER — CRITICAL INPUTS (use ALL of the following to maximize ATS and Relevance scores):\n${optimizerLines.join('\n')}\n`
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
${resumeSection}${mirrorNote}${optimizerSection}
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
4. Relevance score (0-100): how well the candidate's highlights match the job requirements

Return ONLY a single valid JSON object. No markdown fences. No explanatory text outside the JSON.

{
  "letter": "Full cover letter with \\n\\n between paragraphs...",
  "variants": [
    "Variant 1 full text with \\n\\n between paragraphs...",
    "Variant 2 full text with \\n\\n between paragraphs...",
    "Variant 3 full text with \\n\\n between paragraphs..."
  ],
  "keywords_used": ["keyword1", "keyword2", "keyword3"],
  "ats_score": 85,
  "relevance_score": 90
}`;

  try {
    let r;
    try {
      r = await callGeminiWithKeyFallback(apiKeys, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.75, maxOutputTokens: 4096 }
      });
    } catch (retryErr) {
      console.error('Gemini API rate limit exhausted across all keys:', retryErr.message);
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

    // Override AI-provided scores with server-side calculated scores
    // Combine highlights with optimizer answers for a richer relevance calculation
    const combinedHighlights = [highlights, mustHaveSkills, keyAchievements, workHistoryAlignment, softSkills]
      .filter(Boolean).join(' ');
    const atsResult = calculateAtsScore(data.letter, jobDescription);
    const relResult = calculateRelevanceScore(data.letter, jobDescription, combinedHighlights || highlights);

    data.ats_score = atsResult.score;
    data.relevance_score = relResult.score;
    data.matched_keywords = atsResult.matchedKeywords;
    data.missing_keywords = atsResult.missingKeywords;
    data.score_details = {
      ats: { totalKeywords: atsResult.totalKeywords, matchCount: atsResult.matchCount },
      relevance: relResult.details
    };

    if (!data.keywords_used || data.keywords_used.length === 0) {
      data.keywords_used = atsResult.matchedKeywords.concat(atsResult.missingKeywords).slice(0, 15);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Cover letter generation error:', err);
    return res.status(500).json({ error: 'Failed to generate cover letter. Please try again.' });
  }
}
