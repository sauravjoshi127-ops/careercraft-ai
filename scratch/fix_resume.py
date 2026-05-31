import os

path = r"c:\Users\saura\.gemini\antigravity\scratch\careercraft-ai\resume.html"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update AI suggestions block
old_ai_block = """    try {
        console.log('📤 Sending AI request for section:', section);
        console.log('📝 Content:', content);
        
        const response = await fetch('/api/ai-suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section, content, resumeData }),
        });

        console.log('📨 Response status:', response.status);
        
        const result = await response.json();
        console.log('📦 API Result:', result);

        if (!response.ok) {
            throw new Error(result.error || `API Error: ${response.status}`);
        }

        currentAISuggestion = result.suggestions || '';
        box.textContent = currentAISuggestion || '(No suggestion returned)';

        if (currentAISuggestion && (section === 'summary' || section === 'skills')) {
            acceptBtn.style.display = 'inline-flex';
        }
    } catch (err) {
        console.error('❌ AI Suggestions Error:', err);
        box.textContent = '❌ Error: ' + err.message;
        resetAIButton();
    }
}"""

new_ai_block = """    let attempts = 0;
    const maxAttempts = 2;

    async function attempt() {
        attempts++;
        try {
            console.log(`📤 AI request (Attempt ${attempts}/${maxAttempts}) for:`, section);
            
            const response = await fetch('/api/ai-suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ section, content, resumeData }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `API Error: ${response.status}`);

            currentAISuggestion = result.suggestions || '';
            box.textContent = currentAISuggestion || '(No suggestion returned)';

            if (currentAISuggestion && (section === 'summary' || section === 'skills')) {
                acceptBtn.style.display = 'inline-flex';
            }
            resetAIButton(btn);
        } catch (err) {
            console.error(`❌ AI Attempt ${attempts} failed:`, err);
            if (attempts < maxAttempts) {
                box.textContent = `⚠️ Attempt ${attempts} failed. Retrying...`;
                setTimeout(attempt, 1000);
            } else {
                box.textContent = '❌ Error: ' + err.message + '\\n\\nPlease try again later.';
                resetAIButton(btn);
            }
        }
    }

    attempt();
}"""

# Use a more flexible search for the AI block (ignoring whitespace differences)
if old_ai_block in content:
    content = content.replace(old_ai_block, new_ai_block)
else:
    print("Could not find exact AI block, trying partial match...")
    # Try a partial match for the try/catch
    if "try {\n        console.log('📤 Sending AI request for section:', section);" in content:
         # Find the end of the function
         start_idx = content.find("try {\n        console.log('📤 Sending AI request for section:', section);")
         # This is risky, but let's try to find the next "resetAIButton();\n    }\n}"
         end_marker = "resetAIButton();\n    }\n}"
         end_idx = content.find(end_marker, start_idx)
         if end_idx != -1:
             content = content[:start_idx] + new_ai_block + content[end_idx + len(end_marker):]

# 2. Update PDF template generation (Modern)
old_modern_parts = """    const expHTML = exp.filter(e => e.title || e.company).map(e => `
        <div style="margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
                <strong style="font-size:13px;color:#1a1a2e;">${escapeHtml(e.title || 'Position')}</strong>
                <span style="font-size:11px;color:#64748b;white-space:nowrap;margin-left:8px;">${escapeHtml(e.start || '')}${e.end ? ' – ' + escapeHtml(e.end) : ''}</span>
            </div>
            <div style="font-size:12px;color:#222222;margin-bottom:4px;">${escapeHtml(e.company || 'Company')}</div>
            <div style="font-size:12px;color:#475569;line-height:1.65;">${escapeHtml(e.description || '').replace(/\\n/g, '<br>')}</div>
        </div>
    `).join('');

    const eduHTML = edu.filter(e => e.degree || e.school).map(e => `
        <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
                <strong style="font-size:13px;color:#1a1a2e;">${escapeHtml(e.degree || 'Degree')}</strong>
                <span style="font-size:11px;color:#64748b;margin-left:8px;">${escapeHtml(e.year || '')}</span>
            </div>
            <div style="font-size:12px;color:#222222;">${escapeHtml(e.school || 'School')}${e.grade ? ' · ' + escapeHtml(e.grade) : ''}</div>
        </div>
    `).join('');

    const skHTML = sk.filter(s => s).map(s => 
        `<span style="display:inline-block;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);color:#222222;padding:4px 10px;border-radius:20px;font-size:11px;margin:3px;white-space:nowrap;">${escapeHtml(s)}</span>`
    ).join('');"""

new_modern_parts = """    const expHTML = Renderer.experience(exp, '#1a1a2e', true);
    const eduHTML = Renderer.education(edu, true);
    const skHTML = Renderer.skills(sk, true);"""

if old_modern_parts in content:
    content = content.replace(old_modern_parts, new_modern_parts)
else:
    print("Could not find exact modern template parts.")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Finished processing resume.html")
