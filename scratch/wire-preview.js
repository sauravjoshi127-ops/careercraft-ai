const fs = require('fs');
let h = fs.readFileSync('resume.html', 'utf8');

// Add oninput=updatePreview() to all dynamically created experience inputs
// by patching the innerHTML template strings inside addExperience and addEducation
h = h.replace(/id="expTitle-\${idx}" placeholder="e\.g\. Software Engineer" value="\${escapeHtml[^"]*}"/g,
  'id="expTitle-${idx}" placeholder="e.g. Software Engineer" value="${escapeHtml(data?.title || \'\')}" oninput="updatePreview()"');

h = h.replace(/id="expCompany-\${idx}" placeholder="e\.g\. Google" value="\${escapeHtml[^"]*}"/g,
  'id="expCompany-${idx}" placeholder="e.g. Google" value="${escapeHtml(data?.company || \'\')}" oninput="updatePreview()"');

h = h.replace(/id="expStart-\${idx}" placeholder="[^"]*" value="\${escapeHtml[^"]*}"/g,
  'id="expStart-${idx}" placeholder="Jan 2022" value="${escapeHtml(data?.start || \'\')}" oninput="updatePreview()"');

h = h.replace(/id="expEnd-\${idx}" placeholder="[^"]*" value="\${escapeHtml[^"]*}"/g,
  'id="expEnd-${idx}" placeholder="Dec 2023" value="${escapeHtml(data?.end || \'\')}" oninput="updatePreview()"');

// Add oninput to education fields
h = h.replace(/id="eduDegree-\${i}" placeholder="[^"]*" value="\${escapeHtml[^"]*}"/g,
  'id="eduDegree-${i}" placeholder="e.g. B.S. Computer Science" value="${escapeHtml(data?.degree || \'\')}" oninput="updatePreview()"');

h = h.replace(/id="eduSchool-\${i}" placeholder="[^"]*" value="\${escapeHtml[^"]*}"/g,
  'id="eduSchool-${i}" placeholder="e.g. MIT" value="${escapeHtml(data?.school || \'\')}" oninput="updatePreview()"');

// Also hook skills
h = h.replace(/skills\.push\(skill\);/, 'skills.push(skill); updatePreview();');
h = h.replace(/skills\.splice\(idx, 1\);/, 'skills.splice(idx, 1); updatePreview();');

fs.writeFileSync('resume.html', h, 'utf8');
console.log('Done. Size:', h.length);
