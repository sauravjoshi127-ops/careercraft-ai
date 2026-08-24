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

/**
 * Cleans the input context of any contact details, raw links, and resume headings
 * to prevent resume leakage into generated email copy.
 */
function cleanResumeInputs(text) {
  if (!text) return '';
  
  let cleaned = text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '') // emails
    .replace(/\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, '') // phone numbers
    .replace(/github\.com\/[a-zA-Z0-9_-]+/gi, '') // github profiles
    .replace(/linkedin\.com\/in\/[a-zA-Z0-9_-]+/gi, '') // linkedin profiles
    .replace(/\b(phone|email|address|contact|portfolio|github|linkedin)\b\s*:?/gi, ''); // labels
    
  // Remove potential resume section headers
  const headers = [
    'education', 'experience', 'work experience', 'skills', 'key skills',
    'summary', 'professional summary', 'objective', 'projects', 'languages',
    'certifications', 'hobbies', 'interests', 'references'
  ];
  headers.forEach(h => {
    const regex = new RegExp(`(^|\\n)\\s*(\\*\\*|__)?${h}(\\*\\*|__)?\\s*($|\\n|:)`, 'gi');
    cleaned = cleaned.replace(regex, '$1');
  });
  
  return cleaned.trim();
}

/**
 * Checks if the generated email output satisfies all production quality rules.
 */
