// Ensure environment variables are loaded (important for serverless functions bypassing server.js)
require('dotenv').config();

const MAX_INDEXED_KEYS = 10;

/**
 * Resolves all configured Gemini API keys from the environment.
 * Supports:
 * - GEMINI_API_KEYS (comma-separated list of keys)
 * - GEMINI_API_KEY_1 to GEMINI_API_KEY_10
 * - GEMINI_API_KEY (single fallback key)
 */
function getApiKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEYS) {
    keys.push(...process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean));
  }
  for (let i = 1; i <= MAX_INDEXED_KEYS; i++) {
    const key = process.env[`GEMINI_API_KEY_${i}`];
    if (key && key.trim()) keys.push(key.trim());
  }
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    const single = process.env.GEMINI_API_KEY.trim();
    if (!keys.includes(single)) keys.push(single);
  }
  return keys;
}

/**
 * Calls Gemini API with key rotation and retry logic for 429 rate limit responses.
 */
async function callGemini(body, maxRetries = 2) {
  const keys = getApiKeys();
  if (keys.length === 0) {
    throw new Error('Gemini API key is not configured on this server. Set GEMINI_API_KEY in your environment.');
  }

  let lastError = null;
  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    try {
      const response = await callGeminiWithRetry(apiKey, body, maxRetries);
      return response;
    } catch (err) {
      if (err.status === 429) {
        console.warn(`[Gemini] API Key ${i + 1} rate limited. Rotating to next key...`);
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('All Gemini API keys are rate limited. Please try again later.');
}

async function callGeminiWithRetry(apiKey, body, maxRetries) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (r.status !== 429) {
      return r;
    }

    const retryAfter = parseInt(r.headers.get('Retry-After') || '0', 10);
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt + 1) * 1000;
    console.warn(`[Gemini] Rate limited (429). Waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}.`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  // Final attempt (no retry after this)
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (r.status === 429) {
    const err = new Error('AI service is busy (rate limited). Please try again in a moment.');
    err.status = 429;
    throw err;
  }
  return r;
}

module.exports = {
  getApiKeys,
  callGemini
};
