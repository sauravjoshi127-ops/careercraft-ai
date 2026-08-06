const fs = require('fs');

let html = fs.readFileSync('c:/Users/saura/.gemini/antigravity-ide/scratch/careercraft-ai/cover-letter.html', 'utf8');

// The goal is to replace the `.cl-right-panel` and `.cl-history-section` with a flattened vertical layout.
// We can extract the sections using regex or just string manipulation.

let rightPanelMatch = html.match(/<section class="cl-right-panel".*?>([\s\S]*?)<\/section>/);
let historyMatch = html.match(/<!-- SAVED COVER LETTERS DASHBOARD -->\s*<div class="cl-history-section">([\s\S]*?)<\/div>\s*<\/div><!-- \/\.cl-page-container -->/);

if (!rightPanelMatch || !historyMatch) {
  console.log("Failed to match sections");
  process.exit(1);
}

// We have the contents, let's extract the pieces.
let rightPanelContent = rightPanelMatch[1];

// Extract parts
let toolbarSticky = rightPanelContent.match(/<div class="cl-editor-toolbar-sticky">[\s\S]*?<!-- Floating Selection Toolbar -->/)[0].replace('<!-- Floating Selection Toolbar -->', '');
let floatingToolbar = rightPanelContent.match(/<div class="cl-floating-toolbar"[\s\S]*?<!-- Editor Canvas/)[0].replace('<!-- Editor Canvas', '');
let editorCanvas = rightPanelContent.match(/<div class="cl-editor-canvas"[\s\S]*?<!-- Real-time Live Metrics Bar -->/)[0].replace('<!-- Real-time Live Metrics Bar -->', '');
let metricsBar = rightPanelContent.match(/<div class="cl-live-metrics-bar">[\s\S]*?<!-- Primary Action Bar -->/)[0].replace('<!-- Primary Action Bar -->', '');
let actionBar = rightPanelContent.match(/<div class="cl-action-bar">[\s\S]*?<\/div>\s*<\/div>\s*<!-- Tab Pane 2:/)[0].replace(/<\/div>\s*<\/div>\s*<!-- Tab Pane 2:/, '</div>');

let aiCoach = rightPanelContent.match(/<!-- Tab Pane 2: AI Writing Assistant -->\s*<div class="tab-pane"[^>]*>([\s\S]*?)<\/div>\s*<!-- Tab Pane 3:/)[1];
let atsPane = rightPanelContent.match(/<!-- Tab Pane 3: ATS Analysis -->\s*<div class="tab-pane"[^>]*>([\s\S]*?)<\/div>\s*<!-- Tab Pane 4:/)[1];
let variantsPane = rightPanelContent.match(/<!-- Tab Pane 4: Variants -->\s*<div class="tab-pane"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*$/)[1];

let historySection = historyMatch[1];

let newRightPanel = `
      <!-- RIGHT PANEL: Notion-Style Live Editor & AI Suite -->
      <section class="cl-right-panel" aria-label="Cover letter workspace" style="display: flex; flex-direction: column; gap: 24px;">
        
        <!-- EDITOR SECTION -->
        <div class="cl-editor-container">
          ${toolbarSticky.trim()}
          ${floatingToolbar.trim()}
          <!-- Editor Canvas: single container, two mutually-exclusive inner states -->
          ${editorCanvas.trim()}
        </div>

        <!-- Real-time Live Metrics Bar -->
        ${metricsBar.trim()}

        <!-- Primary Action Bar -->
        ${actionBar.trim()}

        <!-- AI Writing Assistant -->
        <div class="cl-ai-coach-section" id="pane-suggestionsPane" style="padding: 24px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--r-lg);">
          ${aiCoach.trim()}
        </div>

        <!-- ATS Analysis -->
        <div class="cl-ats-section" id="pane-atsPane" style="padding: 24px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--r-lg);">
          ${atsPane.trim()}
        </div>

        <!-- Variants -->
        <div class="cl-variants-section" id="pane-variantsPane" style="padding: 24px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--r-lg);">
          ${variantsPane.trim()}
        </div>

        <!-- SAVED COVER LETTERS DASHBOARD -->
        <div class="cl-history-section" style="padding: 24px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--r-lg);">
          ${historySection.trim()}
        </div>

      </section>
    </div><!-- /.cl-workspace -->
  </div><!-- /.cl-page-container -->
`;

let newHtml = html.replace(/<section class="cl-right-panel"[\s\S]*<\/div><!-- \/\.cl-page-container -->/, newRightPanel.trim() + '\n');

fs.writeFileSync('c:/Users/saura/.gemini/antigravity-ide/scratch/careercraft-ai/cover-letter.html', newHtml, 'utf8');
console.log("Successfully rewrote HTML.");
