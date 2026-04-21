// POST /api/interview
// Receives: history (array of { role, text }), resumeContext, jobTitle, company
// Returns:  { response: "...", feedback: "...", scores: { clarity, relevance, confidence } }

const { createClient } = require('@supabase/supabase-js');

function buildSystemInstruction(data) {
  return `You are an elite, professional Interview Coach conducting a realistic mock interview.
Your goal is to help the candidate practice for a specific role.

Candidate's Target Role: ${data.jobTitle || 'General Professional'}
Target Company: ${data.company || 'Any Company'}
Candidate's Background (from Resume): ${data.resumeContext || 'Not provided'}

INSTRUCTIONS FOR YOUR BEHAVIOR:
1. Act exclusively as the interviewer. Never break character.
2. If this is the start of the interview (no prior conversation), welcome the candidate briefly and ask the first interview question (e.g., "Tell me about yourself" or something specific to their resume).
3. If the candidate just answered a question, your response MUST be a JSON object containing actionable feedback on their answer, AND the next interview question. 
4. The interview should progressively get deeper. Mix behavioral questions (STAR method) with technical/role-specific questions based on their resume and target role.
5. Keep your spoken interview question concise and natural, just like a real interview.

IMPORTANT: You must always output ONLY valid JSON in the exact format below. Do not add markdown blocks or extra text.

{
  "feedback": "Constructive feedback on the candidate's last answer. What did they do well? What was missing? (If this is the first message, leave this blank).",
  "scores": {
    "clarity": 85, 
    "relevance": 90,
    "confidence": 80
  },
  "nextQuestion": "The exact wording of your next interview question to the candidate."
}`;
}

function parseGeminiResponse(text) {
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];
  if (text.startsWith('{') && !text.endsWith('}')) text += '}';

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('[interview-coach] JSON parse error:', e.message, '\nSnippet:', text.substring(0, 300));
    data = {};
  }

  return {
    feedback: data.feedback || '',
    scores: data.scores || { clarity: 80, relevance: 80, confidence: 80 },
    nextQuestion: data.nextQuestion || 'Could you elaborate more on your past experience?'
  };
}

async function callGeminiWithRetry(apiKey, body, maxRetries = 3) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.status !== 429) return r;
    const retryAfter = parseInt(r.headers.get('Retry-After') || '0', 10);
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt + 1) * 1000;
    console.warn(`[interview-coach] Gemini rate limited. Waiting ${waitMs}ms.`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (r.status === 429) {
    const err = new Error('AI service is busy. Please try again in a moment.');
    err.status = 429;
    throw err;
  }
  return r;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const history = Array.isArray(body.history) ? body.history : [];
  const resumeContext = String(body.resumeContext || '').trim();
  const jobTitle = String(body.jobTitle || '').trim();
  const company = String(body.company || '').trim();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not set.' });

  // ── Usage limiting ───────────────────────────────────────────────────────────
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  let userId = null;
  let isPro = false;

  if (supabaseUrl && supabaseKey) {
    try {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

      if (token) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (!authErr && user) {
          userId = user.id;
          isPro = user.user_metadata?.plan === 'pro' ||
                  user.user_metadata?.isPro === true ||
                  user.app_metadata?.plan === 'pro';
        }
      }

      // Check usage limits if user exists and is not pro
      if (userId && !isPro) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
        const today = new Date().toISOString().split('T')[0];

        const { data: usage } = await supabaseAdmin
          .from('usage_tracking')
          .select('*')
          .eq('user_id', userId)
          .eq('tool', 'interview')
          .single();

        if (usage) {
          if (usage.reset_date < today) {
            await supabaseAdmin
              .from('usage_tracking')
              .update({ count: 1, reset_date: today })
              .eq('user_id', userId)
              .eq('tool', 'interview');
          } else if (usage.count >= 10) { // Limit to 10 messages per day for free users
            return res.status(403).json({
              error: "You've reached your free interview limit for today. Upgrade to Pro for unlimited sessions.",
              usageLimitReached: true
            });
          } else {
            await supabaseAdmin
              .from('usage_tracking')
              .update({ count: usage.count + 1 })
              .eq('user_id', userId)
              .eq('tool', 'interview');
          }
        } else {
          await supabaseAdmin
            .from('usage_tracking')
            .insert({ user_id: userId, tool: 'interview', count: 1, reset_date: today });
        }
      }
    } catch (usageErr) {
      console.warn('[interview-coach] Usage tracking error (non-fatal):', usageErr.message);
    }
  }

  // ── Build Chat Contents ──────────────────────────────────────────────────────
  
  const systemInstruction = buildSystemInstruction({ resumeContext, jobTitle, company });
  
  // Format history for Gemini API
  // Gemini expects: { role: "user" | "model", parts: [{ text: "..." }] }
  const contents = [];
  
  // We'll inject the system instruction into the very first message just to ensure it's respected
  // or we can use the systemInstruction field if using v1beta. Let's use systemInstruction field.
  
  for (const msg of history) {
    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.text }] });
    } else if (msg.role === 'model') {
      contents.push({ role: 'model', parts: [{ text: msg.text }] });
    }
  }
  
  if (contents.length === 0) {
    // Start of interview
    contents.push({ role: 'user', parts: [{ text: "Hi, I am ready to start the interview. Please ask your first question." }] });
  }

  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
  };

  try {
    let r = await callGeminiWithRetry(apiKey, payload);

    if (!r.ok) {
      const errText = await r.text();
      console.error('[interview-coach] Gemini HTTP error:', r.status, errText);
      return res.status(502).json({ error: `AI service error: ${r.status}. Please try again.` });
    }

    const result = await r.json();
    if (!result?.candidates?.[0]?.content?.parts?.[0]) {
      console.error('[interview-coach] Unexpected response:', JSON.stringify(result).substring(0, 300));
      return res.status(502).json({ error: 'Unexpected response from AI service.' });
    }

    const rawText = result.candidates[0].content.parts[0].text || '';
    const data = parseGeminiResponse(rawText);

    return res.status(200).json(data);
  } catch (err) {
    console.error('[interview-coach] Generation error:', err);
    return res.status(500).json({ error: 'Failed to process interview response. Please try again.' });
  }
};
