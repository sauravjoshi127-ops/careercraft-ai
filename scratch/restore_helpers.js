const fs = require('fs');
let c = fs.readFileSync('resume.html', 'utf8');

const helperFunctions = `
        function switchTemplate(name, btn) {
            currentTemplate = name;
            document.getElementById('templateName').value = name;
            document.querySelectorAll('.template-tab').forEach(t => t.classList.remove('active'));
            if (btn) btn.classList.add('active');
            updatePreview();
        }
        function setAccentColor(el) {
            accentColor = el.dataset.color;
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            el.classList.add('active');
            updatePreview();
        }
        function applyCustomization() { updatePreview(); }
        function selectTemplate(name) { 
            const tabs = document.querySelectorAll('.template-tab');
            tabs.forEach(t => {
                if (t.textContent.toLowerCase().includes(name.toLowerCase())) {
                    switchTemplate(name, t);
                }
            });
        }
`;

// Insert them before updatePreview
c = c.replace('function updatePreview() {', helperFunctions + '\n        function updatePreview() {');

fs.writeFileSync('resume.html', c, 'utf8');
console.log('Restored template switching and accent color functions.');
