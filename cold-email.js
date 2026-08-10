/**
 * cold-email.js
 * Cold Email generation and editing controller logic, unified with Cover Letter UI.
 */
(function () {
  let client = null;
  let currentUser = null;
  let currentEmailData = null;
  let isGenerating = false;
  
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
      
      // Global attachment for inline onclick handlers
      window.toggleStepAccordion = toggleStepAccordion;
      window.triggerAiAction = triggerAiAction;
      window.rejectAiAction = rejectAiAction;
      window.applyAiAction = applyAiAction;
      
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

  // --- Accordion Logic (Copied from Cover Letter) ---
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
  async function loadSavedResumesDropdown() {
    const container = document.getElementById('resumeImportActionContainer');
    if (!container) return;
    
    // Attach the file input listener once
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
      if (savedResumes.length > 0) {
        html += `
          <button type="button" class="btn btn-secondary btn-sm" id="btnUseResume">
            <i data-lucide="file-text" width="16" height="16" style="margin-right:6px;"></i> Use My Resume
          </button>
        `;
      } else {
        html += `
          <span style="font-size: 0.9rem; color: var(--text-3);">No saved resume found. Import one from your computer to continue.</span>
        `;
      }

      html += `
        <button type="button" class="btn btn-secondary btn-sm" id="btnImportResume">
          <i data-lucide="upload" width="16" height="16" style="margin-right:6px;"></i> Import Resume
        </button>
      `;

      container.innerHTML = html;

      if (document.getElementById('btnUseResume')) {
        document.getElementById('btnUseResume').addEventListener('click', handleUseMyResume);
      }
      document.getElementById('btnImportResume').addEventListener('click', () => {
        document.getElementById('resumeFileInput').click();
      });

      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleComputerImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const backgroundInput = document.getElementById('background');
    if (backgroundInput.value.trim().length > 0) {
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
        const extractedText = await window.appSdk.resume.uploadAndParse(file);
        
        const token = await window.AuthManager.getToken();
        const response = await fetch('/api/ai-suggestions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                section: 'cold-email-value',
                content: extractedText
            })
        });

        if (!response.ok) throw new Error('Failed to generate value proposition');
        const data = await response.json();
        
        backgroundInput.value = data.suggestions || '';
        trackProgress();
        showToast("Resume imported successfully.", false);
    } catch (err) {
        console.error(err);
        showToast("Couldn't read this resume. Please check the file and try again.", true);
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
    
    const backgroundInput = document.getElementById('background');
    if (backgroundInput.value.trim().length > 0) {
        const confirmed = confirm("Replace existing content with resume information?");
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
        const resumeData = savedResumes[0];
        document.getElementById('userName').value = resumeData.full_name || '';

        const token = await window.AuthManager.getToken();
        const response = await fetch('/api/ai-suggestions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                section: 'cold-email-value',
                resumeData: resumeData
            })
        });

        if (!response.ok) throw new Error('Failed to extract resume');
        const data = await response.json();
        
        backgroundInput.value = data.suggestions || '';
        trackProgress();
        showToast("Resume imported successfully.", false);
    } catch (err) {
        console.error(err);
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
    
    modeGuided.addEventListener('click', () => {
        modeGuided.classList.replace('btn-secondary', 'btn-primary');
        modeGuided.style.background = '';
        modeQuick.classList.replace('btn-primary', 'btn-secondary');
        modeQuick.style.background = 'transparent';
        modeQuick.style.border = 'none';
        
        advOptions.style.display = 'block';
        relGroup.style.display = 'block';
        ctxGroup.style.display = 'block';
    });
    
    modeQuick.addEventListener('click', () => {
        modeQuick.classList.replace('btn-secondary', 'btn-primary');
        modeQuick.style.background = '';
        modeGuided.classList.replace('btn-primary', 'btn-secondary');
        modeGuided.style.background = 'transparent';
        modeGuided.style.border = 'none';
        
        advOptions.style.display = 'none';
        relGroup.style.display = 'none';
        ctxGroup.style.display = 'none';
    });

    // Goal Grid
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

    // Input Tracking for Step Badges
    document.querySelectorAll('input, textarea, select').forEach(el => {
        el.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(trackProgress, 300);
        });
    });
    
    // Copy Action
    document.getElementById('copyBtn').addEventListener('click', async () => {
        const text = document.getElementById('emailBody').innerText;
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!');
        } catch(e) {
            showToast('Failed to copy', true);
        }
    });

    // Generate Action
    document.getElementById('generateBtn').addEventListener('click', handleGenerate);
  }

  function trackProgress() {
    // Check required fields per step
    const s1 = document.getElementById('position').value.trim();
    updateBadge('status-1', s1 ? 'Complete' : 'In progress', !!s1);
    
    const s2 = document.getElementById('companyName').value.trim();
    updateBadge('status-2', s2 ? 'Complete' : 'Not started', !!s2);
    
    const uName = document.getElementById('userName').value.trim();
    const bg = document.getElementById('background').value.trim();
    updateBadge('status-3', (uName && bg) ? 'Complete' : 'Not started', !!(uName && bg));
    
    const s4 = document.getElementById('emailGoal').value;
    updateBadge('status-4', s4 ? 'Complete' : 'Not started', !!s4);
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
    if (isGenerating) return;
    
    const company = document.getElementById('companyName').value;
    const position = document.getElementById('position').value;
    const userName = document.getElementById('userName').value;
    const bg = document.getElementById('background').value;
    
    if(!company || !position || !userName || !bg) {
        showToast('Please complete all required fields.', true);
        toggleStepAccordion( !position ? 'recipient' : (!company ? 'company' : 'value') );
        return;
    }
    
    isGenerating = true;
    const btn = document.getElementById('generateBtn');
    btn.innerHTML = `<i data-lucide="loader-circle" class="spin" width="16"></i> Generating...`;
    if (window.lucide) lucide.createIcons();

    const payload = {
        action: 'generate',
        emailGoal: document.getElementById('emailGoal').value,
        recipient: {
            name: document.getElementById('recipientName').value,
            company: company,
            position: position
        },
        userContext: {
            name: userName,
            background: bg,
            whyContacting: document.getElementById('companyContext').value
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
        
        const res = await fetch('/api/cold-email', { method: 'POST', headers, body: JSON.stringify(payload) });
        const data = await res.json();
        
        if(!res.ok) throw new Error(data.error || 'Failed to generate email');
        
        currentEmailData = data;
        renderWorkspace(data);
        
    } catch(e) {
        showToast(e.message, true);
    } finally {
        isGenerating = false;
        btn.innerHTML = `Generate Email <i data-lucide="sparkles" width="16"></i>`;
        if (window.lucide) lucide.createIcons();
    }
  }

  function renderWorkspace(data) {
    // Hide empty states, show real content
    document.getElementById('editorEmptyState').style.display = 'none';
    document.getElementById('editorDocumentFrame').style.display = 'flex';
    document.getElementById('copilotEmptyState').style.display = 'none';
    document.getElementById('copilotScoreHeader').style.display = 'flex';
    document.getElementById('copilotContent').style.display = 'block';
    document.getElementById('variantsEmptyState').style.display = 'none';
    document.getElementById('variantsContent').style.display = 'block';
    
    // Parse Variant A
    let lines = data.variantA.split('\n');
    let subject = lines.find(l => l.toLowerCase().startsWith('subject:'));
    if(subject) {
        subject = subject.replace(/subject:/i, '').trim();
        lines = lines.filter(l => !l.toLowerCase().startsWith('subject:'));
    } else {
        subject = 'Introduction / ' + document.getElementById('userName').value;
    }
    const body = lines.join('\n').trim();
    
    // Setup Subjects
    const subContainer = document.getElementById('subjectContainer');
    subContainer.innerHTML = '';
    const subs = [
        subject,
        'Quick question regarding ' + document.getElementById('companyName').value,
        'Connecting: ' + document.getElementById('userName').value
    ];
    subs.forEach((txt, i) => {
        const el = document.createElement('div');
        el.className = 'subject-pill' + (i === 0 ? ' active' : '');
        el.textContent = txt;
        el.addEventListener('click', () => {
            document.querySelectorAll('.subject-pill').forEach(p => p.classList.remove('active'));
            el.classList.add('active');
        });
        subContainer.appendChild(el);
    });
    
    // Editor
    const editor = document.getElementById('emailBody');
    editor.innerText = body;
    updateLiveMetrics();
    
    editor.addEventListener('input', () => {
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(() => {
            const label = document.getElementById('autosaveLabel');
            label.style.opacity = '1';
            setTimeout(() => label.style.opacity = '0', 2000);
            updateLiveMetrics();
        }, 1000);
    });

    // Variants
    const varCont = document.getElementById('variantsContainer');
    varCont.innerHTML = '';
    ['B', 'C'].forEach(k => {
        if(data['variant'+k]) {
            const card = document.createElement('div');
            card.className = 'cl-section-card';
            card.style.background = 'rgba(255,255,255,0.02)';
            card.innerHTML = `
                <div style="font-weight:600; margin-bottom:8px; font-size:0.85rem; color:var(--text-1);">Variant ${k}</div>
                <div style="font-size:0.85rem; color:var(--text-2); white-space:pre-wrap; max-height:80px; overflow:hidden;">${data['variant'+k]}</div>
                <button class="btn btn-secondary btn-sm" style="margin-top:12px;">Use this version</button>
            `;
            varCont.appendChild(card);
        }
    });

    // Follow-ups
    const folCont = document.getElementById('followUpsContainer');
    folCont.innerHTML = `
        <div class="cl-section-card" style="background:rgba(255,255,255,0.02);">
            <div style="font-weight:600; margin-bottom:4px; font-size:0.85rem; color:var(--text-1);">Follow-up 1 <span style="font-weight:400; font-size:0.75rem; color:var(--text-3); float:right;">3-5 business days</span></div>
            <div style="font-size:0.85rem; color:var(--text-2); margin-top:8px;">Hi ${document.getElementById('recipientName').value || 'there'},\n\nJust floating this to the top of your inbox. I know things are busy at ${document.getElementById('companyName').value}. Let me know if you have a moment to connect.</div>
        </div>
        <div class="cl-section-card" style="background:rgba(255,255,255,0.02);">
            <div style="font-weight:600; margin-bottom:4px; font-size:0.85rem; color:var(--text-1);">Final Follow-up <span style="font-weight:400; font-size:0.75rem; color:var(--text-3); float:right;">7-10 business days</span></div>
            <div style="font-size:0.85rem; color:var(--text-2); margin-top:8px;">Hi ${document.getElementById('recipientName').value || 'there'},\n\nI won't follow up again as I assume priorities are elsewhere right now. I'll keep following ${document.getElementById('companyName').value}'s progress!</div>
        </div>
    `;
  }
  
  function updateLiveMetrics() {
    const text = document.getElementById('emailBody').innerText || '';
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    document.getElementById('wordCount').textContent = words;
    document.getElementById('charCount').textContent = text.length;
    document.getElementById('readTime').textContent = Math.ceil(words / 200) + 'm';
  }

  // --- AI Actions ---
  function triggerAiAction(action) {
    const orig = document.getElementById('emailBody').innerText;
    const diffView = document.getElementById('aiDiffView');
    document.getElementById('diffOrig').innerText = orig.substring(0, 100) + '...';
    document.getElementById('diffSug').innerText = "Simulated " + action + " suggestion applied by AI...\n\n" + orig.substring(0, 80);
    diffView.style.display = 'block';
  }
  
  function rejectAiAction() {
    document.getElementById('aiDiffView').style.display = 'none';
  }
  
  function applyAiAction() {
    document.getElementById('emailBody').innerText = document.getElementById('diffSug').innerText;
    document.getElementById('aiDiffView').style.display = 'none';
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
            document.getElementById('emailBody').focus();
        }
      });
    });
  }

  init();
})();
