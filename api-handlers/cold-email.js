// POST /api/cold-email
// Handles email generation, action-based optimization, and subject regeneration.
// Actions: generate | optimize | regenerate-subjects
// Integrates with usage_tracking table and authenticates requests.

const { authenticateRequest } = require('../utils/supabase');
const { getApiKeys, callGemini } = require('../utils/gemini');

const SPAM_WORDS = [
  'free', 'guaranteed', 'urgent', 'winner', 'cash', 'prize', 'click here',
  'act now', 'limited time', 'no obligation', 'risk-free', 'discount',
  'earn money', 'cash back', 'double your', 'satisfaction guaranteed'
];

/**
 * Strips contact details, raw URLs, and resume section headers from user-provided
 * background text to prevent resume leakage into generated email copy.
 */
function cleanResumeInputs(text) {
  if (!text) return '';

  let cleaned = text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    .replace(/\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, '')
    .replace(/github\.com\/[a-zA-Z0-9_-]+/gi, '')
    .replace(/linkedin\.com\/in\/[a-zA-Z0-9_-]+/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(phone|email|address|contact|portfolio|github|linkedin)\b\s*:?/gi, '');

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
 * Validates the cold email generation output.
 * Accepts emails that end with a signature (plain name line counts as a valid ending).
 */
function validateColdEmailOutput(data, minLength, maxLength) {
  if (!data || !Array.isArray(data.variants) || data.variants.length < 3) {
    console.warn('[cold-email] Validation failed: fewer than 3 variants returned.');
    return { isValid: false, reason: 'Fewer than 3 variants returned' };
  }

  const placeholderRegex = /\[[A-Za-z0-9\s_-]{2,}\]|<[A-Za-z0-9\s_-]{2,}>|\{your\s|your_placeholder/i;
  const resumeHeaderRegex = /^(education|skills|work experience|summary|languages|references|certifications)\s*:?\s*$/im;
  const debugRegex = /internal prompt|system prompt|gemini|llm|ai fallback/i;

  for (let i = 0; i < data.variants.length; i++) {
    const variant = data.variants[i];

    if (!variant.subject || !variant.body || !variant.tone) {
      console.warn(`[cold-email] Validation failed: variant ${i} has empty required fields.`);
      return { isValid: false, reason: `Variant ${i} missing subject, body, or tone` };
    }

    // Word count check
    const words = variant.body.trim().split(/\s+/).filter(Boolean).length;
    if (words < minLength || words > maxLength) {
      console.warn(`[cold-email] Validation failed: variant "${variant.tone}" has ${words} words (range: ${minLength}–${maxLength}).`);
      return {
        isValid: false,
        reason: `Variant "${variant.tone}" has ${words} words; required ${minLength}–${maxLength}.`
      };
    }

    // Resume header leakage
    if (resumeHeaderRegex.test(variant.body)) {
      console.warn(`[cold-email] Validation failed: resume section headers in variant "${variant.tone}".`);
      return { isValid: false, reason: `Resume section headers in variant "${variant.tone}"` };
    }

    // Placeholder tags
    if (placeholderRegex.test(variant.body) || placeholderRegex.test(variant.subject)) {
      console.warn(`[cold-email] Validation failed: placeholder tags in variant "${variant.tone}".`);
      return { isValid: false, reason: `Placeholder tags in variant "${variant.tone}"` };
    }

    // Sentence completeness — check the last meaningful (non-blank) line of the body.
    // Email signatures (plain name lines) are valid endings.
    const nonBlankLines = variant.body.split('\n').map(l => l.trim()).filter(Boolean);
    const lastLine = nonBlankLines[nonBlankLines.length - 1] || '';
    const endsComplete = /[.?!'""]$/.test(lastLine) || /^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/.test(lastLine);
    if (!endsComplete) {
      console.warn(`[cold-email] Validation failed: variant "${variant.tone}" does not end with complete sentence or signature. Last line: "${lastLine}"`);
      return { isValid: false, reason: `Variant "${variant.tone}" ends abruptly without complete sentence or signature.` };
    }

    // Debug/internal leakage
    if (debugRegex.test(variant.body) || debugRegex.test(variant.subject)) {
      console.warn(`[cold-email] Validation failed: internal prompt leakage in variant "${variant.tone}".`);
      return { isValid: false, reason: 'Internal prompt leakage detected' };
    }

    // Markdown / HTML fences
    if (variant.body.includes('```') || variant.body.includes('<html>') || variant.body.includes('<div>')) {
      console.warn(`[cold-email] Validation failed: markdown/HTML in variant "${variant.tone}".`);
      return { isValid: false, reason: `Markdown or HTML in variant "${variant.tone}"` };
    }

    // Duplicate paragraphs
    const paragraphs = variant.body.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    const uniqueParagraphs = new Set(paragraphs);
    if (paragraphs.length > 1 && paragraphs.length !== uniqueParagraphs.size) {
      console.warn(`[cold-email] Validation failed: duplicate paragraphs in variant "${variant.tone}".`);
      return { isValid: false, reason: `Duplicate paragraphs in variant "${variant.tone}"` };
    }
  }

  return { isValid: true };
}

/**
 * Validates optimize output. Uses a wide, flexible range — optimize actions
 * (shorten, improve, change angle) should not be constrained to the generation
 * word limits. We just ensure the output is non-trivial and clean.
 */
function validateOptimizeOutput(data) {
  if (!data || !data.revisedText) {
    console.warn('[cold-email] Optimize validation failed: missing revisedText.');
    return { isValid: false, reason: 'Missing revisedText field' };
  }

  const words = data.revisedText.trim().split(/\s+/).filter(Boolean).length;
  // Flexible range: must be at least 20 words (not a fragment) and at most 250 (not dumped)
  if (words < 20 || words > 250) {
    console.warn(`[cold-email] Optimize validation failed: ${words} words is out of range 20–250.`);
    return { isValid: false, reason: `Optimized body has ${words} words (expected 20–250)` };
  }

  const placeholderRegex = /\[[A-Za-z0-9\s_-]{2,}\]|<[A-Za-z0-9\s_-]{2,}>|\{your\s/i;
  if (placeholderRegex.test(data.revisedText)) {
    return { isValid: false, reason: 'Placeholder tags in optimized body' };
  }

  if (data.revisedText.includes('```') || data.revisedText.includes('<html>')) {
    return { isValid: false, reason: 'Markdown or HTML in optimized body' };
  }

  return { isValid: true };
}

/**
 * Builds the primary generation prompt.
 *
 * LENGTH SCHEME (per spec):
 *   Short    → 50–75 words
 *   Standard → 80–100 words  (default; hard max 125 per spec)
 *   Detailed → 110–125 words (absolute max per spec)
 *
 * VARIANTS: 4 strategically different approaches
 *   1. Professional  — recipient/context-first
 *   2. Friendly      — value-first, peer-to-peer
 *   3. Direct        — question-first, decision-maker focused
 *   4. Networking    — curiosity-first, relationship-building
 */
function buildGeneratePrompt(data) {
  const cleanBg = cleanResumeInputs(data.background);
  const cleanWhy = cleanResumeInputs(data.whyContacting);

  const greeting = data.recipientName ? `Hi ${data.recipientName},` : 'Hi there,';
  const recipientCtx = [
    data.recipientName ? `Name: ${data.recipientName}` : null,
    data.position ? `Title: ${data.position}` : null,
    data.companyName ? `Company: ${data.companyName}` : null
  ].filter(Boolean).join('\n');

  const senderCtx = [
    `Name: ${data.userName}`,
    cleanBg ? `Background / Value Proposition: ${cleanBg}` : null,
    cleanWhy ? `Reason for reaching out / Company context: ${cleanWhy}` : null
  ].filter(Boolean).join('\n');

  return `You are an elite cold-email writer for professional networking, referrals, jobs, internships, mentorship, introductions, and partnerships.

EMAIL GOAL: ${data.emailGoal}

RECIPIENT:
${recipientCtx}

SENDER (use ONLY this information — never invent facts):
${senderCtx}

═══════════════════════════════════════
CORE RULES — EVERY VARIANT MUST FOLLOW ALL OF THESE:
═══════════════════════════════════════

WORD COUNT: Each variant body must contain between ${data.minLength} and ${data.maxLength} words. This is a hard constraint.

CONTENT:
1. Start with the recipient, company, or a specific context observation — NEVER with the sender's self-introduction.
2. Use exactly ONE relevant fact from the sender's background. Do not dump or summarize a resume.
3. Connect the sender's ONE fact directly to the recipient's context or goal.
4. End with exactly ONE clear, low-friction CTA appropriate to the goal.
   Good CTAs: "Would you be open to a brief conversation?", "Is this something worth exploring?", "Would a short exchange next week make sense?", "Would you be the right person to connect with?"
5. Never invent achievements, metrics, company news, mutual connections, events, publications, or recipient interests.
6. If personalization data is unavailable, use a natural non-fabricated opening.
7. NEVER use: "I hope this finds you well", "I came across your profile", "I wanted to introduce myself", "pick your brain", "synergy", "leverage", "I would love to connect", "Hope you're having a great week", "My name is X and I am writing to..."
8. Never mention unrelated experience.
9. Never use generic praise or filler phrases.
10. Never repeat information.
11. Never write in third person about the sender.
12. Never use HTML, Markdown, <br>, JSON, or formatting tags in the body.
13. Use clean paragraphs separated by a single blank line.
14. Preserve sender's exact name: ${data.userName}
15. Keep the signature simple: just the sender's name.

SUBJECT LINES: Specific, natural, under 8 words. No generic subjects like "Following up" or "Quick question".

═══════════════════════════════════════
VARIANT STRATEGY — 4 GENUINELY DIFFERENT APPROACHES:
═══════════════════════════════════════

Variant 1 — Professional (Recipient-First):
  Opening strategy: Observe something specific about the company or role, then connect sender's value to it.
  Tone: Professional, direct, respectful.

Variant 2 — Friendly (Value-First):
  Opening strategy: Lead immediately with the one thing the sender brings that's most relevant to this recipient.
  Tone: Warm, peer-to-peer, conversational but credible.

Variant 3 — Direct (Question-First):
  Opening strategy: Open with a specific, relevant question that demonstrates the sender's understanding of the recipient's world.
  Tone: Confident, efficient, appropriate for decision-makers.

Variant 4 — Networking (Curiosity-First):
  Opening strategy: Express genuine, specific curiosity about the recipient's work. Advice-seeking, low-pressure. No hard ask.
  Tone: Human, warm, naturally curious.

═══════════════════════════════════════
OUTPUT — Return ONLY valid JSON, no backticks, no markdown, no extra text:
═══════════════════════════════════════

{
  "variants": [
    {
      "tone": "Professional",
      "subject": "[specific natural subject, under 8 words]",
      "body": "${greeting}\\n\\n[recipient-first email body — ${data.minLength} to ${data.maxLength} words]\\n\\nBest,\\n${data.userName}",
      "approach": "Recipient/context-first. Connects one sender fact to company context. Soft CTA."
    },
    {
      "tone": "Friendly",
      "subject": "[specific natural subject, under 8 words]",
      "body": "${greeting}\\n\\n[value-first email body — ${data.minLength} to ${data.maxLength} words]\\n\\nBest,\\n${data.userName}",
      "approach": "Value-first. Leads with sender's strongest relevant credential. Peer-to-peer tone."
    },
    {
      "tone": "Direct",
      "subject": "[specific natural subject, under 8 words]",
      "body": "${greeting}\\n\\n[question-first email body — ${data.minLength} to ${data.maxLength} words]\\n\\nBest,\\n${data.userName}",
      "approach": "Question-first. Demonstrates understanding of recipient's world. Decision-maker focused."
    },
    {
      "tone": "Networking",
      "subject": "[specific natural subject, under 8 words]",
      "body": "${greeting}\\n\\n[curiosity-first email body — ${data.minLength} to ${data.maxLength} words]\\n\\nWarmly,\\n${data.userName}",
      "approach": "Curiosity-first. Genuine interest in recipient's work. Advice-seeking, no hard ask."
    }
  ],
  "subjectLines": [
    { "text": "[specific subject — direct angle]", "label": "Direct" },
    { "text": "[specific subject — curiosity angle]", "label": "Curiosity" },
    { "text": "[specific subject — value angle]", "label": "Value" },
    { "text": "[specific subject — personal angle]", "label": "Personal" }
  ],
  "evaluation": {
    "overallScore": 0,
    "strengths": ["[specific strength 1]", "[specific strength 2]"],
    "weaknesses": ["[one specific improvement area]"],
    "suggestions": ["[one actionable suggestion]"]
  },
  "followUps": [
    {
      "index": 1,
      "timing": "3–5 business days after initial email",
      "subject": "[follow-up subject referencing original context — not 'Following up']",
      "body": "${greeting}\\n\\n[Adds a new angle, fact, or thought — NOT just 'circling back'. 50–75 words max.]\\n\\nBest,\\n${data.userName}"
    },
    {
      "index": 2,
      "timing": "7–10 business days after follow-up 1",
      "subject": "[final follow-up subject — graceful, non-pushy close]",
      "body": "${greeting}\\n\\n[Respectful closing message. Acknowledges they may not be interested. Leaves door open. No pressure. 40–60 words max.]\\n\\nAll the best,\\n${data.userName}"
    }
  ]
}`;
}

function buildRegenSubjectsPrompt(data) {
  return `You are a high-converting cold outreach copywriter. Review the following email context and generate subject lines.

Email Goal: ${data.emailGoal}
Recipient: ${data.recipientName || 'Hiring Manager'} at ${data.companyName} (${data.position})

Email Body (for context only — do not copy from it directly):
${data.emailBody}

Generate exactly 5 fresh, specific subject lines.
Rules:
- Each must be specific to this recipient/company/goal — never generic like "Following up" or "Quick question"
- Under 8 words each
- Sound like a real person wrote it, not a marketer
- No exclamation marks
- No invented facts about the recipient or company

Return ONLY a valid JSON object — no backticks, no markdown, no extra text:
{
  "subjectLines": [
    { "text": "[subject text]", "label": "Direct" },
    { "text": "[subject text]", "label": "Curiosity" },
    { "text": "[subject text]", "label": "Value" },
    { "text": "[subject text]", "label": "Personal" },
    { "text": "[subject text]", "label": "Question" }
  ]
}`;
}

function buildOptimizePrompt(data) {
  return `You are an elite cold email editor. Revise the following email body based on the user's specific instruction.

CURRENT EMAIL:
${data.emailBody}

USER INSTRUCTION: "${data.feedback}"

CONTEXT:
- Goal: ${data.emailGoal}
- Recipient: ${data.recipientName || 'the recipient'} at ${data.companyName || 'the company'} (${data.position || 'their role'})
- Sender name: ${data.userName}

RULES:
1. Apply ONLY the change requested. Do not rewrite parts the instruction does not mention.
2. Preserve the sender's name, greeting, signature, and all verified facts.
3. Do NOT invent new facts, metrics, or claims not present in the original email.
4. Do NOT add generic filler, praise, or clichés.
5. Keep the email under 125 words unless the instruction explicitly asks for more detail.
6. Return clean text only — no HTML, no Markdown, no JSON tags.

Return ONLY valid JSON — no backticks, no extra text:
{
  "revisedText": "The fully revised email body...",
  "reason": "Brief explanation of what was changed and why."
}`;
}

function parseGeminiResponse(text, action = 'generate') {
  // Strip markdown fences
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Extract outermost JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];

  // Attempt to close unclosed JSON (truncation recovery)
  if (text.startsWith('{') && !text.endsWith('}')) text += '}';

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(`[cold-email] [${action}] JSON parse error:`, e.message, '\nRaw excerpt:', text.substring(0, 300));
    return {};
  }
}

/**
 * Spec-compliant fallback emails.
 * - Start with recipient/company context
 * - One sender fact
 * - One CTA
 * - No banned phrases
 * - Under 100 words per variant
 */
function buildFallbackColdEmail(data) {
  const company = data.companyName || 'your organization';
  const recipientName = data.recipientName || '';
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,';
  const position = data.position || 'your team';
  const sender = data.userName || 'there';
  const bg = data.background
    ? cleanResumeInputs(data.background).split('.')[0].trim()
    : null;
  const why = cleanResumeInputs(data.whyContacting || '');

  const contextLine = why
    ? why
    : `the work happening at ${company}`;

  const valueLine = bg
    ? bg
    : `a background relevant to ${position}`;

  const variants = [
    {
      tone: 'Professional',
      subject: `${company} — worth connecting?`,
      body: `${greeting}\n\n${contextLine} is something I've been following closely.\n\n${valueLine}. I'd be glad to share more if it's relevant to what you're working on.\n\nWould you be open to a brief conversation?\n\nBest,\n${sender}`,
      approach: 'Recipient/context-first. One sender fact. Soft CTA.'
    },
    {
      tone: 'Friendly',
      subject: `a quick thought on ${company}`,
      body: `${greeting}\n\n${valueLine} — and ${contextLine} is exactly the kind of work I'd like to contribute to.\n\nHappy to share a concrete example if that's useful.\n\nWould a short exchange next week make sense?\n\nBest,\n${sender}`,
      approach: 'Value-first. Peer-to-peer tone.'
    },
    {
      tone: 'Direct',
      subject: `${position} at ${company} — a question`,
      body: `${greeting}\n\nIs ${contextLine} a current priority for your team at ${company}?\n\n${valueLine}. If there's a fit, I'd welcome a 15-minute call.\n\nWould you be the right person to speak with?\n\nBest,\n${sender}`,
      approach: 'Question-first. Decision-maker focused.'
    },
    {
      tone: 'Networking',
      subject: `curious about your work at ${company}`,
      body: `${greeting}\n\nThe work your team is doing at ${company} — particularly around ${contextLine} — caught my attention.\n\n${valueLine}, and I'd genuinely value your perspective.\n\nWould you be open to a short conversation?\n\nWarmly,\n${sender}`,
      approach: 'Curiosity-first. Advice-seeking, no hard ask.'
    }
  ];

  const subjectLines = [
    { text: `${company} — worth connecting?`, label: 'Direct' },
    { text: `a thought on ${company}`, label: 'Curiosity' },
    { text: `${position} opportunity at ${company}`, label: 'Value' },
    { text: `your work at ${company}`, label: 'Personal' }
  ];

  return {
    variants,
    subjectLines,
    evaluation: {
      overallScore: 75,
      strengths: [
        'Clear, low-friction call to action',
        'No resume dumping or generic filler'
      ],
      weaknesses: [
        'Generated from template — add specific company research for higher impact'
      ],
      suggestions: [
        `Reference a specific initiative or product at ${company} for deeper personalization`
      ]
    },
    followUps: [
      {
        index: 1,
        timing: '3–5 business days after initial email',
        subject: `one more thought — ${company}`,
        body: `${greeting}\n\nOne additional thought since my last note: ${valueLine}. I think there's a genuine fit worth exploring.\n\nHappy to keep it brief.\n\nBest,\n${sender}`
      },
      {
        index: 2,
        timing: '7–10 business days after follow-up 1',
        subject: `closing the loop — ${company}`,
        body: `${greeting}\n\nI'll leave it here so I'm not filling your inbox. If the timing is ever right to connect, I'd welcome it.\n\nAll the best,\n${sender}`
      }
    ],
    fallbackUsed: true
  };
}

function buildFallbackSubjects(data) {
  const company = data.companyName || 'your company';
  const position = data.position || 'your role';
  return {
    subjectLines: [
      { text: `${company} — worth connecting?`, label: 'Direct' },
      { text: `a thought on ${company}`, label: 'Curiosity' },
      { text: `${position} at ${company}`, label: 'Value' },
      { text: `your work at ${company}`, label: 'Personal' },
      { text: `quick question for you`, label: 'Question' }
    ],
    fallbackUsed: true
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const action = String(body.action || 'generate').toLowerCase();

  // ── Field extraction with backward-compatible fallbacks ──────────────────
  const emailGoal = String(body.emailGoal || body.purpose || 'Networking').trim();

  const recipient = body.recipient || {};
  const recipientName = String(recipient.name || body.recipientName || '').trim();
  const companyName = String(recipient.company || body.company || body.companyName || '').trim();
  const position = String(recipient.position || body.recipientTitle || body.position || '').trim();

  const userContext = body.userContext || {};
  const personalization = body.personalization || {};
  const userName = String(userContext.name || body.senderName || body.userName || '').trim();
  const background = String(userContext.background || body.background || '').trim();
  const whyContacting = String(
    userContext.whyContacting || body.companyContext || body.valueProposition || ''
  ).trim();

  // ── Length mapping (spec-compliant) ──────────────────────────────────────
  // Short    → 50–75w
  // Standard → 80–100w (default, hard max 125 per spec)
  // Detailed → 110–125w
  let lengthType = personalization.length || body.lengthType || body.length || 'Standard';
  let minLength, maxLength;

  const norm = String(lengthType).toLowerCase();
  if (norm.includes('short')) {
    lengthType = 'Short';
    minLength = 50;
    maxLength = 75;
  } else if (norm.includes('detail') || norm.includes('long')) {
    lengthType = 'Detailed';
    minLength = 110;
    maxLength = 125;
  } else {
    // Standard (default) and anything else
    lengthType = 'Standard';
    minLength = 80;
    maxLength = 100;
  }

  // Allow explicit numeric overrides (advanced usage)
  if (Number.isInteger(body.minLength) && body.minLength > 0) minLength = body.minLength;
  if (Number.isInteger(body.maxLength) && body.maxLength > minLength) maxLength = body.maxLength;

  const dataFields = {
    emailGoal,
    recipientName,
    companyName,
    position,
    userName,
    background,
    whyContacting,
    length: lengthType,
    lengthType,
    minLength,
    maxLength,
    emailBody: String(body.emailBody || '').trim(),
    feedback: String(body.feedback || '').trim()
  };

  // ── Request validation ───────────────────────────────────────────────────
  // Note: whyContacting (companyContext) is intentionally optional — NEVER block on it.
  // Note: background is required for generate; omitting it server-side gives a clean error.
  if (action === 'generate') {
    const missingFields = [];
    if (!companyName) missingFields.push('companyName (recipient company)');
    if (!position) missingFields.push('position (recipient title/role)');
    if (!userName) missingFields.push('userName (sender name)');
    if (!background) missingFields.push('background (sender value proposition)');
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields
      });
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
    return res.status(400).json({ error: `Invalid action: "${action}". Valid actions: generate, optimize, regenerate-subjects.` });
  }

  // ── Authentication ───────────────────────────────────────────────────────
  let user = null;
  let isPro = false;
  let supabase = null;

  try {
    const authResult = await authenticateRequest(req);
    user = authResult.user;
    isPro = authResult.isPro;
    supabase = authResult.supabase;
  } catch (authErr) {
    console.error('[cold-email] Auth failure:', authErr.message);
    return res.status(authErr.status || 401).json({ error: authErr.message });
  }

  // ── Usage limiting (free tier: 3 generate/optimize calls per day) ────────
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
        console.warn('[cold-email] Usage fetch error (non-fatal):', fetchErr.message);
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

  // ── Check API key availability ───────────────────────────────────────────
  const keys = getApiKeys();
  if (keys.length === 0) {
    if (action === 'optimize') {
      return res.status(500).json({ error: 'AI service is not configured. Cannot perform this action.' });
    }
    if (action === 'generate') {
      return res.status(200).json(buildFallbackColdEmail(dataFields));
    }
    return res.status(200).json(buildFallbackSubjects(dataFields));
  }

  // ── Build prompt ─────────────────────────────────────────────────────────
  let prompt;
  if (action === 'generate') prompt = buildGeneratePrompt(dataFields);
  else if (action === 'regenerate-subjects') prompt = buildRegenSubjectsPrompt(dataFields);
  else prompt = buildOptimizePrompt(dataFields);

  // ── AI call with validation retry gate ───────────────────────────────────
  const MAX_RETRIES = 2;
  let attempt = 0;
  let validatedData = null;
  let lastFailReason = '';

  while (attempt <= MAX_RETRIES) {
    let activePrompt = prompt;

    if (attempt > 0) {
      const retryNote = `\n\nRETRY NOTE: Previous attempt failed quality check: ${lastFailReason}. ` +
        `Ensure: no placeholder tags like [Name], no markdown fences, no resume section headers, ` +
        `all sentences complete, word count strictly ${minLength}–${maxLength}.`;
      activePrompt = prompt + retryNote;
    }

    try {
      const r = await callGemini({
        contents: [{ parts: [{ text: activePrompt }] }],
        generationConfig: {
          temperature: 0.65 + (attempt * 0.08),
          maxOutputTokens: 3500
        }
      });

      if (!r.ok) {
        const errText = await r.text();
        console.error(`[cold-email] API error (attempt ${attempt}):`, r.status, errText.substring(0, 200));
        lastFailReason = `HTTP ${r.status}`;
        attempt++;
        continue;
      }

      const result = await r.json();
      const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!rawText) {
        console.error('[cold-email] Empty response from AI (attempt', attempt, ')');
        lastFailReason = 'empty_response';
        attempt++;
        continue;
      }

      const parsed = parseGeminiResponse(rawText, action);

      if (action === 'generate') {
        const validation = validateColdEmailOutput(parsed, minLength, maxLength);
        if (validation.isValid) {
          validatedData = parsed;
          break;
        }
        lastFailReason = validation.reason;
        attempt++;
      } else if (action === 'optimize') {
        const validation = validateOptimizeOutput(parsed);
        if (validation.isValid) {
          validatedData = parsed;
          break;
        }
        lastFailReason = validation.reason;
        attempt++;
      } else {
        // regenerate-subjects: basic check
        if (parsed && Array.isArray(parsed.subjectLines) && parsed.subjectLines.length > 0) {
          validatedData = parsed;
          break;
        }
        lastFailReason = 'Invalid subjects response';
        attempt++;
      }
    } catch (err) {
      console.error(`[cold-email] Exception (attempt ${attempt}):`, err.message);
      lastFailReason = err.message || 'exception';
      attempt++;
    }
  }

  // ── Fallback if all retries failed ───────────────────────────────────────
  if (!validatedData) {
    console.warn('[cold-email] All retries exhausted. Last failure:', lastFailReason);

    if (action === 'optimize') {
      return res.status(500).json({
        error: 'Could not revise the email. Please try a different action or try again.'
      });
    }

    if (action === 'generate') {
      const fallback = buildFallbackColdEmail(dataFields);
      fallback.isPro = isPro;
      fallback.fallbackReason = lastFailReason;
      return res.status(200).json(fallback);
    }

    return res.status(200).json(buildFallbackSubjects(dataFields));
  }

  // ── Finalize and return ───────────────────────────────────────────────────
  if (action === 'generate') {
    // Local spam analysis
    const allText = validatedData.variants
      .map(v => `${v.subject} ${v.body}`.toLowerCase())
      .join(' ');
    validatedData.spamWords = SPAM_WORDS.filter(w => allText.includes(w.toLowerCase()));
    validatedData.spamScore = Math.min(
      100,
      validatedData.spamWords.length * 15 + (allText.includes('!!!') ? 10 : 0)
    );
  }

  validatedData.isPro = isPro;
  return res.status(200).json(validatedData);
};
