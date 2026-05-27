const fs = require('fs');
const path = 'c:/Users/saura/.gemini/antigravity/scratch/careercraft-ai/resume.html';
let content = fs.readFileSync(path, 'utf8');

const oldAI = `    try {
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
            throw new Error(result.error || \`API Error: \${response.status}\`);
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
}`;

const newAI = `    let attempts = 0;
    const maxAttempts = 2;

    async function attempt() {
        attempts++;
        try {
            console.log(\`📤 AI request (Attempt \${attempts}/\${maxAttempts}) for:\`, section);
            
            const response = await fetch('/api/ai-suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ section, content, resumeData }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || \`API Error: \${response.status}\`);

            currentAISuggestion = result.suggestions || '';
            box.textContent = currentAISuggestion || '(No suggestion returned)';

            if (currentAISuggestion && (section === 'summary' || section === 'skills')) {
                acceptBtn.style.display = 'inline-flex';
            }
            resetAIButton(btn);
        } catch (err) {
            console.error(\`❌ AI Attempt \${attempts} failed:\`, err);
            if (attempts < maxAttempts) {
                box.textContent = \`⚠️ Attempt \${attempts} failed. Retrying...\`;
                setTimeout(attempt, 1000);
            } else {
                box.textContent = '❌ Error: ' + err.message + '\\n\\nPlease try again later.';
                resetAIButton(btn);
            }
        }
    }

    attempt();
}`;

// Use a more robust way to find and replace the AI block
const aiStartMarker = "async function getAISuggestions(section, btn) {";
const aiEndMarker = "resetAIButton();\n    }\n}";

// Wait, the current file has "async function getAISuggestions(section, btn) {" already!
// But the body is the old one.

if (content.includes(oldAI)) {
    content = content.replace(oldAI, newAI);
    console.log("Replaced AI block");
} else {
    console.log("Could not find exact AI block, trying regex...");
    // Find the try block inside getAISuggestions
    const regex = /try\s*{\s*console\.log\('📤 Sending AI request for section:', section\);[\s\S]*?resetAIButton\(\);\s*}\s*}/;
    if (regex.test(content)) {
        content = content.replace(regex, newAI);
        console.log("Replaced AI block with regex");
    } else {
        console.log("Regex failed too.");
    }
}

// 2. Update PDF template parts
const oldModernParts = /const expHTML = exp\.filter[\s\S]*?\.join\(''\);[\s\S]*?const eduHTML = edu\.filter[\s\S]*?\.join\(''\);[\s\S]*?const skHTML = sk\.filter[\s\S]*?\.join\(''\);/;
const newModernParts = `    const expHTML = Renderer.experience(exp, '#1a1a2e', true);
    const eduHTML = Renderer.education(edu, true);
    const skHTML = Renderer.skills(sk, true);`;

if (oldModernParts.test(content)) {
    content = content.replace(oldModernParts, newModernParts);
    console.log("Replaced Modern template parts");
}

fs.writeFileSync(path, content);
console.log("Finished");
