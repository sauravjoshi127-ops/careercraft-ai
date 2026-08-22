/**
 * cold-email.js
 * Cold Email generation and editing controller logic, unified with Cover Letter UI.
 * Architecture: Unidirectional data flow from state -> UI, explicit cancellation.
 */
(function () {
  let client = null;
  let currentUser = null;
  
  // -- Architecture: Single Source of Truth --
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
      length: 'Short',
      ctaStyle: 'Soft Ask'
    },
    generation: {
      status: 'idle', // 'idle' | 'generating' | 'error'
      controller: null,
      requestId: 0,
      copilotRequestId: 0,
      error: null
    },
    data: {
      variants: [],
      subjectLines: [],
      evaluation: null,
      suggestions: [],
      followUps: [],
      activeVariantIndex: 0
    },
    editor: {
      subject: '',
      body: ''
    }
  };

  let savedResumes = [];
  let debounceTimer = null;
  let autosaveTimer = null;
  
  const STEP_ORDER = ['recipient', 'company', 'value', 'goal'];

  async function init() {
    try {
      await window.appSdk.ready;
      if (!window.AuthManager) return;
      const session = await window.AuthManager.requireAuth();
      if (!session) return;
      client = window.appSdk.client;
      currentUser = session.user;

      await loadSavedResumesDropdown();
      setupUI();
      setupEditorToolbar();
      await hydrateState();
      
      // Global attachment for inline onclick handlers in HTML
      window.toggleStepAccordion = toggleStepAccordion;
      window.triggerAiAction = triggerAiAction;
      window.rejectAiAction = rejectAiAction;
      window.applyAiAction = applyAiAction;
      
    } catch (err) {
      console.error('Initialization error:', err);
      showToast('System initialization error', true);
    }
  }

  async function hydrateState() {
      if (window.StorageManager) {
          const saved = window.StorageManager.get('careercraft_cold_email_draft');
          if (saved) {
              try {
                  const parsed = JSON.parse(saved);
                  state = { ...state, ...parsed };
                  syncDOMFromState();
                  if (state.data.variants.length > 0) {
                      renderWorkspace();
                  }
              } catch(e) { console.warn("Failed to hydrate draft", e); }
          }
      }
  }

  function saveDraftToStorage() {
      if (window.StorageManager) {
          window.StorageManager.set('careercraft_cold_email_draft', JSON.stringify(state));
      }
  }

  function showToast(msg, isError = false) {
    if (window.appSdk && window.appSdk.ui && typeof window.appSdk.ui.showToast === 'function') {
      window.appSdk.ui.showToast(msg, isError ? 'error' : 'success');
    } else if (window.LayoutManager && typeof window.LayoutManager.showToast === 'function') {
      window.LayoutManager.showToast(msg, isError ? 'error' : 'success');
    }
  }

  // --- Accordion Logic ---
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

  // --- Resume Integration ---
  // Queries the canonical `resumes` Supabase table (same table used by resume.js,
  // cover-letter.js and dashboard-manager.js). No separate storage system.
  async function loadSavedResumesDropdown() {
    const container = document.getElementById('resumeImportActionContainer');
    if (!container) return;
    
    const fileInput = document.getElementById('resumeFileInput');
    if (fileInput && !fileInput.hasAttribute('data-bound')) {
      fileInput.setAttribute('data-bound', 'true');
      fileInput.addEventListener('change', handleComputerImport);
    }

    try {
      const { data, error } = await client.from('resumes')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      savedResumes = data || [];
      
      let html = '';

      if (savedResumes.length === 0) {
        // Empty state: no resumes saved yet
        html += `
          <span style="font-size: 0.9rem; color: var(--text-3);">
            No saved resumes found.
            <a href="resume.html" style="color: var(--accent); text-decoration: none; margin-left: 4px;">Build your resume →</a>
          </span>
        `;
      } else if (savedResumes.length === 1) {
        // Single resume: show a direct-action button
        html += `
          <button type="button" class="btn btn-secondary btn-sm" id="btnUseResume" data-resume-id="${savedResumes[0].id}">
            <i data-lucide="file-text" width="16" height="16" style="margin-right:6px;"></i>
            Use My Resume
          </button>
        `;
      } else {
        // Multiple resumes: show a select dropdown + action button (mirrors cover-letter.js pattern)
        html += `
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <select id="savedResumeSelect" style="
              background: var(--input-bg, rgba(255,255,255,0.05));
              border: 1px solid var(--border);
              border-radius: var(--radius-sm);
              color: var(--text-1);
              font-size: 0.85rem;
              padding: 6px 10px;
              max-width: 220px;
              cursor: pointer;
            ">
              <option value="">— Select a Resume —</option>
        `;
        savedResumes.forEach(r => {
          const label = r.full_name
            ? `${r.full_name}${r.professional_headline ? ' · ' + r.professional_headline.substring(0, 30) : ''}`
            : ('Resume – ' + new Date(r.created_at).toLocaleDateString());
          html += `<option value="${r.id}">${label}</option>`;
        });
        html += `
            </select>
            <button type="button" class="btn btn-secondary btn-sm" id="btnUseResume">
              <i data-lucide="file-text" width="16" height="16" style="margin-right:6px;"></i>
              Use Resume
            </button>
          </div>
        `;
      }

      html += `
        <button type="button" class="btn btn-secondary btn-sm" id="btnImportResume">
          <i data-lucide="upload" width="16" height="16" style="margin-right:6px;"></i> Import Resume
        </button>
      `;

      container.innerHTML = html;

      const useBtn = document.getElementById('btnUseResume');
      if (useBtn) {
        useBtn.addEventListener('click', handleUseMyResume);
      }
      document.getElementById('btnImportResume').addEventListener('click', () => {
        document.getElementById('resumeFileInput').click();
      });

      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      console.error('[ColdEmail] Failed to load saved resumes:', err);
      // Non-fatal: show import-from-file option only
      const container = document.getElementById('resumeImportActionContainer');
      if (container) {
        container.innerHTML = `
          <span style="font-size: 0.9rem; color: var(--text-3);">Could not load saved resumes. Use Import Resume below.</span>
          <button type="button" class="btn btn-secondary btn-sm" id="btnImportResume">
            <i data-lucide="upload" width="16" height="16" style="margin-right:6px;"></i> Import Resume
          </button>
        `;
        const fb = document.getElementById('btnImportResume');
        if (fb) fb.addEventListener('click', () => document.getElementById('resumeFileInput').click());
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  async function handleComputerImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const backgroundInput = document.getElementById('background');
    if ((backgroundInput.value || '').trim().length > 0) {
        const confirmed = confirm("Replace your current value proposition with information from this resume?");
        if (!confirmed) {
            e.target.value = '';
            return;
        }
    }

    const btn = document.getElementById('btnImportResume');
    const originalText = btn.innerHTML;
    const originalWidth = btn.offsetWidth;
    
    btn.style.width = originalWidth + 'px';
    btn.innerHTML = `<i data-lucide="loader-2" class="spin" width="16" height="16" style="margin-right:6px;"></i> Reading Resume...`;
    btn.disabled = true;
    if (window.lucide) window.lucide.createIcons();

    try {
        // Uses the shared appSdk.resume.uploadAndParse pipeline (upload-resume handler)
        const extractedText = await window.appSdk.resume.uploadAndParse(file);
        
        const session = await window.appSdk.auth.getSession();
        const token = session?.access_token;
        const response = await fetch('/api/ai-suggestions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                section: 'cold-email-extract',
                content: extractedText
            })
        });

        if (!response.ok) throw new Error('Failed to generate value proposition');
        const data = await response.json();
        
        let extractedData = {};
        try {
            const raw = (data.suggestions || '').replace(/```json/gi, '').replace(/```/g, '').trim();
            extractedData = JSON.parse(raw);
        } catch (parseErr) {
            console.warn('[ResumeImport] JSON parse failed, falling back to raw text', parseErr);
            extractedData = { valueProposition: data.suggestions };
        }
        
        if (!extractedData.valueProposition) {
            throw new Error('No value proposition could be extracted from this resume.');
        }

        backgroundInput.value = extractedData.valueProposition;
        
        const nameInput = document.getElementById('userName');
        if (!(nameInput.value || '').trim() && extractedData.name) {
            nameInput.value = extractedData.name;
        }
        
        trackProgress();
        showToast("Resume imported successfully.", false);
    } catch (err) {
        console.error('[ResumeImport Error]', err);
        showToast("We couldn't import this resume right now. Please try again.", true);
    } finally {
        btn.innerHTML = originalText;
        btn.style.width = '';
        btn.disabled = false;
        e.target.value = ''; // reset file input
        if (window.lucide) window.lucide.createIcons();
    }
  }

  async function handleUseMyResume() {
    if (!savedResumes || savedResumes.length === 0) return;

    // Resolve which resume the user selected
    // With multiple resumes: read from the select dropdown (mirrors cover-letter.js)
    // With exactly one resume: use it directly (no dropdown exists)
    let resumeData = null;
    const selectEl = document.getElementById('savedResumeSelect');
    if (selectEl) {
      const selectedId = selectEl.value;
      if (!selectedId) {
        showToast('Please select a resume from the dropdown first.', true);
        return;
      }
      resumeData = savedResumes.find(r => r.id === selectedId) || null;
      if (!resumeData) {
        showToast('Selected resume not found. Please try again.', true);
        return;
      }
    } else {
      // Single-resume path: no dropdown, use the only available resume
      resumeData = savedResumes[0];
    }

    if (!resumeData) {
      showToast('No resume data available. Please import a resume from your computer.', true);
      return;
    }
    
    const backgroundInput = document.getElementById('background');
    if ((backgroundInput.value || '').trim().length > 0) {
        const confirmed = confirm('Replace existing content with resume information?');
        if (!confirmed) return;
    }

    const btn = document.getElementById('btnUseResume');
    const originalText = btn.innerHTML;
    const originalWidth = btn.offsetWidth;
    
    btn.style.width = originalWidth + 'px';
    btn.innerHTML = `<i data-lucide="loader-2" class="spin" width="16" height="16" style="margin-right:6px;"></i> Loading...`;
    btn.disabled = true;
    if (window.lucide) window.lucide.createIcons();

    try {
        // Pre-populate name immediately — no need to wait for AI
        const nameInput = document.getElementById('userName');
        if (!(nameInput.value || '').trim() && resumeData.full_name) {
            nameInput.value = resumeData.full_name;
        }

        // Reuse the same AI endpoint (cold-email-value) already used in this file
        // to convert structured resume data into a cold-email value proposition paragraph
        const session = await window.appSdk.auth.getSession();
        const token = session?.access_token;
        const response = await fetch('/api/ai-suggestions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                section: 'cold-email-value',
                resumeData: resumeData
            })
        });

        if (!response.ok) throw new Error('Failed to extract value proposition from resume');
        const data = await response.json();

        if (!data.suggestions) {
            throw new Error('No content could be generated from this resume.');
        }
        
        backgroundInput.value = data.suggestions;
        trackProgress();
        showToast('Resume imported successfully.', false);
    } catch (err) {
        console.error('[UseMyResume Error]', err);
        showToast("Couldn't import your resume. You can enter your background manually.", true);
    } finally {
        btn.innerHTML = originalText;
        btn.style.width = '';
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
    }
  }

  // --- UI Setup ---
  function setupUI() {
    // Mode toggling
    const modeGuided = document.getElementById('modeGuided');
    const modeQuick = document.getElementById('modeQuick');
    const advOptions = document.getElementById('advancedOptions');
    const relGroup = document.getElementById('relationshipGroup');
    const ctxGroup = document.getElementById('companyContextGroup');
    
    if (modeGuided && modeQuick) {
        modeGuided.addEventListener('click', () => {
            modeGuided.classList.replace('btn-secondary', 'btn-primary');
            modeGuided.style.background = '';
            modeQuick.classList.replace('btn-primary', 'btn-secondary');
            modeQuick.style.background = 'transparent';
            modeQuick.style.border = 'none';
            
            if (advOptions) advOptions.style.display = 'block';
            if (relGroup) relGroup.style.display = 'block';
            if (ctxGroup) ctxGroup.style.display = 'block';
        });
        
        modeQuick.addEventListener('click', () => {
            modeQuick.classList.replace('btn-secondary', 'btn-primary');
            modeQuick.style.background = '';
            modeGuided.classList.replace('btn-primary', 'btn-secondary');
            modeGuided.style.background = 'transparent';
            modeGuided.style.border = 'none';
            
            if (advOptions) advOptions.style.display = 'none';
            if (relGroup) relGroup.style.display = 'none';
            if (ctxGroup) ctxGroup.style.display = 'none';
        });
    }

    // Goal Grid
    const goals = document.querySelectorAll('.goal-card');
    const goalInput = document.getElementById('emailGoal');
    goals.forEach(g => {
        g.addEventListener('click', () => {
            goals.forEach(c => c.classList.remove('active'));
            g.classList.add('active');
            if (goalInput) goalInput.value = g.dataset.value;
            trackProgress();
        });
    });

    // Input Tracking for Step Badges
    document.querySelectorAll('.cl-left-panel input, .cl-left-panel textarea, .cl-left-panel select').forEach(el => {
        el.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(trackProgress, 300);
        });
    });
    
    // Copy Action
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const text = `Subject: ${state.editor.subject}\n\n${state.editor.body}`;
            if (!text || text.trim() === 'Subject:') return;
            try {
                if (window.appSdk && window.appSdk.ui && typeof window.appSdk.ui.copyToClipboard === 'function') {
                    window.appSdk.ui.copyToClipboard(text, 'Copied to clipboard!');
                } else {
                    await navigator.clipboard.writeText(text);
                    showToast('Copied to clipboard!');
                }
            } catch(e) {
                showToast('Failed to copy', true);
            }
        });
    }

    // Save Draft Action
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', async () => {
            saveDraftToStorage();
            showToast('Draft saved successfully.');
        });
    }

    // Generate Action
    const genBtn = document.getElementById('generateBtn');
    if (genBtn) genBtn.addEventListener('click', handleGenerate);
    
    // Editor Input
    const editorSheet = document.getElementById('editorSheet');
    if (editorSheet) {
        editorSheet.addEventListener('input', () => {
            state.editor.body = editorSheet.innerText;
            clearTimeout(autosaveTimer);
            autosaveTimer = setTimeout(() => {
                saveDraftToStorage();
                const label = document.getElementById('autosaveLabel');
                if (label) {
                    label.style.opacity = '1';
                    setTimeout(() => label.style.opacity = '0', 2000);
                }
                updateLiveMetrics();
            }, 1000);
        });
    }
  }

  function syncStateFromInputs() {
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? (el.value || '').trim() : '';
    };
    
    state.brief.recipientName = getVal('recipientName');
    state.brief.position = getVal('position');
    state.brief.relationship = getVal('relationship');
    state.brief.companyName = getVal('companyName');
    state.brief.companyContext = getVal('companyContext');
    state.brief.userName = getVal('userName');
    state.brief.background = getVal('background');
    state.brief.emailGoal = getVal('emailGoal');
    state.brief.tone = getVal('tone');
    state.brief.length = getVal('length');
    state.brief.ctaStyle = getVal('ctaStyle');
  }

  function syncDOMFromState() {
      const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.value = val || '';
      };
      
      setVal('recipientName', state.brief.recipientName);
      setVal('position', state.brief.position);
      setVal('relationship', state.brief.relationship);
      setVal('companyName', state.brief.companyName);
      setVal('companyContext', state.brief.companyContext);
      setVal('userName', state.brief.userName);
      setVal('background', state.brief.background);
      setVal('emailGoal', state.brief.emailGoal);
      setVal('tone', state.brief.tone);
      setVal('length', state.brief.length);
      setVal('ctaStyle', state.brief.ctaStyle);
      
      const goals = document.querySelectorAll('.goal-card');
      goals.forEach(g => {
          g.classList.toggle('active', g.dataset.value === state.brief.emailGoal);
      });
      
      trackProgress();
  }

  function trackProgress() {
    syncStateFromInputs();
    
    updateBadge('status-1', state.brief.position ? 'Complete' : 'In progress', !!state.brief.position);
    updateBadge('status-2', state.brief.companyName ? 'Complete' : 'Not started', !!state.brief.companyName);
    
    const hasValue = state.brief.userName && state.brief.background;
    updateBadge('status-3', hasValue ? 'Complete' : 'Not started', !!hasValue);
    updateBadge('status-4', state.brief.emailGoal ? 'Complete' : 'Not started', !!state.brief.emailGoal);
  }

  function updateBadge(id, text, isComplete) {
    const badge = document.getElementById(id);
    if (!badge) return;
    badge.textContent = text;
    if (isComplete) {
        badge.style.background = 'rgba(16, 185, 129, 0.1)';
        badge.style.color = 'var(--success)';
    } else {
        badge.style.background = '';
        badge.style.color = '';
    }
  }

  async function handleGenerate() {
    syncStateFromInputs();
    
    if(!state.brief.companyName || !state.brief.position || !state.brief.userName || !state.brief.background) {
        showToast('Please complete all required fields.', true);
        toggleStepAccordion( !state.brief.position ? 'recipient' : (!state.brief.companyName ? 'company' : 'value') );
        return;
    }
    
    // Abort previous generation if any
    if (state.generation.controller) {
        state.generation.controller.abort();
    }
    
    state.generation.controller = new AbortController();
    state.generation.requestId += 1;
    const currentReqId = state.generation.requestId;
    
    state.generation.status = 'generating';
    const btn = document.getElementById('generateBtn');
    if (btn) {
        btn.innerHTML = `<i data-lucide="loader-circle" class="spin" width="16"></i> Generating...`;
        btn.disabled = true;
    }
    if (window.lucide) lucide.createIcons();

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
            signal: state.generation.controller.signal
        });
        
        const data = await res.json();
        
        if (currentReqId !== state.generation.requestId) {
            console.log("Stale request aborted implicitly.");
            return; // A newer request was started
        }
        
        if(!res.ok) throw new Error(data.error || 'Failed to generate email');
        
        // Normalize and update state safely
        state.data.variants = Array.isArray(data.variants) ? data.variants : [];
        state.data.subjectLines = Array.isArray(data.subjectLines) ? data.subjectLines : [];
        state.data.evaluation = data.evaluation || null;
        state.data.suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        
        if (state.data.variants.length > 0) {
            const activeVariant = state.data.variants[0];
            state.editor.subject = (activeVariant.subject || '').replace(/subject:/i, '').trim();
            state.editor.body = (activeVariant.body || '').trim();
            state.data.activeVariantIndex = 0;
            saveDraftToStorage();
            renderWorkspace();
        } else {
            throw new Error("No variants generated.");
        }
        
    } catch(e) {
        if (e.name === 'AbortError') {
            console.log('Generation aborted by user.');
        } else {
            console.error(e);
            showToast(e.message, true);
        }
    } finally {
        if (currentReqId === state.generation.requestId) {
            state.generation.status = 'idle';
            state.generation.controller = null;
            if (btn) {
                btn.innerHTML = `Generate Email <i data-lucide="sparkles" width="16"></i>`;
                btn.disabled = false;
            }
            if (window.lucide) lucide.createIcons();
        }
    }
  }

  // --- Rendering UI based on State ---
  function renderWorkspace() {
    if (state.data.variants.length === 0) return;
    
    // Hide empty states, show real content
    const elEditorEmpty = document.getElementById('editorEmptyState');
    const elEditorDoc = document.getElementById('editorDocumentFrame');
    const elCopilotEmpty = document.getElementById('copilotEmptyState');
    const elCopilotScore = document.getElementById('copilotScoreHeader');
    const elCopilotContent = document.getElementById('copilotContent');
    const elVariantsEmpty = document.getElementById('variantsEmptyState');
    const elVariantsContent = document.getElementById('variantsContent');
    
    if (elEditorEmpty) elEditorEmpty.style.display = 'none';
    if (elEditorDoc) elEditorDoc.style.display = 'flex';
    if (elCopilotEmpty) elCopilotEmpty.style.display = 'none';
    if (elCopilotScore) elCopilotScore.style.display = 'flex';
    if (elCopilotContent) elCopilotContent.style.display = 'block';
    if (elVariantsEmpty) elVariantsEmpty.style.display = 'none';
    if (elVariantsContent) elVariantsContent.style.display = 'block';
    
    // Render Subject Pills
    const subContainer = document.getElementById('subjectContainer');
    if (subContainer) {
        subContainer.innerHTML = '';
        
        let subjectsToRender = [];
        
        if (state.data.subjectLines.length > 0) {
            subjectsToRender = state.data.subjectLines.slice(0, 4).map(s => s.text || s);
        } else {
            // Fallbacks
            subjectsToRender = [
                state.editor.subject || 'Introduction',
                `Quick question regarding ${state.brief.companyName || 'your work'}`,
                `Connecting: ${state.brief.userName || 'Networking'}`
            ];
        }
        
        // Ensure the active editor subject is in the list
        if (!subjectsToRender.includes(state.editor.subject)) {
            subjectsToRender.unshift(state.editor.subject);
            subjectsToRender = subjectsToRender.slice(0, 4);
        }

        subjectsToRender.forEach((txt, i) => {
            const cleanTxt = (txt.text || txt).replace(/subject:/i, '').trim();
            const el = document.createElement('div');
            el.className = 'subject-pill' + (cleanTxt === state.editor.subject ? ' active' : '');
            el.textContent = cleanTxt;
            el.addEventListener('click', () => {
                document.querySelectorAll('.subject-pill').forEach(p => p.classList.remove('active'));
                el.classList.add('active');
                state.editor.subject = cleanTxt;
            });
            subContainer.appendChild(el);
        });
    }
    
    // Editor Content
    const editor = document.getElementById('editorSheet');
    if (editor && editor.innerText !== state.editor.body) {
        editor.innerText = state.editor.body;
    }
    
    updateLiveMetrics();
    
    // Render Variants
    const varCont = document.getElementById('variantsContainer');
    if (varCont) {
        varCont.innerHTML = '';
        // Skip the currently active one
        state.data.variants.forEach((v, index) => {
            if (index === state.data.activeVariantIndex) return;

            const card = document.createElement('div');
            card.className = 'cl-section-card';
            card.style.cssText = 'background:rgba(255,255,255,0.02); display:flex; flex-direction:column;';

            const safeTone    = (v.tone    || `Variant ${index + 1}`).trim();
            const safeSubject = (v.subject || '').replace(/subject:/i, '').trim();
            const safeBody    = (v.body    || '').trim();

            // Approach badge (italic, subdued) — shown if API provided it
            const safeApproach = (v.approach || '').trim();

            // Estimate body length to decide if we need capped scroll
            // (>400 chars is roughly 60+ words — cap at max-height with internal scroll)
            const bodyWordCount = safeBody ? safeBody.split(/\s+/).filter(Boolean).length : 0;
            const bodyStyle = bodyWordCount > 120
                ? 'overflow-y:auto; max-height:340px;'   // long email — scrollable
                : 'overflow:visible;';                   // short/normal — grows naturally

            // Tone badge colour mapping
            const toneColors = {
                professional: '#6366f1',
                friendly:     '#10b981',
                executive:    '#f59e0b',
                startup:      '#ef4444',
                technical:    '#3b82f6',
                networking:   '#8b5cf6',
            };
            const toneKey = safeTone.toLowerCase();
            const badgeColor = toneColors[toneKey] || 'var(--accent)';

            card.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; gap:8px; flex-wrap:wrap;">
                  <span style="font-weight:700; font-size:0.82rem; color:${badgeColor}; background:${badgeColor}1a; padding:2px 8px; border-radius:10px; white-space:nowrap;">${safeTone}</span>
                  <span style="font-size:0.75rem; color:var(--text-3); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${safeSubject}">Subj: ${safeSubject}</span>
                </div>
                ${safeApproach ? `<div style="font-size:0.72rem; color:var(--text-3); font-style:italic; margin-bottom:8px; line-height:1.4;">${safeApproach}</div>` : ''}
                <div class="variant-body-scroll" style="font-size:0.85rem; color:var(--text-2); white-space:pre-wrap; line-height:1.65; flex:1; ${bodyStyle} padding-right:2px;">${safeBody}</div>
                <button class="btn btn-secondary btn-sm variant-use-btn" style="margin-top:14px; width:100%; flex-shrink:0;">Use this version</button>
            `;

            const btn = card.querySelector('.variant-use-btn');
            btn.addEventListener('click', () => {
                state.data.activeVariantIndex = index;
                state.editor.subject = safeSubject;
                state.editor.body    = safeBody;
                saveDraftToStorage();
                renderWorkspace();
            });

            varCont.appendChild(card);
        });
    }

    // Render Follow-ups
    const folCont = document.getElementById('followUpsContainer');
    if (folCont) {
        const recip = state.brief.recipientName || 'there';
        const comp = state.brief.companyName || 'your team';
        folCont.innerHTML = `
            <div class="cl-section-card" style="background:rgba(255,255,255,0.02);">
                <div style="font-weight:600; margin-bottom:4px; font-size:0.85rem; color:var(--text-1);">Follow-up 1 <span style="font-weight:400; font-size:0.75rem; color:var(--text-3); float:right;">3-5 business days</span></div>
                <div style="font-size:0.85rem; color:var(--text-2); margin-top:8px;">Hi ${recip},\n\nJust floating this to the top of your inbox. I know things are busy at ${comp}. Let me know if you have a moment to connect.</div>
            </div>
            <div class="cl-section-card" style="background:rgba(255,255,255,0.02);">
                <div style="font-weight:600; margin-bottom:4px; font-size:0.85rem; color:var(--text-1);">Final Follow-up <span style="font-weight:400; font-size:0.75rem; color:var(--text-3); float:right;">7-10 business days</span></div>
                <div style="font-size:0.85rem; color:var(--text-2); margin-top:8px;">Hi ${recip},\n\nI won't follow up again as I assume priorities are elsewhere right now. I'll keep following ${comp}'s progress!</div>
            </div>
        `;
    }
    
    // Render Copilot Evaluation Score
    if (state.data.evaluation) {
       const scoreEl = document.getElementById('copilotOverallScore');
       if (scoreEl) {
           const score = state.data.evaluation.overallScore || 0;
           let iconHtml = '';
           let color = '';
           let label = '';
           
           if (score >= 90) { color = 'var(--success)'; iconHtml = '<i data-lucide="check-circle" style="color:'+color+';" width="28"></i>'; label = 'Strong'; }
           else if (score >= 75) { color = 'var(--warning)'; iconHtml = '<i data-lucide="alert-circle" style="color:'+color+';" width="28"></i>'; label = 'Good'; }
           else { color = 'var(--danger)'; iconHtml = '<i data-lucide="x-circle" style="color:'+color+';" width="28"></i>'; label = 'Needs Work'; }
           
           scoreEl.innerHTML = iconHtml;
           
           const lblEl = document.querySelector('.cl-copilot-overall-label');
           if (lblEl) {
               lblEl.textContent = label;
               lblEl.style.color = color;
           }
       }
    }
    
    if (window.lucide) window.lucide.createIcons();
  }
  
  function updateLiveMetrics() {
    const text = state.editor.body || '';
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).filter(Boolean).length;
    
    const elWord = document.getElementById('wordCount');
    const elChar = document.getElementById('charCount');
    const elRead = document.getElementById('readTime');
    
    if (elWord) elWord.textContent = words;
    if (elChar) elChar.textContent = text.length;
    if (elRead) elRead.textContent = Math.ceil(words / 200) + 'm';
  }

  function normalizeEmailText(text) {
      if (!text) return '';
      return text.trim().replace(/\s+/g, ' ');
  }

  function escapeHTML(str) {
      return str.replace(/[&<>'"]/g, 
          tag => ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              "'": '&#39;',
              '"': '&quot;'
          }[tag] || tag)
      );
  }

  function renderWordDiff(oldText, newText) {
      const oldWords = oldText.split(/(\s+)/);
      const newWords = newText.split(/(\s+)/);
      
      let start = 0;
      while (start < oldWords.length && start < newWords.length && oldWords[start] === newWords[start]) {
          start++;
      }
      let oldEnd = oldWords.length - 1;
      let newEnd = newWords.length - 1;
      while (oldEnd >= start && newEnd >= start && oldWords[oldEnd] === newWords[newEnd]) {
          oldEnd--;
          newEnd--;
      }
      
      const prefix = oldWords.slice(0, start).join('');
      const suffix = oldWords.slice(oldEnd + 1).join('');
      const removed = oldWords.slice(start, oldEnd + 1).join('');
      const added = newWords.slice(start, newEnd + 1).join('');
      
      let html = '<span>' + escapeHTML(prefix) + '</span>';
      if (removed) html += '<span class="diff-del" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; text-decoration: line-through;">' + escapeHTML(removed) + '</span>';
      if (added) html += '<span class="diff-ins" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">' + escapeHTML(added) + '</span>';
      html += '<span>' + escapeHTML(suffix) + '</span>';
      return html;
  }

  // --- AI Actions ---
  async function triggerAiAction(action) {
    const orig = state.editor.body || '';
    if (!orig) {
        showToast("Please generate an email first.", true);
        return;
    }
    
    // Disable buttons
    document.querySelectorAll('.cl-action-card').forEach(btn => btn.disabled = true);
    
    state.generation.copilotRequestId = (state.generation.copilotRequestId || 0) + 1;
    const currentReqId = state.generation.copilotRequestId;
    
    const diffView = document.getElementById('aiDiffView');
    const diffOrig = document.getElementById('diffOrig');
    const diffSug = document.getElementById('diffSug');
    
    if (diffOrig) diffOrig.style.display = 'none'; // We'll combine the diff in diffSug
    if (diffSug) {
        diffSug.style.color = 'var(--text-1)';
        diffSug.style.whiteSpace = 'pre-wrap';
        diffSug.innerHTML = `<i data-lucide="loader-2" class="spin" width="16" style="margin-right:8px;"></i> Improving your email...`;
    }
    if (diffView) diffView.style.display = 'block';
    if (window.lucide) lucide.createIcons();
    
    const payload = {
        action: 'optimize',
        emailGoal: state.brief.emailGoal,
        emailBody: orig,
        feedback: `Action: ${action}. Please optimize this email body accordingly.`,
        recipientName: state.brief.recipientName,
        companyName: state.brief.companyName,
        position: state.brief.position,
        userName: state.brief.userName,
        background: state.brief.background,
        whyContacting: state.brief.companyContext || state.brief.relationship
    };
    
    try {
        const session = await window.appSdk.auth.getSession();
        const headers = { 'Content-Type': 'application/json' };
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
        
        const res = await fetch('/api/cold-email', { method: 'POST', headers, body: JSON.stringify(payload) });
        const data = await res.json();
        
        if (currentReqId !== state.generation.copilotRequestId) {
            return; // Stale request
        }
        
        if (!res.ok) throw new Error(data.error || 'Optimization failed');
        
        const proposedText = data.revisedText;
        if (!proposedText || normalizeEmailText(orig) === normalizeEmailText(proposedText)) {
            if (diffSug) diffSug.innerHTML = `<span style="color:var(--warning);">The AI did not produce a meaningful revision. Please try a more specific instruction.</span>`;
            return;
        }
        
        // Store valid suggestion text for applyAiAction to use
        diffSug.dataset.proposedText = proposedText;
        diffSug.innerHTML = renderWordDiff(orig, proposedText);
        
    } catch (e) {
        if (currentReqId === state.generation.copilotRequestId) {
            if (diffSug) diffSug.innerHTML = `<span style="color:var(--danger);">Error applying AI suggestion: ${e.message}</span>`;
        }
    } finally {
        if (currentReqId === state.generation.copilotRequestId) {
            document.querySelectorAll('.cl-action-card').forEach(btn => btn.disabled = false);
        }
    }
  }
  
  function rejectAiAction() {
    const diffView = document.getElementById('aiDiffView');
    if (diffView) diffView.style.display = 'none';
  }
  
  function applyAiAction() {
    const diffSug = document.getElementById('diffSug');
    const diffView = document.getElementById('aiDiffView');
    const editor = document.getElementById('editorSheet');
    
    if (!diffSug || !editor) return;
    
    // Ignore if it's the loading text or error
    if (diffSug.innerHTML.includes('Improving your email...') || diffSug.innerHTML.includes('Error applying') || diffSug.innerHTML.includes('did not produce')) return;
    
    state.editor.body = diffSug.dataset.proposedText || diffSug.innerText;
    editor.innerText = state.editor.body;
    saveDraftToStorage();
    
    if (diffView) diffView.style.display = 'none';
    updateLiveMetrics();
    showToast('AI suggestion applied.');
  }

  // --- Editor Formatting (Standard execCommand) ---
  function setupEditorToolbar() {
    document.querySelectorAll('.cl-toolbar-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const command = btn.getAttribute('data-command');
        if (command) {
            document.execCommand(command, false, null);
            const editor = document.getElementById('editorSheet');
            if (editor) {
                editor.focus();
                // trigger an input event to sync state
                editor.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
      });
    });
  }

  init();
})();
