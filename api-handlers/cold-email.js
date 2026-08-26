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
 * Extracts the single most relevant, impactful proof point from a multi-sentence background.
 *
 * Cold emails must reference exactly ONE sender credential. This prevents the AI
 * from receiving a 3–5 sentence resume summary and weaving all of it into the email.
 *
 * Scoring heuristics:
 *  +2  sentence contains a metric or concrete achievement verb
 *  +1  sentence contains a word from the recipient/company context
 *  −2  sentence starts with first-person self-intro ("I am", "I have", "my background")
 *  −1  sentence is too short or too long to be a usable proof point
 */
function extractSingleProofPoint(background, context) {
  if (!background) return '';

  const clean = cleanResumeInputs(background);

  // Split on sentence-ending punctuation followed by whitespace
  const raw = clean.replace(/([.!?])\s+/g, '$1\x00').split('\x00');
  const sentences = raw
    .map(s => s.replace(/\x00/g, '').trim())
    .filter(s => s.length > 15 && s.length < 300);

  if (sentences.length === 0) return clean.substring(0, 200).trim();
  if (sentences.length === 1) return sentences[0];

  const contextWords = (context || '').toLowerCase().split(/[\s,;]+/).filter(w => w.length > 3);
  const achievementVerbs = /\d+[%k+]?|built|launched|led|drove|shipped|reduced|improved|increased|created|designed|scaled|delivered|grew|saved|generated|managed|deployed|architected|founded|published/i;
  const introPatterns = /^(?:i am |i have |my background|my experience|i possess|i hold |i worked|i currently)/i;

  const scored = sentences.map(sentence => {
    const lower = sentence.toLowerCase();
    let score = 0;
    if (introPatterns.test(sentence)) score -= 2;
    if (achievementVerbs.test(sentence)) score += 2;
    if (sentence.length < 30 || sentence.length > 200) score -= 1;
    contextWords.forEach(word => { if (lower.includes(word)) score += 1; });
    return { sentence, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].sentence;
}

/**
 * Detects cover-letter and resume-summary anti-patterns in generated email bodies.
 * Returns the first pattern found, or null if clean.
 */
function detectCoverLetterPattern(body) {
  if (!body) return null;
  const tests = [
    { re: /\bi am (?:a |an )[a-z]+ (?:professional|engineer|developer|specialist|expert|manager|graduate|student)/i,  label: 'self-intro job title' },
    { re: /my background includes/i,                                      label: 'resume summary opener' },
    { re: /i have \d+[\+]? years? of experience/i,                        label: 'experience summary' },
    { re: /i am writing to (?:apply|express|inquire|inform)/i,            label: 'application language' },
    { re: /i am passionate about/i,                                        label: 'passion filler' },
    { re: /(?:my|key)? skills include/i,                                   label: 'skills list' },
    { re: /my experience (?:in|with|includes)/i,                          label: 'experience dump' },
    { re: /i possess (?:strong|extensive|excellent)/i,                    label: 'generic self-praise' },
    { re: /enclosed (?:is|please find)/i,                                  label: 'cover letter boilerplate' },
    { re: /i would (?:love|like) to (?:join|contribute|be part of)/i,     label: 'application phrasing' },
    { re: /throughout my career/i,                                         label: 'career narrative' },
    { re: /(?:over|during) the (?:past|last) \d+ years/i,                label: 'career timeline' },
    { re: /as you can see from my resume/i,                               label: 'resume reference' },
    { re: /(?:proficient|expertise|extensive knowledge) in/i,             label: 'skills catalogue' },
    { re: /i am (?:confident|certain|sure) that/i,                        label: 'confidence boilerplate' },
    { re: /thank you for (?:considering|taking the time)/i,               label: 'closing boilerplate' },
  ];
  for (const { re, label } of tests) {
    if (re.test(body)) return label;
  }
  return null;
}

/**
 * Strips contact details, raw URLs, and resume section headers from user-provided
 * background text to prevent resume leakage into generated email copy.
 * (duplicate declaration guard — actual function body is above)
 */
function _cleanResumeInputsUnused(text) {
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
 * Rejects any output that reads like a cover letter or resume summary.
 */
function validateColdEmailOutput(data, minLength, maxLength) {
  if (!data || !Array.isArray(data.variants) || data.variants.length < 3) {
    console.warn('[cold-email] Validation failed: fewer than 3 variants returned.');
    return { isValid: false, reason: 'Fewer than 3 variants returned' };
  }

  const placeholderRegex = /\[[A-Za-z0-9\s_-]{2,}\]|<[A-Za-z0-9\s_-]{2,}>|\{your\s|your_placeholder/i;
  const resumeHeaderRegex = /^(education|skills|work experience|summary|languages|references|certifications)\s*:?\s*$/im;
  const debugRegex = /internal prompt|system prompt|gemini|llm|ai fallback/i;
  // HTML tag detection — any remaining <br>, <p>, <div> etc.
  const htmlTagRegex = /<\/?[a-zA-Z][^>]{0,100}>/;

  for (let i = 0; i < data.variants.length; i++) {
    const variant = data.variants[i];

    if (!variant.subject || !variant.body || !variant.tone) {
      console.warn(`[cold-email] Validation failed: variant ${i} has empty required fields.`);
      return { isValid: false, reason: `Variant ${i} missing subject, body, or tone` };
    }

    // Cover letter / resume summary pattern detection
    const coverLetterPattern = detectCoverLetterPattern(variant.body);
    if (coverLetterPattern) {
      console.warn(`[cold-email] Validation failed: cover letter pattern "${coverLetterPattern}" in variant "${variant.tone}".`);
      return { isValid: false, reason: `Output reads like a cover letter (pattern: "${coverLetterPattern}") in variant "${variant.tone}"` };
    }

    // HTML tag leakage
    if (htmlTagRegex.test(variant.body)) {
      console.warn(`[cold-email] Validation failed: HTML tags in variant "${variant.tone}".`);
      return { isValid: false, reason: `HTML tags in variant "${variant.tone}"` };
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
    const endsComplete = /[.?!'"\u201c\u201d]$/.test(lastLine) || /^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/.test(lastLine);
    if (!endsComplete) {
      console.warn(`[cold-email] Validation failed: variant "${variant.tone}" does not end with complete sentence or signature. Last line: "${lastLine}"`);
      return { isValid: false, reason: `Variant "${variant.tone}" ends abruptly without complete sentence or signature.` };
    }

    // Debug/internal leakage
    if (debugRegex.test(variant.body) || debugRegex.test(variant.subject)) {
      console.warn(`[cold-email] Validation failed: internal prompt leakage in variant "${variant.tone}".`);
      return { isValid: false, reason: 'Internal prompt leakage detected' };
    }

    // Markdown / code fences
    if (variant.body.includes('```')) {
      console.warn(`[cold-email] Validation failed: markdown fences in variant "${variant.tone}".`);
      return { isValid: false, reason: `Markdown fences in variant "${variant.tone}"` };
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
 *   Short    → 40–65 words
 *   Standard → 55–85 words  (default; hard max 100 per spec)
 *   Detailed → 90–120 words (absolute max per spec: 125)
 *
 * VARIANTS: 4 strategically different approaches
 *   1. Context    — opens with specific company/role observation
 *   2. Question   — opens with a relevant question for the recipient
 *   3. Direct     — most stripped-down, decision-maker focused
 *   4. Curiosity  — advice-seeking, lowest pressure
 *
 * CRITICAL: The sender's background is compressed to a SINGLE proof point
 * before being inserted into the prompt. This prevents the AI from treating
 * a 3–5 sentence resume summary as a license to write a cover letter.
 */
function buildGeneratePrompt(data) {
  const cleanWhy = cleanResumeInputs(data.whyContacting);

  // Compress sender background to a single, most relevant proof point
  const proofPoint = extractSingleProofPoint(
    cleanResumeInputs(data.background),
    `${data.companyName} ${data.position} ${data.emailGoal} ${cleanWhy}`
  );

  const greeting = data.recipientName ? `Hi ${data.recipientName},` : 'Hi there,';

  const recipientSection = [
    `Goal: ${data.emailGoal}`,
    data.recipientName ? `Recipient name: ${data.recipientName}` : null,
    data.position       ? `Their role: ${data.position}`           : null,
    data.companyName    ? `Their company: ${data.companyName}`     : null,
    cleanWhy            ? `Context / reason for outreach: ${cleanWhy}` : null
  ].filter(Boolean).join('\n');

  const senderSection = [
    `Sender name: ${data.userName}`,
    proofPoint ? `ONE proof point to reference (do not use anything else): "${proofPoint}"` : null
  ].filter(Boolean).join('\n');

  return `You are a cold email writer. Write a first-touch professional cold email — NOT a cover letter, NOT a resume summary, NOT an application.

CONTEXT:
${recipientSection}

SENDER (use ONLY this — never invent facts):
${senderSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT A COLD EMAIL IS vs. WHAT IT IS NOT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BAD (this is a cover letter — do NOT write this):
"Hi Sarah, I am a software engineer with 5+ years of experience in distributed systems
and infrastructure. My background includes leading teams at TechCorp, building real-time
platforms, and extensive work with Kubernetes and AWS. I am passionate about engineering
excellence and would love to contribute to Stripe's infrastructure team."

GOOD (this is a cold email — write this):
"Hi Sarah, Stripe's focus on payment reliability is something I follow closely.
I recently shipped a fraud-detection layer that cut false positives by 40% — curious
whether that maps to anything on your radar.
Would a short call be worth it?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES — VIOLATION = REJECTION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. WORD COUNT: ${data.minLength}–${data.maxLength} words per variant body. Hard limit. Count carefully.
2. STRUCTURE: 3–4 short paragraphs maximum. No bullet lists. No section headers.
3. OPENING: Start with the recipient's world — their company, role, or a specific context.
   NEVER start with sender's name, title, background, or credentials.
4. ONE PROOF POINT: Reference exactly ONE fact from the sender's proof point above.
   Do NOT list multiple achievements, skills, tools, companies, or credentials.
   Do NOT invent achievements, metrics, or claims not in the proof point.
5. ONE CTA: End with exactly one natural, low-friction call to action.
   Good: "Would a short call make sense?" / "Open to a 15-minute chat?" / "Worth connecting?"
   Bad: Multiple asks, hard demands, or no ask at all.
6. TONE: Sound like a real person emailing a professional contact — not a marketer.
7. BANNED PHRASES (any of these → rejection):
   - "I am a [job title] with X years"
   - "My background includes" / "my experience in"
   - "I am writing to" / "I wanted to reach out"
   - "I am passionate about" / "I would love to"
   - "I hope this finds you well" / "Hope you're having a great week"
   - "I came across your profile" / "I wanted to introduce myself"
   - "pick your brain" / "synergy" / "leverage" / "per my last email"
   - "skills include" / "proficient in" / "expertise in"
   - Generic praise: "incredible work", "amazing company", "reputation for excellence"
   - "Thank you for considering" / "Please find enclosed"
8. NO HTML: No <br>, <p>, <div>, or any tag. No Markdown. Use plain text with blank lines between paragraphs.
9. NO INVENTED FACTS: Do not invent company news, product names, funding events, team wins,
   mutual connections, or recipient interests.
10. SIGNATURE: Sender's name only ("${data.userName}"). No title, no company, no links.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIANT STRATEGIES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Variant 1 — Context (opens with company/role observation):
  First sentence: a specific observation about the company, role, or industry.
  Then: ONE sender proof point that's relevant to that observation.
  Then: soft CTA.

Variant 2 — Question (opens with a specific relevant question):
  First sentence: a direct, specific question that shows the sender understands this recipient's world.
  Then: ONE proof point that makes that question credible.
  Then: CTA.

Variant 3 — Direct (most concise; decision-maker focused):
  No preamble. Jump straight to the reason for contact in one sentence.
  ONE proof point. ONE CTA. Shortest of the four variants.

Variant 4 — Curiosity (advice-seeking, lowest pressure):
  First sentence: genuine curiosity about the recipient's work or perspective.
  Then: ONE proof point that makes the question credible.
  CTA: ask for their perspective, not a sales call. No hard ask.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT: Return ONLY valid JSON. No backticks, no markdown, no extra text.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "variants": [
    {
      "tone": "Context",
      "subject": "[specific subject, under 8 words, relevant to company/role]",
      "body": "${greeting}\\n\\n[company/role observation — 1 sentence]\\n\\n[ONE proof point from sender — 1 sentence] [soft CTA — 1 sentence]\\n\\nBest,\\n${data.userName}",
      "approach": "Company/role observation → one proof point → soft CTA"
    },
    {
      "tone": "Question",
      "subject": "[specific question-style subject, under 8 words]",
      "body": "${greeting}\\n\\n[specific relevant question — 1 sentence]\\n\\n[ONE proof point that makes the question credible — 1 sentence] [CTA — 1 sentence]\\n\\nBest,\\n${data.userName}",
      "approach": "Specific question → one proof point → CTA"
    },
    {
      "tone": "Direct",
      "subject": "[direct subject, under 8 words]",
      "body": "${greeting}\\n\\n[direct reason for contact — 1 sentence] [ONE proof point — 1 sentence] [CTA — 1 sentence]\\n\\nBest,\\n${data.userName}",
      "approach": "Most concise. Direct reason → one proof point → CTA"
    },
    {
      "tone": "Curiosity",
      "subject": "[curiosity subject, under 8 words]",
      "body": "${greeting}\\n\\n[genuine curiosity about recipient's work — 1 sentence]\\n\\n[ONE proof point that makes the curiosity credible — 1 sentence] [low-pressure ask — 1 sentence]\\n\\nWarmly,\\n${data.userName}",
      "approach": "Curiosity about recipient → one proof point → low-pressure ask"
    }
  ],
  "subjectLines": [
    { "text": "[specific subject — direct]", "label": "Direct" },
    { "text": "[specific subject — question]", "label": "Question" },
    { "text": "[specific subject — context]", "label": "Context" },
    { "text": "[specific subject — curiosity]", "label": "Curiosity" }
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
      "subject": "[follow-up subject specific to context — not 'Following up']",
      "body": "${greeting}\\n\\n[New angle or thought — not 'just circling back'. 40–60 words max.]\\n\\nBest,\\n${data.userName}"
    },
    {
      "index": 2,
      "timing": "7–10 business days after follow-up 1",
      "subject": "[graceful close — not 'Following up']",
      "body": "${greeting}\\n\\n[Respectful close. No pressure. Leaves door open. 30–45 words max.]\\n\\nAll the best,\\n${data.userName}"
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
  // Short    → 40–65w
  // Standard → 55–85w  (default; user spec: 50–100, hard max 125)
  // Detailed → 90–120w (absolute max per spec: 125)
  let lengthType = personalization.length || body.lengthType || body.length || 'Standard';
  let minLength, maxLength;

  const norm = String(lengthType).toLowerCase();
  if (norm.includes('short')) {
    lengthType = 'Short';
    minLength = 40;
    maxLength = 65;
  } else if (norm.includes('detail') || norm.includes('long')) {
    lengthType = 'Detailed';
    minLength = 90;
    maxLength = 120;
  } else {
    // Standard (default) and anything else
    lengthType = 'Standard';
    minLength = 55;
    maxLength = 85;
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
