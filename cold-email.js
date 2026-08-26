/**
 * cold-email.js — CareerCraft Cold Email Workspace Controller
 *
 * Architecture:
 *  - Single source of truth: `state` object.
 *  - Unidirectional flow: user input → state → renderWorkspace().
 *  - All DOM mutations go through render functions; no ad-hoc manipulation.
 *  - Editor stores HTML (preserves rich-text formatting); plain-text copy
 *    uses innerText at copy time only.
 *  - Generation is guarded by `state.generation.status` to prevent duplicates.
 *  - Resume auto-loading: if exactly 1 saved resume exists, it is silently
 *    applied on page load without requiring user interaction.
 *  - Follow-ups come from the API response (AI-generated, not hard-coded).
 *  - AI Copilot diff uses dataset.proposedText exclusively — never innerText.
 *
 * AI Actions (spec-compliant):
 *  - Improve    : rewrite only the opening sentence to be more specific
 *  - Shorten    : remove 20–30% of words while preserving core message
 *  - Change Angle: completely different opening strategy, same facts
 *  - Regenerate : re-run the full generation with current form state
 */
(function () {
  'use strict';

  let client = null;
  let currentUser = null;

  // ── Single Source of Truth ──────────────────────────────────────────────
  let state = {
    brief: {
      recipientName: '',
      position: '',
      relationship: '',
      companyName: '',
      companyContext: '',
      userName: '',
      background: '',
      emailGoal: 'Networking',
      tone: 'Professional',
      length: 'Standard',
      ctaStyle: 'Soft Ask'
    },
    generation: {
      status: 'idle', // 'idle' | 'generating' | 'copilot-busy' | 'error'
      controller: null,
      requestId: 0,
      copilotRequestId: 0
    },
    data: {
      variants: [],
      subjectLines: [],
      followUps: [],
      evaluation: null,
      activeVariantIndex: 0
    },
    editor: {
      subject: '',
      bodyHtml: '' // stores innerHTML for round-trip fidelity
    },
    resume: {
      loadedId: null,
      loadedName: null,
      autoLoaded: false
    }
  };

  let savedResumes = [];
  let debounceTimer = null;
  let autosaveTimer = null;

  // Variant tones displayed as "alternatives" (active tone is excluded from this list)
  const DISPLAY_VARIANT_TONES = ['Friendly', 'Direct', 'Networking'];
  const STEP_ORDER = ['recipient', 'company', 'value', 'goal'];

  // ── Initialization ──────────────────────────────────────────────────────
  async function init() {
    try {
      await window.appSdk.ready;
      if (!window.AuthManager) return;
      const session = await window.AuthManager.requireAuth();
      if (!session) return;
      client = window.appSdk.client;
      currentUser = session.user;

      // Expose handlers needed by inline HTML onclick attributes
      window.toggleStepAccordion = toggleStepAccordion;
      window.triggerAiAction = triggerAiAction;
      window.rejectAiAction = rejectAiAction;
      window.applyAiAction = applyAiAction;

      setupGoalGrid();
      setupEditorToolbar();
      setupActionBar();
      setupEditorSync();
      await loadResumeControls();
      await hydrateState();

    } catch (err) {
      console.error('[ColdEmail] Init error:', err);
      showToast('Initialization error. Please refresh.', true);
    }
  }

  // ── Toast ───────────────────────────────────────────────────────────────
  function showToast(msg, isError = false) {
    const type = isError ? 'error' : 'success';
    if (window.appSdk?.ui?.showToast) {
      window.appSdk.ui.showToast(msg, type);
    } else if (window.LayoutManager?.showToast) {
      window.LayoutManager.showToast(msg, type);
    }
  }

  // ── Draft persistence ───────────────────────────────────────────────────
  function saveDraftToStorage() {
    if (!window.StorageManager) return;
    try {
      const snapshot = {
        brief: state.brief,
        data: state.data,
        editor: state.editor,
        resume: state.resume
      };
      window.StorageManager.set('careercraft_cold_email_draft', JSON.stringify(snapshot));
    } catch (e) {
      console.warn('[ColdEmail] Draft save failed:', e);
    }
  }

  async function hydrateState() {
    if (!window.StorageManager) return;
    const saved = window.StorageManager.get('careercraft_cold_email_draft');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed.brief) state.brief = { ...state.brief, ...parsed.brief };
      if (parsed.data) state.data = { ...state.data, ...parsed.data };
      if (parsed.editor) state.editor = { ...state.editor, ...parsed.editor };
      if (parsed.resume) state.resume = { ...state.resume, ...parsed.resume };
      syncDOMFromState();
      if (state.data.variants.length > 0) {
        renderWorkspace();
      }
    } catch (e) {
      console.warn('[ColdEmail] Draft hydration failed:', e);
    }
  }

  // ── Accordion ───────────────────────────────────────────────────────────
  function toggleStepAccordion(stepId) {
    document.querySelectorAll('.cl-step-accordion').forEach(acc => {
      const isActive = acc.id === `step-${stepId}`;
      acc.classList.toggle('active', isActive);
      const header = acc.querySelector('.cl-step-header[role="button"]');
      if (header) header.setAttribute('aria-expanded', isActive ? 'true' : 'false');
    });
    const stepIndex = STEP_ORDER.indexOf(stepId);
    const progressLabel = document.getElementById('stepProgressLabel');
    if (progressLabel && stepIndex !== -1) {
      progressLabel.textContent = `STEP ${stepIndex + 1} OF ${STEP_ORDER.length}`;
    }
  }

  // ── Goal grid ───────────────────────────────────────────────────────────
  function setupGoalGrid() {
    const goals = document.querySelectorAll('.goal-card');
    const goalInput = document.getElementById('emailGoal');
    goals.forEach(g => {
      g.addEventListener('click', () => {
        goals.forEach(c => c.classList.remove('active'));
        g.classList.add('active');
        if (goalInput) goalInput.value = g.dataset.value;
        state.brief.emailGoal = g.dataset.value;
      });
    });

    // Debounced state sync on all panel inputs
    document.querySelectorAll('.cl-left-panel input:not([type=file]), .cl-left-panel textarea, .cl-left-panel select').forEach(el => {
      el.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(syncStateFromInputs, 400);
      });
    });
  }

  // ── Resume Integration ───────────────────────────────────────────────────
  // Auto-loads the user's single saved resume silently on page init.
  // If multiple resumes exist, shows a selection dropdown.
  // All resume controls live inside #resumeImportActionContainer.
  async function loadResumeControls() {
    const container = document.getElementById('resumeImportActionContainer');
    if (!container) return;

    // Bind hidden file input once
    const fileInput = document.getElementById('resumeFileInput');
    if (fileInput && !fileInput.dataset.bound) {
      fileInput.dataset.bound = 'true';
      fileInput.addEventListener('change', handleComputerImport);
    }

    // If a resume was already loaded from hydrated state, just show the chip
    if (state.resume.loadedId || state.resume.loadedName) {
      renderResumeChip(state.resume.loadedName || 'Resume', container);
      return;
    }

    try {
      const { data, error } = await client
        .from('resumes')
        .select('id, full_name, professional_headline, created_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      savedResumes = data || [];

      // Auto-load if exactly 1 resume exists — silent, no dialog, no toast
      if (savedResumes.length === 1) {
        await autoLoadResume(savedResumes[0], container);
        return;
      }

      renderResumeImportUI(container);
    } catch (err) {
      console.error('[ColdEmail] Failed to load saved resumes:', err);
      renderResumeImportUI(container, true /* fallback mode */);
    }
  }

  /**
   * Silently pre-populates name and triggers background value-prop extraction
   * for the given resume. Does NOT block the UI.
   */
  async function autoLoadResume(resumeData, container) {
    // Pre-populate name immediately (no API call needed)
    const nameInput = document.getElementById('userName');
    if (nameInput && !(nameInput.value || '').trim() && resumeData.full_name) {
      nameInput.value = resumeData.full_name;
      state.brief.userName = resumeData.full_name;
    }

    state.resume.loadedId = resumeData.id;
    state.resume.loadedName = resumeData.full_name || 'Resume';
    state.resume.autoLoaded = true;

    // Show chip immediately with loading indicator
    renderResumeChip(`${state.resume.loadedName} (loading…)`, container);

    try {
      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch('/api/ai-suggestions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ section: 'cold-email-value', resumeData })
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const result = await res.json();
      const valueText = (result.suggestions || '').trim();
      if (!valueText) throw new Error('Empty value proposition from server.');

      const backgroundInput = document.getElementById('background');
      if (backgroundInput && !(backgroundInput.value || '').trim()) {
        backgroundInput.value = valueText;
        state.brief.background = valueText;
      }

      renderResumeChip(state.resume.loadedName, container);
      saveDraftToStorage();
    } catch (err) {
      console.warn('[ColdEmail] Auto-load value-prop failed (non-blocking):', err.message);
      // Show chip without loading indicator — user can still generate
      renderResumeChip(state.resume.loadedName, container);
    }
  }

  function renderResumeImportUI(container, fallback = false) {
    let html = '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">';

    if (!fallback && savedResumes.length > 0) {
      if (savedResumes.length === 1) {
        html += `<button type="button" class="btn btn-secondary btn-sm" id="btnUseResume" data-resume-id="${savedResumes[0].id}">
          <i data-lucide="file-text" width="15" height="15" style="margin-right:5px;"></i>Use My Resume
        </button>`;
      } else {
        html += `<select id="savedResumeSelect" style="background:var(--bg-input,rgba(255,255,255,0.05));border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-1);font-size:0.85rem;padding:6px 10px;max-width:200px;cursor:pointer;">
          <option value="">— Select Resume —</option>`;
        savedResumes.forEach(r => {
          const label = r.full_name
            ? `${r.full_name}${r.professional_headline ? ' · ' + r.professional_headline.substring(0, 28) : ''}`
            : 'Resume – ' + new Date(r.created_at).toLocaleDateString();
          html += `<option value="${r.id}">${label}</option>`;
        });
        html += `</select>
        <button type="button" class="btn btn-secondary btn-sm" id="btnUseResume">
          <i data-lucide="file-text" width="15" height="15" style="margin-right:5px;"></i>Use Resume
        </button>`;
      }
    } else if (!fallback) {
      html += `<span style="font-size:0.85rem;color:var(--text-3);">No saved resumes.
        <a href="resume.html" style="color:var(--accent);text-decoration:none;margin-left:4px;">Build one →</a>
      </span>`;
    } else {
      html += `<span style="font-size:0.85rem;color:var(--text-3);">Could not load resumes.</span>`;
    }

    html += `<button type="button" class="btn btn-secondary btn-sm" id="btnImportResume">
      <i data-lucide="upload" width="15" height="15" style="margin-right:5px;"></i>Import File
    </button>`;
    html += '</div>';

    container.innerHTML = html;

    const useBtn = document.getElementById('btnUseResume');
    if (useBtn) useBtn.addEventListener('click', handleUseMyResume);

    const importBtn = document.getElementById('btnImportResume');
    if (importBtn) importBtn.addEventListener('click', () => {
      document.getElementById('resumeFileInput').click();
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function renderResumeChip(name, container) {
    container.innerHTML = `
      <div class="ce-resume-chip">
        <i data-lucide="check-circle" width="14" height="14"></i>
        ${escapeHtml(name)} loaded
        <button class="ce-resume-chip-change" id="btnChangeResume" type="button">Change</button>
      </div>`;

    const changeBtn = document.getElementById('btnChangeResume');
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        state.resume.loadedId = null;
        state.resume.loadedName = null;
        state.resume.autoLoaded = false;
        renderResumeImportUI(container);
      });
    }

    if (window.lucide) window.lucide.createIcons();
  }

  async function handleUseMyResume() {
    const container = document.getElementById('resumeImportActionContainer');
    let resumeData = null;

    const selectEl = document.getElementById('savedResumeSelect');
    if (selectEl) {
      const selectedId = selectEl.value;
      if (!selectedId) {
        showToast('Please select a resume from the dropdown first.', true);
        return;
      }
      resumeData = savedResumes.find(r => r.id === selectedId) || null;
    } else if (savedResumes.length === 1) {
      resumeData = savedResumes[0];
    }

    if (!resumeData) {
      showToast('No resume data found. Please import a file instead.', true);
      return;
    }

    const backgroundInput = document.getElementById('background');
    if ((backgroundInput?.value || '').trim().length > 0) {
      if (!confirm('Replace your current value proposition with information from this resume?')) return;
    }

    const useBtn = document.getElementById('btnUseResume');
    const origHTML = useBtn ? useBtn.innerHTML : '';
    if (useBtn) {
      useBtn.innerHTML = '<i data-lucide="loader-2" class="spin" width="15" height="15" style="margin-right:5px;"></i>Loading…';
      useBtn.disabled = true;
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const nameInput = document.getElementById('userName');
      if (nameInput && !(nameInput.value || '').trim() && resumeData.full_name) {
        nameInput.value = resumeData.full_name;
        state.brief.userName = resumeData.full_name;
      }

      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch('/api/ai-suggestions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ section: 'cold-email-value', resumeData })
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const result = await res.json();
      const valueText = (result.suggestions || '').trim();
      if (!valueText) throw new Error('No value proposition could be generated from this resume.');

      if (backgroundInput) backgroundInput.value = valueText;
      state.brief.background = valueText;

      state.resume.loadedId = resumeData.id;
      state.resume.loadedName = resumeData.full_name || 'Resume';
      renderResumeChip(state.resume.loadedName, container);
      saveDraftToStorage();
      showToast('Resume loaded successfully.');
    } catch (err) {
      console.error('[ColdEmail] handleUseMyResume error:', err);
      showToast("Couldn't import your resume. Try entering your background manually.", true);
      if (useBtn) {
        useBtn.innerHTML = origHTML;
        useBtn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  async function handleComputerImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const allowedExt = ['.pdf', '.docx'];
    const fileExt = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!allowed.includes(file.type) && !allowedExt.includes(fileExt)) {
      showToast('Invalid file type. Please upload a PDF or DOCX file.', true);
      e.target.value = '';
      return;
    }

    const backgroundInput = document.getElementById('background');
    if ((backgroundInput?.value || '').trim().length > 0) {
      if (!confirm('Replace your current value proposition with information from this file?')) {
        e.target.value = '';
        return;
      }
    }

    const importBtn = document.getElementById('btnImportResume');
    if (importBtn) {
      importBtn.innerHTML = '<i data-lucide="loader-2" class="spin" width="15" height="15" style="margin-right:5px;"></i>Reading…';
      importBtn.disabled = true;
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const extractedText = await window.appSdk.resume.uploadAndParse(file);

      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch('/api/ai-suggestions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ section: 'cold-email-extract', content: extractedText })
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const result = await res.json();

      let extracted = {};
      try {
        const raw = (result.suggestions || '').replace(/```json/gi, '').replace(/```/g, '').trim();
        extracted = JSON.parse(raw);
      } catch {
        extracted = { valueProposition: result.suggestions };
      }

      const valueProp = (extracted.valueProposition || '').trim();
      if (!valueProp) throw new Error('Could not extract a value proposition from this file.');

      if (backgroundInput) backgroundInput.value = valueProp;
      state.brief.background = valueProp;

      const nameInput = document.getElementById('userName');
      if (nameInput && !(nameInput.value || '').trim() && extracted.name) {
        nameInput.value = extracted.name;
        state.brief.userName = extracted.name;
      }

      state.resume.loadedId = 'imported-file';
      state.resume.loadedName = file.name.replace(/\.[^.]+$/, '');
      const container = document.getElementById('resumeImportActionContainer');
      if (container) renderResumeChip(state.resume.loadedName, container);
      saveDraftToStorage();
      showToast('Resume imported successfully.');
    } catch (err) {
      console.error('[ColdEmail] handleComputerImport error:', err);
      showToast(`Import failed: ${err.message || 'Please try again.'}`, true);
      const container = document.getElementById('resumeImportActionContainer');
      if (container) renderResumeImportUI(container);
    } finally {
      e.target.value = '';
    }
  }

  // ── State sync ──────────────────────────────────────────────────────────
  function syncStateFromInputs() {
    const get = id => {
      const el = document.getElementById(id);
      return el ? (el.value || '').trim() : '';
    };
    state.brief.recipientName = get('recipientName');
    state.brief.position = get('position');
    state.brief.relationship = get('relationship');
    state.brief.companyName = get('companyName');
    state.brief.companyContext = get('companyContext');
    state.brief.userName = get('userName');
    state.brief.background = get('background');
    state.brief.emailGoal = get('emailGoal') || state.brief.emailGoal;
    state.brief.tone = get('tone');
    state.brief.length = get('length');
    state.brief.ctaStyle = get('ctaStyle');
  }

  function syncDOMFromState() {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };
    set('recipientName', state.brief.recipientName);
    set('position', state.brief.position);
    set('relationship', state.brief.relationship);
    set('companyName', state.brief.companyName);
    set('companyContext', state.brief.companyContext);
    set('userName', state.brief.userName);
    set('background', state.brief.background);
    set('emailGoal', state.brief.emailGoal);
    set('tone', state.brief.tone);
    set('length', state.brief.length);
    set('ctaStyle', state.brief.ctaStyle);

    // Sync goal grid active state
    document.querySelectorAll('.goal-card').forEach(g => {
      g.classList.toggle('active', g.dataset.value === state.brief.emailGoal);
    });
  }

  // ── Generation ──────────────────────────────────────────────────────────
  async function handleGenerate() {
    // Guard: single-flight lock
    if (state.generation.status === 'generating') return;

    syncStateFromInputs();

    // Validate required fields — send server-side errors rather than blocking client-side on background
    const missing = [];
    if (!state.brief.position) missing.push('Role / Title (Step 1)');
    if (!state.brief.companyName) missing.push('Company Name (Step 2)');
    if (!state.brief.userName) missing.push('Your Name (Step 3)');
    // background is NOT required client-side — the server handles it gracefully

    if (missing.length > 0) {
      showToast(`Please fill in: ${missing[0]}`, true);
      if (!state.brief.position) toggleStepAccordion('recipient');
      else if (!state.brief.companyName) toggleStepAccordion('company');
      else toggleStepAccordion('value');
      return;
    }

    // Abort any prior in-flight request
    if (state.generation.controller) {
      try { state.generation.controller.abort(); } catch (_) {}
    }

    const controller = new AbortController();
    state.generation.controller = controller;
    state.generation.requestId += 1;
    const currentReqId = state.generation.requestId;
    state.generation.status = 'generating';

    const genBtn = document.getElementById('generateBtn');
    if (genBtn) {
      genBtn.innerHTML = '<i data-lucide="loader-circle" class="spin" width="16"></i> Generating…';
      genBtn.disabled = true;
      if (window.lucide) window.lucide.createIcons();
    }
    setEditorGenerating(true);

    const payload = {
      action: 'generate',
      emailGoal: state.brief.emailGoal,
      recipient: {
        name: state.brief.recipientName,
        company: state.brief.companyName,
        position: state.brief.position
      },
      userContext: {
        name: state.brief.userName,
        background: state.brief.background,
        whyContacting: state.brief.companyContext || state.brief.relationship
      },
      length: state.brief.length,
      personalization: {
        tone: state.brief.tone,
        length: state.brief.length,
        ctaStyle: state.brief.ctaStyle
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
        signal: controller.signal
      });

      // Bail silently if a newer request has superseded this one
      if (currentReqId !== state.generation.requestId) return;

      const data = await res.json();
      if (currentReqId !== state.generation.requestId) return;

      if (!res.ok) {
        const msg = data.error || `Generation failed (${res.status})`;
        if (data.usageLimitReached) {
          showToast(msg, true);
          return;
        }
        throw new Error(msg);
      }

      // Validate and sanitize response
      const variants = Array.isArray(data.variants) ? data.variants : [];
      if (variants.length === 0) throw new Error('No email variants were generated. Please try again.');

      state.data.variants = variants.map(v => ({
        tone: sanitizeText(v.tone) || 'Variant',
        subject: sanitizeSubject(v.subject),
        body: sanitizeEmailBody(v.body),
        approach: sanitizeText(v.approach) || ''
      }));

      state.data.subjectLines = Array.isArray(data.subjectLines)
        ? data.subjectLines.slice(0, 4).map(s => ({
            text: sanitizeSubject(s.text || s),
            label: sanitizeText(s.label) || ''
          }))
        : [];

      state.data.followUps = Array.isArray(data.followUps)
        ? data.followUps.map(f => ({
            index: f.index || 1,
            timing: sanitizeText(f.timing) || '',
            subject: sanitizeSubject(f.subject),
            body: sanitizeEmailBody(f.body)
          }))
        : [];

      state.data.evaluation = data.evaluation || null;
      state.data.activeVariantIndex = 0;

      const activeVariant = state.data.variants[0];
      state.editor.subject = activeVariant.subject;
      state.editor.bodyHtml = plainTextToHtml(activeVariant.body);

      saveDraftToStorage();
      renderWorkspace();

    } catch (err) {
      if (err.name === 'AbortError') return; // Superseded by newer request — silent

      console.error('[ColdEmail] Generation error:', err);
      const msg = err.message && err.message.length < 200
        ? err.message
        : 'Generation failed. Please try again.';
      showToast(msg, true);

    } finally {
      // Always restore button state — check if this request is still the current one
      if (currentReqId === state.generation.requestId) {
        state.generation.status = 'idle';
        state.generation.controller = null;
        setEditorGenerating(false);
        if (genBtn) {
          genBtn.innerHTML = 'Generate Email <i data-lucide="sparkles" width="16"></i>';
          genBtn.disabled = false;
          if (window.lucide) window.lucide.createIcons();
        }
      }
    }
  }

  function setEditorGenerating(isGenerating) {
    const overlay = document.getElementById('editorGenOverlay');
    const canvas = document.getElementById('editorCanvas');
    if (overlay) overlay.classList.toggle('visible', isGenerating);
    if (canvas) canvas.classList.toggle('cl-generating', isGenerating);
  }

  // ── Sanitization ─────────────────────────────────────────────────────────
  function sanitizeText(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/[<>]/g, '').trim();
  }

  function sanitizeSubject(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/^subject\s*:\s*/i, '').replace(/[<>]/g, '').trim();
  }

  function sanitizeEmailBody(str) {
    if (!str || typeof str !== 'string') return '';
    let clean = str
      .replace(/```[\s\S]*?```/g, '')        // strip code fences
      .replace(/<[^>]+>/g, '')               // strip HTML tags
      .replace(/\*\*(.*?)\*\*/g, '$1')       // strip bold markdown
      .replace(/__(.*?)__/g, '$1')           // strip underline markdown
      .replace(/\[object Object\]/gi, '')    // strip debug artifacts
      .replace(/undefined|null\b/g, '');     // strip literal undefined/null

    // Remove resume section headers if they leaked
    const resumeHeaders = /^(education|skills|work experience|experience|summary|certifications|languages|references)\s*:?\s*$/gim;
    clean = clean.replace(resumeHeaders, '');

    return clean.trim();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Convert plain email text (with \n) to HTML paragraphs for the editor */
  function plainTextToHtml(text) {
    if (!text) return '';
    return text
      .split(/\n\n+/)
      .map(para => `<p>${escapeHtml(para.replace(/\n/g, '<br>'))}</p>`)
      .join('');
  }

  /** Extract plain text from editor HTML for copy/metrics */
  function htmlToPlainText(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    div.querySelectorAll('p').forEach(p => {
      p.insertAdjacentText('afterend', '\n\n');
    });
    return (div.textContent || div.innerText || '').trim();
  }

  // ── Render Workspace ────────────────────────────────────────────────────
  function renderWorkspace() {
    if (state.data.variants.length === 0) return;

    const canvas = document.getElementById('editorCanvas');
    if (canvas) {
      canvas.classList.add('cl-has-draft');
      canvas.classList.remove('cl-generating');
    }

    const elVariantsEmpty = document.getElementById('variantsEmptyState');
    const elVariantsContent = document.getElementById('variantsContent');
    const elCopilotEmpty = document.getElementById('copilotEmptyState');
    const elCopilotContent = document.getElementById('copilotContent');

    if (elVariantsEmpty) elVariantsEmpty.style.display = 'none';
    if (elVariantsContent) elVariantsContent.style.display = 'block';
    if (elCopilotEmpty) elCopilotEmpty.style.display = 'none';
    if (elCopilotContent) elCopilotContent.style.display = 'block';

    renderSubjectPills();
    renderEditorContent();
    renderCopilot();
    renderVariants();
    renderFollowUps();
    updateLiveMetrics();

    if (window.lucide) window.lucide.createIcons();
  }

  function renderSubjectPills() {
    const container = document.getElementById('subjectContainer');
    if (!container) return;
    container.innerHTML = '';

    const apiSubjects = state.data.subjectLines.map(s => s.text).filter(Boolean);
    const allSubjects = [...new Set([state.editor.subject, ...apiSubjects])].filter(Boolean).slice(0, 4);

    allSubjects.forEach(txt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'subject-pill' + (txt === state.editor.subject ? ' active' : '');
      btn.textContent = txt;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.subject-pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        state.editor.subject = txt;
        saveDraftToStorage();
      });
      container.appendChild(btn);
    });
  }

  function renderEditorContent() {
    const editor = document.getElementById('editorSheet');
    if (!editor) return;
    if (editor.innerHTML !== state.editor.bodyHtml) {
      editor.innerHTML = state.editor.bodyHtml;
    }
  }

  function renderCopilot() {
    const scoreEl = document.getElementById('copilotOverallScore');
    const labelEl = document.getElementById('copilotOverallLabel');
    const strengthsEl = document.getElementById('copilotStrengths');
    const ev = state.data.evaluation;

    if (scoreEl && ev) {
      const score = ev.overallScore || 0;
      let color, icon, label;
      if (score >= 85) { color = 'var(--success)'; icon = 'check-circle'; label = 'Strong'; }
      else if (score >= 70) { color = 'var(--warning)'; icon = 'alert-circle'; label = 'Good'; }
      else { color = 'var(--danger)'; icon = 'x-circle'; label = 'Needs Work'; }
      scoreEl.innerHTML = `<i data-lucide="${icon}" style="color:${color};" width="28" height="28"></i>`;
      if (labelEl) { labelEl.textContent = label; labelEl.style.color = color; }
    }

    if (strengthsEl && ev) {
      const strengths = Array.isArray(ev.strengths) ? ev.strengths.filter(Boolean) : [];
      const weaknesses = Array.isArray(ev.weaknesses) ? ev.weaknesses.filter(Boolean) : [];

      let html = '';
      strengths.slice(0, 3).forEach(s => {
        html += `<div class="ce-strength-item">
          <i data-lucide="check" width="15" height="15" class="ce-strength-icon"></i>
          <span>${escapeHtml(s)}</span>
        </div>`;
      });
      weaknesses.slice(0, 1).forEach(w => {
        html += `<div class="ce-weakness-item">
          <i data-lucide="alert-circle" width="15" height="15" class="ce-weakness-icon"></i>
          <span>${escapeHtml(w)}</span>
        </div>`;
      });

      if (!html) {
        html = `<div class="ce-strength-item">
          <i data-lucide="check" width="15" height="15" class="ce-strength-icon"></i>
          <span>Personalized opening relevant to the recipient</span>
        </div>
        <div class="ce-strength-item">
          <i data-lucide="check" width="15" height="15" class="ce-strength-icon"></i>
          <span>Clear value proposition without resume jargon</span>
        </div>
        <div class="ce-strength-item">
          <i data-lucide="check" width="15" height="15" class="ce-strength-icon"></i>
          <span>Low-friction call to action</span>
        </div>`;
      }

      strengthsEl.innerHTML = html;
    }
  }

  function renderVariants() {
    const varCont = document.getElementById('variantsContainer');
    if (!varCont) return;
    varCont.innerHTML = '';

    const toneColors = {
      professional: '#6366f1',
      friendly: '#10b981',
      direct: '#f59e0b',
      executive: '#f59e0b',
      networking: '#8b5cf6',
      startup: '#ef4444',
      technical: '#3b82f6'
    };

    const activeVariant = state.data.variants[state.data.activeVariantIndex];
    const activeTone = (activeVariant?.tone || '').toLowerCase();

    // Show variants that are not the currently active one
    const displayVariants = state.data.variants.filter(v => {
      const toneKey = (v.tone || '').toLowerCase();
      return toneKey !== activeTone;
    });

    if (displayVariants.length === 0) {
      varCont.innerHTML = '<p style="font-size:0.84rem;color:var(--text-3);">No alternative variants available.</p>';
      return;
    }

    displayVariants.forEach(v => {
      const toneKey = (v.tone || '').toLowerCase();
      const badgeColor = toneColors[toneKey] || 'var(--accent)';
      const safeApproach = v.approach || '';

      const card = document.createElement('div');
      card.className = 'ce-variant-card';

      card.innerHTML = `
        <div class="ce-variant-header">
          <span class="ce-tone-badge" style="color:${badgeColor};background:${badgeColor}1a;">${escapeHtml(v.tone)}</span>
          <span class="ce-variant-subject" title="${escapeHtml(v.subject)}">Subj: ${escapeHtml(v.subject)}</span>
        </div>
        ${safeApproach ? `<div class="ce-variant-approach">${escapeHtml(safeApproach)}</div>` : ''}
        <div class="ce-variant-body">${escapeHtml(v.body)}</div>
        <div class="ce-variant-actions">
          <button type="button" class="btn btn-primary btn-sm variant-use-btn">Use this version</button>
          <button type="button" class="btn btn-secondary btn-sm variant-copy-btn">Copy</button>
        </div>`;

      card.querySelector('.variant-use-btn').addEventListener('click', () => {
        const idx = state.data.variants.indexOf(v);
        state.data.activeVariantIndex = idx;
        state.editor.subject = v.subject;
        state.editor.bodyHtml = plainTextToHtml(v.body);
        saveDraftToStorage();
        renderWorkspace();
        showToast('Switched to ' + v.tone + ' variant.');
      });

      card.querySelector('.variant-copy-btn').addEventListener('click', () => {
        const text = `Subject: ${v.subject}\n\n${v.body}`;
        copyText(text, 'Variant copied to clipboard.');
      });

      varCont.appendChild(card);
    });
  }

  function renderFollowUps() {
    const folCont = document.getElementById('followUpsContainer');
    if (!folCont) return;
    folCont.innerHTML = '';

    const followUps = state.data.followUps.length > 0
      ? state.data.followUps
      : buildDefaultFollowUps();

    const labels = ['Follow-up 1', 'Final Follow-up'];

    followUps.slice(0, 2).forEach((fu, i) => {
      const card = document.createElement('div');
      card.className = 'ce-followup-card';

      const subjectHtml = fu.subject
        ? `<div class="ce-followup-subject">Subj: ${escapeHtml(fu.subject)}</div>`
        : '';

      // Use data-* attribute for body element to avoid DOM ID collisions
      card.innerHTML = `
        <div class="ce-followup-header">
          <span class="ce-followup-title">${escapeHtml(labels[i] || `Follow-up ${i + 1}`)}</span>
          ${fu.timing ? `<span class="ce-followup-timing">${escapeHtml(fu.timing)}</span>` : ''}
        </div>
        ${subjectHtml}
        <div class="ce-followup-body" data-fu-index="${i}">${escapeHtml(fu.body)}</div>
        <div class="ce-followup-actions">
          <button type="button" class="btn btn-secondary btn-sm fu-copy-btn">Copy</button>
          <button type="button" class="btn btn-secondary btn-sm fu-edit-btn">Edit</button>
        </div>`;

      const bodyEl = card.querySelector(`[data-fu-index="${i}"]`);

      card.querySelector('.fu-copy-btn').addEventListener('click', () => {
        const text = fu.subject ? `Subject: ${fu.subject}\n\n${fu.body}` : fu.body;
        copyText(text, 'Follow-up copied.');
      });

      const editBtn = card.querySelector('.fu-edit-btn');
      let editing = false;
      editBtn.addEventListener('click', () => {
        editing = !editing;
        bodyEl.contentEditable = editing ? 'true' : 'false';
        editBtn.textContent = editing ? 'Save' : 'Edit';
        if (editing) {
          bodyEl.focus();
          const range = document.createRange();
          range.selectNodeContents(bodyEl);
          range.collapse(false);
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range);
        } else {
          state.data.followUps[i] = { ...fu, body: bodyEl.textContent || bodyEl.innerText };
          saveDraftToStorage();
          showToast('Follow-up saved.');
        }
      });

      folCont.appendChild(card);
    });
  }

  function buildDefaultFollowUps() {
    const recip = state.brief.recipientName || 'there';
    const comp = state.brief.companyName || 'your organization';
    const sender = state.brief.userName || 'there';
    const why = state.brief.companyContext || state.brief.relationship || 'this opportunity';

    return [
      {
        index: 1,
        timing: '3–5 business days after initial email',
        subject: `one more thought — ${comp}`,
        body: `Hi ${recip},\n\nOne additional angle since my last note: ${why ? why : `what you're building at ${comp}`} is something I've been thinking about.\n\nHappy to keep it brief — 15 minutes at most.\n\nBest,\n${sender}`
      },
      {
        index: 2,
        timing: '7–10 business days after follow-up 1',
        subject: `closing the loop — ${comp}`,
        body: `Hi ${recip},\n\nI'll leave it here so I'm not filling your inbox. If the timing is ever right, I'd genuinely welcome a conversation.\n\nAll the best,\n${sender}`
      }
    ];
  }

  // ── Live Metrics ────────────────────────────────────────────────────────
  function updateLiveMetrics() {
    const plainText = htmlToPlainText(state.editor.bodyHtml);
    const words = plainText.trim() === '' ? 0 : plainText.trim().split(/\s+/).filter(Boolean).length;
    const el = id => document.getElementById(id);
    if (el('wordCount')) el('wordCount').textContent = words;
    if (el('charCount')) el('charCount').textContent = plainText.length;
    if (el('readTime')) el('readTime').textContent = Math.max(1, Math.ceil(words / 200)) + 'm';
  }

  // ── Editor Setup ────────────────────────────────────────────────────────
  function setupEditorToolbar() {
    document.querySelectorAll('.cl-toolbar-btn').forEach(btn => {
      btn.addEventListener('mousedown', e => e.preventDefault());
      btn.addEventListener('click', e => {
        e.preventDefault();
        const cmd = btn.dataset.command;
        if (!cmd) return;
        document.execCommand(cmd, false, null);
        const editor = document.getElementById('editorSheet');
        if (editor) {
          editor.focus();
          syncEditorToState(editor);
        }
      });
    });
  }

  function setupEditorSync() {
    const editor = document.getElementById('editorSheet');
    if (!editor) return;

    editor.addEventListener('input', () => {
      syncEditorToState(editor);
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => {
        saveDraftToStorage();
        flashAutosave();
        updateLiveMetrics();
      }, 1200);
    });
  }

  function syncEditorToState(editor) {
    state.editor.bodyHtml = editor.innerHTML;
  }

  function flashAutosave() {
    const label = document.getElementById('autosaveLabel');
    if (!label) return;
    label.style.opacity = '1';
    setTimeout(() => { label.style.opacity = '0'; }, 2000);
  }

  // ── Action Bar ──────────────────────────────────────────────────────────
  function setupActionBar() {
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const plainBody = htmlToPlainText(state.editor.bodyHtml);
        if (!plainBody) return showToast('No email to copy.', true);
        const text = state.editor.subject
          ? `Subject: ${state.editor.subject}\n\n${plainBody}`
          : plainBody;
        copyText(text, 'Email copied to clipboard.');
      });
    }

    const saveDraftBtn = document.getElementById('saveDraftBtn');
    if (saveDraftBtn) {
      saveDraftBtn.addEventListener('click', () => {
        saveDraftToStorage();
        showToast('Draft saved.');
      });
    }

    const genBtn = document.getElementById('generateBtn');
    if (genBtn) genBtn.addEventListener('click', handleGenerate);
  }

  function copyText(text, successMsg) {
    if (window.appSdk?.ui?.copyToClipboard) {
      window.appSdk.ui.copyToClipboard(text, successMsg);
    } else {
      navigator.clipboard.writeText(text)
        .then(() => showToast(successMsg))
        .catch(() => showToast('Copy failed.', true));
    }
  }

  // ── AI Copilot Actions ──────────────────────────────────────────────────
  // Spec-compliant action set:
  //   improve      : Rewrite the opening sentence to be more specific
  //   shorten      : Remove 20–30% of words, preserve core message
  //   changeAngle  : Completely different opening strategy, same facts
  //   regenerate   : Re-run full generation with current form state
  const ACTION_FEEDBACK_MAP = {
    improve: 'Rewrite ONLY the opening sentence or opening paragraph to be more specific and relevant to the recipient and company. Do not change anything else — preserve the value proposition, CTA, and signature exactly.',
    shorten: 'Shorten the email by 20–30% by removing filler, redundant phrases, and unnecessary words. Preserve the core message, the main value point, and the CTA exactly. Do not add new content.',
    changeAngle: 'Rewrite the email using a completely different opening strategy and angle. Keep the same verified facts about the sender but change the framing, opening approach, and structure entirely. The result should feel meaningfully different from the original.'
  };

  async function triggerAiAction(action) {
    // Special case: regenerate calls handleGenerate directly
    if (action === 'regenerate') {
      hideDiffView();
      await handleGenerate();
      return;
    }

    const plainBody = htmlToPlainText(state.editor.bodyHtml);
    if (!plainBody) {
      showToast('Please generate an email first.', true);
      return;
    }

    // Prevent concurrent copilot calls
    if (state.generation.status === 'copilot-busy') return;
    state.generation.copilotRequestId += 1;
    const currentReqId = state.generation.copilotRequestId;
    state.generation.status = 'copilot-busy';

    // Disable all action cards while running
    document.querySelectorAll('.cl-action-card').forEach(b => b.disabled = true);

    const diffView = document.getElementById('aiDiffView');
    const diffOrig = document.getElementById('diffOrig');
    const diffSug = document.getElementById('diffSug');

    if (diffOrig) diffOrig.textContent = '';
    if (diffSug) {
      diffSug.innerHTML = '<i data-lucide="loader-2" class="spin" width="14" style="margin-right:6px;vertical-align:middle;"></i> Applying improvement…';
      if (window.lucide) window.lucide.createIcons();
    }
    if (diffView) diffView.style.display = 'block';

    const feedback = ACTION_FEEDBACK_MAP[action] || `Improve the email: ${action}`;

    const payload = {
      action: 'optimize',
      emailGoal: state.brief.emailGoal,
      emailBody: plainBody,
      feedback,
      recipientName: state.brief.recipientName,
      companyName: state.brief.companyName,
      position: state.brief.position,
      userName: state.brief.userName,
      background: state.brief.background,
      whyContacting: state.brief.companyContext || state.brief.relationship,
      length: state.brief.length
    };

    try {
      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch('/api/cold-email', { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json();

      if (currentReqId !== state.generation.copilotRequestId) return;
      if (!res.ok) throw new Error(data.error || 'Optimization failed');

      const proposed = sanitizeEmailBody((data.revisedText || '').trim());
      if (!proposed || proposed === plainBody.trim()) {
        if (diffSug) diffSug.textContent = 'No meaningful change was produced. Try a different action.';
        return;
      }

      // Store proposed text in data-* attribute — NEVER use innerText for apply
      if (diffSug) {
        diffSug.dataset.proposedText = proposed;
        diffSug.innerHTML = renderWordDiff(plainBody, proposed);
      }
      if (diffOrig) diffOrig.textContent = plainBody;

    } catch (err) {
      if (currentReqId === state.generation.copilotRequestId) {
        const userMsg = (err.message && err.message.length < 150)
          ? err.message
          : 'Something went wrong. Please try again.';
        if (diffSug) diffSug.textContent = userMsg;
      }
    } finally {
      if (currentReqId === state.generation.copilotRequestId) {
        state.generation.status = 'idle';
        document.querySelectorAll('.cl-action-card').forEach(b => b.disabled = false);
      }
    }
  }

  function hideDiffView() {
    const diffView = document.getElementById('aiDiffView');
    if (diffView) diffView.style.display = 'none';
    const diffSug = document.getElementById('diffSug');
    if (diffSug) delete diffSug.dataset.proposedText;
  }

  function rejectAiAction() {
    hideDiffView();
  }

  function applyAiAction() {
    const diffSug = document.getElementById('diffSug');
    const editor = document.getElementById('editorSheet');
    if (!diffSug || !editor) return;

    // Always use dataset.proposedText — never fall back to innerText (contains diff HTML markup)
    const proposed = diffSug.dataset.proposedText;
    if (!proposed) {
      showToast('No suggestion to apply.', true);
      return;
    }

    state.editor.bodyHtml = plainTextToHtml(proposed);
    editor.innerHTML = state.editor.bodyHtml;
    hideDiffView();
    saveDraftToStorage();
    updateLiveMetrics();
    showToast('AI suggestion applied.');
  }

  /** Highlight word-level differences between old and new text */
  function renderWordDiff(oldText, newText) {
    const oldWords = oldText.split(/(\s+)/);
    const newWords = newText.split(/(\s+)/);

    let start = 0;
    while (start < oldWords.length && start < newWords.length && oldWords[start] === newWords[start]) start++;

    let oldEnd = oldWords.length - 1;
    let newEnd = newWords.length - 1;
    while (oldEnd >= start && newEnd >= start && oldWords[oldEnd] === newWords[newEnd]) {
      oldEnd--;
      newEnd--;
    }

    const prefix = oldWords.slice(0, start).join('');
    const removed = oldWords.slice(start, oldEnd + 1).join('');
    const added = newWords.slice(start, newEnd + 1).join('');
    const suffix = oldWords.slice(oldEnd + 1).join('');

    let html = escapeHtml(prefix);
    if (removed) html += `<span class="diff-del">${escapeHtml(removed)}</span>`;
    if (added) html += `<span class="diff-ins">${escapeHtml(added)}</span>`;
    html += escapeHtml(suffix);
    return html;
  }

  init();
})();
