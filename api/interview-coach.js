'use strict';

function stripCodeFences(text) {
  return String(text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

function extractJsonObject(text) {
  const cleaned = stripCodeFences(text);
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? match[0] : cleaned;
}

function clampScore(value, fallback = 70) {
  const num = Number(value);
  if (Number.isFinite(num)) {
    return Math.max(0, Math.min(100, Math.round(num)));
  }
  return fallback;
}

function asString(value, fallback = '') {
  if (typeof value === 'string') {
    return value.trim();
  }
  return fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(item => String(item).trim()) : [];
}

function normalizeQuestion(item, index) {
  return {
    id: asString(item?.id, `q${index + 1}`),
    question: asString(item?.question, ''),
    category: asString(item?.category, 'general'),
    difficulty: asString(item?.difficulty, 'medium'),
    why_it_matters: asString(item?.why_it_matters || item?.whyItMatters, ''),
    sample_points: asArray(item?.sample_points || item?.samplePoints).slice(0, 4)
  };
}

function normalizeGeneratePayload(data, context) {
  const questions = Array.isArray(data?.questions)
    ? data.questions.map((item, index) => normalizeQuestion(item, index)).filter(q => q.question)
    : [];

  const fallbackQuestions = buildFallbackQuestions(context);

  return {
    interview_title: asString(data?.interview_title || data?.title, `${context.jobTitle} Interview Coach`),
    interview_summary: asString(
      data?.interview_summary || data?.summary,
      `Practice ${context.interviewType} interview questions for ${context.jobTitle} at ${context.companyName}.`
    ),
    questions: questions.length ? questions.slice(0, 5) : fallbackQuestions
  };
}

function normalizeEvaluationPayload(data, context) {
  const strengths = asArray(data?.strengths);
  const improvements = asArray(data?.improvements);

  return {
    score: clampScore(data?.score, scoreFromAnswer(context.answer)),
    summary: asString(
      data?.summary,
      'The answer is solid, but it needs more specificity, structure, and proof of impact.'
    ),
    strengths: (strengths.length ? strengths : ['Clear communication', 'Relevant experience', 'Good intent']).slice(0, 5),
    improvements: (improvements.length ? improvements : ['Add one metric', 'Tighten the opening', 'Finish with impact']).slice(0, 5),
    better_answer: asString(data?.better_answer || data?.betterAnswer, buildFallbackBetterAnswer(context)),
    follow_up_question: asString(
      data?.follow_up_question || data?.followUpQuestion,
      'Can you give one concrete example that shows the result you created?'
    )
  };
}

function buildFallbackQuestions(context) {
  const role = context.jobTitle || 'the role';
  const company = context.companyName || 'the company';
  const type = context.interviewType || 'general';

  return [
    {
      id: 'q1',
      question: `Walk me through your background and what makes you a fit for ${role} at ${company}.`,
      category: 'introduce-yourself',
      difficulty: 'easy',
      why_it_matters: 'Tests how clearly you can connect your story to the role.',
      sample_points: ['Current focus', 'Relevant experience', 'Why this role now']
    },
    {
      id: 'q2',
      question: `Tell me about a project where you had to solve a difficult ${type} problem.`,
      category: 'problem-solving',
      difficulty: 'medium',
      why_it_matters: 'Shows how you think through ambiguity and execution.',
      sample_points: ['Challenge', 'Approach', 'Outcome']
    },
    {
      id: 'q3',
      question: `Describe a time you had to work with a teammate or stakeholder who disagreed with you.`,
      category: 'behavioral',
      difficulty: 'medium',
      why_it_matters: 'Evaluates collaboration, communication, and conflict handling.',
      sample_points: ['Context', 'How you responded', 'What changed']
    },
    {
      id: 'q4',
      question: `What would you prioritize in your first 30 days in this ${role} position?`,
      category: 'strategy',
      difficulty: 'medium',
      why_it_matters: 'Checks judgment and onboarding thinking.',
      sample_points: ['Learn the system', 'Identify quick wins', 'Build trust']
    },
    {
      id: 'q5',
      question: `Why do you want to work at ${company}, and what would you contribute that is hard to replace?`,
      category: 'motivation',
      difficulty: 'easy',
      why_it_matters: 'Measures company fit and self-awareness.',
      sample_points: ['Mission fit', 'Unique strengths', 'Specific contribution']
    }
  ];
}

function buildFallbackBetterAnswer(context) {
  const answer = String(context.answer || '').trim();
  if (!answer) {
    return 'Start with the point, add one concrete example, then finish with the result.';
  }

  const trimmed = answer.length > 1200 ? `${answer.slice(0, 1200).trim()}...` : answer;
  return [
    'Here is a stronger version:',
    '',
    trimmed,
    '',
    'Add one measurable result, one concrete action you took, and one sentence tying it back to the role.'
  ].join('\n');
}

function scoreFromAnswer(answer) {
  const text = String(answer || '').trim();
  if (!text) return 30;
  const words = text.split(/\s+/).filter(Boolean).length;
  let score = 45;
  if (words > 60) score += 10;
  if (words > 120) score += 10;
  if (/[0-9]/.test(text)) score += 10;
  if (/(led|built|improved|reduced|increased|shipped|launched|owned)/i.test(text)) score += 10;
  if (/(because|so that|result|impact|therefore|example)/i.test(text)) score += 5;
  return Math.max(0, Math.min(100, score));
}

function parseJsonResponse(text, fallback) {
  const raw = extractJsonObject(text);
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return fallback;
  }
}

function buildGeneratePrompt(context) {
  return `You are a rigorous interview coach.

Create exactly 5 interview questions tailored to this candidate and role.

Return only valid JSON with this shape:
{
  "interview_title": "string",
  "interview_summary": "string",
  "questions": [
    {
      "id": "q1",
      "question": "string",
      "category": "behavioral | technical | product | leadership | motivation | collaboration | systems | general",
      "difficulty": "easy | medium | hard",
      "why_it_matters": "string",
      "sample_points": ["string", "string", "string"]
    }
  ]
}

Rules:
- Ask realistic questions a strong interviewer would ask.
- Mix behavioral and role-specific questions.
- Keep the wording concise and practical.
- Make the questions useful for ${context.interviewType || 'a'} interviews.

Candidate context:
Job title: ${context.jobTitle}
Company: ${context.companyName}
Experience level: ${context.experienceLevel}
Interview type: ${context.interviewType}
Job description: ${context.jobDescription}
Resume context: ${context.resumeText || 'Not provided'}
Focus areas: ${context.focusAreas || 'Not provided'}`;
}

function buildEvaluationPrompt(context) {
  return `You are a sharp, encouraging interview coach.

Evaluate the candidate's answer to the interview question below.

Return only valid JSON with this shape:
{
  "score": 0,
  "summary": "string",
  "strengths": ["string", "string", "string"],
  "improvements": ["string", "string", "string"],
  "better_answer": "string",
  "follow_up_question": "string"
}

Scoring guidance:
- 0-39: weak or off-target
- 40-69: adequate but incomplete
- 70-84: strong with room to sharpen
- 85-100: excellent and specific

Question:
${context.question}

Candidate answer:
${context.answer}

Role context:
Job title: ${context.jobTitle || 'Not provided'}
Company: ${context.companyName || 'Not provided'}
Job description: ${context.jobDescription || 'Not provided'}
Experience level: ${context.experienceLevel || 'Not provided'}
Interview type: ${context.interviewType || 'Not provided'}`;
}

async function callGeminiWithRetry(apiKey, body, maxRetries = 3) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (response.status !== 429) {
      return response;
    }

    const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt + 1) * 1000;
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (response.status === 429) {
    const err = new Error('AI service is busy. Please try again in a moment.');
    err.status = 429;
    throw err;
  }

  return response;
}

