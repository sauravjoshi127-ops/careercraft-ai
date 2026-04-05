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
├── server.js          # Express backend — /api/upload-resume, /api/cover-letter & /api/generate-pdf
├── utils/
│   ├── pdf-generator.js  # PDFKit-based PDF builder
│   └── scoring.js        # ATS & relevance score algorithms
├── api/               # Vercel serverless functions (deployment)
│   ├── upload-resume.js  # Parses uploaded PDF/DOCX and returns plain text
│   ├── cover-letter.js
│   ├── generate-pdf.js
│   └── ai-suggestions.js
├── cover-letter.html  # Cover letter generator UI
├── dashboard.html
├── index.html
├── .env.example       # Copy to .env and fill in your API key
└── package.json
```

## How it works

1. *(Optional)* Upload your resume (PDF or DOCX, max 5 MB) — the server extracts the text and passes it to the AI to personalise the letter
2. Fill in the job title, company, and paste the job description
3. Add your key highlights (skills, achievements)
4. Choose tone and length
5. Click **✨ Generate** — the server calls the Gemini API and returns:
   - A professionally structured cover letter following the [Indeed best-practice format](https://www.indeed.com/career-advice/resumes-cover-letters/how-to-write-a-cover-letter):
     1. Date
     2. Formal greeting / salutation
     3. Opening paragraph (role, company, enthusiasm)
     4. Skills & experience paragraph (quantified achievements)
     5. Company fit paragraph (mission, culture, values)
     6. Closing paragraph (call to action)
     7. Professional sign-off
   - 3 alternative variants at different tones/angles
   - ATS keywords extracted from the job description
   - ATS score and relevance score (calculated server-side, shown on-screen only — **never in the PDF**)

### Resume Upload

Click the upload area (or drag-and-drop) in the cover letter generator to upload your resume. The browser POSTs the file to `POST /api/upload-resume`.

- **Accepted formats:** PDF and DOCX (`.pdf` / `.docx`)
- **Maximum file size:** 5 MB
- The server accepts files regardless of what MIME type the browser reports — it falls back to the file extension when the browser sends a generic `application/octet-stream` type (common on mobile and some desktop browsers)
- The server extracts plain text using [pdf-parse](https://www.npmjs.com/package/pdf-parse) (PDF) or [mammoth](https://www.npmjs.com/package/mammoth) (DOCX) and returns it as JSON
- The extracted text is automatically included in the cover letter generation prompt so the AI can reference your actual experience and skills
- Enable **Mirror my resume structure** to ask the AI to match the layout and voice of your resume
- Scanned/image-only PDFs cannot be parsed; the server returns a clear `422` error message in that case
- Encrypted or corrupted PDFs return a `422` error with a specific reason — not a generic 500
- If upload fails, the UI shows the **actual reason** (wrong file type, file too large, parse error, network error) — not a generic "try again" message
- Server-side console logs (`[upload]`) trace the full upload flow for debugging

### PDF Download

Click **⬇ Download PDF** after generating a letter. The browser sends the letter content and metadata to `POST /api/generate-pdf`, which uses [PDFKit](https://pdfkit.org/) to build a professional A4 PDF with:

- Candidate name (if provided) and date header
- Job title and company sub-header
- Full letter body with correct paragraph spacing
- CareerCraft AI footer

The server streams the finished PDF back as an `application/pdf` attachment, which the browser saves to your downloads folder. No third-party PDF libraries are loaded in the browser.

## Deployment

The `api/` folder contains Vercel-compatible serverless functions. Set `GEMINI_API_KEY` in your Vercel project environment variables and deploy normally.
