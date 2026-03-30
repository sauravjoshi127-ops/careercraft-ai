export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { jobTitle, companyName, jobDescription, highlights, tone, length, opening, closing } = req.body || {};
  if (!jobTitle || !companyName || !jobDescription) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Gemini API key not set.' });

  const prompt = `
You are a professional career writer. Generate:
1. A cover letter (tone: ${tone}, length: ${length})
2. 3 alternative variants
3. Extract 6-12 important keywords from the job description
4. Provide ATS score (0-100) and relevance score (0-100)

Return ONLY valid JSON. No markdown. No extra text.

{
 "letter": "...",
 "variants": ["...","...","..."],
 "keywords_used": ["keyword1","keyword2"],
 "ats_score": 85,
 "relevance_score": 90
}

Job Title: ${jobTitle}
Company: ${companyName}
Job Description: ${jobDescription}
Highlights: ${highlights}
Opening: ${opening}
Closing: ${closing}
`;

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 900 }
      })
    });

    const result = await r.json();
    let text = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Remove code fences if returned
    text = text.replace(/```json|```/g, '').trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI did not return JSON. Raw response: ' + text.slice(0, 200));

    const data = JSON.parse(jsonMatch[0]);
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
