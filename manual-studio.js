/**
 * manual-studio.js — Redesigned Premium Dual Workspace System (Manual Studio)
 * Implements Apple/Notion/Figma-inspired writing workspace inside CareerCraft AI.
 */
(function () {
  const ManualStudio = {
    initialized: false,
    workspace: 'ai', // 'ai' or 'manual'
    activeTab: 'resume', // 'resume', 'cover-letter', 'cold-email', 'portfolio', 'personal-info'
    undoStack: [],
    redoStack: [],
    historyList: [],
    saveTimeout: null,
    historySaveTimeout: null,
    isDragging: false,
    draggedElement: null,

    // Document state cache for Manual Studio
    state: {
      home: {},
      resume: {
        full_name: '',
        email: '',
        phone: '',
        location: '',
        professional_summary: '',
        experience: [],
        education: [],
        skills: [],
        certifications: '',
        template_name: 'modern',
        font_family: 'Inter',
        spacing: 'normal',
        accent_color: '#6366f1'
      },
      coverLetter: {
        job_title: '',
        company_name: '',
        generated_letter: '',
        hiring_manager: '',
        industry: '',
        location: '',
        key_skills: '',
        achievements: '',
        additional_instructions: '',
        tone: 'professional',
        length: 'medium'
      },
      coldEmail: {
        subject: '',
        body: '',
        company: '',
        recipient_title: '',
        recipient_name: '',
        linkedin_url: '',
        website: '',
        user_name: '',
        background: '',
        key_skills: '',
        experience_desc: '',
        why_contacting: '',
        goal: ''
      },
      portfolio: {
        title: 'My Professional Portfolio',
        description: 'A curated showcase of my professional achievements and projects.',
        projects: [
          { title: 'Project Alpha', link: 'https://github.com', description: 'Designed a high-throughput microservices architecture.' }
        ],
        skills: ['JavaScript', 'System Architecture', 'UI/UX Design'],
        contact: { email: '', github: '', linkedin: '', website: '' }
      },
      personalInfo: {
        full_name: '',
        email: '',
        phone: '',
        location: '',
        job_title: '',
        summary: '',
        skills: [],
        website: '',
        linkedin: '',
        github: ''
      }
    },

    async init() {
      if (this.initialized) return;
      this.initialized = true;

      // 1. Detect page type
      const page = window.location.pathname.split('/').pop() || 'index.html';
      if (page === 'index.html' || page === 'login.html' || page === 'signup.html' || page === 'reset-password.html' || page === '') {
        return; // Don't run on landing or auth pages
      }

      // Map current page to default active tab
      if (page.startsWith('resume')) this.activeTab = 'resume';
      else if (page.startsWith('cover-letter')) this.activeTab = 'cover-letter';
      else if (page.startsWith('cold-email')) this.activeTab = 'cold-email';
      else if (page.startsWith('dashboard')) this.activeTab = 'home';

      const isDocPage = page.startsWith('resume') || page.startsWith('cover-letter') || page.startsWith('cold-email') || page.startsWith('dashboard');
      if (!isDocPage) return;

      // 2. Load workspace preference
      this.workspace = window.WorkspaceManager ? window.WorkspaceManager.workspace : (localStorage.getItem('careercraft_workspace') || 'ai');

      // 3. Initialize manual layout elements
      this.buildManualStudioLayout();

      // 4. Setup general listeners (shortcuts, selections, drag-drop)
      this.setupListeners();

      // 5. Load user profile details
      this.loadUserProfile();

      // 6. Install original page hooks to capture document loading
      this.installHooks();

      // 7. Subscribe to global WorkspaceManager events
      window.addEventListener('workspaceChanged', (e) => {
        this.workspace = e.detail.workspace;
        this.handleWorkspaceChange();
      });

      // 8. If manual workspace is active, switch to it immediately (synchronously to avoid FOUC)
      if (this.workspace === 'manual') {
        this.handleWorkspaceChange();
      }
    },

    handleWorkspaceChange() {
      const root = document.getElementById('manual-studio-root');
      const page = window.location.pathname.split('/').pop() || 'index.html';
      const isAppPage = page !== 'index.html' && page !== 'login.html' && page !== 'signup.html' && page !== 'reset-password.html' && page !== '';
      const isDocPage = isAppPage && (page.startsWith('resume') || page.startsWith('cover-letter') || page.startsWith('cold-email') || page.startsWith('dashboard'));

      if (this.workspace === 'manual') {
        if (isDocPage) {
          document.documentElement.classList.add('manual-studio-active');
          document.body.classList.add('manual-studio-active');
        } else {
          document.documentElement.classList.remove('manual-studio-active');
          document.body.classList.remove('manual-studio-active');
        }
        if (root) root.style.display = 'grid';
        this.syncStateFromOriginalPage();
        this.renderActiveDocument();
      } else {
        document.documentElement.classList.remove('manual-studio-active');
        document.body.classList.remove('manual-studio-active');
        if (root) root.style.display = 'none';
        this.syncStateToOriginalPage();

        // Refresh original page live preview if function is available
        if (window.updatePreview) window.updatePreview();
        else if (window.updateLivePreview) window.updateLivePreview();
        else if (window.updateLiveStats) window.updateLiveStats();
      }
    },

    installHooks() {
      // Hook into syncUIFromState in resume.html
      const originalSyncUI = window.syncUIFromState;
      window.syncUIFromState = (data) => {
        if (originalSyncUI) originalSyncUI(data);
        if (this.workspace === 'manual') {
          this.syncStateFromOriginalPage();
          this.renderActiveDocument();
        }
      };

      // Hook into previewSavedLetter in cover-letter.html
      const originalPreviewLetter = window.previewSavedLetter;
      window.previewSavedLetter = async (id) => {
        if (originalPreviewLetter) await originalPreviewLetter(id);
        if (this.workspace === 'manual') {
          this.syncStateFromOriginalPage();
          this.renderActiveDocument();
        }
      };

      // Hook into loadDraft in cold-email.html
      const originalLoadDraft = window.loadDraft;
      window.loadDraft = (id) => {
        if (originalLoadDraft) originalLoadDraft(id);
        if (this.workspace === 'manual') {
          this.syncStateFromOriginalPage();
          this.renderActiveDocument();
        }
      };
    },

    // ─── STATIC LAYOUT GENERATOR ──────────────────────────────
    buildManualStudioLayout() {
      if (document.getElementById('manual-studio-root')) return;

      const root = document.createElement('div');
      root.id = 'manual-studio-root';

      // SIDEBAR HTML
      const sidebarHtml = `
        <div id="manual-sidebar">
          <div class="sidebar-title">Documents</div>
          <ul class="sidebar-menu">
            <li>
              <button type="button" class="sidebar-item-btn ${this.activeTab === 'home' ? 'active' : ''}" data-tab="home">
                <span class="sidebar-icon">🏠</span> Home
              </button>
            </li>
            <li>
              <button type="button" class="sidebar-item-btn ${this.activeTab === 'resume' ? 'active' : ''}" data-tab="resume">
                <span class="sidebar-icon">📄</span> Resume
              </button>
            </li>
            <li>
              <button type="button" class="sidebar-item-btn ${this.activeTab === 'cover-letter' ? 'active' : ''}" data-tab="cover-letter">
                <span class="sidebar-icon">📨</span> Cover Letter
              </button>
            </li>
            <li>
              <button type="button" class="sidebar-item-btn ${this.activeTab === 'cold-email' ? 'active' : ''}" data-tab="cold-email">
                <span class="sidebar-icon">✉️</span> Cold Email
              </button>
            </li>
            <li>
              <button type="button" class="sidebar-item-btn ${this.activeTab === 'portfolio' ? 'active' : ''}" data-tab="portfolio">
                <span class="sidebar-icon">💼</span> Portfolio
              </button>
            </li>
            <li>
              <button type="button" class="sidebar-item-btn ${this.activeTab === 'personal-info' ? 'active' : ''}" data-tab="personal-info">
                <span class="sidebar-icon">👤</span> Personal Info
              </button>
            </li>
          </ul>
        </div>
      `;

      // MAIN CANVAS HTML
      const canvasHtml = `
        <div id="manual-editor-pane">
          <div class="manual-paper font-inter spacing-normal" id="manual-paper" data-accent="indigo">
            <div id="document-canvas-content"></div>
          </div>
        </div>
      `;

      // CUSTOMIZER TOOLBAR HTML
      const customizerHtml = `
        <div id="manual-customizer">
          <div class="control-group">
            <span class="control-label">Typography</span>
            <select class="control-select" id="manual-font-select">
              <option value="inter">Inter (Modern Sans)</option>
              <option value="outfit">Outfit (Geometric Accent)</option>
              <option value="georgia">Georgia (Elegant Serif)</option>
              <option value="roboto">Roboto (Technical)</option>
            </select>
          </div>

          <div class="control-group">
            <span class="control-label">Line Spacing</span>
            <select class="control-select" id="manual-spacing-select">
              <option value="compact">Compact (1.4)</option>
              <option value="normal" selected>Normal (1.65)</option>
              <option value="relaxed">Relaxed (1.9)</option>
            </select>
          </div>

          <div class="control-group">
            <span class="control-label">Accent Palette</span>
            <div class="swatches-row">
              <div class="manual-swatch active" style="background: #6366f1;" data-color="indigo"></div>
              <div class="manual-swatch" style="background: #a855f7;" data-color="purple"></div>
              <div class="manual-swatch" style="background: #10b981;" data-color="emerald"></div>
              <div class="manual-swatch" style="background: #475569;" data-color="slate"></div>
              <div class="manual-swatch" style="background: #f43f5e;" data-color="rose"></div>
            </div>
          </div>

          <div class="control-group" style="margin-top: 1rem;">
            <span class="control-label">Document Version Actions</span>
            <div class="action-btn-row">
              <button type="button" class="btn-manual-secondary" id="manual-undo-btn">↩ Undo</button>
              <button type="button" class="btn-manual-secondary" id="manual-redo-btn">↪ Redo</button>
            </div>
          </div>

          <div class="control-group">
            <span class="control-label">Version History</span>
            <div class="version-list" id="manual-version-history">
              <div style="font-size:0.75rem; color:#94a3b8; padding: 0.5rem; text-align:center;">No edits recorded</div>
            </div>
          </div>

          <div class="control-group">
            <span class="control-label">Sync Status</span>
            <div class="save-status-container">
              <span class="status-dot" id="save-status-dot"></span>
              <span id="save-status-text">Synced to cloud</span>
            </div>
          </div>

          <div class="control-group" style="margin-top: auto; border-top: 1px solid #e2e8f0; padding-top: 1.5rem;">
            <span class="control-label">Document Export</span>
            <div class="action-btn-row">
              <button type="button" class="btn-manual-primary" id="manual-pdf-btn">⬇ Export PDF</button>
              <button type="button" class="btn-manual-secondary" id="manual-docx-btn">📄 Export DOCX</button>
            </div>
          </div>
        </div>
      `;

      root.innerHTML = sidebarHtml + canvasHtml + customizerHtml;
      document.body.appendChild(root);

      // Inject floating rich-text styling toolbar
      const formatToolbar = document.createElement('div');
      formatToolbar.id = 'formatting-toolbar';
      formatToolbar.innerHTML = `
        <button type="button" class="format-btn" data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>
        <button type="button" class="format-btn" data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>
        <button type="button" class="format-btn" data-cmd="underline" title="Underline (Ctrl+U)"><u>U</u></button>
        <button type="button" class="format-btn" data-cmd="insertUnorderedList" title="List">• List</button>
        <button type="button" class="format-btn" data-cmd="formatBlock" data-val="h2" title="Header">H2</button>
        <button type="button" class="format-btn" data-cmd="formatBlock" data-val="p" title="Paragraph">P</button>
      `;
      document.body.appendChild(formatToolbar);
    },

    // ─── STATE SYNC MECHANISMS ─────────────────────────────────
    syncStateFromOriginalPage() {
      const page = window.location.pathname.split('/').pop() || 'index.html';

      if (page.startsWith('resume')) {
        // Collect form data from resume fields
        if (typeof window.collectFormData === 'function') {
          const originalData = window.collectFormData();
          this.state.resume = { ...this.state.resume, ...originalData };
        } else if (window.resumeState) {
          this.state.resume = { ...this.state.resume, ...window.resumeState };
        }
      } 
      else if (page.startsWith('cover-letter')) {
        this.state.coverLetter.job_title = document.getElementById('jobTitle')?.value || '';
        this.state.coverLetter.company_name = document.getElementById('companyName')?.value || '';
        this.state.coverLetter.generated_letter = document.getElementById('editorSheet')?.innerText || '';
        this.state.coverLetter.hiring_manager = document.getElementById('hiringManager')?.value || '';
        this.state.coverLetter.industry = document.getElementById('industry')?.value || '';
        this.state.coverLetter.location = document.getElementById('location')?.value || '';
        this.state.coverLetter.key_skills = document.getElementById('mustHaveSkills')?.value || '';
        this.state.coverLetter.achievements = document.getElementById('keyAchievements')?.value || '';
        this.state.coverLetter.additional_instructions = document.getElementById('additionalInstructions')?.value || '';
        this.state.coverLetter.tone = document.getElementById('tone')?.value || 'professional';
        this.state.coverLetter.length = document.getElementById('length')?.value || 'medium';
      }
      else if (page.startsWith('cold-email')) {
        this.state.coldEmail.subject = document.getElementById('previewSubject')?.textContent.replace('Subject: ', '') || '';
        this.state.coldEmail.body = document.getElementById('previewBody')?.textContent || '';
        this.state.coldEmail.company = document.getElementById('companyName')?.value || '';
        this.state.coldEmail.recipient_title = document.getElementById('position')?.value || '';
        this.state.coldEmail.recipient_name = document.getElementById('recipientName')?.value || '';
        this.state.coldEmail.linkedin_url = document.getElementById('linkedinUrl')?.value || '';
        this.state.coldEmail.website = document.getElementById('companyWebsite')?.value || '';
        this.state.coldEmail.user_name = document.getElementById('userName')?.value || '';
        this.state.coldEmail.background = document.getElementById('background')?.value || '';
        this.state.coldEmail.key_skills = document.getElementById('keySkills')?.value || '';
        this.state.coldEmail.experience_desc = document.getElementById('experience')?.value || '';
        this.state.coldEmail.why_contacting = document.getElementById('whyContacting')?.value || '';
        this.state.coldEmail.goal = document.getElementById('emailGoal')?.value || '';
      }
    },

    syncStateToOriginalPage() {
      const page = window.location.pathname.split('/').pop() || 'index.html';

      if (page.startsWith('resume')) {
        const data = this.state.resume;
        if (typeof window.syncUIFromState === 'function') {
          window.syncUIFromState(data);
        } else {
          // Fallback UI fields synchronization
          if (document.getElementById('fullName')) document.getElementById('fullName').value = data.full_name;
          if (document.getElementById('email')) document.getElementById('email').value = data.email;
          if (document.getElementById('phone')) document.getElementById('phone').value = data.phone;
          if (document.getElementById('location')) document.getElementById('location').value = data.location;
          if (document.getElementById('summary')) document.getElementById('summary').value = data.professional_summary;
          if (document.getElementById('certifications')) document.getElementById('certifications').value = data.certifications;
          if (document.getElementById('templateName')) document.getElementById('templateName').value = data.template_name;
        }
      }
      else if (page.startsWith('cover-letter')) {
        const data = this.state.coverLetter;
        if (document.getElementById('jobTitle')) document.getElementById('jobTitle').value = data.job_title;
        if (document.getElementById('companyName')) document.getElementById('companyName').value = data.company_name;
        if (document.getElementById('editorSheet')) document.getElementById('editorSheet').innerText = data.generated_letter;
        if (document.getElementById('hiringManager')) document.getElementById('hiringManager').value = data.hiring_manager;
        if (document.getElementById('industry')) document.getElementById('industry').value = data.industry;
        if (document.getElementById('location')) document.getElementById('location').value = data.location;
        if (document.getElementById('mustHaveSkills')) document.getElementById('mustHaveSkills').value = data.key_skills;
        if (document.getElementById('keyAchievements')) document.getElementById('keyAchievements').value = data.achievements;
        if (document.getElementById('additionalInstructions')) document.getElementById('additionalInstructions').value = data.additional_instructions;
        if (document.getElementById('tone')) document.getElementById('tone').value = data.tone;
        if (document.getElementById('length')) document.getElementById('length').value = data.length;
      }
      else if (page.startsWith('cold-email')) {
        const data = this.state.coldEmail;
        if (document.getElementById('previewSubject')) document.getElementById('previewSubject').textContent = `Subject: ${data.subject}`;
        if (document.getElementById('previewBody')) document.getElementById('previewBody').textContent = data.body;
        if (document.getElementById('companyName')) document.getElementById('companyName').value = data.company;
        if (document.getElementById('position')) document.getElementById('position').value = data.recipient_title;
        if (document.getElementById('recipientName')) document.getElementById('recipientName').value = data.recipient_name;
        if (document.getElementById('linkedinUrl')) document.getElementById('linkedinUrl').value = data.linkedin_url;
        if (document.getElementById('companyWebsite')) document.getElementById('companyWebsite').value = data.website;
        if (document.getElementById('userName')) document.getElementById('userName').value = data.user_name;
        if (document.getElementById('background')) document.getElementById('background').value = data.background;
        if (document.getElementById('keySkills')) document.getElementById('keySkills').value = data.key_skills;
        if (document.getElementById('experience')) document.getElementById('experience').value = data.experience_desc;
        if (document.getElementById('whyContacting')) document.getElementById('whyContacting').value = data.why_contacting;
        if (document.getElementById('emailGoal')) document.getElementById('emailGoal').value = data.goal;
      }
    },

    // ─── DOCUMENT RENDERING CONTROLLER ─────────────────────────
    renderActiveDocument() {
      const container = document.getElementById('document-canvas-content');
      if (!container) return;

      container.innerHTML = '';
      this.saveUndoSnapshot();

      switch (this.activeTab) {
        case 'home':
          this.renderHomeDashboard(container);
          break;
        case 'resume':
          this.renderResumeEditor(container);
          break;
        case 'cover-letter':
          this.renderCoverLetterEditor(container);
          break;
        case 'cold-email':
          this.renderColdEmailEditor(container);
          break;
        case 'portfolio':
          this.renderPortfolioEditor(container);
          break;
        case 'personal-info':
          this.renderPersonalInfoEditor(container);
          break;
      }

      // Synchronize Customizer values
      this.syncCustomizerUI();
    },

    syncCustomizerUI() {
      const paper = document.getElementById('manual-paper');
      if (!paper) return;

      let font = 'inter';
      let spacing = 'normal';
      let accent = 'indigo';

      if (this.activeTab === 'resume') {
        font = (this.state.resume.font_family || 'inter').toLowerCase();
        spacing = this.state.resume.spacing || 'normal';
        // Map Hex accent color back to swatches
        const color = this.state.resume.accent_color;
        if (color === '#6366f1') accent = 'indigo';
        else if (color === '#a855f7') accent = 'purple';
        else if (color === '#10b981') accent = 'emerald';
        else if (color === '#475569') accent = 'slate';
        else if (color === '#f43f5e') accent = 'rose';
      }

      // Set select values
      document.getElementById('manual-font-select').value = font;
      document.getElementById('manual-spacing-select').value = spacing;

      // Apply classes to paper
      paper.className = `manual-paper font-${font} spacing-${spacing}`;
      paper.setAttribute('data-accent', accent);

      // Accent active swatch
      document.querySelectorAll('.manual-swatch').forEach(s => {
        s.classList.toggle('active', s.getAttribute('data-color') === accent);
      });
    },

    // 0. Home Dashboard Editor View
    async renderHomeDashboard(container) {
      container.innerHTML = `
        <div style="padding: 2.5rem 1.5rem; max-width: 1100px; margin: 0 auto;">
          <!-- Dashboard Header -->
          <div class="command-header" style="margin-bottom: 2.5rem;">
              <h1 style="font-size: 2.25rem; font-weight: 800; letter-spacing: -0.04em; margin-bottom: 0.25rem; color: #0f172a; font-family: 'Outfit', sans-serif;">
                  <span id="manualGreetingSpan">Good Afternoon</span>, <span id="manualNameSpan">User</span>
              </h1>
              <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 1.5rem;">Continue building your career.</p>
              
              <!-- Compact Metrics Row -->
              <div class="metrics-row" id="manualMetricsRow" style="display: flex; flex-wrap: wrap; gap: 2.5rem; border-top: 1px solid #e2e8f0; padding-top: 1.25rem; margin-top: 1.25rem;">
                  <div class="workspace-portal-spinner" style="width:20px; height:20px;"></div>
              </div>
          </div>

          <!-- Tools Smart Grid -->
          <div class="smart-grid" id="manualSmartGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; margin-bottom: 3.5rem;">
              <!-- Dynamic smart cards -->
          </div>

          <!-- Secondary Bottom Panel -->
          <div class="bottom-layout" style="display: grid; grid-template-columns: 1.6fr 1fr; gap: 2rem; margin-bottom: 3.5rem;">
              <!-- Left: Recent Activity -->
              <div class="panel-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); position: relative;">
                  <h3 class="panel-title" style="font-size: 1rem; font-weight: 700; color: #0f172a; margin-bottom: 1.25rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.5rem; font-family: 'Outfit', sans-serif;">Recent Activity</h3>
                  <div id="manualRecentActivityList" class="activity-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
                      <div style="font-size: 0.85rem; color: #94a3b8; text-align: center; padding: 1rem;">No recent activity.</div>
                  </div>
              </div>

              <!-- Right: Quick Resume -->
              <div class="panel-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); position: relative;">
                  <h3 class="panel-title" style="font-size: 1rem; font-weight: 700; color: #0f172a; margin-bottom: 1.25rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.5rem; font-family: 'Outfit', sans-serif;">Quick Resume</h3>
                  <div id="manualQuickResumeList" class="quick-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
                      <div style="font-size: 0.85rem; color: #94a3b8; text-align: center; padding: 1rem;">No drafts.</div>
                  </div>
              </div>
          </div>
        </div>
      `;

      const formatTimeAgo = (date) => {
          const seconds = Math.floor((new Date() - date) / 1000);
          let interval = Math.floor(seconds / 31536000);
          if (interval >= 1) return interval + " year" + (interval > 1 ? "s" : "") + " ago";
          interval = Math.floor(seconds / 2592000);
          if (interval >= 1) return interval + " month" + (interval > 1 ? "s" : "") + " ago";
          interval = Math.floor(seconds / 86400);
          if (interval >= 1) return interval + " day" + (interval > 1 ? "s" : "") + " ago";
          interval = Math.floor(seconds / 3600);
          if (interval >= 1) return interval + " hour" + (interval > 1 ? "s" : "") + " ago";
          interval = Math.floor(seconds / 60);
          if (interval >= 1) return interval + " minute" + (interval > 1 ? "s" : "") + " ago";
          return "just now";
      };

      const client = window.appSdk?.client;
      if (!client) return;

      try {
          const { data: { session } } = await client.auth.getSession();
          if (!session) return;

          const userId = session.user.id;
          const name = session.user.user_metadata?.full_name
              || localStorage.getItem('userName')
              || session.user.email.split('@')[0];

          const nameEl = document.getElementById('manualNameSpan');
          if (nameEl) nameEl.textContent = name;

          const hour = new Date().getHours();
          let greeting = 'Good Evening';
          if (hour < 12) greeting = 'Good Morning';
          else if (hour < 17) greeting = 'Good Afternoon';
          const greetingSpan = document.getElementById('manualGreetingSpan');
          if (greetingSpan) greetingSpan.textContent = greeting;

          const [resumesRes, coverLettersRes, emailsRes] = await Promise.all([
              client.from('resumes').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
              client.from('cover_letters').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
              client.from('email_history').select('*').eq('user_id', userId).order('created_at', { ascending: false })
          ]);

          const resumes = resumesRes.data || [];
          const coverLetters = coverLettersRes.data || [];
          const emails = emailsRes.data || [];

          const metricsRow = document.getElementById('manualMetricsRow');
          if (metricsRow) {
              let resumeProg = 0;
              if (resumes.length > 0) {
                  const r = resumes[0];
                  if (r.full_name || r.email || r.phone) resumeProg += 20;
                  if (r.professional_summary) resumeProg += 20;
                  if (r.experience && r.experience.length > 0) resumeProg += 30;
                  if (r.education && r.education.length > 0) resumeProg += 15;
                  if (r.skills && r.skills.length > 0) resumeProg += 15;
              }

              metricsRow.innerHTML = `
                  <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                      <div style="font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #94a3b8;">Resume Progress</div>
                      <div style="font-size: 1.35rem; font-weight: 800; color: #0f172a; font-family: 'Outfit', sans-serif;">${resumes.length > 0 ? resumeProg + '%' : '0%'}</div>
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                      <div style="font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #94a3b8;">Cover Letters</div>
                      <div style="font-size: 1.35rem; font-weight: 800; color: #0f172a; font-family: 'Outfit', sans-serif;">${coverLetters.length}</div>
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                      <div style="font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #94a3b8;">Cold Emails</div>
                      <div style="font-size: 1.35rem; font-weight: 800; color: #0f172a; font-family: 'Outfit', sans-serif;">${emails.length}</div>
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                      <div style="font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #94a3b8;">Applications Tracked</div>
                      <div style="font-size: 1.1rem; font-weight: 800; color: #94a3b8; font-family: 'Outfit', sans-serif; padding-top: 0.25rem;">0 (Future)</div>
                  </div>
              `;
          }

          const smartGrid = document.getElementById('manualSmartGrid');
          if (smartGrid) {
              let gridHtml = '';

              let resumeProgress = 0;
              let resumeLastEdited = 'Never';
              let resumeCount = resumes.length;
              let atsScore = 'N/A';
              
              if (resumes.length > 0) {
                  const latest = resumes[0];
                  resumeLastEdited = formatTimeAgo(new Date(latest.created_at));
                  if (latest.full_name || latest.email || latest.phone) resumeProgress += 20;
                  if (latest.professional_summary) resumeProgress += 20;
                  if (latest.experience && latest.experience.length > 0) resumeProgress += 30;
                  if (latest.education && latest.education.length > 0) resumeProgress += 15;
                  if (latest.skills && latest.skills.length > 0) resumeProgress += 15;
                  atsScore = latest.professional_summary ? Math.min(100, 60 + Math.round(latest.professional_summary.length / 20)) + '/100' : 'N/A';
              }

              gridHtml += `
                  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; min-height: 260px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                      <div style="font-size: 1rem; font-weight: 700; color: #0f172a; margin-bottom: 1.25rem; font-family: 'Outfit', sans-serif;">📝 Resume Builder</div>
                      <div style="display: flex; flex-direction: column; gap: 0.6rem; flex-grow: 1; margin-bottom: 1.5rem;">
                          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                              <span style="color: #64748b;">Resume Progress</span>
                              <span style="color: #0f172a; font-weight: 600;">${resumeProgress}%</span>
                          </div>
                          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                              <span style="color: #64748b;">Last Edited</span>
                              <span style="color: #0f172a; font-weight: 600;">${resumeLastEdited}</span>
                          </div>
                          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                              <span style="color: #64748b;">Saved Resumes</span>
                              <span style="color: #0f172a; font-weight: 600;">${resumeCount}</span>
                          </div>
                          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                              <span style="color: #64748b;">ATS Score</span>
                              <span style="color: #0f172a; font-weight: 600;">${atsScore}</span>
                          </div>
                      </div>
                      <button class="creator-studio-btn-primary" onclick="document.querySelector('[data-tab=resume]').click()" style="width: 100%; border: none; background: #6366f1; color: #ffffff; padding: 0.5rem; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer;">Continue Resume</button>
                  </div>
              `;

              let letterCount = coverLetters.length;
              let letterLastEdited = 'Never';
              let targetCompany = 'N/A';

              if (coverLetters.length > 0) {
                  const latest = coverLetters[0];
                  letterLastEdited = formatTimeAgo(new Date(latest.created_at));
                  targetCompany = latest.company_name || 'N/A';
              }

              gridHtml += `
                  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; min-height: 260px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                      <div style="font-size: 1rem; font-weight: 700; color: #0f172a; margin-bottom: 1.25rem; font-family: 'Outfit', sans-serif;">📨 Cover Letter AI</div>
                      <div style="display: flex; flex-direction: column; gap: 0.6rem; flex-grow: 1; margin-bottom: 1.5rem;">
                          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                              <span style="color: #64748b;">Letters Created</span>
                              <span style="color: #0f172a; font-weight: 600;">${letterCount}</span>
                          </div>
                          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                              <span style="color: #64748b;">Last Generated</span>
                              <span style="color: #0f172a; font-weight: 600;">${letterLastEdited}</span>
                          </div>
                          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                              <span style="color: #64748b;">Target Company</span>
                              <span style="color: #0f172a; font-weight: 600;">${window.appSdk.ui.escapeHtml(targetCompany)}</span>
                          </div>
                      </div>
                      <button class="creator-studio-btn-primary" onclick="document.querySelector('[data-tab=cover-letter]').click()" style="width: 100%; border: none; background: #6366f1; color: #ffffff; padding: 0.5rem; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer;">Continue Writing</button>
                  </div>
              `;

              let emailCount = emails.length;
              let emailLastEdited = 'Never';
              let favoriteTemplate = 'N/A';

              if (emails.length > 0) {
                  const latest = emails[0];
                  emailLastEdited = formatTimeAgo(new Date(latest.created_at));
                  favoriteTemplate = latest.variant ? (latest.variant.charAt(0).toUpperCase() + latest.variant.slice(1)) : 'Custom';
              }

              gridHtml += `
                  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; min-height: 260px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                      <div style="font-size: 1rem; font-weight: 700; color: #0f172a; margin-bottom: 1.25rem; font-family: 'Outfit', sans-serif;">✉️ Cold Email Writer</div>
                      <div style="display: flex; flex-direction: column; gap: 0.6rem; flex-grow: 1; margin-bottom: 1.5rem;">
                          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                              <span style="color: #64748b;">Draft Count</span>
                              <span style="color: #0f172a; font-weight: 600;">${emailCount}</span>
                          </div>
                          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                              <span style="color: #64748b;">Last Edited</span>
                              <span style="color: #0f172a; font-weight: 600;">${emailLastEdited}</span>
                          </div>
                          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                              <span style="color: #64748b;">Favorite Template</span>
                              <span style="color: #0f172a; font-weight: 600;">${favoriteTemplate}</span>
                          </div>
                      </div>
                      <button class="creator-studio-btn-primary" onclick="document.querySelector('[data-tab=cold-email]').click()" style="width: 100%; border: none; background: #6366f1; color: #ffffff; padding: 0.5rem; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer;">Open Workspace</button>
                  </div>
              `;

              let recentResumeText = 'No recent resume';
              let recentLetterText = 'No recent letter';
              let recentEmailText = 'No recent email';

              if (resumes.length > 0) {
                  const r = resumes[0];
                  recentResumeText = r.full_name ? `${r.full_name}'s Resume` : 'Untitled Resume';
              }
              if (coverLetters.length > 0) {
                  const l = coverLetters[0];
                  recentLetterText = l.job_title ? `${l.job_title} at ${l.company_name || 'Acme'}` : 'Untitled Letter';
              }
              if (emails.length > 0) {
                  const e = emails[0];
                  recentEmailText = e.subject ? e.subject : (e.company ? `Intro to ${e.company}` : 'Untitled Email');
              }

              if (recentResumeText.length > 25) recentResumeText = recentResumeText.substring(0, 22) + '...';
              if (recentLetterText.length > 25) recentLetterText = recentLetterText.substring(0, 22) + '...';
              if (recentEmailText.length > 25) recentEmailText = recentEmailText.substring(0, 22) + '...';

              gridHtml += `
                  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; min-height: 260px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                      <div style="font-size: 1rem; font-weight: 700; color: #0f172a; margin-bottom: 1.25rem; font-family: 'Outfit', sans-serif;">📁 Recent Workspace Docs</div>
                      <div style="display: flex; flex-direction: column; gap: 0.4rem; flex-grow: 1; margin-bottom: 1.5rem; justify-content: center;">
                          <div style="font-size: 0.72rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; margin-bottom: 0.2rem; letter-spacing: 0.05em;">Recent Drafts</div>
                          <div onclick="document.querySelector('[data-tab=resume]').click()" style="display: flex; justify-content: space-between; font-size: 0.8rem; padding: 0.3rem 0; cursor: pointer; border-bottom: 1px solid #f1f5f9;">
                              <span style="color: #0f172a; font-weight: 600;">📄 ${window.appSdk.ui.escapeHtml(recentResumeText)}</span>
                              <span style="color: #6366f1; font-size: 0.75rem;">Open →</span>
                          </div>
                          <div onclick="document.querySelector('[data-tab=cover-letter]').click()" style="display: flex; justify-content: space-between; font-size: 0.8rem; padding: 0.3rem 0; cursor: pointer; border-bottom: 1px solid #f1f5f9;">
                              <span style="color: #0f172a; font-weight: 600;">📨 ${window.appSdk.ui.escapeHtml(recentLetterText)}</span>
                              <span style="color: #6366f1; font-size: 0.75rem;">Open →</span>
                          </div>
                          <div onclick="document.querySelector('[data-tab=cold-email]').click()" style="display: flex; justify-content: space-between; font-size: 0.8rem; padding: 0.3rem 0; cursor: pointer;">
                              <span style="color: #0f172a; font-weight: 600;">✉️ ${window.appSdk.ui.escapeHtml(recentEmailText)}</span>
                              <span style="color: #6366f1; font-size: 0.75rem;">Open →</span>
                          </div>
                      </div>
                      <button class="creator-studio-btn-primary" onclick="document.querySelector('[data-tab=resume]').click()" style="width: 100%; border: none; background: #6366f1; color: #ffffff; padding: 0.5rem; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer;">Open Documents</button>
                  </div>
              `;

              smartGrid.innerHTML = gridHtml;
          }

          const recentActivityList = document.getElementById('manualRecentActivityList');
          if (recentActivityList) {
              let activityItems = [];

              if (resumes.length > 0) {
                  const r = resumes[0];
                  activityItems.push({
                      title: `Resume updated for ${r.full_name || 'profile'}`,
                      time: formatTimeAgo(new Date(r.created_at)),
                      rawTime: new Date(r.created_at).getTime(),
                      tab: 'resume'
                  });
              }

              if (coverLetters.length > 0) {
                  const l = coverLetters[0];
                  activityItems.push({
                      title: `Cover letter generated for ${l.job_title || 'Role'} at ${l.company_name || 'Company'}`,
                      time: formatTimeAgo(new Date(l.created_at)),
                      rawTime: new Date(l.created_at).getTime(),
                      tab: 'cover-letter'
                  });
              }

              if (emails.length > 0) {
                  const e = emails[0];
                  activityItems.push({
                      title: `Cold email saved for ${e.recipient_title || 'Contact'} at ${e.company || 'Company'}`,
                      time: formatTimeAgo(new Date(e.created_at)),
                      rawTime: new Date(e.created_at).getTime(),
                      tab: 'cold-email'
                  });
              }

              activityItems.sort((a, b) => b.rawTime - a.rawTime);

              if (activityItems.length === 0) {
                  recentActivityList.innerHTML = `<div style="font-size: 0.85rem; color: #94a3b8; text-align: center; padding: 1rem;">No recent activity recorded.</div>`;
              } else {
                  recentActivityList.innerHTML = activityItems.map(item => `
                      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.8rem; background: #fafafa; border: 1px solid #f1f5f9; border-radius: 6px;">
                          <div style="flex: 1; padding-right: 0.5rem;">
                              <div style="font-size: 0.82rem; font-weight: 600; color: #334155;">${window.appSdk.ui.escapeHtml(item.title)}</div>
                              <div style="font-size: 0.72rem; color: #94a3b8;">${item.time}</div>
                          </div>
                          <span onclick="document.querySelector('[data-tab=${item.tab}]').click()" style="font-size: 0.78rem; font-weight: 600; color: #6366f1; cursor: pointer; white-space: nowrap;">Open →</span>
                      </div>
                  `).join('');
              }
          }

          const quickResumeList = document.getElementById('manualQuickResumeList');
          if (quickResumeList) {
              let quickHtml = '';

              let resumeSubtitle = 'Create new resume';
              if (resumes.length > 0) {
                  resumeSubtitle = `Continue editing ${resumes[0].full_name || 'Resume'}`;
              }
              quickHtml += `
                  <div onclick="document.querySelector('[data-tab=resume]').click()" style="display: flex; flex-direction: column; gap: 0.15rem; padding: 0.6rem 0.8rem; background: #fafafa; border-left: 3px solid #6366f1; border-top: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; border-radius: 4px; cursor: pointer; transition: all 0.2s ease;">
                      <span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em;">Resume Builder</span>
                      <span style="font-size: 0.8rem; font-weight: 600; color: #334155;">${window.appSdk.ui.escapeHtml(resumeSubtitle)}</span>
                  </div>
              `;

              let letterSubtitle = 'Open latest draft';
              if (coverLetters.length > 0) {
                  letterSubtitle = `Open ${coverLetters[0].job_title || 'letter'} draft @ ${coverLetters[0].company_name || 'Acme'}`;
              }
              quickHtml += `
                  <div onclick="document.querySelector('[data-tab=cover-letter]').click()" style="display: flex; flex-direction: column; gap: 0.15rem; padding: 0.6rem 0.8rem; background: #fafafa; border-left: 3px solid #6366f1; border-top: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; border-radius: 4px; cursor: pointer; transition: all 0.2s ease;">
                      <span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em;">Cover Letter</span>
                      <span style="font-size: 0.8rem; font-weight: 600; color: #334155;">${window.appSdk.ui.escapeHtml(letterSubtitle)}</span>
                  </div>
              `;

              let emailSubtitle = 'Resume draft';
              if (emails.length > 0) {
                  emailSubtitle = `Open intro draft for ${emails[0].company || 'Acme'}`;
              }
              quickHtml += `
                  <div onclick="document.querySelector('[data-tab=cold-email]').click()" style="display: flex; flex-direction: column; gap: 0.15rem; padding: 0.6rem 0.8rem; background: #fafafa; border-left: 3px solid #6366f1; border-top: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; border-radius: 4px; cursor: pointer; transition: all 0.2s ease;">
                      <span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em;">Cold Email</span>
                      <span style="font-size: 0.8rem; font-weight: 600; color: #334155;">${window.appSdk.ui.escapeHtml(emailSubtitle)}</span>
                  </div>
              `;

              quickResumeList.innerHTML = quickHtml;
          }
      } catch (err) {
          console.error('Error loading Creator Studio home dashboard:', err);
      }
    },

    // ─── INDIVIDUAL MANUAL EDITORS ──────────────────────────────

    // 1. Resume manual editor (draggable entries & inline rich-text)
    renderResumeEditor(container) {
      const data = this.state.resume;

      const headerHtml = `
        <div class="doc-header">
          <div class="doc-title-input" contenteditable="true" placeholder="Full Name" id="res-full-name">${data.full_name || ''}</div>
          <div style="display:flex; flex-wrap:wrap; gap:1.5rem; font-size:0.85rem; color:#64748b; margin-top:0.5rem;">
            <div contenteditable="true" placeholder="📧 Email" id="res-email" style="min-width:150px;">${data.email || ''}</div>
            <div contenteditable="true" placeholder="📱 Phone" id="res-phone" style="min-width:120px;">${data.phone || ''}</div>
            <div contenteditable="true" placeholder="📍 Location" id="res-location" style="min-width:120px;">${data.location || ''}</div>
          </div>
          <div class="doc-divider"></div>
        </div>
      `;

      const summaryHtml = `
        <div class="paper-section">
          <div class="paper-section-title">Professional Summary</div>
          <div contenteditable="true" placeholder="A brief professional summary describing your qualifications..." id="res-summary" style="font-size:0.9rem; line-height:1.6;">${data.professional_summary || ''}</div>
        </div>
      `;

      // Experiences Draggable List
      let expListHtml = '';
      (data.experience || []).forEach((exp, idx) => {
        expListHtml += `
          <div class="draggable-card" draggable="true" data-type="experience" data-index="${idx}">
            <span class="card-drag-handle">⠿</span>
            <button type="button" class="card-remove-btn" onclick="ManualStudio.removeListEntry('experience', ${idx})">Remove</button>
            <div class="card-title-field" contenteditable="true" placeholder="Job Title" data-field="title">${exp.title || ''}</div>
            <div class="card-meta-field">
              <span contenteditable="true" placeholder="Company" data-field="company">${exp.company || ''}</span>
              &nbsp;|&nbsp;
              <span contenteditable="true" placeholder="Start Date - End Date" data-field="dates">${(exp.start || '') + (exp.end ? ' - ' + exp.end : '')}</span>
            </div>
            <div class="card-desc-field" contenteditable="true" placeholder="Describe achievements and responsibilities..." data-field="description">${exp.description || ''}</div>
          </div>
        `;
      });

      const experienceHtml = `
        <div class="paper-section">
          <div class="paper-section-title">
            <span>Work Experience</span>
            <button type="button" class="btn-manual-add" onclick="ManualStudio.addListEntry('experience')">+ Add Job</button>
          </div>
          <div id="res-experience-list">${expListHtml || '<p style="color:#cbd5e1; font-size:0.85rem; padding: 1rem 0;">No work experience entries yet.</p>'}</div>
        </div>
      `;

      // Education Draggable List
      let eduListHtml = '';
      (data.education || []).forEach((edu, idx) => {
        eduListHtml += `
          <div class="draggable-card" draggable="true" data-type="education" data-index="${idx}">
            <span class="card-drag-handle">⠿</span>
            <button type="button" class="card-remove-btn" onclick="ManualStudio.removeListEntry('education', ${idx})">Remove</button>
            <div class="card-title-field" contenteditable="true" placeholder="Degree / Qualification" data-field="degree">${edu.degree || ''}</div>
            <div class="card-meta-field">
              <span contenteditable="true" placeholder="School" data-field="school">${edu.school || ''}</span>
              &nbsp;|&nbsp;
              <span contenteditable="true" placeholder="Year" data-field="year">${edu.year || ''}</span>
              &nbsp;|&nbsp;
              <span contenteditable="true" placeholder="Grade/GPA" data-field="grade">${edu.grade || ''}</span>
            </div>
          </div>
        `;
      });

      const educationHtml = `
        <div class="paper-section">
          <div class="paper-section-title">
            <span>Education</span>
            <button type="button" class="btn-manual-add" onclick="ManualStudio.addListEntry('education')">+ Add Education</button>
          </div>
          <div id="res-education-list">${eduListHtml || '<p style="color:#cbd5e1; font-size:0.85rem; padding: 1rem 0;">No education entries yet.</p>'}</div>
        </div>
      `;

      // Skills tags container
      let skillTagsHtml = '';
      (data.skills || []).forEach(skill => {
        skillTagsHtml += `
          <span class="skill-tag" style="background:#f1f5f9; color:#334155; border:1px solid #e2e8f0; padding:0.35rem 0.75rem; border-radius:999px; font-size:0.8rem; display:inline-flex; align-items:center; gap:0.4rem;">
            ${skill}
            <button type="button" style="border:none; background:transparent; font-size:1rem; cursor:pointer; color:#94a3b8; line-height:1;" onclick="ManualStudio.removeSkillTag('${skill}')">&times;</button>
          </span>
        `;
      });

      const skillsHtml = `
        <div class="paper-section">
          <div class="paper-section-title">Skills</div>
          <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;" id="res-skills-list">
            ${skillTagsHtml}
          </div>
          <input type="text" id="res-skill-add-input" placeholder="Type a skill and press Enter..." style="width:100%; max-width:240px; padding:0.4rem 0.75rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.82rem; outline:none;" />
        </div>
      `;

      const certificationsHtml = `
        <div class="paper-section">
          <div class="paper-section-title">Certifications</div>
          <div contenteditable="true" placeholder="List your professional certifications (e.g. AWS Solutions Architect)..." id="res-certifications" style="font-size:0.9rem;">${data.certifications || ''}</div>
        </div>
      `;

      container.innerHTML = headerHtml + summaryHtml + experienceHtml + educationHtml + skillsHtml + certificationsHtml;

      // Event listener for manual skill adding
      const skillInput = document.getElementById('res-skill-add-input');
      if (skillInput) {
        skillInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const val = skillInput.value.trim();
            if (val && !this.state.resume.skills.includes(val)) {
              this.state.resume.skills.push(val);
              skillInput.value = '';
              this.saveUndoSnapshot();
              this.renderResumeEditor(container);
              this.triggerAutoSave();
            }
          }
        });
      }

      // Add inline edit listeners for all fields
      this.bindInlineEditEvents();
      this.bindDragEvents();
    },

    removeSkillTag(skill) {
      this.state.resume.skills = this.state.resume.skills.filter(s => s !== skill);
      this.saveUndoSnapshot();
      this.renderActiveDocument();
      this.triggerAutoSave();
    },

    // Draggable card helpers
    addListEntry(type) {
      this.saveUndoSnapshot();
      if (type === 'experience') {
        this.state.resume.experience.push({ title: 'New Role', company: 'New Company', start: 'Jan 2025', end: 'Present', description: 'Enter responsibilities here.' });
      } else {
        this.state.resume.education.push({ degree: 'Degree', school: 'University Name', year: '2021 - 2025', grade: '' });
      }
      this.renderActiveDocument();
      this.triggerAutoSave();
    },

    removeListEntry(type, idx) {
      this.saveUndoSnapshot();
      if (type === 'experience') {
        this.state.resume.experience.splice(idx, 1);
      } else {
        this.state.resume.education.splice(idx, 1);
      }
      this.renderActiveDocument();
      this.triggerAutoSave();
    },

    // 2. Cover letter manual editor (Minimal white editing canvas)
    renderCoverLetterEditor(container) {
      const data = this.state.coverLetter;

      container.innerHTML = `
        <div class="doc-header">
          <input type="text" class="doc-title-input" placeholder="Hiring Manager/Title" id="cl-title" value="${data.job_title || ''}" />
          <input type="text" class="doc-subtitle-input" placeholder="Company Name" id="cl-subtitle" value="${data.company_name || ''}" />
          <div class="doc-divider"></div>
        </div>
        <div class="paper-section">
          <div contenteditable="true" placeholder="Write or edit your cover letter content here..." id="cl-body" style="font-size:0.95rem; line-height:1.75; min-height:600px; white-space:pre-wrap;">${data.generated_letter || ''}</div>
        </div>
      `;

      this.bindInlineEditEvents();
    },

    // 3. Cold email manual editor
    renderColdEmailEditor(container) {
      const data = this.state.coldEmail;

      container.innerHTML = `
        <div class="doc-header">
          <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing:0.05em; color:#94a3b8; font-weight:700; margin-bottom: 0.4rem;">Email Subject</div>
          <div class="doc-title-input" contenteditable="true" placeholder="Email Subject Line" id="ce-subject" style="font-size:1.4rem; font-weight:700;">${data.subject || ''}</div>
          <div style="font-size: 0.85rem; color: #64748b; margin-top:0.4rem;">
            Recipient: <b>${data.recipient_name || '[Name]'}</b> (${data.recipient_title || '[Role]'}) at <b>${data.company || '[Company]'}</b>
          </div>
          <div class="doc-divider"></div>
        </div>
        <div class="paper-section">
          <div contenteditable="true" placeholder="Compose your manual outreach message here..." id="ce-body" style="font-size:0.92rem; line-height:1.7; min-height:500px; white-space:pre-wrap;">${data.body || ''}</div>
        </div>
      `;

      this.bindInlineEditEvents();
    },

    // 4. Portfolio manual editor
    renderPortfolioEditor(container) {
      const data = this.state.portfolio;

      let projectsHtml = '';
      (data.projects || []).forEach((proj, idx) => {
        projectsHtml += `
          <div class="draggable-card" draggable="true" data-type="project" data-index="${idx}">
            <span class="card-drag-handle">⠿</span>
            <button type="button" class="card-remove-btn" onclick="ManualStudio.removePortfolioProject(${idx})">Remove</button>
            <div class="card-title-field" contenteditable="true" placeholder="Project Title" data-field="title">${proj.title || ''}</div>
            <div class="card-meta-field">
              <span contenteditable="true" placeholder="Project Link (GitHub/Website)" data-field="link">${proj.link || ''}</span>
            </div>
            <div class="card-desc-field" contenteditable="true" placeholder="Project details and tech stack used..." data-field="description">${proj.description || ''}</div>
          </div>
        `;
      });

      container.innerHTML = `
        <div class="doc-header">
          <div class="doc-title-input" contenteditable="true" placeholder="Portfolio Heading" id="port-title">${data.title || ''}</div>
          <div class="doc-subtitle-input" contenteditable="true" placeholder="Curated summary or tagline..." id="port-desc">${data.description || ''}</div>
          <div class="doc-divider"></div>
        </div>
        
        <div class="paper-section">
          <div class="paper-section-title">
            <span>Showcase Projects</span>
            <button type="button" class="btn-manual-add" onclick="ManualStudio.addPortfolioProject()">+ Add Project</button>
          </div>
          <div id="port-projects-list">
            ${projectsHtml || '<p style="color:#cbd5e1; font-size:0.85rem; padding: 1rem 0;">No projects added yet.</p>'}
          </div>
        </div>

        <div class="paper-section">
          <div class="paper-section-title">Skills & Expertise</div>
          <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;" id="port-skills-list">
            ${(data.skills || []).map(sk => `
              <span class="skill-tag" style="background:#f1f5f9; color:#334155; border:1px solid #e2e8f0; padding:0.35rem 0.75rem; border-radius:999px; font-size:0.8rem; display:inline-flex; align-items:center; gap:0.4rem;">
                ${sk}
                <button type="button" style="border:none; background:transparent; font-size:1rem; cursor:pointer; color:#94a3b8; line-height:1;" onclick="ManualStudio.removePortfolioSkill('${sk}')">&times;</button>
              </span>
            `).join('')}
          </div>
          <input type="text" id="port-skill-input" placeholder="Add technical skill..." style="width:100%; max-width:240px; padding:0.4rem 0.75rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.82rem; outline:none;" />
        </div>

        <div class="paper-section">
          <div class="paper-section-title">Contact Information</div>
          <div class="profile-editor-grid">
            <div class="profile-input-group">
              <label>Contact Email</label>
              <input type="email" class="profile-input" id="port-contact-email" value="${data.contact?.email || ''}" />
            </div>
            <div class="profile-input-group">
              <label>GitHub Profile</label>
              <input type="url" class="profile-input" id="port-contact-github" value="${data.contact?.github || ''}" />
            </div>
            <div class="profile-input-group">
              <label>LinkedIn Link</label>
              <input type="url" class="profile-input" id="port-contact-linkedin" value="${data.contact?.linkedin || ''}" />
            </div>
            <div class="profile-input-group">
              <label>Personal Website</label>
              <input type="url" class="profile-input" id="port-contact-website" value="${data.contact?.website || ''}" />
            </div>
          </div>
        </div>
      `;

      // Skill add input handler
      const portSkillIn = document.getElementById('port-skill-input');
      if (portSkillIn) {
        portSkillIn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const val = portSkillIn.value.trim();
            if (val && !this.state.portfolio.skills.includes(val)) {
              this.state.portfolio.skills.push(val);
              portSkillIn.value = '';
              this.saveUndoSnapshot();
              this.renderPortfolioEditor(container);
              this.triggerAutoSave();
            }
          }
        });
      }

      // Add contact change listeners
      ['email', 'github', 'linkedin', 'website'].forEach(field => {
        const input = document.getElementById(`port-contact-${field}`);
        if (input) {
          input.addEventListener('input', () => {
            if (!this.state.portfolio.contact) this.state.portfolio.contact = {};
            this.state.portfolio.contact[field] = input.value.trim();
            this.triggerAutoSave();
          });
        }
      });

      this.bindInlineEditEvents();
      this.bindDragEvents();
    },

    addPortfolioProject() {
      this.saveUndoSnapshot();
      this.state.portfolio.projects.push({ title: 'New Project', link: '', description: 'Describe tech stack and achievements.' });
      this.renderActiveDocument();
      this.triggerAutoSave();
    },

    removePortfolioProject(idx) {
      this.saveUndoSnapshot();
      this.state.portfolio.projects.splice(idx, 1);
      this.renderActiveDocument();
      this.triggerAutoSave();
    },

    removePortfolioSkill(skill) {
      this.state.portfolio.skills = this.state.portfolio.skills.filter(s => s !== skill);
      this.saveUndoSnapshot();
      this.renderActiveDocument();
      this.triggerAutoSave();
    },

    // 5. Personal profile editor (Saves profile and auto-fills values)
    renderPersonalInfoEditor(container) {
      const data = this.state.personalInfo;

      container.innerHTML = `
        <div class="doc-header">
          <div class="doc-title-input">Personal Profile Info</div>
          <div class="doc-subtitle-input">Unified profile data used to prefill career documents.</div>
          <div class="doc-divider"></div>
        </div>

        <div class="paper-section">
          <div class="profile-editor-grid">
            <div class="profile-input-group">
              <label>Full Name</label>
              <input type="text" class="profile-input" id="prof-name" value="${data.full_name || ''}" placeholder="John Doe" />
            </div>
            <div class="profile-input-group">
              <label>Email Address</label>
              <input type="email" class="profile-input" id="prof-email" value="${data.email || ''}" placeholder="john.doe@example.com" />
            </div>
            <div class="profile-input-group">
              <label>Phone Number</label>
              <input type="tel" class="profile-input" id="prof-phone" value="${data.phone || ''}" placeholder="+1 (555) 123-4567" />
            </div>
            <div class="profile-input-group">
              <label>Location</label>
              <input type="text" class="profile-input" id="prof-location" value="${data.location || ''}" placeholder="San Francisco, CA" />
            </div>
            <div class="profile-input-group" style="grid-column: span 2;">
              <label>Job Title / Headline</label>
              <input type="text" class="profile-input" id="prof-title" value="${data.job_title || ''}" placeholder="Senior Full Stack Engineer" />
            </div>
            <div class="profile-input-group" style="grid-column: span 2;">
              <label>Professional Bio Summary</label>
              <textarea class="profile-input profile-textarea" id="prof-summary" placeholder="Experienced engineer with a track record of developing...">${data.summary || ''}</textarea>
            </div>
            <div class="profile-input-group" style="grid-column: span 2;">
              <label>Technical Skills (comma-separated)</label>
              <input type="text" class="profile-input" id="prof-skills" value="${(data.skills || []).join(', ')}" placeholder="Node.js, React, Supabase, Postgres" />
            </div>
            <div class="profile-input-group">
              <label>LinkedIn Link</label>
              <input type="url" class="profile-input" id="prof-linkedin" value="${data.linkedin || ''}" placeholder="https://linkedin.com/in/username" />
            </div>
            <div class="profile-input-group">
              <label>GitHub Profile Link</label>
              <input type="url" class="profile-input" id="prof-github" value="${data.github || ''}" placeholder="https://github.com/username" />
            </div>
          </div>
        </div>
      `;

      // Bind input listeners for profile save
      const fields = ['name', 'email', 'phone', 'location', 'title', 'summary', 'skills', 'linkedin', 'github'];
      fields.forEach(f => {
        const el = document.getElementById(`prof-${f}`);
        if (el) {
          el.addEventListener('input', () => {
            const val = el.value;
            if (f === 'skills') {
              this.state.personalInfo.skills = val.split(',').map(s => s.trim()).filter(Boolean);
            } else {
              const stateField = f === 'name' ? 'full_name' : f === 'title' ? 'job_title' : f;
              this.state.personalInfo[stateField] = val;
            }
            this.saveUserProfileLocal();
            this.triggerAutoSave();
          });
        }
      });
    },

    // ─── EVENT BINDING & DRAG & DROP ────────────────────────────
    bindInlineEditEvents() {
      const activeTab = this.activeTab;

      // Handle standard inputs
      document.querySelectorAll('[contenteditable="true"]').forEach(el => {
        el.addEventListener('input', (e) => {
          this.triggerAutoSave();
          
          const id = el.id;
          const text = el.innerText.trim();

          if (activeTab === 'resume') {
            if (id === 'res-full-name') this.state.resume.full_name = text;
            else if (id === 'res-email') this.state.resume.email = text;
            else if (id === 'res-phone') this.state.resume.phone = text;
            else if (id === 'res-location') this.state.resume.location = text;
            else if (id === 'res-summary') this.state.resume.professional_summary = text;
            else if (id === 'res-certifications') this.state.resume.certifications = text;
          } 
          else if (activeTab === 'cover-letter') {
            if (id === 'cl-body') this.state.coverLetter.generated_letter = el.innerText;
          } 
          else if (activeTab === 'cold-email') {
            if (id === 'ce-subject') this.state.coldEmail.subject = text;
            else if (id === 'ce-body') this.state.coldEmail.body = el.innerText;
          }
          else if (activeTab === 'portfolio') {
            if (id === 'port-title') this.state.portfolio.title = text;
            else if (id === 'port-desc') this.state.portfolio.description = text;
          }
        });

        // Specific fields inside cards/grids
        el.addEventListener('blur', (e) => {
          const card = el.closest('.draggable-card');
          if (!card) return;

          const type = card.dataset.type;
          const idx = parseInt(card.dataset.index, 10);
          const field = el.dataset.field;
          const text = el.innerText.trim();

          this.saveUndoSnapshot();

          if (type === 'experience') {
            const exp = this.state.resume.experience[idx];
            if (exp) {
              if (field === 'dates') {
                const parts = text.split('|')[0].split('-');
                exp.start = (parts[0] || '').trim();
                exp.end = (parts[1] || '').trim();
              } else {
                exp[field] = text;
              }
            }
          } 
          else if (type === 'education') {
            const edu = this.state.resume.education[idx];
            if (edu) {
              edu[field] = text;
            }
          }
          else if (type === 'project') {
            const proj = this.state.portfolio.projects[idx];
            if (proj) {
              proj[field] = text;
            }
          }

          this.triggerAutoSave();
        });
      });
    },

    bindDragEvents() {
      const cards = document.querySelectorAll('.draggable-card');
      const lists = [
        document.getElementById('res-experience-list'),
        document.getElementById('res-education-list'),
        document.getElementById('port-projects-list')
      ].filter(Boolean);

      cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
          this.isDragging = true;
          this.draggedElement = card;
          card.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });

        card.addEventListener('dragend', () => {
          this.isDragging = false;
          this.draggedElement.classList.remove('dragging');
          this.draggedElement = null;
        });
      });

      lists.forEach(list => {
        list.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (!this.draggedElement) return;

          const afterElement = this.getDragAfterElement(list, e.clientY);
          if (afterElement == null) {
            list.appendChild(this.draggedElement);
          } else {
            list.insertBefore(this.draggedElement, afterElement);
          }
        });

        list.addEventListener('drop', (e) => {
          e.preventDefault();
          this.recalculateCardIndices();
        });
      });
    },

    getDragAfterElement(container, y) {
      const draggableElements = [...container.querySelectorAll('.draggable-card:not(.dragging)')];

      return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    },

    recalculateCardIndices() {
      // Analyze current DOM cards sorting and update the state array matches
      this.saveUndoSnapshot();

      const resumeTab = this.activeTab === 'resume';
      const portTab = this.activeTab === 'portfolio';

      if (resumeTab) {
        // Experience list reorder
        const expCards = [...document.querySelectorAll('#res-experience-list .draggable-card')];
        const newExp = [];
        expCards.forEach(card => {
          const oldIdx = parseInt(card.dataset.index, 10);
          newExp.push(this.state.resume.experience[oldIdx]);
        });
        this.state.resume.experience = newExp;

        // Education list reorder
        const eduCards = [...document.querySelectorAll('#res-education-list .draggable-card')];
        const newEdu = [];
        eduCards.forEach(card => {
          const oldIdx = parseInt(card.dataset.index, 10);
          newEdu.push(this.state.resume.education[oldIdx]);
        });
        this.state.resume.education = newEdu;
      } 
      else if (portTab) {
        const projCards = [...document.querySelectorAll('#port-projects-list .draggable-card')];
        const newProjs = [];
        projCards.forEach(card => {
          const oldIdx = parseInt(card.dataset.index, 10);
          newProjs.push(this.state.portfolio.projects[oldIdx]);
        });
        this.state.portfolio.projects = newProjs;
      }

      this.renderActiveDocument();
      this.triggerAutoSave();
    },

    setupListeners() {
      // Font select listener
      const fontSelect = document.getElementById('manual-font-select');
      if (fontSelect) {
        fontSelect.addEventListener('change', () => {
          const font = fontSelect.value;
          if (this.activeTab === 'resume') {
            this.state.resume.font_family = font.charAt(0).toUpperCase() + font.slice(1);
          }
          this.syncCustomizerUI();
          this.triggerAutoSave();
        });
      }

      // Spacing select listener
      const spacingSelect = document.getElementById('manual-spacing-select');
      if (spacingSelect) {
        spacingSelect.addEventListener('change', () => {
          const spacing = spacingSelect.value;
          if (this.activeTab === 'resume') {
            this.state.resume.spacing = spacing;
          }
          this.syncCustomizerUI();
          this.triggerAutoSave();
        });
      }

      // Accent swatch clicks
      document.querySelectorAll('.manual-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
          const color = swatch.getAttribute('data-color');
          
          if (this.activeTab === 'resume') {
            // Map color string to Hex color code
            let hex = '#6366f1';
            if (color === 'indigo') hex = '#6366f1';
            else if (color === 'purple') hex = '#a855f7';
            else if (color === 'emerald') hex = '#10b981';
            else if (color === 'slate') hex = '#475569';
            else if (color === 'rose') hex = '#f43f5e';
            this.state.resume.accent_color = hex;
          }

          document.getElementById('manual-paper').setAttribute('data-accent', color);
          document.querySelectorAll('.manual-swatch').forEach(s => s.classList.remove('active'));
          swatch.classList.add('active');
          this.triggerAutoSave();
        });
      });

      // Left sidebar item clicks
      document.querySelectorAll('.sidebar-item-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetTab = btn.getAttribute('data-tab');
          
          // If we are on a specific page that corresponds to a tab, keep on same page
          // Otherwise redirect to the page
          const page = window.location.pathname.split('/').pop() || 'index.html';
          
          if (targetTab === 'home' && !page.startsWith('dashboard')) {
            window.location.href = 'dashboard.html';
            return;
          }
          if (targetTab === 'resume' && !page.startsWith('resume')) {
            window.location.href = 'resume.html';
            return;
          }
          if (targetTab === 'cover-letter' && !page.startsWith('cover-letter')) {
            window.location.href = 'cover-letter.html';
            return;
          }
          if (targetTab === 'cold-email' && !page.startsWith('cold-email')) {
            window.location.href = 'cold-email.html';
            return;
          }

          document.querySelectorAll('.sidebar-item-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.activeTab = targetTab;
          this.renderActiveDocument();
        });
      });

      // Format actions toolbar trigger
      document.addEventListener('selectionchange', () => {
        const toolbar = document.getElementById('formatting-toolbar');
        if (!toolbar) return;

        const selection = window.getSelection();
        if (selection.isCollapsed || selection.rangeCount === 0) {
          toolbar.classList.remove('show');
          return;
        }

        // Only show formatting toolbar if selection is inside contenteditable
        const anchor = selection.anchorNode.parentElement;
        if (!anchor.closest('[contenteditable="true"]')) {
          toolbar.classList.remove('show');
          return;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        toolbar.style.top = `${rect.top + window.scrollY - 44}px`;
        toolbar.style.left = `${rect.left + window.scrollX + rect.width / 2 - 80}px`;
        toolbar.classList.add('show');
      });

      // Format button clicks
      document.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault(); // Prevent focus loss
          const cmd = btn.dataset.cmd;
          const val = btn.dataset.val || null;

          if (cmd === 'formatBlock' && val === 'h2') {
            document.execCommand('formatBlock', false, '<h2>');
          } else if (cmd === 'formatBlock' && val === 'p') {
            document.execCommand('formatBlock', false, '<p>');
          } else {
            document.execCommand(cmd, false, val);
          }

          this.triggerAutoSave();
        });
      });

      // Key shortcuts listener
      document.addEventListener('keydown', (e) => {
        // Only run shortcuts inside manual studio mode
        if (this.workspace !== 'manual') return;

        if (e.ctrlKey || e.metaKey) {
          if (e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) this.redo();
            else this.undo();
          } 
          else if (e.key.toLowerCase() === 'y') {
            e.preventDefault();
            this.redo();
          }
          else if (e.key.toLowerCase() === 's') {
            e.preventDefault();
            this.saveActiveDocumentImmediately();
          }
        }
      });

      // Undo/Redo buttons
      document.getElementById('manual-undo-btn').onclick = () => this.undo();
      document.getElementById('manual-redo-btn').onclick = () => this.redo();

      // Export buttons
      document.getElementById('manual-pdf-btn').onclick = () => this.exportPDF();
      document.getElementById('manual-docx-btn').onclick = () => this.exportDOCX();
    },

    // ─── UNDO / REDO / RECOVERY ────────────────────────────────
    saveUndoSnapshot() {
      const stateCopy = JSON.parse(JSON.stringify(this.state[this.getNormalizedTabKey()]));
      // Push if empty or different from top
      if (this.undoStack.length === 0 || JSON.stringify(this.undoStack[this.undoStack.length - 1]) !== JSON.stringify(stateCopy)) {
        this.undoStack.push(stateCopy);
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack = []; // Clear redo stack on new action
      }
    },

    undo() {
      if (this.undoStack.length > 1) {
        const top = this.undoStack.pop();
        this.redoStack.push(top);
        
        const prevState = this.undoStack[this.undoStack.length - 1];
        this.state[this.getNormalizedTabKey()] = JSON.parse(JSON.stringify(prevState));
        this.renderActiveDocument();
        this.triggerAutoSave();
        this.showSaveIndicator('Undo applied');
      } else {
        this.showSaveIndicator('Nothing to undo');
      }
    },

    redo() {
      if (this.redoStack.length > 0) {
        const targetState = this.redoStack.pop();
        this.undoStack.push(targetState);

        this.state[this.getNormalizedTabKey()] = JSON.parse(JSON.stringify(targetState));
        this.renderActiveDocument();
        this.triggerAutoSave();
        this.showSaveIndicator('Redo applied');
      } else {
        this.showSaveIndicator('Nothing to redo');
      }
    },

    getNormalizedTabKey() {
      if (this.activeTab === 'home') return 'home';
      if (this.activeTab === 'cover-letter') return 'coverLetter';
      if (this.activeTab === 'cold-email') return 'coldEmail';
      if (this.activeTab === 'personal-info') return 'personalInfo';
      return this.activeTab; // resume, portfolio
    },

    // ─── AUTO-SAVE ENGINE & STATUS INDICATOR ───────────────────
    triggerAutoSave() {
      this.showSavingIndicator();

      if (this.saveTimeout) clearTimeout(this.saveTimeout);
      this.saveTimeout = setTimeout(() => {
        this.saveActiveDocumentImmediately();
      }, 1500); // 1.5 second debounced auto-save
    },

    async saveActiveDocumentImmediately() {
      this.showSavingIndicator();

      // Sync data model back to original inputs on screen
      this.syncStateToOriginalPage();

      // Dispatch original saving operations based on current page
      const page = window.location.pathname.split('/').pop() || 'index.html';
      let success = false;

      try {
        if (this.activeTab === 'portfolio') {
          success = await this.savePortfolioToSupabase();
        } 
        else if (this.activeTab === 'personal-info') {
          this.saveUserProfileLocal();
          success = true;
        }
        else if (page.startsWith('resume') && this.activeTab === 'resume') {
          // Trigger resume page handleSave
          const form = document.getElementById('resumeForm');
          if (form) {
            // Emulate submit action
            const mockEvent = { preventDefault: () => {} };
            if (typeof window.handleSave === 'function') {
              await window.handleSave(mockEvent);
              success = true;
            }
          }
        } 
        else if (page.startsWith('cover-letter') && this.activeTab === 'cover-letter') {
          if (typeof window.saveOrUpdateCoverLetter === 'function') {
            await window.saveOrUpdateCoverLetter();
            success = true;
          }
        } 
        else if (page.startsWith('cold-email') && this.activeTab === 'cold-email') {
          if (typeof window.saveDraft === 'function') {
            await window.saveDraft();
            success = true;
          }
        } else {
          // If we are on dashboard or other pages, we can manually update via supabase client
          success = await this.saveDocumentDirectlyToSupabase();
        }

        if (success) {
          this.showSavedIndicator();
          this.recordVersionHistory();
        } else {
          this.showSavedIndicator('Changes buffered locally');
        }
      } catch (err) {
        console.error('Manual save failed:', err);
        this.showSavedIndicator('Saved locally (Offline)');
      }
    },

    async saveDocumentDirectlyToSupabase() {
      const client = window.appSdk?.client;
      if (!client) return false;

      const { data: { session } } = await client.auth.getSession();
      if (!session) return false;

      const user_id = session.user.id;

      if (this.activeTab === 'resume') {
        const id = window.editingResumeId;
        if (!id) return false;

        const payload = this.state.resume;
        const { error } = await client.from('resumes').update(payload).eq('id', id).eq('user_id', user_id);
        return !error;
      }
      else if (this.activeTab === 'cover-letter') {
        const id = window.currentSavedLetterId;
        if (!id) return false;

        const payload = {
          job_title: this.state.coverLetter.job_title,
          company_name: this.state.coverLetter.company_name,
          generated_letter: this.state.coverLetter.generated_letter
        };
        const { error } = await client.from('cover_letters').update(payload).eq('id', id).eq('user_id', user_id);
        return !error;
      }
      else if (this.activeTab === 'cold-email') {
        const id = window.currentDraftId;
        if (!id || String(id).startsWith('local_')) return false;

        const payload = {
          company: this.state.coldEmail.company,
          recipient_title: this.state.coldEmail.recipient_title,
          subject: this.state.coldEmail.subject,
          body: this.state.coldEmail.body
        };
        const { error } = await client.from('email_history').update(payload).eq('id', id).eq('user_id', user_id);
        return !error;
      }

      return false;
    },

    async savePortfolioToSupabase() {
      // Save Portfolio document
      const client = window.appSdk?.client;
      const data = this.state.portfolio;
      
      // Save locally first as backup
      localStorage.setItem('cc_manual_portfolio', JSON.stringify(data));

      if (!client) return false;

      try {
        const { data: { session } } = await client.auth.getSession();
        if (!session) return false;

        const user_id = session.user.id;
        const payload = {
          user_id: user_id,
          title: data.title,
          description: data.description,
          projects: data.projects,
          skills: data.skills,
          contact: data.contact,
          updated_at: new Date().toISOString()
        };

        // Query existing portfolio
        const { data: existing } = await client.from('portfolios').select('id').eq('user_id', user_id).limit(1);

        if (existing && existing.length > 0) {
          const { error } = await client.from('portfolios').update(payload).eq('id', existing[0].id);
          if (error) throw error;
        } else {
          const { error } = await client.from('portfolios').insert([payload]);
          if (error) throw error;
        }
        return true;
      } catch (err) {
        console.warn('Could not sync portfolio to database:', err);
        return false;
      }
    },

    // User Profile load & save
    loadUserProfile() {
      // LocalStorage load
      const localProfile = localStorage.getItem('careercraft_profile');
      if (localProfile) {
        this.state.personalInfo = JSON.parse(localProfile);
      }

      // Supabase async load if available
      setTimeout(async () => {
        const client = window.appSdk?.client;
        if (!client) return;

        try {
          const session = await window.appSdk.auth.getSession();
          if (!session) return;

          const metadata = session.user.user_metadata || {};
          this.state.personalInfo.full_name = metadata.full_name || this.state.personalInfo.full_name || '';
          this.state.personalInfo.email = session.user.email || '';
          this.saveUserProfileLocal();
        } catch (e) {
          console.warn('Profile load error:', e);
        }
      }, 1000);
    },

    saveUserProfileLocal() {
      localStorage.setItem('careercraft_profile', JSON.stringify(this.state.personalInfo));
    },

    // Indicator UI controls
    showSavingIndicator() {
      const dot = document.getElementById('save-status-dot');
      const text = document.getElementById('save-status-text');
      if (dot && text) {
        dot.className = 'status-dot saving';
        text.textContent = 'Saving changes...';
      }
    },

    showSavedIndicator(msg = 'Synced to cloud') {
      const dot = document.getElementById('save-status-dot');
      const text = document.getElementById('save-status-text');
      if (dot && text) {
        dot.className = 'status-dot';
        text.textContent = msg;
      }
    },

    showSaveIndicator(msg) {
      const text = document.getElementById('save-status-text');
      if (text) {
        text.textContent = msg;
      }
    },

    // ─── LOCAL VERSION HISTORY ──────────────────────────────────
    recordVersionHistory() {
      if (this.historySaveTimeout) clearTimeout(this.historySaveTimeout);
      this.historySaveTimeout = setTimeout(() => {
        const key = this.getNormalizedTabKey();
        const stateCopy = JSON.parse(JSON.stringify(this.state[key]));
        
        let localHistory = JSON.parse(localStorage.getItem(`cc_history_${key}`) || '[]');
        const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        // Add new item to front
        localHistory.unshift({ timestamp: timestamp, data: stateCopy });
        
        // Keep up to 6 revisions
        if (localHistory.length > 6) localHistory.pop();
        
        localStorage.setItem(`cc_history_${key}`, JSON.stringify(localHistory));
        this.renderHistoryList();
      }, 5000); // Record unique history block every 5 seconds on edits
    },

    renderHistoryList() {
      const list = document.getElementById('manual-version-history');
      if (!list) return;

      const key = this.getNormalizedTabKey();
      const localHistory = JSON.parse(localStorage.getItem(`cc_history_${key}`) || '[]');

      if (localHistory.length === 0) {
        list.innerHTML = `<div style="font-size:0.75rem; color:#94a3b8; padding: 0.5rem; text-align:center;">No edits recorded</div>`;
        return;
      }

      list.innerHTML = localHistory.map((item, idx) => `
        <div class="version-item" onclick="ManualStudio.restoreHistorySnapshot(${idx})">
          <span>🕒 Revision ${item.timestamp}</span>
          <span style="color:#7c3aed; font-weight:600;">Restore</span>
        </div>
      `).join('');
    },

    restoreHistorySnapshot(idx) {
      const key = this.getNormalizedTabKey();
      const localHistory = JSON.parse(localStorage.getItem(`cc_history_${key}`) || '[]');
      const snapshot = localHistory[idx];

      if (snapshot && snapshot.data) {
        this.saveUndoSnapshot();
        this.state[key] = JSON.parse(JSON.stringify(snapshot.data));
        this.renderActiveDocument();
        this.triggerAutoSave();
        this.showSaveIndicator('Revision restored!');
      }
    },

    // ─── FILE EXPORTS ENGINE ────────────────────────────────────
    exportPDF() {
      const page = window.location.pathname.split('/').pop() || 'index.html';
      
      if (this.activeTab === 'resume' && page.startsWith('resume')) {
        // Trigger original resume downloadPDF
        if (window.editingResumeId && typeof window.downloadPDF === 'function') {
          window.downloadPDF(window.editingResumeId);
        } else {
          // If we don't have active saved resume, print current canvas
          window.print();
        }
      } 
      else if (this.activeTab === 'cover-letter' && page.startsWith('cover-letter')) {
        if (typeof window.downloadPDF === 'function') {
          window.downloadPDF();
        } else {
          window.print();
        }
      }
      else if (this.activeTab === 'cold-email' && page.startsWith('cold-email')) {
        // Trigger cold email PDF downloader
        if (typeof window.downloadPDF === 'function') {
          window.downloadPDF();
        } else {
          window.print();
        }
      } else {
        // Universal print/export handler
        window.print();
      }
    },

    exportDOCX() {
      const activeTab = this.activeTab;

      let filename = 'document.doc';
      let title = 'CareerCraft Document';
      let bodyHtml = '';

      if (activeTab === 'resume') {
        const r = this.state.resume;
        filename = `${(r.full_name || 'Resume').replace(/\s+/g, '-')}-Resume.doc`;
        title = r.full_name || 'Resume';
        bodyHtml = `
          <h1>${r.full_name || 'Untitled Resume'}</h1>
          <p>${r.email || ''} | ${r.phone || ''} | ${r.location || ''}</p>
          <hr/>
          <h3>Professional Summary</h3>
          <p>${r.professional_summary || ''}</p>
          <hr/>
          <h3>Work Experience</h3>
          ${(r.experience || []).map(exp => `
            <p><strong>${exp.title}</strong> at ${exp.company} (${exp.start} - ${exp.end})</p>
            <p>${exp.description}</p>
          `).join('')}
          <hr/>
          <h3>Education</h3>
          ${(r.education || []).map(edu => `
            <p><strong>${edu.degree}</strong> - ${edu.school} (${edu.year}) ${edu.grade ? '| GPA: ' + edu.grade : ''}</p>
          `).join('')}
          <hr/>
          <h3>Skills</h3>
          <p>${(r.skills || []).join(', ')}</p>
          <hr/>
          <h3>Certifications</h3>
          <p>${r.certifications || ''}</p>
        `;
      } 
      else if (activeTab === 'cover-letter') {
        const cl = this.state.coverLetter;
        filename = `CoverLetter-${(cl.job_title || 'letter').replace(/\s+/g, '-')}.doc`;
        title = cl.job_title || 'Cover Letter';
        bodyHtml = `
          <h2>Cover Letter: ${cl.job_title} at ${cl.company_name}</h2>
          <hr/>
          <p>${cl.generated_letter.replace(/\n/g, '<br>')}</p>
        `;
      } 
      else if (activeTab === 'cold-email') {
        const ce = this.state.coldEmail;
        filename = `ColdEmail-${(ce.company || 'email').replace(/\s+/g, '-')}.doc`;
        title = ce.subject || 'Cold Email';
        bodyHtml = `
          <h3>Subject: ${ce.subject}</h3>
          <hr/>
          <p>${ce.body.replace(/\n/g, '<br>')}</p>
        `;
      }
      else if (activeTab === 'portfolio') {
        const port = this.state.portfolio;
        filename = 'Portfolio.doc';
        bodyHtml = `
          <h1>${port.title}</h1>
          <p>${port.description}</p>
          <hr/>
          <h3>Showcase Projects</h3>
          ${(port.projects || []).map(proj => `
            <p><strong>${proj.title}</strong> (${proj.link})</p>
            <p>${proj.description}</p>
          `).join('')}
          <hr/>
          <h3>Skills</h3>
          <p>${(port.skills || []).join(', ')}</p>
        `;
      } else {
        bodyHtml = `<p>Document payload empty</p>`;
      }

      const docxHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
          <style>
            body { font-family: 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; margin: 1in; color: #111111; }
            p { margin: 0 0 10pt 0; }
            strong { font-weight: bold; }
            hr { border: 0; border-top: 1px solid #cccccc; margin: 12pt 0; }
            h1, h2, h3 { font-family: 'Outfit', 'Arial', sans-serif; font-weight: bold; margin-top: 18pt; margin-bottom: 6pt; }
          </style>
        </head>
        <body>
          ${bodyHtml}
        </body>
        </html>
      `;

      const blob = new Blob(['\ufeff' + docxHtml], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Attach to window
  window.ManualStudio = ManualStudio;

  // Initialize only if WorkspaceManager has initialized (meaning auth is resolved)
  if (window.WorkspaceManager && window.WorkspaceManager.initialized) {
    ManualStudio.init();
  } else {
    window.addEventListener('workspaceManagerInitialized', () => {
      ManualStudio.init();
    });
  }
})();