function validateColdEmailOutput(data, minLength, maxLength) {
  if (!data || !Array.isArray(data.variants) || data.variants.length < 3) {
    console.warn('[cold-email validation] Failed: Missing or insufficient variants (expected at least 3).');
    return { isValid: false, reason: 'Missing or insufficient variants (expected at least 3)' };
  }
  
  const placeholderRegex = /\[[A-Za-z0-9\s_-]+\]|<[A-Za-z0-9\s_-]+>|{your\s|your_placeholder/i;
  const resumeHeaderRegex = /(education|skills|work experience|summary|languages|references|certifications)\s*:/i;
  const debugRegex = /internal prompt|system prompt|gemini|llm|ai fallback/i;
  
  for (let i = 0; i < data.variants.length; i++) {
    const variant = data.variants[i];
    if (!variant.subject || !variant.body || !variant.tone) {
      console.warn('[cold-email validation] Failed: Empty variant fields.');
      return { isValid: false, reason: 'Empty variant fields' };
    }
    
    // Check word count
    const words = variant.body.trim().split(/\s+/).filter(Boolean).length;
    if (words < minLength || words > maxLength) {
      console.warn(`[cold-email validation] Failed: Variant ${variant.tone} has ${words} words, which is outside the range [${minLength}, ${maxLength}].`);
      return {
        isValid: false,
        reason: `Variant ${variant.tone} has ${words} words, which is outside the required range of ${minLength}-${maxLength} words.`
      };
    }
    
    // Check for resume leakage / headings
    if (resumeHeaderRegex.test(variant.body) || resumeHeaderRegex.test(variant.subject)) {
      console.warn('[cold-email validation] Failed: Resume section headers found in variant', variant.tone);
      return { isValid: false, reason: `Resume section headers found in variant ${variant.tone}` };
    }
    
    // Check for placeholders
    if (placeholderRegex.test(variant.body) || placeholderRegex.test(variant.subject)) {
      console.warn('[cold-email validation] Failed: Placeholders found in variant', variant.tone);
      return { isValid: false, reason: `Placeholder tags found in variant ${variant.tone}` };
    }
    
    // Check for incomplete sentences (ends with dot, question mark, or exclamation, not space/comma/ellipsis)
    const cleanedBody = variant.body.trim();
    if (!cleanedBody.endsWith('.') && !cleanedBody.endsWith('?') && !cleanedBody.endsWith('!') && !cleanedBody.endsWith('"') && !cleanedBody.endsWith("'")) {
      console.warn('[cold-email validation] Failed: Variant body does not end with complete sentence punctuation.');
      return { isValid: false, reason: `Variant ${variant.tone} body does not end with a complete sentence punctuation.` };
    }
    
    // Check for debug/internal prompt text
    if (debugRegex.test(variant.body) || debugRegex.test(variant.subject)) {
      console.warn('[cold-email validation] Failed: Internal debug/prompt leakage found.');
      return { isValid: false, reason: 'Internal debug/prompt leakage found' };
    }
    
    // Check for duplicate paragraphs
    const paragraphs = variant.body.split(/\n+/).map(p => p.trim()).filter(Boolean);
    const uniqueParagraphs = new Set(paragraphs);
    if (paragraphs.length !== uniqueParagraphs.size) {
      console.warn('[cold-email validation] Failed: Duplicate paragraphs found.');
      return { isValid: false, reason: 'Duplicate paragraphs found in variant body' };
    }
    
    // Check for markdown or HTML fences/tags in email bodies
    if (variant.body.includes('```') || variant.body.includes('<html>') || variant.body.includes('<div>')) {
      console.warn('[cold-email validation] Failed: Markdown/HTML code blocks found in variant body.');
      return { isValid: false, reason: 'Markdown/HTML code blocks found in variant body' };
    }
  }
  
  return { isValid: true };
}

function validateOptimizeOutput(data, minLength, maxLength) {
  if (!data || !data.revisedText) {
    console.warn('[cold-email validation] Failed: Missing revisedText field.');
    return { isValid: false, reason: 'Missing revisedText field' };
  }
  
  const words = data.revisedText.trim().split(/\s+/).filter(Boolean).length;
  if (words < minLength || words > maxLength) {
    console.warn(`[cold-email validation] Failed: Optimized body has ${words} words, which is outside the range [${minLength}, ${maxLength}].`);
    return {
      isValid: false,
      reason: `Optimized body has ${words} words, which is outside the required range of ${minLength}-${maxLength} words.`
    };
  }
  
  const placeholderRegex = /\[[A-Za-z0-9\s_-]+\]|<[A-Za-z0-9\s_-]+>|{your\s|your_placeholder/i;
  if (placeholderRegex.test(data.revisedText)) {
    console.warn('[cold-email validation] Failed: Placeholders found in optimized body.');
    return { isValid: false, reason: 'Placeholder tags found in optimized body' };
  }
  
  if (data.revisedText.includes('```') || data.revisedText.includes('<html>')) {
    console.warn('[cold-email validation] Failed: Markdown/HTML code blocks found in optimized body.');
    return { isValid: false, reason: 'Markdown/HTML code blocks found in optimized body' };
  }
  
  return { isValid: true };
}

function buildGeneratePrompt(data) {
  const cleanBg = cleanResumeInputs(data.background);
  const cleanSkills = cleanResumeInputs(data.keySkills);
  const cleanExp = cleanResumeInputs(data.experience);
  const cleanWhy = cleanResumeInputs(data.whyContacting);

  const greeting = data.recipientName ? `Hi ${data.recipientName},` : 'Hi there,';

  return `You are an elite B2B cold outreach copywriter and career coach. Generate a highly personalized cold email outreach package based on the following context.

Email Goal: ${data.emailGoal}

RECIPIENT DETAILS:
- Name: ${data.recipientName || 'not provided (use a professional greeting like "Hi there,")'}
- Company: ${data.companyName}
- Position: ${data.position}

SENDER CONTEXT (use strictly to weave a natural value proposition — NEVER paste raw resume text):
- Name: ${data.userName}
- Background / Value Proposition: ${cleanBg}
- Key Skills: ${cleanSkills || 'not provided'}
- Relevant Experience: ${cleanExp || 'not provided'}
- Reason for Reaching Out: ${cleanWhy || 'not provided'}

LENGTH REQUIREMENT (CRITICAL — ALL 6 VARIANTS MUST COMPLY):
Each email body must contain between ${data.minLength} and ${data.maxLength} words.
${data.lengthType === 'Short' ? `
- SHORT email: 80–100 words. One punchy paragraph. Single CTA. Zero filler.
` : data.lengthType === 'Standard' || data.lengthType === 'Medium' ? `
- STANDARD email: 120–170 words. Brief intro, one key value point, one achievement, one CTA.
` : data.lengthType === 'Detailed' || data.lengthType === 'Long' ? `
- DETAILED email: 180–250 words. Rich context, two achievements, strong narrative arc, clear motivation.
` : `
- CUSTOM length: ${data.minLength}–${data.maxLength} words. Fit narrative depth to this range without filler.
`}

QUALITY RULES:
1. NEVER include raw resume section headers (Education, Skills, Work Experience, Certifications, Languages, References).
2. NEVER include contact details (email addresses, phone numbers, URLs) in email bodies.
3. NEVER use clichés: "I hope this finds you well", "My name is X", "I am writing to you because", "seasoned professional".
4. NEVER use placeholder tags like [Recipient Name] or [Your Name] — use the actual provided names.
5. CTAs must be low-friction: "Open to a quick chat?", "Worth 10 minutes?", "Happy to share more if useful."
6. Each variant must have a genuinely different tone, opening strategy, and structure — not just slightly reworded.
7. Subject lines must be specific to the context — never generic like "Following up" or "Quick question".

OUTPUT SCHEMA — Return ONLY valid JSON, no backticks, no markdown, no extra text:

{
  "variants": [
    {
      "tone": "Professional",
      "subject": "[concise specific subject]",
      "body": "${greeting}\\n\\n[professional email body]",
      "approach": "PAS framework. Addresses a pain point, agitates it, offers solution."
    },
    {
      "tone": "Friendly",
      "subject": "[conversational specific subject]",
      "body": "${greeting}\\n\\n[warm peer-to-peer email body]",
      "approach": "AIDA framework. Attention-grabbing opener, builds interest, creates desire, soft CTA."
    },
    {
      "tone": "Executive",
      "subject": "[direct strategic subject]",
      "body": "${greeting}\\n\\n[high-level business-focused email body]",
      "approach": "Direct value proposition for decision-makers. No fluff, ROI-focused."
    },
    {
      "tone": "Startup",
      "subject": "[energetic growth-focused subject]",
      "body": "${greeting}\\n\\n[fast-paced startup-friendly email body]",
      "approach": "Pattern interrupt opening. Growth and innovation language. High energy."
    },
    {
      "tone": "Technical",
      "subject": "[specific technical subject]",
      "body": "${greeting}\\n\\n[peer-level technical email body]",
      "approach": "Engineering peer perspective. Specific tech detail. No sales language."
    },
    {
      "tone": "Networking",
      "subject": "[relationship-building subject]",
      "body": "${greeting}\\n\\n[warm low-pressure relationship email body]",
      "approach": "Genuine curiosity and admiration. Advice-seeking. No hard ask."
    }
  ],
  "subjectLines": [
    { "text": "[specific subject — strategy A]", "label": "Direct", "openRate": "72%" },
    { "text": "[specific subject — strategy B]", "label": "Curiosity", "openRate": "84%" },
    { "text": "[specific subject — strategy C]", "label": "Value", "openRate": "78%" },
    { "text": "[specific subject — strategy D]", "label": "Personal", "openRate": "75%" }
  ],
  "evaluation": {
    "overallScore": 88,
    "strengths": ["Concrete value proposition backed by specific experience", "Low-friction CTA appropriate for cold outreach"],
    "weaknesses": ["Could reference a specific recent company achievement for deeper personalization"],
    "suggestions": ["Add a specific data point (e.g. % improvement, revenue impact) to the value prop"]
  },
  "followUps": [
    {
      "index": 1,
      "timing": "3–5 business days after initial email",
      "subject": "[follow-up subject referencing original context]",
      "body": "${greeting}\\n\\n[A strategically different follow-up — adds new value or a different angle. NOT just 'circling back'. 60–80 words max.]\\n\\nBest,\\n${data.userName}"
    },
    {
      "index": 2,
      "timing": "7–10 business days after follow-up 1",
      "subject": "[final follow-up subject — graceful close]",
      "body": "${greeting}\\n\\n[Respectful final message — acknowledges they may not be interested, leaves door open, no pressure. 50–70 words max.]\\n\\nBest,\\n${data.userName}"
    }
  ],
  "spamScore": 10,
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

Return ONLY a valid JSON object matching the schema below:
{
  "subjectLines": [
    { "text": "[subject text]", "label": "Conservative", "openRate": "70%" },
    { "text": "[subject text]", "label": "Curiosity", "openRate": "85%" },
    { "text": "[subject text]", "label": "Executive", "openRate": "78%" },
    { "text": "[subject text]", "label": "Friendly", "openRate": "72%" },
    { "text": "[subject text]", "label": "High Open Rate", "openRate": "90%" }
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

Recipient Context:
- Name: ${data.recipientName || 'Hi there'}
- Company: ${data.companyName}
- Position: ${data.position}

User Context:
- Name: ${data.userName}
- Background: ${data.background}
- Why Contacting: ${data.whyContacting}

RULES:
1. Revise the email to address the user instructions. ONLY modify the parts of the email requested by the user instruction. Do NOT rewrite the entire email unless specifically requested. Preserve the original meaning and structure for unrequested parts.
2. The revised email body must strictly contain between ${data.minLength} and ${data.maxLength} words. Never exceed or fall below this range.
3. Keep it punchy and mobile-friendly.
4. DO NOT invent factual information that is not present in the User Context.
5. Prevent Self-Injection/Duplication: Ensure the user's name or background is not duplicated redundantly (e.g., "My name is X. My name is X").

Return ONLY valid JSON in this exact format (no markdown code blocks, no backticks, no other text):
{
  "revisedText": "The fully revised email body...",
  "reason": "Brief explanation of what was changed and why."
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
  const bg = data.background || 'I specialize in technology solutions.';
  const skills = data.keySkills || 'software engineering';
  const exp = data.experience || 'driving technical excellence';
  const why = data.whyContacting || 'how I can support your team';
  const sender = data.userName || 'Alex';
  const position = data.position || 'your team';
  
  const variants = [
    {
      "tone": "Professional",
      "subject": `quick question regarding ${company}`,
      "body": `${greeting}\n\nI’m reaching out because I saw your work with the engineering team at ${company}.\n\nMy name is ${sender}. I have a background in ${bg}, and specialize in ${skills}.\n\nI’ve spent the past few years focusing on ${exp}, and wanted to connect to discuss ${why}.\n\nWould you be open to a brief 2-minute chat next week to see if my background aligns with your team's priorities?\n\nBest,\n${sender}`,
      "approach": "PAS Framework. Professional value proposition."
    },
    {
      "tone": "Friendly",
      "subject": `chat about ${company}?`,
      "body": `${greeting}\n\nHope you're having a great week!\n\nI came across your profile and was really impressed by what you're building at ${company}.\n\nMy name is ${sender}, and I specialize in ${skills}. I've recently been working on ${exp}.\n\nI'd love to connect and share a quick idea about how I can help you with ${why}.\n\nLet me know if you have a few minutes for a quick virtual coffee next week!\n\nCheers,\n${sender}`,
      "approach": "AIDA Framework. Peer-to-peer and approachable."
    },
    {
      "tone": "Executive",
      "subject": `optimizing ${company}'s scale`,
      "body": `${greeting}\n\nI know you're busy, so I'll keep this brief.\n\nI specialize in ${skills} with a focus on ${bg}. Over the last few years, I've helped drive results in ${exp}.\n\nI'm reaching out to see if you have any current challenges regarding ${why} at ${company}, and if a brief discussion makes sense.\n\nWorth a 2-minute look?\n\nBest,\n${sender}`,
      "approach": "High-level strategic focus. Direct value-driven proposition."
    },
    {
      "tone": "Startup",
      "subject": `building at ${company}`,
      "body": `${greeting}\n\nCongrats on the recent team growth at ${company}!\n\nI'm ${sender}, and I focus on ${skills}. I love building fast and helping teams tackle challenges like ${why}.\n\nI recently completed projects in ${exp}, and would love to bring similar value to your team.\n\nDo you have 5 minutes for a quick intro next Tuesday?\n\nBest,\n${sender}`,
      "approach": "Startup-friendly, energetic, growth-focused language."
    },
    {
      "tone": "Technical",
      "subject": `engineering question re: ${skills}`,
      "body": `${greeting}\n\nI'm ${sender}, a developer specializing in ${skills}.\n\nI'm highly interested in ${company}'s tech stack, specifically your approach to ${why}.\n\nGiven my experience in ${exp}, I'd love to ask a quick technical question or share insights from my recent projects.\n\nAre you open to a brief chat next week?\n\nCheers,\n${sender}`,
      "approach": "Deep technical and engineering peer-level focus."
    },
    {
      "tone": "Networking",
      "subject": `connecting with ${company}'s team`,
      "body": `${greeting}\n\nI came across your profile and wanted to reach out to connect.\n\nI'm ${sender}, and I'm currently expanding my network in the ${skills} space. I really admire ${company}'s work in ${why}.\n\nIf you're open to it, I'd love to connect, ask a couple of quick questions about your career journey, and keep in touch.\n\nWarmly,\n${sender}`,
      "approach": "Relationship building, low-pressure connection request."
    }
  ];

  const subjectLines = [
    { "text": `quick question regarding ${company}`, "label": "Conservative", "openRate": "72%" },
    { "text": "quick note", "label": "Curiosity", "openRate": "84%" },
    { "text": `optimizing ${company}'s scale`, "label": "Executive", "openRate": "78%" },
    { "text": `chat about ${company}?`, "label": "Friendly", "openRate": "75%" },
    { "text": `idea for ${company}`, "label": "High Open Rate", "openRate": "92%" }
  ];

  return {
    variants,
    subjectLines,
    evaluation: {
      overallScore: 82,
      strengths: ["Clear, low-friction call to action", "Concise value proposition", "No spam trigger words"],
      weaknesses: ["Generated from template — add specific company research for higher impact"],
      suggestions: ["Reference a specific recent achievement or product launch at " + company]
    },
    followUps: [
      {
        index: 1,
        timing: '3–5 business days after initial email',
        subject: `re: ${company} — a thought`,
        body: `${greeting}\n\nI wanted to share one more thought since I reached out last week.\n\nGiven your focus on ${why}, I recently worked on something similar and saw strong results. Happy to share a quick outline if that's useful.\n\nOpen to a brief call?\n\nBest,\n${sender}`
      },
      {
        index: 2,
        timing: '7–10 business days after follow-up 1',
        subject: `closing the loop — ${company}`,
        body: `${greeting}\n\nI'll leave it here so I'm not filling your inbox. If the timing is ever right to connect around ${why} at ${company}, I'd genuinely welcome that conversation.\n\nAll the best with what you're building.\n\nWarmly,\n${sender}`
      }
    ],
    spamScore: 10,
    spamWords: [],
    fallbackUsed: true,
    fallbackReason: reason
  };
}

