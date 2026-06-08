'use strict';

const { authenticateRequest } = require('../utils/supabase');

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'was', 'were',
  'have', 'has', 'had', 'will', 'shall', 'would', 'could', 'should', 'into', 'about', 'what',
  'when', 'where', 'why', 'how', 'role', 'job', 'company', 'work', 'experience', 'resume',
  'team', 'teams', 'their', 'they', 'them', 'our', 'ours', 'yourself', 'etc', 'using', 'used',
  'past', 'current', 'while', 'been', 'being', 'than', 'then', 'there', 'here', 'also', 'can',
  'build', 'building', 'improve', 'improving', 'collaborate', 'collaborating', 'handle', 'facing'
]);

const ACTION_VERBS = [
  'built', 'led', 'owned', 'shipped', 'launched', 'improved', 'reduced', 'increased',
  'designed', 'created', 'managed', 'resolved', 'scaled', 'delivered', 'organized',
  'implemented', 'optimized', 'collaborated', 'debugged'
];

const RUBRIC = {
  clarity: 20,
  relevance: 25,
  evidence: 25,
  structure: 15,
  impact: 15
};

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map(item => normalizeText(item)).filter(Boolean);
  }
  return normalizeText(value)
    .split(/[,;\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function tokenize(text) {
  return normalizeText(text)
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/i)
    .map(word => word.trim())
    .filter(word => word.length > 1 && !STOP_WORDS.has(word));
}

function uniqueWords(text, limit = 12) {
  const seen = new Set();
  const out = [];
  for (const word of tokenize(text)) {
    if (seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= limit) break;
  }
  return out;
}

function splitSentences(text, limit = 8) {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 18)
    .slice(0, limit);
}

