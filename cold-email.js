/**
 * cold-email.js — CareerCraft Cold Email Generator
 *
 * Architecture:
 *  - Single source of truth: `state` object.
 *  - Generation is guarded by `state.generating` (boolean single-flight lock).
 *  - All DOM mutations go through render functions — no ad-hoc innerHTML
 *    except within dedicated render helpers.
 *  - Editor stores semantic HTML; plain-text copy uses innerText at copy time.
 *  - Resume controls: "Use My Resume" loads from Supabase; "Import Resume"
 *    parses a PDF/DOCX via the upload API.
 *  - AI actions (Regenerate, Shorten, More Direct, Warmer) call /api/cold-email
 *    with action:"generate" or action:"optimize" and apply the result.
 *  - Draft persisted to localStorage on generate and on action apply.
 *  - No debounced input listeners — state is only synced on Generate click.
 */
(function () {
  'use strict';

  let client = null;
  let currentUser = null;
  let savedResumes = [];

  // ── Single Source of Truth ─────────────────────────────────────────────
  const state = {
    // Form inputs
    brief: {
      recipientName: '',
      position: '',
      company: '',
      context: '',       // why contacting + recipient detail combined
      senderName: '',
      background: '',
      purpose: 'Networking',
      tone: 'Professional',
      length: 'Short'
    },
    // Generated email data
    email: {
      subject: '',       // currently selected subject
      subjects: [],      // array of {text, label} from API
      bodyHtml: '',      // semantic HTML shown in editor
      variant: null      // raw variant object from API (for plain-text copy)
    },
    variants: [],        // Alternative versions
    // Generation control
    generating: false,
    actionBusy: false,
    genController: null,
    genRequestId: 0,
    // Resume
    resume: {
      loadedId: null,
      loadedName: null
    }
  };

  // ── Init ───────────────────────────────────────────────────────────────
  async function init() {
    try {
      await window.appSdk.ready;
      if (!window.AuthManager) return;
      const session = await window.AuthManager.requireAuth();
      if (!session) return;
      client = window.appSdk.client;
      currentUser = session.user;

      setupPurposeGrid();
      setupLengthPills();
      setupTonePills();
      setupActionBar();
      await loadResumeControls();
      hydrateFromStorage();
    } catch (err) {
      console.error('[ColdEmail] Init error:', err);
      showToast('Initialization error. Please refresh.', true);
    }
  }

  // ── Toast ──────────────────────────────────────────────────────────────
  function showToast(msg, isError = false) {
    const type = isError ? 'error' : 'success';
    if (window.appSdk?.ui?.showToast) {
      window.appSdk.ui.showToast(msg, type);
    } else if (window.LayoutManager?.showToast) {
      window.LayoutManager.showToast(msg, type);
    }
  }

  // ── Purpose grid ───────────────────────────────────────────────────────
  function setupPurposeGrid() {
    const cards = document.querySelectorAll('.ce-purpose-card');
    const hiddenInput = document.getElementById('cePurpose');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        cards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        if (hiddenInput) hiddenInput.value = card.dataset.value;
        state.brief.purpose = card.dataset.value;
      });
    });
  }

  // ── Tone & Length pills ────────────────────────────────────────────────
  function setupLengthPills() {
    const pills = document.querySelectorAll('#ceLengthGroup .ce-tone-pill');
    const hiddenInput = document.getElementById('ceLength');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        if (hiddenInput) hiddenInput.value = pill.dataset.value;
        state.brief.length = pill.dataset.value;
      });
    });
  }
  function setupTonePills() {
    const pills = document.querySelectorAll('.ce-tone-pill');
    const hiddenInput = document.getElementById('ceTone');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        if (hiddenInput) hiddenInput.value = pill.dataset.value;
        state.brief.tone = pill.dataset.value;
      });
    });
  }

  // ── Action bar setup ───────────────────────────────────────────────────
  function setupActionBar() {
    const genBtn = document.getElementById('ceGenerateBtn');
    if (genBtn) genBtn.addEventListener('click', handleGenerate);

    const actionMap = {
      ceActionRegenerate: () => handleGenerate(),
      ceActionShorten:    () => handleAiAction('shorten'),
      ceActionMoreDirect: () => handleAiAction('more-direct'),
      ceActionWarmer:     () => handleAiAction('warmer'),
      ceActionCopy:       () => handleCopy()
    };

    Object.entries(actionMap).forEach(([id, fn]) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', fn);
    });

    // Editor content → state sync (for manual edits)
    const editor = document.getElementById('ceEditorSheet');
    if (editor) {
      let autosaveTimer = null;
      editor.addEventListener('input', () => {
        state.email.bodyHtml = editor.innerHTML;
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(() => {
          updateWordCount();
          saveDraft();
          flashAutosave();
        }, 1200);
      });
    }
  }

  // ── State sync (read form → state) ────────────────────────────────────
  function syncStateFromForm() {
    const get = id => {
      const el = document.getElementById(id);
      return el ? (el.value || '').trim() : '';
    };
    state.brief.recipientName = get('ceRecipientName');
    state.brief.position      = get('cePosition');
    state.brief.company       = get('ceCompany');
    // Combine context and recipient detail into a single context string
    const ctx    = get('ceContext');
    const detail = get('ceRecipientDetail');
    state.brief.context    = [ctx, detail].filter(Boolean).join('. ');
    state.brief.senderName = get('ceSenderName');
    state.brief.background = get('ceBackground');
    state.brief.purpose    = get('cePurpose') || state.brief.purpose;
    state.brief.tone       = get('ceTone') || state.brief.tone;
    state.brief.length     = get('ceLength') || state.brief.length;
  }

  // ── State → DOM sync (for draft restore) ──────────────────────────────
  function syncDOMFromState() {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };
    set('ceRecipientName', state.brief.recipientName);
    set('cePosition',      state.brief.position);
    set('ceCompany',       state.brief.company);
    set('ceSenderName',    state.brief.senderName);
    set('ceBackground',    state.brief.background);

    // Restore purpose grid
    document.querySelectorAll('.ce-purpose-card').forEach(card => {
      const isActive = card.dataset.value === state.brief.purpose;
      card.classList.toggle('active', isActive);
    });
    set('cePurpose', state.brief.purpose);

    // Restore tone pills
    document.querySelectorAll('#ceToneGroup .ce-tone-pill').forEach(pill => {
      const isActive = pill.dataset.value === state.brief.tone;
      pill.classList.toggle('active', isActive);
    });
    set('ceTone', state.brief.tone);

    // Restore length pills
    document.querySelectorAll('#ceLengthGroup .ce-tone-pill').forEach(pill => {
      const isActive = pill.dataset.value === state.brief.length;
      pill.classList.toggle('active', isActive);
    });
    set('ceLength', state.brief.length);
  }

  // ── Generation ─────────────────────────────────────────────────────────
  async function handleGenerate() {
    // Single-flight lock
    if (state.generating) return;

    syncStateFromForm();

    // Validate required fields: Company, Sender Name, Background
    if (!state.brief.company) {
      showToast('Please enter the recipient\'s Company name.', true);
      document.getElementById('ceCompany')?.focus();
      return;
    }
    if (!state.brief.senderName) {
      showToast('Please enter Your Name.', true);
      document.getElementById('ceSenderName')?.focus();
      return;
    }
    if (!state.brief.background) {
      showToast('Please enter your short background/value proposition.', true);
      document.getElementById('ceBackground')?.focus();
      return;
    }

    // Abort any prior in-flight request
    if (state.genController) {
      try { state.genController.abort(); } catch (_) {}
    }

    const controller = new AbortController();
    state.genController = controller;
    state.genRequestId += 1;
    const reqId = state.genRequestId;
    state.generating = true;

    setGeneratingUI(true);

    const payload = {
      action: 'generate',
      emailGoal: state.brief.purpose || 'Networking',
      recipient: {
        name:     state.brief.recipientName || '',
        company:  state.brief.company || '',
        position: state.brief.position || ''
      },
      userContext: {
        name:          state.brief.senderName || '',
        background:    state.brief.background || '',
        whyContacting: state.brief.context || ''
      },
      personalization: {
        tone:     state.brief.tone || 'Professional',
        lengthType: state.brief.length || 'Short',
        ctaStyle: 'Soft Ask'
      }
    };
    
    // Convert string length into min/max bounds for the prompt.
    // Ensure we send bounds so the AI respects them tightly.
    const lengthMap = {
      'Very Short': { min: 40, max: 60 },
      'Short':      { min: 60, max: 90 },
      'Standard':   { min: 90, max: 120 },
      'Detailed':   { min: 120, max: 160 }
    };
    const range = lengthMap[payload.personalization.lengthType] || lengthMap['Short'];
    payload.minLength = range.min;
    payload.maxLength = range.max;

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

      // Bail if superseded
      if (reqId !== state.genRequestId) return;

      const data = await res.json();
      if (reqId !== state.genRequestId) return;

      if (!res.ok) {
        const msg = data.error || `Generation failed (${res.status})`;
        if (data.usageLimitReached) { showToast(msg, true); return; }
        throw new Error(msg);
      }

      // Pick the first (best) variant as primary email
      const variants = Array.isArray(data.variants) ? data.variants : [];
      if (variants.length === 0) throw new Error('No email was generated. Please try again.');

      const primary = normalizeVariant(variants[0], state.brief.senderName);
      if (!primary) throw new Error('Generated email could not be rendered. Please try again.');

      // Validate sender/recipient separation before rendering
      const greeting = primary.greeting || '';
      if (state.brief.senderName && greeting.toLowerCase().includes(state.brief.senderName.toLowerCase())) {
        // Sender name in greeting — this is a bug; fix greeting
        primary.greeting = state.brief.recipientName
          ? `Hi ${state.brief.recipientName},`
          : 'Hi there,';
      }

      // Ensure senderName is correct
      primary.senderName = state.brief.senderName;

      // Build subject list (dedup, max 4)
      const apiSubjects = Array.isArray(data.subjectLines)
        ? data.subjectLines.map(s => ({ text: sanitizeSubject(s.text || s), label: sanitizeText(s.label) || '' })).filter(s => s.text)
        : [];
      const primarySubject = { text: sanitizeSubject(primary.subject), label: '' };
      const allSubjects = [primarySubject, ...apiSubjects]
        .filter(s => s.text)
        .reduce((acc, s) => {
          if (!acc.find(x => x.text === s.text)) acc.push(s);
          return acc;
        }, [])
        .slice(0, 4);

      state.email.variant  = primary;
      state.email.subjects = allSubjects;
      state.email.subject  = allSubjects[0]?.text || primary.subject;
      state.email.bodyHtml = variantToHtml(primary);

      state.variants = variants.slice(1, 4).map(v => normalizeVariant(v, state.brief.senderName)).filter(Boolean);

      saveDraft();
      renderEmail();

    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[ColdEmail] Generation error:', err);
      const msg = err.message && err.message.length < 200
        ? err.message
        : 'Generation failed. Please try again.';
      showToast(msg, true);
    } finally {
      if (reqId === state.genRequestId) {
        state.generating = false;
        state.genController = null;
        setGeneratingUI(false);
      }
    }
  }

  // ── AI Actions ─────────────────────────────────────────────────────────
  const ACTION_FEEDBACK = {
    'shorten':     'Shorten the email by 20–30% by removing filler and redundant phrases. Preserve the core message, main value point, and CTA exactly. Do not add new content.',
    'more-direct': 'Rewrite the email to be more direct and concise. Remove any preamble, pleasantries, or indirect phrasing. Get straight to the point immediately.',
    'warmer':      'Rewrite the email with a warmer, more personable tone. Keep all facts exactly the same — only adjust the phrasing to feel more human and conversational.'
  };

  async function handleAiAction(action) {
    if (state.generating || state.actionBusy) return;
    if (!state.email.bodyHtml) {
      showToast('Please generate an email first.', true);
      return;
    }

    const plainBody = htmlToPlainText(state.email.bodyHtml);
    if (!plainBody) return;

    state.actionBusy = true;
    setActionButtonsDisabled(true, action);

    const feedback = ACTION_FEEDBACK[action] || 'Improve the email.';

    const payload = {
      action:        'optimize',
      emailGoal:     state.brief.purpose || 'Networking',
      emailBody:     plainBody,
      feedback,
      recipientName: state.brief.recipientName || '',
      companyName:   state.brief.company || '',
      position:      state.brief.position || '',
      userName:      state.brief.senderName || '',
      background:    state.brief.background || '',
      whyContacting: state.brief.context || ''
    };

    try {
      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch('/api/cold-email', { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Action failed');

      const revised = sanitizeEmailBody((data.revisedText || '').trim());
      if (!revised) throw new Error('No meaningful change was produced. Try again.');

      // Apply final validation: ensure sender not in greeting
      const lines = revised.split('\n');
      const firstLine = (lines[0] || '').trim();
      if (state.brief.senderName && firstLine.toLowerCase().includes(state.brief.senderName.toLowerCase())) {
        // Fix greeting in revised text
        const newGreeting = state.brief.recipientName
          ? `Hi ${state.brief.recipientName},`
          : 'Hi there,';
        lines[0] = newGreeting;
      }

      const fixedRevised = lines.join('\n');
      state.email.bodyHtml = plainTextToHtml(finalSanitize(fixedRevised));
      renderEditorContent();
      updateWordCount();
      saveDraft();
      flashAutosave();

    } catch (err) {
      console.error('[ColdEmail] Action error:', err);
      const msg = err.message && err.message.length < 150
        ? err.message
        : 'Something went wrong. Please try again.';
      showToast(msg, true);
    } finally {
      state.actionBusy = false;
      setActionButtonsDisabled(false, null);
    }
  }

  // ── Copy ───────────────────────────────────────────────────────────────
  function handleCopy() {
    const v = state.email.variant;
    let plainBody = '';

    if (v && Array.isArray(v.paragraphs)) {
      // Build from structured variant for clean copy
      const parts = [];
      if (v.greeting) parts.push(v.greeting);
      parts.push('');
      v.paragraphs.forEach(p => { if (p) parts.push(p); });
      if (v.cta) { parts.push(''); parts.push(v.cta); }
      parts.push('');
      parts.push(v.signOff || 'Best,');
      parts.push(state.brief.senderName || v.senderName || '');
      plainBody = parts.join('\n').trim();
    } else {
      // Fallback: extract from current editor HTML
      plainBody = htmlToPlainText(state.email.bodyHtml);
    }

    if (!plainBody) {
      showToast('No email to copy.', true);
      return;
    }

    const selectedSubject = state.email.subject;
    const text = selectedSubject
      ? `Subject: ${selectedSubject}\n\n${plainBody}`
      : plainBody;

    if (window.appSdk?.ui?.copyToClipboard) {
      window.appSdk.ui.copyToClipboard(text, 'Email copied to clipboard.');
    } else {
      navigator.clipboard.writeText(text)
        .then(() => showToast('Email copied to clipboard.'))
        .catch(() => showToast('Copy failed. Please select and copy manually.', true));
    }
  }

  // ── Render email ───────────────────────────────────────────────────────
  function renderEmail() {
    const canvas = document.getElementById('ceEditorCanvas');
    if (canvas) {
      canvas.classList.add('cl-has-draft');
      canvas.classList.remove('cl-generating');
    }

    // Show action bar
    const actionBar = document.getElementById('ceActionsBar');
    if (actionBar) actionBar.style.display = 'flex';

    // Show word count bar
    const wcBar = document.getElementById('ceWordCountBar');
    if (wcBar) wcBar.style.display = 'flex';

    renderSubjectPills();
    renderEditorContent();
    renderVariants();
    updateWordCount();

    if (window.lucide) window.lucide.createIcons();
  }

  function renderSubjectPills() {
    const container = document.getElementById('ceSubjectContainer');
    if (!container) return;
    container.innerHTML = '';

    state.email.subjects.forEach(s => {
      if (!s.text) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ce-subject-pill' + (s.text === state.email.subject ? ' active' : '');
      btn.textContent = s.text;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ce-subject-pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        state.email.subject = s.text;
        saveDraft();
      });
      container.appendChild(btn);
    });
  }

  function renderVariants() {
    const container = document.getElementById('ceVariantsContainer');
    const list = document.getElementById('ceVariantsList');
    if (!container || !list) return;

    if (!state.variants || state.variants.length === 0) {
      container.style.display = 'none';
      return;
    }

    list.innerHTML = '';
    state.variants.forEach((variant, index) => {
      const typeLabel = variant.tone === 'Question' ? 'Warm' : 
                        variant.tone === 'Direct' ? 'Executive' : 
                        variant.tone === 'Curiosity' ? 'Direct' : 
                        variant.tone || 'Variant';
      
      const plainBody = htmlToPlainText(variantToHtml(variant));
      const wordCount = plainBody.split(/\s+/).filter(Boolean).length;
      
      const card = document.createElement('div');
      card.className = 'ce-variant-card';
      card.innerHTML = `
        <div class="ce-variant-meta">
          <span class="ce-variant-type">${typeLabel}</span>
          <span class="ce-variant-word-count">${wordCount} words</span>
        </div>
        <div class="ce-variant-subject">Subject: ${variant.subject}</div>
        <div class="ce-variant-body-preview">${escapeHtml(plainBody)}</div>
        <div class="ce-variant-actions">
          <button type="button" class="ce-variant-btn ce-variant-btn-primary" data-index="${index}">Use this version</button>
          <button type="button" class="ce-variant-btn ce-variant-btn-secondary" data-index="${index}">Copy</button>
        </div>
      `;

      // Use version
      card.querySelector('.ce-variant-btn-primary').addEventListener('click', () => {
        state.email.variant = variant;
        state.email.subject = variant.subject;
        state.email.bodyHtml = variantToHtml(variant);
        renderSubjectPills();
        renderEditorContent();
        updateWordCount();
        saveDraft();
        showToast('Switched to alternative version.');
      });

      // Copy version
      card.querySelector('.ce-variant-btn-secondary').addEventListener('click', () => {
        const text = `Subject: ${variant.subject}\n\n${plainBody}`;
        if (window.appSdk?.ui?.copyToClipboard) {
          window.appSdk.ui.copyToClipboard(text, 'Alternative version copied to clipboard.');
        } else {
          navigator.clipboard.writeText(text)
            .then(() => showToast('Alternative version copied to clipboard.'))
            .catch(() => showToast('Copy failed. Please copy manually.', true));
        }
      });

      list.appendChild(card);
    });

    container.style.display = 'flex';
  }

  function renderEditorContent() {
    const editor = document.getElementById('ceEditorSheet');
    if (!editor) return;
    if (editor.innerHTML !== state.email.bodyHtml) {
      editor.innerHTML = state.email.bodyHtml;
    }
  }

  // ── UI state helpers ───────────────────────────────────────────────────
  function setGeneratingUI(isGenerating) {
    const overlay = document.getElementById('ceGenOverlay');
    const canvas  = document.getElementById('ceEditorCanvas');
    if (overlay) overlay.classList.toggle('visible', isGenerating);
    if (canvas) canvas.classList.toggle('cl-generating', isGenerating);

    const genBtn = document.getElementById('ceGenerateBtn');
    if (genBtn) {
      if (isGenerating) {
        genBtn.innerHTML = '<i data-lucide="loader-circle" class="spin" width="16"></i> Generating…';
        genBtn.disabled = true;
      } else {
        genBtn.innerHTML = 'Generate Email <i data-lucide="sparkles" width="16"></i>';
        genBtn.disabled = false;
      }
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function setActionButtonsDisabled(disabled, activeAction) {
    const actionIds = ['ceActionRegenerate', 'ceActionShorten', 'ceActionMoreDirect', 'ceActionWarmer', 'ceActionCopy'];
    actionIds.forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.disabled = disabled;
      // Show spinner on the active action button
      if (disabled && activeAction) {
        const actionBtnMap = {
          'shorten':     'ceActionShorten',
          'more-direct': 'ceActionMoreDirect',
          'warmer':      'ceActionWarmer'
        };
        if (actionBtnMap[activeAction] === id) {
          const origText = btn.textContent.trim();
          btn.dataset.origHtml = btn.innerHTML;
          btn.innerHTML = '<i data-lucide="loader-circle" class="spin" width="14"></i> Working…';
          if (window.lucide) window.lucide.createIcons();
        }
      } else if (!disabled && btn.dataset.origHtml) {
        btn.innerHTML = btn.dataset.origHtml;
        delete btn.dataset.origHtml;
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }

  // ── Word count ─────────────────────────────────────────────────────────
  function updateWordCount() {
    const plain = htmlToPlainText(state.email.bodyHtml);
    const words = plain.trim() ? plain.trim().split(/\s+/).filter(Boolean).length : 0;
    const chars = plain.length;
    const wc = document.getElementById('ceWordCount');
    const cc = document.getElementById('ceCharCount');
    const rt = document.getElementById('ceReadTime');
    if (wc) wc.textContent = words;
    if (cc) cc.textContent = chars;
    if (rt) {
      const mins = Math.max(1, Math.round(words / 200));
      rt.textContent = `~${mins} min read`;
    }
  }

  // ── Autosave flash ─────────────────────────────────────────────────────
  function flashAutosave() {
    const el = document.getElementById('ceAutosave');
    if (!el) return;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2200);
  }

  // ── Draft persistence ──────────────────────────────────────────────────
  function saveDraft() {
    if (!window.StorageManager) return;
    try {
      window.StorageManager.set('cc_cold_email_v2', JSON.stringify({
        brief: state.brief,
        email: state.email,
        resume: state.resume
      }));
    } catch (e) {
      console.warn('[ColdEmail] Draft save failed:', e);
    }
  }

  function hydrateFromStorage() {
    if (!window.StorageManager) return;
    const raw = window.StorageManager.get('cc_cold_email_v2');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.brief)  Object.assign(state.brief,  parsed.brief);
      if (parsed.email)  Object.assign(state.email,  parsed.email);
      if (parsed.resume) Object.assign(state.resume, parsed.resume);
      syncDOMFromState();
      if (state.email.bodyHtml && state.email.subjects.length > 0) {
        renderEmail();
      }
    } catch (e) {
      console.warn('[ColdEmail] Draft hydration failed:', e);
    }
  }

  // ── Resume integration ─────────────────────────────────────────────────
  async function loadResumeControls() {
    const container = document.getElementById('ceResumeImportContainer');
    if (!container) return;

    // Bind file input
    const fileInput = document.getElementById('ceResumeFileInput');
    if (fileInput && !fileInput.dataset.bound) {
      fileInput.dataset.bound = 'true';
      fileInput.addEventListener('change', handleComputerImport);
    }

    // If resume already loaded (from draft), show chip
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

      // Auto-load if exactly 1 resume — silent, no dialog
      if (savedResumes.length === 1) {
        await autoLoadResume(savedResumes[0], container);
        return;
      }

      renderResumeImportUI(container);
    } catch (err) {
      console.error('[ColdEmail] Resume load failed:', err);
      renderResumeImportUI(container, true);
    }
  }

  async function autoLoadResume(resumeData, container) {
    // Pre-populate name immediately
    const nameInput = document.getElementById('ceSenderName');
    if (nameInput && !(nameInput.value || '').trim() && resumeData.full_name) {
      nameInput.value = resumeData.full_name;
      state.brief.senderName = resumeData.full_name;
    }

    state.resume.loadedId   = resumeData.id;
    state.resume.loadedName = resumeData.full_name || 'Resume';
    state.resume.autoLoaded = true;

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

      const bgInput = document.getElementById('ceBackground');
      if (bgInput && !(bgInput.value || '').trim()) {
        bgInput.value = valueText;
        state.brief.background = valueText;
      }
      renderResumeChip(state.resume.loadedName, container);
      saveDraft();
    } catch (err) {
      console.warn('[ColdEmail] Auto-load value-prop failed (non-blocking):', err.message);
      renderResumeChip(state.resume.loadedName, container);
    }
  }

  function renderResumeImportUI(container, fallback = false) {
    let html = '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">';

    if (!fallback && savedResumes.length > 0) {
      if (savedResumes.length === 1) {
        html += `<button type="button" class="btn btn-secondary btn-sm" id="ceBtnUseResume" data-resume-id="${savedResumes[0].id}">
          <i data-lucide="file-text" width="15" height="15" style="margin-right:5px;"></i>Use My Resume
        </button>`;
      } else {
        html += `<select id="ceSavedResumeSelect" style="background:var(--bg-input,rgba(255,255,255,0.05));border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-1);font-size:0.85rem;padding:6px 10px;max-width:200px;cursor:pointer;">
          <option value="">— Select Resume —</option>`;
        savedResumes.forEach(r => {
          const label = r.full_name
            ? `${r.full_name}${r.professional_headline ? ' · ' + r.professional_headline.substring(0, 28) : ''}`
            : 'Resume – ' + new Date(r.created_at).toLocaleDateString();
          html += `<option value="${r.id}">${escapeHtml(label)}</option>`;
        });
        html += `</select>
        <button type="button" class="btn btn-secondary btn-sm" id="ceBtnUseResume">
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

    html += `<button type="button" class="btn btn-secondary btn-sm" id="ceBtnImportResume">
      <i data-lucide="upload" width="15" height="15" style="margin-right:5px;"></i>Import Resume
    </button>`;
    html += '</div>';

    container.innerHTML = html;

    const useBtn = document.getElementById('ceBtnUseResume');
    if (useBtn) useBtn.addEventListener('click', handleUseMyResume);

    const importBtn = document.getElementById('ceBtnImportResume');
    if (importBtn) importBtn.addEventListener('click', () => {
      document.getElementById('ceResumeFileInput').click();
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function renderResumeChip(name, container) {
    container.innerHTML = `
      <div class="ce-resume-chip">
        <i data-lucide="check-circle" width="14" height="14"></i>
        ${escapeHtml(name)} loaded
        <button class="ce-resume-chip-change" id="ceBtnChangeResume" type="button">Change</button>
      </div>`;

    const changeBtn = document.getElementById('ceBtnChangeResume');
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        state.resume.loadedId   = null;
        state.resume.loadedName = null;
        renderResumeImportUI(container);
      });
    }
    if (window.lucide) window.lucide.createIcons();
  }

  async function handleUseMyResume() {
    const container = document.getElementById('ceResumeImportContainer');
    let resumeData = null;

    const selectEl = document.getElementById('ceSavedResumeSelect');
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

    const bgInput = document.getElementById('ceBackground');
    if ((bgInput?.value || '').trim().length > 0) {
      if (!confirm('Replace your current value proposition with information from this resume?')) return;
    }

    const useBtn = document.getElementById('ceBtnUseResume');
    if (useBtn) {
      useBtn.innerHTML = '<i data-lucide="loader-2" class="spin" width="15" height="15" style="margin-right:5px;"></i>Loading…';
      useBtn.disabled = true;
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const nameInput = document.getElementById('ceSenderName');
      if (nameInput && !(nameInput.value || '').trim() && resumeData.full_name) {
        nameInput.value = resumeData.full_name;
        state.brief.senderName = resumeData.full_name;
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

      if (bgInput) bgInput.value = valueText;
      state.brief.background = valueText;

      state.resume.loadedId   = resumeData.id;
      state.resume.loadedName = resumeData.full_name || 'Resume';
      renderResumeChip(state.resume.loadedName, container);
      saveDraft();
      showToast('Resume loaded successfully.');
    } catch (err) {
      console.error('[ColdEmail] handleUseMyResume error:', err);
      showToast("Couldn't import your resume. Try entering your background manually.", true);
      renderResumeImportUI(container);
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

    const bgInput = document.getElementById('ceBackground');
    if ((bgInput?.value || '').trim().length > 0) {
      if (!confirm('Replace your current value proposition with information from this file?')) {
        e.target.value = '';
        return;
      }
    }

    const importBtn = document.getElementById('ceBtnImportResume');
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

      if (bgInput) bgInput.value = valueProp;
      state.brief.background = valueProp;

      const nameInput = document.getElementById('ceSenderName');
      if (nameInput && !(nameInput.value || '').trim() && extracted.name) {
        nameInput.value = extracted.name;
        state.brief.senderName = extracted.name;
      }

      state.resume.loadedId   = 'imported-file';
      state.resume.loadedName = file.name.replace(/\.[^.]+$/, '');
      const container = document.getElementById('ceResumeImportContainer');
      if (container) renderResumeChip(state.resume.loadedName, container);
      saveDraft();
      showToast('Resume imported successfully.');
    } catch (err) {
      console.error('[ColdEmail] handleComputerImport error:', err);
      showToast(`Import failed: ${err.message || 'Please try again.'}`, true);
      const container = document.getElementById('ceResumeImportContainer');
      if (container) renderResumeImportUI(container);
    } finally {
      e.target.value = '';
    }
  }

  // ── Normalization ──────────────────────────────────────────────────────
  /**
   * Normalize a raw API variant into a clean structured object.
   * Handles both new structured format (paragraphs[]) and legacy flat body string.
   */
  function normalizeVariant(v, userName) {
    if (!v || typeof v !== 'object') return null;
    const clean = s => sanitizeClientField(String(s || ''));

    if (Array.isArray(v.paragraphs) && v.paragraphs.length > 0) {
      const paragraphs = v.paragraphs.map(p => clean(String(p || ''))).filter(Boolean);
      return {
        tone:       clean(v.tone) || 'Professional',
        subject:    sanitizeSubject(v.subject),
        greeting:   clean(v.greeting) || (v.recipientName ? `Hi ${v.recipientName},` : 'Hi there,'),
        paragraphs: paragraphs.length > 0 ? paragraphs : [''],
        cta:        clean(v.cta),
        signOff:    clean(v.signOff) || 'Best,',
        senderName: clean(v.senderName) || userName || '',
        approach:   clean(v.approach) || ''
      };
    }

    // Legacy flat body
    if (typeof v.body === 'string') {
      const bodyClean = sanitizeEmailBody(finalSanitize(v.body));
      const lines = bodyClean.split('\n').map(l => l.trim()).filter(Boolean);

      let greeting = '';
      let restLines = lines;
      if (lines.length > 0 && /^(hi|hello|dear)\b/i.test(lines[0])) {
        greeting = lines[0];
        restLines = lines.slice(1);
      }

      let signOff = 'Best,';
      let senderName = userName || '';
      const lastLine = restLines[restLines.length - 1] || '';
      const secondLastLine = restLines[restLines.length - 2] || '';
      const looksLikeName = /^[A-Z][a-z]+([\s-][A-Z][a-z]+)*$/.test(lastLine);
      const looksLikeSignOff = /^(best|warmly|regards|sincerely|cheers|thanks|all the best)[,.]?$/i.test(secondLastLine);

      if (looksLikeName && looksLikeSignOff) {
        senderName = lastLine; signOff = secondLastLine;
        restLines = restLines.slice(0, -2);
      } else if (looksLikeName) {
        senderName = lastLine;
        restLines = restLines.slice(0, -1);
      }

      let cta = '';
      if (restLines.length > 0 && restLines[restLines.length - 1].endsWith('?')) {
        cta = restLines[restLines.length - 1];
        restLines = restLines.slice(0, -1);
      }

      return {
        tone:       clean(v.tone) || 'Professional',
        subject:    sanitizeSubject(v.subject),
        greeting:   greeting || 'Hi there,',
        paragraphs: restLines.filter(Boolean),
        cta,
        signOff,
        senderName: senderName || userName || '',
        approach:   ''
      };
    }

    return null;
  }

  // ── HTML building ──────────────────────────────────────────────────────
  /**
   * Build semantic email HTML from a structured variant.
   * Each field is individually escaped — no HTML injection possible.
   */
  function variantToHtml(variant) {
    if (!variant) return '';
    const parts = [];

    if (variant.greeting) {
      parts.push(`<div class="ce-email-greeting">${escapeHtml(variant.greeting)}</div>`);
    }
    (variant.paragraphs || []).forEach(para => {
      if (para && para.trim()) {
        parts.push(`<p class="ce-email-paragraph">${escapeHtml(para.trim())}</p>`);
      }
    });
    if (variant.cta && variant.cta.trim()) {
      parts.push(`<p class="ce-email-paragraph ce-email-cta">${escapeHtml(variant.cta.trim())}</p>`);
    }

    const signOff    = variant.signOff || 'Best,';
    const senderName = state.brief.senderName || variant.senderName || '';
    parts.push(`<div class="ce-email-signature">${escapeHtml(signOff)}<br>${escapeHtml(senderName)}</div>`);

    return parts.join('');
  }

  /** Build semantic email HTML from plain text (used after AI action). */
  function plainTextToHtml(text) {
    if (!text) return '';
    // Detect greeting on first non-empty line
    const lines = text.split('\n');
    let idx = 0;
    let html = '';

    // Greeting
    const firstNonEmpty = lines.findIndex(l => l.trim());
    if (firstNonEmpty >= 0 && /^(hi|hello|dear)\b/i.test(lines[firstNonEmpty].trim())) {
      html += `<div class="ce-email-greeting">${escapeHtml(lines[firstNonEmpty].trim())}</div>`;
      idx = firstNonEmpty + 1;
    }

    // Paragraphs (split on blank lines)
    const remaining = lines.slice(idx).join('\n');
    const paras = remaining.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

    paras.forEach(para => {
      html += `<p class="ce-email-paragraph">${escapeHtml(para.replace(/\n/g, ' '))}</p>`;
    });

    return html;
  }

  /** Extract plain text from semantic email HTML. */
  function htmlToPlainText(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    let result = '';

    div.childNodes.forEach(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag  = node.tagName.toLowerCase();
      const text = (node.textContent || '').trim();
      if (!text) return;

      if (tag === 'div') {
        // Greeting or signature
        const inner = node.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        const tmp = document.createElement('div');
        tmp.innerHTML = inner;
        result += (tmp.textContent || '').trim() + '\n';
      } else if (tag === 'p') {
        node.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        result += (node.textContent || '').trim() + '\n\n';
      }
    });

    if (!result.trim()) {
      div.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
      div.querySelectorAll('p, div').forEach(el => el.insertAdjacentText('afterend', '\n\n'));
      result = (div.textContent || '').trim();
    }

    return result.trim();
  }

  // ── Sanitization helpers ───────────────────────────────────────────────
  function sanitizeClientField(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<[^>]{0,200}>/g, '')
      .replace(/&amp;/g,  '&')
      .replace(/&lt;/g,   '<')
      .replace(/&gt;/g,   '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g,  "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/\[object Object\]/gi, '')
      .replace(/\bundefined\b/g, '')
      .replace(/\bnull\b/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

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
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g,  '&')
      .replace(/&lt;/g,   '<')
      .replace(/&gt;/g,   '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g,  "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/\[object Object\]/gi, '')
      .replace(/\bundefined\b/g, '')
      .replace(/\bnull\b/g, '');

    const resumeHeaders = /^(education|skills|work experience|experience|summary|certifications|languages|references)\s*:?\s*$/gim;
    clean = clean.replace(resumeHeaders, '');
    clean = clean.replace(/\n{3,}/g, '\n\n');
    return clean.trim();
  }

  function finalSanitize(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]{0,200}>/g, '')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, ' ')
      .replace(/\[object Object\]/gi, '')
      .replace(/\bundefined\b/g, '')
      .trim();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#39;');
  }

  // ── Boot ───────────────────────────────────────────────────────────────
  init();
})();
