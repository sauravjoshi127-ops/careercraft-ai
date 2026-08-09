const { authenticateRequest } = require('../utils/supabase');
const { callGemini } = require('../utils/gemini');

// User-facing error messages — never expose raw stack traces
const USER_ERRORS = {
  auth: 'Your session has expired. Please sign in again.',
  rateLimit: 'Our AI is processing many requests. Please wait a moment.',
  service: 'AI service is temporarily unavailable. Please try again.',
  default: 'We couldn\'t process this request right now. Please try again.'
};

function safeParseJSON(text) {
  // Strip code fences
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Extract JSON object
  const match = text.match(/\{[\s\S]*\}/);
  if (match) text = match[0];
  // Repair truncated JSON
  if (text.startsWith('{') && !text.endsWith('}')) text += '}';
  return JSON.parse(text);
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await authenticateRequest(req);
  } catch (authErr) {
    console.error('[cover-letter-assistant] Authentication failure:', authErr.message);
    return res.status(authErr.status || 401).json({ error: USER_ERRORS.auth });
  }

  const { mode, selectedText, letterText, action, jobTitle, companyName, jobDescription, resumeText, tone, message } = req.body || {};

  if (!mode) {
    return res.status(400).json({ error: 'Missing required field: mode' });
  }

  try {
    if (mode === 'chat') {
      const chatPrompt = `You are an expert career writing coach. The user is asking you for help with their cover letter.
      
Context: 
Target Job: ${jobTitle || 'Not specified'}
Target Company: ${companyName || 'Not specified'}
Target Tone: ${tone || 'Professional'}

Current Cover Letter:
${letterText || 'None provided'}

User's Request: ${message}

Provide a helpful, actionable, and encouraging response as a career coach. If suggesting changes, show them clearly.
NEVER display raw JSON, code, API errors, or technical information. Respond in plain, professional English only.`;

      const rr = await callGemini({
        contents: [{ parts: [{ text: chatPrompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      });
      if (!rr.ok) {
        const status = rr.status;
        if (status === 429) return res.status(429).json({ error: USER_ERRORS.rateLimit });
        return res.status(502).json({ error: USER_ERRORS.service });
      }
      const rResult = await rr.json();
      const reply = rResult?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return res.status(200).json({ reply: reply.trim() });
    }

    if (mode === 'quick_action') {
      if (!selectedText) {
        return res.status(400).json({ error: 'No text selected for rewriting.' });
      }

      // ── Deterministic, strictly-scoped action prompts ──
      const actionPrompts = {
        rewrite: 'Rewrite this text to be more professional, polished, and impactful. Improve clarity and remove filler.',
        grammar: `GRAMMAR ONLY: Fix ONLY grammar, spelling, and punctuation errors in the text below.
STRICT RULES:
- Do NOT change sentence structure, meaning, or word choice beyond grammar fixes.
- Do NOT add new content, keywords, or ideas.
- Do NOT rewrite sentences that are grammatically correct.
- If the text has no grammar errors, return it unchanged.`,
        tone: `TONE ONLY: Adjust ONLY the tone of the text to sound more ${tone || 'Professional'}.
STRICT RULES:
- Do NOT add new content, facts, achievements, or keywords.
- Do NOT change the meaning or factual content.
- Only adjust vocabulary, phrasing, and register to match the target tone.`,
        ats: `ATS KEYWORDS ONLY: Insert relevant ATS keywords from the job description into the text.
STRICT RULES:
- Do NOT change sentence structure significantly.
- Do NOT change the tone or meaning.
- Only weave in missing keywords naturally.
- Maintain the candidate's original voice and style.`,
        concise: `SHORTEN ONLY: Make this text significantly more concise without losing core meaning.
STRICT RULES:
- Remove unnecessary words, redundancies, and filler phrases.
- Do NOT add new content or change the meaning.
- Do NOT change the tone.
- Aim for at least 20% reduction in length.`,
        expand: `EXPAND ONLY: Elaborate on the existing ideas in the text to make it more detailed and impactful.
STRICT RULES:
- Add supporting details, examples, or context to strengthen existing points.
- Do NOT introduce completely new topics or skills not implied by the original text.
- Do NOT change the tone or existing factual content.
- Aim for approximately 30-50% more content.`,
        humanize: `HUMANIZE ONLY: Adjust the text to sound more natural and conversational while remaining professional.
STRICT RULES:
- Remove robotic or AI-sounding jargon and corporate buzzwords.
- Do NOT change factual content or add new information.
- Do NOT change the core message.
- Make it sound like a real, confident person wrote it.`,
        opening: `OPENING PARAGRAPH ONLY: Rewrite this opening to be more captivating and attention-grabbing.
STRICT RULES:
- Return ONLY the rewritten opening paragraph.
- It should show immediate enthusiasm and value for the role.
- Do NOT include any content from the body or closing of the letter.
- Do NOT change the factual claims about the candidate.`,
        closing: `CLOSING SECTION ONLY: Rewrite this closing section to be stronger and more confident.
STRICT RULES:
- Return ONLY the rewritten closing section (sign-off paragraph + signature line).
- Reiterate interest, propose next steps (like an interview).
- Do NOT include any content from earlier paragraphs.
- Do NOT introduce new qualifications or facts.`,
        persuasive: `PERSUASION ONLY: Rewrite to be more persuasive and compelling.
STRICT RULES:
- Use stronger action verbs and confident language.
- Do NOT add new factual claims or experiences.
- Do NOT fabricate metrics or achievements.
- Strengthen existing arguments, don't create new ones.`,
        metrics: `ADD METRICS ONLY: Add quantified achievements and metrics where appropriate.
STRICT RULES:
- Insert realistic placeholder metrics in brackets: [X]%, [$Y], [N] users, etc.
- Only add metrics where the text implies a measurable outcome.
- Do NOT change the overall structure or tone.
- Do NOT fabricate specific numbers — use placeholders.`,
        executive: `EXECUTIVE TONE: Rewrite in an executive/leadership communication style.
STRICT RULES:
- Use C-suite language emphasizing strategic impact and business outcomes.
- Do NOT add fabricated achievements or metrics.
- Do NOT change the factual content.
- Maintain professionalism while elevating the register.`,
        legal: `LEGAL PROFESSIONAL TONE: Rewrite in a legal profession communication style.
STRICT RULES:
- Use precise legal terminology where appropriate.
- Maintain formal, authoritative tone.
- Do NOT add fabricated case references or credentials.
- Do NOT change the factual content.`
      };

      const actionInstruction = actionPrompts[action] || actionPrompts.rewrite;

      const rewritePrompt = `You are a professional cover letter editor. ${actionInstruction}

Context:
Job Title: ${jobTitle || 'Not specified'}
Company: ${companyName || 'Not specified'}
Target Tone: ${tone || 'Professional'}
${letterText ? `\nRest of the Letter (For Context Only — do NOT modify this):\n${letterText}\n` : ''}
${jobDescription ? `\nJob Description:\n${jobDescription}\n` : ''}
${resumeText ? `\nCandidate Resume:\n${resumeText.substring(0, 3000)}\n` : ''}

TEXT TO MODIFY:
${selectedText}

Return your response as a valid JSON object ONLY. No markdown, no code fences, no commentary.
{
  "suggestedText": "The modified text",
  "explanation": "One sentence explaining what changed and why"${action === 'ats' ? ',\n  "atsScoreBefore": 65,\n  "atsScoreAfter": 85,\n  "keywordsAdded": ["Keyword 1", "Keyword 2"]' : ''}
}`;

      const rr = await callGemini({
        contents: [{ parts: [{ text: rewritePrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
      });
      if (!rr.ok) {
        const status = rr.status;
        if (status === 429) return res.status(429).json({ error: USER_ERRORS.rateLimit });
        return res.status(502).json({ error: USER_ERRORS.service });
      }
      const rResult = await rr.json();
      let text = rResult?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      let parsed;
      try {
        parsed = safeParseJSON(text);
      } catch (e) {
        console.error('[cover-letter-assistant] JSON parse error:', e.message, 'Raw:', text.substring(0, 300));
        // NEVER return raw AI text as suggestedText — return original with error
        parsed = {
          suggestedText: selectedText,
          explanation: 'The AI produced an unexpected format. Please try again.'
        };
      }

      // Ensure suggestedText is always a string, never undefined/null/object
      if (typeof parsed.suggestedText !== 'string' || !parsed.suggestedText.trim()) {
        parsed.suggestedText = selectedText;
        parsed.explanation = 'No changes could be made. Please try again.';
      }

      return res.status(200).json(parsed);
    }

    if (mode === 'review_paragraph') {
      if (!selectedText) {
        return res.status(400).json({ error: 'No paragraph selected for review.' });
      }

      const reviewPrompt = `You are an elite career coach. Review the following paragraph from a cover letter and provide an actionable, improved version.
      
Context:
Job Title: ${jobTitle || 'Not specified'}
Company: ${companyName || 'Not specified'}
Target Tone: ${tone || 'Professional'}
${jobDescription ? `\nJob Description:\n${jobDescription}\n` : ''}
${resumeText ? `\nCandidate Resume:\n${resumeText.substring(0, 3000)}\n` : ''}

Original Paragraph:
${selectedText}

Identify weaknesses such as weak verbs, lack of metrics, generic statements, or poor flow. Provide a rewritten paragraph that addresses these issues. 

Return your response as a valid JSON object ONLY. No markdown, no code fences, no commentary.
{
  "suggestedText": "The fully improved paragraph",
  "explanation": "A concise explanation of why this is better",
  "keywordsInserted": ["keyword1", "keyword2"]
}`;

      const rr = await callGemini({
        contents: [{ parts: [{ text: reviewPrompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 }
      });
      
      if (!rr.ok) {
        const status = rr.status;
        if (status === 429) return res.status(429).json({ error: USER_ERRORS.rateLimit });
        return res.status(502).json({ error: USER_ERRORS.service });
      }
      const rResult = await rr.json();
      let text = rResult?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      let parsed;
      try {
        parsed = safeParseJSON(text);
      } catch (e) {
        console.error('[cover-letter-assistant] JSON parse error:', e.message, 'Raw:', text.substring(0, 300));
        parsed = {
          suggestedText: selectedText,
          explanation: 'The AI produced an unexpected format. Please try again.',
          keywordsInserted: []
        };
      }

      // Ensure valid response
      if (typeof parsed.suggestedText !== 'string' || !parsed.suggestedText.trim()) {
        parsed.suggestedText = selectedText;
        parsed.explanation = 'No improvements could be identified. Please try again.';
      }
      parsed.keywordsInserted = Array.isArray(parsed.keywordsInserted) ? parsed.keywordsInserted : [];

      return res.status(200).json(parsed);
    }

    return res.status(400).json({ error: 'Invalid mode' });

  } catch (error) {
    console.error('[cover-letter-assistant] Internal error:', error.message, error.stack);
    return res.status(500).json({ error: USER_ERRORS.default });
  }
};
