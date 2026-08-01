const fs = require('fs');

function fixJS() {
    let text = fs.readFileSync('cover-letter.js', 'utf-8');
    
    // Replace textContent updates with innerHTML where icons are used
    text = text.replace(/generateBtn\.textContent = '⏳ Generating...';/g, "generateBtn.innerHTML = '<i data-lucide=\"loader-2\" class=\"spin\" width=\"16\"></i> Generating...';\n      if(window.lucide) lucide.createIcons();");
    text = text.replace(/generateBtn\.textContent = '⏳ Analyzing...';/g, "generateBtn.innerHTML = '<i data-lucide=\"loader-2\" class=\"spin\" width=\"16\"></i> Analyzing...';\n      if(window.lucide) lucide.createIcons();");
    text = text.replace(/generateBtn\.textContent = '⏳ Optimizing...';/g, "generateBtn.innerHTML = '<i data-lucide=\"loader-2\" class=\"spin\" width=\"16\"></i> Optimizing...';\n      if(window.lucide) lucide.createIcons();");
    text = text.replace(/generateBtn\.textContent = '⏳ Finalizing...';/g, "generateBtn.innerHTML = '<i data-lucide=\"loader-2\" class=\"spin\" width=\"16\"></i> Finalizing...';\n      if(window.lucide) lucide.createIcons();");
    
    text = text.replace(/reBtn\.textContent = '⏳ Analyzing...';/g, "reBtn.innerHTML = '<i data-lucide=\"loader-2\" class=\"spin\" width=\"16\"></i> Analyzing...';\n      if(window.lucide) lucide.createIcons();");
    text = text.replace(/reBtn\.textContent = '🔄 Re-analyze ATS';/g, "reBtn.innerHTML = '<i data-lucide=\"refresh-cw\" width=\"16\"></i> Re-analyze ATS';\n        if(window.lucide) lucide.createIcons();");
    
    text = text.replace(/downloadBtn\.textContent = '⏳ Printing...';/g, "downloadBtn.innerHTML = '<i data-lucide=\"loader-2\" class=\"spin\" width=\"16\"></i> Printing...';\n        if(window.lucide) lucide.createIcons();");
    
    // Emojis in strings
    text = text.replace(/🚀/g, '');
    text = text.replace(/❌/g, 'Error:');
    text = text.replace(/⚠️/g, 'Warning:');
    
    // Emojis in innerHTML
    text = text.replace(/>✓</g, '><i data-lucide="check" width="20"></i><');
    text = text.replace(/↺ Try Again/g, '<i data-lucide="rotate-ccw" width="14"></i> Try Again');
    
    // Loader in listEl
    text = text.replace(/⏳ Analyzing your cover letter for improvements\.\.\./g, '<i data-lucide="loader-2" class="spin" width="14"></i> Analyzing your cover letter for improvements...');
    
    // Priority colors
    text = text.replace(/const priorityColor = s\.priority === 'High' \? '🔴' : s\.priority === 'Medium' \? '🟡' : '🟢';/g, "const priorityColor = s.priority === 'High' ? '<i data-lucide=\"arrow-up\" style=\"color:var(--danger)\" width=\"14\"></i>' : s.priority === 'Medium' ? '<i data-lucide=\"minus\" style=\"color:var(--warning)\" width=\"14\"></i>' : '<i data-lucide=\"arrow-down\" style=\"color:var(--success)\" width=\"14\"></i>';");
    
    // showToast emoji
    text = text.replace(/⏳ AI \$\{action === 'persuasive' \? 'making it persuasive' : 'rewriting'\}\.\.\./g, "AI ${action === 'persuasive' ? 'making it persuasive' : 'rewriting'}...");
    text = text.replace(/✨ Selection improved!/g, "Selection improved!");
    
    // Other unicode chars like … and — we can keep, as they are standard typographics.
    
    fs.writeFileSync('cover-letter.js', text, 'utf-8');
    console.log("Fixed cover-letter.js");
}

fixJS();
