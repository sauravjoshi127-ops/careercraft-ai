const { getApiKey } = require('../utils/gemini');

module.exports = function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const key = getApiKey();
    if (key) {
      return res.status(200).json({ configured: true });
    }
  } catch (err) {
    console.warn('[debug-gemini] Diagnostic check failed:', err.message);
  }

  return res.status(200).json({ configured: false });
};
