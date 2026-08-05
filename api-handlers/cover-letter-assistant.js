const { authenticateRequest } = require('../utils/supabase');
const { callGemini } = require('../utils/gemini');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await authenticateRequest(req);
  } catch (authErr) {
    console.error('[cover-letter-assistant] Authentication failure:', authErr.message);
    return res.status(authErr.status || 401).json({ error: authErr.message });
  }

  const { mode, selectedText, letterText, action, jobTitle, companyName, tone, message } = req.body || {};

  if (!mode) {
    return res.status(400).json({ error: 'Missing required field: mode' });
  }

  try {
    if (mode === 'chat') {
      const chatPrompt = `You are an expert career writing coach. The user is asking you for help with their cover letter.
      
Context: 
Target Job: ${jobTitle || 'Not specified'}
Target Company: ${companyName || 'Not specified'}
Target Tone: ${tone || 'Professional'}

Current Cover Letter:
${letterText || 'None provided'}

User's Request: ${message}

Provide a helpful, actionable, and encouraging response as a career coach. If suggesting changes, show them clearly.`;

      const rr = await callGemini({
        contents: [{ parts: [{ text: chatPrompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      });
      if (!rr.ok) throw new Error('AI chat failed');
      const rResult = await rr.json();
      const reply = rResult?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return res.status(200).json({ reply: reply.trim() });
    }

    if (mode === 'quick_action') {
      if (!selectedText) {
        return res.status(400).json({ error: 'No text selected for rewriting.' });
      }

      let actionInstruction = '';
      switch (action) {
        case 'rewrite':
          actionInstruction = 'Rewrite to be more professional, polished, and impactful. Improve clarity and remove any filler language.';
          break;
        case 'grammar':
          actionInstruction = 'Fix any grammar, spelling, or punctuation issues. Do not drastically change the structure unless necessary for grammatical correctness.';
          break;
        case 'tone':
          actionInstruction = `Rewrite the text specifically to sound more ${tone || 'Professional'}. Adjust vocabulary and phrasing accordingly.`;
          break;
        case 'ats':
          actionInstruction = 'Optimize the text for ATS (Applicant Tracking Systems) by ensuring action verbs are strong and keywords related to the job title and standard industry terms are naturally woven in.';
          break;
        case 'concise':
          actionInstruction = 'Make the text significantly more concise and punchy. Remove unnecessary words and tighten the phrasing without losing core meaning.';
          break;
        case 'humanize':
          actionInstruction = 'Rewrite the text so it sounds more natural, human, and conversational, while remaining professional. Remove robotic or overly corporate "AI-sounding" jargon.';
          break;
        case 'opening':
          actionInstruction = 'Rewrite this text to be a much stronger, more captivating opening statement for a cover letter. It should grab the reader\'s attention and show immediate enthusiasm and value.';
          break;
        case 'closing':
          actionInstruction = 'Rewrite this text to be a stronger, more confident closing statement. It should reiterate interest, propose next steps (like an interview), and leave a lasting positive impression.';
          break;
        case 'persuasive':
          actionInstruction = 'Rewrite to be significantly more persuasive, compelling, and impactful. Use stronger action verbs and confident language.';
          break;
        default:
          actionInstruction = 'Improve the text.';
      }

      const rewritePrompt = `You are a professional cover letter editor and career coach. ${actionInstruction}

Context:
Job Title: ${jobTitle || 'Not specified'}
Company: ${companyName || 'Not specified'}
Target Tone: ${tone || 'Professional'}

Original Text:
${selectedText}

You must return your response as a valid JSON object with the following fields:
{
  "suggestedText": "The fully rewritten text",
  "explanation": "A one or two sentence explanation of why this suggestion improves the text (e.g., 'Removed passive voice and added stronger action verbs.')"
}

Do not include any other text or markdown formatting outside the JSON object.`;

      const rr = await callGemini({
        contents: [{ parts: [{ text: rewritePrompt }] }],
        generationConfig: { temperature: 0.65, maxOutputTokens: 512 }
      });
      if (!rr.ok) throw new Error('AI rewrite failed');
      const rResult = await rr.json();
      let text = rResult?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      let parsed = { suggestedText: selectedText, explanation: "No changes made." };
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        // Fallback
        parsed.suggestedText = text;
        parsed.explanation = "Improved text based on requested action.";
      }
      return res.status(200).json(parsed);
    }

    if (mode === 'review_paragraph') {
      if (!selectedText) {
        return res.status(400).json({ error: 'No paragraph selected for review.' });
      }

      const reviewPrompt = `You are an elite career coach. Review the following paragraph from a cover letter and provide an actionable, improved version.
      
Context:
Job Title: ${jobTitle || 'Not specified'}
Company: ${companyName || 'Not specified'}
Target Tone: ${tone || 'Professional'}

Original Paragraph:
${selectedText}

Identify weaknesses such as weak verbs, lack of metrics, generic statements, or poor flow. Provide a rewritten paragraph that addresses these issues. 

You must return your response as a valid JSON object with the following fields:
{
  "suggestedText": "The fully improved paragraph",
  "explanation": "A concise explanation of why this is better (e.g., 'Strengthened the impact by leading with quantified metrics.')",
  "keywordsInserted": ["keyword1", "keyword2"]
}

Do not include any other text or markdown formatting outside the JSON object.`;

      const rr = await callGemini({
        contents: [{ parts: [{ text: reviewPrompt }] }],
        generationConfig: { temperature: 0.65, maxOutputTokens: 512 }
      });
      
      if (!rr.ok) throw new Error('AI review failed');
      const rResult = await rr.json();
      let text = rResult?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      
      let parsed = { suggestedText: selectedText, explanation: "No issues found.", keywordsInserted: [] };
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        parsed.suggestedText = text;
        parsed.explanation = "Improved paragraph.";
      }
      return res.status(200).json(parsed);
    }

    return res.status(400).json({ error: 'Invalid mode' });

  } catch (error) {
    console.error('[cover-letter-assistant] Error:', error);
    return res.status(500).json({ error: 'Internal server error processing AI assistant request.' });
  }
};
