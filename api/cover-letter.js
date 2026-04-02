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

  if (!jobTitle || !companyName || !jobDescription) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Gemini API key not set.' });

  const prompt = `You are an expert professional career writer. Write a compelling, expressive cover letter with proper structure and well-developed paragraphs.

STRUCTURE REQUIREMENTS:
- Opening paragraph: Strong hook mentioning the specific role and company, showing genuine enthusiasm
- Body paragraph 1: Highlight 2-3 most relevant technical skills and experiences from the candidate's highlights
- Body paragraph 2: Connect the candidate's achievements to the company's specific needs from the job description
- Closing paragraph: Clear call to action, expressing eagerness for an interview

FORMATTING RULES:
- Use "\\n\\n" between each paragraph (double newline for spacing)
- Each paragraph should be 3-5 sentences
- Tone: ${tone || 'Professional'}
- Length: ${length || 'Medium'} (Short=3 paragraphs, Medium=4 paragraphs, Long=5 paragraphs)
- Write in first person
- Do NOT use placeholder text like [Your Name] — write the letter body only
${opening ? `- Start with this custom opening: "${opening}"` : ''}
${closing ? `- End with this custom closing: "${closing}"` : ''}

CANDIDATE DETAILS:
Job Title Applying For: ${jobTitle}
Target Company: ${companyName}
Job Description: ${jobDescription}
Key Highlights: ${highlights || 'Not provided'}

ALSO GENERATE:
1. Three (3) alternative cover letter variants (different tones/angles), each fully written with paragraphs
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

    // Override AI-provided scores with server-side calculated scores
    const atsResult = calculateAtsScore(data.letter, jobDescription);
    const relResult = calculateRelevanceScore(data.letter, jobDescription, highlights);

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