async function generateQuestions(apiKey, context) {
  const response = await callGeminiWithRetry(apiKey, {
    contents: [{ parts: [{ text: buildGeneratePrompt(context) }] }],
    generationConfig: { temperature: 0.65, maxOutputTokens: 1800 }
  });

  if (!response.ok) {
    const message = await response.text();
    const err = new Error(`AI service error: ${response.status}. ${message || 'Please try again.'}`);
    err.status = response.status;
    throw err;
  }

  const result = await response.json();
  const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const fallback = normalizeGeneratePayload({}, context);
  return normalizeGeneratePayload(parseJsonResponse(rawText, fallback), context);
}

async function evaluateAnswer(apiKey, context) {
  const response = await callGeminiWithRetry(apiKey, {
    contents: [{ parts: [{ text: buildEvaluationPrompt(context) }] }],
    generationConfig: { temperature: 0.45, maxOutputTokens: 1200 }
  });

  if (!response.ok) {
    const message = await response.text();
    const err = new Error(`AI service error: ${response.status}. ${message || 'Please try again.'}`);
    err.status = response.status;
    throw err;
  }

  const result = await response.json();
  const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const fallback = normalizeEvaluationPayload({}, context);
  return normalizeEvaluationPayload(parseJsonResponse(rawText, fallback), context);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const action = asString(body.action, '');

  if (!action) {
    return res.status(400).json({ error: 'Missing required field: action' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set.' });
  }

  const context = {
    jobTitle: asString(body.jobTitle, ''),
    companyName: asString(body.companyName, ''),
    jobDescription: asString(body.jobDescription, ''),
    experienceLevel: asString(body.experienceLevel, ''),
    interviewType: asString(body.interviewType, 'General'),
    resumeText: asString(body.resumeText, ''),
    focusAreas: asString(body.focusAreas || body.focusArea, ''),
    question: asString(body.question, ''),
    answer: asString(body.answer, '')
  };

  try {
    if (action === 'generate_questions') {
      if (!context.jobTitle || !context.companyName || !context.jobDescription) {
        return res.status(400).json({
          error: 'Missing required fields. jobTitle, companyName, and jobDescription are required.'
        });
      }

      const data = await generateQuestions(apiKey, context);
      return res.status(200).json({ action, ...data });
    }

    if (action === 'evaluate_answer') {
      if (!context.question || !context.answer) {
        return res.status(400).json({ error: 'Missing required fields: question and answer' });
      }

      const data = await evaluateAnswer(apiKey, context);
      return res.status(200).json({ action, ...data });
    }

    return res.status(400).json({ error: 'Invalid action. Use generate_questions or evaluate_answer.' });
  } catch (err) {
    console.error('[interview-coach] error:', err);
    const status = typeof err.status === 'number' ? err.status : 500;
    return res.status(status).json({ error: err.message || 'Failed to process interview coach request.' });
  }
};
