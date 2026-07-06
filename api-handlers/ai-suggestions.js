require('../utils/env-loader');
const { authenticateRequest } = require('../utils/supabase');
const { callGemini } = require('../utils/gemini');

function extractGeminiText(result) {
    const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
    const firstCandidate = candidates[0] || {};
    const parts = Array.isArray(firstCandidate?.content?.parts) ? firstCandidate.content.parts : [];

    // Gemini can split a single response across multiple text parts.
    return parts
        .map(part => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
        .trim();
}

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        await authenticateRequest(req);
    } catch (authErr) {
        console.error('[ai-suggestions] Authentication failure:', authErr.message);
        return res.status(authErr.status || 401).json({ error: authErr.message });
    }

    const { section, content, resumeData, options } = req.body || {};

    if (!section) {
        return res.status(400).json({ error: 'Missing required field: section' });
    }

    const systemPrompts = {
        summary:
            'You are an expert resume writer and ATS optimization coach. Rewrite the following professional summary ' +
            'to make it highly impactful, keyword-rich, and tailored for senior recruiters. Focus on the candidate\'s ' +
            'core expertise, value proposition, and key strengths. Keep it under 4 sentences. ' +
            'Return ONLY the improved summary text with no extra commentary, chat preambles, or formatting markup.',
        experience:
            'You are an expert resume writer and ATS coach. Optimize the following work experience bullet points. ' +
            'Ensure they: 1. Start with strong, active verbs (e.g., "Spearheaded", "Optimized", "Designed" instead of "Responsible for", "Helped with", "Worked on"). ' +
            '2. Emphasize quantifiable business achievements and outcomes. If the input lacks numbers/metrics, suggest realistic ' +
            'estimation placeholders (e.g. "[X]%" or "[Y] dollars") to prompt the user to fill them in. 3. Remain concise and clear. ' +
            'Return ONLY the improved text. Do not include conversational remarks, bullet marks, or markdown wrappers.',
        skills:
            'You are an expert resume writer. Analyze the candidate\'s current resume profile and suggest 8-12 ' +
            'high-impact technical and soft skills that are highly relevant to their role. ' +
            'Return ONLY a comma-separated list of skill names (e.g. "Project Management, Node.js, Agile"). ' +
            'Do not include conversational text, lists, numbers, or introduction sentences.',
        grammar:
            'You are a professional editor. Fix any grammar, spelling, and punctuation issues ' +
            'in the following text. Return only the corrected text with no additional commentary.',
    };

    let systemPrompt = systemPrompts[section] || systemPrompts.grammar;

    if (section === 'summary' && options) {
        const { wordLimit, tone, targetIndustry, selectedLanguage } = options;
        
        let limitClause = 'Keep it under 4 sentences.';
        if (wordLimit) {
            limitClause = `The summary must be approximately ${wordLimit} words long. Naturally structure the content to fit this length constraint without padding or awkward truncation.`;
        }
        
        let toneClause = 'highly impactful, keyword-rich, and tailored for senior recruiters. Focus on the candidate\'s core expertise, value proposition, and key strengths.';
        if (tone) {
            toneClause = `highly impactful, keyword-rich, and written in a ${tone} tone. Focus on the candidate\'s core expertise, value proposition, and key strengths.`;
        }

        let industryClause = '';
        if (targetIndustry) {
            industryClause = ` Tailor the summary specifically for the ${targetIndustry} industry.`;
        }

        let languageClause = '';
        if (selectedLanguage && selectedLanguage !== 'English') {
            languageClause = ` Return the summary written in the ${selectedLanguage} language.`;
        }

        systemPrompt = 
            `You are an expert resume writer and ATS optimization coach. Rewrite the following professional summary ` +
            `to make it ${toneClause} ${limitClause}${industryClause}${languageClause} ` +
            `Return ONLY the improved summary text with no extra commentary, chat preambles, or formatting markup.`;
    }

    const userContent =
        section === 'skills'
            ? JSON.stringify(resumeData || {})
            : (content || '');

    if (!userContent) {
        return res.status(400).json({ error: 'No content provided to improve.' });
    }

    try {
        console.log('Calling Gemini API for section:', section);
        
        // Call Google Gemini API using central helper
        const geminiRes = await callGemini({
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
                maxOutputTokens: 2048,
                temperature: 0.7,
            },
        });

        console.log('Gemini API Response Status:', geminiRes.status);

        if (!geminiRes.ok) {
            const errData = await geminiRes.json().catch(() => ({}));
            console.error('Gemini API Error:', errData);
            throw new Error(errData?.error?.message || `Gemini error: ${geminiRes.status}`);
        }

        const result = await geminiRes.json();
        console.log('[ai-suggestions] Raw Gemini response:', JSON.stringify(result));

        const suggestions = extractGeminiText(result);

        if (!suggestions) {
            throw new Error('No suggestions returned from Gemini API');
        }

        console.log('[ai-suggestions] Suggestions generated successfully. Length:', suggestions.length);
        return res.status(200).json({ suggestions });
    } catch (err) {
        console.error('[ai-suggestions] Error generating suggestions:', err);
        const status = err.status || 500;
        const msg = err.message || 'Failed to get AI suggestions.';
        return res.status(status).json({
            success: false,
            error: msg === 'GEMINI_API_KEY missing' || msg.includes('Gemini API key is not configured')
                ? 'Gemini API key is not configured on this server. Set GEMINI_API_KEY in your environment.'
                : msg
        });
    }
}
