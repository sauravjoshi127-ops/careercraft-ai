const fs = require('fs');
const path = require('path');

const filesToOptimize = [
  {
    html: 'cover-letter.html',
    js: 'cover-letter.js'
  },
  {
    html: 'cold-email.html',
    js: 'cold-email.js'
  },
  {
    html: 'interview.html',
    js: 'interview.js'
  }
];

filesToOptimize.forEach(({ html, js }) => {
  const htmlPath = path.join(__dirname, '..', html);
  if (!fs.existsSync(htmlPath)) {
    console.log(`File not found: ${htmlPath}`);
    return;
  }
  let content = fs.readFileSync(htmlPath, 'utf8');

  // Regex to find inline <script> blocks without src attribute
  const matches = [...content.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  
  matches.forEach(m => {
    const innerText = m[1];
    if (innerText.length > 100) {
      content = content.replace(m[0], `<!-- Page logic loaded via ${js} -->`);
    }
  });
  
  // Strip any remaining bootstrap script tags
  content = content.replace(/<script>\s*window\.addEventListener\('load',\s*init\);\s*<\/script>/gi, '');
  content = content.replace(/<script>\s*window\.addEventListener\('load',\s*initPage\);\s*<\/script>/gi, '');
  content = content.replace(/<script>\s*window\.addEventListener\('load',\s*initInterview\);\s*<\/script>/gi, '');
  content = content.replace(/<script>\s*window\.addEventListener\('load',\s*bootstrapInterview\);\s*<\/script>/gi, '');

  fs.writeFileSync(htmlPath, content, 'utf8');
  console.log(`Successfully optimized ${html} by stripping inline script blocks.`);
});
