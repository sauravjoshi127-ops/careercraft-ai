// POST /api/cold-email
// Receives: company, recipientTitle, recipientName, senderName, background,
//           purpose, valueProposition, industry, tone, length
// Returns:  { variants, scores, tips, followUp, bestTimeToSend, spamWords }

'use strict';

const SPAM_WORDS = [
  'free', 'guaranteed', 'urgent', 'winner', 'cash', 'prize',
  'click here', 'act now', 'limited time', 'no obligation',
  'risk-free', 'discount', 'earn money', 'congratulations',
];

// ── Prompt Builder ────────────────────────────────────────────────────────────
function buildPrompt(d) {
  return `You are an elite B2B sales copywriter. Your specialty is cold email that actually gets replies.
Write 3 distinct cold email variants based on the context below.

=== CONTEXT ===
Target Company:   ${d.company}
Recipient Title:  ${d.recipientTitle}
Recipient Name:   ${d.recipientName || 'Not provided – use "Hi there"'}
Sender Name:      ${d.senderName}
Sender Background: ${d.background}
Email Purpose:    ${d.purpose}
Value Hook:       ${d.valueProposition}
Industry:         ${d.industry}
Tone Required:    ${d.tone}
Length Limit:     ${d.length}

=== RULES ===
1. NEVER open with "I hope this finds you well" or any filler. Start with immediate relevance.
2. NEVER use spam trigger words: free, guaranteed, urgent, winner, cash, prize, click here.
3. Subject lines must be lowercase, 2–5 words, and sound like an internal email (no exclamation marks).
4. CTA must be ultra-low-friction: "Worth a quick chat?", "Open to connecting?", "Mind if I show you how?" etc.
5. Short sentences. Frequent line breaks. Mobile-first formatting.
6. Each email must feel like it was written specifically for this company, not copy-pasted.

=== FRAMEWORKS ===
Variant A – PAS: Identify a real Problem ${d.company} likely faces, gently Agitate it, then position ${d.senderName}'s background as the Solution.
Variant B – AIDA: Open with a sharp Attention hook (a personalized observation or bold stat), build Interest/Desire with the value hook, close with low-friction Action.
Variant C – "No-Pressure" Ultra-Short: STRICTLY under 50 words. Josh Braun style. Pure curiosity, zero pressure, single question CTA. No selling at all.

=== FOLLOW-UP ===
Write a 3-day bump email that adds genuine NEW value (a relevant insight, a question, a mini case study) — not just "following up on my last email".

Return ONLY valid JSON, no markdown, no prose:
{
  "variants": [
    { "subject": "...", "body": "...", "approach": "PAS Framework" },
    { "subject": "...", "body": "...", "approach": "AIDA Framework" },
    { "subject": "...", "body": "...", "approach": "Ultra-Short Curiosity" }
  ],
  "scores": { "personalisation": 85, "clarity": 90, "cta": 80, "readability": 88 },
  "tips": [
    "Why Variant A works...",
    "Why Variant B works...",
    "Why Variant C works..."
  ],
  "followUp": "Full follow-up email text here...",
  "bestTimeToSend": "Tuesday–Thursday, 8–10 am recipient's local time",
  "spamWords": []
}`;
}

// ── JSON Normaliser ────────────────────────────────────────────────────────────
function parseAIResponse(raw) {
  // Strip markdown code fences if the model wrapped the JSON
  let text = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Grab the outermost {...} block
  const match = text.match(/\{[\s\S]*\}/);
  if (match) text = match[0];

  let data = {};
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('[cold-email] JSON parse failed:', e.message);
    console.error('[cold-email] Raw snippet:', text.slice(0, 400));
  }

  // Normalise variants
  const defaultVariants = [
    { subject: 'quick question', body: 'Hi there,\n\nI noticed your team at [Company] and wanted to reach out briefly.\n\nWould it be worth a quick chat?\n\n[Sender]', approach: 'PAS Framework' },
    { subject: 'saw this and thought of you', body: 'Hi there,\n\nI came across your work and was genuinely impressed.\n\nI think there could be a natural fit here — open to a 15-min call?\n\n[Sender]', approach: 'AIDA Framework' },
    { subject: 'one thing', body: 'Hi,\n\nNoticed a pattern at companies like yours. Mind if I share what we found?', approach: 'Ultra-Short Curiosity' },
  ];

  if (!Array.isArray(data.variants) || data.variants.length === 0) {
    data.variants = defaultVariants;
  }
  data.variants = data.variants.slice(0, 3).map((v, i) => ({
    subject: String(v.subject || defaultVariants[i].subject),
    body:    String(v.body    || defaultVariants[i].body),
    approach: String(v.approach || defaultVariants[i].approach),
  }));

  // Normalise scores
  const defaultScores = { personalisation: 78, clarity: 82, cta: 76, readability: 80 };
  data.scores = (data.scores && typeof data.scores === 'object') ? data.scores : {};
  ['personalisation', 'clarity', 'cta', 'readability'].forEach(k => {
    data.scores[k] = (typeof data.scores[k] === 'number')
      ? Math.max(0, Math.min(100, data.scores[k]))
      : defaultScores[k];
  });

  data.tips = Array.isArray(data.tips) ? data.tips.slice(0, 3) : [];
  data.followUp = typeof data.followUp === 'string' ? data.followUp : '';
  data.bestTimeToSend = typeof data.bestTimeToSend === 'string'
    ? data.bestTimeToSend
    : 'Tuesday–Thursday, 8–10 am';

  // Detect spam words in generated text
  const allText = data.variants
    .map(v => `${v.subject} ${v.body}`)
    .join(' ')
    .toLowerCase();
  data.spamWords = SPAM_WORDS.filter(w => allText.includes(w.toLowerCase()));

  return data;
}

