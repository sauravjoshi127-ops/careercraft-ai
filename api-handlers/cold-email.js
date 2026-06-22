// POST /api/cold-email
// Handles email generation, subject regeneration, and tone optimization.
// Support action-based workflow: generate, regenerate-subjects, optimize.
// Integrates with usage_tracking table and authenticates requests.

const { authenticateRequest } = require('../utils/supabase');
const { getApiKeys, callGemini } = require('../utils/gemini');

const SPAM_WORDS = [
  'free', 'guaranteed', 'urgent', 'winner', 'cash', 'prize', 'click here',
  'act now', 'limited time', 'no obligation', 'risk-free', 'discount',
  'earn money', 'cash back', 'double your', 'satisfaction guaranteed'
];

function buildGeneratePrompt(data) {
  return `You are an elite B2B sales copywriter, outreach coach, and conversion optimizer. Generate a cold email outreach package based on the following context.

Email Goal: ${data.emailGoal}
Recipient Details:
- Name: ${data.recipientName || 'not provided'}
- Company: ${data.companyName}
- Position: ${data.position}
- LinkedIn URL: ${data.linkedinUrl || 'not provided'}
- Company Website: ${data.website || 'not provided'}

User Context:
- Name: ${data.userName}
- Background: ${data.background}
- Key Skills: ${data.keySkills || 'not provided'}
- Experience: ${data.experience || 'not provided'}
- Why Contacting: ${data.whyContacting}

Length Constraint: ${data.length}

RULES:
1. Start directly. Eliminate generic, fluffy openings like "I hope this finds you well" or "My name is...".
2. Avoid any spam words: ${SPAM_WORDS.join(', ')}.
3. Keep the Call to Action (CTA) low-friction (e.g., "Open to learning more?", "Worth a 2-min chat?", "Mind if I send over a brief video?").
4. Subject lines MUST be lowercase, short (2-4 words), and sound like an internal colleague email.
5. Formatting: Use short paragraphs and frequent line breaks to ensure it's easy to read on mobile.

OUTPUT FORMAT:
Generate EXACTLY 5 variants of the email, return them in the "variants" array matching the tones below:
- Index 0: Professional (polished business framework like PAS: Problem, Agitate, Solution)
- Index 1: Friendly (warm, approachable, peer-to-peer style like AIDA)
- Index 2: Direct (clean, ultra-short, curiosity-focused like Josh Braun style, <50 words)
- Index 3: Formal (respectful, structured, traditional business style)
- Index 4: High-Response Optimized (pattern-interrupt, value-first, low friction CTA)

Generate 5 to 10 distinct subject lines automatically. For each, assign a response probability percentage (e.g., "85%") and set recommended to true for the single best option.

Evaluate the overall quality of the emails. Return an overall score (1-100), plus lists of Strengths, Weaknesses, and Improvement Suggestions.

Include a "3-day bump" follow-up message that adds *new* value (e.g. an insight, a resource, or a question) instead of "just checking in".

Return ONLY valid JSON in this exact format (no markdown code blocks, no backticks, no other text):
{
  "variants": [
    {
      "tone": "Professional",
      "subject": "...",
      "body": "...",
      "approach": "PAS Framework"
    },
    {
      "tone": "Friendly",
      "subject": "...",
      "body": "...",
      "approach": "AIDA Framework"
    },
    {
      "tone": "Direct",
      "subject": "...",
      "body": "...",
      "approach": "Ultra-Short Curiosity"
    },
    {
      "tone": "Formal",
      "subject": "...",
      "body": "...",
      "approach": "Formal Request"
    },
    {
      "tone": "High-Response Optimized",
      "subject": "...",
      "body": "...",
      "approach": "Pattern Interrupt"
    }
  ],
  "subjectLines": [
    { "text": "subject line 1", "probability": "90%", "recommended": true },
    { "text": "subject line 2", "probability": "75%", "recommended": false }
  ],
  "evaluation": {
    "overallScore": 88,
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "suggestions": ["...", "..."]
  },
  "followUp": "follow up email body...",
  "spamWords": []
}`;
}

