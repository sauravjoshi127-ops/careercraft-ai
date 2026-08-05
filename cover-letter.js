/**
 * cover-letter.js
 * Cover Letter generation and editing controller logic.
 */
(function () {
  let client = null;
  let currentUser = null;
  let lastGeneratedData = null;
  let isGenerating = false;
  let resumeText = '';
  
  // Editor Undo/Redo stack
  let editorHistory = [];
  let historyIndex = -1;
  let autosaveTimer = null;
  let currentSavedLetterId = null;

  async function init() {
    try {
      await window.appSdk.ready;
      if (!window.AuthManager) return;
      const session = await window.AuthManager.requireAuth();
      if (!session) return;
      client = window.appSdk.client;
      currentUser = session.user;

      await loadSavedResumesDropdown();
      await loadHistory();

      // Initialize empty editor state
      saveEditorState();

      // Drag & drop handlers for resume file upload
      const area = document.getElementById('uploadArea');
      if (area) {
        area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
        area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
        area.addEventListener('drop', e => {
          e.preventDefault();
          area.classList.remove('drag-over');
          const file = e.dataTransfer?.files?.[0];
          if (file) {
            const input = document.getElementById('resumeFile');
            try {
              const dt = new DataTransfer();
              dt.items.add(file);
              input.files = dt.files;
            } catch (_) {}
            handleResumeUpload({ files: [file] });
          }
        });
      }

      wireEvents();

    } catch (err) {
      showToast('error', 'Failed to initialize session: ' + err.message);
    }
  }

  function wireEvents() {
    // Wizard Navigation Tab Switcher
    document.querySelectorAll('#wizardTabs .tab-btn').forEach(btn => {
      const tabId = btn.getAttribute('data-wizard-tab');
      if (tabId) {
        btn.addEventListener('click', () => switchWizardTab(tabId));
      }
    });

    // Next / Back buttons inside the wizard panels
    document.querySelectorAll('.wizard-nav-btn').forEach(btn => {
      const tabId = btn.getAttribute('data-wizard-tab');
      if (tabId) {
        btn.addEventListener('click', () => switchWizardTab(tabId));
      }
    });

    // Editor Workspace Tab Switcher
    document.querySelectorAll('#editorTabs .tab-btn').forEach(btn => {
      const tabId = btn.getAttribute('data-editor-tab');
      if (tabId) {
        btn.addEventListener('click', () => switchEditorTab(tabId));
      }
    });

    // Textareas auto-resize & job description word counts
    document.querySelectorAll('textarea').forEach(textarea => {
      textarea.addEventListener('input', () => autoResizeTextarea(textarea));
      autoResizeTextarea(textarea);
    });

    // Upload area interaction
    const uploadArea = document.getElementById('uploadArea');
    const resumeFileInput = document.getElementById('resumeFile');
    if (uploadArea && resumeFileInput) {
      uploadArea.addEventListener('click', () => resumeFileInput.click());
    }
    if (resumeFileInput) {
      resumeFileInput.addEventListener('change', () => handleResumeUpload(resumeFileInput));
    }
    document.getElementById('clearResumeBtn')?.addEventListener('click', clearResume);

    // Saved resume selection dropdown
    const savedResumeSelect = document.getElementById('savedResumeSelect');
    if (savedResumeSelect) {
      savedResumeSelect.addEventListener('change', () => handleSavedResumeSelect(savedResumeSelect));
    }

    // Generate Cover Letter Action
    document.getElementById('generateBtn')?.addEventListener('click', generateCoverLetter);

    // Editor Toolbar actions
    document.querySelectorAll('.cl-editor-toolbar-sticky .cl-toolbar-btn').forEach(btn => {
      const cmd = btn.getAttribute('data-command');
      if (cmd) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const val = btn.getAttribute('data-value');
          executeEditorCommand(cmd, val);
          updateToolbarState();
        });
      }
    });

    // Bottom Editor Action buttons
    document.getElementById('saveLetterBtn')?.addEventListener('click', saveOrUpdateCoverLetter);
    document.getElementById('downloadPdfBtn')?.addEventListener('click', downloadPDF);
    document.getElementById('downloadDocxBtn')?.addEventListener('click', downloadDOCX);
    document.getElementById('copyTextBtn')?.addEventListener('click', handleCopyCoverLetter);

    // History controls (Search, Sort, Filter)
    document.getElementById('historySearch')?.addEventListener('input', handleHistorySearch);
    document.getElementById('historySort')?.addEventListener('change', handleHistorySort);
    document.getElementById('historyFilter')?.addEventListener('change', handleHistoryFilter);

    // Accessibility shortcuts
    window.addEventListener('keydown', (e) => {
      const activeSheet = document.getElementById('editorSheet');
      if (document.activeElement === activeSheet ||
          document.activeElement.tagName === 'TEXTAREA' ||
          (document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text')) {
        if (e.altKey && e.key === 'ArrowRight') {
          e.preventDefault();
          navigateToNextWizardStep();
        } else if (e.altKey && e.key === 'ArrowLeft') {
          e.preventDefault();
          navigateToPrevWizardStep();
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        navigateToNextWizardStep();
      } else if (e.key === 'ArrowLeft') {
        navigateToPrevWizardStep();
      }
    });

    // Bind editor inputs
    const editorSheet = document.getElementById('editorSheet');
    if (editorSheet) {
      // Fix: intercept Ctrl+Z/Y before the browser acts, routing to our own undo stack
      editorSheet.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
          e.preventDefault();
          executeEditorCommand('undo');
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
          e.preventDefault();
          executeEditorCommand('redo');
        }
      });
      editorSheet.addEventListener('input', handleEditorInput);
      editorSheet.addEventListener('keyup', updateToolbarState);
      editorSheet.addEventListener('mouseup', updateToolbarState);
    }
    
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === document.getElementById('editorSheet')) {
        updateToolbarState();
      }
    });
    // Accessibility: make accordion step headers keyboard-navigable
    document.querySelectorAll('.cl-step-header[role="button"]').forEach(header => {
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          header.click();
        }
      });
    });
  }

  let _toolbarStateTimeout = null;
  function updateToolbarState() {
    if (_toolbarStateTimeout) cancelAnimationFrame(_toolbarStateTimeout);
    _toolbarStateTimeout = requestAnimationFrame(() => {
      const commands = ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight'];
      commands.forEach(cmd => {
        try {
          const state = document.queryCommandState(cmd);
          const btn = document.querySelector(`.cl-toolbar-btn[data-command="${cmd}"]`);
          if (btn) btn.classList.toggle('active', state);
        } catch (e) {} // Ignore unsupported commands
      });

      try {
        const block = document.queryCommandValue('formatBlock');
        const h3Btn = document.querySelector(`.cl-toolbar-btn[data-command="formatBlock"][data-value="H3"]`);
        const quoteBtn = document.querySelector(`.cl-toolbar-btn[data-command="formatBlock"][data-value="BLOCKQUOTE"]`);
        
        if (h3Btn) h3Btn.classList.toggle('active', block && block.toLowerCase() === 'h3');
        if (quoteBtn) quoteBtn.classList.toggle('active', block && block.toLowerCase() === 'blockquote');
      } catch (e) {}
    });
  }

  function navigateToNextWizardStep() {
    const order = ['jobInfo', 'resumeTab', 'writerSettings', 'optimizerTab'];
    const currentIndex = order.indexOf(activeWizardTabId);
    if (currentIndex !== -1 && currentIndex < order.length - 1) {
      switchWizardTab(order[currentIndex + 1]);
    }
  }

  function navigateToPrevWizardStep() {
    const order = ['jobInfo', 'resumeTab', 'writerSettings', 'optimizerTab'];
    const currentIndex = order.indexOf(activeWizardTabId);
    if (currentIndex !== -1 && currentIndex > 0) {
      switchWizardTab(order[currentIndex - 1]);
    }
  }

  let activeWizardTabId = 'jobInfo';

  function validateJobInfoStep() {
    let hasErr = false;
    const fields = ['jobTitle', 'companyName', 'jobDescription'];
    fields.forEach(f => {
      const val = document.getElementById(f).value.trim();
      const errEl = document.getElementById(`err-${f}`);
      if (!val) {
        errEl.style.display = 'block';
        hasErr = true;
      } else {
        errEl.style.display = 'none';
      }
    });
    return !hasErr;
  }

  function switchWizardTab(tabId) {
    if (activeWizardTabId === 'jobInfo' && tabId !== 'jobInfo') {
      if (!validateJobInfoStep()) {
        showToast('error', 'Please fill in all required fields marked with *');
        return;
      }
    }

    activeWizardTabId = tabId;

    document.querySelectorAll('#wizardTabs .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-wizard-tab') === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      if (pane.id.startsWith('pane-') && !pane.id.includes('Pane')) {
        pane.classList.toggle('active', pane.id === `pane-${tabId}`);
      }
    });

    const progressMap = {
      'jobInfo': '25%',
      'resumeTab': '50%',
      'writerSettings': '75%',
      'optimizerTab': '100%'
    };
    const bar = document.getElementById('wizardProgressBar');
    if (bar && progressMap[tabId]) {
      bar.style.width = progressMap[tabId];
    }
  }

  function switchEditorTab(tabId) {
    document.querySelectorAll('#editorTabs .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-editor-tab') === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      if (pane.id.startsWith('pane-') && pane.id.endsWith('Pane')) {
        pane.classList.toggle('active', pane.id === `pane-${tabId}`);
      }
    });
  }

  // Use RAF to prevent forced synchronous reflow on every keystroke.
  // requestAnimationFrame batches the height read+write into the browser's
  // next paint cycle, eliminating layout thrashing in the wizard form.
  const _resizeQueue = new Set();
  let _resizeRafActive = false;

  function processResizes() {
    // Read phase: capture all scrollHeights first to prevent layout thrashing
    const metrics = new Map();
    for (const textarea of _resizeQueue) {
      textarea.style.height = 'auto'; // Temporarily reset to auto to calculate true scrollHeight
      metrics.set(textarea, textarea.scrollHeight);
    }

    // Write phase: apply new heights
    for (const [textarea, scrollHeight] of metrics) {
      textarea.style.height = scrollHeight + 'px';

      if (textarea.id === 'jobDescription') {
        const words = textarea.value.trim().split(/\s+/).filter(Boolean).length;
        const el = document.getElementById('jdWordCount');
        if (el) el.textContent = `${words} words`;
      }
    }

    _resizeQueue.clear();
    _resizeRafActive = false;
  }

  function autoResizeTextarea(textarea) {
    _resizeQueue.add(textarea);
    if (!_resizeRafActive) {
      _resizeRafActive = true;
      requestAnimationFrame(processResizes);
    }
  }

  function showToast(type, message) {
    if (window.LayoutManager && typeof window.LayoutManager.showToast === 'function') {
      window.LayoutManager.showToast(message, type);
    } else {
      const container = document.getElementById('alertContainer');
      if (!container) return;
      const toast = document.createElement('div');
      toast.className = `toast-alert toast-${type}`;
      toast.innerHTML = `<span>${type === 'success' ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="icon-svg" style="color:#10b981; display:inline-block; vertical-align:middle; margin-right:6px;"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="icon-svg" style="color:#ef4444; display:inline-block; vertical-align:middle; margin-right:6px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'}</span><span>${message}</span>`;
      container.appendChild(toast);
      
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 5000);
    }
  }

  // ── Editor Performance Architecture ──
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function animateMetricChange(el, newVal) {
    if (el.textContent != newVal) {
      el.textContent = newVal;
      if (el.animate) {
        el.animate([
          { opacity: 0.3, transform: 'scale(0.96)' },
          { opacity: 1, transform: 'scale(1)' }
        ], { duration: 300, easing: 'ease-out' });
      } else {
        // Fallback for older browsers
        el.classList.remove('metric-changed');
        requestAnimationFrame(() => el.classList.add('metric-changed'));
      }
    }
  }

  let _basicMetricsRaf = null;
  function updateBasicMetrics() {
    if (_basicMetricsRaf) return;
    _basicMetricsRaf = requestAnimationFrame(() => {
      _basicMetricsRaf = null;
      const sheet = document.getElementById('editorSheet');
      const canvas = document.getElementById('editorCanvas');
      if (!sheet) return;

      const text = sheet.innerText || '';
      const cleanText = text.trim();
      const isEmpty = !cleanText || cleanText.startsWith('Your generated cover letter will appear here.');

      // ── Exclusive state toggle via CSS class ──
      // .cl-has-draft shows the document frame, hides the empty state.
      // Without the class, the empty state shows and the frame is hidden.
      // This prevents both from ever rendering simultaneously.
      if (canvas) {
        canvas.classList.toggle('cl-has-draft', !isEmpty);
      }
      sheet.setAttribute('data-empty', isEmpty ? 'true' : 'false');

      const chars = cleanText.length;
      const words = cleanText ? cleanText.split(/\s+/).filter(Boolean).length : 0;
      const paragraphs = cleanText ? cleanText.split(/\n\s*\n/).filter(Boolean).length : 0;
      const readMin = Math.max(1, Math.round(words / 200));

      const charEl = document.getElementById('charCount');
      const wordEl = document.getElementById('wordCount');
      const paraEl = document.getElementById('paragraphCount');
      const readEl = document.getElementById('readTime');

      if (charEl) animateMetricChange(charEl, chars);
      if (wordEl) animateMetricChange(wordEl, words);
      if (paraEl) animateMetricChange(paraEl, paragraphs);
      if (readEl) animateMetricChange(readEl, `${readMin}m`);
    });
  }

  const updateComplexMetricsDebounced = debounce(() => {
    const sheet = document.getElementById('editorSheet');
    if (!sheet) return;
    const text = sheet.innerText || '';
    const cleanText = text.trim();
    const chars = cleanText.length;
    const words = cleanText ? cleanText.split(/\s+/).filter(Boolean).length : 0;

    let readability = 85;
    if (words > 20) {
      const avgWordLength = chars / words;
      readability = Math.max(40, Math.min(98, Math.round(100 - (avgWordLength * 6))));
    }

    const readabEl = document.getElementById('readabilityScore');
    if (readabEl) animateMetricChange(readabEl, words > 10 ? `${readability}%` : '—');
  }, 300);

  const updateATSAnalysisDebounced = debounce(() => {
    const liveAtsEl = document.getElementById('liveAtsScore');
    if (liveAtsEl && typeof currentAtsData !== 'undefined' && currentAtsData?.overallATSScore) {
      animateMetricChange(liveAtsEl, `${currentAtsData.overallATSScore}%`);
    }
  }, 800);

  function handleEditorInput() {
    updateBasicMetrics();
    updateComplexMetricsDebounced();
    updateATSAnalysisDebounced();
    
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      saveEditorState();
      triggerAutosave();
    }, 1500); // 1.5s debounce — prevents rapid saves while typing
  }

  function saveEditorState() {
    const sheet = document.getElementById('editorSheet');
    if (!sheet) return;
    const html = sheet.innerHTML;
    if (editorHistory[historyIndex] === html) return;
    editorHistory = editorHistory.slice(0, historyIndex + 1);
    editorHistory.push(html);
    historyIndex++;
    // Cap undo stack at 50 states to prevent unbounded memory growth
    if (editorHistory.length > 50) {
      editorHistory.shift();
      historyIndex = Math.max(0, historyIndex - 1);
    }
  }

  function executeEditorCommand(command, value = null) {
    if (command === 'undo') {
      if (historyIndex > 0) {
        historyIndex--;
        document.getElementById('editorSheet').innerHTML = editorHistory[historyIndex];
        updateCounts();
      }
    } else if (command === 'redo') {
      if (historyIndex < editorHistory.length - 1) {
        historyIndex++;
        document.getElementById('editorSheet').innerHTML = editorHistory[historyIndex];
        updateCounts();
      }
    } else {
      document.execCommand(command, false, value);
      saveEditorState();
      updateCounts();
    }
  }

  // NOTE: The real updateCounts() is defined later; this stub was removed
  //       to eliminate the dead-code duplicate that was shadowing it.

  async function triggerAutosave() {
    const label = document.getElementById('autosaveLabel');
    const labelText = document.getElementById('autosaveLabelText');
    if (!label) return;
    if (labelText) labelText.textContent = 'Saving draft...';
    label.querySelector('span[aria-hidden]').style.color = '#f59e0b';
    
    const letterText = document.getElementById('editorSheet').innerText;
    localStorage.setItem('cc_cover_letter_draft', letterText);

    if (currentSavedLetterId) {
      try {
        const { error } = await client.from('cover_letters').update({
          generated_letter: letterText,
          updated_at: new Date().toISOString()
        }).eq('id', currentSavedLetterId);

        if (error) throw error;
        if (labelText) labelText.textContent = 'Saved to cloud';
        label.querySelector('span[aria-hidden]').style.color = '#22c55e';
      } catch (err) {
        console.error('Autosave error:', err);
        if (labelText) labelText.textContent = 'Saved locally';
        label.querySelector('span[aria-hidden]').style.color = '#ef4444';
      }
    } else {
      if (labelText) labelText.textContent = 'Saved locally';
      label.querySelector('span[aria-hidden]').style.color = '#22c55e';
    }
  }

  async function handleResumeUpload(input) {
    const file = (input.files && input.files[0]) || null;
    if (!file) return;

    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const allowedExts = ['.pdf', '.docx'];
    const ext = (file.name || '').toLowerCase().match(/\.[^.]+$/)?.[0] || '';
    if (!allowed.includes(file.type) && !allowedExts.includes(ext)) {
      setResumeStatus('error', 'Only PDF or DOCX files are accepted.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setResumeStatus('error', 'File size exceeds the 5 MB limit.');
      return;
    }

    setResumeStatus('loading', `Parsing ${file.name}...`);
    document.getElementById('resumeProgress').style.display = 'block';
    let progress = 0;
    const progressIv = setInterval(() => {
      progress = Math.min(progress + 15, 90);
      document.getElementById('resumeProgressBar').style.width = progress + '%';
    }, 150);

    const form = new FormData();
    form.append('resume', file);

    const session = await window.appSdk.auth.getSession();
    const headers = {};
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    try {
      const res = await fetch('/api/upload-resume', { method: 'POST', headers: headers, body: form });
      const data = await res.json().catch(() => ({}));
      clearInterval(progressIv);
      document.getElementById('resumeProgressBar').style.width = '100%';
      setTimeout(() => document.getElementById('resumeProgress').style.display = 'none', 300);

      if (!res.ok) {
        setResumeStatus('error', data.error || 'Failed to parse resume.');
        resumeText = '';
        return;
      }

      resumeText = data.resumeText || '';
      setResumeStatus('success', `Parsed: ${file.name}`);
      document.getElementById('mirrorRow').style.display = 'block';
      document.getElementById('resumeClearRow').style.display = 'block';
    } catch (err) {
      clearInterval(progressIv);
      document.getElementById('resumeProgress').style.display = 'none';
      setResumeStatus('error', 'Parsing connection error: ' + err.message);
      resumeText = '';
    }
  }

  function setResumeStatus(type, msg) {
    const el = document.getElementById('resumeStatus');
    el.className = 'resume-status ' + type;
    el.textContent = msg;
    el.style.display = 'flex';
  }

  function clearResume() {
    resumeText = '';
    document.getElementById('resumeFile').value = '';
    const select = document.getElementById('savedResumeSelect');
    if (select) select.value = '';
    document.getElementById('resumeStatus').style.display = 'none';
    document.getElementById('mirrorRow').style.display = 'none';
    document.getElementById('resumeClearRow').style.display = 'none';
    document.getElementById('mirrorStructure').checked = false;
  }

  let savedResumesData = {};
  async function loadSavedResumesDropdown() {
    if (!currentUser) return;
    const select = document.getElementById('savedResumeSelect');
    try {
      const { data, error } = await client.from('resumes').select('*').eq('user_id', currentUser.id).order('created_at', {ascending: false});
      if (error || !data || !data.length) {
        select.innerHTML = '<option value="">— No saved resumes. Build one first! —</option>';
        select.disabled = true;
        return;
      }
      select.innerHTML = '<option value="">— Select from your Saved Resumes —</option>';
      data.forEach(r => {
        savedResumesData[r.id] = r;
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.full_name ? `${r.full_name}'s Resume (${r.title || 'Untitled'})` : (r.title || 'Untitled');
        select.appendChild(opt);
      });
    } catch (e) {
      console.error('Error loading saved resumes:', e);
    }
  }

  function handleSavedResumeSelect(selectEl) {
    const id = selectEl.value;
    if (!id) {
      clearResume();
      return;
    }
    const r = savedResumesData[id];
    if (!r) return;

    let txt = `Name: ${r.full_name || ''}\nEmail: ${r.email || ''}\nPhone: ${r.phone || ''}\n\n`;
    if (r.professional_summary) txt += `Summary:\n${r.professional_summary}\n\n`;
    if (r.experience && Array.isArray(r.experience)) {
      txt += `Experience:\n`;
      r.experience.forEach(ex => {
        txt += `${ex.title} at ${ex.company} (${ex.start || ''}${ex.end ? ' - ' + ex.end : ''})\n${ex.description || ''}\n\n`;
      });
    }
    if (r.skills && Array.isArray(r.skills)) {
      txt += `Skills: ${r.skills.join(', ')}\n\n`;
    }

    resumeText = txt;
    document.getElementById('candidateName').value = r.full_name || '';
    document.getElementById('resumeFile').value = '';
    setResumeStatus('success', `Loaded: ${selectEl.options[selectEl.selectedIndex].text}`);
    document.getElementById('mirrorRow').style.display = 'block';
    document.getElementById('resumeClearRow').style.display = 'block';
  }

  const CoverLetterLogger = {
    start() {
      if (typeof console !== 'undefined' && console.group) {
        console.group(' [Cover Letter Pipeline]');
      }
    },
    step(stage, details) {
      if (typeof console !== 'undefined' && console.log) {
        console.log(`[Pipeline Stage: ${stage}]`, details);
      }
    },
    error(stage, err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error(`Error: [Pipeline Error @ ${stage}]`, err);
      }
    },
    end(success) {
      if (typeof console !== 'undefined' && console.groupEnd) {
        console.groupEnd();
      }
    }
  };

  async function executeCoverLetterRequest(payload, headers, maxRetries = 1) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          CoverLetterLogger.step('Retry Attempt', `Retrying request (${attempt}/${maxRetries}) after transient delay...`);
          await new Promise(r => setTimeout(r, 1500));
        }

        const res = await fetch('/api/cover-letter', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload)
        });

        if (res.status === 502 || res.status === 503 || res.status === 504) {
          const text = await res.text().catch(() => '');
          let msg = res.statusText;
          try {
            const json = JSON.parse(text);
            msg = json.error || json.message || msg;
          } catch (_) {}
          const err = new Error(msg || `Server temporary unavailable (${res.status})`);
          err.status = res.status;
          lastError = err;
          if (attempt < maxRetries) continue;
          throw err;
        }

        return res;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries && (err.name === 'AbortError' || err.message?.includes('fetch'))) {
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  const premiumStages = [
    'Preparing your information…',
    'Understanding the job requirements…',
    'Analyzing your experience…',
    'Matching your resume with the role…',
    'Writing your personalized cover letter…',
    'Optimizing ATS keywords…',
    'Refining grammar and tone…'
  ];

  function startPremiumLoading(sheet) {
    if (!sheet) return;
    // Overlay sits inside the editor canvas container
    const canvas = document.getElementById('editorCanvas');
    if (!canvas) return;
    
    let overlay = document.getElementById('premiumLoadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'premiumLoadingOverlay';
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.background = 'rgba(13,15,24,0.92)';
      overlay.style.zIndex = '50';
      overlay.style.display = 'flex';
      overlay.style.flexDirection = 'column';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.borderRadius = 'var(--r-md)';
      canvas.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    // Ensure canvas is in a state that can show the overlay (not empty-state-only)
    canvas.classList.add('cl-generating');

    overlay.innerHTML = `
      <div class="premium-loading-container" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4rem 2rem; color:var(--text-1);">
        <div class="spinner-premium" style="width:40px; height:40px; border:3px solid rgba(99,102,241, 0.1); border-top-color:var(--accent); border-radius:50%; animation:spin 1s linear infinite; margin-bottom:1.5rem;"></div>
        <div id="premiumLoadingText" style="font-weight:600; font-size:1.15rem; color:var(--text-1); letter-spacing:-0.01em; transition: opacity 0.2s ease;">
          ${premiumStages[0]}
        </div>
        <div style="width: 240px; height: 4px; background: rgba(0,0,0,0.05); border-radius: 4px; margin-top: 1.5rem; overflow: hidden; position: relative;">
           <div id="premiumLoadingBar" style="position:absolute; top:0; left:0; height:100%; width: 5%; background: var(--accent); transition: width 0.6s ease; border-radius:4px;"></div>
        </div>
      </div>
      <style>
        @keyframes spin { 100% { transform: rotate(360deg); } }
      </style>
    `;
  }

  function updatePremiumStage(text, percent) {
    const textEl = document.getElementById('premiumLoadingText');
    const barEl = document.getElementById('premiumLoadingBar');
    if (!textEl || !barEl) return;
    
    textEl.style.opacity = '0';
    setTimeout(() => {
      textEl.textContent = text;
      textEl.style.opacity = '1';
    }, 200);
    barEl.style.width = percent + '%';
  }

  function finishPremiumLoading() {
    const overlay = document.getElementById('premiumLoadingOverlay');
    const canvas = document.getElementById('editorCanvas');
    if (!overlay) return;
    
    const barEl = document.getElementById('premiumLoadingBar');
    if (barEl) barEl.style.width = '100%';
    
    overlay.innerHTML = `
      <div class="premium-loading-container" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 3rem 2rem; color:var(--text-1);">
        <div style="width:40px; height:40px; border-radius:50%; background:var(--success); color:white; display:flex; align-items:center; justify-content:center; font-size:20px; margin-bottom:1.25rem;"><i data-lucide="check" width="20"></i></div>
        <div style="font-weight:600; font-size:1.1rem; color:var(--text-1); letter-spacing:-0.01em;">
          Generation Complete
        </div>
      </div>
    `;
    if(window.lucide) lucide.createIcons();
    setTimeout(() => {
      overlay.style.display = 'none';
      if (canvas) canvas.classList.remove('cl-generating');
      // Refresh state after generation
      updateBasicMetrics();
    }, 1000);
  }

  async function injectEditorContent(htmlContent) {
    const editor = document.getElementById('editorSheet');
    if (!editor) throw new Error('Editor instance was null');
    
    editor.innerHTML = htmlContent;
    saveEditorState();
    updateCounts();
  }

  async function generateCoverLetter(event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    if (isGenerating) { showToast('error', 'Already generating... please wait.'); return; }

    CoverLetterLogger.start();
    CoverLetterLogger.step('Initiated', 'User clicked Generate Cover Letter button');

    // Phase 3: Client-side Inline Input Validation
    let hasErr = false;
    const missingFields = [];
    const fields = [
      { id: 'jobTitle', name: 'Job Title' },
      { id: 'companyName', name: 'Company Name' },
      { id: 'jobDescription', name: 'Job Description' }
    ];

    fields.forEach(f => {
      const inputEl = document.getElementById(f.id);
      const val = inputEl ? inputEl.value.trim() : '';
      const errEl = document.getElementById(`err-${f.id}`);
      if (!val) {
        if (errEl) errEl.style.display = 'block';
        if (inputEl) inputEl.style.borderColor = 'var(--danger)';
        hasErr = true;
        missingFields.push(f.name);
      } else {
        if (errEl) errEl.style.display = 'none';
        if (inputEl) inputEl.style.borderColor = '';
      }
    });

    if (hasErr) {
      CoverLetterLogger.step('Validation', `Failed — Missing required fields: ${missingFields.join(', ')}`);
      showToast('error', `Please fill in all required fields: ${missingFields.join(', ')}.`);
      toggleStepAccordion('jobInfo');
      CoverLetterLogger.end(false);
      return;
    }

    CoverLetterLogger.step('Validation', 'Passed — All required fields populated.');

    const generateBtn = document.getElementById('generateBtn');
    const originalText = generateBtn.textContent;
    const sheet = document.getElementById('editorSheet');

    try {
      isGenerating = true;
      generateBtn.disabled = true;

      // Phase 9: Progressive UX Loading States
      generateBtn.innerHTML = '<i data-lucide="loader-circle" class="spin" width="16" stroke-width="2"></i> Generating...';
      if(window.lucide) lucide.createIcons();
      startPremiumLoading(sheet);

      const payload = {
        jobTitle: document.getElementById('jobTitle').value.trim(),
        companyName: document.getElementById('companyName').value.trim(),
        jobDescription: document.getElementById('jobDescription').value.trim(),
        highlights: document.getElementById('highlights') ? document.getElementById('highlights').value.trim() : '',
        tone: document.getElementById('tone').value,
        length: document.getElementById('length').value,
        opening: document.getElementById('opening') ? document.getElementById('opening').value.trim() : '',
        closing: document.getElementById('closing') ? document.getElementById('closing').value.trim() : '',
        resumeText: resumeText || '',
        mirrorStructure: document.getElementById('mirrorStructure') ? document.getElementById('mirrorStructure').checked : false,
        hiringManager: document.getElementById('hiringManager') ? document.getElementById('hiringManager').value.trim() : '',
        industry: document.getElementById('industry') ? document.getElementById('industry').value.trim() : '',
        location: document.getElementById('location') ? document.getElementById('location').value.trim() : '',
        companyWebsite: document.getElementById('companyWebsite') ? document.getElementById('companyWebsite').value.trim() : '',
        referral: document.getElementById('referral') ? document.getElementById('referral').value.trim() : '',
        linkedinUrl: document.getElementById('linkedinUrl') ? document.getElementById('linkedinUrl').value.trim() : '',
        portfolio: document.getElementById('portfolio') ? document.getElementById('portfolio').value.trim() : '',
        experienceLevel: document.getElementById('experienceLevel') ? document.getElementById('experienceLevel').value : 'Mid',
        keySkills: document.getElementById('mustHaveSkills') ? document.getElementById('mustHaveSkills').value.trim() : '',
        achievements: document.getElementById('keyAchievements') ? document.getElementById('keyAchievements').value.trim() : '',
        additionalInstructions: document.getElementById('additionalInstructions') ? document.getElementById('additionalInstructions').value.trim() : '',
        mustHaveSkills: document.getElementById('mustHaveSkills') ? document.getElementById('mustHaveSkills').value.trim() : '',
        keyAchievements: document.getElementById('keyAchievements') ? document.getElementById('keyAchievements').value.trim() : '',
        workHistoryAlignment: document.getElementById('workHistoryAlignment') ? document.getElementById('workHistoryAlignment').value.trim() : '',
        softSkills: document.getElementById('softSkills') ? document.getElementById('softSkills').value.trim() : '',
        companyResearch: document.getElementById('companyResearch') ? document.getElementById('companyResearch').value.trim() : '',
        volunteerProjects: document.getElementById('volunteerProjects') ? document.getElementById('volunteerProjects').value.trim() : '',
        extraKeywords: document.getElementById('extraKeywords') ? document.getElementById('extraKeywords').value.trim() : '',
        creativityLevel: document.getElementById('creativityLevel') ? document.getElementById('creativityLevel').value : 'Balanced',
        focusArea: document.getElementById('focusArea') ? document.getElementById('focusArea').value : 'Achievements'
      };

      CoverLetterLogger.step('Payload Built', {
        jobTitle: payload.jobTitle,
        companyName: payload.companyName,
        jobDescLength: payload.jobDescription.length,
        hasResume: Boolean(payload.resumeText),
        tone: payload.tone,
        length: payload.length
      });

      generateBtn.innerHTML = '<i data-lucide="loader-circle" class="spin" width="16" stroke-width="2"></i> Analyzing...';
      if(window.lucide) lucide.createIcons();
      updatePremiumStage('Analyzing job requirements…', 40);

      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Phase 10: Automatic Retry Execution
      updatePremiumStage('Generating personalized cover letter…', 75);
      const res = await executeCoverLetterRequest(payload, headers, 1);
      
      updatePremiumStage('Finalizing grammar and ATS optimization…', 90);
      const data = await res.json();

      CoverLetterLogger.step('Network Response', {
        status: res.status,
        ok: res.ok,
        hasLetter: Boolean(data.letter),
        errorMsg: data.error || null
      });

      if (!res.ok) {
        const error = new Error(data.error || `HTTP ${res.status} server error`);
        error.status = res.status;
        error.data = data;
        throw error;
      }

      generateBtn.innerHTML = '<i data-lucide="loader-circle" class="spin" width="16" stroke-width="2"></i> Optimizing...';
      if(window.lucide) lucide.createIcons();

      lastGeneratedData = data;
      const letterText = cleanEscapes(data.letter);

      finishPremiumLoading();
      generateBtn.innerHTML = '<i data-lucide="loader-circle" class="spin" width="16" stroke-width="2"></i> Finalizing...';
      if(window.lucide) lucide.createIcons();

      await injectEditorContent(letterText);

      updateGauges(data.detailed_scores || {});
      renderATSAnalysis(data);
      renderVariants(data.variants || [], data.letter);

      showToast('success', 'Cover letter generated successfully!');
      switchEditorTab('editPane');

      runAtsAnalysisOnText(letterText);
      CoverLetterLogger.step('Completed', 'Document rendered into editor.');
      CoverLetterLogger.end(true);

    } catch (err) {
      const overlay = document.getElementById('premiumLoadingOverlay');
      if (overlay) overlay.style.display = 'none';

      CoverLetterLogger.error('Generation Failed', {
        stage: 'Cover Letter Generation',
        reason: err.message,
        stack: err.stack
      });

      const safeUserMsg = "We couldn't generate your cover letter. Please try again. If the issue continues, contact support.";
      showToast('error', safeUserMsg);
      CoverLetterLogger.end(false);
    } finally {
      isGenerating = false;
      generateBtn.textContent = originalText;
      generateBtn.disabled = false;
    }
  }

  function cleanEscapes(txt) {
    if (!txt) return '';
    return txt.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }

  function updateGauges(scores) {
    const readability = scores.readability || 80;
    const professionalism = scores.professionalism || 85;
    const personalization = scores.personalization || 80;
    const overall = scores.overall || 82;

    animateGauge('overallATSScore', overall);
    animateGauge('keywordMatch', overall);
    animateGauge('recruiterReadability', readability);
    animateGauge('professionalTone', professionalism);
    animateGauge('personalization', personalization);
  }

  // Fix B3: animateGauge was targeting SVG gauge-${id} elements with SVG-only
  // strokeDashoffset property. The actual HTML uses progress bar divs with
  // id="fill-${id}". Updated to set width% and update the value label.
  function animateGauge(id, score) {
    const fill = document.getElementById(`fill-${id}`);
    const textVal = document.getElementById(`val-${id}`);
    const safeScore = Math.min(100, Math.max(0, Math.round(score || 0)));
    if (fill) fill.style.width = `${safeScore}%`;
    if (textVal) textVal.textContent = `${safeScore}%`;
  }

  function escapeJSQuotes(str) {
    return (str || '').replace(/`/g, '\\`').replace(/"/g, '\\"').replace(/'/g, "\\'");
  }

  let currentAtsData = null;
  let originalAtsScores = {};

  async function runAtsAnalysisOnText(letterText) {
    const reBtn = document.getElementById('reanalyzeAtsBtn');
    if (reBtn) {
      reBtn.disabled = true;
      reBtn.innerHTML = '<i data-lucide="loader-circle" class="spin" width="16" stroke-width="2"></i> Analyzing...';
      if(window.lucide) lucide.createIcons();
    }
    // Show loading state in AI Assistant tab
    const listEl = document.getElementById('suggestionsList');
    if (listEl) {
      listEl.innerHTML = '<p style="color:var(--text-3); font-size:0.85rem; text-align:center; padding:1rem 0;"><i data-lucide="loader-circle" class="spin" width="16" stroke-width="2"></i> Analyzing your cover letter for improvements...</p>';
    }
    const countEl = document.getElementById('suggestionsCount');
    if (countEl) countEl.textContent = '';
    
    try {
      const payload = {
        letter: letterText,
        jobDescription: document.getElementById('jobDescription').value.trim(),
        jobTitle: document.getElementById('jobTitle').value.trim(),
        companyName: document.getElementById('companyName').value.trim(),
        resumeText: resumeText || '',
        industry: document.getElementById('industry').value.trim(),
        experienceLevel: document.getElementById('experienceLevel').value
      };

      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/ats-suggestions', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'ATS analysis failed' }));
        throw new Error(err.error || 'ATS analysis failed');
      }

      const data = await res.json();
      currentAtsData = data;
      
      originalAtsScores = {
        overallATSScore: data.overallATSScore,
        keywordMatch: data.keywordMatch,
        recruiterReadability: data.recruiterReadability,
        professionalTone: data.professionalTone,
        personalization: data.personalization
      };

      updateAtsGauges(data);
      renderAtsSuggestions(data.suggestions || []);
      renderAtsSummary(data.summary || {});

      if (reBtn) reBtn.style.display = 'inline-block';
    } catch (err) {
      console.error('ATS Analysis error:', err);
      showToast('error', 'ATS Analysis failed: ' + err.message);
    } finally {
      if (reBtn) {
        reBtn.disabled = false;
        reBtn.innerHTML = '<i data-lucide="refresh-cw" width="16"></i> Re-analyze ATS';
        if(window.lucide) lucide.createIcons();
      }
    }
  }

  function reanalyzeATS() {
    const sheet = document.getElementById('editorSheet');
    const letterText = sheet ? (sheet.innerText || '').trim() : '';
    const isPlaceholder = !letterText ||
      letterText.startsWith('Your generated cover letter will appear here') ||
      letterText.startsWith('Preparing your information');
    if (isPlaceholder) {
      showToast('error', 'Generate a cover letter first to analyze.');
      return;
    }
    runAtsAnalysisOnText(letterText);
  }

  function updateAtsGauges(data) {
    animateGauge('overallATSScore', data.overallATSScore || 0);
    animateGauge('keywordMatch', data.keywordMatch || 0);
    animateGauge('recruiterReadability', data.recruiterReadability || 0);
    animateGauge('professionalTone', data.professionalTone || 0);
    animateGauge('personalization', data.personalization || 0);

    const atsDisplay = document.getElementById('atsScoreDisplay');
    if (atsDisplay) {
      const score = data.overallATSScore || 0;
      atsDisplay.textContent = score;
      atsDisplay.className = 'score-number' + (score >= 70 ? ' score-high' : score >= 50 ? ' score-mid' : ' score-low');
    }
  }

  function renderAtsSuggestions(suggestions) {
    const countEl = document.getElementById('suggestionsCount');
    if (countEl) countEl.textContent = suggestions.length ? `(${suggestions.length})` : '';

    const listEl = document.getElementById('suggestionsList');
    if (!listEl) return;
    if (!suggestions.length) {
      listEl.innerHTML = '<p style="color:var(--text-3); font-size:0.85rem;">No suggestions found. Your letter is optimized!</p>';
      return;
    }

    listEl.innerHTML = suggestions.map(s => {
      const normalizedCategory = (s.category || 'Missing Keyword').toLowerCase().replace(/\s+/g, '-');
      const catClass = `badge-${normalizedCategory}`;
      const priorityColor = s.priority === 'High' ? '<i data-lucide="arrow-up" style="color:var(--danger)" width="14"></i>' : s.priority === 'Medium' ? '<i data-lucide="minus" style="color:var(--warning)" width="14"></i>' : '<i data-lucide="arrow-down" style="color:var(--success)" width="14"></i>';
      const hasDiff = s.currentText && s.suggestedText;

      return `
        <div class="suggestion-card" id="sug-${s.id}">
          <div class="suggestion-header" style="margin-bottom:0.6rem;">
            <span class="suggestion-cat-badge ${catClass}">${s.category || 'Missing Keyword'}</span>
            <div style="display:flex; gap:0.5rem; align-items:center;">
              <span class="suggestion-gain-badge">${s.estimatedATSGain || '+2%'} Gain</span>
              <span class="priority-badge priority-${(s.priority || 'Medium').toLowerCase()}" style="font-weight:700;">${priorityColor} ${s.priority || 'Medium'}</span>
            </div>
          </div>
          
          <div class="suggestion-title">${s.title || 'Improvement Opportunity'}</div>
          <div class="suggestion-desc" style="margin-bottom:0.5rem;">${s.description}</div>
          <div class="suggestion-reason">${s.reason}</div>
          
          <div style="display:flex; gap:0.5rem; justify-content:flex-end; margin-top:0.75rem;">
            <button class="btn btn-secondary btn-sm" style="min-height:30px; font-size:0.75rem; padding:0.2rem 0.5rem;" onclick="ignoreSuggestion('${s.id}')">Ignore</button>
            <button class="btn btn-secondary btn-sm" style="min-height:30px; font-size:0.75rem; padding:0.2rem 0.5rem;" onclick="copySuggestionText(\`${escapeJSQuotes(s.suggestedText || '')}\`)">Copy</button>
            ${hasDiff ? `
              <button class="btn btn-secondary btn-sm" style="min-height:30px; font-size:0.75rem; padding:0.2rem 0.5rem;" onclick="openCompareModal('${s.id}', \`${escapeJSQuotes(s.currentText)}\`, \`${escapeJSQuotes(s.suggestedText)}\`)">Compare</button>
            ` : ''}
            ${s.oneClickApplicable && hasDiff ? `
              <button class="btn btn-primary btn-sm" style="min-height:30px; font-size:0.75rem; padding:0.2rem 0.5rem;" onclick="applyAtsSuggestion('${s.id}', \`${escapeJSQuotes(s.currentText)}\`, \`${escapeJSQuotes(s.suggestedText)}\`, '${s.estimatedATSGain || '+2%'}')">Apply</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function applyAtsSuggestion(id, original, replacement, gainStr) {
    const sheet = document.getElementById('editorSheet');
    let content = sheet.innerHTML;
    let textContent = sheet.innerText;

    let applied = false;
    if (content.includes(original)) {
      content = content.replace(original, `<strong>${replacement}</strong>`);
      sheet.innerHTML = content;
      saveEditorState();
      updateCounts();
      
      setTimeout(() => {
        sheet.innerHTML = sheet.innerHTML.replace(`<strong>${replacement}</strong>`, replacement);
        saveEditorState();
      }, 2500);
      applied = true;
    } else if (textContent.includes(original)) {
      textContent = textContent.replace(original, replacement);
      sheet.innerText = textContent;
      saveEditorState();
      updateCounts();
      applied = true;
    }

    if (applied) {
      showToast('success', 'Suggestion applied inline.');
      
      const gainVal = parseInt((gainStr || '+2%').replace(/[^0-9]/g, ''), 10) || 2;
      if (currentAtsData) {
        currentAtsData.overallATSScore = Math.min(100, currentAtsData.overallATSScore + gainVal);
        currentAtsData.keywordMatch = Math.min(100, currentAtsData.keywordMatch + gainVal);
        currentAtsData.recruiterReadability = Math.min(100, currentAtsData.recruiterReadability + Math.round(gainVal / 2));
        currentAtsData.personalization = Math.min(100, currentAtsData.personalization + Math.round(gainVal / 2));
        
        updateAtsGauges(currentAtsData);
        
        if (currentAtsData.summary) {
          currentAtsData.summary.overallATSScore = currentAtsData.overallATSScore;
          renderAtsSummary(currentAtsData.summary);
        }
      }
      
      dismissAtsSuggestion(id);
    } else {
      showToast('error', 'Could not locate the text in the editor. Copy manually.');
    }
  }

  function ignoreSuggestion(id) {
    dismissAtsSuggestion(id);
    showToast('success', 'Suggestion ignored.');
  }

  function dismissAtsSuggestion(id) {
    const card = document.getElementById(`sug-${id}`);
    if (card) {
      card.style.opacity = '0';
      card.style.transform = 'translateY(-10px)';
      card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      setTimeout(() => {
        card.remove();
        const remainingCards = document.querySelectorAll('#suggestionsList .suggestion-card');
        const countEl = document.getElementById('suggestionsCount');
        if (countEl) countEl.textContent = remainingCards.length ? `(${remainingCards.length})` : '';
        
        if (!remainingCards.length) {
          document.getElementById('suggestionsList').innerHTML = '<p style="color:var(--text-3); font-size:0.85rem;">All suggestions completed!</p>';
        }
      }, 300);
    }
  }

  function handleCopyCoverLetter() {
    const editorSheet = document.getElementById('editorSheet');
    const text = editorSheet ? (editorSheet.innerText || editorSheet.textContent || '') : '';
    if (window.copyToClipboard) {
      window.copyToClipboard(text, 'Cover letter text copied to clipboard!');
    } else if (window.appSdk && window.appSdk.ui && typeof window.appSdk.ui.copyToClipboard === 'function') {
      window.appSdk.ui.copyToClipboard(text, 'Cover letter text copied to clipboard!');
    }
  }

  function copySuggestionText(text) {
    const cleanText = cleanEscapes(text);
    if (window.copyToClipboard) {
      window.copyToClipboard(cleanText, 'Suggested text copied to clipboard.');
    } else if (window.appSdk && window.appSdk.ui && typeof window.appSdk.ui.copyToClipboard === 'function') {
      window.appSdk.ui.copyToClipboard(cleanText, 'Suggested text copied to clipboard.');
    }
  }

  let activeCompareId = null;
  let activeCompareOriginal = '';
  let activeCompareReplacement = '';

  let _compareModalPreviousFocus = null;

  function openCompareModal(id, original, replacement, explanation = '') {
    activeCompareId = id;
    activeCompareOriginal = original;
    activeCompareReplacement = replacement;

    document.getElementById('compareBeforeVal').textContent = original;
    document.getElementById('compareAfterVal').textContent = replacement;
    
    const expBox = document.getElementById('compareExplanationBox');
    if (expBox) {
      if (explanation) {
        expBox.innerHTML = `<strong>Why this suggestion?</strong><br/>${explanation}`;
        expBox.style.display = 'block';
      } else {
        expBox.style.display = 'none';
      }
    }

    const applyBtn = document.getElementById('compareApplyBtn');
    let gainStr = '+2%';
    if (currentAtsData && currentAtsData.suggestions) {
      const found = currentAtsData.suggestions.find(s => s.id === id);
      if (found) gainStr = found.estimatedATSGain;
    }
    
    applyBtn.onclick = () => {
      // If it is an AI suggestion, we might not have a gainStr, but we handle the replacement
      if (!id || String(id).startsWith('ai-')) {
        applyAiSuggestion(original, replacement);
      } else {
        applyAtsSuggestion(id, original, replacement, gainStr);
      }
      closeCompareModal();
    };

    _compareModalPreviousFocus = document.activeElement;
    const modal = document.getElementById('compareModal');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    // Focus first interactive element
    const closeBtn = modal.querySelector('.close-modal-btn');
    if (closeBtn) setTimeout(() => closeBtn.focus(), 50);

    // Focus trap
    modal.addEventListener('keydown', _compareFocusTrap);
    document.addEventListener('keydown', _compareEscapeHandler);
  }

  function _compareFocusTrap(e) {
    const modal = document.getElementById('compareModal');
    const focusable = modal.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
  }

  function _compareEscapeHandler(e) {
    if (e.key === 'Escape') closeCompareModal();
  }

  function closeCompareModal() {
    const modal = document.getElementById('compareModal');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    modal.removeEventListener('keydown', _compareFocusTrap);
    document.removeEventListener('keydown', _compareEscapeHandler);
    if (_compareModalPreviousFocus) _compareModalPreviousFocus.focus();
  }

  function renderAtsSummary(summary) {
    const container = document.getElementById('suggestionsSummaryContainer');
    if (!container) return;
    if (!summary || !summary.overallATSScore) {
      container.innerHTML = '';
      return;
    }

    const shortlistEmoji = summary.recruiterLikelihood === 'High' ? 'High Likelihood' : summary.recruiterLikelihood === 'Medium' ? 'Medium Likelihood' : 'Low Likelihood';
    const confidenceEmoji = summary.confidenceLevel === 'High' ? 'High Confidence' : summary.confidenceLevel === 'Medium' ? 'Medium Confidence' : 'Low Confidence';
 
    container.innerHTML = `
      <div class="summary-card">
        <div class="summary-title">
          <span>ATS Executive Summary</span>
          <span class="suggestion-gain-badge" style="font-size:0.75rem; background:rgba(139, 92, 246, 0.15); color:#a78bfa; border:1px solid rgba(139, 92, 246, 0.3)">Target: ${summary.estimatedATSAfterApplying}% after optimizations</span>
        </div>
        <div class="summary-stats">
          <div class="summary-stat-item">Recruiter Likelihood: <span class="summary-stat-val">${shortlistEmoji}</span></div>
          <div class="summary-stat-item">Analysis Confidence: <span class="summary-stat-val">${confidenceEmoji}</span></div>
        </div>
        <h4 style="font-size:0.8rem; margin:0 0 0.4rem 0; color:var(--text-1); text-transform:uppercase; letter-spacing:0.04em;">Top 5 Improvement Areas:</h4>
        <ul class="summary-list">
          ${summary.topImprovements && summary.topImprovements.length ? summary.topImprovements.map(imp => `<li>${imp}</li>`).join('') : '<li>Optimize keyword match and formatting to proceed.</li>'}
        </ul>
      </div>
    `;
  }

  function renderATSAnalysis(data) {
    const atsVal = data.ats_score || 0;
    const relVal = data.relevance_score || 0;

    const atsScoreDisplay = document.getElementById('atsScoreDisplay');
    const relScoreDisplay = document.getElementById('relScoreDisplay');

    if (atsScoreDisplay) {
      atsScoreDisplay.textContent = atsVal;
      atsScoreDisplay.className = 'score-number' + (atsVal >= 70 ? ' score-high' : atsVal >= 50 ? ' score-mid' : ' score-low');
    }
    
    if (relScoreDisplay) {
      relScoreDisplay.textContent = relVal;
      relScoreDisplay.className = 'score-number' + (relVal >= 75 ? ' score-high' : relVal >= 55 ? ' score-mid' : ' score-low');
    }

    const matched = data.matched_keywords || [];
    const missing = data.missing_keywords || [];
    const keywordsSection = document.getElementById('atsKeywordsSection');

    if (keywordsSection) {
      keywordsSection.innerHTML = `
        <h4 style="margin-bottom:0.5rem; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.04em;">Matched Job Terms (${matched.length})</h4>
        <div style="margin-bottom:1rem;">
          ${matched.length ? matched.map(k => `<span class="tag tag-matched">${k}</span>`).join('') : '<span style="font-size:0.8rem; color:var(--text-3);">None matched yet.</span>'}
        </div>
        <h4 style="margin-bottom:0.5rem; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.04em;">Missing / Recommended Terms (${missing.length})</h4>
        <div>
          ${missing.length ? missing.map(k => `<span class="tag tag-missing">${k}</span>`).join('') : '<span style="font-size:0.8rem; color:var(--text-3);">Perfect match! No keywords missing.</span>'}
        </div>
      `;
    }
  }

  function renderVariants(variants, mainText) {
    const container = document.getElementById('variantsContainer');
    if (!container) return;
    if (!variants.length) {
      container.innerHTML = '<p style="color:var(--text-3); font-size:0.85rem;">No alternate variants returned.</p>';
      return;
    }

    container.innerHTML = variants.map((vText, idx) => {
      const title = idx === 0 ? 'Variant A: Bold & Impactful' : idx === 1 ? 'Variant B: Technical & Detailed' : 'Variant C: Story-Driven';
      return `
        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:var(--r-md); padding:1rem; margin-bottom:1rem;">
          <h4 style="font-size:0.88rem; color:var(--text-1); margin-bottom:0.5rem;">${title}</h4>
          <div style="font-size:0.8rem; color:var(--text-2); max-height:120px; overflow-y:auto; white-space:pre-wrap; margin-bottom:0.75rem; background:rgba(0,0,0,0.1); padding:0.5rem; border-radius:4px;">${cleanEscapes(vText)}</div>
          <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
            <button class="btn btn-secondary btn-sm" style="min-height:30px; font-size:0.75rem;" onclick="copyVariantText(\`${escapeJSQuotes(vText)}\`)">Copy</button>
            <button class="btn btn-primary btn-sm" style="min-height:30px; font-size:0.75rem;" onclick="applyVariantText(\`${escapeJSQuotes(vText)}\`)">Use this variant</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function copyVariantText(text) {
    const cleanText = cleanEscapes(text);
    if (window.copyToClipboard) {
      window.copyToClipboard(cleanText, 'Variant copied to clipboard.');
    } else if (window.appSdk && window.appSdk.ui && typeof window.appSdk.ui.copyToClipboard === 'function') {
      window.appSdk.ui.copyToClipboard(cleanText, 'Variant copied to clipboard.');
    }
  }

  function applyVariantText(text) {
    document.getElementById('editorSheet').innerHTML = cleanEscapes(text);
    saveEditorState();
    updateCounts();
    showToast('success', 'Editor updated with variant text.');
    switchEditorTab('editPane');
  }

  async function saveOrUpdateCoverLetter() {
    const jobTitleVal = document.getElementById('jobTitle').value.trim();
    const companyNameVal = document.getElementById('companyName').value.trim();
    const letterText = document.getElementById('editorSheet').innerText;

    if (!jobTitleVal || !companyNameVal || !letterText) {
      showToast('error', 'Please fill in job settings and generate a letter first.');
      return;
    }

    const payload = {
      user_id: currentUser.id,
      job_title: jobTitleVal,
      company_name: companyNameVal,
      job_description: (document.getElementById('jobDescription')?.value || '').trim(),
      highlights: (document.getElementById('highlights')?.value || '').trim(),
      tone: document.getElementById('tone')?.value || 'Professional',
      length: document.getElementById('length')?.value || 'Medium',
      opening: (document.getElementById('opening')?.value || '').trim(),
      closing: (document.getElementById('closing')?.value || '').trim(),
      generated_letter: letterText,
      keywords_used: lastGeneratedData ? lastGeneratedData.keywords_used : [],
      ats_score: lastGeneratedData ? lastGeneratedData.ats_score : null,
      relevance_score: lastGeneratedData ? lastGeneratedData.relevance_score : null,
      variants: {
        texts: lastGeneratedData ? lastGeneratedData.variants : [],
        meta: {
          custom_title: `${jobTitleVal} @ ${companyNameVal}`,
          is_archived: false,
          hiringManager: (document.getElementById('hiringManager')?.value || '').trim(),
          industry: (document.getElementById('industry')?.value || '').trim(),
          location: (document.getElementById('location')?.value || '').trim(),
          experienceLevel: document.getElementById('experienceLevel')?.value || 'Mid',
          keySkills: (document.getElementById('mustHaveSkills')?.value || '').trim(),
          achievements: (document.getElementById('keyAchievements')?.value || '').trim(),
          softSkills: (document.getElementById('softSkills')?.value || '').trim(),
          companyResearch: (document.getElementById('companyResearch')?.value || '').trim(),
          linkedinUrl: (document.getElementById('linkedinUrl')?.value || '').trim(),
          portfolio: (document.getElementById('portfolio')?.value || '').trim(),
          additionalInstructions: (document.getElementById('additionalInstructions')?.value || '').trim(),
          detailed_scores: lastGeneratedData ? lastGeneratedData.detailed_scores : null,
          suggestions: lastGeneratedData ? lastGeneratedData.suggestions : []
        }
      }
    };

    try {
      if (currentSavedLetterId) {
        const { error } = await client.from('cover_letters').update(payload).eq('id', currentSavedLetterId);
        if (error) throw error;
        showToast('success', 'Cover letter updated successfully!');
      } else {
        const { data, error } = await client.from('cover_letters').insert([payload]).select();
        if (error) throw error;
        if (data && data[0]) {
          currentSavedLetterId = data[0].id;
        }
        showToast('success', 'Cover letter saved to database!');
      }
      await loadHistory();
    } catch (err) {
      showToast('error', 'Database save error: ' + err.message);
    }
  }

  let rawHistoryList = [];
  async function loadHistory() {
    if (!currentUser) return;
    try {
      const { data, error } = await client.from('cover_letters').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
      if (error) throw error;
      rawHistoryList = data || [];
      renderHistoryList(rawHistoryList);
    } catch (err) {
      console.error('History load error:', err);
      const listEl = document.getElementById('historyList');
      if (listEl) listEl.innerHTML = '<p style="color:var(--text-3);">Failed to load history.</p>';
    }
  }

  function renderHistoryList(items) {
    const container = document.getElementById('historyList');
    if (!container) return;
    const search = document.getElementById('historySearch').value.toLowerCase().trim();
    const sort = document.getElementById('historySort').value;
    const filter = document.getElementById('historyFilter').value;

    let filtered = items.filter(c => {
      const meta = c.variants?.meta || {};
      const isArchived = Boolean(meta.is_archived);
      if (filter === 'archived') return isArchived;
      if (filter === 'active') return !isArchived;
      return true;
    });

    if (search) {
      filtered = filtered.filter(c => {
        const customTitle = c.variants?.meta?.custom_title || '';
        return c.job_title?.toLowerCase().includes(search) ||
               c.company_name?.toLowerCase().includes(search) ||
               customTitle.toLowerCase().includes(search);
      });
    }

    if (sort === 'newest') {
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sort === 'oldest') {
      filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sort === 'alphabetical') {
      filtered.sort((a, b) => (a.job_title || '').localeCompare(b.job_title || ''));
    }

    if (!filtered.length) {
      container.innerHTML = '<p style="color:var(--text-3); font-size:0.9rem;">No cover letters found matching criteria.</p>';
      return;
    }

    container.innerHTML = filtered.map(c => {
      const meta = c.variants?.meta || {};
      const isArchived = Boolean(meta.is_archived);
      // HTML-escape displayName to prevent XSS via stored job titles
      const rawDisplayName = meta.custom_title || `${c.job_title || 'Untitled'} @ ${c.company_name || 'Acme'}`;
      const displayName = rawDisplayName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const createdDate = new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const archiveLabel = isArchived ? 'Restore' : 'Archive';

      return `
        <div class="history-item-card" id="history-${c.id}">
          <div>
            <div style="font-weight:700; color:var(--text-1); font-size:0.92rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayName}</div>
            <div class="history-item-meta">Created ${createdDate}</div>
            <div class="history-item-scores">
              <span class="score-badge ${c.ats_score >= 70 ? 'score-badge-high' : c.ats_score >= 50 ? 'score-badge-mid' : 'score-badge-low'}">ATS: ${c.ats_score || '—'}</span>
              <span class="score-badge ${c.relevance_score >= 75 ? 'score-badge-high' : c.relevance_score >= 55 ? 'score-badge-mid' : 'score-badge-low'}">Relevance: ${c.relevance_score || '—'}</span>
            </div>
          </div>
          <div class="history-item-actions">
            <button class="history-action-btn" onclick="previewSavedLetter('${c.id}')" aria-label="Edit ${displayName}">Edit</button>
            <button class="history-action-btn" onclick="renameSavedLetter('${c.id}')" aria-label="Rename ${displayName}">Rename</button>
            <button class="history-action-btn" onclick="duplicateSavedLetter('${c.id}')" aria-label="Clone ${displayName}">Clone</button>
            <button class="history-action-btn" onclick="archiveSavedLetter('${c.id}', ${!isArchived})" aria-label="${archiveLabel} ${displayName}">${archiveLabel}</button>
            <button class="history-action-btn delete" onclick="deleteSavedLetter('${c.id}')" aria-label="Delete ${displayName}">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function handleHistorySearch() { renderHistoryList(rawHistoryList); }
  function handleHistorySort() { renderHistoryList(rawHistoryList); }
  function handleHistoryFilter() { renderHistoryList(rawHistoryList); }

  async function previewSavedLetter(id) {
    const item = rawHistoryList.find(c => c.id === id);
    if (!item) return;

    currentSavedLetterId = item.id;
    document.getElementById('jobTitle').value = item.job_title || '';
    document.getElementById('companyName').value = item.company_name || '';
    document.getElementById('jobDescription').value = item.job_description || '';
    document.getElementById('highlights').value = item.highlights || '';
    document.getElementById('tone').value = item.tone || 'Professional';
    document.getElementById('length').value = item.length || 'Medium';

    const meta = item.variants?.meta || {};
    document.getElementById('hiringManager').value = meta.hiringManager || '';
    document.getElementById('industry').value = meta.industry || '';
    document.getElementById('location').value = meta.location || '';
    document.getElementById('experienceLevel').value = meta.experienceLevel || 'Mid';
    if (document.getElementById('mustHaveSkills')) document.getElementById('mustHaveSkills').value = meta.keySkills || '';
    if (document.getElementById('keyAchievements')) document.getElementById('keyAchievements').value = meta.achievements || '';
    if (document.getElementById('softSkills')) document.getElementById('softSkills').value = meta.softSkills || '';
    if (document.getElementById('companyResearch')) document.getElementById('companyResearch').value = meta.companyResearch || '';
    if (document.getElementById('linkedinUrl')) document.getElementById('linkedinUrl').value = meta.linkedinUrl || '';
    if (document.getElementById('portfolio')) document.getElementById('portfolio').value = meta.portfolio || '';
    if (document.getElementById('additionalInstructions')) document.getElementById('additionalInstructions').value = meta.additionalInstructions || '';
    document.getElementById('opening').value = item.opening || '';
    document.getElementById('closing').value = item.closing || '';

    const sheet = document.getElementById('editorSheet');
    sheet.innerHTML = cleanEscapes(item.generated_letter);
    saveEditorState();
    updateCounts();

    lastGeneratedData = {
      letter: item.generated_letter,
      variants: item.variants?.texts || [],
      ats_score: item.ats_score,
      relevance_score: item.relevance_score,
      keywords_used: item.keywords_used || [],
      detailed_scores: meta.detailed_scores || {},
      suggestions: meta.suggestions || []
    };

    updateGauges(meta.detailed_scores || {});
    renderATSAnalysis(lastGeneratedData);
    renderAtsSuggestions(meta.suggestions || []);
    renderVariants(item.variants?.texts || [], item.generated_letter);

    showToast('success', `Loaded: ${meta.custom_title || item.job_title}`);
    switchEditorTab('editPane');
    switchWizardTab('jobInfo');

    // Scroll to the workspace so the user sees the editor immediately
    const workspace = document.querySelector('.cl-workspace');
    if (workspace) workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function renameSavedLetter(id) {
    const item = rawHistoryList.find(c => c.id === id);
    if (!item) return;

    const modal = document.getElementById('renameConfirmModal');
    const inputEl = document.getElementById('renameInput');
    const confirmBtn = document.getElementById('renameConfirmBtn');

    if (!modal || !inputEl || !confirmBtn) {
      // Fallback
      const title = item.variants?.meta?.custom_title || `${item.job_title} @ ${item.company_name}`;
      const newTitle = prompt('Enter a new title for this cover letter:', title);
      if (newTitle === null || !newTitle.trim()) return;
      return performRename(id, item, newTitle);
    }

    const title = item.variants?.meta?.custom_title || `${item.job_title} @ ${item.company_name}`;
    inputEl.value = title;
    modal.style.display = 'flex';
    inputEl.focus();
    inputEl.select();

    await new Promise(resolve => {
      const handleConfirm = () => { cleanupModal(); resolve(inputEl.value); };
      const handleCancel = () => { cleanupModal(); resolve(null); };
      function cleanupModal() {
        modal.style.display = 'none';
        confirmBtn.removeEventListener('click', handleConfirm);
        modal.querySelector('.btn-secondary').removeEventListener('click', handleCancel);
        inputEl.removeEventListener('keydown', handleKeydown);
      }
      function handleKeydown(e) {
        if (e.key === 'Enter') handleConfirm();
      }
      confirmBtn.addEventListener('click', handleConfirm, { once: true });
      modal.querySelector('.btn-secondary').addEventListener('click', handleCancel, { once: true });
      inputEl.addEventListener('keydown', handleKeydown);
    }).then(newTitle => {
      if (newTitle !== null && newTitle.trim()) {
        performRename(id, item, newTitle);
      }
    });
  }

  async function performRename(id, item, newTitle) {
    try {
      const variantsObj = item.variants || {};
      variantsObj.meta = variantsObj.meta || {};
      variantsObj.meta.custom_title = newTitle.trim();

      const { error } = await client.from('cover_letters').update({
        variants: variantsObj
      }).eq('id', id);

      if (error) throw error;
      showToast('success', 'Cover letter renamed.');
      await loadHistory();
    } catch (err) {
      showToast('error', 'Rename failed: ' + err.message);
    }
  }

  async function duplicateSavedLetter(id) {
    const item = rawHistoryList.find(c => c.id === id);
    if (!item) return;

    try {
      const meta = item.variants?.meta || {};
      const cloneMeta = { ...meta, custom_title: `${meta.custom_title || item.job_title} (Copy)` };

      const payload = {
        user_id: currentUser.id,
        job_title: item.job_title,
        company_name: item.company_name,
        job_description: item.job_description,
        highlights: item.highlights,
        tone: item.tone,
        length: item.length,
        opening: item.opening,
        closing: item.closing,
        generated_letter: item.generated_letter,
        keywords_used: item.keywords_used,
        ats_score: item.ats_score,
        relevance_score: item.relevance_score,
        variants: {
          texts: item.variants?.texts || [],
          meta: cloneMeta
        }
      };

      const { error } = await client.from('cover_letters').insert([payload]);
      if (error) throw error;
      showToast('success', 'Cover letter cloned.');
      await loadHistory();
    } catch (err) {
      showToast('error', 'Cloning failed: ' + err.message);
    }
  }

  async function archiveSavedLetter(id, state) {
    const item = rawHistoryList.find(c => c.id === id);
    if (!item) return;

    try {
      const variantsObj = item.variants || {};
      variantsObj.meta = variantsObj.meta || {};
      variantsObj.meta.is_archived = state;

      const { error } = await client.from('cover_letters').update({
        variants: variantsObj
      }).eq('id', id);

      if (error) throw error;
      showToast('success', state ? 'Letter moved to archive.' : 'Letter restored to active workspace.');
      await loadHistory();
    } catch (err) {
      showToast('error', 'Archive failed: ' + err.message);
    }
  }

  async function deleteSavedLetter(id) {
    const item = rawHistoryList.find(c => c.id === id);
    const modal = document.getElementById('deleteConfirmModal');
    const bodyEl = document.getElementById('deleteModalBody');
    const confirmBtn = document.getElementById('deleteConfirmBtn');
    
    if (!modal || !confirmBtn) {
      // Fallback if modal not found
      if (!window.confirm('Permanently delete this cover letter?')) return;
    } else {
      const title = item?.variants?.meta?.custom_title || `${item?.job_title || 'this letter'} @ ${item?.company_name || ''}`;
      if (bodyEl) bodyEl.textContent = `Are you sure you want to permanently delete "${title}"? This action cannot be undone.`;
      modal.style.display = 'flex';
      confirmBtn.focus();

      await new Promise(resolve => {
        const handleConfirm = () => { cleanupModal(); resolve(true); };
        const handleCancel = () => { cleanupModal(); resolve(false); };
        function cleanupModal() {
          modal.style.display = 'none';
          confirmBtn.removeEventListener('click', handleConfirm);
          modal.querySelector('.btn-secondary').removeEventListener('click', handleCancel);
        }
        confirmBtn.addEventListener('click', handleConfirm, { once: true });
        modal.querySelector('.btn-secondary').addEventListener('click', handleCancel, { once: true });
      }).then(async (confirmed) => {
        if (!confirmed) return;
        try {
          const { error } = await client.from('cover_letters').delete().eq('id', id);
          if (error) throw error;
          showToast('success', 'Cover letter deleted.');
          if (currentSavedLetterId === id) currentSavedLetterId = null;
          await loadHistory();
        } catch (err) {
          showToast('error', 'Delete failed: ' + err.message);
        }
      });
      return;
    }

    try {
      const { error } = await client.from('cover_letters').delete().eq('id', id);
      if (error) throw error;
      showToast('success', 'Cover letter deleted.');
      if (currentSavedLetterId === id) currentSavedLetterId = null;
      await loadHistory();
    } catch (err) {
      showToast('error', 'Delete failed: ' + err.message);
    }
  }

  async function downloadPDF() {
    const letterText = document.getElementById('editorSheet').innerText;
    if (!letterText.trim()) {
      showToast('error', 'No letter text content to export.');
      return;
    }

    const downloadBtn = document.getElementById('downloadPdfBtn');
    const originalText = downloadBtn.textContent;

    try {
      downloadBtn.innerHTML = '<i data-lucide="loader-circle" class="spin" width="16" stroke-width="2"></i> Printing...';
        if(window.lucide) lucide.createIcons();
      downloadBtn.disabled = true;

      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          letter: letterText,
          jobTitle: document.getElementById('jobTitle').value,
          companyName: document.getElementById('companyName').value,
          candidateName: document.getElementById('candidateName').value
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'PDF generation failed' }));
        throw new Error(err.error || 'PDF generation failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const job = (document.getElementById('jobTitle').value || 'letter').replace(/\s+/g, '-');
      a.download = `CoverLetter-${job}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('success', 'Cover letter PDF exported!');
    } catch (err) {
      showToast('error', 'PDF export failed: ' + err.message);
    } finally {
      downloadBtn.textContent = originalText;
      downloadBtn.disabled = false;
    }
  }

  function downloadDOCX() {
    const letterText = document.getElementById('editorSheet').innerText;
    if (!letterText.trim()) {
      showToast('error', 'No letter content to export.');
      return;
    }

    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const candidateName = document.getElementById('candidateName').value || '';
    const jobTitle = document.getElementById('jobTitle').value || '';
    const companyName = document.getElementById('companyName').value || '';

    const headerHtml = `
      ${candidateName ? `<p><strong>${candidateName}</strong></p>` : ''}
      <p>${dateStr}</p>
      ${jobTitle ? `<p><strong>Re: ${jobTitle}${companyName ? ` — ${companyName}` : ''}</strong></p>` : ''}
      <hr/>
    `;

    const bodyHtml = letterText.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

    const docxHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>Cover Letter</title>
        <style>
          body { font-family: 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; margin: 1in; color: #111111; }
          p { margin: 0 0 10pt 0; text-align: justify; }
          strong { font-weight: bold; }
          hr { border: 0; border-top: 1px solid #cccccc; margin: 12pt 0; }
        </style>
      </head>
      <body>
        ${headerHtml}
        ${bodyHtml}
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + docxHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const job = (jobTitle || 'letter').replace(/\s+/g, '-');
    a.download = `CoverLetter-${job}-${new Date().toISOString().split('T')[0]}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('success', 'Cover letter DOCX exported!');
  }

  // ── Progressive Step Accordion Helper ──
  const STEP_ORDER = ['jobInfo', 'companyDetails', 'resumeTab', 'writerSettings', 'aiPersonalization'];
  window.toggleStepAccordion = function(stepId) {
    document.querySelectorAll('.cl-step-accordion').forEach(acc => {
      const isActive = acc.id === `step-${stepId}`;
      acc.classList.toggle('active', isActive);
      const header = acc.querySelector('.cl-step-header[role="button"]');
      if (header) header.setAttribute('aria-expanded', isActive ? 'true' : 'false');
    });
    // Update step progress label
    const stepIndex = STEP_ORDER.indexOf(stepId);
    const progressLabel = document.getElementById('stepProgressLabel');
    if (progressLabel && stepIndex !== -1) {
      progressLabel.textContent = `STEP ${stepIndex + 1} OF ${STEP_ORDER.length}`;
    }
  };

  // ── Auto Detect Company Info from Website URL ──
  window.autoDetectCompanyInfo = function() {
    const urlInput = document.getElementById('companyWebsite');
    const nameInput = document.getElementById('companyName');
    if (!urlInput || !urlInput.value.trim()) return;

    try {
      let rawUrl = urlInput.value.trim();
      if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        rawUrl = 'https://' + rawUrl;
      }
      const parsed = new URL(rawUrl);
      let host = parsed.hostname.replace(/^www\./, '');
      let nameGuess = host.split('.')[0];
      if (nameGuess && (!nameInput.value || nameInput.value.trim() === '')) {
        nameInput.value = nameGuess.charAt(0).toUpperCase() + nameGuess.slice(1);
      }
    } catch (_) {}
  };

  // ── Extracted Resume Chips Renderer ──
  function renderResumeChips(skillsArray) {
    const container = document.getElementById('resumeChipsContainer');
    const section = document.getElementById('extractedChipsSection');
    if (!container || !section) return;

    if (!skillsArray || !skillsArray.length) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    container.innerHTML = skillsArray.map((skill, idx) => `
      <span class="cl-chip" id="chip-${idx}">
        ${skill}
        <span class="cl-chip-remove" onclick="this.parentElement.remove()">×</span>
      </span>
    `).join('');
  }

  // ── Selection Floating Toolbar Handler ──
  let _floatingToolbarTimeout = null;
  document.addEventListener('selectionchange', () => {
    if (_floatingToolbarTimeout) cancelAnimationFrame(_floatingToolbarTimeout);
    _floatingToolbarTimeout = requestAnimationFrame(() => {
      const toolbar = document.getElementById('floatingEditorToolbar');
      const sheet = document.getElementById('editorSheet');
      if (!toolbar || !sheet) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !sheet.contains(selection.anchorNode)) {
        toolbar.classList.remove('visible');
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const sheetRect = sheet.getBoundingClientRect();

      if (rect.width > 0 && rect.height > 0) {
        toolbar.style.top = `${rect.top - sheetRect.top - 45}px`;
        toolbar.style.left = `${rect.left - sheetRect.left + (rect.width / 2) - 80}px`;
        toolbar.classList.add('visible');
        toolbar.setAttribute('aria-hidden', 'false');
      } else {
        toolbar.classList.remove('visible');
        toolbar.setAttribute('aria-hidden', 'true');
      }
    });
  });

  // ── AI Selection Rewrite Helper & Coach ──
  let aiImprovementHistory = [];
  
  window.undoLastAiChange = function() {
    if (aiImprovementHistory.length === 0) return;
    const lastChange = aiImprovementHistory.pop();
    const sheet = document.getElementById('editorSheet');
    if (!sheet) return;
    
    let textContent = sheet.innerText;
    if (textContent.includes(lastChange.replacement)) {
      sheet.innerText = textContent.replace(lastChange.replacement, lastChange.original);
      saveEditorState();
      updateCounts();
      showToast('success', 'Undid last AI change.');
    } else {
      showToast('error', 'Could not locate the text to undo.');
    }
    
    if (aiImprovementHistory.length === 0) {
      const undoBtn = document.getElementById('undoAiBtn');
      if (undoBtn) undoBtn.style.display = 'none';
    }
  };

  function applyAiSuggestion(original, replacement) {
    const sheet = document.getElementById('editorSheet');
    let textContent = sheet.innerText;

    if (textContent.includes(original)) {
      sheet.innerText = textContent.replace(original, replacement);
      saveEditorState();
      updateCounts();
      
      aiImprovementHistory.push({ original, replacement });
      const undoBtn = document.getElementById('undoAiBtn');
      if (undoBtn) undoBtn.style.display = 'inline-flex';
      
      showToast('success', 'AI suggestion applied!');
    } else {
      showToast('error', 'Could not locate the text in the editor. Content may have changed.');
    }
  }
  
  window.reviewSelectedParagraph = async function() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      showToast('error', 'Select a paragraph in the editor to review.');
      return;
    }
    const selectedText = selection.toString().trim();
    if (!selectedText) { showToast('error', 'Select text to review.'); return; }
    
    const toolbar = document.getElementById('floatingEditorToolbar');
    if (toolbar) toolbar.classList.remove('visible');
    
    switchEditorTab('suggestionsPane');
    
    const listEl = document.getElementById('suggestionsList');
    if (listEl) {
      listEl.innerHTML = '<p style="color:var(--text-3); font-size:0.85rem; text-align:center; padding:1rem 0;"><i data-lucide="loader-circle" class="spin" width="16" stroke-width="2"></i> Reviewing paragraph...</p>';
      if (window.lucide) lucide.createIcons();
    }
    
    try {
      const payload = {
        mode: 'review_paragraph',
        selectedText,
        jobTitle: (document.getElementById('jobTitle')?.value || '').trim(),
        companyName: (document.getElementById('companyName')?.value || '').trim(),
        tone: document.getElementById('tone')?.value || 'Professional'
      };
      
      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch('/api/cover-letter-assistant', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Paragraph review failed');
      
      const data = await res.json();
      
      if (listEl) {
        let keywordsHtml = '';
        if (data.keywordsInserted && data.keywordsInserted.length > 0) {
          keywordsHtml = `<div style="margin-top: 8px;"><strong style="font-size: 0.8rem; color: var(--text-2);">Suggested Keywords:</strong> <span style="font-size: 0.8rem; color: var(--text-3);">${data.keywordsInserted.join(', ')}</span></div>`;
        }
        
        listEl.innerHTML = `
          <div class="suggestion-card">
            <div class="suggestion-header" style="margin-bottom:0.6rem;">
              <span class="suggestion-cat-badge badge-impact">Paragraph Review</span>
            </div>
            <div class="suggestion-reason"><strong>Why this suggestion?</strong><br/>${data.explanation || 'Provides a more polished, professional alternative.'}</div>
            ${keywordsHtml}
            <div style="display:flex; gap:0.5rem; justify-content:flex-end; margin-top:0.75rem;">
              <button class="btn btn-secondary btn-sm" style="min-height:30px; font-size:0.75rem; padding:0.2rem 0.5rem;" onclick="copySuggestionText(\`${escapeJSQuotes(data.suggestedText || '')}\`)">Copy</button>
              <button class="btn btn-primary btn-sm" style="min-height:30px; font-size:0.75rem; padding:0.2rem 0.5rem;" onclick="openCompareModal('ai-review', \`${escapeJSQuotes(selectedText)}\`, \`${escapeJSQuotes(data.suggestedText)}\`, \`${escapeJSQuotes(data.explanation || '')}\`)">Compare & Apply</button>
            </div>
          </div>
        `;
      }
    } catch (err) {
      if (listEl) listEl.innerHTML = `<p style="color:var(--danger); font-size:0.85rem;">Error: ${err.message}</p>`;
      showToast('error', err.message);
    }
  };

  window.handleAiChatSubmit = async function(event) {
    event.preventDefault();
    const inputEl = document.getElementById('aiChatInput');
    const message = inputEl.value.trim();
    if (!message) return;
    
    inputEl.value = '';
    
    const historyEl = document.getElementById('aiChatHistory');
    if (!historyEl) return;
    
    // Append user message
    historyEl.innerHTML += `
      <div style="align-self: flex-end; background: var(--accent); color: white; padding: 8px 12px; border-radius: var(--r-md); max-width: 85%; font-size: 0.9rem;">
        ${message}
      </div>
    `;
    
    // Append AI loading state
    const loadingId = 'ai-msg-' + Date.now();
    historyEl.innerHTML += `
      <div id="${loadingId}" style="align-self: flex-start; background: var(--bg-card); border: 1px solid var(--border); color: var(--text-2); padding: 8px 12px; border-radius: var(--r-md); max-width: 85%; font-size: 0.9rem; display: flex; align-items: center; gap: 8px;">
        <i data-lucide="loader-circle" class="spin" width="14"></i> Thinking...
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    
    const scrollArea = document.getElementById('aiAssistantScrollArea');
    if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
    
    try {
      const sheet = document.getElementById('editorSheet');
      const payload = {
        mode: 'chat',
        message,
        letterText: sheet ? sheet.innerText : '',
        jobTitle: (document.getElementById('jobTitle')?.value || '').trim(),
        companyName: (document.getElementById('companyName')?.value || '').trim(),
        tone: document.getElementById('tone')?.value || 'Professional'
      };
      
      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch('/api/cover-letter-assistant', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Chat failed');
      
      const data = await res.json();
      const msgEl = document.getElementById(loadingId);
      if (msgEl) {
        msgEl.innerHTML = data.reply;
        msgEl.style.color = 'var(--text-1)';
      }
    } catch (err) {
      const msgEl = document.getElementById(loadingId);
      if (msgEl) {
        msgEl.innerHTML = `<span style="color: var(--danger)">Error: ${err.message}</span>`;
      }
    }
    
    if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
  };

  window.aiImproveSelection = async function(action, useWholeDocument = false) {
    const selection = window.getSelection();
    let selectedText = '';
    
    if (useWholeDocument) {
      const sheet = document.getElementById('editorSheet');
      if (sheet) selectedText = sheet.innerText.trim();
    } else {
      if (!selection || selection.isCollapsed) {
        showToast('error', 'Select text in the editor to improve.');
        return;
      }
      selectedText = selection.toString().trim();
    }
    
    if (!selectedText) { showToast('error', 'No text to improve.'); return; }

    const toolbar = document.getElementById('floatingEditorToolbar');
    if (toolbar) toolbar.classList.remove('visible');

    showToast('success', `AI processing quick action...`);

    try {
      const payload = {
        mode: 'quick_action',
        selectedText,
        action,
        jobTitle: (document.getElementById('jobTitle')?.value || '').trim(),
        companyName: (document.getElementById('companyName')?.value || '').trim(),
        tone: document.getElementById('tone')?.value || 'Professional'
      };
      
      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch('/api/cover-letter-assistant', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'AI rewrite failed');
      }

      const data = await res.json();
      if (data.suggestedText) {
        openCompareModal('ai-' + Date.now(), selectedText, data.suggestedText, data.explanation);
      } else {
        throw new Error('No rewritten text returned');
      }
    } catch (err) {
      showToast('error', 'AI rewrite failed: ' + err.message);
    }
  };

  // ── Updated Live Metrics Calculator & Empty State Handler ──
  function updateCounts() {
    updateBasicMetrics();
    updateComplexMetricsDebounced();
    updateATSAnalysisDebounced();
  }

  // ── clearWorkspace: New Letter button handler ──
  window.clearWorkspace = function() {
    const formFields = ['jobTitle','companyName','jobDescription','highlights','tone','length',
      'opening','closing','hiringManager','industry','location','companyWebsite',
      'referral','experienceLevel','candidateName','additionalInstructions',
      'mustHaveSkills','keyAchievements','creativityLevel','focusArea',
      'softSkills', 'companyResearch', 'linkedinUrl', 'portfolio'];
    formFields.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'SELECT') { el.selectedIndex = 0; }
      else { el.value = ''; }
    });
    clearResume();

    const sheet = document.getElementById('editorSheet');
    if (sheet) { sheet.innerHTML = ''; sheet.style.display = 'block'; }
    updateBasicMetrics();

    // Reset state
    currentSavedLetterId = null;
    lastGeneratedData = null;
    
    // Clear autosave draft
    localStorage.removeItem('cc_cover_letter_draft');

    currentAtsData = null;
    editorHistory = [''];
    historyIndex = 0;

    // Reset editor metrics
    updateCounts();

    // Reset ATS bars
    ['overallATSScore','keywordMatch','recruiterReadability','professionalTone','personalization'].forEach(id => {
      animateGauge(id, 0);
      const valEl = document.getElementById(`val-${id}`);
      if (valEl) valEl.textContent = '—';
    });

    // Reset suggestions
    const listEl = document.getElementById('suggestionsList');
    if (listEl) listEl.innerHTML = '<p style="color:var(--text-3); font-size:0.85rem;">No recommendations generated yet. Click "Generate Cover Letter" to receive instant feedback.</p>';
    const sumEl = document.getElementById('suggestionsSummaryContainer');
    if (sumEl) sumEl.innerHTML = '';
    const countEl = document.getElementById('suggestionsCount');
    if (countEl) countEl.textContent = '';

    // Reset variants
    const varEl = document.getElementById('variantsContainer');
    if (varEl) varEl.innerHTML = '<p style="color:var(--text-3); font-size:0.85rem;">No variants generated yet.</p>';

    // Reset ATS keywords section
    const atsKw = document.getElementById('atsKeywordsSection');
    if (atsKw) atsKw.innerHTML = '<h4 style="margin-bottom:0.5rem; font-size:0.88rem; font-weight:700;">Keyword Breakdown</h4><p style="font-size:0.82rem; color:var(--text-3);">Generate your letter to view matched vs missing job description keywords.</p>';

    // Navigate to step 1
    toggleStepAccordion('jobInfo');
    switchEditorTab('editPane');
    showToast('success', 'Workspace cleared. Ready for a new letter.');
  };

  // Export to window namespace for HTML click bindings
  window.previewSavedLetter = previewSavedLetter;
  window.renameSavedLetter = renameSavedLetter;
  window.duplicateSavedLetter = duplicateSavedLetter;
  window.archiveSavedLetter = archiveSavedLetter;
  window.deleteSavedLetter = deleteSavedLetter;
  window.closeCompareModal = closeCompareModal;
  window.ignoreSuggestion = ignoreSuggestion;
  window.copySuggestionText = copySuggestionText;
  window.openCompareModal = openCompareModal;
  window.applyAtsSuggestion = applyAtsSuggestion;
  window.reanalyzeATS = reanalyzeATS;
  window.copyVariantText = copyVariantText;
  window.applyVariantText = applyVariantText;
  window.clearResume = clearResume;
  window.switchWizardTab = switchWizardTab;
  window.switchEditorTab = switchEditorTab;
  window.executeEditorCommand = executeEditorCommand;
  window.clearWorkspace = clearWorkspace;

  window.handleCopyCoverLetter = handleCopyCoverLetter;
  window.copyToClipboard = window.copyToClipboard || handleCopyCoverLetter;

  // Initialize
  window.addEventListener('load', init);
})();
