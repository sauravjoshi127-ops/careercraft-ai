const fs = require('fs');
let html = fs.readFileSync('resume.html', 'utf8');

// Replace the "Build / Edit Resume Form" section (multi-screen) with split layout
const oldSection = html.indexOf('<!-- Build / Edit Resume Form -->');
const endMarker = '<!-- Delete Confirmation Modal -->';
const endPos = html.indexOf(endMarker);

if (oldSection === -1 || endPos === -1) {
  console.error('Could not find markers');
  process.exit(1);
}

const newSection = `<!-- Build / Edit Resume Form -->
<div class="page-section">
  <div class="section-header">
    <h2 class="section-title" id="formTitle">✏️ Build New Resume</h2>
    <button class="btn-accent" id="cancelEditBtn" onclick="cancelEdit()" style="display:none;">✕ Cancel Edit</button>
  </div>

  <!-- Split layout: form left, preview right -->
  <div class="resume-workspace">

    <!-- LEFT: Form panel -->
    <div class="form-panel">
      <form id="resumeForm" onsubmit="handleSave(event)" novalidate>
        <input type="hidden" id="templateName" value="modern">

        <!-- Personal Info -->
        <div class="form-section-heading" style="margin-top:0;">👤 Personal Information</div>
        <div class="form-row">
          <div class="form-group">
            <label>Full Name *</label>
            <input type="text" id="fullName" placeholder="Jane Doe" required oninput="updatePreview()">
          </div>
          <div class="form-group">
            <label>Email *</label>
            <input type="email" id="email" placeholder="jane@example.com" required oninput="updatePreview()">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Phone</label>
            <input type="tel" id="phone" placeholder="+1 (555) 000-0000" oninput="updatePreview()">
          </div>
          <div class="form-group">
            <label>Location</label>
            <input type="text" id="location" placeholder="New York, NY" oninput="updatePreview()">
          </div>
        </div>

        <!-- Summary -->
        <div class="form-section-heading">📋 Professional Summary <button type="button" class="btn-ai" onclick="getAISuggestions('summary')">💡 AI Suggest</button></div>
        <div class="form-group">
          <label>Summary</label>
          <textarea id="summary" placeholder="A brief overview of your background, skills, and career goals..." rows="4" oninput="updatePreview()"></textarea>
        </div>

        <!-- Experience -->
        <div class="form-section-heading">💼 Work Experience</div>
        <div id="experienceContainer"></div>
        <button type="button" class="btn-add-entry" onclick="addExperience()">+ Add Work Experience</button>

        <!-- Education -->
        <div class="form-section-heading">🎓 Education</div>
        <div id="educationContainer"></div>
        <button type="button" class="btn-add-entry" onclick="addEducation()">+ Add Education</button>

        <!-- Skills -->
        <div class="form-section-heading">🎯 Skills <button type="button" class="btn-ai" onclick="getAISuggestions('skills')">💡 AI Suggest</button></div>
        <div class="form-group">
          <label>Add Skills (press Enter or comma to add)</label>
          <div class="skills-container" id="skillsContainer" onclick="document.getElementById('skillInput').focus()">
            <input type="text" id="skillInput" class="skill-input" placeholder="e.g. JavaScript, Python, Project Management...">
          </div>
        </div>

        <!-- Certifications -->
        <div class="form-section-heading">🏅 Certifications</div>
        <div class="form-group">
          <label>Certifications</label>
          <textarea id="certifications" placeholder="e.g. AWS Certified Solutions Architect (2023), PMP Certification (2022)..." rows="3" oninput="updatePreview()"></textarea>
        </div>

        <!-- Save Bar -->
        <div class="save-bar">
          <button type="submit" class="btn-primary" id="saveBtn">💾 Save Resume</button>
        </div>
      </form>
    </div>

    <!-- RIGHT: Preview panel -->
    <div class="preview-panel">
      <div class="preview-panel-header">
        <span class="preview-panel-title">Live Preview</span>
        <div class="template-tabs" id="templateTabs">
          <button class="template-tab active" onclick="switchTemplate('modern', this)">Modern</button>
          <button class="template-tab" onclick="switchTemplate('classic', this)">Classic</button>
          <button class="template-tab" onclick="switchTemplate('creative', this)">Creative</button>
        </div>
      </div>
      <div class="preview-body" id="previewBody">
        <div class="preview-placeholder">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <p>Start filling in your details<br>and see your resume update live.</p>
        </div>
      </div>
      <!-- Customization bar -->
      <div class="customizer">
        <div class="customizer-group">
          <span class="customizer-label">Font</span>
          <select class="customizer-select" id="custFont" onchange="applyCustomization()">
            <option value="Inter">Inter</option>
            <option value="Georgia">Georgia</option>
            <option value="Outfit">Outfit</option>
          </select>
        </div>
        <div class="customizer-group">
          <span class="customizer-label">Spacing</span>
          <select class="customizer-select" id="custSpacing" onchange="applyCustomization()">
            <option value="compact">Compact</option>
            <option value="normal" selected>Normal</option>
            <option value="relaxed">Relaxed</option>
          </select>
        </div>
        <div class="customizer-group">
          <span class="customizer-label">Accent</span>
          <div class="color-swatches">
            <div class="color-swatch active" style="background:#00d2ff;" data-color="#00d2ff" onclick="setAccentColor(this)"></div>
            <div class="color-swatch" style="background:#a78bfa;" data-color="#a78bfa" onclick="setAccentColor(this)"></div>
            <div class="color-swatch" style="background:#34d399;" data-color="#34d399" onclick="setAccentColor(this)"></div>
            <div class="color-swatch" style="background:#fb923c;" data-color="#fb923c" onclick="setAccentColor(this)"></div>
            <div class="color-swatch" style="background:#f0f0f5;" data-color="#f0f0f5" onclick="setAccentColor(this)"></div>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>

`;

html = html.substring(0, oldSection) + newSection + html.substring(endPos);
fs.writeFileSync('resume.html', html, 'utf8');
console.log('Done. File size:', html.length);
