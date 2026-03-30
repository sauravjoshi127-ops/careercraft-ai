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
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('JSON parse error:', e.message, '\nText snippet:', text.substring(0, 500));
    // Fallback: try to extract just the letter field (best-effort; complex escapes may not be handled)
    const letterMatch = text.match(/"letter"\s*:\s*"([\s\S]*?)"/);
    return {
      letter: letterMatch ? letterMatch[1].replace(/\\n/g, '\n') : text,
      variants: [],
      keywords_used: [],
      ats_score: null,
      relevance_score: null
    };
  }
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { jobTitle, companyName, jobDescription, highlights, tone, length, opening, closing } = req.body || {};
  if (!jobTitle || !companyName || !jobDescription) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Gemini API key not set.' });

  const prompt = `
You are a professional career writer. Generate:
1. A cover letter (tone: ${tone}, length: ${length})
2. 3 alternative variants
3. Extract 6-12 important keywords from the job description
4. Provide ATS score (0-100) and relevance score (0-100)

Return ONLY valid JSON. No markdown. No extra text.

{
 "letter": "...",
 "variants": ["...","...","..."],
 "keywords_used": ["keyword1","keyword2"],
 "ats_score": 85,
 "relevance_score": 90
}

Job Title: ${jobTitle}
Company: ${companyName}
Job Description: ${jobDescription}
Highlights: ${highlights}
Opening: ${opening}
Closing: ${closing}
`;

  try {
    let r;
    try {
      r = await callGeminiWithRetry(apiKey, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
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

    // Ensure all required fields are present and correctly typed
    data.letter = typeof data.letter === 'string' ? data.letter : '';
    data.variants = Array.isArray(data.variants) ? data.variants : [];
    data.keywords_used = Array.isArray(data.keywords_used) ? data.keywords_used : [];
    data.ats_score = typeof data.ats_score === 'number' ? data.ats_score : null;
    data.relevance_score = typeof data.relevance_score === 'number' ? data.relevance_score : null;

    return res.status(200).json(data);
  } catch (err) {
    console.error('Cover letter generation error:', err);
    return res.status(500).json({ error: 'Failed to generate cover letter. Please try again.' });
  }
}
