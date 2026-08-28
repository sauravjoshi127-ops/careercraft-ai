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
 * Detects cover-letter and resume-summary anti-patterns in generated email text.
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
 * Sanitize a single string field: strip HTML, decode entities, remove artifacts.
 * Used individually on greeting, each paragraph, cta, signOff, senderName, subject.
 */
function sanitizeField(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]{0,200}>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[object Object\]/gi, '')
    .replace(/\bundefined\b/g, '')
    .replace(/\bnull\b/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Sanitizes and normalizes a parsed variant, handling both old-format (body string)
 * and new structured format (greeting, paragraphs[], cta, signOff, senderName).
 */
function normalizeVariant(v, userName) {
  if (!v || typeof v !== 'object') return null;
  const clean = (s) => sanitizeField(String(s || ''));

  // Handle legacy flat-body format: parse structure out of the body string
  if (typeof v.body === 'string' && (!Array.isArray(v.paragraphs) || v.paragraphs.length === 0)) {
    const bodyClean = sanitizeField(v.body);
    const lines = bodyClean.split('\n').map(l => l.trim()).filter(Boolean);

    let greeting = '';
    let restLines = lines;
    if (lines.length > 0 && /^(hi|hello|dear)\b/i.test(lines[0])) {
      greeting = lines[0];
      restLines = lines.slice(1);
    }

    let signOff = 'Best,';
    let senderName = userName || '';
    const lastLine = restLines[restLines.length - 1] || '';
    const secondLastLine = restLines[restLines.length - 2] || '';
    const looksLikeName = /^[A-Z][a-z]+([\s-][A-Z][a-z]+)*$/.test(lastLine);
    const looksLikeSignOff = /^(best|warmly|regards|sincerely|cheers|thanks|all the best)[,.]?$/i.test(secondLastLine);

    if (looksLikeName && looksLikeSignOff) {
      senderName = lastLine;
      signOff = secondLastLine;
      restLines = restLines.slice(0, -2);
    } else if (looksLikeName) {
      senderName = lastLine;
      restLines = restLines.slice(0, -1);
    }

    let cta = '';
    if (restLines.length > 0 && restLines[restLines.length - 1].endsWith('?')) {
      cta = restLines[restLines.length - 1];
      restLines = restLines.slice(0, -1);
    }

    const paragraphs = restLines.filter(l => l.length > 0);
    const bodyResult = paragraphs.length > 0 ? paragraphs.join('\n\n') : bodyClean;
    return {
      tone: clean(v.tone) || 'Variant',
      subject: clean(v.subject),
      greeting: greeting || 'Hi there,',
      paragraphs: paragraphs.length > 0 ? paragraphs : [bodyClean],
      body: bodyResult,
      cta,
      signOff,
      senderName: senderName || userName || '',
      wordCount: paragraphs.join(' ').split(/\s+/).filter(Boolean).length || bodyClean.split(/\s+/).filter(Boolean).length,
      approach: clean(v.approach) || ''
    };
  }

  // New structured format
  const paragraphs = Array.isArray(v.paragraphs)
    ? v.paragraphs.map(p => clean(String(p || ''))).filter(Boolean)
    : [];

  const bodyResult = paragraphs.join('\n\n') || (typeof v.body === 'string' ? clean(v.body) : '');

  return {
    tone: clean(v.tone) || 'Variant',
    subject: clean(v.subject),
    greeting: clean(v.greeting) || 'Hi there,',
    paragraphs: paragraphs.length > 0 ? paragraphs : (bodyResult ? [bodyResult] : ['']),
    body: bodyResult,
    cta: clean(v.cta),
    signOff: clean(v.signOff) || 'Best,',
    senderName: clean(v.senderName) || userName || '',
    wordCount: v.wordCount || paragraphs.join(' ').split(/\s+/).filter(Boolean).length || bodyResult.split(/\s+/).filter(Boolean).length,
    approach: clean(v.approach) || ''
  };
}

/**
 * Sanitizes and normalizes a follow-up entry (structured or legacy flat format).
 */
function normalizeFollowUp(fu, userName) {
  if (!fu || typeof fu !== 'object') return null;
  const clean = (s) => sanitizeField(String(s || ''));

  if (typeof fu.body === 'string' && (!Array.isArray(fu.paragraphs) || fu.paragraphs.length === 0)) {
    return {
      index: fu.index || 1,
      timing: clean(fu.timing) || '',
      subject: clean(fu.subject),
      greeting: '',
      paragraphs: [clean(fu.body)],
      body: clean(fu.body),
      cta: '',
      signOff: 'Best,',
      senderName: userName || ''
    };
  }

  const paragraphs = Array.isArray(fu.paragraphs)
    ? fu.paragraphs.map(p => clean(String(p || ''))).filter(Boolean)
    : [];

  const bodyResult = paragraphs.join('\n\n') || (typeof fu.body === 'string' ? clean(fu.body) : '');

  return {
    index: fu.index || 1,
    timing: clean(fu.timing) || '',
    subject: clean(fu.subject),
    greeting: clean(fu.greeting) || '',
    paragraphs,
    body: bodyResult,
    cta: clean(fu.cta) || '',
    signOff: clean(fu.signOff) || 'Best,',
    senderName: clean(fu.senderName) || userName || ''
  };
}



/**
 * Validates the cold email generation output.
 * Supports new structured schema (paragraphs[]/cta) and legacy flat body string.
 */
function validateColdEmailOutput(data, minLength, maxLength) {
  if (!data || !Array.isArray(data.variants) || data.variants.length < 3) {
    console.warn('[cold-email] Validation failed: fewer than 3 variants returned.');
    return { isValid: false, reason: 'Fewer than 3 variants returned' };
  }

  const placeholderRegex = /\[[A-Za-z0-9\s_-]{2,}\]|<[A-Za-z0-9\s_-]{2,}>|\{your\s|your_placeholder/i;
  const resumeHeaderRegex = /^(education|skills|work experience|summary|languages|references|certifications)\s*:?\s*$/im;
  const debugRegex = /internal prompt|system prompt|gemini|llm|ai fallback/i;
  const htmlTagRegex = /<\/?[a-zA-Z][^>]{0,100}>/;

  for (let i = 0; i < data.variants.length; i++) {
    const v = data.variants[i];

    if (!v.subject || !v.tone) {
      console.warn(`[cold-email] Validation failed: variant ${i} missing subject or tone.`);
      return { isValid: false, reason: `Variant ${i} missing subject or tone` };
    }

    // Resolve body text for pattern checks: join structured fields
    const countableText = Array.isArray(v.paragraphs) && v.paragraphs.length > 0
      ? [...v.paragraphs, v.cta || ''].join(' ')
      : (v.body || '');

    const fullBodyText = Array.isArray(v.paragraphs) && v.paragraphs.length > 0
      ? [v.greeting || '', ...v.paragraphs, v.cta || '', v.signOff || '', v.senderName || ''].join(' ')
      : (v.body || '');

    if (!countableText.trim()) {
      console.warn(`[cold-email] Validation failed: variant ${i} has no body content.`);
      return { isValid: false, reason: `Variant ${i} has no body content` };
    }

    // Cover letter pattern detection
    const coverLetterPattern = detectCoverLetterPattern(fullBodyText);
    if (coverLetterPattern) {
      console.warn(`[cold-email] Validation failed: cover letter pattern "${coverLetterPattern}" in variant "${v.tone}".`);
      return { isValid: false, reason: `Output reads like a cover letter (pattern: "${coverLetterPattern}") in variant "${v.tone}"` };
    }

    // HTML tag leakage across all text fields
    const allFields = [v.subject, v.greeting, ...(v.paragraphs || [v.body || '']), v.cta || '', v.signOff || ''];
    for (const field of allFields) {
      if (field && htmlTagRegex.test(field)) {
        console.warn(`[cold-email] Validation failed: HTML tags in variant "${v.tone}".`);
        return { isValid: false, reason: `HTML tags in variant "${v.tone}"` };
      }
    }

    // Word count check — count body content (paragraphs + cta), not greeting/signature
    const words = countableText.trim().split(/\s+/).filter(Boolean).length;
    if (words < minLength || words > maxLength) {
      console.warn(`[cold-email] Validation failed: variant "${v.tone}" has ${words} words (range: ${minLength}–${maxLength}).`);
      return { isValid: false, reason: `Variant "${v.tone}" has ${words} words; required ${minLength}–${maxLength}.` };
    }

    // Resume header leakage
    if (resumeHeaderRegex.test(fullBodyText)) {
      console.warn(`[cold-email] Validation failed: resume section headers in variant "${v.tone}".`);
      return { isValid: false, reason: `Resume section headers in variant "${v.tone}"` };
    }

    // Placeholder tags
    if (placeholderRegex.test(fullBodyText) || placeholderRegex.test(v.subject)) {
      console.warn(`[cold-email] Validation failed: placeholder tags in variant "${v.tone}".`);
      return { isValid: false, reason: `Placeholder tags in variant "${v.tone}"` };
    }

    // Sentence completeness — last paragraph or CTA must end properly
    const lastContent = (v.cta || (Array.isArray(v.paragraphs) ? v.paragraphs[v.paragraphs.length - 1] : '') || '').trim();
    if (lastContent && !/[.?!'"\u2019\u201d]$/.test(lastContent)) {
      console.warn(`[cold-email] Validation failed: variant "${v.tone}" ends abruptly. Last: "${lastContent.slice(-40)}"`);
      return { isValid: false, reason: `Variant "${v.tone}" ends abruptly without complete sentence.` };
    }

    // Debug/internal leakage
    if (debugRegex.test(fullBodyText) || debugRegex.test(v.subject)) {
      console.warn(`[cold-email] Validation failed: internal prompt leakage in variant "${v.tone}".`);
      return { isValid: false, reason: 'Internal prompt leakage detected' };
    }

    // Markdown / code fences
    if (fullBodyText.includes('```')) {
      console.warn(`[cold-email] Validation failed: markdown fences in variant "${v.tone}".`);
      return { isValid: false, reason: `Markdown fences in variant "${v.tone}"` };
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
 * Returns STRUCTURED per-variant output: { greeting, paragraphs[], cta, signOff, senderName, wordCount }
 *
 * LENGTH SCHEME (per spec):
 *   Short    → 40–65 words
 *   Standard → 55–85 words  (default)
 *   Detailed → 90–120 words (absolute max: 125)
 *
 * VARIANTS: 4 strategically different approaches
 *   1. Context    — opens with specific company/role observation
 *   2. Question   — opens with a relevant question for the recipient
 *   3. Direct     — most stripped-down, decision-maker focused
 *   4. Curiosity  — advice-seeking, lowest pressure
 */
function buildGeneratePrompt(data) {
  const cleanWhy = cleanResumeInputs(data.whyContacting || '');
  const cleanBg = cleanResumeInputs(data.background || '');

  // Compress sender background to a single proof point if provided
  const proofPoint = cleanBg
    ? extractSingleProofPoint(
        cleanBg,
        `${data.companyName || ''} ${data.position || ''} ${data.emailGoal || ''} ${cleanWhy}`
      )
    : '';

  const greeting = data.recipientName ? `Hi ${data.recipientName},` : 'Hi there,';

  const recipientSection = [
    `Goal: ${data.emailGoal || 'Networking'}`,
    data.companyName    ? `Their company: ${data.companyName}`         : null,
    data.recipientName  ? `Recipient name: ${data.recipientName}`     : null,
    data.position       ? `Their role/title: ${data.position}`         : null,
    cleanWhy            ? `Context / reason for outreach: ${cleanWhy}` : null
  ].filter(Boolean).join('\n');

  const senderSection = [
    `Sender name: ${data.userName || ''}`,
    proofPoint ? `Proof point to reference: "${proofPoint}"` : null
  ].filter(Boolean).join('\n');

  const ctaGuide = {
    'Networking':      'Ask whether they\'d be open to a brief conversation.',
    'Job Opportunity': 'Ask if they\'d be open to a short call to discuss the team.',
    'Referral':        'Ask if they\'d be willing to make a referral or introduction.',
    'Internship':      'Ask if they\'d be open to discussing internship opportunities.',
    'Mentorship':      'Ask if they\'d have 20 minutes for a short conversation.',
    'Partnership':     'Ask whether there might be room to explore a collaboration.',
    'Info Request':    'Ask one specific question relevant to their work.',
    'Introduction':    'Ask whether a brief call would be welcome.'
  };
  const ctaInstruction = ctaGuide[data.emailGoal] || 'Ask whether they\'d be open to a brief conversation.';

  const proofRule = proofPoint
    ? '4. ONE PROOF POINT: Reference exactly ONE fact from the sender\'s proof point above. Do NOT list multiple achievements, skills, tools, companies, or credentials. Do NOT invent achievements or metrics.'
    : '4. CONCISE & RELEVANT: Keep the message concise and relevant to the recipient and company. Do NOT invent unverified claims or achievements for the sender.';

  return `You are an elite cold email writer. Write 4 first-touch professional cold email VARIANTS — NOT cover letters, NOT resume summaries, NOT applications.

CONTEXT:
${recipientSection}

SENDER (use ONLY this — never invent facts):
${senderSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT A COLD EMAIL IS vs. WHAT IT IS NOT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BAD (cover letter — NEVER write this):
"Hi Sarah, I am a software engineer with 5+ years of experience in distributed systems and infrastructure. My background includes leading teams at TechCorp, building real-time platforms, and extensive work with Kubernetes and AWS. I am passionate about engineering excellence and would love to contribute to Stripe's infrastructure team."

GOOD (cold email — write this):
"Hi Sarah, Stripe's focus on payment reliability is something I follow closely. I recently shipped a fraud-detection layer that cut false positives by 40% — curious whether that maps to anything on your radar. Would a short call be worth it?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES — VIOLATION = REJECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. WORD COUNT: ${data.minLength}–${data.maxLength} words total across paragraphs[] + cta only. Count carefully. Greeting and signature do not count.
2. STRUCTURE: 1–3 short paragraphs. No bullet lists. No section headers.
3. OPENING: First paragraph starts with the RECIPIENT'S world — their company, role, or specific context.
   NEVER start with sender's name, title, background, or credentials.
${proofRule}
5. ONE CTA: ${ctaInstruction} Exactly one ask. Natural and low-friction.
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
8. NO HTML: No <br>, <p>, <div>, or any tag. paragraphs[] must be plain text strings.
9. NO INVENTED FACTS: Do not invent company news, product names, funding events, team wins, mutual connections, or recipient interests.
10. SIGNATURE: signOff is always "Best," (use "Warmly," for Curiosity variant only). senderName is exactly "${data.userName}".
11. FIRST PERSON: Write from the sender's perspective (I, my). Never describe the sender in third-person.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIANT STRATEGIES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Variant 1 — Context: opens with a specific observation about the company, role, or industry. Then one proof point. Then soft CTA.
Variant 2 — Question: opens with a specific, relevant question showing understanding of the recipient's world. Then one proof point making the question credible. Then CTA.
Variant 3 — Direct: no preamble. Jump straight to the reason for contact. One proof point. One CTA. Shortest variant.
Variant 4 — Curiosity: genuine curiosity about recipient's work. One proof point making it credible. Low-pressure ask — their perspective, not a sales call.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT: Return ONLY valid JSON. No backticks, no markdown, no extra text.
Each variant MUST use this structure — paragraphs[] are plain text strings, no HTML.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "variants": [
    {
      "tone": "Context",
      "subject": "[specific subject line, under 8 words, about the company/role — not generic]",
      "greeting": "${greeting}",
      "paragraphs": [
        "[company/role observation — 1–2 sentences]",
        "[ONE proof point relevant to that observation — 1 sentence]"
      ],
      "cta": "[soft CTA — 1 sentence ending with ?]",
      "signOff": "Best,",
      "senderName": "${data.userName}",
      "wordCount": 0,
      "approach": "Company/role observation → one proof point → soft CTA"
    },
    {
      "tone": "Question",
      "subject": "[specific question-style subject, under 8 words]",
      "greeting": "${greeting}",
      "paragraphs": [
        "[specific relevant question — 1 sentence]",
        "[ONE proof point that makes the question credible — 1 sentence]"
      ],
      "cta": "[CTA — 1 sentence ending with ?]",
      "signOff": "Best,",
      "senderName": "${data.userName}",
      "wordCount": 0,
      "approach": "Specific question → one proof point → CTA"
    },
    {
      "tone": "Direct",
      "subject": "[direct subject, under 8 words]",
      "greeting": "${greeting}",
      "paragraphs": [
        "[direct reason for contact + ONE proof point — 1–2 sentences combined]"
      ],
      "cta": "[direct CTA — 1 sentence ending with ?]",
      "signOff": "Best,",
      "senderName": "${data.userName}",
      "wordCount": 0,
      "approach": "Most concise. Direct reason → one proof point → CTA"
    },
    {
      "tone": "Curiosity",
      "subject": "[curiosity subject, under 8 words]",
      "greeting": "${greeting}",
      "paragraphs": [
        "[genuine curiosity about recipient's work — 1 sentence]",
        "[ONE proof point that makes the curiosity credible — 1 sentence]"
      ],
      "cta": "[low-pressure ask — 1 sentence ending with ?]",
      "signOff": "Warmly,",
      "senderName": "${data.userName}",
      "wordCount": 0,
      "approach": "Curiosity about recipient → one proof point → low-pressure ask"
    }
  ],
  "subjectLines": [
    { "text": "[specific subject — direct, under 8 words]", "label": "Direct" },
    { "text": "[specific subject — question, under 8 words]", "label": "Question" },
    { "text": "[specific subject — context, under 8 words]", "label": "Context" },
    { "text": "[specific subject — curiosity, under 8 words]", "label": "Curiosity" }
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
      "subject": "[follow-up subject specific to context — not 'Following up' or 'Checking in']",
      "greeting": "${greeting}",
      "paragraphs": ["[New angle or thought — not 'just circling back'. Adds context, 30–50 words.]"],
      "cta": "[gentle follow-up ask — 1 sentence]",
      "signOff": "Best,",
      "senderName": "${data.userName}"
    },
    {
      "index": 2,
      "timing": "7–10 business days after follow-up 1",
      "subject": "[graceful close — specific to the context, not generic]",
      "greeting": "${greeting}",
      "paragraphs": ["[Respectful close. No pressure. Leaves door open. 25–40 words.]"],
      "cta": "",
      "signOff": "All the best,",
      "senderName": "${data.userName}"
    }
  ]
}`;
}

function buildRegenSubjectsPrompt(data) {
  const recipientDesc = [
    data.recipientName || null,
    data.position ? `(${data.position})` : null,
    data.companyName ? `at ${data.companyName}` : null
  ].filter(Boolean).join(' ') || (data.companyName ? `Team at ${data.companyName}` : 'Hiring Team');

  return `You are a high-converting cold outreach copywriter. Review the following email context and generate subject lines.

Email Goal: ${data.emailGoal || 'Networking'}
Recipient: ${recipientDesc}

Email Body (for context only — do not copy from it directly):
${data.emailBody || ''}

Generate exactly 4 fresh, specific subject lines. They must be genuinely different from each other.
Rules:
- Each must be specific to this recipient/company/goal — never generic like "Following up" or "Quick question"
- Under 8 words each
- Sound like a real person wrote it, not a marketer
- No exclamation marks
- No invented facts about the recipient or company
- Make each one take a different angle (direct, curiosity, question, value)

Return ONLY a valid JSON object — no backticks, no markdown, no extra text:
{
  "subjectLines": [
    { "text": "[subject text]", "label": "Direct" },
    { "text": "[subject text]", "label": "Curiosity" },
    { "text": "[subject text]", "label": "Question" },
    { "text": "[subject text]", "label": "Value" }
  ]
}`;
}

function buildOptimizePrompt(data) {
  const recipientDesc = [
    data.recipientName || 'the recipient',
    data.companyName ? `at ${data.companyName}` : '',
    data.position ? `(${data.position})` : ''
  ].filter(Boolean).join(' ');

  return `You are an elite cold email editor. Revise the following email body based on the user's specific instruction.

CURRENT EMAIL:
${data.emailBody || ''}

USER INSTRUCTION: "${data.feedback || ''}"

CONTEXT:
- Goal: ${data.emailGoal || 'Networking'}
- Recipient: ${recipientDesc}
- Sender name: ${data.userName || ''}

RULES:
1. Apply ONLY the change requested. Do not rewrite parts the instruction does not mention.
2. Preserve the sender's name, greeting, signature, and all verified facts.
3. Do NOT invent new facts, metrics, or claims not present in the original email.
4. Do NOT add generic filler, praise, or clichés.
5. Keep the email under 125 words unless the instruction explicitly asks for more detail.
6. Return clean plain text only — no HTML tags, no Markdown, no JSON wrapper tags.
7. Preserve paragraph structure with blank lines between paragraphs.
8. Never use third-person self-description. Write as the sender (I, my).

Return ONLY valid JSON — no backticks, no extra text:
{
  "revisedText": "The fully revised email body as plain text with \\n\\n between paragraphs...",
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
 * Spec-compliant fallback emails using the structured variant schema.
 */
function buildFallbackColdEmail(data) {
  const company = data.companyName || 'your organization';
  const recipientName = data.recipientName || '';
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,';
  const position = data.position || '';
  const sender = data.userName || '';
  const bg = data.background
    ? cleanResumeInputs(data.background).split('.')[0].trim()
    : null;
  const why = cleanResumeInputs(data.whyContacting || '');

  const contextLine = why ? why : `the work happening at ${company}`;
  const valueLine = bg
    ? bg
    : (position
        ? `a background relevant to ${position} and ${company}`
        : `a background relevant to ${company}`);

  const directSubject = position
    ? `${position} at ${company} — a question`
    : `${company} — a question`;

  const questionSubject = position
    ? `${position} at ${company}`
    : `a question regarding ${company}`;

  const variants = [
    {
      tone: 'Context',
      subject: `${company} — worth connecting?`,
      greeting,
      paragraphs: [
        // Use whyContacting text directly if it's a complete sentence; otherwise append tail
        why && /[.!?]$/.test(why.trim())
          ? why.trim()
          : `${contextLine} is something I've been following closely.`,
        `${valueLine}.`
      ],
      cta: 'Would you be open to a brief conversation?',
      signOff: 'Best,',
      senderName: sender,
      wordCount: 0,
      approach: 'Recipient/context-first. One sender fact. Soft CTA.'
    },
    {
      tone: 'Question',
      subject: `a thought on ${company}`,
      greeting,
      paragraphs: [
        why && /[.!?]$/.test(why.trim())
          ? why.trim()
          : `Is ${contextLine} a current priority for your team at ${company}?`,
        `${valueLine} — happy to share a concrete example if that's useful.`
      ],
      cta: 'Would a short exchange next week make sense?',
      signOff: 'Best,',
      senderName: sender,
      wordCount: 0,
      approach: 'Question-first. Value-focused.'
    },
    {
      tone: 'Direct',
      subject: directSubject,
      greeting,
      paragraphs: [
        `${valueLine} — and I think there may be a fit worth exploring at ${company}.`
      ],
      cta: 'Would you be the right person to speak with, or can you point me in the right direction?',
      signOff: 'Best,',
      senderName: sender,
      wordCount: 0,
      approach: 'Most concise. Direct reason → one proof point → CTA.'
    },
    {
      tone: 'Curiosity',
      subject: `curious about your work at ${company}`,
      greeting,
      paragraphs: [
        `The work your team is doing at ${company} caught my attention.`,
        `${valueLine}, and I'd genuinely value your perspective.`
      ],
      cta: 'Would you be open to a short conversation?',
      signOff: 'Warmly,',
      senderName: sender,
      wordCount: 0,
      approach: 'Curiosity-first. Advice-seeking, no hard ask.'
    }
  ].map(v => ({
    ...v,
    body: (v.paragraphs || []).join('\n\n')
  }));

  const subjectLines = [
    { text: `${company} — worth connecting?`, label: 'Direct' },
    { text: `a thought on ${company}`, label: 'Curiosity' },
    { text: questionSubject, label: 'Question' },
    { text: `your work at ${company}`, label: 'Context' }
  ];

  const followUps = [
    {
      index: 1,
      timing: '3–5 business days after initial email',
      subject: `one more thought — ${company}`,
      greeting,
      paragraphs: [`One additional thought since my last note: ${valueLine}. I think there's a genuine fit worth exploring.`],
      cta: 'Happy to keep it brief.',
      signOff: 'Best,',
      senderName: sender
    },
    {
      index: 2,
      timing: '7–10 business days after follow-up 1',
      subject: `closing the loop — ${company}`,
      greeting,
      paragraphs: [`I'll leave it here so I'm not filling your inbox. If the timing is ever right to connect, I'd welcome it.`],
      cta: '',
      signOff: 'All the best,',
      senderName: sender
    }
  ].map(fu => ({
    ...fu,
    body: (fu.paragraphs || []).join('\n\n')
  }));

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
    followUps,
    fallbackUsed: true
  };
}

function buildFallbackSubjects(data) {
  const company = data.companyName || 'your company';
  const position = data.position || '';
  return {
    subjectLines: [
      { text: `${company} — worth connecting?`, label: 'Direct' },
      { text: `a thought on ${company}`, label: 'Curiosity' },
      { text: position ? `${position} at ${company}` : `connecting with ${company}`, label: 'Value' },
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
    userContext.whyContacting || body.companyContext || body.context || body.valueProposition || ''
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
    emailGoal: emailGoal || 'Networking',
    recipientName: recipientName || '',
    companyName: companyName || '',
    position: position || '',
    userName: userName || '',
    background: background || '',
    whyContacting: whyContacting || '',
    length: lengthType,
    lengthType,
    minLength,
    maxLength,
    emailBody: String(body.emailBody || '').trim(),
    feedback: String(body.feedback || '').trim()
  };

  // ── Request validation ───────────────────────────────────────────────────
  // REQUIRED: sender name (userName), company name (companyName), purpose (emailGoal), background
  // OPTIONAL: recipient name, recipient role/title (position), context/details (whyContacting)
  if (action === 'generate') {
    const missingFields = [];
    if (!userName) missingFields.push('userName (sender name)');
    if (!companyName) missingFields.push('companyName (recipient company)');
    if (!emailGoal) missingFields.push('emailGoal (purpose)');
    if (!background) missingFields.push('background (background/value)');
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
        // Normalize all variants before validation
        if (parsed && Array.isArray(parsed.variants)) {
          parsed.variants = parsed.variants
            .map(v => normalizeVariant(v, dataFields.userName))
            .filter(Boolean);
          if (Array.isArray(parsed.followUps)) {
            parsed.followUps = parsed.followUps
              .map(fu => normalizeFollowUp(fu, dataFields.userName))
              .filter(Boolean);
          }
        }
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
      .map(v => `${v.subject} ${(v.paragraphs || []).join(' ')} ${v.cta || ''}`.toLowerCase())
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
