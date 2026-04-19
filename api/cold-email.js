// POST /api/cold-email
// Receives: company, recipientTitle, recipientName, senderName, background,
//           purpose, valueProposition, industry, tone, length
// Returns:  { variants, scores, tips, followUp, bestTimeToSend, spamWords }
// Usage-limits free users to 3 emails per day via the usage_tracking table.

const { createClient } = require('@supabase/supabase-js');

const SPAM_WORDS = ['free', 'guaranteed', 'urgent', 'winner', 'cash', 'prize', 'click here',
  'act now', 'limited time', 'no obligation', 'risk-free', 'discount', 'earn money'];

function buildEmailPrompt(data) {
  return `You are an elite B2B sales copywriter specializing in high-converting cold outreach. Write 3 distinct cold email variants based on the following context.

Company: ${data.company}
Recipient title: ${data.recipientTitle}
Recipient name: ${data.recipientName || 'not provided, use Hi there'}
Sender: ${data.senderName}, ${data.background}
Purpose: ${data.purpose}
Key value / hook: ${data.valueProposition}
Industry: ${data.industry}
Tone required: ${data.tone}
Length limit: ${data.length}

RULES:
- Eliminate "I hope this finds you well" or any generic fluff. Start immediately with relevance.
- Never use spam words: free, guaranteed, urgent, winner, cash, prize, click here.
- Subject lines MUST be lowercase, short (2-4 words), and sound like an internal email.
- The Call to Action (CTA) must be extremely low-friction (e.g. "Worth a chat?", "Open to learning more?", "Mind if I send over a 2-min video?").
- Ensure the email is formatted with short sentences and frequent line breaks for mobile readability.

FRAMEWORKS:
- Variant A (PAS Framework): Identify a likely Problem they face, Agitate it slightly, and present your background as the Solution.
- Variant B (AIDA Framework): Grab Attention with a highly personalized observation, build Interest/Desire with the value hook, and push for Action.
- Variant C ("No-Pressure" Ultra-Short): Strictly under 50 words. Josh Braun style. Remove all pressure. Generate pure curiosity.

FOLLOW-UP:
- Generate a "3-day bump" follow-up email that adds *new* value (e.g. an insight, a resource, or a question) rather than just saying "just checking in".

Return ONLY valid JSON in this exact format (no markdown fences, no extra text):
{
  "variants": [
    {"subject": "...", "body": "...", "approach": "PAS Framework"},
    {"subject": "...", "body": "...", "approach": "AIDA Framework"},
    {"subject": "...", "body": "...", "approach": "Ultra-Short Curiosity"}
  ],
  "scores": {"personalisation": 80, "clarity": 85, "cta": 75, "length": 90},
  "tips": ["Why A works", "Why B works", "Why C works"],
  "followUp": "Full follow-up email text...",
  "bestTimeToSend": "Tuesday-Thursday, 8-10am",
  "spamWords": []
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
    console.error('[cold-email] JSON parse error:', e.message, '\nSnippet:', text.substring(0, 300));
    data = {};
  }

  // Normalise
  if (!Array.isArray(data.variants) || data.variants.length === 0) {
    data.variants = [
      { subject: 'Quick question', body: 'Hi there,\n\nI wanted to reach out…', approach: 'Direct' },
      { subject: 'Impressed by your work', body: 'Hi there,\n\nI came across your company…', approach: 'Compliment' },
      { subject: 'One quick thing', body: 'Hi,\n\nWould it make sense to connect?', approach: 'Ultra-short' }
    ];
  }
  data.variants = data.variants.slice(0, 3).map(v => ({
    subject: String(v.subject || ''),
    body: String(v.body || ''),
    approach: String(v.approach || '')
  }));

  data.scores = data.scores && typeof data.scores === 'object' ? data.scores : {};
  ['personalisation', 'clarity', 'cta', 'length'].forEach(k => {
    data.scores[k] = typeof data.scores[k] === 'number' ? data.scores[k] : 70;
  });

  data.tips = Array.isArray(data.tips) ? data.tips.slice(0, 3) : [];
  data.followUp = typeof data.followUp === 'string' ? data.followUp : '';
  data.bestTimeToSend = typeof data.bestTimeToSend === 'string' ? data.bestTimeToSend : 'Tuesday-Thursday, 8-10am';

  // Detect spam words in all variant bodies
  const allText = data.variants.map(v => (v.subject + ' ' + v.body).toLowerCase()).join(' ');
  data.spamWords = SPAM_WORDS.filter(w => allText.includes(w.toLowerCase()));

  return data;
}

async function callGeminiWithRetry(apiKey, body, maxRetries = 3) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.status !== 429) return r;
    const retryAfter = parseInt(r.headers.get('Retry-After') || '0', 10);
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt + 1) * 1000;
    console.warn(`[cold-email] Gemini rate limited. Waiting ${waitMs}ms (attempt ${attempt + 1}/${maxRetries}).`);
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
  const company          = String(body.company || '').trim();
  const recipientTitle   = String(body.recipientTitle || '').trim();
  const recipientName    = String(body.recipientName || '').trim();
  const senderName       = String(body.senderName || '').trim();
  const background       = String(body.background || '').trim();
  const purpose          = String(body.purpose || '').trim();
  const valueProposition = String(body.valueProposition || '').trim();
  const industry         = String(body.industry || '').trim();
  const tone             = String(body.tone || 'Professional').trim();
  const length           = String(body.length || 'Medium').trim();

  // Basic validation
  if (!company || !recipientTitle || !senderName || !background || !purpose || !valueProposition || !industry) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

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

      if (userId && !isPro) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
        const today = new Date().toISOString().split('T')[0];

        const { data: usage } = await supabaseAdmin
          .from('usage_tracking')
          .select('*')
          .eq('user_id', userId)
          .eq('tool', 'cold_email')
          .single();

        if (usage) {
          // Reset if it's a new day
          if (usage.reset_date < today) {
            await supabaseAdmin
              .from('usage_tracking')
              .update({ count: 1, reset_date: today })
              .eq('user_id', userId)
              .eq('tool', 'cold_email');
          } else if (usage.count >= 3) {
            return res.status(403).json({
              error: "You've used all 3 free emails today. Upgrade to Pro for unlimited access.",
              usageLimitReached: true
            });
          } else {
            await supabaseAdmin
              .from('usage_tracking')
              .update({ count: usage.count + 1 })
              .eq('user_id', userId)
              .eq('tool', 'cold_email');
          }
        } else {
          await supabaseAdmin
            .from('usage_tracking')
            .insert({ user_id: userId, tool: 'cold_email', count: 1, reset_date: today });
        }
      }
    } catch (usageErr) {
      // Non-fatal: log and continue rather than block the user
      console.warn('[cold-email] Usage tracking error (non-fatal):', usageErr.message);
    }
  }

  // ── Generate emails ──────────────────────────────────────────────────────────
  const prompt = buildEmailPrompt({ company, recipientTitle, recipientName, senderName, background, purpose, valueProposition, industry, tone, length });

  try {
    let r;
    try {
      r = await callGeminiWithRetry(apiKey, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 2000 }
      });
    } catch (retryErr) {
      return res.status(429).json({ error: retryErr.message });
    }

    if (!r.ok) {
      const errText = await r.text();
      console.error('[cold-email] Gemini HTTP error:', r.status, errText);
      return res.status(502).json({ error: `AI service error: ${r.status}. Please try again.` });
    }

    const result = await r.json();
    if (!result?.candidates?.[0]?.content?.parts?.[0]) {
      console.error('[cold-email] Unexpected Gemini response:', JSON.stringify(result).substring(0, 300));
      return res.status(502).json({ error: 'Unexpected response from AI service. Please try again.' });
    }

    const rawText = result.candidates[0].content.parts[0].text || '';
    const data = parseGeminiResponse(rawText);
    data.isPro = true; // Unlocked for development/testing

    return res.status(200).json(data);
  } catch (err) {
    console.error('[cold-email] Generation error:', err);
    return res.status(500).json({ error: 'Failed to generate cold emails. Please try again.' });
  }
};
