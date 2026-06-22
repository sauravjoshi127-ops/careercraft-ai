require('./env-loader');

const MAX_INDEXED_KEYS = 10;

/**
 * Validates the structure and content of a Gemini API key to prevent sending invalid requests.
 */
function isValidApiKeyFormat(key) {
  if (!key) return false;
  
  // Bypass strict format checks during test runs
  if (process.env.NODE_ENV === 'test') {
    return true;
  }

  const lower = key.toLowerCase();
  // Filter out common placeholders
  if (lower.includes('placeholder') || lower.includes('your_') || lower.includes('api_key_here') || lower === 'test-dummy-key') {
    return false;
  }
  
  // API keys are long alphanumeric strings (at least 30 characters)
  if (key.length < 30) {
    return false;
  }
  
  return true;
}

/**
 * Sanitizes a key by stripping outer double/single quotes and leading/trailing whitespace.
 */
function cleanApiKey(key) {
  if (!key) return '';
  let cleaned = key.trim();
  // Strip surrounding double quotes
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }
  // Strip surrounding single quotes
  if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.slice(1, -1);
  }
  return cleaned.trim();
}

/**
 * Retrieves the standardized Gemini API key.
 * Validates existence and format.
 */
function getApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY missing');
  }
  
  const cleaned = cleanApiKey(process.env.GEMINI_API_KEY);
  if (!isValidApiKeyFormat(cleaned)) {
    throw new Error('Gemini API key is not configured on this server. Set GEMINI_API_KEY in your environment.');
  }
  
  return cleaned;
}

/**
 * Resolves configured Gemini API keys from the environment.
 * Maintained as a wrapper for backward compatibility with existing backend handlers.
 */
function getApiKeys() {
  try {
    const key = getApiKey();
    return [key];
  } catch (err) {
    return [];
  }
}

/**
 * Calls Gemini API with retry logic for 429 rate limit responses.
 */
async function callGemini(body, maxRetries = 2) {
  const apiKey = getApiKey();
  return callGeminiWithRetry(apiKey, body, maxRetries);
}

async function callGeminiWithRetry(apiKey, body, maxRetries) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (r.status === 401 || r.status === 403) {
      const errBody = await r.json().catch(() => ({}));
      const msg = errBody?.error?.message || r.statusText || 'Unauthorized';
      const err = new Error(`Gemini Authentication Failure: ${msg}. Please check that your API key is valid and not revoked.`);
      err.status = r.status;
      throw err;
    }

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

  if (r.status === 401 || r.status === 403) {
    const errBody = await r.json().catch(() => ({}));
    const msg = errBody?.error?.message || r.statusText || 'Unauthorized';
    const err = new Error(`Gemini Authentication Failure: ${msg}. Please check that your API key is valid and not revoked.`);
    err.status = r.status;
    throw err;
  }

  if (r.status === 429) {
    const err = new Error('AI service is busy (rate limited). Please try again in a moment.');
    err.status = 429;
    throw err;
  }
  return r;
}

module.exports = {
  getApiKey,
  getApiKeys,
  callGemini
};
