/**
 * cold-email.js
 * Cold Email generator controller logic.
 */
(function () {
  let supabaseClient = null;
  let currentUser = null;
  let savedResumes = [];
  
  // Application State Variables
  let currentGenerated = null; // Stores currently generated payload
  let activeVariantKey = 'A'; // 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  let currentDraftId = null; // Stores loaded draft database ID
  let activeGenerationController = null; // Tracks active generation request for duplicate prevention

  // Make toggleAccordion available globally
  window.toggleAccordion = function(id) {
    const item = document.getElementById(id);
    if (!item) return;
    
    // Close others
    document.querySelectorAll('.accordion-item').forEach(el => {
      if (el.id !== id) {
        el.classList.remove('active');
      }
    });
    
    // Toggle clicked
    item.classList.toggle('active');
  };

  // Clipboard utility
  const ClipboardUtility = {
    async copy(text, successMsg = 'Copied to clipboard!') {
      try {
        if (!navigator.clipboard) {
          throw new Error('Clipboard API not available');
        }
        await navigator.clipboard.writeText(text);
        showToast(successMsg, false);
      } catch (err) {
        console.error('Failed to copy text: ', err);
        showToast('Failed to copy text. Please copy manually.', true);
      }
    }
  };

  function updateLiveStats() {
    const editorBody = document.getElementById('editorBody');
    if (!editorBody) return;
    
    const text = editorBody.innerText.trim();
    
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const chars = text.length;
    const readingTimeSec = Math.ceil((words / 200) * 60);
    
    const metricWords = document.getElementById('metricWords');
    const metricChars = document.getElementById('metricChars');
    const metricTime = document.getElementById('metricTime');
    
    if (metricWords) metricWords.innerHTML = `<i data-lucide="file-text" width="14"></i> <span class="val">${words}</span> words`;
    if (metricChars) metricChars.innerHTML = `<i data-lucide="hash" width="14"></i> <span class="val">${chars}</span> characters`;
    if (metricTime) {
      const timeStr = readingTimeSec < 60 ? '<1 min' : `${Math.ceil(readingTimeSec/60)} min`;
      metricTime.innerHTML = `<i data-lucide="clock" width="14"></i> <span class="val">${timeStr}</span> read`;
    }
    
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  // Dual-Layer Storage Layer
  const DraftStore = {
    dbAvailable: null,

    async checkDb() {
      if (!supabaseClient || !currentUser) {
        this.dbAvailable = false;
        return false;
      }
      try {
        const { data, error } = await supabaseClient.from('email_history').select('id').limit(1);
        if (error && error.code === 'PGRST205') {
          this.dbAvailable = false;
        } else {
          this.dbAvailable = true;
        }
      } catch (e) {
        this.dbAvailable = false;
      }
      return this.dbAvailable;
    },

    async save(draftData) {
      if (this.dbAvailable === null) await this.checkDb();

      const metadata = {
        variantName: activeVariantKey,
        emailGoal: document.getElementById('emailGoal').value,
        recipientName: document.getElementById('recipientName').value,
        companyName: document.getElementById('companyName').value,
        position: document.getElementById('position').value,
        recipientEmail: document.getElementById('recipientEmail').value,
        companyContext: document.getElementById('companyContext').value,
        relevantTrigger: document.getElementById('relevantTrigger').value,
        userName: document.getElementById('userName').value,
        background: document.getElementById('background').value,
        keySkills: document.getElementById('keySkills').value,
        tone: document.getElementById('tone').value,
        length: document.getElementById('length').value,
        ctaStyle: document.getElementById('ctaStyle').value,
        personalizationLevel: document.getElementById('personalizationLevel').value,
        generatedPayload: currentGenerated
      };

      const record = {
        user_id: currentUser?.id || 'anonymous',
        company: metadata.companyName,
        recipient_title: metadata.position,
        subject: draftData.subject,
        body: draftData.body,
        variant: JSON.stringify(metadata),
        status: 'draft',
        created_at: new Date().toISOString()
      };

      if (this.dbAvailable) {
        try {
          if (currentDraftId && !String(currentDraftId).startsWith('local_')) {
            const { data, error } = await supabaseClient
              .from('email_history')
              .update({
                company: record.company,
                recipient_title: record.recipient_title,
                subject: record.subject,
                body: record.body,
                variant: record.variant
              })
              .eq('id', currentDraftId)
              .select();
            if (error) throw error;
            return data[0];
          } else {
            const { data, error } = await supabaseClient
              .from('email_history')
              .insert([record])
              .select();
            if (error) throw error;
            if (data && data[0]) {
              currentDraftId = data[0].id;
            }
            return data[0];
          }
        } catch (err) {
          console.warn('Supabase save failed, falling back to localStorage:', err);
        }
      }

      // LocalStorage Fallback
      let localDrafts = JSON.parse(localStorage.getItem('cc_email_drafts') || '[]');
      if (currentDraftId && String(currentDraftId).startsWith('local_')) {
        const idx = localDrafts.findIndex(d => d.id === currentDraftId);
        if (idx !== -1) {
          localDrafts[idx] = { ...localDrafts[idx], ...record, id: currentDraftId };
        }
      } else {
        currentDraftId = 'local_' + Math.random().toString(36).substr(2, 9);
        const newDraft = { ...record, id: currentDraftId };
        localDrafts.unshift(newDraft);
      }
      localStorage.setItem('cc_email_drafts', JSON.stringify(localDrafts));
      return { id: currentDraftId, ...record };
    },

    async list() {
      if (this.dbAvailable === null) await this.checkDb();

      let dbDrafts = [];
      if (this.dbAvailable) {
        try {
          const { data, error } = await supabaseClient
            .from('email_history')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });
          if (!error && data) {
            dbDrafts = data;
          }
        } catch (err) {
          console.warn('Supabase list failed:', err);
        }
      }

      const localDrafts = JSON.parse(localStorage.getItem('cc_email_drafts') || '[]');
      const userLocalDrafts = localDrafts.filter(d => d.user_id === (currentUser?.id || 'anonymous'));

      const combined = [...userLocalDrafts, ...dbDrafts];
      combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return combined;
    },

    async delete(id) {
      if (this.dbAvailable === null) await this.checkDb();

      if (this.dbAvailable && !String(id).startsWith('local_')) {
        try {
          const { error } = await supabaseClient
            .from('email_history')
            .delete()
            .eq('id', id);
          if (!error) return true;
        } catch (err) {
          console.warn('Supabase delete failed:', err);
        }
      }

      let localDrafts = JSON.parse(localStorage.getItem('cc_email_drafts') || '[]');
      localDrafts = localDrafts.filter(d => d.id !== id);
      localStorage.setItem('cc_email_drafts', JSON.stringify(localDrafts));
      return true;
    }
  };

  async function init() {
    try {
      await window.appSdk.ready;
      if (!window.AuthManager) return;
      const session = await window.AuthManager.requireAuth();
      if (!session) return;
      
      supabaseClient = window.appSdk.client;
      currentUser = session.user;

      await DraftStore.checkDb();
      if (!DraftStore.dbAvailable) {
        showToast('Draft database table not found. Operating in local storage mode.', false);
      }

      await loadHistory();
      wireUpLivePreview();
      loadSavedResumes();

      // Initialize tabs
      setupTabs();
      
      // Initialize Copy action
      const btnCopyEmail = document.getElementById('btnCopyEmail');
      if (btnCopyEmail) {
        btnCopyEmail.addEventListener('click', () => {
          const subject = document.getElementById('editorSubject').value;
          const body = document.getElementById('editorBody').innerText;
          const text = `Subject: ${subject}\n\n${body}`;
          ClipboardUtility.copy(text, 'Email copied to clipboard!');
        });
      }
      
      // Save Draft
      const btnSaveDraft = document.getElementById('btnSaveDraft');
      if (btnSaveDraft) {
        btnSaveDraft.addEventListener('click', async () => {
          btnSaveDraft.innerHTML = '<i data-lucide="loader-circle" class="spin" width="16" stroke-width="2"></i> Saving...';
          if(window.lucide) lucide.createIcons();
          try {
            await DraftStore.save({
              subject: document.getElementById('editorSubject').value,
              body: document.getElementById('editorBody').innerHTML // Save HTML for formatting
            });
            showToast('Draft saved successfully!');
            loadHistory(); // refresh list
          } catch(e) {
            showToast('Failed to save draft.', true);
          } finally {
            btnSaveDraft.innerHTML = '<i data-lucide="save" width="16"></i> Save';
            if(window.lucide) lucide.createIcons();
          }
        });
      }

    } catch (err) {
      console.error('Initialization error:', err);
      showToast('System initialization error: ' + err.message, true);
    }
  }

  function showToast(msg, isError = false) {
    if (window.LayoutManager && typeof window.LayoutManager.showToast === 'function') {
      window.LayoutManager.showToast(msg, isError ? 'error' : 'success');
    } else {
      window.appSdk.ui.showToast(msg, isError);
    }
  }

  function wireUpLivePreview() {
    const editorBody = document.getElementById('editorBody');
    if (editorBody) {
      editorBody.addEventListener('input', updateLiveStats);
    }
  }

  function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panes.forEach(p => p.classList.remove('active'));
        
        tab.classList.add('active');
        const target = document.getElementById(tab.dataset.target);
        if (target) {
          target.classList.add('active');
        }
      });
    });
  }

  function validateForm() {
    let isValid = true;
    document.querySelectorAll('.error-msg').forEach(el => el.remove());
    document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));

    function setError(id, msg) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('invalid');
        const err = document.createElement('span');
        err.className = 'error-msg';
        err.textContent = msg;
        el.parentNode.appendChild(err);
        
        // Open the parent accordion section
        const section = el.closest('.accordion-item');
        if (section && !section.classList.contains('active')) {
          window.toggleAccordion(section.id);
        }
      }
      isValid = false;
    }

    const goal = document.getElementById('emailGoal').value;
    if (!goal) setError('emailGoal', 'Please select an email goal');

    const company = document.getElementById('companyName').value.trim();
    if (!company) setError('companyName', 'Company Name is required');

    const position = document.getElementById('position').value.trim();
    if (!position) setError('position', 'Recipient Position is required');

    const userName = document.getElementById('userName').value.trim();
    if (!userName) setError('userName', 'Your Name is required');

    const background = document.getElementById('background').value.trim();
    if (!background) setError('background', 'Background summary is required');
    else if (background.length < 10) setError('background', 'Please write a brief summary of at least 10 characters');

    const keySkills = document.getElementById('keySkills').value.trim();
    if (!keySkills) setError('keySkills', 'Key Skills are required');

    if (!isValid) {
      showToast('Please correct the highlighted form errors.', true);
      const firstErr = document.querySelector('.invalid');
      if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      // Mark sections as completed
      ['sec-recipient', 'sec-company', 'sec-background', 'sec-goal', 'sec-personalization'].forEach(id => {
        const sec = document.getElementById(id);
        if (sec) sec.classList.add('completed');
      });
    }

    return isValid;
  }

  async function loadSavedResumes() {
    if (!supabaseClient) return;
    document.getElementById('btnSelectSaved').addEventListener('click', async e => {
      e.stopPropagation();
      if (!currentUser) return showToast('Please log in first to access saved resumes.', true);
      
      const modal = document.getElementById('nexusModal');
      modal.style.display = 'flex';
      // Force reflow
      void modal.offsetWidth;
      modal.classList.add('show');
      
      const list = document.getElementById('rlist');
      list.innerHTML = '<p style="color:var(--text-3);text-align:center">Loading saved resumes...</p>';

      try {
        const { data, error } = await supabaseClient
          .from('resumes')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false });

        if (error || !data || data.length === 0) {
          list.innerHTML = '<p style="color:var(--text-3);text-align:center;">No saved resumes found. Build one on the Resume builder page first!</p>';
          return;
        }
        savedResumes = data;
        list.innerHTML = '';
        data.forEach((r, idx) => {
          const div = document.createElement('div');
          div.style.cssText = 'padding: 0.85rem; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: var(--r-sm); cursor: pointer; transition: 0.2s;';
          div.className = 'ritem';
          div.dataset.idx = idx;
          div.innerHTML = `<h4 style="font-size:0.95rem; margin-bottom:0.25rem;">${r.full_name || 'Untitled'}</h4><p style="font-size:0.8rem; color:var(--text-2);">${r.title || ''}</p>`;
          
          div.addEventListener('mouseover', () => {
            div.style.borderColor = 'var(--primary)';
            div.style.background = 'rgba(124, 58, 237, 0.05)';
          });
          div.addEventListener('mouseout', () => {
            div.style.borderColor = 'var(--border)';
            div.style.background = 'rgba(255, 255, 255, 0.02)';
          });
          
          list.appendChild(div);
        });
      } catch (err) {
        list.innerHTML = '<p style="color:var(--danger);text-align:center;">Error loading resumes.</p>';
      }
    });
  }

  const closeModalEl = document.getElementById('closeModal');
  if (closeModalEl) {
    closeModalEl.addEventListener('click', e => { 
      e.stopPropagation(); 
      document.getElementById('nexusModal').classList.remove('show'); 
      setTimeout(() => document.getElementById('nexusModal').style.display = 'none', 200);
    });
  }
  const nexusModalEl = document.getElementById('nexusModal');
  if (nexusModalEl) {
    nexusModalEl.addEventListener('click', e => { 
      if (e.target.id === 'nexusModal') {
        nexusModalEl.classList.remove('show');
        setTimeout(() => nexusModalEl.style.display = 'none', 200);
      }
    });
  }

  document.getElementById('rlist')?.addEventListener('click', e => {
    const item = e.target.closest('.ritem');
    if (!item) return;
    const idx = Number(item.dataset.idx);
    if (isNaN(idx) || !savedResumes[idx]) return;
    const r = savedResumes[idx];
    
    if (r.full_name) document.getElementById('userName').value = r.full_name;
    
    let bg = '';
    if (r.professional_summary) bg += r.professional_summary + ' ';
    document.getElementById('background').value = bg.trim().substring(0, 400);

    if (r.skills && Array.isArray(r.skills)) {
      document.getElementById('keySkills').value = r.skills.slice(0, 8).join(', ');
    }

    let expStr = '';
    if (r.experience && Array.isArray(r.experience) && r.experience.length > 0) {
      r.experience.slice(0, 2).forEach(ex => {
        expStr += `${ex.title} at ${ex.company}: ${ex.description || ''}\n`;
      });
    }
    
    document.getElementById('nexusModal').classList.remove('show');
    setTimeout(() => document.getElementById('nexusModal').style.display = 'none', 200);
    showToast('Context imported from saved resume!');
  });

  document.getElementById('emailForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateForm()) return;

    document.getElementById('errAlert').style.display = 'none';
    
    const loadingState = document.getElementById('loadingState');
    loadingState.style.display = 'block';
    const btn = document.getElementById('genBtn');
    btn.disabled = true;

    if (activeGenerationController) {
      activeGenerationController.abortReason = 'stale';
      activeGenerationController.abort('stale');
    }

    const controller = new AbortController();
    activeGenerationController = controller;

    const payload = {
      action: 'generate',
      emailGoal: document.getElementById('emailGoal').value,
      recipient: {
        name: document.getElementById('recipientName').value.trim(),
        company: document.getElementById('companyName').value.trim(),
        position: document.getElementById('position').value.trim(),
        email: document.getElementById('recipientEmail').value.trim()
      },
      context: {
        companyContext: document.getElementById('companyContext').value.trim(),
        relevantTrigger: document.getElementById('relevantTrigger').value.trim()
      },
      userContext: {
        name: document.getElementById('userName').value.trim(),
        background: document.getElementById('background').value.trim(),
        keySkills: document.getElementById('keySkills').value.trim()
      },
      personalization: {
        tone: document.getElementById('tone').value,
        length: document.getElementById('length').value,
        ctaStyle: document.getElementById('ctaStyle').value,
        level: document.getElementById('personalizationLevel').value
      }
    };

    const timeoutDuration = 60000;
    const timeoutId = setTimeout(() => {
      controller.abortReason = 'timeout';
      controller.abort('timeout');
    }, timeoutDuration);

    try {
      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      let res;
      let data;
      try {
        res = await fetch('/api/cold-email', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        data = await res.json();
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) throw new Error(data.error || `Generation failed: HTTP ${res.status}`);
      
      currentGenerated = data;
      activeVariantKey = 'A';
      currentDraftId = null; 

      renderActiveVariant();
      
      if (data.fallbackUsed) {
        showToast('AI service currently unavailable. Local fallback drafts applied.', false);
      } else {
        showToast('Email generated successfully!');
      }

    } catch (err) {
      console.error('[CareerCraft] Cold email generation error:', err);

      if (err.name === 'AbortError') {
        const reason = controller.abortReason || controller.signal.reason || 'unknown';
        if (reason === 'stale') return;

        const alert = document.getElementById('errAlert');
        alert.style.display = 'block';
        document.getElementById('errMsg').textContent = 'Generation timed out. Please try again or reduce your input length.';
        alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('Generation timed out. Please try again.', true);
      } else {
        const isNetwork = err.message?.includes('fetch') || err.message?.includes('NetworkError');
        const isRateLimit = err.message?.includes('429') || err.message?.toLowerCase().includes('rate');

        let userMsg;
        if (isNetwork) {
          userMsg = 'No connection detected. Please check your internet and try again.';
        } else if (isRateLimit) {
          userMsg = 'Generation is temporarily busy. Please wait a moment and try again.';
        } else {
          userMsg = 'We couldn\u2019t generate your email right now. Please try again in a moment.';
        }

        const alert = document.getElementById('errAlert');
        alert.style.display = 'block';
        document.getElementById('errMsg').textContent = userMsg;
        alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast(userMsg, true);
      }
    } finally {
      if (activeGenerationController === controller) {
        loadingState.style.display = 'none';
        btn.disabled = false;
        activeGenerationController = null;
      }
    }
  });

  function getVariantByKey(key) {
    if (!currentGenerated || !currentGenerated.variants) return null;
    if (Array.isArray(currentGenerated.variants)) {
      const keyToIndex = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5 };
      return currentGenerated.variants[keyToIndex[key]];
    }
    return currentGenerated.variants[key];
  }

  function renderActiveVariant() {
    if (!currentGenerated) return;

    // Use variant A as default if no specific array is provided
    let variant = null;
    if (currentGenerated.subject && currentGenerated.body) {
      variant = currentGenerated;
    } else {
      variant = getVariantByKey(activeVariantKey);
    }
    
    if (!variant) {
        // Mock fallback if API format changes
        variant = {
            subject: `Inquiry regarding ${document.getElementById('position').value}`,
            body: `Hi ${document.getElementById('recipientName').value || 'there'},\n\nI'm reaching out...`
        };
    }

    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('editorContent').style.display = 'block';

    document.getElementById('editorSubject').value = variant.subject || '';
    
    // Replace newlines with <br> for contenteditable div
    const htmlBody = (variant.body || '').replace(/\n/g, '<br>');
    document.getElementById('editorBody').innerHTML = htmlBody;
    
    updateLiveStats();
    
    // Update Score
    const evalData = currentGenerated.evaluation || { overallScore: 85, strengths: ["Clear"], weaknesses: ["Could be shorter"] };
    const scoreBadge = document.getElementById('metricScore');
    
    const mainScore = document.getElementById('mainScoreValue');
    mainScore.textContent = evalData.overallScore || 85;
    
    let scoreColor = 'var(--success)';
    if (evalData.overallScore < 60) scoreColor = 'var(--danger)';
    else if (evalData.overallScore < 80) scoreColor = 'var(--warning)';
    
    mainScore.style.borderColor = scoreColor;
    
    if (scoreBadge) {
      scoreBadge.innerHTML = `<i data-lucide="award" width="14" style="color:${scoreColor}"></i> Score: <span class="val" style="color:${scoreColor}">${evalData.overallScore || 85}</span>`;
    }
    
    document.getElementById('scoreDesc').textContent = "Based on our AI heuristic evaluation for cold outreach.";
    
    // Populate score details
    const scoreDetailsList = document.getElementById('scoreDetailsList');
    scoreDetailsList.innerHTML = `
      <div class="score-item success">
        <i data-lucide="check-circle" width="16"></i>
        <div>
          <div style="font-weight:600; margin-bottom:0.25rem;">Strengths</div>
          <div style="color:var(--text-2);">${(evalData.strengths || ["Professional tone"]).join(', ')}</div>
        </div>
      </div>
      <div class="score-item warning">
        <i data-lucide="alert-triangle" width="16"></i>
        <div>
          <div style="font-weight:600; margin-bottom:0.25rem;">Needs Improvement</div>
          <div style="color:var(--text-2);">${(evalData.weaknesses || ["Add more personalization"]).join(', ')}</div>
        </div>
      </div>
    `;

    // Render Follow ups
    renderFollowUps(currentGenerated.followUps || []);

    // Render Variants if any
    renderVariants(currentGenerated.variants || []);
    
    if(window.lucide) lucide.createIcons();
  }
  
  function renderFollowUps(followUps) {
    const timeline = document.getElementById('followUpTimeline');
    if (!followUps || followUps.length === 0) {
      // Mock follow-ups if missing
      followUps = [
        { title: "Follow-Up 1", timing: "3-4 days later", subject: "Re: " + document.getElementById('editorSubject').value, body: "Hi,\n\nJust floating this to the top of your inbox..." },
        { title: "Follow-Up 2", timing: "7-10 days later", subject: "Re: " + document.getElementById('editorSubject').value, body: "Hi,\n\nI know things can get busy. If now isn't a good time..." }
      ];
    }
    
    let html = '';
    followUps.forEach(fu => {
      html += `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <div class="timeline-header">
              <span class="timeline-title">${fu.title || 'Follow-Up'}</span>
              <span class="timeline-meta">${fu.timing || '3 days later'}</span>
            </div>
            <div style="font-size:0.85rem; font-weight:600; margin-bottom:0.5rem; color:var(--text-1)">Subject: ${fu.subject || ''}</div>
            <div style="font-size:0.85rem; color:var(--text-2); white-space:pre-wrap; margin-bottom:1rem;">${fu.body || ''}</div>
            <button type="button" class="btn-secondary" style="width:auto; padding:0.4rem 0.75rem; font-size:0.75rem;" onclick="navigator.clipboard.writeText('Subject: ${fu.subject}\\n\\n${fu.body}')">
              <i data-lucide="copy" width="14"></i> Copy
            </button>
          </div>
        </div>
      `;
    });
    timeline.innerHTML = html;
  }
  
  function renderVariants(variants) {
    const vList = document.getElementById('variantsList');
    if (!variants || variants.length === 0) {
      vList.innerHTML = '<p style="color:var(--text-3); text-align:center;">No variants available.</p>';
      return;
    }
    
    let html = '';
    variants.forEach((v, idx) => {
      html += `
        <div class="variant-card ${idx === 0 ? 'active' : ''}">
          <div class="variant-header">
            <span>${v.tone || 'Variant ' + (idx+1)}</span>
            <button class="btn-secondary" style="padding:0.25rem 0.5rem; font-size:0.7rem;" onclick="applyVariant(${idx})">Use This</button>
          </div>
          <div style="font-size:0.85rem; font-weight:600; margin-bottom:0.5rem; color:var(--text-1)">${v.subject}</div>
          <div class="variant-body">${v.body}</div>
        </div>
      `;
    });
    vList.innerHTML = html;
  }
  
  window.applyVariant = function(idx) {
    if(!currentGenerated || !currentGenerated.variants) return;
    const v = currentGenerated.variants[idx];
    if(v) {
      document.getElementById('editorSubject').value = v.subject;
      document.getElementById('editorBody').innerHTML = v.body.replace(/\n/g, '<br>');
      updateLiveStats();
      showToast('Variant applied to editor.');
      
      // update active state in ui
      document.querySelectorAll('.variant-card').forEach((card, i) => {
        if(i === idx) card.classList.add('active');
        else card.classList.remove('active');
      });
    }
  };

  // Setup AI Assistant Actions
  document.querySelectorAll('.ai-action-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const editorBody = document.getElementById('editorBody');
      const text = editorBody.innerText.trim();
      
      if (!text) {
        showToast('Please draft an email first.', true);
        return;
      }
      
      const loading = document.getElementById('aiLoading');
      const diffPreview = document.getElementById('aiDiffPreview');
      
      loading.style.display = 'block';
      diffPreview.style.display = 'none';
      
      // Mock API call to represent AI modification
      setTimeout(() => {
        loading.style.display = 'none';
        
        let suggested = text;
        if (action === 'shorten') {
          suggested = text.split('\n').slice(0, Math.max(2, text.split('\n').length - 1)).join('\n');
        } else if (action === 'confident') {
          suggested = text.replace(/I think/gi, "I am confident").replace(/I hope/gi, "I look forward to");
        } else {
          suggested = "Here is a slightly refined version of your email:\n\n" + text;
        }
        
        if (action === 'subject') {
           const subjectList = document.getElementById('subjectList');
           document.getElementById('subjectAlternatives').style.display = 'block';
           subjectList.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-input); padding:0.5rem 0.75rem; border:1px solid var(--border); border-radius:var(--r-sm);">
              <span style="font-size:0.85rem;">Quick question about ${document.getElementById('position').value || 'the role'}</span>
              <button class="btn-secondary" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="document.getElementById('editorSubject').value='Quick question about ${document.getElementById('position').value || 'the role'}'; showToast('Subject updated');"><i data-lucide="check" width="14"></i></button>
            </div>
           `;
           if(window.lucide) lucide.createIcons();
           return;
        }
        
        document.getElementById('diffOriginal').innerText = text.substring(0, 100) + '...';
        document.getElementById('diffSuggested').innerText = suggested.substring(0, 100) + '...';
        
        diffPreview.style.display = 'block';
        
        document.getElementById('btnAcceptAi').onclick = () => {
          editorBody.innerHTML = suggested.replace(/\n/g, '<br>');
          updateLiveStats();
          diffPreview.style.display = 'none';
          showToast('Changes applied.');
        };
        
        document.getElementById('btnRejectAi').onclick = () => {
          diffPreview.style.display = 'none';
        };
      }, 1500);
    });
  });

  async function loadHistory() {
    const draftsList = document.getElementById('draftsList');
    if (!draftsList) return;

    try {
      const drafts = await DraftStore.list();
      
      if (drafts.length === 0) {
        draftsList.innerHTML = '<p style="color:var(--text-3); text-align:center; grid-column:1/-1;">No saved drafts yet.</p>';
        return;
      }
      
      let html = '';
      drafts.forEach(d => {
        let meta = null;
        try { meta = JSON.parse(d.variant); } catch(e){}
        const title = d.company ? `Outreach: ${d.company}` : 'Untitled Outreach';
        
        html += `
          <div class="draft-card">
            <div>
              <div class="draft-card-meta">
                <span>${new Date(d.created_at).toLocaleDateString()}</span>
                <span>${meta?.emailGoal || 'Email'}</span>
              </div>
              <div class="draft-card-title">${title}</div>
              <div class="draft-card-desc">${d.subject || '(No Subject)'}</div>
            </div>
            <div class="draft-card-actions">
              <button class="draft-btn delete-btn" data-id="${d.id}" style="color:var(--danger); border-color:rgba(239,68,68,0.2);">Delete</button>
              <button class="draft-btn load-btn" data-id="${d.id}" style="color:var(--primary); border-color:rgba(124,58,237,0.2);">Load</button>
            </div>
          </div>
        `;
      });
      draftsList.innerHTML = html;

      // Attach event listeners
      document.querySelectorAll('.load-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.dataset.id;
          const draft = drafts.find(d => String(d.id) === String(id));
          if (draft) {
            currentDraftId = draft.id;
            document.getElementById('editorSubject').value = draft.subject || '';
            document.getElementById('editorBody').innerHTML = (draft.body || '').replace(/\n/g, '<br>');
            
            try {
              const meta = JSON.parse(draft.variant);
              if (meta) {
                if (meta.emailGoal) document.getElementById('emailGoal').value = meta.emailGoal;
                if (meta.recipientName) document.getElementById('recipientName').value = meta.recipientName;
                if (meta.companyName) document.getElementById('companyName').value = meta.companyName;
                if (meta.position) document.getElementById('position').value = meta.position;
                if (meta.recipientEmail) document.getElementById('recipientEmail').value = meta.recipientEmail;
              }
            } catch(e){}
            
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('editorContent').style.display = 'block';
            updateLiveStats();
            showToast('Draft loaded successfully.');
            
            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        });
      });
      
      document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.dataset.id;
          if (confirm('Are you sure you want to delete this draft?')) {
            await DraftStore.delete(id);
            showToast('Draft deleted.');
            loadHistory();
          }
        });
      });
      
    } catch (e) {
      console.error(e);
      draftsList.innerHTML = '<p style="color:var(--danger); text-align:center; grid-column:1/-1;">Failed to load drafts.</p>';
    }
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
