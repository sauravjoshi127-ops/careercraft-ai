const fs = require('fs');

// ── Audit resume.html for issues ──────────────────────────────────────────
const resumeHtml = fs.readFileSync('resume.html', 'utf8');
const lines = resumeHtml.split('\n');

const issues = {
  templateLeaks: [],       // ${var} visible in raw HTML (not inside script)
  inScriptBlock: false,
  overlappingCanvas: [],   // canvas elements that might block clicks
  ambientCanvas: [],
  zIndexIssues: [],
  duplicateIds: {},
  brokenButtons: [],
};

let inScript = false;
let inStyle = false;

lines.forEach((line, i) => {
  const trimmed = line.trim();
  if (trimmed.startsWith('<script')) inScript = true;
  if (trimmed.includes('</script>')) inScript = false;
  if (trimmed.startsWith('<style')) inStyle = true;
  if (trimmed.includes('</style>')) inStyle = false;

  // Template literal leaks - only flag if they appear in HTML (not JS)
  if (!inScript && !inStyle && line.includes('${')) {
    issues.templateLeaks.push({ line: i+1, content: trimmed.substring(0,120) });
  }

  // Canvas elements with fixed/absolute positioning
  if (line.includes('<canvas') || line.includes('ambient-canvas')) {
    issues.ambientCanvas.push({ line: i+1, content: trimmed.substring(0,100) });
  }

  // Detect pointer-events issues
  if (line.includes('pointer-events:none') || line.includes('pointer-events: none')) {
    issues.zIndexIssues.push({ line: i+1, content: trimmed.substring(0,100) });
  }

  // Duplicate IDs
  const idMatch = line.match(/id="([^"]+)"/);
  if (idMatch) {
    const id = idMatch[1];
    if (!issues.duplicateIds[id]) issues.duplicateIds[id] = [];
    issues.duplicateIds[id].push(i+1);
  }
});

console.log('=== TEMPLATE LEAKS IN HTML (non-script context) ===');
if (issues.templateLeaks.length === 0) {
  console.log('  None found - template literals are inside script tags.');
} else {
  issues.templateLeaks.forEach(l => console.log('  L'+l.line+':', l.content));
}

console.log('\n=== CANVAS/AMBIENT ELEMENTS ===');
issues.ambientCanvas.forEach(l => console.log('  L'+l.line+':', l.content));

console.log('\n=== POINTER-EVENTS ISSUES ===');
issues.zIndexIssues.forEach(l => console.log('  L'+l.line+':', l.content));

const dupes = Object.entries(issues.duplicateIds).filter(([,v]) => v.length > 1);
console.log('\n=== DUPLICATE IDs ===');
if (dupes.length === 0) console.log('  None found.');
else dupes.forEach(([id, lns]) => console.log('  id="'+id+'" appears on lines: '+lns.join(', ')));

// ── Audit updatePreview function ──────────────────────────────────────────
const previewFnStart = resumeHtml.indexOf('function updatePreview');
const previewFnEnd = resumeHtml.indexOf('\n        function ', previewFnStart + 10);
if (previewFnStart > -1) {
  console.log('\n=== updatePreview FUNCTION (first 1200 chars) ===');
  console.log(resumeHtml.substring(previewFnStart, previewFnStart + 1200));
}

// ── Audit for raw template vars in innerHTML assignments ───────────────────
console.log('\n=== innerHTML ASSIGNMENTS ===');
const innerHTMLMatches = [];
let pos = 0;
while ((pos = resumeHtml.indexOf('.innerHTML', pos)) !== -1) {
  const snippet = resumeHtml.substring(pos, pos + 200).replace(/\n/g, ' ');
  innerHTMLMatches.push(snippet.substring(0, 120));
  pos += 10;
}
innerHTMLMatches.slice(0, 10).forEach((s, i) => console.log('  ['+i+']', s));
