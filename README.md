# careercraft-ai

AI-powered cover letter generator built with Google Gemini.

## Quick Setup (3 steps)

### 1. Get a free Gemini API key
Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) and create a key.

### 2. Configure your API key
```bash
cp .env.example .env
# Open .env and replace "your_gemini_api_key_here" with your key
```

### 3. Install dependencies and start
```bash
npm install && npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser. 🚀

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ Yes | Google Gemini API key from [AI Studio](https://aistudio.google.com/app/apikey) |
| `PORT` | No | Local server port (default: `3000`) |

---

## Project Structure

```
careercraft-ai/
├── server.js          # Express backend — handles /api/cover-letter
├── api/               # Vercel serverless functions (deployment)
│   ├── cover-letter.js
│   └── ai-suggestions.js
├── cover-letter.html  # Cover letter generator UI
├── dashboard.html
├── index.html
├── .env.example       # Copy to .env and fill in your API key
└── package.json
```

## How it works

1. Fill in the job title, company, and paste the job description
2. Add your key highlights (skills, achievements)
3. Choose tone and length
4. Click **✨ Generate** — the server calls the Gemini API and returns:
   - A professionally structured cover letter with proper paragraphs
   - 3 alternative variants
   - ATS keywords extracted from the job description
   - ATS score and relevance score

## Deployment

The `api/` folder contains Vercel-compatible serverless functions. Set `GEMINI_API_KEY` in your Vercel project environment variables and deploy normally.
