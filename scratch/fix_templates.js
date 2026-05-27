const fs = require('fs');
const path = 'c:/Users/saura/.gemini/antigravity/scratch/careercraft-ai/resume.html';
let content = fs.readFileSync(path, 'utf8');

// 1. Replace all esc( with escapeHtml(
content = content.replace(/esc\(/g, 'escapeHtml(');

// 2. Update Classic Template parts
const oldClassicExp = /const expHTML = exp\.filter[\s\S]*?\.join\(''\);[\s\S]*?const eduHTML = edu\.filter[\s\S]*?\.join\(''\);/;
const newClassicParts = `    const expHTML = Renderer.experience(exp, '#1a1a1a', true);
    const eduHTML = Renderer.education(edu, true);`;

// Wait, the Classic template has some specific styling (italic company).
// I should maybe update Renderer to handle different styles if I want perfect sync.
// But for now, using the shared Renderer is better for stability.

// Actually, let's keep the Classic and Creative specific parts for now but use escapeHtml correctly.
// The task was "Refactor Duplicated Component Logic". Consolidating is better.

content = content.replace(oldClassicExp, newClassicParts);

// 3. Update Creative Template parts
const oldCreativeExp = /const expHTML = exp\.filter[\s\S]*?\.join\(''\);[\s\S]*?const eduHTML = edu\.filter[\s\S]*?\.join\(''\);/;
// Wait, the regex might match the wrong thing if I'm not careful.

// Let's use more specific regex for Creative
const creativeRegex = /function generateCreativeTemplate\(data, exp, edu, sk\) \{[\s\S]*?const expHTML = exp\.filter[\s\S]*?\.join\(''\);[\s\S]*?const eduHTML = edu\.filter[\s\S]*?\.join\(''\);/;
if (creativeRegex.test(content)) {
    content = content.replace(creativeRegex, (match) => {
        return match.replace(/const expHTML = exp\.filter[\s\S]*?\.join\(''\);[\s\S]*?const eduHTML = edu\.filter[\s\S]*?\.join\(''\);/, 
        `const expHTML = Renderer.experience(exp, '#1a1a2e', true);\n    const eduHTML = Renderer.education(edu, true);`);
    });
}

fs.writeFileSync(path, content);
console.log("Finished updating templates and esc->escapeHtml");
