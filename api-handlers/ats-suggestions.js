require('../utils/env-loader');
const { authenticateRequest } = require('../utils/supabase');
const { callGemini } = require('../utils/gemini');

function parseGeminiResponse(text) {
  // Remove code fences if present
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Extract the JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    text = jsonMatch[0];
  }

  // If JSON is missing the closing brace, add it (best-effort recovery)
  if (text.startsWith('{') && !text.endsWith('}')) {
    console.warn('Gemini response appears truncated; appending closing brace for recovery.');
    text = text + '}';
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('JSON parse error in ats-suggestions:', e.message, '\nText snippet:', text.substring(0, 500));
    // Fallback response
    data = {
      overallATSScore: 70,
      keywordMatch: 70,
      recruiterReadability: 70,
      professionalTone: 70,
      personalization: 70,
      suggestions: [],
      summary: {
        overallATSScore: 70,
        topImprovements: ["Check grammar and spelling", "Add metrics to achievements"],
        estimatedATSAfterApplying: 75,
        recruiterLikelihood: "Medium",
        confidenceLevel: "Medium"
      }
    };
  }

  // Normalize scores and fields
  data.overallATSScore = Number(data.overallATSScore) || 70;
  data.keywordMatch = Number(data.keywordMatch) || 70;
  data.recruiterReadability = Number(data.recruiterReadability) || 70;
  data.professionalTone = Number(data.professionalTone) || 70;
  data.personalization = Number(data.personalization) || 70;

  if (!data.summary || typeof data.summary !== 'object') {
    data.summary = {
      overallATSScore: data.overallATSScore,
      topImprovements: [],
      estimatedATSAfterApplying: Math.min(100, data.overallATSScore + 5),
      recruiterLikelihood: "Medium",
      confidenceLevel: "Medium"
    };
  }

  data.suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  data.suggestions = data.suggestions.map((s, idx) => {
    let oneClick = typeof s.oneClickApplicable === 'boolean' ? s.oneClickApplicable : false;
    let current = typeof s.currentText === 'string' ? s.currentText : '';
    // If currentText is provided and non-empty, default oneClick to true if not specified
    if (current && s.oneClickApplicable === undefined) {
      oneClick = true;
    }
    return {
      id: s.id || `ats-s-${idx + 1}`,
      category: typeof s.category === 'string' ? s.category : 'Missing Keyword',
      priority: ['High', 'Medium', 'Low'].includes(s.priority) ? s.priority : 'Medium',
      title: typeof s.title === 'string' ? s.title : 'Improvement Opportunity',
      description: typeof s.description === 'string' ? s.description : 'Actionable suggestion.',
      currentText: current,
      suggestedText: typeof s.suggestedText === 'string' ? s.suggestedText : '',
      reason: typeof s.reason === 'string' ? s.reason : 'Improves ATS score.',
      estimatedATSGain: typeof s.estimatedATSGain === 'string' ? s.estimatedATSGain : '+2%',
      oneClickApplicable: oneClick
    };
  });

  return data;
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await authenticateRequest(req);
  } catch (authErr) {
    console.error('[ats-suggestions] Authentication failure:', authErr.message);
    return res.status(authErr.status || 401).json({ error: authErr.message });
  }

  const body = req.body || {};
  const letter = String(body.letter || '').trim();
  const jobDescription = String(body.jobDescription || '').trim();
  const jobTitle = String(body.jobTitle || '').trim();
  const companyName = String(body.companyName || '').trim();
  const resumeText = String(body.resumeText || '').trim();
  const industry = String(body.industry || '').trim();
  const experienceLevel = String(body.experienceLevel || 'Mid').trim();

  if (!letter || !jobDescription) {
    return res.status(400).json({ error: 'Missing required fields: letter and jobDescription are required.' });
  }

  const resumeCtx = resumeText ? `\nCANDIDATE RESUME FOR CONTEXT:\n${resumeText.slice(0, 3000)}\n` : '';
  const industryCtx = industry ? `Industry: ${industry}\n` : '';
  const experienceCtx = experienceLevel ? `Experience Level: ${experienceLevel}\n` : '';

  const prompt = `You are an expert ATS (Applicant Tracking System) analyzer, recruiter, hiring manager, HR specialist, and professional career coach.
Analyze the following generated cover letter and job description to provide intelligent, actionable ATS optimization suggestions. Do not provide generic advice.

INPUTS TO ANALYZE:
- Generated Cover Letter:
"${letter}"

- Target Job Description:
"${jobDescription}"

- Job Title: ${jobTitle || 'Not specified'}
- Company Name: ${companyName || 'Not specified'}
${resumeCtx}${industryCtx}${experienceCtx}

EVALUATION CRITERIA:
1. Keyword Match: Compare cover letter against job description to find missing technical skills, certs, software, action verbs.
2. ATS Score: Calculate score out of 100 based on keyword match, professional formatting, tone.
3. Grammar & Language: Detect passive voice, repetitive phrases, typos, wordiness.
4. Impact Analysis: Detect weak statements (e.g. "worked on legal cases") and replace with result-oriented sentences (e.g. "Conducted legal research on constitutional matters, resulting in stronger case preparation.").
5. Missing Achievements: Detect where percentages, KPIs, case volume, or other measurable achievements should be added.
6. Recruiter Perspective: Evaluate strengths, weaknesses, first impression, and shortlist likelihood.
7. Tone Analysis: Check if tone is confident, genuine, professional, avoiding AI clichés or flattery.
8. Personalization Score: Check references to company, role, values, mission.
9. Readability: Sentence length, transitions, clarity.
10. ATS Formatting: Proper paragraphs, standard punctuation, clean spacing, no graphics or tables.

AI REQUIREMENTS:
- Never invent user experience or fabricate skills.
- Only recommend improvements supported by the Resume, Job Description, or User Inputs.
- If evidence is missing, suggest adding information (e.g. using "[Insert Metric]") rather than creating details out of nothing.

RESPONSE FORMAT:
Return ONLY a valid JSON object. No markdown code fences. No introductory or trailing text.

JSON Structure:
{
  "overallATSScore": 85,
  "keywordMatch": 80,
  "recruiterReadability": 90,
  "professionalTone": 85,
  "personalization": 80,
  "suggestions": [
    {
      "id": "s1",
      "category": "Missing Keyword",
      "priority": "High",
      "title": "Add Kubernetes Keyword",
      "description": "The job description emphasizes Kubernetes for container orchestration, which is missing from your cover letter.",
      "currentText": "managed Docker deployments",
      "suggestedText": "orchestrated container deployments with Kubernetes and Docker",
      "reason": "Allows ATS scanners to index the required keyword while maintaining standard syntax.",
      "estimatedATSGain": "+4%",
      "oneClickApplicable": true
    }
  ],
  "summary": {
    "overallATSScore": 85,
    "topImprovements": [
      "Incorporate missing technical skills: Kubernetes, AWS.",
      "Quantify achievements under the lead developer role.",
      "Use active verbs instead of passive phrases."
    ],
    "estimatedATSAfterApplying": 93,
    "recruiterLikelihood": "High",
    "confidenceLevel": "High"
  }
}

Note:
For "oneClickApplicable" to be true, the "currentText" MUST match an EXACT substring in the cover letter text, including capitalization and punctuation. If a suggestion is general or doesn't replace an exact substring, set "oneClickApplicable" to false and leave "currentText" as "".`;

  try {
    const geminiRes = await callGemini({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error in ats-suggestions:', geminiRes.status, errText);
      return res.status(502).json({ error: `AI service error: ${geminiRes.status}. Please try again.` });
    }

    const result = await geminiRes.json();
    if (!result?.candidates?.[0]?.content?.parts?.[0]) {
      console.error('Unexpected Gemini response in ats-suggestions:', JSON.stringify(result));
      return res.status(502).json({ error: 'Unexpected response from AI service. Please try again.' });
    }

    const rawText = result.candidates[0].content.parts[0].text || '';
    const parsedData = parseGeminiResponse(rawText);

    return res.status(200).json(parsedData);
  } catch (err) {
    console.error('[ats-suggestions] Error during analysis:', err);
    return res.status(err.status || 500).json({ error: err.message || 'Failed to analyze cover letter.' });
  }
};