function pickKeywords(...sources) {
  const counts = new Map();
  for (const source of sources) {
    for (const word of tokenize(source)) {
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 8);
}

function humanizeKeyword(keyword) {
  return normalizeText(keyword)
    .replace(/[+#.]+$/g, '')
    .replace(/\b(ui)\b/gi, 'UI')
    .replace(/\b(api)\b/gi, 'API')
    .replace(/\b(react|javascript|typescript)\b/gi, match => match[0].toUpperCase() + match.slice(1).toLowerCase());
}

function extractResumeHighlights(resumeText) {
  const sentences = splitSentences(resumeText, 10);
  const ranked = sentences
    .map(sentence => {
      const lower = sentence.toLowerCase();
      let score = 0;
      if (ACTION_VERBS.some(verb => lower.includes(verb))) score += 3;
      if (/[0-9]/.test(sentence)) score += 2;
      if (/(project|product|customer|team|dashboard|application|feature|system|campaign|client)/i.test(sentence)) score += 2;
      return { sentence, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.sentence);

  return ranked.slice(0, 4);
}

function extractRoleRequirements(jobDescription, focusAreas) {
  const focus = normalizeList(focusAreas).map(humanizeKeyword);
  const keywords = uniqueWords(jobDescription, 14).map(humanizeKeyword);
  return [...new Set([...focus, ...keywords].filter(Boolean))]
    .filter(item => item.length > 2)
    .slice(0, 6);
}

function buildCriteria(...criteria) {
  return criteria.filter(Boolean).slice(0, 4);
}

function buildQuestions(context) {
  const role = context.jobTitle || 'this role';
  const company = context.companyName || 'the company';
  const interviewType = context.interviewType || 'Mixed';
  const experienceLevel = context.experienceLevel || 'Mid';
  const requirements = extractRoleRequirements(context.jobDescription, context.focusAreas);
  const resumeHighlights = extractResumeHighlights(context.resumeText);
  const resumeKeywords = uniqueWords(context.resumeText, 8).map(humanizeKeyword);
  const requirementText = requirements.slice(0, 3).join(', ') || 'the core responsibilities in the job description';
  const bestResumeExample = resumeHighlights[0] || `one project or responsibility from your resume that matches ${role}`;
  const difficulty = experienceLevel.toLowerCase().includes('senior') || interviewType === 'System Design' ? 'hard' : 'medium';

  return [
    {
      id: 'q1',
      category: 'opening',
      difficulty: 'easy',
      question: `Give a 60-second introduction for the ${role} role at ${company}.`,
      why_it_matters: 'A strong opening should connect your resume, the role, and your motivation without rambling.',
      sample_points: ['Who you are', 'Most relevant experience', `Why ${role} at ${company}`],
      answer_guide: 'Keep it under one minute. Use present background, one proof point, and why this role.',
      scoring_criteria: buildCriteria('Clear opening', 'Specific role fit', 'One resume proof point', 'Confident close'),
      time_limit_seconds: 60
    },
    {
      id: 'q2',
      category: interviewType.toLowerCase(),
      difficulty,
      question: `Describe a project from your resume that proves you can handle ${requirementText}.`,
      why_it_matters: 'Interviewers want proof that your past work maps to the job, not a generic story.',
      sample_points: requirements.length ? requirements.slice(0, 4) : ['Problem', 'Your role', 'Tools or skills used', 'Result'],
      answer_guide: 'Use STAR: situation, task, action, result. Include your exact contribution.',
      scoring_criteria: buildCriteria('Relevant project', 'Clear ownership', 'Role requirement match', 'Measurable result'),
      time_limit_seconds: 120
    },
    {
      id: 'q3',
      category: 'resume',
      difficulty: 'medium',
      question: `Explain this resume point in simple interview language: "${bestResumeExample}"`,
      why_it_matters: 'Resume lines often sound compressed. This helps you turn them into a clear spoken answer.',
      sample_points: resumeKeywords.length ? resumeKeywords.slice(0, 4) : ['Context', 'Actions', 'Tools', 'Outcome'],
      answer_guide: 'Avoid reading the resume line back. Explain what happened, what you owned, and why it mattered.',
      scoring_criteria: buildCriteria('Simple explanation', 'Specific contribution', 'No vague buzzwords', 'Outcome included'),
      time_limit_seconds: 90
    },
    {
      id: 'q4',
      category: 'behavioral',
      difficulty: 'medium',
      question: `Tell me about a time you received feedback or faced disagreement while working on a project.`,
      why_it_matters: 'This checks communication, maturity, and how you work with people under pressure.',
      sample_points: ['Situation', 'What the disagreement was', 'How you responded', 'Final result'],
      answer_guide: 'Do not blame others. Show listening, decision-making, and the result.',
      scoring_criteria: buildCriteria('Balanced tone', 'Clear conflict', 'Constructive action', 'Learning or result'),
      time_limit_seconds: 120
    },
    {
      id: 'q5',
      category: 'closing',
      difficulty: 'easy',
      question: `Based on the job description, what would you focus on in your first 30 days at ${company}?`,
      why_it_matters: 'A practical 30-day answer shows preparation and realistic thinking.',
      sample_points: requirements.length ? requirements.slice(0, 4) : ['Learn product', 'Understand team goals', 'Contribute to a small win'],
      answer_guide: 'Mention learning, collaboration, and one realistic contribution.',
      scoring_criteria: buildCriteria('Job-aware plan', 'Realistic priorities', 'Team collaboration', 'Clear first contribution'),
      time_limit_seconds: 90
    }
  ];
}

function scoreAnswer(context) {
  const answer = normalizeText(context.answer);
  const jobText = `${context.jobDescription || ''} ${context.focusAreas || ''}`;
  const resumeText = context.resumeText || '';
  const jobKeywords = uniqueWords(jobText, 12);
  const resumeKeywords = uniqueWords(resumeText, 12);
  const answerWords = tokenize(answer);
  const answerWordSet = new Set(answerWords);

  const matchedJob = jobKeywords.filter(word => answerWordSet.has(word));
  const matchedResume = resumeKeywords.filter(word => answerWordSet.has(word));
  const hasActionVerb = ACTION_VERBS.some(verb => answer.toLowerCase().includes(verb));
  const hasResultLanguage = /(because|so that|therefore|result|impact|improved|reduced|increased|learned|delivered|outcome|example|for example)/i.test(answer);
  const hasMetric = /[0-9]/.test(answer);
  const hasStructure = /(first|then|after that|finally|situation|task|action|result|problem|solution|outcome)/i.test(answer);

  const scoreBreakdown = {
    clarity: Math.min(RUBRIC.clarity, answerWords.length >= 25 ? 16 + (answerWords.length >= 55 ? 4 : 0) : Math.max(6, answerWords.length)),
    relevance: Math.min(RUBRIC.relevance, matchedJob.length * 5 + matchedResume.length * 3),
    evidence: Math.min(RUBRIC.evidence, (hasActionVerb ? 8 : 0) + (hasMetric ? 9 : 0) + (matchedResume.length ? 8 : 0)),
    structure: Math.min(RUBRIC.structure, hasStructure ? 13 : answerWords.length >= 45 ? 9 : 5),
    impact: Math.min(RUBRIC.impact, hasResultLanguage ? 12 + (hasMetric ? 3 : 0) : hasMetric ? 8 : 4)
  };

  let score = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
  if (answerWords.length < 15) score = Math.min(score, 35);
  if (answerWords.length < 40) score = Math.min(score, 78);
  score = Math.max(0, Math.min(100, score));

  const strengths = [];
  const weaknesses = [];

  if (answerWords.length >= 40) strengths.push('You gave enough detail to explain the answer clearly.');
  if (matchedResume.length) strengths.push(`You connected the answer to your resume with ${matchedResume.slice(0, 2).join(', ')}.`);
  if (matchedJob.length) strengths.push(`You referenced role-relevant topics like ${matchedJob.slice(0, 2).join(', ')}.`);
  if (hasActionVerb) strengths.push('You used active language that sounds more confident.');
  if (hasStructure) strengths.push('Your answer has a structure that is easier to follow.');
  if (!strengths.length) strengths.push('You answered directly, which is a good base to build on.');

  if (answerWords.length < 40) weaknesses.push('The answer is too short to prove your point clearly.');
  if (!hasMetric) weaknesses.push('It needs a metric, number, scope, or concrete result.');
  if (!hasActionVerb) weaknesses.push('It does not yet show enough ownership or action.');
  if (!matchedJob.length) weaknesses.push('It does not connect strongly enough to the job description.');
  if (!matchedResume.length) weaknesses.push('It should use at least one example from your resume or past work.');
  if (!hasResultLanguage) weaknesses.push('It needs a clearer result, impact, or lesson learned.');
  if (!weaknesses.length) weaknesses.push('The answer is solid. Tighten the wording and remove any extra filler.');

  const opening = resumeKeywords[0] || jobKeywords[0] || 'that work';
  const grade = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Needs practice' : 'Weak';
  const betterAnswer = [
    `Start with a direct answer about ${opening}.`,
    'Then give one example from your resume or experience.',
    'Finish with the result, impact, or what you learned.',
    '',
    answer || 'Your answer goes here.'
  ].join('\n');

  return {
    score,
    grade,
    score_breakdown: scoreBreakdown,
    rubric: RUBRIC,
    summary: score >= 80
      ? 'Strong answer. You are connecting your experience and the role in a clear way.'
      : score >= 60
        ? 'Good base, but it would be stronger with more detail and proof.'
        : 'The answer needs a clearer example and a stronger tie to your resume or the role.',
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
    improvements: weaknesses.slice(0, 4),
    better_answer: betterAnswer,
    follow_up_question: 'Can you give one concrete example or result that proves that point?'
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Usage limiting & Authentication ───────────────────────────────────────────
  let user = null;
  let isPro = false;
  let supabase = null;

  try {
    const authResult = await authenticateRequest(req);
    user = authResult.user;
    isPro = authResult.isPro;
    supabase = authResult.supabase;
  } catch (authErr) {
    console.error('[interview-coach] Authentication failure:', authErr.message);
    return res.status(authErr.status || 401).json({ error: authErr.message });
  }

  if (!isPro && user && supabase) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: usage, error: fetchErr } = await supabase
        .from('usage_tracking')
        .select('*')
        .eq('user_id', user.id)
        .eq('tool', 'interview')
        .maybeSingle();

      if (fetchErr) {
        console.error('[interview-coach] Failed to fetch usage tracking:', fetchErr.message);
      }

      if (usage) {
        // Reset if it's a new day
        if (usage.reset_date < today) {
          await supabase
            .from('usage_tracking')
            .update({ count: 1, reset_date: today })
            .eq('user_id', user.id)
            .eq('tool', 'interview');
        } else if (usage.count >= 10) {
          return res.status(403).json({
            error: "You've reached your free interview limit for today. Upgrade to Pro for unlimited sessions.",
            usageLimitReached: true
          });
        } else {
          await supabase
            .from('usage_tracking')
            .update({ count: usage.count + 1 })
            .eq('user_id', user.id)
            .eq('tool', 'interview');
        }
      } else {
        await supabase
          .from('usage_tracking')
          .insert({ user_id: user.id, tool: 'interview', count: 1, reset_date: today });
      }
    } catch (usageErr) {
      console.warn('[interview-coach] Usage tracking error (non-fatal):', usageErr.message);
    }
  }

  const body = req.body || {};
  const action = normalizeText(body.action);
  const context = {
    jobTitle: normalizeText(body.jobTitle),
    companyName: normalizeText(body.companyName),
    jobDescription: normalizeText(body.jobDescription),
    experienceLevel: normalizeText(body.experienceLevel || 'Mid'),
    interviewType: normalizeText(body.interviewType || 'Mixed'),
    resumeText: normalizeText(body.resumeText),
    focusAreas: normalizeText(body.focusAreas || body.focusArea),
    question: normalizeText(body.question),
    answer: normalizeText(body.answer)
  };

  if (!action) {
    return res.status(400).json({ error: 'Missing required field: action' });
  }

  try {
    if (action === 'generate_questions') {
      if (!context.jobTitle || !context.companyName) {
        return res.status(400).json({
          error: 'Missing required fields. jobTitle and companyName are required.'
        });
      }

      const questions = buildQuestions(context);
      return res.status(200).json({
        action,
        interview_title: `${context.jobTitle} Interview Coach`,
        interview_summary: `Simple practice set for ${context.jobTitle} at ${context.companyName}. Based on your resume and job details.`,
        questions,
        prep_notes: [
          `Focus on ${questions[0].sample_points.join(', ')}.`,
          'Use one short story per answer.',
          'Add a number or result when you can.'
        ]
      });
    }

    if (action === 'evaluate_answer') {
      if (!context.question || !context.answer) {
        return res.status(400).json({ error: 'Missing required fields: question and answer' });
      }

      const result = scoreAnswer(context);
      return res.status(200).json({ action, ...result });
    }

    return res.status(400).json({ error: 'Invalid action. Use generate_questions or evaluate_answer.' });
  } catch (err) {
    console.error('[interview-coach] error:', err);
    return res.status(500).json({ error: 'Failed to process interview coach request.' });
  }
};
