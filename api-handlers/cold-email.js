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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OUTREACH TYPE ENGINE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const OUTREACH_TYPES = {
  'Internship': {
    category: 'career',
    openingStrategy: 'Express interest in the specific practice area / team / role. Reference what draws you to this organization specifically.',
    valueFrame: 'Focus on relevant preparation, coursework, or prior experience that demonstrates genuine readiness. Do NOT list credentials — show one relevant signal.',
    ctaTemplate: 'Ask whether the team is considering interns for the relevant period or whether a brief conversation would be possible.',
    ctaExamples: [
      'Would you be open to letting me know whether your team is considering interns this summer?',
      'Would a brief conversation about internship opportunities make sense?',
      'Would you be the right person to reach out to about summer internships?'
    ],
    toneGuidance: 'Respectful, enthusiastic but measured. Not overly formal. Show genuine interest without desperation.',
    relevanceRanking: 'Relevant internship > relevant coursework/project > relevant moot/competition > academic standing > general background'
  },
  'Job Opportunity': {
    category: 'career',
    openingStrategy: 'Reference the specific role, team, or company initiative that prompted outreach. Show you understand what they do.',
    valueFrame: 'One concrete achievement or experience directly relevant to the role. Quantify if possible. Show fit, not resume.',
    ctaTemplate: 'Ask whether a short call to discuss the team or role would be worth their time.',
    ctaExamples: [
      'Would a short call to discuss the team be worth your time?',
      'Would you be open to a brief conversation about the role?',
      'Is this something worth exploring further over a quick call?'
    ],
    toneGuidance: 'Confident and professional. Peer-to-peer if experience level warrants it. Not supplicant.',
    relevanceRanking: 'Directly relevant experience > relevant achievement with metrics > industry experience > transferable skill > general background'
  },
  'Networking': {
    category: 'relationship',
    openingStrategy: 'Reference a shared interest, mutual connection, or specific aspect of their work that genuinely interests you.',
    valueFrame: 'Briefly establish credibility — why this conversation would be mutually interesting, not one-sided.',
    ctaTemplate: 'Ask whether they would be open to a brief conversation or coffee chat.',
    ctaExamples: [
      'Would you be open to a brief conversation sometime?',
      'Would a 15-minute call be welcome?',
      'Would you have time for a quick coffee chat?'
    ],
    toneGuidance: 'Warm, genuine, low-pressure. This is not a job application. It is a human connection request.',
    relevanceRanking: 'Shared context > mutual connection > relevant overlapping interest > sender credibility > general intro'
  },
  'Referral': {
    category: 'relationship',
    openingStrategy: 'Establish context — why you are reaching out to this specific person for a referral. Reference shared connection or prior interaction if available.',
    valueFrame: 'Make the referral easy — be specific about what you are looking for and who would be the right contact.',
    ctaTemplate: 'Ask if they could point you toward the right person or make a brief introduction.',
    ctaExamples: [
      'Would you be able to point me toward the appropriate person to contact?',
      'Would you be comfortable making a brief introduction?',
      'Could you let me know who would be the right person to reach out to?'
    ],
    toneGuidance: 'Respectful, specific, and low-burden. Make the ask easy to fulfill. Do not stack multiple requests.',
    relevanceRanking: 'Mutual connection > prior interaction > shared context > sender credibility'
  },
  'Mentorship': {
    category: 'relationship',
    openingStrategy: 'Reference something specific about their career or expertise that you admire or want to learn from.',
    valueFrame: 'Show that you have done your homework. Demonstrate genuine interest in their perspective, not just general mentorship.',
    ctaTemplate: 'Ask if they would have 15-20 minutes for a conversation.',
    ctaExamples: [
      'Would you have 20 minutes for a short conversation?',
      'Would you be open to sharing your perspective over a brief call?',
      'Would a short conversation sometime be welcome?'
    ],
    toneGuidance: 'Warm, respectful, humble without being self-deprecating. Show you value their time.',
    relevanceRanking: 'Specific admiration point > shared background > relevant interest > general respect'
  },
  'Partnership': {
    category: 'business',
    openingStrategy: 'Lead with a specific observation about their business or a problem you can help solve. Not generic praise.',
    valueFrame: 'Focus on mutual benefit. What specific outcome could this partnership produce? One concrete point.',
    ctaTemplate: 'Ask whether exploring a collaboration would be worth a brief call.',
    ctaExamples: [
      'Would it be worth exploring this over a brief call?',
      'Would there be room to explore a collaboration?',
      'Would a short conversation to compare notes make sense?'
    ],
    toneGuidance: 'Professional, outcome-oriented, peer-to-peer. No hard sell.',
    relevanceRanking: 'Mutual benefit > complementary capability > shared market > relevant proof point'
  },
  'Info Request': {
    category: 'relationship',
    openingStrategy: 'Be specific about what information you need and why this person is uniquely positioned to help.',
    valueFrame: 'Show you have done preliminary research. You are not asking them to do your work — you have a specific gap.',
    ctaTemplate: 'Ask one specific question or whether they would share a perspective.',
    ctaExamples: [
      'Would you be open to sharing a quick perspective on this?',
      'Could I ask you one specific question about your experience with this?',
      'Would you have a moment to point me in the right direction?'
    ],
    toneGuidance: 'Respectful, specific, grateful. Low time commitment. Make the ask precise.',
    relevanceRanking: 'Specific question > relevant context > sender credibility'
  },
  'Research': {
    category: 'academic',
    openingStrategy: 'Reference their specific research, publication, or academic work. Show genuine intellectual engagement.',
    valueFrame: 'Establish relevant academic context — your research area, methodology, or specific question that intersects with theirs.',
    ctaTemplate: 'Ask whether they would be open to discussing research alignment or collaboration.',
    ctaExamples: [
      'Would you be open to a brief conversation about potential research alignment?',
      'Would a short call to discuss this intersection be worth your time?',
      'Would you be open to sharing your perspective on this approach?'
    ],
    toneGuidance: 'Academic but accessible. Intellectually engaged. Not overly formal or stiff.',
    relevanceRanking: 'Research overlap > publication relevance > methodological alignment > academic credibility'
  },
  'Sales': {
    category: 'business',
    openingStrategy: 'Lead with the recipient\'s problem or a specific observation about their business. NOT your product.',
    valueFrame: 'Focus entirely on the outcome for the recipient. One specific result your product/service delivers. Proof point if available.',
    ctaTemplate: 'Ask whether a short call to compare notes or explore fit would be useful.',
    ctaExamples: [
      'Would it be useful to compare notes for 15 minutes?',
      'Would a quick call to see if there is a fit make sense?',
      'Would you be open to seeing how this could work for your team?'
    ],
    toneGuidance: 'Problem-focused, outcome-oriented. No hype, no urgency, no manipulative language. Consultative, not salesy.',
    relevanceRanking: 'Recipient problem > specific outcome > proof/case study > general capability'
  },
  'Introduction': {
    category: 'relationship',
    openingStrategy: 'Brief, clear reason for reaching out. Establish who you are and why this introduction matters.',
    valueFrame: 'One sentence establishing your relevance or shared context. Keep it light.',
    ctaTemplate: 'Ask whether a brief call or continued conversation would be welcome.',
    ctaExamples: [
      'Would a brief introduction call be welcome?',
      'Would you be open to connecting?',
      'Would a short conversation make sense?'
    ],
    toneGuidance: 'Warm, concise, professional. This is a door-opener, not a pitch.',
    relevanceRanking: 'Shared connection > shared context > sender credibility > general interest'
  }
};

