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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API key is not configured on this server.' });
    }

    try {
        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent },
                ],
                max_tokens: 600,
                temperature: 0.7,
            }),
        });

        if (!openaiRes.ok) {
            const errData = await openaiRes.json().catch(() => ({}));
            throw new Error(errData?.error?.message || `OpenAI error: ${openaiRes.status}`);
        }

        const result = await openaiRes.json();
        const suggestions = result.choices?.[0]?.message?.content?.trim() || '';

        return res.status(200).json({ suggestions });
    } catch (err) {
        console.error('AI suggestions error:', err);
        return res.status(500).json({ error: err.message || 'Failed to get AI suggestions.' });
    }
}
