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
  if (!data || !Array.isArray(data.variants) || data.variants.length < 6) {
    console.warn('[cold-email validation] Failed: Missing or insufficient variants (expected 6).');
    return { isValid: false, reason: 'Missing or insufficient variants (expected 6)' };
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
  if (!data || !data.optimizedBody) {
    console.warn('[cold-email validation] Failed: Missing optimizedBody field.');
    return { isValid: false, reason: 'Missing optimizedBody field' };
  }
  
  const words = data.optimizedBody.trim().split(/\s+/).filter(Boolean).length;
  if (words < minLength || words > maxLength) {
    console.warn(`[cold-email validation] Failed: Optimized body has ${words} words, which is outside the range [${minLength}, ${maxLength}].`);
    return {
      isValid: false,
      reason: `Optimized body has ${words} words, which is outside the required range of ${minLength}-${maxLength} words.`
    };
  }
  
  const placeholderRegex = /\[[A-Za-z0-9\s_-]+\]|<[A-Za-z0-9\s_-]+>|{your\s|your_placeholder/i;
  if (placeholderRegex.test(data.optimizedBody)) {
    console.warn('[cold-email validation] Failed: Placeholders found in optimized body.');
    return { isValid: false, reason: 'Placeholder tags found in optimized body' };
  }
  
  if (data.optimizedBody.includes('```') || data.optimizedBody.includes('<html>')) {
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
  
  return `You are an elite B2B sales copywriter, outreach coach, and conversion optimizer. Generate a highly personalized cold email outreach package based on the following context.

Email Goal: ${data.emailGoal}

RECIPIENT DETAILS:
- Name: ${data.recipientName || 'not provided'}
- Company: ${data.companyName}
- Position: ${data.position}
- LinkedIn URL: ${data.linkedinUrl || 'not provided'}
- Company Website: ${data.website || 'not provided'}

USER CONTEXT (strictly use for custom value propositions, NEVER paste raw text or templates):
- Name: ${data.userName}
- Background: ${cleanBg}
- Key Skills: ${cleanSkills}
- Experience/Achievements: ${cleanExp}
- Reason for Contacting: ${cleanWhy}

Length Constraint: The body of each of the 6 generated email variants must contain between ${data.minLength} and ${data.maxLength} words. Never exceed or fall below this range.

CRITICAL INSTRUCTIONS FOR TARGET LENGTH:
Each of the 6 generated email bodies must strictly consist of a total word count between ${data.minLength} and ${data.maxLength} words.
${data.lengthType === 'Short' ? `
- This is a Short email (target 80-100 words).
- Best for recruiter outreach, busy hiring managers, and networking.
- Characteristics: Direct, high impact, one call-to-action (CTA), and zero unnecessary details.
` : data.lengthType === 'Medium' ? `
- This is a Medium email (target 120-170 words).
- Best for standard cold outreach.
- Characteristics: Brief introduction, strong value proposition, one key achievement, and one CTA.
` : data.lengthType === 'Long' ? `
- This is a Long email (target 180-250 words).
- Best for senior professionals and executive outreach.
- Characteristics: Detailed introduction, more personalization, two key achievements, a strong narrative, and clear motivation.
` : `
- This is a Custom length email (target ${data.minLength}-${data.maxLength} words).
- Adjust narrative depth, personalization, achievements, and detail to fit within this range without adding filler content or leaving incomplete thoughts.
`}
Ensure each sentence is complete and natural, while strictly adhering to this length range.


QUALITY STANDARDS & LEAKAGE PREVENTION:
1. The generated email must NEVER include raw resume sections (like "Education", "Skills", "Languages", "Certifications"), contact details (emails, phones), markdown fences, HTML code, internal prompts, or AI fallback messages.
2. Use the user's background and skills strictly as context to weave a natural conversation. Convert achievements into natural language (e.g. "I helped optimize..." instead of bullet points).
3. Write human-like, conversational copy. Avoid clichés like "I hope this finds you well", "My name is...", "I am writing to you because", "I'm a seasoned developer", etc.
4. CTAs must be low-friction and direct (e.g. "Open to learning more?", "Worth a 2-minute look?", "Do you have 5 minutes next Tuesday?").
5. No placeholder text like "[Recipient Name]" or "[Your Name]" inside the final bodies - generate real text using the provided details. If recipient name is not provided, use a professional greeting like "Hi there" or "Hi ${data.companyName} Team".

OUTPUT SCHEMA:
Return ONLY a valid JSON object matching the schema below. No explanation, no backticks, no code block wrapper.

{
  "variants": [
    {
      "tone": "Professional",
      "subject": "quick question about [topic]",
      "body": "Hi [Name],\\n\\n[Body text...]",
      "approach": "PAS: Problem, Agitate, Solution framework. Warm and professional."
    },
    {
      "tone": "Friendly",
      "subject": "hello from a fellow [industry] enthusiast",
      "body": "Hi [Name],\\n\\n[Body text...]",
      "approach": "AIDA: Attention, Interest, Desire, Action. warm, peer-to-peer and approachable."
    },
    {
      "tone": "Executive",
      "subject": "optimizing [companyName]'s [system]",
      "body": "Hi [Name],\\n\\n[Body text...]",
      "approach": "High-level strategic focus. Direct value-driven proposition aimed at decision makers."
    },
    {
      "tone": "Startup",
      "subject": "building [product/system] at [companyName]",
      "body": "Hi [Name],\\n\\n[Body text...]",
      "approach": "Fast-paced, pattern-interrupt, startup-friendly language. Focus on growth and innovation."
    },
    {
      "tone": "Technical",
      "subject": "developer question regarding [technology/framework]",
      "body": "Hi [Name],\\n\\n[Body text...]",
      "approach": "Deep detail, specific tech stacks, peer-level engineering focus. No fluff."
    },
    {
      "tone": "Networking",
      "subject": "connecting with [companyName]'s team",
      "body": "Hi [Name],\\n\\n[Body text...]",
      "approach": "Relation-building, career interest, advice-seeking. Warm and low pressure."
    }
  ],
  "subjectLines": [
    { "text": "[subject text]", "label": "Conservative", "openRate": "72%" },
    { "text": "[subject text]", "label": "Curiosity", "openRate": "84%" },
    { "text": "[subject text]", "label": "Executive", "openRate": "78%" },
    { "text": "[subject text]", "label": "Friendly", "openRate": "75%" },
    { "text": "[subject text]", "label": "High Open Rate", "openRate": "92%" }
  ],
  "evaluation": {
    "overallScore": 88,
    "personalizationScore": 92,
    "openRatePrediction": 85,
    "recruiterEngagementScore": 90,
    "professionalToneScore": 95,
    "spamRiskScore": 12,
    "grammarScore": 98,
    "clarityScore": 90,
    "strengths": ["list strength 1", "list strength 2"],
    "weaknesses": ["list weakness 1"],
    "suggestions": ["suggestion 1", "suggestion 2"]
  },
  "suggestions": [
    {
      "id": "s1",
      "explanation": "Reference their recent open source work in the introduction for better personalization.",
      "originalText": "I saw your company online.",
      "suggestedText": "I've been following your open-source projects on GitHub, especially your recent work on high-speed API gateways."
    }
  ],
  "spamScore": 15,
  "spamRecommendations": [
    "Ensure subject line stays under 5 words to prevent spam filters.",
    "Ensure no spam triggers like 'guaranteed' or 'free' are used in followups."
  ],
  "followUp": "Hi [Name],\\n\\nJust circling back on this... [Value-first bump sequence]\\n\\nBest,\\n[UserName]",
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
Recipient: ${data.recipientName || 'Hi there'} at ${data.companyName} (${data.position})
User Context:
- Name: ${data.userName}
- Background: ${data.background}
- Why Contacting: ${data.whyContacting}

RULES:
1. Revise the email to improve grammar, length, flow, tone, and CTA strength based on the instructions.
2. The optimized email body must strictly contain between ${data.minLength} and ${data.maxLength} words. Never exceed or fall below this range.
   - If the current email is too long: Condense repetitive sentences while preserving meaning.
   - If the current email is too short: Expand with relevant achievements or personalization. Never pad with filler text.
3. Keep it punchy and mobile-friendly.
4. Re-evaluate the optimized email, returning updated metrics (Overall Score, Strengths, Weaknesses, Suggestions).

Return ONLY valid JSON in this exact format (no markdown code blocks, no backticks, no other text):
{
  "optimizedBody": "optimized email body...",
  "evaluation": {
    "overallScore": 92,
    "personalizationScore": 90,
    "openRatePrediction": 88,
    "recruiterEngagementScore": 95,
    "professionalToneScore": 90,
    "spamRiskScore": 5,
    "grammarScore": 98,
    "clarityScore": 95,
    "strengths": ["strength 1"],
    "weaknesses": ["weakness 1"],
    "suggestions": ["suggestion 1"]
  },
  "suggestions": [
    {
      "id": "s1",
      "explanation": "Add clear call to action.",
      "originalText": "Let me know.",
      "suggestedText": "Are you open to a brief 2-minute look?"
    }
  ],
  "spamScore": 8,
  "spamRecommendations": []
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
      overallScore: 85,
      personalizationScore: 88,
      openRatePrediction: 82,
      recruiterEngagementScore: 85,
      professionalToneScore: 90,
      spamRiskScore: 10,
      grammarScore: 99,
      clarityScore: 95,
      strengths: ["Clean template-based structure", "Clear, low-friction calls to action", "No spam trigger words"],
      weaknesses: ["Requires further customization to match specific company research"],
      suggestions: ["Add a specific detail about a recent product release of theirs", "Mention a common contact or group if applicable"]
    },
    suggestions: [
      {
        "id": "fs1",
        "explanation": "Include a link to your portfolio or relevant project to show proof of work.",
        "originalText": `specialize in ${skills}`,
        "suggestedText": `specialize in ${skills} (which you can check out on my portfolio)`
      }
    ],
    spamScore: 10,
    spamRecommendations: [
      "Keep copy concise and double check that emails are not sent on weekends for best placement."
    ],
    followUp: `${greeting}\n\nJust circling back on this. I know you're busy, but if you're open to it, I can share a short outline of how I might help with ${why}.\n\nLet me know if that's worth a look.\n\nBest,\n${sender}`,
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
  return {
    optimizedBody: data.emailBody + '\n\n(Optimized for clarity and brevity - AI fallback applied)',
    evaluation: {
      overallScore: 85,
      personalizationScore: 80,
      openRatePrediction: 82,
      recruiterEngagementScore: 85,
      professionalToneScore: 90,
      spamRiskScore: 8,
      grammarScore: 98,
      clarityScore: 92,
      strengths: ["Improved readability", "Direct call-to-action"],
      weaknesses: ["Standardized formatting"],
      suggestions: ["Try editing context fields further"]
    },
    suggestions: [],
    spamScore: 8,
    spamRecommendations: [],
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

  let lengthType = body.lengthType || body.length || 'Medium';
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
          validationErrorMsg = 'service_error';
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
    console.warn('[cold-email] Quality validation failed or retries exhausted. Applying local template fallbacks.');
    let fallback;
    if (action === 'generate') fallback = buildFallbackColdEmail(dataFields, `Validation failure: ${validationErrorMsg}`);
    else if (action === 'regenerate-subjects') fallback = buildFallbackSubjects(dataFields, `Validation failure: ${validationErrorMsg}`);
    else fallback = buildFallbackOptimize(dataFields, `Validation failure: ${validationErrorMsg}`);
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
