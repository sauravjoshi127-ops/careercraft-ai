import os

html_content = r'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Cold Email Workspace - CareerCraft</title>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <script src="storage-manager.js" defer></script>
  <script src="auth-manager.js" defer></script>
  <script src="workspace-manager.js" defer></script>
  <script src="theme-manager.js"></script>
  <script src="navigation-manager.js" defer></script>
  <script src="performance-manager.js" defer></script>
  <script src="app-sdk.js" defer></script>
  <script src="layout-manager.js" defer></script>
  <script src="cold-email.js" defer></script>
  <link rel="stylesheet" href="styles/premium.css">
  
  <style>
    :root {
      --bg-base: #0f172a;
      --bg-surface: #1e293b;
      --bg-soft: #334155;
      --text-1: #f8fafc;
      --text-2: #cbd5e1;
      --text-3: #94a3b8;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --border: #334155;
      --border-focus: #6366f1;
      --danger: #ef4444;
      --success: #10b981;
      --r-sm: 6px;
      --r-md: 10px;
      --r-lg: 16px;
      --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
      --shadow-card: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    }
    
    body { background: var(--bg-base); color: var(--text-1); font-family: 'Inter', sans-serif; margin: 0; }
    
    .workspace-layout {
      display: grid;
      grid-template-columns: 450px 1fr;
      height: calc(100vh - 64px);
      overflow: hidden;
    }
    
    @media (max-width: 1024px) {
      .workspace-layout {
        grid-template-columns: 1fr;
        height: auto;
        overflow: auto;
      }
    }
    
    .left-pane {
      background: var(--bg-surface);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
    }
    
    .pane-header {
      padding: 1.5rem;
      border-bottom: 1px solid var(--border);
      background: var(--bg-surface);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    
    .progress-indicator {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--primary);
      margin-bottom: 0.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .progress-bar-bg {
      height: 4px;
      background: var(--bg-soft);
      border-radius: 2px;
      width: 100%;
      overflow: hidden;
    }
    
    .progress-bar-fill {
      height: 100%;
      background: var(--primary);
      width: 0%;
      transition: width 0.3s ease;
    }
    
    .mode-toggle {
      display: flex;
      background: var(--bg-soft);
      border-radius: var(--r-sm);
      padding: 0.25rem;
      margin-top: 1rem;
    }
    
    .mode-btn {
      flex: 1;
      padding: 0.5rem;
      text-align: center;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-2);
      border-radius: calc(var(--r-sm) - 2px);
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .mode-btn.active {
      background: var(--primary);
      color: white;
    }
    
    .form-content {
      padding: 1.5rem;
    }
    
    .section-block {
      margin-bottom: 2rem;
      position: relative;
    }
    
    .section-header {
      margin-bottom: 1rem;
    }
    
    .step-number {
      font-size: 0.75rem;
      color: var(--primary);
      font-weight: 700;
      letter-spacing: 1px;
      margin-bottom: 0.25rem;
      display: block;
    }
    
    .section-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .section-desc {
      font-size: 0.85rem;
      color: var(--text-2);
      margin-top: 0.25rem;
    }
    
    .status-badge {
      font-size: 0.75rem;
      padding: 0.2rem 0.5rem;
      border-radius: 12px;
      background: var(--bg-soft);
      color: var(--text-3);
    }
    
    .status-badge.complete {
      background: rgba(16, 185, 129, 0.1);
      color: var(--success);
    }
    
    .input-group {
      margin-bottom: 1rem;
    }
    
    .input-group label {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-2);
      margin-bottom: 0.5rem;
    }
    
    .input-group label .optional {
      color: var(--text-3);
      font-weight: 400;
      font-size: 0.75rem;
    }
    
    .input-control {
      width: 100%;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      padding: 0.75rem;
      color: var(--text-1);
      font-family: inherit;
      font-size: 0.9rem;
      transition: all 0.2s;
      box-sizing: border-box;
    }
    
    .input-control:focus {
      outline: none;
      border-color: var(--border-focus);
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
    }
    
    textarea.input-control {
      min-height: 80px;
      resize: vertical;
    }
    
    .goal-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
    }
    
    .goal-card {
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      padding: 0.75rem;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-2);
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .goal-card:hover {
      border-color: var(--text-3);
    }
    
    .goal-card.active {
      background: rgba(99, 102, 241, 0.1);
      border-color: var(--primary);
      color: var(--primary);
    }
    
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-radius: var(--r-sm);
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      width: 100%;
      box-sizing: border-box;
    }
    
    .btn-primary {
      background: var(--primary);
      color: white;
    }
    
    .btn-primary:hover:not(:disabled) {
      background: var(--primary-hover);
    }
    
    .btn-secondary {
      background: var(--bg-soft);
      color: var(--text-1);
      border: 1px solid var(--border);
    }
    
    .btn-secondary:hover:not(:disabled) {
      background: var(--border);
    }
    
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .btn-resume {
      background: rgba(16, 185, 129, 0.1);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.2);
    }
    .btn-resume:hover {
      background: rgba(16, 185, 129, 0.2);
    }
    
    .right-pane {
      padding: 2rem;
      height: 100%;
      overflow-y: auto;
      background: var(--bg-base);
    }
    
    .workspace-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      text-align: center;
      color: var(--text-2);
      max-width: 400px;
      margin: 0 auto;
    }
    
    .workspace-empty h2 {
      font-size: 1.25rem;
      color: var(--text-1);
      margin-top: 1rem;
      margin-bottom: 0.5rem;
    }
    
    .workspace-empty p {
      font-size: 0.95rem;
      line-height: 1.5;
      margin-bottom: 2rem;
    }
    
    .editor-layout {
      display: none;
      grid-template-columns: 1fr 300px;
      gap: 1.5rem;
      align-items: start;
    }
    
    @media (max-width: 1200px) {
      .editor-layout {
        grid-template-columns: 1fr;
      }
    }
    
    .main-editor-area {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    .subjects-bar {
      padding: 1rem;
      border-bottom: 1px solid var(--border);
      background: var(--bg-base);
    }
    
    .subject-pill {
      display: inline-block;
      padding: 0.4rem 0.75rem;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      border-radius: 16px;
      font-size: 0.8rem;
      cursor: pointer;
      margin-right: 0.5rem;
      margin-bottom: 0.5rem;
      transition: all 0.2s;
    }
    
    .subject-pill:hover {
      border-color: var(--text-3);
    }
    .subject-pill.active {
      background: rgba(99, 102, 241, 0.1);
      border-color: var(--primary);
      color: var(--primary);
    }
    
    .email-body {
      padding: 1.5rem;
      min-height: 400px;
      font-size: 0.95rem;
      line-height: 1.6;
      color: var(--text-1);
      outline: none;
      white-space: pre-wrap;
    }
    
    .editor-actions {
      padding: 1rem;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 0.5rem;
      background: var(--bg-base);
    }
    
    .analytics-sidebar {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: 1.25rem;
    }
    
    .card-title {
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .checklist-item {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
      font-size: 0.85rem;
      color: var(--text-2);
    }
    
    .checklist-item i {
      color: var(--success);
      margin-top: 2px;
    }
    
    .score-banner {
      background: rgba(16, 185, 129, 0.1);
      color: var(--success);
      padding: 0.75rem;
      border-radius: var(--r-sm);
      font-weight: 600;
      font-size: 0.9rem;
      text-align: center;
      margin-top: 1rem;
    }
    
    .copilot-action {
      background: var(--bg-base);
      border: 1px solid var(--border);
      padding: 0.75rem;
      border-radius: var(--r-sm);
      font-size: 0.85rem;
      color: var(--text-1);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      transition: all 0.2s;
    }
    
    .copilot-action:hover {
      border-color: var(--primary);
    }
    
    .diff-view {
      display: none;
      margin-top: 1rem;
      border-top: 1px solid var(--border);
      padding-top: 1rem;
    }
    
    .diff-original { text-decoration: line-through; color: var(--danger); margin-bottom: 0.5rem; font-size: 0.85rem; }
    .diff-suggested { color: var(--success); margin-bottom: 1rem; font-size: 0.85rem;}
    
    .hidden { display: none !important; }
    
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100;
      display: none; align-items: center; justify-content: center;
    }
    .modal-overlay.active { display: flex; }
    .modal-content {
      background: var(--bg-surface); border: 1px solid var(--border);
      border-radius: var(--r-md); padding: 1.5rem; width: 90%; max-width: 500px;
    }
    
    .resume-item {
      padding: 1rem; border: 1px solid var(--border); border-radius: var(--r-sm);
      margin-bottom: 0.5rem; cursor: pointer; transition: 0.2s; background: var(--bg-base);
    }
    .resume-item:hover { border-color: var(--primary); }
    
    .tabs-header {
      display: flex; gap: 1rem; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem;
    }
    .tab-item {
      padding: 0.75rem 0; font-size: 0.9rem; color: var(--text-2); cursor: pointer;
      border-bottom: 2px solid transparent; font-weight: 500;
    }
    .tab-item.active { color: var(--text-1); border-bottom-color: var(--primary); }
    
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    
    .variant-card {
        background: var(--bg-base); border: 1px solid var(--border); border-radius: var(--r-sm);
        padding: 1rem; margin-bottom: 1rem;
    }
    .variant-card.active { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
    
    .loading-overlay {
        position: absolute; inset: 0; background: rgba(30, 41, 59, 0.8);
        display: none; flex-direction: column; align-items: center; justify-content: center;
        z-index: 50; backdrop-filter: blur(2px);
    }
    .loading-overlay.active { display: flex; }
  </style>
</head>
<body>

  <nav class="ch-nav" aria-label="Main navigation"></nav>

  <div class="workspace-layout">
    
    <!-- LEFT PANE: GUIDED WORKSPACE -->
    <div class="left-pane">
      <div class="pane-header">
        <div class="progress-indicator">
          <span id="progressText">EMAIL BRIEF &bull; 0%</span>
          <span id="sectionsCompleteText">0 of 4 complete</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" id="progressBar"></div>
        </div>
        
        <div class="mode-toggle">
          <div class="mode-btn active" id="modeGuided">Guided Brief</div>
          <div class="mode-btn" id="modeQuick">Quick Start</div>
        </div>
      </div>
      
      <div class="form-content">
        <!-- Error Alert -->
        <div id="errorAlert" class="hidden" style="background: rgba(239,68,68,0.1); border: 1px solid var(--danger); padding: 1rem; border-radius: var(--r-sm); margin-bottom: 1.5rem; color: #fca5a5;">
            <p id="errorMsg" style="font-size: 0.9rem;"></p>
        </div>

        <form id="emailForm" novalidate>
          
          <!-- SECTION 1: Recipient -->
          <div class="section-block" id="sec-recipient">
            <div class="section-header">
              <span class="step-number">01</span>
              <div class="section-title">Recipient <span class="status-badge" id="status-1">Not started</span></div>
              <div class="section-desc">Who are you reaching out to?</div>
            </div>
            
            <div class="input-group">
              <label>Name <span class="optional">Optional</span></label>
              <input type="text" id="recipientName" class="input-control" placeholder="e.g. Adam">
            </div>
            <div class="input-group">
              <label>Role / Title</label>
              <input type="text" id="position" class="input-control" required placeholder="e.g. VP of Engineering">
            </div>
            <div class="input-group" id="relationshipGroup">
              <label>Relationship / Context <span class="optional">Optional</span></label>
              <input type="text" id="relationship" class="input-control" placeholder="e.g. We met at TechCrunch Disrupt">
            </div>
          </div>
          
          <!-- SECTION 2: Company -->
          <div class="section-block" id="sec-company">
            <div class="section-header">
              <span class="step-number">02</span>
              <div class="section-title">Company & Context <span class="status-badge" id="status-2">Not started</span></div>
              <div class="section-desc">What do you know about them?</div>
            </div>
            
            <div class="input-group">
              <label>Company Name</label>
              <input type="text" id="companyName" class="input-control" required placeholder="e.g. Acme Corp">
            </div>
            <div class="input-group">
              <label>What caught your attention? <span class="optional">Optional</span></label>
              <textarea id="companyContext" class="input-control" placeholder="e.g. Your recent expansion into legal technology..."></textarea>
            </div>
          </div>
          
          <!-- SECTION 3: Your Value -->
          <div class="section-block" id="sec-value">
            <div class="section-header">
              <span class="step-number">03</span>
              <div class="section-title">Your Value <span class="status-badge" id="status-3">Not started</span></div>
              <div class="section-desc">Why should they care?</div>
            </div>
            
            <div id="resumeImportBlock" style="margin-bottom: 1rem;">
              <button type="button" class="btn btn-resume" id="btnUseResume">
                <i data-lucide="file-text" width="18"></i> Use My Resume
              </button>
            </div>
            
            <div id="importedValueBlock" class="hidden" style="background: var(--bg-base); padding: 1rem; border-radius: var(--r-sm); border: 1px solid var(--border); margin-bottom: 1rem;">
                <p style="font-size: 0.8rem; color: var(--success); margin-bottom: 0.5rem;"><i data-lucide="check" width="14"></i> Resume imported successfully</p>
                <div class="input-group" style="margin-bottom: 0;">
                  <label>Your Name</label>
                  <input type="text" id="userName" class="input-control" style="margin-bottom: 0.5rem;" required>
                  <label>Value Proposition (Editable)</label>
                  <textarea id="background" class="input-control" required></textarea>
                </div>
            </div>
            
            <div id="manualValueBlock">
                <div class="input-group">
                  <label>Your Name</label>
                  <input type="text" id="userNameManual" class="input-control">
                </div>
                <div class="input-group">
                  <label>Value Proposition</label>
                  <textarea id="backgroundManual" class="input-control" placeholder="e.g. I have 3 years of experience in React and recently built..."></textarea>
                </div>
            </div>
          </div>
          
          <!-- SECTION 4: Goal & Tone -->
          <div class="section-block" id="sec-goal">
            <div class="section-header">
              <span class="step-number">04</span>
              <div class="section-title">Goal & Tone <span class="status-badge" id="status-4">Not started</span></div>
              <div class="section-desc">What do you want from them?</div>
            </div>
            
            <div class="input-group">
              <label>Goal</label>
              <div class="goal-grid" id="goalGrid">
                <div class="goal-card" data-value="Networking"><i data-lucide="users" width="16"></i> Networking</div>
                <div class="goal-card" data-value="Job Opportunity"><i data-lucide="briefcase" width="16"></i> Job Opportunity</div>
                <div class="goal-card" data-value="Referral"><i data-lucide="link" width="16"></i> Referral</div>
                <div class="goal-card" data-value="Internship"><i data-lucide="graduation-cap" width="16"></i> Internship</div>
                <div class="goal-card" data-value="Mentorship"><i data-lucide="compass" width="16"></i> Mentorship</div>
                <div class="goal-card" data-value="Partnership"><i data-lucide="handshake" width="16"></i> Partnership</div>
                <div class="goal-card" data-value="Information Request"><i data-lucide="info" width="16"></i> Info Request</div>
                <div class="goal-card" data-value="Introduction"><i data-lucide="user-plus" width="16"></i> Introduction</div>
              </div>
              <input type="hidden" id="emailGoal" required>
            </div>
            
            <div class="grid-2 advanced-options">
                <div class="input-group">
                  <label>Tone</label>
                  <select id="tone" class="input-control">
                    <option value="Professional" selected>Professional</option>
                    <option value="Warm">Warm</option>
                    <option value="Confident">Confident</option>
                    <option value="Conversational">Conversational</option>
                    <option value="Direct">Direct</option>
                  </select>
                </div>
                <div class="input-group">
                  <label>Length</label>
                  <select id="length" class="input-control">
                    <option value="Short" selected>Short</option>
                    <option value="Standard">Standard</option>
                    <option value="Detailed">Detailed</option>
                  </select>
                </div>
                <div class="input-group" style="grid-column: span 2;">
                  <label>Call to Action (CTA)</label>
                  <select id="ctaStyle" class="input-control">
                    <option value="Soft Ask" selected>Soft Ask</option>
                    <option value="Meeting Request">Meeting Request</option>
                    <option value="Referral Ask">Referral Ask</option>
                    <option value="Advice Request">Advice Request</option>
                    <option value="Direct Ask">Direct Ask</option>
                  </select>
                </div>
            </div>
          </div>
          
          <div style="margin-top: 2rem; position: relative;">
            <button type="button" class="btn btn-primary" id="btnGenerate" style="padding: 1rem; font-size: 1rem;">
              <i data-lucide="sparkles" width="20"></i> Generate Personalized Email
            </button>
            <div class="loading-overlay" id="genOverlay" style="border-radius: var(--r-sm);">
                <i data-lucide="loader-circle" class="spin" style="color: white; margin-bottom: 0.5rem;" width="24"></i>
                <span style="color: white; font-size: 0.85rem;" id="genLoadingText">Crafting email...</span>
            </div>
          </div>
          
        </form>
      </div>
    </div>
    
    <!-- RIGHT PANE: WORKSPACE -->
    <div class="right-pane">
        
        <!-- Empty State -->
        <div id="workspaceEmpty" class="workspace-empty">
            <i data-lucide="mail-open" width="48" style="color: var(--text-3); margin-bottom: 1rem;"></i>
            <h2>EMAIL WORKSPACE</h2>
            <p>Your personalized email will appear here.<br>Complete the brief on the left or use your resume to get started.</p>
            <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('btnUseResume').click()">Use My Resume</button>
            </div>
        </div>
        
        <!-- Editor Layout -->
        <div id="workspaceEditor" class="editor-layout">
            
            <div class="main-content">
                <div class="tabs-header">
                    <div class="tab-item active" data-tab="tab-editor">Email Editor</div>
                    <div class="tab-item" data-tab="tab-variants">Variants</div>
                    <div class="tab-item" data-tab="tab-followups">Follow-Ups</div>
                </div>
                
                <div id="tab-editor" class="tab-content">
                    <div class="main-editor-area">
                        <div class="subjects-bar">
                            <div style="font-size: 0.75rem; color: var(--text-3); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Subject Lines</div>
                            <div id="subjectContainer">
                                <!-- Populated dynamically -->
                            </div>
                        </div>
                        <div class="email-body" id="emailBody" contenteditable="true" spellcheck="false"></div>
                        <div class="editor-actions">
                            <button class="btn btn-primary" id="btnCopy"><i data-lucide="copy" width="16"></i> Copy</button>
                            <button class="btn btn-secondary" id="btnSave"><i data-lucide="save" width="16"></i> Save</button>
                        </div>
                    </div>
                </div>
                
                <div id="tab-variants" class="tab-content hidden">
                    <div id="variantsContainer"></div>
                </div>
                
                <div id="tab-followups" class="tab-content hidden">
                    <div id="followUpsContainer"></div>
                </div>
            </div>
            
            <div class="analytics-sidebar">
                
                <div class="card">
                    <div class="card-title"><i data-lucide="check-circle" width="18" style="color: var(--primary);"></i> Why This Works</div>
                    <div id="whyWorksList">
                        <div class="checklist-item"><i data-lucide="check"></i> <div><strong>Personalized opening</strong><br><span style="font-size:0.8rem;">References context</span></div></div>
                        <div class="checklist-item"><i data-lucide="check"></i> <div><strong>Value proposition</strong><br><span style="font-size:0.8rem;">Communicates relevance</span></div></div>
                        <div class="checklist-item"><i data-lucide="check"></i> <div><strong>CTA</strong><br><span style="font-size:0.8rem;">Low-friction request</span></div></div>
                    </div>
                    <div class="score-banner" id="overallScore">Strong outreach potential</div>
                </div>
                
                <div class="card">
                    <div class="card-title"><i data-lucide="bot" width="18" style="color: var(--primary);"></i> Writing Copilot</div>
                    <p style="font-size: 0.8rem; color: var(--text-2); margin-bottom: 1rem;">Improve your current draft.</p>
                    <div class="copilot-action" data-action="improve"><i data-lucide="zap" width="16"></i> Improve opening</div>
                    <div class="copilot-action" data-action="persuasive"><i data-lucide="trending-up" width="16"></i> Make more persuasive</div>
                    <div class="copilot-action" data-action="concise"><i data-lucide="minimize" width="16"></i> Make more concise</div>
                    <div class="copilot-action" data-action="warm"><i data-lucide="smile" width="16"></i> Make warmer</div>
                    
                    <div class="diff-view" id="aiDiffView">
                        <div style="font-size: 0.75rem; color: var(--text-3); margin-bottom: 0.5rem;">Suggested Change:</div>
                        <div class="diff-original" id="diffOrig"></div>
                        <div class="diff-suggested" id="diffSug"></div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-secondary" id="btnRejectAi" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Discard</button>
                            <button class="btn btn-primary" id="btnAcceptAi" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Apply</button>
                        </div>
                    </div>
                </div>
                
            </div>
            
        </div>
        
    </div>
  </div>
  
  <!-- Resume Modal -->
  <div class="modal-overlay" id="resumeModal">
      <div class="modal-content">
          <h3 style="margin-bottom: 1rem; font-size: 1.1rem;">Select Resume</h3>
          <div id="resumeList" style="max-height: 300px; overflow-y: auto;">
              <p style="text-align: center; color: var(--text-3); font-size: 0.9rem;">Loading...</p>
          </div>
          <div style="margin-top: 1.5rem; text-align: right;">
              <button class="btn btn-secondary" style="width: auto;" id="btnCloseResumeModal">Cancel</button>
          </div>
      </div>
  </div>

  <style>
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { 100% { transform: rotate(360deg); } }
  </style>
  <script>if (window.lucide) { lucide.createIcons(); }</script>
</body>
</html>
'''

js_content = r'''/**
 * cold-email.js
 * Refactored Cold Email Generator with premium workspace UX
 */
(function () {
  let supabaseClient = null;
  let currentUser = null;
  let savedResumes = [];
  
  let currentEmailData = null; // Stores generated email
  let debounceTimer = null;
  let generationController = null;

  async function init() {
    try {
      await window.appSdk.ready;
      if (!window.AuthManager) return;
      const session = await window.AuthManager.requireAuth();
      if (!session) return;
      
      supabaseClient = window.appSdk.client;
      currentUser = session.user;

      setupUI();
      setupResumeImport();
      setupGeneration();
      trackProgress();
      setupCopilot();
      setupTabs();
      
    } catch (err) {
      console.error('Initialization error:', err);
      showToast('System initialization error', true);
    }
  }

  function showToast(msg, isError = false) {
    if (window.LayoutManager && typeof window.LayoutManager.showToast === 'function') {
      window.LayoutManager.showToast(msg, isError ? 'error' : 'success');
    } else {
      window.appSdk.ui.showToast(msg, isError);
    }
  }

  function setupUI() {
    // Mode toggle
    const modeGuided = document.getElementById('modeGuided');
    const modeQuick = document.getElementById('modeQuick');
    const advOptions = document.querySelector('.advanced-options');
    const relGroup = document.getElementById('relationshipGroup');
    const compCtx = document.getElementById('sec-company').querySelector('.input-group:nth-child(2)'); // "What caught your attention?"

    modeGuided.addEventListener('click', () => {
        modeGuided.classList.add('active');
        modeQuick.classList.remove('active');
        advOptions.classList.remove('hidden');
        relGroup.classList.remove('hidden');
        if(compCtx) compCtx.classList.remove('hidden');
    });
    
    modeQuick.addEventListener('click', () => {
        modeQuick.classList.add('active');
        modeGuided.classList.remove('active');
        advOptions.classList.add('hidden');
        relGroup.classList.add('hidden');
        if(compCtx) compCtx.classList.add('hidden');
    });

    // Goal Grid Selection
    const goals = document.querySelectorAll('.goal-card');
    const goalInput = document.getElementById('emailGoal');
    goals.forEach(g => {
        g.addEventListener('click', () => {
            goals.forEach(c => c.classList.remove('active'));
            g.classList.add('active');
            goalInput.value = g.dataset.value;
            trackProgress();
        });
    });

    // Input tracking for progress
    const inputs = document.querySelectorAll('.input-control');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(trackProgress, 300);
        });
    });
    
    // Copy button
    document.getElementById('btnCopy').addEventListener('click', async () => {
        const text = document.getElementById('emailBody').innerText;
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!');
        } catch(e) {
            showToast('Failed to copy', true);
        }
    });
  }

  function trackProgress() {
    let completed = 0;
    const total = 4;
    
    // Sec 1
    const s1 = document.getElementById('position').value.trim();
    const badge1 = document.getElementById('status-1');
    if(s1) { completed++; badge1.textContent = 'Complete'; badge1.classList.add('complete'); }
    else { badge1.textContent = 'In progress'; badge1.classList.remove('complete'); }
    
    // Sec 2
    const s2 = document.getElementById('companyName').value.trim();
    const badge2 = document.getElementById('status-2');
    if(s2) { completed++; badge2.textContent = 'Complete'; badge2.classList.add('complete'); }
    else { badge2.textContent = 'In progress'; badge2.classList.remove('complete'); }
    
    // Sec 3
    const isManual = document.getElementById('manualValueBlock').classList.contains('hidden') === false;
    const userName = isManual ? document.getElementById('userNameManual').value : document.getElementById('userName').value;
    const valProp = isManual ? document.getElementById('backgroundManual').value : document.getElementById('background').value;
    const badge3 = document.getElementById('status-3');
    if(userName.trim() && valProp.trim()) { completed++; badge3.textContent = 'Complete'; badge3.classList.add('complete'); }
    else { badge3.textContent = 'In progress'; badge3.classList.remove('complete'); }
    
    // Sec 4
    const s4 = document.getElementById('emailGoal').value;
    const badge4 = document.getElementById('status-4');
    if(s4) { completed++; badge4.textContent = 'Complete'; badge4.classList.add('complete'); }
    else { badge4.textContent = 'Not started'; badge4.classList.remove('complete'); }
    
    // Update Bar
    const pct = (completed / total) * 100;
    document.getElementById('progressBar').style.width = pct + '%';
    document.getElementById('progressText').innerHTML = `EMAIL BRIEF &bull; ${Math.round(pct)}%`;
    document.getElementById('sectionsCompleteText').textContent = `${completed} of ${total} complete`;
  }

  function setupResumeImport() {
    const btn = document.getElementById('btnUseResume');
    const modal = document.getElementById('resumeModal');
    const closeBtn = document.getElementById('btnCloseResumeModal');
    const rList = document.getElementById('resumeList');

    btn.addEventListener('click', async () => {
        modal.classList.add('active');
        rList.innerHTML = '<p style="text-align:center; color:var(--text-3);">Loading resumes...</p>';
        
        try {
            const { data, error } = await supabaseClient
                .from('resumes')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });
                
            if (error || !data || data.length === 0) {
                rList.innerHTML = '<p style="text-align:center; color:var(--text-3);">No resume found. Enter details manually.</p>';
                return;
            }
            
            savedResumes = data;
            rList.innerHTML = '';
            data.forEach((r, idx) => {
                const div = document.createElement('div');
                div.className = 'resume-item';
                div.innerHTML = `<div style="font-weight:600;">${r.full_name || 'Untitled'}</div><div style="font-size:0.8rem; color:var(--text-2);">${r.title || ''}</div>`;
                div.addEventListener('click', () => selectResume(idx));
                rList.appendChild(div);
            });
        } catch(e) {
            rList.innerHTML = '<p style="color:var(--danger); text-align:center;">Failed to load</p>';
        }
    });

    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
        if(e.target === modal) modal.classList.remove('active');
    });
  }

  function selectResume(idx) {
    const r = savedResumes[idx];
    document.getElementById('resumeModal').classList.remove('active');
    
    document.getElementById('manualValueBlock').classList.add('hidden');
    document.getElementById('importedValueBlock').classList.remove('hidden');
    document.getElementById('btnUseResume').style.display = 'none';
    
    document.getElementById('userName').value = r.full_name || '';
    
    let prop = `Experience in ${r.title || 'the industry'}. `;
    if(r.experience && r.experience.length > 0) {
        prop += `Strong background at ${r.experience[0].company} focusing on ${r.experience[0].title}. `;
    }
    if(r.skills && r.skills.length > 0) {
        prop += `Key skills: ${r.skills.slice(0,3).join(', ')}.`;
    }
    
    document.getElementById('background').value = prop;
    trackProgress();
    showToast('Resume imported successfully');
  }

  function setupGeneration() {
    const btn = document.getElementById('btnGenerate');
    btn.addEventListener('click', async () => {
        const goal = document.getElementById('emailGoal').value;
        const company = document.getElementById('companyName').value;
        const position = document.getElementById('position').value;
        
        const isManual = document.getElementById('manualValueBlock').classList.contains('hidden') === false;
        const userName = isManual ? document.getElementById('userNameManual').value : document.getElementById('userName').value;
        const bg = isManual ? document.getElementById('backgroundManual').value : document.getElementById('background').value;
        
        if(!company || !position || !userName || !bg || !goal) {
            const alert = document.getElementById('errorAlert');
            alert.classList.remove('hidden');
            document.getElementById('errorMsg').textContent = 'Please complete the required fields in the brief.';
            return;
        }
        
        document.getElementById('errorAlert').classList.add('hidden');
        document.getElementById('genOverlay').classList.add('active');
        
        if (generationController) {
            generationController.abort();
        }
        generationController = new AbortController();
        
        const payload = {
            action: 'generate',
            emailGoal: goal,
            recipient: {
                name: document.getElementById('recipientName').value,
                company: company,
                position: position,
                email: ''
            },
            userContext: {
                name: userName,
                background: bg,
                keySkills: '',
                whyContacting: goal + ' - ' + document.getElementById('companyContext').value
            },
            personalization: {
                tone: document.getElementById('tone').value,
                length: document.getElementById('length').value,
                ctaStyle: document.getElementById('ctaStyle').value
            }
        };
        
        try {
            const session = await window.appSdk.auth.getSession();
            const headers = { 'Content-Type': 'application/json' };
            if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
            
            const res = await fetch('/api/cold-email', {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: generationController.signal
            });
            
            const data = await res.json();
            if(!res.ok) throw new Error(data.error || 'Failed');
            
            currentEmailData = data;
            renderWorkspace(data);
            
        } catch(e) {
            if (e.name !== 'AbortError') {
                const alert = document.getElementById('errorAlert');
                alert.classList.remove('hidden');
                document.getElementById('errorMsg').textContent = 'Generation failed. Please try again.';
            }
        } finally {
            document.getElementById('genOverlay').classList.remove('active');
        }
    });
  }

  function renderWorkspace(data) {
    document.getElementById('workspaceEmpty').style.display = 'none';
    document.getElementById('workspaceEditor').style.display = 'grid';
    
    // Render subjects
    const subContainer = document.getElementById('subjectContainer');
    subContainer.innerHTML = '';
    
    let lines = data.variantA.split('\n');
    let subject = lines.find(l => l.toLowerCase().startsWith('subject:'));
    if(subject) {
        subject = subject.replace(/subject:/i, '').trim();
        lines = lines.filter(l => !l.toLowerCase().startsWith('subject:'));
    } else {
        subject = 'Introduction / ' + (document.getElementById('userName').value || document.getElementById('userNameManual').value);
    }
    
    const body = lines.join('\n').trim();
    
    const s1 = document.createElement('div'); s1.className = 'subject-pill active'; s1.textContent = subject;
    const s2 = document.createElement('div'); s2.className = 'subject-pill'; s2.textContent = 'Quick question regarding ' + document.getElementById('companyName').value;
    const s3 = document.createElement('div'); s3.className = 'subject-pill'; s3.textContent = 'Connecting: ' + (document.getElementById('userName').value || document.getElementById('userNameManual').value);
    
    [s1, s2, s3].forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.subject-pill').forEach(p => p.classList.remove('active'));
            el.classList.add('active');
        });
        subContainer.appendChild(el);
    });
    
    document.getElementById('emailBody').innerText = body;
    
    // Render Analytics
    const scoreVal = document.getElementById('overallScore');
    scoreVal.textContent = 'Strong outreach potential';
    scoreVal.style.color = 'var(--success)';
    scoreVal.style.background = 'rgba(16, 185, 129, 0.1)';
    
    // Render Variants
    const varCont = document.getElementById('variantsContainer');
    varCont.innerHTML = '';
    ['A', 'B', 'C'].forEach(k => {
        if(data['variant'+k]) {
            const v = document.createElement('div');
            v.className = 'variant-card' + (k==='A' ? ' active' : '');
            v.innerHTML = `<div style="font-weight:600; margin-bottom:0.5rem;">Variant ${k}</div>
                           <div style="font-size:0.85rem; color:var(--text-2); white-space:pre-wrap; max-height:80px; overflow:hidden;">${data['variant'+k]}</div>
                           <button class="btn btn-secondary" style="margin-top:1rem; padding:0.5rem; font-size:0.8rem;">Use this version</button>`;
            varCont.appendChild(v);
        }
    });
    
    // Render Followups
    const folCont = document.getElementById('followUpsContainer');
    folCont.innerHTML = `
        <div class="variant-card">
            <div style="font-weight:600; margin-bottom:0.25rem;">Follow-up 1 <span style="font-weight:400; font-size:0.8rem; color:var(--text-3); float:right;">3-5 business days</span></div>
            <div style="font-size:0.85rem; color:var(--text-2); margin-top:0.5rem;">Hi ${document.getElementById('recipientName').value || 'there'},\n\nJust floating this to the top of your inbox. I know things are busy at ${document.getElementById('companyName').value}. Let me know if you have a moment to connect.</div>
        </div>
        <div class="variant-card">
            <div style="font-weight:600; margin-bottom:0.25rem;">Final Follow-up <span style="font-weight:400; font-size:0.8rem; color:var(--text-3); float:right;">7-10 business days</span></div>
            <div style="font-size:0.85rem; color:var(--text-2); margin-top:0.5rem;">Hi ${document.getElementById('recipientName').value || 'there'},\n\nI won't follow up again as I assume priorities are elsewhere right now. I'll keep following ${document.getElementById('companyName').value}'s progress!</div>
        </div>
    `;
  }
  
  function setupCopilot() {
    const actions = document.querySelectorAll('.copilot-action');
    actions.forEach(btn => {
        btn.addEventListener('click', () => {
            const orig = document.getElementById('emailBody').innerText;
            const diffView = document.getElementById('aiDiffView');
            document.getElementById('diffOrig').innerText = orig.substring(0, 100) + '...';
            document.getElementById('diffSug').innerText = "Simulated improved version based on action: " + btn.dataset.action + "\n\n" + orig.substring(0, 80) + "...";
            diffView.style.display = 'block';
        });
    });
    
    document.getElementById('btnRejectAi').addEventListener('click', () => {
        document.getElementById('aiDiffView').style.display = 'none';
    });
    document.getElementById('btnAcceptAi').addEventListener('click', () => {
        document.getElementById('emailBody').innerText = document.getElementById('diffSug').innerText;
        document.getElementById('aiDiffView').style.display = 'none';
        showToast('Change applied!');
    });
  }
  
  function setupTabs() {
    const tabs = document.querySelectorAll('.tab-item');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(t => {
        t.addEventListener('click', () => {
            tabs.forEach(x => x.classList.remove('active'));
            contents.forEach(x => x.classList.add('hidden'));
            
            t.classList.add('active');
            document.getElementById(t.dataset.tab).classList.remove('hidden');
        });
    });
  }

  // Initialize
  init();
})();
'''

with open("c:/Users/saura/.gemini/antigravity-ide/scratch/careercraft-ai/cold-email.html", "w", encoding="utf-8") as f:
    f.write(html_content)

with open("c:/Users/saura/.gemini/antigravity-ide/scratch/careercraft-ai/cold-email.js", "w", encoding="utf-8") as f:
    f.write(js_content)
