# CareerCraft AI

AI-powered career tools: cover letter generator, resume builder, and more.

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Configure your API key(s)
cp .env.example .env
# Edit .env and add your Gemini API key(s)

# 3. Start the server
npm start
```

Open `http://localhost:5000` in your browser.

Use `npm run dev` for auto-reload during development.

## Multiple API Keys (Automatic Key Rotation)

When one API key is rate-limited, the server automatically rotates to the next available key.

In your `.env` file, choose one of these options:

**Option A – comma-separated list:**
```
GEMINI_API_KEYS=key1,key2,key3
```

**Option B – indexed variables:**
```
GEMINI_API_KEY_1=your_first_key
GEMINI_API_KEY_2=your_second_key
GEMINI_API_KEY_3=your_third_key
```

**Option C – single key (default):**
```
GEMINI_API_KEY=your_key
```

Get free API keys at [Google AI Studio](https://aistudio.google.com/app/apikey).

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/cover-letter` | Generate cover letter |

### POST /api/cover-letter

**Request body:**
```json
{
  "jobTitle": "Frontend Developer",
  "companyName": "Acme Corp",
  "jobDescription": "...",
  "highlights": "...",
  "tone": "Professional",
  "length": "Medium",
  "opening": "Dear Hiring Manager,",
  "closing": "Thank you for your time."
}
```

**Response:**
```json
{
  "letter": "...",
  "variants": ["...", "..."],
  "keywords_used": ["React", "TypeScript"],
  "ats_score": 85,
  "relevance_score": 90
}
```

## Deployment

### Vercel (recommended)
```bash
npm install -g vercel
vercel
```
Set `GEMINI_API_KEY` (or multiple keys) in your Vercel project environment variables.

### Heroku
```bash
heroku create your-app-name
heroku config:set GEMINI_API_KEY=your_key
git push heroku main
```

## Troubleshooting

**429 Rate Limited** – You have hit the free tier quota. Add more API keys for automatic rotation (see above), or wait for the quota to reset.

**"No Gemini API key configured"** – Ensure your `.env` file exists and contains at least one key.
