require('./utils/env-loader');
const path = require('path');
const express = require('express');

// Schema synchronization safeguard
try {
  require('./verify-schema')();
} catch (err) {
  process.exit(1);
}

// Modular API Handlers
const uploadResumeHandler = require('./api-handlers/upload-resume');
const coverLetterHandler = require('./api-handlers/cover-letter');
const coldEmailHandler = require('./api-handlers/cold-email');
const aiSuggestionsHandler = require('./api-handlers/ai-suggestions');
const atsSuggestionsHandler = require('./api-handlers/ats-suggestions');
const deleteUserHandler = require('./api-handlers/delete-user');
const interviewCoachHandler = require('./api-handlers/interview-coach');
const generatePdfHandler = require('./api-handlers/generate-pdf');
const createOrderHandler = require('./api-handlers/create-order');
const verifyPaymentHandler = require('./api-handlers/verify-payment');
const debugGeminiHandler = require('./api-handlers/debug-gemini');

const app = express();
const PORT = process.env.PORT || 3000;

// Custom in-memory sliding window IP rate limiter for protecting Gemini AI API calls
const aiRateLimits = new Map();
function createAiRateLimiter(limit = 15, windowMs = 60000) {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
    const now = Date.now();

    if (!aiRateLimits.has(ip)) {
      aiRateLimits.set(ip, []);
    }

    const timestamps = aiRateLimits.get(ip).filter(time => now - time < windowMs);
    timestamps.push(now);
    aiRateLimits.set(ip, timestamps);

    if (timestamps.length > limit) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.'
      });
    }

    next();
  };
}
const aiLimiter = createAiRateLimiter(15, 60000);

app.use(express.json());
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// ─── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/config', (req, res) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(503).json({
      error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY. Configure these server environment variables (see README: Environment Variables & Secrets).'
    });
  }
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_ANON_KEY
  });
});

app.get('/api/debug/gemini', debugGeminiHandler);
app.post('/api/debug/gemini', debugGeminiHandler);

app.post('/api/upload-resume', uploadResumeHandler);
app.post('/api/cover-letter', aiLimiter, coverLetterHandler);
app.post('/api/cold-email', aiLimiter, coldEmailHandler);
app.post('/api/ai-suggestions', aiLimiter, aiSuggestionsHandler);
app.post('/api/ats-suggestions', aiLimiter, atsSuggestionsHandler);
app.post('/api/delete-user', deleteUserHandler);
app.post('/api/interview-coach', aiLimiter, interviewCoachHandler);
app.post('/api/generate-pdf', generatePdfHandler);
app.post('/api/create-order', createOrderHandler);
app.post('/api/verify-payment', verifyPaymentHandler);

// Serve index for all non-API routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Global error handler ────────────────────────────────────────────────────
// Catches any unhandled errors (including async throws in Express 4 routes)
// and always returns a JSON response so clients never receive an HTML error page.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  const status = typeof err.status === 'number' ? err.status : 500;
  const message = err.message || 'An unexpected server error occurred. Please try again.';
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 CareerCraft AI server running at http://localhost:${PORT}`);
    console.log(`   Press Ctrl+C to stop\n`);
  });
}

module.exports = app;