// ── Gemini Call with Retry ────────────────────────────────────────────────────
async function callGemini(apiKey, prompt, retries = 3) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.85, maxOutputTokens: 2500 },
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (res.status === 429) {
      if (attempt === retries) throw Object.assign(new Error('AI service is busy. Please try again in a moment.'), { status: 429 });
      const wait = Math.pow(2, attempt + 1) * 1000;
      console.warn(`[cold-email] Rate limited, waiting ${wait}ms (attempt ${attempt + 1})`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    return res;
  }
}

// ── Supabase Usage Limiter ────────────────────────────────────────────────────
async function checkAndIncrementUsage(req) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return { ok: true, isPro: false };

  try {
    const { createClient } = require('@supabase/supabase-js');
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return { ok: true, isPro: false };

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return { ok: true, isPro: false };

    const isPro = !!(
      user.user_metadata?.plan === 'pro' ||
      user.user_metadata?.isPro === true ||
      user.app_metadata?.plan === 'pro'
    );
    if (isPro) return { ok: true, isPro: true };

    const today = new Date().toISOString().split('T')[0];
    const { data: usage } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', user.id)
      .eq('tool', 'cold_email')
      .maybeSingle();

    if (!usage) {
      await supabase.from('usage_tracking').insert({ user_id: user.id, tool: 'cold_email', count: 1, reset_date: today });
      return { ok: true, isPro: false };
    }

    if (usage.reset_date < today) {
      await supabase.from('usage_tracking').update({ count: 1, reset_date: today }).eq('user_id', user.id).eq('tool', 'cold_email');
      return { ok: true, isPro: false };
    }

    if (usage.count >= 3) {
      return { ok: false, isPro: false, message: "You've used all 3 free emails today. Upgrade to Pro for unlimited access." };
    }

    await supabase.from('usage_tracking').update({ count: usage.count + 1 }).eq('user_id', user.id).eq('tool', 'cold_email');
    return { ok: true, isPro: false };

  } catch (err) {
    console.warn('[cold-email] Usage check non-fatal error:', err.message);
    return { ok: true, isPro: false }; // Fail open — don't block the user
  }
}

// ── Main Handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const b = req.body || {};
  const fields = {
    company:          String(b.company          || '').trim(),
    recipientTitle:   String(b.recipientTitle   || '').trim(),
    recipientName:    String(b.recipientName    || '').trim(),
    senderName:       String(b.senderName       || '').trim(),
    background:       String(b.background       || '').trim(),
    purpose:          String(b.purpose          || '').trim(),
    valueProposition: String(b.valueProposition || '').trim(),
    industry:         String(b.industry         || '').trim(),
    tone:             String(b.tone             || 'Professional').trim(),
    length:           String(b.length           || 'Short (Under 100 words)').trim(),
  };

  const required = ['company', 'recipientTitle', 'senderName', 'background', 'purpose', 'valueProposition', 'industry'];
  const missing = required.filter(k => !fields[k]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfiguration: GEMINI_API_KEY is not set.' });
  }

  // Usage limiting (non-fatal if Supabase unavailable)
  const usage = await checkAndIncrementUsage(req);
  if (!usage.ok) {
    return res.status(403).json({ error: usage.message, usageLimitReached: true });
  }

  const prompt = buildPrompt(fields);

  let geminiRes;
  try {
    geminiRes = await callGemini(apiKey, prompt);
  } catch (err) {
    console.error('[cold-email] Gemini call error:', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => '');
    console.error('[cold-email] Gemini HTTP error:', geminiRes.status, errText.slice(0, 300));
    return res.status(502).json({ error: `AI service returned error ${geminiRes.status}. Please try again.` });
  }

  let result;
  try {
    result = await geminiRes.json();
  } catch (e) {
    console.error('[cold-email] Failed to parse Gemini JSON response:', e.message);
    return res.status(502).json({ error: 'Unexpected response from AI service.' });
  }

  const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    console.error('[cold-email] Empty AI response:', JSON.stringify(result).slice(0, 300));
    return res.status(502).json({ error: 'AI service returned an empty response. Please try again.' });
  }

  const data = parseAIResponse(rawText);
  return res.status(200).json(data);
};
