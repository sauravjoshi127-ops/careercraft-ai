require('./utils/env-loader');
const path = require('path');
const express = require('express');

// Modular API Handlers
const uploadResumeHandler = require('./api-handlers/upload-resume');
const coverLetterHandler = require('./api-handlers/cover-letter');
const coldEmailHandler = require('./api-handlers/cold-email');
const aiSuggestionsHandler = require('./api-handlers/ai-suggestions');
const deleteUserHandler = require('./api-handlers/delete-user');
const interviewCoachHandler = require('./api-handlers/interview-coach');
const generatePdfHandler = require('./api-handlers/generate-pdf');
const createOrderHandler = require('./api-handlers/create-order');
const verifyPaymentHandler = require('./api-handlers/verify-payment');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// ─── Routes ─────────────────────────────────────────────────────────────────

app.post('/api/upload-resume', uploadResumeHandler);
app.post('/api/cover-letter', coverLetterHandler);
app.post('/api/cold-email', coldEmailHandler);
app.post('/api/ai-suggestions', aiSuggestionsHandler);
app.post('/api/delete-user', deleteUserHandler);
app.post('/api/interview-coach', interviewCoachHandler);
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
