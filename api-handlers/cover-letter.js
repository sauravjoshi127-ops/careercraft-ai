const { calculateAtsScore, calculateRelevanceScore } = require('../utils/scoring');
const { authenticateRequest } = require('../utils/supabase');
const { callGemini } = require('../utils/gemini');

function parseGeminiResponse(text) {
  // Remove code fences if present
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Extract the JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    text = jsonMatch[0];
  }

  // If JSON is missing the closing brace, add it (best-effort recovery)
  if (text.startsWith('{') && !text.endsWith('}')) {
    console.warn('Gemini response appears truncated; appending closing brace for recovery.');
    text = text + '}';
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('JSON parse error:', e.message, '\nText snippet:', text.substring(0, 500));
    // Fallback: try to extract just the letter field
    const letterMatch = text.match(/"letter"\s*:\s*"([\s\S]*?)"/);
    data = {
      letter: letterMatch ? letterMatch[1].replace(/\\n/g, '\n') : text,
      variants: [],
      keywords_used: [],
      ats_score: null,
      relevance_score: null,
      detailed_scores: null,
      suggestions: []
    };
  }

  // Normalize types regardless of parse path
  data.letter = typeof data.letter === 'string' ? data.letter : '';
  data.variants = Array.isArray(data.variants) ? data.variants : [];
  data.keywords_used = Array.isArray(data.keywords_used) ? data.keywords_used : [];
  data.ats_score = typeof data.ats_score === 'number' ? data.ats_score : null;
  data.relevance_score = typeof data.relevance_score === 'number' ? data.relevance_score : null;

  if (!data.detailed_scores || typeof data.detailed_scores !== 'object') {
    data.detailed_scores = {
      personalization: 80,
      professionalism: 85,
      grammar: 90,
      readability: 80,
      overall: 84
    };
  } else {
    data.detailed_scores.personalization = Number(data.detailed_scores.personalization) || 80;
    data.detailed_scores.professionalism = Number(data.detailed_scores.professionalism) || 85;
    data.detailed_scores.grammar = Number(data.detailed_scores.grammar) || 90;
    data.detailed_scores.readability = Number(data.detailed_scores.readability) || 80;
    data.detailed_scores.overall = Number(data.detailed_scores.overall) || 84;
  }

  data.suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  data.suggestions = data.suggestions.map((s, idx) => ({
    id: s.id || `s-${idx + 1}`,
    category: typeof s.category === 'string' ? s.category : 'ATS',
    explanation: typeof s.explanation === 'string' ? s.explanation : 'Improvement suggestion.',
    priority: ['High', 'Medium', 'Low'].includes(s.priority) ? s.priority : 'Medium',
    originalText: typeof s.originalText === 'string' ? s.originalText : '',
    suggestedText: typeof s.suggestedText === 'string' ? s.suggestedText : ''
  }));

  return data;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await authenticateRequest(req);
  } catch (authErr) {
    console.error('[cover-letter] Authentication failure:', authErr.message);
    console.error('[cover-letter] Original Auth Exception:', authErr);
    
    // Check if it's a Supabase/Postgrest error
    const isSupabaseError = authErr.code || authErr.details || authErr.hint;
    const msg = isSupabaseError 
      ? `Supabase DB Error: [${authErr.code || 'UNKNOWN_CODE'}] ${authErr.message}. Details: ${authErr.details || 'None'}. Hint: ${authErr.hint || 'None'}`
      : authErr.message;
      
    return res.status(authErr.status || 401).json({
      success: false,
      error: msg,
      details: {
        source: 'supabase_auth',
        status: authErr.status || 401,
        message: msg,
        raw: {
          code: authErr.code,
          details: authErr.details,
          hint: authErr.hint
        }
      }
    });
  }

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

  // New Cover Letter Form Inputs
  const hiringManager = String(body.hiringManager || '').trim();
  const industry = String(body.industry || '').trim();
  const location = String(body.location || '').trim();
  const experienceLevel = String(body.experienceLevel || 'Mid').trim();
  const keySkills = String(body.keySkills || '').trim();
  const achievements = String(body.achievements || '').trim();
  const additionalInstructions = String(body.additionalInstructions || '').trim();

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
- Tailor the language and style based on the candidate's Experience Level: ${experienceLevel}