function buildRegenSubjectsPrompt(data) {
  return `You are a high-converting cold outreach copywriter. Review the following email body and context:

Email Body:
${data.emailBody}

Goal: ${data.emailGoal}
Recipient: ${data.recipientName || 'Hi there'} at ${data.companyName} (${data.position})

Generate 5 to 10 fresh, highly clickable subject lines.
- Keep them lowercase, short (2-4 words), and sounding like an internal email.
- Assign a response probability percentage (e.g., "85%") for each.
- Set recommended to true for the single best option.

Return ONLY valid JSON in this exact format (no markdown code blocks, no backticks, no other text):
{
  "subjectLines": [
    { "text": "subject line 1", "probability": "90%", "recommended": true },
    { "text": "subject line 2", "probability": "80%", "recommended": false }
  ]
}`;
}

function buildOptimizePrompt(data) {
  return `You are an elite cold email copywriter. Review the following email and optimize it based on the user's instructions.

Current Email Body:
${data.emailBody}

User Instructions for improvement:
"${data.feedback}"

Goal: ${data.emailGoal}
Recipient: ${data.recipientName || 'Hi there'} at ${data.companyName} (${data.position})
User Context:
- Name: ${data.userName}
- Background: ${data.background}
- Why Contacting: ${data.whyContacting}

RULES:
1. Revise the email to improve grammar, length, flow, tone, and CTA strength based on the instructions.
2. Keep it punchy and mobile-friendly.
3. Re-evaluate the optimized email, returning updated metrics (Overall Score, Strengths, Weaknesses, Suggestions).

Return ONLY valid JSON in this exact format (no markdown code blocks, no backticks, no other text):
{
  "optimizedBody": "optimized email body text...",
  "evaluation": {
    "overallScore": 92,
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "suggestions": ["...", "..."]
  }
}`;
}

function parseGeminiResponse(text, action = 'generate') {
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];
  if (text.startsWith('{') && !text.endsWith('}')) text += '}';

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(`[cold-email] [${action}] JSON parse error:`, e.message, '\nRaw response excerpt:', text.substring(0, 300));
    return {};
  }
}

function buildFallbackColdEmail(data, reason) {
  const company = data.companyName || 'your company';
  const recipientName = data.recipientName || '';
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,';
  const background = data.background || 'I work on professional execution.';
  const whyContacting = data.whyContacting || 'I would love to connect.';
  const sender = data.userName || 'I';
  const position = data.position || 'team member';

  const variants = [
    {
      "tone": "Professional",
      "subject": `quick question about ${company}`,
      "body": `${greeting}\n\nI’m ${sender}. I’ve been following ${company}’s growth, particularly your team's role in the industry.\n\nGiven my background in ${background}, I noticed an opportunity to support your efforts regarding ${whyContacting}.\n\nWould you be open to a 2-minute chat next week to see if this aligns with your priorities?\n\nBest,\n${sender}`,
      "approach": "PAS Framework"
    },
    {
      "tone": "Friendly",
      "subject": `chat about ${company}?`,
      "body": `${greeting}\n\nHope you’re having a great week! I came across your profile and was impressed by your role as ${position} at ${company}.\n\nI’m currently focusing on ${background}. I’d love to connect and share a quick idea about how to help you with ${whyContacting}.\n\nLet me know if you have a few minutes for a virtual coffee!\n\nCheers,\n${sender}`,
      "approach": "AIDA Framework"
    },
    {
      "tone": "Direct",
      "subject": "quick note",
      "body": `${greeting}\n\nI saw that you are the ${position} at ${company}.\n\nI specialize in ${background}.\n\nSpecifically, I can help you with ${whyContacting}.\n\nAre you open to learning more?\n\nThanks,\n${sender}`,
      "approach": "Ultra-Short Curiosity"
    },
    {
      "tone": "Formal",
      "subject": `Inquiry: Outreach to ${company}`,
      "body": `Dear ${recipientName || 'Hiring Manager'},\n\nMy name is ${sender}, and I am writing to introduce myself and express my interest in connecting with ${company}. I currently possess experience in ${background}.\n\nI am contacting you regarding ${whyContacting}. I would appreciate the opportunity to discuss how my skill set might be of value to your organization.\n\nThank you for your time and consideration.\n\nSincerely,\n${sender}`,
      "approach": "Formal Request"
    },
    {
      "tone": "High-Response Optimized",
      "subject": `idea for ${company}`,
      "body": `${greeting}\n\nMost teams struggle with translating interest to action. I work on ${background}.\n\nI developed a simple framework that can help ${company} with ${whyContacting}.\n\nWorth a 2-minute look?\n\nBest,\n${sender}`,
      "approach": "Pattern Interrupt"
    }
  ];

  const subjectLines = [
    { "text": `quick question about ${company}`, "probability": "88%", "recommended": true },
    { "text": `idea for ${company}`, "probability": "84%", "recommended": false },
    { "text": `chat about ${company}?`, "probability": "78%", "recommended": false },
    { "text": "quick note", "probability": "75%", "recommended": false },
    { "text": `Inquiry: Outreach to ${company}`, "probability": "65%", "recommended": false }
  ];

  return {
    variants,
    subjectLines,
    evaluation: {
      overallScore: recipientName ? 82 : 75,
      strengths: ["Clean framework structure", "Clear value hook", "Low friction call-to-action"],
      weaknesses: ["Requires slightly more personalization", "Subject line could be punchier"],
      suggestions: ["Add a specific detail about a recent project of theirs", "Mention their LinkedIn posts if relevant"]
    },
    followUp: `${recipientName ? `Hi ${recipientName},` : 'Hi there,'}\n\nJust wanted to circle back briefly. I know you're busy, but if you're open to it, I can share a short 1-minute outline of how I might help with ${whyContacting}.\n\nLet me know if that's worth a look.`,
    spamWords: [],
    fallbackUsed: true,
    fallbackReason: reason
  };
}

