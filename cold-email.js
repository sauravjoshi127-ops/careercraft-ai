/**
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
