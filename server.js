require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const coverLetterHandler = require('./api/cover-letter');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Cover letter generation
app.post('/api/cover-letter', coverLetterHandler);

app.listen(PORT, () => {
  console.log(`CareerCraft AI server running on http://localhost:${PORT}`);
});