function buildFallbackSubjects(data, reason) {
  const company = data.companyName || 'your company';
  return {
    subjectLines: [
      { "text": `quick question about ${company}`, "probability": "88%", "recommended": true },
      { "text": `idea for ${company}`, "probability": "84%", "recommended": false },
      { "text": `chat about ${company}?`, "probability": "78%", "recommended": false },
      { "text": "quick note", "probability": "75%", "recommended": false },
      { "text": `question about ${company}`, "probability": "72%", "recommended": false }
    ],
    fallbackUsed: true,
    fallbackReason: reason
  };
}

function buildFallbackOptimize(data, reason) {
  return {
    optimizedBody: data.emailBody + '\n\n(Optimized for clarity and brevity - AI fallback applied)',
    evaluation: {
      overallScore: 85,
      strengths: ["Improved readability", "Direct call-to-action"],
      weaknesses: ["Standardized formatting"],
      suggestions: ["Try editing context fields further"]
    },
    fallbackUsed: true,
    fallbackReason: reason
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const action = String(body.action || 'generate').toLowerCase();

  // Unified mapping for backward compatibility
  const emailGoal = String(body.emailGoal || body.purpose || 'Job Inquiry').trim();

  const recipient = body.recipient || {};
  const recipientName = String(recipient.name || body.recipientName || '').trim();
  const companyName = String(recipient.company || body.company || body.companyName || '').trim();
  const position = String(recipient.position || body.recipientTitle || body.position || '').trim();
  const linkedinUrl = String(recipient.linkedinUrl || '').trim();
  const website = String(recipient.website || '').trim();

  const userContext = body.userContext || {};
  const userName = String(userContext.name || body.senderName || body.userName || '').trim();
  const background = String(userContext.background || body.background || '').trim();
  const keySkills = String(userContext.keySkills || '').trim();
  const experience = String(userContext.experience || '').trim();
  const whyContacting = String(userContext.whyContacting || body.valueProposition || '').trim();

  const length = String(body.length || 'Medium').trim();

  const dataFields = {
    emailGoal,
    recipientName,
    companyName,
    position,
    linkedinUrl,
    website,
    userName,
    background,
    keySkills,
    experience,
    whyContacting,
    length,
    emailBody: String(body.emailBody || '').trim(),
    feedback: String(body.feedback || '').trim()
  };

  // ── Validation ───────────────────────────────────────────────────────────
  if (action === 'generate') {
    if (!companyName || !position || !userName || !background || !whyContacting || !emailGoal) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
  } else if (action === 'regenerate-subjects') {
    if (!dataFields.emailBody || !companyName) {
      return res.status(400).json({ error: 'Missing required fields: emailBody and companyName.' });
    }
  } else if (action === 'optimize') {
    if (!dataFields.emailBody || !dataFields.feedback) {
      return res.status(400).json({ error: 'Missing required fields: emailBody and feedback.' });
    }
  } else {
    return res.status(400).json({ error: `Invalid action: ${action}` });
  }

  // ── Usage limiting & Authentication ───────────────────────────────────────
  let user = null;
  let isPro = false;
  let supabase = null;

  try {
    const authResult = await authenticateRequest(req);
    user = authResult.user;
    isPro = authResult.isPro;
    supabase = authResult.supabase;
  } catch (authErr) {
    console.error('[cold-email] Authentication failure:', authErr.message);
    return res.status(authErr.status || 401).json({ error: authErr.message });
  }

  // Limit usage for free users (only on generate/optimize actions)
  if (!isPro && user && supabase && (action === 'generate' || action === 'optimize')) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: usage, error: fetchErr } = await supabase
        .from('usage_tracking')
        .select('*')
        .eq('user_id', user.id)
        .eq('tool', 'cold_email')
        .maybeSingle();

      if (fetchErr) {
        console.error('[cold-email] Failed to fetch usage tracking:', fetchErr.message);
      }

      if (usage) {
        if (usage.reset_date < today) {
          await supabase
            .from('usage_tracking')
            .update({ count: 1, reset_date: today })
            .eq('user_id', user.id)
            .eq('tool', 'cold_email');
        } else if (usage.count >= 3) {
          return res.status(403).json({
            error: "You've used all 3 free emails today. Upgrade to Pro for unlimited access.",
            usageLimitReached: true
          });
        } else {
          await supabase
            .from('usage_tracking')
            .update({ count: usage.count + 1 })
            .eq('user_id', user.id)
            .eq('tool', 'cold_email');
        }
      } else {
        await supabase
          .from('usage_tracking')
          .insert({ user_id: user.id, tool: 'cold_email', count: 1, reset_date: today });
      }
    } catch (usageErr) {
      console.warn('[cold-email] Usage tracking error (non-fatal):', usageErr.message);
    }
  }

  // ── Gemini call execution ──────────────────────────────────────────────────
  const keys = getApiKeys();
  if (keys.length === 0) {
    let fallback;
    if (action === 'generate') fallback = buildFallbackColdEmail(dataFields, 'GEMINI_API_KEY is not set.');
    else if (action === 'regenerate-subjects') fallback = buildFallbackSubjects(dataFields, 'GEMINI_API_KEY is not set.');
    else fallback = buildFallbackOptimize(dataFields, 'GEMINI_API_KEY is not set.');
    return res.status(200).json(fallback);
  }

  let prompt = '';
  if (action === 'generate') prompt = buildGeneratePrompt(dataFields);
  else if (action === 'regenerate-subjects') prompt = buildRegenSubjectsPrompt(dataFields);
  else prompt = buildOptimizePrompt(dataFields);

  try {
    let r;
    try {
      r = await callGemini({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2500 }
      });
    } catch (retryErr) {
      console.error('[cold-email] Gemini call failed:', retryErr.message);
      let fallback;
      if (action === 'generate') fallback = buildFallbackColdEmail(dataFields, retryErr.message);
      else if (action === 'regenerate-subjects') fallback = buildFallbackSubjects(dataFields, retryErr.message);
      else fallback = buildFallbackOptimize(dataFields, retryErr.message);
      return res.status(200).json(fallback);
    }

    if (!r.ok) {
      const errText = await r.text();
      console.error('[cold-email] Gemini HTTP error:', r.status, errText);
      let fallback;
      if (action === 'generate') fallback = buildFallbackColdEmail(dataFields, `AI service HTTP error: ${r.status}`);
      else if (action === 'regenerate-subjects') fallback = buildFallbackSubjects(dataFields, `AI service HTTP error: ${r.status}`);
      else fallback = buildFallbackOptimize(dataFields, `AI service HTTP error: ${r.status}`);
      return res.status(200).json(fallback);
    }

    const result = await r.json();
    if (!result?.candidates?.[0]?.content?.parts?.[0]) {
      console.error('[cold-email] Unexpected Gemini response structure');
      let fallback;
      if (action === 'generate') fallback = buildFallbackColdEmail(dataFields, 'Empty candidates from AI.');
      else if (action === 'regenerate-subjects') fallback = buildFallbackSubjects(dataFields, 'Empty candidates from AI.');
      else fallback = buildFallbackOptimize(dataFields, 'Empty candidates from AI.');
      return res.status(200).json(fallback);
    }

    const rawText = result.candidates[0].content.parts[0].text || '';
    let data = parseGeminiResponse(rawText, action);

    // Normalize and validate responses based on action
    if (action === 'generate') {
      if (!Array.isArray(data.variants) || data.variants.length === 0) {
        data = buildFallbackColdEmail(dataFields, 'JSON response was malformed.');
      } else {
        const fallbackObj = buildFallbackColdEmail(dataFields, 'Filling missing variants');
        // Ensure all 5 tones exist
        const expectedTones = ["Professional", "Friendly", "Direct", "Formal", "High-Response Optimized"];
        
        // If the AI returned fewer than 5 variants, fill in the missing ones from fallback
        expectedTones.forEach((tone, idx) => {
          const found = data.variants.find(v => v.tone && v.tone.toLowerCase().includes(tone.split(' ')[0].toLowerCase()));
          if (!found) {
            data.variants.splice(idx, 0, fallbackObj.variants[idx]);
          }
        });

        // Ensure subjectLines exists and is populated
        if (!Array.isArray(data.subjectLines) || data.subjectLines.length === 0) {
          data.subjectLines = fallbackObj.subjectLines;
        }

        // Ensure evaluation fields exist
        if (!data.evaluation || typeof data.evaluation !== 'object') {
          data.evaluation = fallbackObj.evaluation;
        } else {
          data.evaluation.overallScore = data.evaluation.overallScore || 80;
          data.evaluation.strengths = Array.isArray(data.evaluation.strengths) ? data.evaluation.strengths : fallbackObj.evaluation.strengths;
          data.evaluation.weaknesses = Array.isArray(data.evaluation.weaknesses) ? data.evaluation.weaknesses : fallbackObj.evaluation.weaknesses;
          data.evaluation.suggestions = Array.isArray(data.evaluation.suggestions) ? data.evaluation.suggestions : fallbackObj.evaluation.suggestions;
        }

        // Ensure followUp and spamWords exist
        data.followUp = data.followUp || fallbackObj.followUp;
        data.spamWords = Array.isArray(data.spamWords) ? data.spamWords : [];

        // Detect spam words in all variant bodies
        const allText = data.variants.map(v => (v.subject + ' ' + v.body).toLowerCase()).join(' ');
        data.spamWords = SPAM_WORDS.filter(w => allText.includes(w.toLowerCase()));
      }
    } else if (action === 'regenerate-subjects') {
      if (!Array.isArray(data.subjectLines) || data.subjectLines.length === 0) {
        data = buildFallbackSubjects(dataFields, 'Subjects array was malformed.');
      }
    } else { // optimize
      if (!data.optimizedBody) {
        data = buildFallbackOptimize(dataFields, 'Optimized body was missing.');
      } else {
        const fallbackObj = buildFallbackOptimize(dataFields, 'Filling metrics');
        if (!data.evaluation || typeof data.evaluation !== 'object') {
          data.evaluation = fallbackObj.evaluation;
        }
      }
    }

    data.isPro = isPro;
    return res.status(200).json(data);

  } catch (err) {
    console.error('[cold-email] Generation exception:', err);
    let fallback;
    if (action === 'generate') fallback = buildFallbackColdEmail(dataFields, err.message);
    else if (action === 'regenerate-subjects') fallback = buildFallbackSubjects(dataFields, err.message);
    else fallback = buildFallbackOptimize(dataFields, err.message);
    return res.status(200).json(fallback);
  }
};
