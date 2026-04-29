'use strict';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'was', 'were',
  'have', 'has', 'had', 'will', 'shall', 'would', 'could', 'should', 'into', 'about', 'what',
  'when', 'where', 'why', 'how', 'role', 'job', 'company', 'work', 'experience', 'resume',
  'team', 'teams', 'their', 'they', 'them', 'our', 'ours', 'yourself', 'etc', 'using', 'used',
  'past', 'current', 'while', 'been', 'being', 'than', 'then', 'there', 'here', 'also', 'can'
]);

const ACTION_VERBS = [
  'built', 'led', 'owned', 'shipped', 'launched', 'improved', 'reduced', 'increased',
  'designed', 'created', 'managed', 'resolved', 'scaled', 'delivered', 'organized',
  'implemented', 'optimized', 'collaborated', 'debugged'
];

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

function splitSentences(text) {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
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

function buildQuestions(context) {
  const role = context.jobTitle || 'this role';
  const company = context.companyName || 'the company';
  const interviewType = context.interviewType || 'Mixed';
  const experienceLevel = context.experienceLevel || 'Mid';
  const focus = normalizeList(context.focusAreas);
  const resumeKeywords = uniqueWords(context.resumeText, 8);
  const jobKeywords = uniqueWords(context.jobDescription, 10);
  const combinedKeywords = pickKeywords(context.resumeText, context.jobDescription, context.focusAreas);
  const samplePoints = [...new Set([...focus, ...resumeKeywords, ...jobKeywords].filter(Boolean))].slice(0, 4);

  const jobHint = combinedKeywords[0] || role.toLowerCase();
  const companyHint = company.toLowerCase();

  return [
    {
      id: 'q1',
      category: 'intro',
      difficulty: 'easy',
      question: `Walk me through your background and why you want ${role} at ${company}.`,
      why_it_matters: 'This helps you practice a clean opening that ties your story to the role.',
      sample_points: samplePoints.length ? samplePoints : ['Current role', 'Relevant experience', 'Why this company']
    },
    {
      id: 'q2',
      category: interviewType.toLowerCase(),
      difficulty: experienceLevel.toLowerCase().includes('senior') || interviewType === 'System Design' ? 'hard' : 'medium',
      question: `Tell me about a project where you worked on ${jobHint} and had to deliver a real outcome.`,
      why_it_matters: 'This checks whether you can talk about work results instead of just tasks.',
      sample_points: samplePoints.length ? samplePoints : ['Problem', 'Action', 'Result']
    },
    {
      id: 'q3',
      category: 'resume',
      difficulty: 'medium',
      question: resumeKeywords.length
        ? `On your resume, you mention ${resumeKeywords.slice(0, 2).join(' and ')}. How would you explain that experience in an interview?`
        : `Describe one of your strongest projects and explain it in a way ${company} would care about.`,
      why_it_matters: 'This makes the practice feel personal and anchored to your actual background.',
      sample_points: resumeKeywords.length ? resumeKeywords.slice(0, 4) : ['What you did', 'How you did it', 'What changed']
    },
    {
      id: 'q4',
      category: 'behavioral',
      difficulty: 'medium',
      question: `Tell me about a time you had to work with people who wanted something different from you.`,
      why_it_matters: 'Interviewers want to know how you handle teamwork and conflict.',
      sample_points: ['Context', 'Your response', 'How you kept things moving']
    },
    {
      id: 'q5',
      category: 'prep',
      difficulty: 'easy',
      question: `If you got this job, what would you focus on in your first 30 days at ${company}?`,
      why_it_matters: 'This helps you prepare a thoughtful, grounded closing answer.',
      sample_points: ['Learn the product', 'Build trust', 'Find quick wins']
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

  let score = 28;
  if (answerWords.length >= 40) score += 15;
  if (answerWords.length >= 80) score += 10;
  if (/[0-9]/.test(answer)) score += 8;
  if (ACTION_VERBS.some(verb => answer.toLowerCase().includes(verb))) score += 12;
  if (/(because|so that|therefore|result|impact|example|for example)/i.test(answer)) score += 10;

  const matchedJob = jobKeywords.filter(word => answerWordSet.has(word));
  const matchedResume = resumeKeywords.filter(word => answerWordSet.has(word));
  score += Math.min(20, matchedJob.length * 4);
  score += Math.min(12, matchedResume.length * 3);
  score = Math.max(0, Math.min(100, score));

  const strengths = [];
  const improvements = [];

  if (answerWords.length >= 40) strengths.push('You gave enough detail to explain the answer clearly.');
  if (matchedResume.length) strengths.push(`You connected the answer to your resume with ${matchedResume.slice(0, 2).join(', ')}.`);
  if (matchedJob.length) strengths.push(`You referenced role-relevant topics like ${matchedJob.slice(0, 2).join(', ')}.`);
  if (ACTION_VERBS.some(verb => answer.toLowerCase().includes(verb))) strengths.push('You used active language that sounds more confident.');
  if (!strengths.length) strengths.push('You answered directly, which is a good base to build on.');

  if (answerWords.length < 40) improvements.push('Add one specific example so the answer feels grounded.');
  if (!/[0-9]/.test(answer)) improvements.push('Add a metric, number, or concrete result if you can.');
  if (!ACTION_VERBS.some(verb => answer.toLowerCase().includes(verb))) improvements.push('Use stronger action verbs to show ownership.');
  if (!matchedJob.length) improvements.push('Tie the answer back to the job description more explicitly.');
  if (!matchedResume.length) improvements.push('Use at least one example from your resume or past work.');
  if (!/(because|so that|therefore|result|impact|example)/i.test(answer)) improvements.push('Add a simple cause-and-result sentence.');
  if (!improvements.length) improvements.push('Add one more sentence that shows the result of your work.');

  const opening = resumeKeywords[0] || jobKeywords[0] || 'that work';
  const betterAnswer = [
    `Start with a direct answer about ${opening}.`,
    'Then give one example from your resume or experience.',
    'Finish with the result, impact, or what you learned.',
    '',
    answer || 'Your answer goes here.'
  ].join('\n');

  return {
    score,
    summary: score >= 80
      ? 'Strong answer. You are connecting your experience and the role in a clear way.'
      : score >= 60
        ? 'Good base, but it would be stronger with more detail and proof.'
        : 'The answer needs a clearer example and a stronger tie to your resume or the role.',
    strengths: strengths.slice(0, 4),
    improvements: improvements.slice(0, 4),
    better_answer: betterAnswer,
    follow_up_question: 'Can you give one concrete example or result that proves that point?'
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
