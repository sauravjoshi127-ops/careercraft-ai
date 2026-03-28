export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { section, content, resumeData } = req.body || {};

    if (!section) {
        return res.status(400).json({ error: 'Missing required field: section' });
    }

    const systemPrompts = {
        summary:
            'You are a professional resume writer. Improve the following professional summary ' +
            'to be more impactful, concise, and compelling for recruiters. Keep it under 4 sentences. ' +
            'Return only the improved summary text with no extra commentary.',
        experience:
            'You are a professional resume writer. Improve the following work experience descriptions ' +
            'to use strong action verbs, highlight quantifiable achievements, and be more impactful. ' +
            'Return the improved text preserving the original structure. No extra commentary.',
        skills:
            'You are a professional resume writer. Based on the resume data provided, ' +
            'suggest 6-10 additional relevant technical and soft skills the candidate might have. ' +
            'Return ONLY a comma-separated list of skill names with no additional text or explanation.',
        grammar:
            'You are a professional editor. Fix any grammar, spelling, and punctuation issues ' +
            'in the following text. Return only the corrected text with no additional commentary.',
    };

    const systemPrompt = systemPrompts[section] || systemPrompts.grammar;
    const userContent =
        section === 'skills'
            ? JSON.stringify(resumeData || {})
            : (content || '');

    if (!userContent) {
        return res.status(400).json({ error: 'No content provided to improve.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Gemini API key is not configured on this server.' });
    }

    try {
        console.log('Calling Gemini API for section:', section);
        
        // Call Google Gemini API
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: `${systemPrompt}\n\nContent to improve:\n${userContent}`,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    maxOutputTokens: 600,
                    temperature: 0.7,
                },
            }),
        });

        console.log('Gemini API Response Status:', geminiRes.status);

        if (!geminiRes.ok) {
            const errData = await geminiRes.json().catch(() => ({}));
            console.error('Gemini API Error:', errData);
            throw new Error(errData?.error?.message || `Gemini error: ${geminiRes.status}`);
        }

        const result = await geminiRes.json();
        const suggestions = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        if (!suggestions) {
            throw new Error('No suggestions returned from Gemini API');
        }

        console.log('Suggestions generated successfully');
        return res.status(200).json({ suggestions });
    } catch (err) {
        console.error('AI suggestions error:', err);
        return res.status(500).json({ error: err.message || 'Failed to get AI suggestions.' });
    }
}
