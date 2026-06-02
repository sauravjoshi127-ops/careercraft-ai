const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');

// Modular API Handlers
const uploadResumeHandler = require('./api/upload-resume');
const coverLetterHandler = require('./api/cover-letter');
const coldEmailHandler = require('./api/cold-email');
const aiSuggestionsHandler = require('./api/ai-suggestions');
const deleteUserHandler = require('./api/delete-user');
const interviewCoachHandler = require('./api/interview-coach');
const generatePdfHandler = require('./api/generate-pdf');
const createOrderHandler = require('./api/create-order');
const verifyPaymentHandler = require('./api/verify-payment');

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