const DEFAULT_OUTREACH = OUTREACH_TYPES['Networking'];

function getOutreachType(emailGoal) {
  return OUTREACH_TYPES[emailGoal] || DEFAULT_OUTREACH;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INDUSTRY / PERSONA DETECTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectIndustryPersona(background, position, companyName, emailGoal) {
  const text = `${background || ''} ${position || ''} ${companyName || ''} ${emailGoal || ''}`.toLowerCase();

  if (text.match(/\b(law|legal|advocate|litigation|corporate law|moot|bar council|llb|ll\.b|llm|firm partner|solicitor|barrister|attorney|paralegal|counsel|arbitration|bench|judiciary|practice area)\b/)) {
    return { domain: 'Law', register: 'Formal, precise, and respectful. Use legal-professional conventions.', credibilitySignals: 'Practice area, relevant internship at a recognized firm, moot achievements, relevant coursework, bar enrollment', subjectStyle: 'Formal. "Internship enquiry — [Practice Area]" or "[Practice Area] — internship at [Firm]"' };
  }
  if (text.match(/\b(professor|phd|thesis|research|publication|journal|conference paper|academic|university faculty|postdoc|dissertation|peer.?review|lab|methodology)\b/)) {
    return { domain: 'Academic', register: 'Intellectually engaged, specific, respectful. Reference research areas precisely.', credibilitySignals: 'Research area, publications, methodology, relevant coursework, academic institution', subjectStyle: 'Specific. "Research alignment — [topic]" or "Question about your work on [topic]"' };
  }
  if (text.match(/\b(software|engineer|developer|frontend|backend|fullstack|devops|cloud|api|infrastructure|architect|deploy|kubernetes|aws|azure|saas|platform|cto|vp.?engineering|tech lead)\b/)) {
    return { domain: 'Technology', register: 'Clear, direct, technically credible. Avoid buzzwords. Show you build things.', credibilitySignals: 'Specific projects shipped, scale achieved, technical decisions made, measurable impact', subjectStyle: 'Direct and specific. "[Role] at [Company] — a question" or "Re: [specific technical area]"' };
  }
  if (text.match(/\b(sales|revenue|pipeline|quota|account executive|sdrs?|bdr|business development|closing|deals|prospects|crm|outbound)\b/)) {
    return { domain: 'Sales', register: 'Problem/outcome oriented. No hype. Consultative tone. Focus on recipient problem.', credibilitySignals: 'Specific outcomes delivered, metrics, case studies, industry experience', subjectStyle: 'Benefit-oriented. "Reducing [problem] at [Company]" or "[Outcome] for [Company]"' };
  }
  if (text.match(/\b(finance|banking|investment|analyst|portfolio|equity|fund|trading|cfo|controller|accounting|audit|compliance|risk management)\b/)) {
    return { domain: 'Finance', register: 'Precise, credible, formal. Numbers and results matter.', credibilitySignals: 'Relevant deal experience, analysis capability, certifications (CFA, CA), institutional background', subjectStyle: 'Professional. "[Role] opportunity — [area]" or "Connecting regarding [specific area]"' };
  }
  if (text.match(/\b(product|pm|product manager|roadmap|user research|a\/b test|feature|sprint|agile|scrum)\b/)) {
    return { domain: 'Product', register: 'Clear, user-focused, outcome-driven. Show product thinking.', credibilitySignals: 'Products shipped, metrics improved, user outcomes, strategic decisions', subjectStyle: 'Outcome-focused. "[Product area] at [Company]" or "Question about [product area]"' };
  }
  if (text.match(/\b(design|ux|ui|creative|visual|graphic|figma|user experience|interaction|typography|brand)\b/)) {
    return { domain: 'Design', register: 'Clean, visual-thinking, user-centered. Show craft and taste.', credibilitySignals: 'Portfolio highlights, design systems built, user research conducted, brands worked with', subjectStyle: 'Clean. "Design at [Company] — a question" or "[Design area] — connecting"' };
  }
  return { domain: 'General', register: 'Professional, clear, and natural. Adapt to the context provided.', credibilitySignals: 'Most relevant achievement, institutional background, domain expertise', subjectStyle: 'Clear and specific. Avoid generic subjects.' };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SENDER PROFILE NORMALIZATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function cleanResumeInputs(text) {
  if (!text) return '';
  let cleaned = text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    .replace(/\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, '')
    .replace(/github\.com\/[a-zA-Z0-9_-]+/gi, '')
    .replace(/linkedin\.com\/in\/[a-zA-Z0-9_-]+/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(phone|email|address|contact|portfolio|github|linkedin)\b\s*:?/gi, '');
  const headers = ['education', 'experience', 'work experience', 'skills', 'key skills', 'summary', 'professional summary', 'objective', 'projects', 'languages', 'certifications', 'hobbies', 'interests', 'references'];
  headers.forEach(h => {
    const regex = new RegExp(`(^|\\n)\\s*(\\*\\*|__)?${h}(\\*\\*|__)?\\s*($|\\n|:)`, 'gi');
    cleaned = cleaned.replace(regex, '$1');
  });
  return cleaned.trim();
}

function splitIntoSentences(text) {
  if (!text) return [];
  return text.replace(/([.!?])\s+/g, '$1\x00').split('\x00').map(s => s.trim()).filter(Boolean);
}

function normalizeSenderProfile(background, senderName) {
  if (!background) return { facts: [], summary: '' };
  const cleaned = cleanResumeInputs(background);
  const sentences = splitIntoSentences(cleaned);
  const cleanSentences = sentences.filter(s => s.length >= 15 && s.length <= 300 && !detectTruncatedSentence(s));
  const summary = cleanSentences.length > 0 ? cleanSentences.slice(0, 3).join(' ').trim() : cleaned;
  return { facts: [], summary };
}

function extractSingleProofPoint(background, context) {
  if (!background) return '';
  const clean = cleanResumeInputs(background);
  const sentences = splitIntoSentences(clean).filter(s => {
    if (s.length < 15 || s.length > 300) return false;
    if (detectTruncatedSentence(s)) return false;
    return true;
  });
  if (sentences.length === 0) return '';
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PERSONALIZATION HIERARCHY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function classifyPersonalization(data) {
  const { recipientName, companyName, position, whyContacting, background } = data;
  const specificIndicators = /\b(recently|announced|published|launched|expanded|acquired|raised|series [a-d]|funding|article|paper|talk|conference|project|initiative|your .* on|your .* about|saw your|read your|your work on|mentioned|introduced)\b/i;
  if (whyContacting && specificIndicators.test(whyContacting)) {
    return { level: 1, label: 'Specific', instruction: 'Use the specific context provided. Reference this naturally — one precise detail is more effective than three vague ones.', fabricationGuard: 'ONLY use the specific fact provided in the context. Do NOT embellish or add details beyond what was supplied.' };
  }
  if (companyName && (position || recipientName)) {
    return { level: 2, label: 'Contextual', instruction: 'Use the company and role context to frame relevance. Do not pretend to know specific company news or recipient details that were not provided.', fabricationGuard: 'Do NOT fabricate company news, product names, funding events, or team specifics.' };
  }
  if (background && companyName) {
    return { level: 3, label: 'Profile-based', instruction: 'Focus on sender-side relevance to the recipient organization.', fabricationGuard: 'Do NOT invent reciprocal interest from the recipient. Do NOT fabricate "I\'ve been following your work" or similar.' };
  }
  return { level: 4, label: 'Minimal', instruction: 'Write a strong, concise outreach email without pretending familiarity. Directness and clarity replace personalization when context is thin.', fabricationGuard: 'Do NOT fabricate ANY personalization. No "I\'ve always admired...", no "Your company\'s reputation for...", no "I was impressed by...".' };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TRUNCATION & PATTERN DETECTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectTruncatedSentence(text) {
  if (!text) return null;
  if (/\b(?:[A-Z]\.|LL\.)(?:\s|$)/.test(text)) return 'truncated degree abbreviation';
  if (/\(Hons\.?\s*$/.test(text)) return 'truncated Hons fragment';
  if (/\(Hons\.(?!\))/.test(text)) return 'unclosed Hons parenthesis';
  if (/(?:\(Hons\.|pursuing|experience in|at)\s*$/i.test(text)) return 'abrupt ending fragment';
  const openParen = (text.match(/\(/g) || []).length;
  const closeParen = (text.match(/\)/g) || []).length;
  if (openParen > closeParen) return 'unclosed parenthesis';
  if (/\b(undefined|null)\b/i.test(text)) return 'literal undefined/null';
  if (/\[(?:Your|Recipient|Company|Name|Role|Title|Position|Sender|First Name|Last Name)[^\]]*\]/i.test(text)) return 'unfilled placeholder bracket';
  return null;
}

function detectCoverLetterPattern(body) {
  if (!body) return null;
  const tests = [
    { re: /\bi am (?:a |an )[a-z]+ (?:professional|engineer|developer|specialist|expert|manager|graduate|student)/i, label: 'self-intro job title' },
    { re: /my background includes/i, label: 'resume summary opener' },
    { re: /i have \d+[\+]? years? of experience/i, label: 'experience summary' },
    { re: /i am writing to (?:apply|express|inquire|inform)/i, label: 'application language' },
    { re: /i am passionate about/i, label: 'passion filler' },
    { re: /(?:my|key)? skills include/i, label: 'skills list' },
    { re: /my experience (?:in|with|includes)/i, label: 'experience dump' },
    { re: /i possess (?:strong|extensive|excellent)/i, label: 'generic self-praise' },
    { re: /enclosed (?:is|please find)/i, label: 'cover letter boilerplate' },
    { re: /i would (?:love|like) to (?:join|contribute|be part of)/i, label: 'application phrasing' },
    { re: /throughout my career/i, label: 'career narrative' },
    { re: /(?:over|during) the (?:past|last) \d+ years/i, label: 'career timeline' },
    { re: /as you can see from my resume/i, label: 'resume reference' },
    { re: /(?:proficient|expertise|extensive knowledge) in/i, label: 'skills catalogue' },
    { re: /i am (?:confident|certain|sure) that/i, label: 'confidence boilerplate' },
    { re: /thank you for (?:considering|taking the time)/i, label: 'closing boilerplate' },
  ];
  for (const { re, label } of tests) {
    if (re.test(body)) return label;
  }
  return null;
}

function detectFabricatedPersonalization(body, personalizationLevel) {
  if (!body) return null;
  if (personalizationLevel <= 1) return null;
  const patterns = [
    { re: /i'?ve been following your work/i, label: 'fabricated following' },
    { re: /i was (?:particularly |deeply |greatly )?impressed by your (?:recent )?work/i, label: 'fabricated impression' },
    { re: /i'?ve always admired your (?:organization|company|firm|team|work)/i, label: 'fabricated admiration' },
    { re: /your (?:incredible|remarkable|outstanding|exceptional|impressive) (?:work|achievement|accomplishment|contribution)/i, label: 'generic praise' },
    { re: /i'?ve been (?:closely |eagerly )?following (?:your|the) (?:company|organization|firm|team)/i, label: 'fabricated company following' },
    { re: /your reputation for (?:excellence|innovation|quality)/i, label: 'reputation flattery' },
  ];
  for (const { re, label } of patterns) {
    if (re.test(body)) return label;
  }
  return null;
}

function detectMultipleCTAs(body) {
  if (!body) return false;
  const ctaPatterns = /\b(?:would you|can you|could you|are you|do you|will you|might you|shall we|should we)\b[^.!]*\?/gi;
  const matches = body.match(ctaPatterns);
  return matches && matches.length > 1;
}

function detectSenderInBody(body, senderName) {
  if (!body || !senderName) return false;
  const fullName = senderName.toLowerCase();
  const bodyLower = body.toLowerCase();
  if (bodyLower.includes(fullName)) return true;
  const senderParts = fullName.split(/\s+/);
  if (senderParts.length >= 2) {
    const firstName = senderParts[0];
    const lastName = senderParts[senderParts.length - 1];
    const words = bodyLower.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      if (words[i].includes(firstName)) {
        for (let j = Math.max(0, i - 5); j < Math.min(words.length, i + 5); j++) {
          if (i !== j && words[j].includes(lastName)) return true;
        }
      }
    }
  }
  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SANITIZATION & NORMALIZATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function sanitizeField(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n\n').replace(/<\/p>/gi, '\n').replace(/<p[^>]*>/gi, '').replace(/<[^>]{0,200}>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1').replace(/```[\s\S]*?```/g, '')
    .replace(/\[object Object\]/gi, '').replace(/\bundefined\b/g, '').replace(/\bnull\b/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function guardGreeting(greeting, senderName, recipientName) {
  if (!greeting) return recipientName ? `Hi ${recipientName},` : 'Hi there,';
  if (senderName && greeting.toLowerCase().includes(senderName.toLowerCase())) {
    return recipientName ? `Hi ${recipientName},` : 'Hi there,';
  }
  return greeting;
}

function normalizeVariant(v, userName, recipientName) {
  if (!v || typeof v !== 'object') return null;
  const clean = (s) => sanitizeField(String(s || ''));

  if (typeof v.body === 'string' && (!Array.isArray(v.paragraphs) || v.paragraphs.length === 0)) {
    const bodyClean = sanitizeField(v.body);
    const lines = bodyClean.split('\n').map(l => l.trim()).filter(Boolean);
    let greeting = '', restLines = lines;
    if (lines.length > 0 && /^(hi|hello|dear)\b/i.test(lines[0])) { greeting = lines[0]; restLines = lines.slice(1); }
    let signOff = 'Best,', senderName = userName || '';
    const lastLine = restLines[restLines.length - 1] || '', secondLastLine = restLines[restLines.length - 2] || '';
    const looksLikeName = /^[A-Z][a-z]+([\s-][A-Z][a-z]+)*$/.test(lastLine);
    const looksLikeSignOff = /^(best|warmly|regards|sincerely|cheers|thanks|all the best)[,.]?$/i.test(secondLastLine);
    if (looksLikeName && looksLikeSignOff) { senderName = lastLine; signOff = secondLastLine; restLines = restLines.slice(0, -2); }
    else if (looksLikeName) { senderName = lastLine; restLines = restLines.slice(0, -1); }
    let cta = '';
    if (restLines.length > 0 && restLines[restLines.length - 1].endsWith('?')) { cta = restLines[restLines.length - 1]; restLines = restLines.slice(0, -1); }
    const paragraphs = restLines.filter(l => l.length > 0);
    const bodyResult = paragraphs.length > 0 ? paragraphs.join('\n\n') : bodyClean;
    const safeGreeting = guardGreeting(greeting || 'Hi there,', userName, recipientName);
    return { tone: clean(v.tone) || 'Variant', subject: clean(v.subject), greeting: safeGreeting, paragraphs: paragraphs.length > 0 ? paragraphs : [bodyClean], body: bodyResult, cta, signOff, senderName: userName || senderName || '', wordCount: paragraphs.join(' ').split(/\s+/).filter(Boolean).length || bodyClean.split(/\s+/).filter(Boolean).length, approach: clean(v.approach) || '' };
  }

  const paragraphs = Array.isArray(v.paragraphs) ? v.paragraphs.map(p => clean(String(p || ''))).filter(Boolean) : [];
  const bodyResult = paragraphs.join('\n\n') || (typeof v.body === 'string' ? clean(v.body) : '');
  const safeGreeting = guardGreeting(clean(v.greeting) || 'Hi there,', userName, recipientName);
  return { tone: clean(v.tone) || 'Variant', subject: clean(v.subject), greeting: safeGreeting, paragraphs: paragraphs.length > 0 ? paragraphs : (bodyResult ? [bodyResult] : ['']), body: bodyResult, cta: clean(v.cta), signOff: clean(v.signOff) || 'Best,', senderName: userName || clean(v.senderName) || '', wordCount: v.wordCount || paragraphs.join(' ').split(/\s+/).filter(Boolean).length || bodyResult.split(/\s+/).filter(Boolean).length, approach: clean(v.approach) || '' };
}

function normalizeFollowUp(fu, userName) {
  if (!fu || typeof fu !== 'object') return null;
  const clean = (s) => sanitizeField(String(s || ''));
  if (typeof fu.body === 'string' && (!Array.isArray(fu.paragraphs) || fu.paragraphs.length === 0)) {
    return { index: fu.index || 1, timing: clean(fu.timing) || '', subject: clean(fu.subject), greeting: '', paragraphs: [clean(fu.body)], body: clean(fu.body), cta: '', signOff: 'Best,', senderName: userName || '' };
  }
  const paragraphs = Array.isArray(fu.paragraphs) ? fu.paragraphs.map(p => clean(String(p || ''))).filter(Boolean) : [];
  const bodyResult = paragraphs.join('\n\n') || (typeof fu.body === 'string' ? clean(fu.body) : '');
  return { index: fu.index || 1, timing: clean(fu.timing) || '', subject: clean(fu.subject), greeting: clean(fu.greeting) || '', paragraphs, body: bodyResult, cta: clean(fu.cta) || '', signOff: clean(fu.signOff) || 'Best,', senderName: clean(fu.senderName) || userName || '' };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUALITY SCORING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function calculateQualityScore(variant, data, personalization) {
  if (!variant) return { score: 0, dimensions: {}, insights: [] };
  const fullText = [variant.greeting || '', ...(variant.paragraphs || []), variant.cta || '', variant.signOff || '', variant.senderName || ''].join(' ');
  const bodyText = [...(variant.paragraphs || []), variant.cta || ''].join(' ');
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  const dimensions = {};
  const insights = [];

  let relevance = 10;
  if (data.whyContacting && data.whyContacting.length > 20) { relevance += 5; insights.push('Specific reason for outreach'); }
  if (data.companyName) relevance += 3;
  if (data.position) relevance += 2;
  dimensions.relevance = Math.min(20, relevance);

  let pers = 5;
  if (personalization.level === 1) { pers = 18; insights.push('Specific personalization used'); }
  else if (personalization.level === 2) { pers = 13; insights.push('Company/role context applied'); }
  else if (personalization.level === 3) pers = 8;
  else pers = 3;
  dimensions.personalization = Math.min(20, pers);

  let clarity = 15;
  if (variant.cta && variant.cta.endsWith('?')) { clarity += 3; insights.push('Clear call to action'); }
  if (detectCoverLetterPattern(fullText)) clarity -= 8;
  dimensions.clarity = Math.min(20, Math.max(0, clarity));

  let credibility = 10;
  if (data.background && data.background.length > 30) { credibility += 5; insights.push('Relevant credential included'); }
  if (!detectFabricatedPersonalization(fullText, personalization.level)) credibility += 3;
  dimensions.credibility = Math.min(20, credibility);

  let conciseness = 15;
  if (wordCount >= 40 && wordCount <= 125) { conciseness += 5; insights.push(`${wordCount} words`); }
  else if (wordCount > 150) conciseness -= 5;
  if (!detectMultipleCTAs(bodyText)) { insights.push('One clear CTA'); } else conciseness -= 5;
  dimensions.conciseness = Math.min(20, Math.max(0, conciseness));

  if (detectTruncatedSentence(fullText)) dimensions.clarity = Math.max(0, (dimensions.clarity || 0) - 10);
  if (!/\[[A-Za-z0-9\s_-]{2,}\]|<[A-Za-z0-9\s_-]{2,}>|\{your\s/i.test(fullText)) insights.push('No placeholders');

  const score = Object.values(dimensions).reduce((a, b) => a + Math.max(0, b), 0);
  return { score: Math.min(100, Math.max(0, score)), dimensions, insights };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function validateColdEmailOutput(data, minLength, maxLength, senderName, personalizationLevel) {
  if (!data || !Array.isArray(data.variants) || data.variants.length < 3) {
    return { isValid: false, reason: 'Fewer than 3 variants returned' };
  }
  const placeholderRegex = /\[[A-Za-z0-9\s_-]{2,}\]|<[A-Za-z0-9\s_-]{2,}>|\{your\s|your_placeholder/i;
  const resumeHeaderRegex = /^(education|skills|work experience|summary|languages|references|certifications)\s*:?\s*$/im;
  const debugRegex = /internal prompt|system prompt|gemini|llm|ai fallback/i;
  const htmlTagRegex = /<\/?[a-zA-Z][^>]{0,100}>/;

  for (let i = 0; i < data.variants.length; i++) {
    const v = data.variants[i];
    if (!v.subject || !v.tone) return { isValid: false, reason: `Variant ${i} missing subject or tone` };
    const countableText = Array.isArray(v.paragraphs) && v.paragraphs.length > 0 ? [...v.paragraphs, v.cta || ''].join(' ') : (v.body || '');
    const fullBodyText = Array.isArray(v.paragraphs) && v.paragraphs.length > 0 ? [v.greeting || '', ...v.paragraphs, v.cta || '', v.signOff || '', v.senderName || ''].join(' ') : (v.body || '');
    if (!countableText.trim()) return { isValid: false, reason: `Variant ${i} has no body content` };

    const coverLetterPattern = detectCoverLetterPattern(fullBodyText);
    if (coverLetterPattern) return { isValid: false, reason: `Output reads like a cover letter (pattern: "${coverLetterPattern}") in variant "${v.tone}"` };

    const allFields = [v.subject, v.greeting, ...(v.paragraphs || [v.body || '']), v.cta || '', v.signOff || ''];
    for (const field of allFields) { if (field && htmlTagRegex.test(field)) return { isValid: false, reason: `HTML tags in variant "${v.tone}"` }; }

    const words = countableText.trim().split(/\s+/).filter(Boolean).length;
    if (words < minLength || words > maxLength) return { isValid: false, reason: `Variant "${v.tone}" has ${words} words; required ${minLength}–${maxLength}.` };
    if (resumeHeaderRegex.test(fullBodyText)) return { isValid: false, reason: `Resume section headers in variant "${v.tone}"` };
    if (placeholderRegex.test(fullBodyText) || placeholderRegex.test(v.subject)) return { isValid: false, reason: `Placeholder tags in variant "${v.tone}"` };

    const lastContent = (v.cta || (Array.isArray(v.paragraphs) ? v.paragraphs[v.paragraphs.length - 1] : '') || '').trim();
    if (lastContent && !/[.?!'"'\u2019\u201d]$/.test(lastContent)) return { isValid: false, reason: `Variant "${v.tone}" ends abruptly without complete sentence.` };

    const truncation = detectTruncatedSentence(fullBodyText);
    if (truncation) return { isValid: false, reason: `Truncated content in variant "${v.tone}": ${truncation}` };
    if (debugRegex.test(fullBodyText) || debugRegex.test(v.subject)) return { isValid: false, reason: 'Internal prompt leakage detected' };
    if (fullBodyText.includes('```')) return { isValid: false, reason: `Markdown fences in variant "${v.tone}"` };

    // Sender name in body text
    if (senderName) {
      const bodyOnlyText = [...(v.paragraphs || []), v.cta || ''].join(' ');
      if (detectSenderInBody(bodyOnlyText, senderName)) return { isValid: false, reason: `Sender name appears in body text of variant "${v.tone}"` };
    }
    // Fabricated personalization
    const fabrication = detectFabricatedPersonalization(fullBodyText, personalizationLevel || 4);
    if (fabrication) return { isValid: false, reason: `Fabricated personalization "${fabrication}" in variant "${v.tone}"` };
    // Multiple CTAs
    if (detectMultipleCTAs(countableText)) return { isValid: false, reason: `Multiple CTAs in variant "${v.tone}"` };
  }
  return { isValid: true };
}

function validateOptimizeOutput(data) {
  if (!data || !data.revisedText) return { isValid: false, reason: 'Missing revisedText field' };
  const words = data.revisedText.trim().split(/\s+/).filter(Boolean).length;
  if (words < 20 || words > 250) return { isValid: false, reason: `Optimized body has ${words} words (expected 20–250)` };
  if (/\[[A-Za-z0-9\s_-]{2,}\]|<[A-Za-z0-9\s_-]{2,}>|\{your\s/i.test(data.revisedText)) return { isValid: false, reason: 'Placeholder tags in optimized body' };
  if (data.revisedText.includes('```') || data.revisedText.includes('<html>')) return { isValid: false, reason: 'Markdown or HTML in optimized body' };
  return { isValid: true };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROMPT CONSTRUCTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildGeneratePrompt(data) {
  const cleanWhy = cleanResumeInputs(data.whyContacting || '');
  const cleanBg = cleanResumeInputs(data.background || '');
  const senderProfile = normalizeSenderProfile(cleanBg, data.userName);
  const proofPoint = cleanBg ? extractSingleProofPoint(cleanBg, `${data.companyName || ''} ${data.position || ''} ${data.emailGoal || ''} ${cleanWhy}`) : '';
  const outreach = getOutreachType(data.emailGoal);
  const persona = detectIndustryPersona(cleanBg, data.position, data.companyName, data.emailGoal);
  const personalization = classifyPersonalization(data);
  const greeting = data.recipientName ? `Hi ${data.recipientName},` : 'Hi there,';

  const contextSection = [
    `OUTREACH GOAL: ${data.emailGoal || 'Networking'} (${outreach.category} outreach)`,
    data.companyName ? `RECIPIENT ORGANIZATION: ${data.companyName}` : null,
    data.recipientName ? `RECIPIENT NAME: ${data.recipientName}` : null,
    data.position ? `RECIPIENT ROLE: ${data.position}` : null,
    cleanWhy ? `REASON FOR OUTREACH: ${cleanWhy}` : null
  ].filter(Boolean).join('\n');

  const senderSection = [
    `SENDER NAME: ${data.userName}`,
    senderProfile.summary ? `SENDER CONTEXT (cleaned facts — use selectively, do NOT dump): ${senderProfile.summary}` : null,
    proofPoint ? `STRONGEST PROOF POINT: "${proofPoint}"` : null
  ].filter(Boolean).join('\n');

  const proofRule = proofPoint
    ? '4. ONE PROOF POINT: Reference exactly ONE fact from the sender\'s proof point above. Do NOT list multiple achievements, skills, tools, companies, or credentials.'
    : '4. CONCISE & RELEVANT: Keep the message concise and relevant. Do NOT invent unverified claims or achievements for the sender.';

  const ctaInstruction = outreach.ctaExamples.length > 0
    ? `${outreach.ctaTemplate}\n   Examples:\n   ${outreach.ctaExamples.map(e => `- "${e}"`).join('\n   ')}`
    : outreach.ctaTemplate;

  return `You are an elite cold email writer specializing in ${persona.domain} communication. Write 4 first-touch professional cold email VARIANTS.

THIS IS A ${outreach.category.toUpperCase()} EMAIL — NOT a cover letter, NOT a resume summary, NOT a job application.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${contextSection}

SENDER (use ONLY this — never invent facts):
${senderSection}

PERSONALIZATION LEVEL: ${personalization.level} (${personalization.label})
${personalization.instruction}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTREACH TYPE: ${data.emailGoal}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPENING STRATEGY: ${outreach.openingStrategy}
VALUE FRAMING: ${outreach.valueFrame}
TONE GUIDANCE: ${outreach.toneGuidance}
RELEVANCE RANKING: ${outreach.relevanceRanking}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INDUSTRY: ${persona.domain}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE REGISTER: ${persona.register}
CREDIBILITY SIGNALS: ${persona.credibilitySignals}
SUBJECT LINE STYLE: ${persona.subjectStyle}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT A COLD EMAIL IS vs. WHAT IT IS NOT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BAD (cover letter — NEVER write this):
"Hi Sarah, I am a software engineer with 5+ years of experience in distributed systems and infrastructure. My background includes leading teams at TechCorp. I am passionate about engineering excellence and would love to contribute to Stripe's infrastructure team."

GOOD (cold email — write this):
"Hi Sarah, Stripe's focus on payment reliability is something I follow closely. I recently shipped a fraud-detection layer that cut false positives by 40% — curious whether that maps to anything on your radar. Would a short call be worth it?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES — VIOLATION = REJECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. WORD COUNT: ${data.minLength}–${data.maxLength} words total across paragraphs[] + cta only. Greeting and signature do not count.
2. STRUCTURE: 1–3 short paragraphs. No bullet lists. No section headers.
3. OPENING: First paragraph starts with the RECIPIENT'S world — their company, role, or specific context. NEVER start with sender's name, title, or credentials.
${proofRule}
5. ONE CTA: ${ctaInstruction}
   Exactly one ask. Natural and low-friction.
6. TONE: "${data.tone}" tone. ${outreach.toneGuidance}
7. BANNED PHRASES (any of these → rejection):
   - "I am a [job title] with X years" / "My background includes" / "my experience in"
   - "I am writing to" / "I wanted to reach out" / "I am passionate about" / "I would love to"
   - "I hope this finds you well" / "I came across your profile" / "I wanted to introduce myself"
   - "pick your brain" / "synergy" / "leverage" / "skills include" / "proficient in" / "expertise in"
   - Generic praise: "incredible work", "amazing company", "reputation for excellence"
   - "Thank you for considering" / "Please find enclosed"
   - "I'd like to explore a potential fit" (too generic)
8. FABRICATION GUARD: ${personalization.fabricationGuard}
9. NO HTML: paragraphs[] must be plain text strings.
10. NO INVENTED FACTS: Do not invent company news, product names, funding events, team wins, mutual connections, or recipient interests.
11. SIGNATURE: signOff is always "Best," (use "Warmly," for Curiosity-Led variant only). senderName is exactly "${data.userName}".
12. STRICT SEPARATION: Write in first person ("I", "my"). NEVER use "${data.userName}" in the body text or greeting. "${data.userName}" appears ONLY in senderName field.

CRITICAL — GREETING RULE:
   ${data.userName} is the SENDER. ${data.userName} must NEVER appear in the greeting field.
   ${data.recipientName ? `Recipient is "${data.recipientName}". Use: "greeting": "Hi ${data.recipientName},"` : `No recipient name provided. Use: "greeting": "Hi there,"`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIANT STRATEGIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Variant 1 — Context-Led: opens with specific observation about company/role/industry. Then one proof point. Then soft CTA.
Variant 2 — Question-Led: opens with specific, relevant question. Then one proof point making it credible. Then CTA.
Variant 3 — Direct: no preamble. Direct reason for contact. One proof point. One CTA. Shortest variant.
Variant 4 — Curiosity-Led: genuine curiosity about recipient's work. One proof point. Low-pressure ask.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT: Return ONLY valid JSON. No backticks, no markdown, no extra text.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "variants": [
    { "tone": "Context-Led", "subject": "[under 8 words]", "greeting": "${greeting}", "paragraphs": ["...","..."], "cta": "[1 sentence ending with ?]", "signOff": "Best,", "senderName": "${data.userName}", "wordCount": 0, "approach": "..." },
    { "tone": "Question-Led", "subject": "[under 8 words]", "greeting": "${greeting}", "paragraphs": ["...","..."], "cta": "[1 sentence ending with ?]", "signOff": "Best,", "senderName": "${data.userName}", "wordCount": 0, "approach": "..." },
    { "tone": "Direct", "subject": "[under 8 words]", "greeting": "${greeting}", "paragraphs": ["..."], "cta": "[1 sentence ending with ?]", "signOff": "Best,", "senderName": "${data.userName}", "wordCount": 0, "approach": "..." },
    { "tone": "Curiosity-Led", "subject": "[under 8 words]", "greeting": "${greeting}", "paragraphs": ["...","..."], "cta": "[1 sentence ending with ?]", "signOff": "Warmly,", "senderName": "${data.userName}", "wordCount": 0, "approach": "..." }
  ],
  "subjectLines": [
    { "text": "[under 8 words]", "label": "Direct" },
    { "text": "[under 8 words]", "label": "Question" },
    { "text": "[under 8 words]", "label": "Context" },
    { "text": "[under 8 words]", "label": "Curiosity" }
  ],
  "evaluation": { "overallScore": 0, "strengths": ["..."], "weaknesses": ["..."], "suggestions": ["..."] },
  "followUps": [
    { "index": 1, "timing": "3-5 business days after initial email", "subject": "[specific — not 'Following up']", "greeting": "${greeting}", "paragraphs": ["[New angle, 30-50 words]"], "cta": "[gentle ask]", "signOff": "Best,", "senderName": "${data.userName}" },
    { "index": 2, "timing": "7-10 business days after follow-up 1", "subject": "[graceful close]", "greeting": "${greeting}", "paragraphs": ["[Respectful close, 25-40 words]"], "cta": "", "signOff": "All the best,", "senderName": "${data.userName}" }
  ]
}`;
}

function buildRegenSubjectsPrompt(data) {
  const recipientDesc = [data.recipientName || null, data.position ? `(${data.position})` : null, data.companyName ? `at ${data.companyName}` : null].filter(Boolean).join(' ') || (data.companyName ? `Team at ${data.companyName}` : 'Hiring Team');
  const persona = detectIndustryPersona('', data.position, data.companyName, data.emailGoal);
  return `You are a high-converting cold outreach copywriter specializing in ${persona.domain} communication.\n\nEmail Goal: ${data.emailGoal || 'Networking'}\nRecipient: ${recipientDesc}\nSubject Style: ${persona.subjectStyle}\n\nEmail Body (context only):\n${data.emailBody || ''}\n\nGenerate exactly 4 fresh, specific subject lines. Rules:\n- Specific to this recipient/company/goal\n- Under 8 words each\n- Sound like a real person, not a marketer\n- No exclamation marks\n- No invented facts\n- Each takes a different angle (direct, curiosity, question, value)\n\nReturn ONLY valid JSON:\n{\n  "subjectLines": [\n    { "text": "[subject]", "label": "Direct" },\n    { "text": "[subject]", "label": "Curiosity" },\n    { "text": "[subject]", "label": "Question" },\n    { "text": "[subject]", "label": "Value" }\n  ]\n}`;
}

function buildOptimizePrompt(data) {
  const recipientDesc = [data.recipientName || 'the recipient', data.companyName ? `at ${data.companyName}` : '', data.position ? `(${data.position})` : ''].filter(Boolean).join(' ');
  const outreach = getOutreachType(data.emailGoal);
  return `You are an elite cold email editor. Revise the following email body based on the user's specific instruction.\n\nCURRENT EMAIL:\n${data.emailBody || ''}\n\nUSER INSTRUCTION: "${data.feedback || ''}"\n\nCONTEXT:\n- Goal: ${data.emailGoal || 'Networking'} (${outreach.category} outreach)\n- Recipient: ${recipientDesc}\n- Sender name: ${data.userName || ''}\n\nRULES:\n1. Apply ONLY the change requested.\n2. Preserve sender's name, greeting, signature, and all verified facts.\n3. Do NOT invent new facts.\n4. Do NOT add generic filler or clichés.\n5. Keep under 125 words unless explicitly asked for more.\n6. Return clean plain text only.\n7. Preserve paragraph structure with blank lines.\n8. Write as the sender (I, my). Never third-person.\n9. Never refer to "${data.userName || ''}" by name in the body.\n\nReturn ONLY valid JSON:\n{\n  "revisedText": "...",\n  "reason": "..."\n}`;
}

function parseGeminiResponse(text, action = 'generate') {
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];
  if (text.startsWith('{') && !text.endsWith('}')) text += '}';
  try { return JSON.parse(text); }
  catch (e) { console.error(`[cold-email] [${action}] JSON parse error:`, e.message); return {}; }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FALLBACK EMAIL BUILDER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildFallbackColdEmail(data) {
  const company = data.companyName || 'your organization';
  const recipientName = data.recipientName || '';
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,';
  const position = data.position || '';
  const sender = data.userName || '';
  const outreach = getOutreachType(data.emailGoal);

  let bg = null;
  if (data.background) {
    const rawBg = cleanResumeInputs(data.background);
    if (!detectTruncatedSentence(rawBg)) {
      const sentences = splitIntoSentences(rawBg).filter(s => !detectTruncatedSentence(s) && s.length >= 10);
      bg = sentences.length > 0 ? sentences[0].trim() : null;
    }
  }
  const why = cleanResumeInputs(data.whyContacting || '');

  let contextLine, valueLine, ctaLine;
  if (outreach.category === 'career') {
    contextLine = why ? why : position ? `I'm reaching out regarding ${position} opportunities at ${company}.` : `I'm exploring opportunities at ${company} that align with my background.`;
    valueLine = bg || `a background relevant to ${company}`;
    ctaLine = outreach.ctaExamples[0] || 'Would you be open to a brief conversation?';
  } else if (outreach.category === 'business') {
    contextLine = why ? why : `I've been looking at ${company}'s work and believe there may be a natural fit worth exploring.`;
    valueLine = bg || `relevant experience in this space`;
    ctaLine = outreach.ctaExamples[0] || 'Would a short call to explore this make sense?';
  } else {
    contextLine = why ? why : `I'm reaching out because the work at ${company} intersects with something I'm focused on.`;
    valueLine = bg || `a relevant background`;
    ctaLine = outreach.ctaExamples[0] || 'Would you be open to a brief conversation?';
  }

  const variants = [
    { tone: 'Context-Led', subject: position ? `${position} at ${company}` : `${company} — connecting`, greeting, paragraphs: [why && /[.!?]$/.test(why.trim()) ? why.trim() : contextLine, `${valueLine}.`], cta: ctaLine, signOff: 'Best,', senderName: sender, wordCount: 0, approach: 'Recipient/context-first. One sender fact. Soft CTA.' },
    { tone: 'Question-Led', subject: position ? `${position} at ${company}` : `a question regarding ${company}`, greeting, paragraphs: [why && /[.!?]$/.test(why.trim()) ? why.trim() : position ? `Is your team at ${company} currently considering candidates for ${position} roles?` : `I'm curious whether ${company} is open to connecting with professionals in this space.`, `${valueLine} — happy to share a concrete example if useful.`], cta: 'Would a short exchange next week make sense?', signOff: 'Best,', senderName: sender, wordCount: 0, approach: 'Question-first. Value-focused.' },
    { tone: 'Direct', subject: position ? `${position} at ${company} — a question` : `${company} — a question`, greeting, paragraphs: [`${valueLine} — and I think there may be a fit worth exploring at ${company}.`], cta: 'Would you be the right person to speak with, or can you point me in the right direction?', signOff: 'Best,', senderName: sender, wordCount: 0, approach: 'Most concise. Direct reason → one proof point → CTA.' },
    { tone: 'Curiosity-Led', subject: `curious about ${company}`, greeting, paragraphs: [why && /[.!?]$/.test(why.trim()) ? why.trim() : position ? `I've been exploring ${position} opportunities and ${company} came up as a team worth reaching out to.` : `I'm genuinely interested in the work your team is doing at ${company}.`, `${valueLine}, and I'd value your perspective.`], cta: 'Would you be open to a short conversation?', signOff: 'Warmly,', senderName: sender, wordCount: 0, approach: 'Curiosity-first. Advice-seeking, no hard ask.' }
  ].map(v => ({ ...v, body: (v.paragraphs || []).join('\n\n') }));

  const subjectLines = [
    { text: position ? `${position} at ${company}` : `${company} — connecting`, label: 'Direct' },
    { text: `a question regarding ${company}`, label: 'Curiosity' },
    { text: position ? `${position} at ${company}` : `connecting with ${company}`, label: 'Question' },
    { text: `your work at ${company}`, label: 'Context' }
  ];

  const followUps = [
    { index: 1, timing: '3–5 business days after initial email', subject: `one more thought — ${company}`, greeting, paragraphs: [`One additional thought since my last note: ${valueLine}. I think there's a genuine fit worth exploring.`], cta: 'Happy to keep it brief.', signOff: 'Best,', senderName: sender },
    { index: 2, timing: '7–10 business days after follow-up 1', subject: `closing the loop — ${company}`, greeting, paragraphs: [`I'll leave it here so I'm not filling your inbox. If the timing is ever right to connect, I'd welcome it.`], cta: '', signOff: 'All the best,', senderName: sender }
  ].map(fu => ({ ...fu, body: (fu.paragraphs || []).join('\n\n') }));

  const pers = classifyPersonalization(data);
  const qualityScore = calculateQualityScore(variants[0], data, pers);

  return {
    variants, subjectLines,
    evaluation: { overallScore: qualityScore.score, strengths: qualityScore.insights.slice(0, 3), weaknesses: ['Generated from template — add specific company research for higher impact'], suggestions: [`Reference a specific initiative or product at ${company} for deeper personalization`] },
    qualityScore, followUps, fallbackUsed: true
  };
}

function buildFallbackSubjects(data) {
  const company = data.companyName || 'your company';
  const position = data.position || '';
  return { subjectLines: [{ text: position ? `${position} at ${company}` : `${company} — connecting`, label: 'Direct' }, { text: `a question regarding ${company}`, label: 'Curiosity' }, { text: position ? `${position} at ${company}` : `connecting with ${company}`, label: 'Value' }, { text: `your work at ${company}`, label: 'Personal' }, { text: `quick question for you`, label: 'Question' }], fallbackUsed: true };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REQUEST HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const action = String(body.action || 'generate').toLowerCase();

  const emailGoal = String(body.emailGoal || body.purpose || 'Networking').trim();
  const recipient = body.recipient || {};
  const recipientName = String(recipient.name || body.recipientName || '').trim();
  const companyName = String(recipient.company || body.company || body.companyName || '').trim();
  const position = String(recipient.position || body.recipientTitle || body.position || '').trim();
  const userContext = body.userContext || {};
  const personalization = body.personalization || {};
  const userName = String(userContext.name || body.senderName || body.userName || '').trim();
  const background = String(userContext.background || body.background || '').trim();
  const whyContacting = String(userContext.whyContacting || body.companyContext || body.context || body.valueProposition || '').trim();

  let lengthType = personalization.length || body.lengthType || body.length || 'Standard';
  let minLength, maxLength;
  const norm = String(lengthType).toLowerCase();
  if (norm.includes('very')) { lengthType = 'Very Short'; minLength = 40; maxLength = 70; }
  else if (norm.includes('detail') || norm.includes('long')) { lengthType = 'Detailed'; minLength = 125; maxLength = 175; }
  else if (norm.includes('standard')) { lengthType = 'Standard'; minLength = 90; maxLength = 125; }
  else { lengthType = 'Short'; minLength = 60; maxLength = 90; }
  if (Number.isInteger(body.minLength) && body.minLength > 0) minLength = body.minLength;
  if (Number.isInteger(body.maxLength) && body.maxLength > minLength) maxLength = body.maxLength;

  const dataFields = { emailGoal: emailGoal || 'Networking', recipientName: recipientName || '', companyName: companyName || '', position: position || '', userName: userName || '', background: background || '', whyContacting: whyContacting || '', length: lengthType, lengthType, minLength, maxLength, tone: body.tone || personalization.tone || 'Professional', emailBody: String(body.emailBody || '').trim(), feedback: String(body.feedback || '').trim() };

  if (action === 'generate') {
    const missingFields = [];
    if (!userName) missingFields.push('userName (sender name)');
    if (!companyName) missingFields.push('companyName (recipient company)');
    if (!emailGoal) missingFields.push('emailGoal (purpose)');
    if (!background) missingFields.push('background (background/value)');
    if (missingFields.length > 0) return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}`, missingFields });
  } else if (action === 'regenerate-subjects') {
    if (!dataFields.emailBody || !companyName) return res.status(400).json({ error: 'Missing required fields: emailBody and companyName.' });
  } else if (action === 'optimize') {
    if (!dataFields.emailBody || !dataFields.feedback) return res.status(400).json({ error: 'Missing required fields: emailBody and feedback.' });
  } else {
    return res.status(400).json({ error: `Invalid action: "${action}". Valid actions: generate, optimize, regenerate-subjects.` });
  }

  let user = null, isPro = false, supabase = null;
  try {
    const authResult = await authenticateRequest(req);
    user = authResult.user; isPro = authResult.isPro; supabase = authResult.supabase;
  } catch (authErr) {
    console.error('[cold-email] Auth failure:', authErr.message);
    return res.status(authErr.status || 401).json({ error: authErr.message });
  }

  if (!isPro && user && supabase && (action === 'generate' || action === 'optimize')) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: usage, error: fetchErr } = await supabase.from('usage_tracking').select('*').eq('user_id', user.id).eq('tool', 'cold_email').maybeSingle();
      if (fetchErr) console.warn('[cold-email] Usage fetch error (non-fatal):', fetchErr.message);
      if (usage) {
        if (usage.reset_date < today) { await supabase.from('usage_tracking').update({ count: 1, reset_date: today }).eq('user_id', user.id).eq('tool', 'cold_email'); }
        else if (usage.count >= 3) { return res.status(403).json({ error: "You've used all 3 free emails today. Upgrade to Pro for unlimited access.", usageLimitReached: true }); }
        else { await supabase.from('usage_tracking').update({ count: usage.count + 1 }).eq('user_id', user.id).eq('tool', 'cold_email'); }
      } else { await supabase.from('usage_tracking').insert({ user_id: user.id, tool: 'cold_email', count: 1, reset_date: today }); }
    } catch (usageErr) { console.warn('[cold-email] Usage tracking error (non-fatal):', usageErr.message); }
  }

  const keys = getApiKeys();
  if (keys.length === 0) {
    if (action === 'optimize') return res.status(500).json({ error: 'AI service is not configured. Cannot perform this action.' });
    if (action === 'generate') return res.status(200).json(buildFallbackColdEmail(dataFields));
    return res.status(200).json(buildFallbackSubjects(dataFields));
  }

  let prompt;
  if (action === 'generate') prompt = buildGeneratePrompt(dataFields);
  else if (action === 'regenerate-subjects') prompt = buildRegenSubjectsPrompt(dataFields);
  else prompt = buildOptimizePrompt(dataFields);

  const persLevel = classifyPersonalization(dataFields).level;

  const MAX_RETRIES = 2;
  let attempt = 0, validatedData = null, lastFailReason = '';

  while (attempt <= MAX_RETRIES) {
    let activePrompt = prompt;
    if (attempt > 0) {
      activePrompt = prompt + `\n\nRETRY NOTE: Previous attempt failed quality check: ${lastFailReason}. Ensure: no placeholder tags, no markdown fences, no resume headers, all sentences complete, word count strictly ${minLength}–${maxLength}. Do NOT fabricate personalization. Do NOT include multiple CTAs. Do NOT include sender name in body text.`;
    }
    try {
      const r = await callGemini({ contents: [{ parts: [{ text: activePrompt }] }], generationConfig: { temperature: 0.65 + (attempt * 0.08), maxOutputTokens: 3500 } });
      if (!r.ok) { const errText = await r.text(); console.error(`[cold-email] API error (attempt ${attempt}):`, r.status, errText.substring(0, 200)); lastFailReason = `HTTP ${r.status}`; attempt++; continue; }
      const result = await r.json();
      const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!rawText) { lastFailReason = 'empty_response'; attempt++; continue; }
      const parsed = parseGeminiResponse(rawText, action);

      if (action === 'generate') {
        if (parsed && Array.isArray(parsed.variants)) {
          parsed.variants = parsed.variants.map(v => normalizeVariant(v, dataFields.userName, dataFields.recipientName)).filter(Boolean);
          if (Array.isArray(parsed.followUps)) { parsed.followUps = parsed.followUps.map(fu => normalizeFollowUp(fu, dataFields.userName)).filter(Boolean); }
        }
        const validation = validateColdEmailOutput(parsed, minLength, maxLength, dataFields.userName, persLevel);
        if (validation.isValid) { validatedData = parsed; break; }
        lastFailReason = validation.reason; attempt++;
      } else if (action === 'optimize') {
        const validation = validateOptimizeOutput(parsed);
        if (validation.isValid) { validatedData = parsed; break; }
        lastFailReason = validation.reason; attempt++;
      } else {
        if (parsed && Array.isArray(parsed.subjectLines) && parsed.subjectLines.length > 0) { validatedData = parsed; break; }
        lastFailReason = 'Invalid subjects response'; attempt++;
      }
    } catch (err) { console.error(`[cold-email] Exception (attempt ${attempt}):`, err.message); lastFailReason = err.message || 'exception'; attempt++; }
  }

  if (!validatedData) {
    console.warn('[cold-email] All retries exhausted. Last failure:', lastFailReason);
    if (action === 'optimize') return res.status(500).json({ error: 'Could not revise the email. Please try a different action or try again.' });
    if (action === 'generate') { const fallback = buildFallbackColdEmail(dataFields); fallback.isPro = isPro; fallback.fallbackReason = lastFailReason; return res.status(200).json(fallback); }
    return res.status(200).json(buildFallbackSubjects(dataFields));
  }

  if (action === 'generate') {
    const allText = validatedData.variants.map(v => `${v.subject} ${(v.paragraphs || []).join(' ')} ${v.cta || ''}`.toLowerCase()).join(' ');
    validatedData.spamWords = SPAM_WORDS.filter(w => allText.includes(w.toLowerCase()));
    validatedData.spamScore = Math.min(100, validatedData.spamWords.length * 15 + (allText.includes('!!!') ? 10 : 0));
    const pers = classifyPersonalization(dataFields);
    validatedData.qualityScore = calculateQualityScore(validatedData.variants[0], dataFields, pers);
  }

  validatedData.isPro = isPro;
  return res.status(200).json(validatedData);
};