REQUIRED LETTER STRUCTURE (follow this exactly, in order):
1. DATE: Write today's date on its own line (e.g. "${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}")
2. GREETING: Formal salutation — use "Dear ${hiringManager || 'Hiring Manager'}," and end with a comma.
3. OPENING PARAGRAPH: Introduce yourself, name the exact role you are applying for, name the company, and express genuine enthusiasm for the opportunity. Make a strong first impression — do NOT open with "I am writing to apply…"
4. SKILLS & EXPERIENCE PARAGRAPH: Highlight 2–3 of the most relevant technical skills, accomplishments, or experiences that directly match the job requirements. Quantify achievements where possible (e.g. "reduced load time by 40%"). Connect your background to the role's core needs.
5. COMPANY FIT PARAGRAPH: Explain why this specific company excites you — its mission, culture, product, or values. Show that you have researched the company and that your work style, values, and approach make you a natural fit for their team.
6. CLOSING PARAGRAPH: Thank the reader for their time, express eagerness for an interview to discuss your qualifications further, and provide a clear call to action.
7. PROFESSIONAL SIGN-OFF: Use "Sincerely," or "Best regards," on its own line, followed by a blank line, then the candidate's name (if provided, otherwise leave a blank signature line).

${resumeSection}${mirrorNote}${optimizerSection}

FORM CONTEXT & METADATA:
- Hiring Manager: ${hiringManager || 'Not specified'}
- Target Industry: ${industry || 'Not specified'}
- Target Location: ${location || 'Not specified'}
- Key Skills to emphasize: ${keySkills || 'Not specified'}
- Measurable Achievements to highlight: ${achievements || 'Not specified'}
${additionalInstructions ? `- Additional Instructions: ${additionalInstructions}` : ''}

FORMATTING RULES:
- Use "\\n\\n" between each section/paragraph (double newline for spacing)
- Use "\\n" for line breaks within the greeting and sign-off
- Tone: ${tone || 'Professional'} (Formal, Professional, Friendly, Executive, Startup, Creative, Corporate, Government, Legal, Technical, Healthcare, Academic)
- Length: ${length || 'Medium'} (Short=4 paragraphs, Medium=5 paragraphs, Long=6 paragraphs)
- Write in first person
- Do NOT include placeholder text like [Your Name], [Date], [Address] — write real content only
- Do NOT include contact info blocks or address headers unless specifically provided
${opening ? `- Start with this custom opening line: "${opening}"` : ''}
${closing ? `- End with this custom closing: "${closing}"` : ''}

CANDIDATE DETAILS:
- Job Title Applying For: ${jobTitle}
- Target Company: ${companyName}
- Job Description: ${jobDescription}
- Key Highlights: ${highlights || 'Not provided — infer from resume if available and enhance with strong, plausible professional language'}

ALSO GENERATE:
1. Three (3) alternative cover letter variants (different tones/angles), each fully written with all required sections:
   - Variant 1: Bold & Impactful (highly confident, achievement-focused, startup/creative style)
   - Variant 2: Analytical & Technical (extremely details-oriented, focus on data, hard skills, corporate/technical style)
   - Variant 3: Narrative & Story-driven (focuses on personal career journey, mission-driven, connection to company)
2. Extract 6-12 important ATS keywords from the job description
3. Detailed quality scores (0-100) reflecting:
   - personalization: how tailored it is to this company and resume
   - professionalism: tone alignment, layout format correctness
   - grammar: grammatical correctness and spelling
   - readability: clarity and readability of the sentences
   - overall: the weighted summary score of the quality
4. Concrete suggestions (3 to 5 items) for improvement. Each suggestion MUST contain:
   - id: unique string (e.g. "s1", "s2")
   - category: one of: "ATS", "Grammar", "Sentence Refinement", "Impact", "Tone"
   - explanation: a detailed sentence explaining the rationale for the change
   - priority: one of: "High", "Medium", "Low"
   - originalText: exact substring from the generated main "letter" that needs optimization
   - suggestedText: the improved replacement text for that substring. The originalText and suggestedText must be matched so they can be replaced inline.

Return ONLY a single valid JSON object. No markdown fences. No explanatory text outside the JSON.