function buildFallbackSubjects(data, reason) {
  const company = data.companyName || 'your company';
  return {
    subjectLines: [
      { "text": `quick question regarding ${company}`, "label": "Conservative", "openRate": "72%" },
      { "text": "quick note", "label": "Curiosity", "openRate": "84%" },
      { "text": `optimizing ${company}'s scale`, "label": "Executive", "openRate": "78%" },
      { "text": `chat about ${company}?`, "label": "Friendly", "openRate": "75%" },
      { "text": `idea for ${company}`, "label": "High Open Rate", "openRate": "92%" }
    ],
    fallbackUsed: true,
    fallbackReason: reason
  };
}

function buildFallbackOptimize(data, reason) {
  // We no longer provide a string fallback for optimize to avoid
  // silently appending error text to the user's document.
  return null;
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
  const personalization = body.personalization || {};
  const userName = String(userContext.name || body.senderName || body.userName || '').trim();
  const background = String(userContext.background || body.background || '').trim();
  const keySkills = String(userContext.keySkills || '').trim();
  const experience = String(userContext.experience || '').trim();
  const whyContacting = String(userContext.whyContacting || body.valueProposition || '').trim();

  // FIX: Read length from personalization wrapper (new shape) OR top-level (old shape)
  // The frontend sends { personalization: { tone, length, ctaStyle } } so we must
  // check personalization.length first, then fall back to body.length / body.lengthType.
  let lengthType = personalization.length || body.lengthType || body.length || 'Standard';
  let minLength = parseInt(body.minLength, 10);
  let maxLength = parseInt(body.maxLength, 10);

  if (typeof lengthType === 'string') {
    const norm = lengthType.toLowerCase();
    if (norm.includes('short')) {
      lengthType = 'Short';
      minLength = 80;
      maxLength = 100;
    } else if (norm.includes('medium')) {
      lengthType = 'Medium';
      minLength = 120;
      maxLength = 170;
    } else if (norm.includes('long')) {
      lengthType = 'Long';
      minLength = 180;
      maxLength = 250;
    } else if (norm.includes('custom')) {
      lengthType = 'Custom';
    } else {
      lengthType = 'Medium';
      minLength = 120;
      maxLength = 170;
    }
  }

  if (lengthType === 'Custom') {
    if (isNaN(minLength) || minLength < 1) minLength = 80;
    if (isNaN(maxLength) || maxLength < minLength) maxLength = Math.max(minLength, 250);
  } else {
    if (lengthType === 'Short') {
      minLength = 80;
      maxLength = 100;
    } else if (lengthType === 'Long') {
      minLength = 180;
      maxLength = 250;
    } else {
      lengthType = 'Medium';
      minLength = 120;
      maxLength = 170;
    }
  }

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
    length: lengthType,
    lengthType,
    minLength,
    maxLength,
    emailBody: String(body.emailBody || '').trim(),
    feedback: String(body.feedback || '').trim()
  };

  // ── Validation ───────────────────────────────────────────────────────────
  // Note: whyContacting (companyContext / "What caught your attention?") is
  // explicitly optional — it must NEVER block generation.
  if (action === 'generate') {
    if (!companyName || !position || !userName || !background || !emailGoal) {
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
    if (action === 'optimize') {
      return res.status(500).json({ error: 'AI Provider API Key is not set. Cannot perform modification.' });
    }
    let fallback;
    if (action === 'generate') fallback = buildFallbackColdEmail(dataFields, 'AI Provider API Key is not set.');
    else if (action === 'regenerate-subjects') fallback = buildFallbackSubjects(dataFields, 'AI Provider API Key is not set.');
    return res.status(200).json(fallback);
  }

  let prompt = '';
  if (action === 'generate') prompt = buildGeneratePrompt(dataFields);
  else if (action === 'regenerate-subjects') prompt = buildRegenSubjectsPrompt(dataFields);
  else prompt = buildOptimizePrompt(dataFields);

  // Implement strict validation retry gate
  const maxValidationRetries = 2;
  let validationAttempt = 0;
  let validatedData = null;
  let validationErrorMsg = '';

  while (validationAttempt <= maxValidationRetries) {
    let activePrompt = prompt;
    if (validationAttempt > 0) {
      // Append strict quality feedback to prompt on retries
      activePrompt = `${prompt}\n\nRETRY INSTRUCTION: The previous output failed quality validation: ${validationErrorMsg}. Rewrite the outreach package ensuring no placeholders like [Your Name] remain, no markdown formatting fences exist in variant bodies, no bulleted resume sections leak, all sentences are complete, and all content strictly adheres to the word count range of ${minLength} to ${maxLength} words.`;
    }

    try {
      let r = await callGemini({
        contents: [{ parts: [{ text: activePrompt }] }],
        generationConfig: { temperature: 0.7 + (validationAttempt * 0.1), maxOutputTokens: 3000 }
      });

      if (!r.ok) {
        const errText = await r.text();
        // Log internally only — never expose generation API details to client
        console.error('[cold-email] Generation API error:', r.status, errText.substring(0, 300));
        const httpStatus = r.status;
        if (httpStatus === 429) {
          validationErrorMsg = 'rate_limit';
        } else if (httpStatus >= 500) {
          validationErrorMsg = `service_error (${httpStatus})`;
        } else {
          validationErrorMsg = `HTTP_${httpStatus}`;
        }
        validationAttempt++;
        continue;
      }

      const result = await r.json();
      if (!result?.candidates?.[0]?.content?.parts?.[0]) {
        console.error('[cold-email] Empty candidates response from generation API');
        validationErrorMsg = 'empty_response';
        validationAttempt++;
        continue;
      }

      const rawText = result.candidates[0].content.parts[0].text || '';
      let data = parseGeminiResponse(rawText, action);

      if (action === 'generate') {
        const valResult = validateColdEmailOutput(data, minLength, maxLength);
        if (valResult.isValid) {
          validatedData = data;
          break;
        } else {
          validationErrorMsg = valResult.reason;
          validationAttempt++;
        }
      } else if (action === 'optimize') {
        const valResult = validateOptimizeOutput(data, minLength, maxLength);
        if (valResult.isValid) {
          validatedData = data;
          break;
        } else {
          validationErrorMsg = valResult.reason;
          validationAttempt++;
        }
      } else {
        // For subjects, parsing check is sufficient
        if (data && Object.keys(data).length > 0) {
          validatedData = data;
          break;
        }
        validationAttempt++;
      }
    } catch (err) {
      // Log full error internally — never expose to client
      console.error('[cold-email] Generation call exception (internal):', err.message);
      validationErrorMsg = 'exception';
      validationAttempt++;
    }
  }

  // Fallback to high quality template if all retries fail
  if (!validatedData) {
    console.warn('[cold-email] Quality validation failed or retries exhausted. Applying local template fallbacks where applicable.');
    
    if (action === 'optimize') {
      return res.status(500).json({ error: `Could not create a revised version. Validation failure: ${validationErrorMsg}` });
    }

    let fallback;
    if (action === 'generate') fallback = buildFallbackColdEmail(dataFields, `Validation failure: ${validationErrorMsg}`);
    else if (action === 'regenerate-subjects') fallback = buildFallbackSubjects(dataFields, `Validation failure: ${validationErrorMsg}`);
    return res.status(200).json(fallback);
  }

  // Normalize final result
  if (action === 'generate') {
    // Inject local spam analysis results
    const allText = validatedData.variants.map(v => (v.subject + ' ' + v.body).toLowerCase()).join(' ');
    validatedData.spamWords = SPAM_WORDS.filter(w => allText.includes(w.toLowerCase()));
    if (typeof validatedData.spamScore !== 'number') {
      validatedData.spamScore = Math.min(100, validatedData.spamWords.length * 15 + (allText.includes('!!!') ? 10 : 0));
    }
    validatedData.spamRecommendations = validatedData.spamRecommendations || [
      "Keep the email length below 150 words.",
      "Ensure CTA is low friction and does not use sales jargon."
    ];
  }

  validatedData.isPro = isPro;
  return res.status(200).json(validatedData);
};
