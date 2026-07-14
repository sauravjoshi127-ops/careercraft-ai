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

    // ── Utility: Infer experience level from resume data ──
    function inferExperienceLevel(resumeData) {
        const expCount = (resumeData?.experience || []).length;
        const titleLower = ((resumeData?.experience?.[0]?.title) || '').toLowerCase();
        if (titleLower.includes('senior') || titleLower.includes('lead') || titleLower.includes('principal') || titleLower.includes('staff') || expCount >= 4) return 'senior';
        if (titleLower.includes('junior') || titleLower.includes('associate') || titleLower.includes('intern') || expCount <= 1) return 'entry';
        return 'mid';
    }

    // ── Utility: Infer industry from resume data ──
    function inferIndustry(resumeData) {
        const companies = (resumeData?.experience || []).map(e => e.company || '').join(' ');
        const title = (resumeData?.experience?.[0]?.title || '') + ' ' + (resumeData?.full_name || '');
        const text = (companies + ' ' + title).toLowerCase();
        if (text.match(/software|engineer|developer|frontend|backend|fullstack|devops|cloud|sre|platform|data|ml|ai|machine learning/)) return 'Software Engineering / Technology';
        if (text.match(/product|pm|product manager/)) return 'Product Management';
        if (text.match(/marketing|seo|content|brand|growth|paid media/)) return 'Marketing';
        if (text.match(/sales|account executive|business development|revenue/)) return 'Sales';
        if (text.match(/finance|accounting|controller|cfo|analyst|investment|banking/)) return 'Finance';
        if (text.match(/design|ux|ui|creative|visual|graphic/)) return 'Design';
        if (text.match(/healthcare|nurse|physician|clinical|medical|pharma/)) return 'Healthcare';
        if (text.match(/hr|people|recruiter|talent|learning/)) return 'Human Resources';
        if (text.match(/operations|supply chain|logistics|procurement/)) return 'Operations';
        return 'General Professional';
    }

    const systemPrompts = {
        summary:
            'You are an expert resume writer and ATS optimization coach. Rewrite the following professional summary ' +
            'to make it highly impactful, keyword-rich, and tailored for senior recruiters. Focus on the candidate\'s ' +
            'core expertise, value proposition, and key strengths. Keep it under 4 sentences. ' +
            'Return ONLY the improved summary text with no extra commentary, chat preambles, or formatting markup.',
        skills:
            'You are an expert resume writer. Analyze the candidate\'s current resume profile and suggest 8-12 ' +
            'high-impact technical and soft skills that are highly relevant to their role. ' +
            'Return ONLY a comma-separated list of skill names (e.g. "Project Management, Node.js, Agile"). ' +
            'Do not include conversational text, lists, numbers, or introduction sentences.',
        grammar:
            'You are a professional editor. Fix any grammar, spelling, and punctuation issues ' +
            'in the following text. Return only the corrected text with no additional commentary.',
    };

    let systemPrompt = systemPrompts[section];

    // ── Build experience prompt with rich context ──
    if (section === 'experience') {
        const expLevel = inferExperienceLevel(resumeData);
        const industry = options?.targetIndustry || inferIndustry(resumeData);
        const tone = options?.tone || 'Professional';
        const currentTitle = (resumeData?.experience || []).find(e => e.description)?.title || '';
        const currentCompany = (resumeData?.experience || []).find(e => e.description)?.company || '';

        const levelGuidance = {
            entry: 'Write for an entry-level candidate. Focus on responsibilities, learning, and contributions rather than large-scale impact.',
            mid: 'Write for a mid-level professional. Balance ownership, project impact, cross-functional work, and quantified results.',
            senior: 'Write for a senior professional. Emphasize leadership, strategic impact, scaled outcomes, mentorship, and business metrics.'
        }[expLevel];

        const hasContent = (content || '').trim().length > 20;
        const dataHint = hasContent
            ? ''
            : '\n\nNOTE: The user provided minimal details. Write the strongest possible professional draft based on the job title and company context. ' +
              'Use realistic, plausible placeholder metrics in brackets (e.g., "[X]%", "[N] team members") and include a comment at the END of the output on a new line: ' +
              '"Note: Add your actual metrics to make this description stronger."';

        systemPrompt =
            `You are an elite resume writer and ATS optimization specialist with deep expertise in the ${industry} industry.

YOUR TASK: Transform the candidate's work experience description into 3–5 polished, ATS-optimized bullet points.

CANDIDATE CONTEXT:
- Role: ${currentTitle || 'Not specified'}
- Company: ${currentCompany || 'Not specified'}
- Industry: ${industry}
- Experience Level: ${expLevel} (${levelGuidance})
- Writing Tone: ${tone}

QUALITY REQUIREMENTS — strictly follow all of these:
1. START STRONG: Every bullet MUST begin with a powerful past-tense action verb. Vary verbs across bullets.
   Excellent verbs: Architected, Spearheaded, Orchestrated, Engineered, Accelerated, Delivered, Automated, Reduced, Increased, Launched, Drove, Optimized, Established, Scaled, Mentored, Negotiated, Streamlined, Transformed
   NEVER use: "Responsible for", "Helped with", "Assisted in", "Worked on", "Handled", "Involved in"

2. QUANTIFY: Include specific metrics and business impact in EVERY bullet where possible.
   - If the user provided numbers, use them exactly.
   - If not, insert realistic estimation placeholders in brackets: [X]%, [$Y], [N] users, [Z] months, [W] team members
   - Examples: "Reduced deployment time by [45]%", "Generated [$2M] in ARR", "Led a team of [8] engineers"

3. ATS-OPTIMIZED: Naturally weave in industry-relevant keywords that applicant tracking systems look for.
   - Use the exact terminology used in modern ${industry} job descriptions
   - Include both the spelled-out form and acronym where applicable (e.g., "machine learning (ML)")

4. IMPACT-DRIVEN: Every bullet should answer: "So what?" — what was the measurable business outcome?

5. CONCISE: Each bullet should be 1–2 lines. No run-on sentences. No generic filler.

6. HUMAN VOICE: Avoid AI-sounding phrases. Use confident, active, professional language that sounds like a real person wrote it.

7. AVOID REPETITION: Do not repeat the same verb or the same theme across multiple bullets.

OUTPUT FORMAT:
- Return ONLY the bullet points, one per line, each starting with a dash (-)
- No preamble, no commentary, no markdown headers${dataHint}`;
    }

    if (!systemPrompt) systemPrompt = systemPrompts.grammar;

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
        console.log('[ai-suggestions] Calling generation API for section:', section);
        
        // Call generation API using central helper
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

        console.log('[ai-suggestions] Generation API response status:', geminiRes.status);

        if (!geminiRes.ok) {
            const errData = await geminiRes.json().catch(() => ({}));
            console.error('[ai-suggestions] Generation API error:', errData); // Internal log only
            const status = geminiRes.status;
            if (status === 429) throw Object.assign(new Error('rate_limit'), { status: 429 });
            if (status === 503 || status === 502) throw Object.assign(new Error('service_unavailable'), { status: 503 });
            throw Object.assign(new Error('generation_failed'), { status: 500 });
        }

        const result = await geminiRes.json();
        console.log('[ai-suggestions] Generation API raw response received, length:', JSON.stringify(result).length);

        const suggestions = extractGeminiText(result);

        if (!suggestions) {
            console.error('[ai-suggestions] Empty response from generation API.');
            throw Object.assign(new Error('empty_response'), { status: 500 });
        }

        console.log('[ai-suggestions] Content generated successfully. Length:', suggestions.length);
        return res.status(200).json({ suggestions });
    } catch (err) {
        // Always log the real error server-side for debugging
        console.error('[ai-suggestions] Generation error (internal):', err.message, err.stack);

        const status = err.status || 500;

        // Map internal error codes to user-facing branded messages
        const userFacingMessages = {
            rate_limit: 'Content generation is temporarily busy. Please wait a moment and try again.',
            service_unavailable: 'Generation is temporarily unavailable. Please retry in a moment.',
            empty_response: 'We couldn\'t generate content right now. Please try again.',
            generation_failed: 'Something went wrong while generating your content. Please try again.'
        };

        const userMsg = userFacingMessages[err.message] ||
            (err.message === 'GEMINI_API_KEY missing' || (err.message || '').toLowerCase().includes('api key')
                ? 'Content generation is not configured on this server.'
                : 'We couldn\'t generate content right now. Please try again in a moment.');

        return res.status(status).json({
            success: false,
            error: userMsg
        });
    }
}