{
  "letter": "Full cover letter with \\n\\n between paragraphs...",
  "variants": [
    "Variant 1 full text...",
    "Variant 2 full text...",
    "Variant 3 full text..."
  ],
  "keywords_used": ["keyword1", "keyword2", ...],
  "ats_score": 85,
  "relevance_score": 90,
  "detailed_scores": {
    "personalization": 88,
    "professionalism": 92,
    "grammar": 95,
    "readability": 85,
    "overall": 90
  },
  "suggestions": [
    {
      "id": "s1",
      "category": "ATS",
      "explanation": "Inject the keyword 'Kubernetes' into the container paragraph for automated scanner detection.",
      "priority": "High",
      "originalText": "managed Docker deployments",
      "suggestedText": "orchestrated container deployments with Kubernetes and Docker"
    }
  ]
}`;

  try {
    let r;
    const geminiRequestPayload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.75, maxOutputTokens: 4096 }
    };

    console.log('=== [cover-letter] Gemini Request Start ===');
    console.log('Payload:', JSON.stringify(geminiRequestPayload, null, 2));
    console.log('=== [cover-letter] Gemini Request End ===');

    try {
      r = await callGemini(geminiRequestPayload);
    } catch (retryErr) {
      console.error('=== [cover-letter] Gemini API Exception Start ===');
      console.error('Original Exception:', retryErr);
      console.error('Stack Trace:', retryErr.stack);
      console.error('=== [cover-letter] Gemini API Exception End ===');
      
      const status = retryErr.status || 500;
      const msg = retryErr.message;
      return res.status(status).json({
        success: false,
        error: msg === 'GEMINI_API_KEY missing' || msg.includes('Gemini API key is not configured')
          ? 'Gemini API key is not configured on this server. Set GEMINI_API_KEY in your environment.'
          : `Gemini API execution failed: ${msg}`,
        details: {
          source: 'gemini_exception',
          status,
          message: msg,
          stack: retryErr.stack
        }
      });
    }

    if (!r.ok) {
      const errText = await r.text();
      // Full error details logged server-side for debugging only
      console.error('[cover-letter] Generation API error:', r.status, r.statusText, errText.substring(0, 500));

      const responseStatus = r.status || 502;
      // Map status codes to user-facing messages
      const statusMessages = {
        429: 'Generation is temporarily busy. Please wait a moment and try again.',
        503: 'Generation is temporarily unavailable. Please retry in a moment.',
        502: 'Generation is temporarily unavailable. Please retry in a moment.',
        401: 'Authentication required. Please refresh and try again.',
        403: 'Access denied. Please check your account and try again.'
      };
      const userMsg = statusMessages[responseStatus] || 'We couldn\'t generate your cover letter right now. Please try again.';

      return res.status(responseStatus).json({
        success: false,
        error: userMsg
      });
    }

    const result = await r.json();
    console.log('[cover-letter] Generation API response received. Status:', r.status);

    if (!result?.candidates?.[0]?.content?.parts?.[0]) {
      console.error('[cover-letter] Unexpected generation response structure:', JSON.stringify(result).substring(0, 300));
      return res.status(502).json({ error: 'Unexpected response from AI service. Please try again.' });
    }

    const rawText = result.candidates[0].content.parts[0].text || '';
    console.log('[cover-letter] Content generated successfully. Length:', rawText.length);

    const data = parseGeminiResponse(rawText);

    // Override AI-provided scores with server-side calculated scores
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
    // Always log the full error internally for debugging
    console.error('[cover-letter] Handler exception (internal):', err.message);
    console.error('[cover-letter] Stack trace:', err.stack);
    if (err.code) console.error('[cover-letter] DB error code:', err.code, '| Details:', err.details, '| Hint:', err.hint);

    const status = err.status || 500;

    // Map to user-facing messages — never expose provider names or stack traces
    let userMsg = 'We couldn\'t generate your cover letter right now. Please try again in a moment.';
    if (err.message === 'GEMINI_API_KEY missing' || (err.message || '').toLowerCase().includes('api key')) {
      userMsg = 'Content generation is not configured on this server.';
    } else if (status === 429) {
      userMsg = 'Generation is temporarily busy. Please wait a moment and try again.';
    } else if (status === 503) {
      userMsg = 'Generation is temporarily unavailable. Please retry in a moment.';
    }

    return res.status(status).json({
      success: false,
      error: userMsg
    });
  }
};
