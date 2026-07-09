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

  let selectedLengthPreset = 'Short'; // 'Short' | 'Medium' | 'Long' | 'Custom'

  function selectLengthOption(preset) {
    selectedLengthPreset = preset;
    
    // Update UI active class
    document.querySelectorAll('.length-option-card').forEach(card => {
      if (card.dataset.preset === preset) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
    
    // Toggle custom inputs visibility
    const customInputs = document.getElementById('customLengthInputs');
    if (customInputs) {
      if (preset === 'Custom') {
        customInputs.style.display = 'block';
      } else {
        customInputs.style.display = 'none';
      }
    }
    
    updateLiveStats();
  }

  function getSelectedLengthRange() {
    if (selectedLengthPreset === 'Short') {
      return { min: 80, max: 100 };
    } else if (selectedLengthPreset === 'Medium') {
      return { min: 120, max: 170 };
    } else if (selectedLengthPreset === 'Long') {
      return { min: 180, max: 250 };
    } else {
      const minVal = parseInt(document.getElementById('minLengthInput').value, 10);
      const maxVal = parseInt(document.getElementById('maxLengthInput').value, 10);
      return {
        min: isNaN(minVal) ? 100 : minVal,
        max: isNaN(maxVal) ? 140 : maxVal
      };
    }
  }

  function setLengthUI(lengthType, minLength, maxLength) {
    selectedLengthPreset = lengthType || 'Short';
    
    document.querySelectorAll('.length-option-card').forEach(card => {
      if (card.dataset.preset === selectedLengthPreset) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
    
    const customInputs = document.getElementById('customLengthInputs');
    if (customInputs) {
      if (selectedLengthPreset === 'Custom') {
        customInputs.style.display = 'block';
        if (minLength) document.getElementById('minLengthInput').value = minLength;
        if (maxLength) document.getElementById('maxLengthInput').value = maxLength;
      } else {
        customInputs.style.display = 'none';
      }
    }
    updateLiveStats();
  }

  function calculateWordCount(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function calculateCharCount(text) {
    if (!text) return 0;
    return text.length;
  }

  function updateLiveStats() {
    const previewBody = document.getElementById('previewBody');
    if (!previewBody) return;
    
    const text = previewBody.textContent.trim();
    const isPlaceholder = text.startsWith('[Email Body text');
    
    const statsBar = document.getElementById('previewStatsBar');
    if (isPlaceholder || !text) {
      if (statsBar) statsBar.style.display = 'none';
      return;
    }
    
    if (statsBar) statsBar.style.display = 'flex';
    
    const words = calculateWordCount(text);
    const chars = calculateCharCount(text);
    const readingTimeSec = Math.ceil((words / 200) * 60);
    
    const wordCountEl = document.getElementById('statWordCount');
    const charCountEl = document.getElementById('statCharCount');
    const readTimeEl = document.getElementById('statReadTime');
    const statusBadge = document.getElementById('statLengthStatus');
    
    if (wordCountEl) wordCountEl.textContent = words;
    if (charCountEl) charCountEl.textContent = chars;
    if (readTimeEl) readTimeEl.textContent = `${readingTimeSec}s`;
    
    if (statusBadge) {
      const range = getSelectedLengthRange();
      if (words >= range.min && words <= range.max) {
        statusBadge.textContent = '✓ Within target';
        statusBadge.className = 'stat-status-badge status-ok';
      } else if (words < range.min) {
        statusBadge.textContent = `⚠ Too short (Target: ${range.min}–${range.max})`;
        statusBadge.className = 'stat-status-badge status-warning';
      } else {
        statusBadge.textContent = `⚠ Too long (Target: ${range.min}–${range.max})`;
        statusBadge.className = 'stat-status-badge status-warning';
      }
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

      const range = getSelectedLengthRange();
      const metadata = {
        variantName: activeVariantKey,
        emailGoal: draftData.emailGoal,
        recipientName: draftData.recipientName,
        linkedinUrl: draftData.linkedinUrl,
        website: draftData.companyWebsite,
        userName: draftData.userName,
        background: draftData.background,
        keySkills: draftData.keySkills,
        experience: draftData.experience,
        whyContacting: draftData.whyContacting,
        length: selectedLengthPreset,
        lengthType: selectedLengthPreset,
        minLength: range.min,
        maxLength: range.max,
        generatedPayload: currentGenerated
      };

      const record = {
        user_id: currentUser?.id || 'anonymous',
        company: draftData.companyName,
        recipient_title: draftData.position,
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
    const inputs = [
      'companyName', 'recipientName', 'position', 'userName', 
      'background', 'keySkills', 'experience', 'whyContacting', 'emailGoal'
    ];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', updateLivePreview);
        el.addEventListener('change', updateLivePreview);
      }
    });

    const bgInput = document.getElementById('background');
    if (bgInput) {
      bgInput.addEventListener('input', e => {
        document.getElementById('bgCt').textContent = `${e.target.value.length} / 400`;
      });
    }
    
    const previewBody = document.getElementById('previewBody');
    if (previewBody) {
      previewBody.addEventListener('input', updateLiveStats);
    }
    
    const minLenEl = document.getElementById('minLengthInput');
    const maxLenEl = document.getElementById('maxLengthInput');
    if (minLenEl) minLenEl.addEventListener('input', updateLiveStats);
    if (maxLenEl) maxLenEl.addEventListener('input', updateLiveStats);

    updateLivePreview();
  }

  function updateLivePreview() {
    if (currentGenerated) return;

    const goal = document.getElementById('emailGoal').value || '[Email Goal]';
    const company = document.getElementById('companyName').value.trim() || '[Company Name]';
    const recipient = document.getElementById('recipientName').value.trim() || '[Recipient Name]';
    const position = document.getElementById('position').value.trim() || '[Recipient Position]';
    const userName = document.getElementById('userName').value.trim() || '[Your Name]';
    const background = document.getElementById('background').value.trim() || '[Your Background summary]';
    const keySkills = document.getElementById('keySkills').value.trim() || '[Key Skills]';
    const experience = document.getElementById('experience').value.trim() || '[Accomplishments]';
    const whyContacting = document.getElementById('whyContacting').value.trim() || '[Why you are writing]';

    const subject = `inquiry regarding ${company.toLowerCase()} — ${goal.toLowerCase()}`;
    const body = `Hi ${recipient},\n\nI’m reaching out because I saw you work as the ${position} at ${company}.\n\nMy name is ${userName}, and I have a background in ${background}, with specialized skills in ${keySkills}.\n\nGiven my experience in ${experience}, I'm connecting to discuss ${whyContacting}.\n\nWould you be open to a brief 2-minute chat next week to see if my background aligns with your team's needs?\n\nBest,\n${userName}`;

    const updateDOM = () => {
      const subjectEl = document.getElementById('previewSubject');
      const bodyEl = document.getElementById('previewBody');
      const metaEl = document.getElementById('previewMeta');
      if (subjectEl) subjectEl.textContent = `Subject: ${subject}`;
      if (bodyEl) bodyEl.textContent = body;
      if (metaEl) metaEl.textContent = `To: ${recipient} (${company})`;
    };

    if (window.PerformanceManager) {
      window.PerformanceManager.scheduleUpdate(updateDOM);
    } else {
      updateDOM();
    }
  }

  function validateForm() {
    let isValid = true;
    document.querySelectorAll('.fg .error-msg').forEach(el => el.remove());
    document.querySelectorAll('.fg input, .fg textarea, .fg select').forEach(el => el.classList.remove('invalid'));

    function setError(id, msg) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('invalid');
        const err = document.createElement('span');
        err.className = 'error-msg';
        err.style.cssText = 'color:var(--danger);font-size:0.75rem;margin-top:0.25rem;font-weight:500;';
        err.textContent = msg;
        el.parentNode.appendChild(err);
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

    const experience = document.getElementById('experience').value.trim();
    if (!experience) setError('experience', 'Accomplishments are required');

    const whyContacting = document.getElementById('whyContacting').value.trim();
    if (!whyContacting) setError('whyContacting', 'Reason for contacting is required');

    const linkedin = document.getElementById('linkedinUrl').value.trim();
    if (linkedin && !/^https?:\/\/(www\.)?linkedin\.com\/.*$/i.test(linkedin)) {
      setError('linkedinUrl', 'Please enter a valid LinkedIn URL');
    }

    const website = document.getElementById('companyWebsite').value.trim();
    if (website && !/^https?:\/\/([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/i.test(website)) {
      setError('companyWebsite', 'Please enter a valid website URL');
    }

    if (selectedLengthPreset === 'Custom') {
      const minVal = parseInt(document.getElementById('minLengthInput').value, 10);
      const maxVal = parseInt(document.getElementById('maxLengthInput').value, 10);
      
      if (isNaN(minVal) || minVal < 1) {
        setError('minLengthInput', 'Min words must be at least 1');
      }
      if (isNaN(maxVal) || maxVal < 1) {
        setError('maxLengthInput', 'Max words must be at least 1');
      } else if (maxVal < minVal) {
        setError('maxLengthInput', 'Max words cannot be less than Min words');
      }
    }

    if (!isValid) {
      showToast('Please correct the highlighted form errors.', true);
      const firstErr = document.querySelector('.invalid');
      if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return isValid;
  }

  async function loadSavedResumes() {
    if (!supabaseClient) return;
    document.getElementById('btnSelectSaved').addEventListener('click', async e => {
      e.stopPropagation();
      if (!currentUser) return showToast('Please log in first to access saved resumes.', true);
      document.getElementById('nexusModal').classList.add('show');
      
      const list = document.getElementById('rlist');
      list.innerHTML = '<p style="color:var(--text-muted);text-align:center">Loading saved resumes...</p>';

      try {
        const { data, error } = await supabaseClient
          .from('resumes')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false });

        if (error || !data || data.length === 0) {
          list.innerHTML = '<p style="color:var(--text-muted);text-align:center;">No saved resumes found. Build one on the Resume builder page first!</p>';
          return;
        }
        savedResumes = data;
        list.innerHTML = '';
        data.forEach((r, idx) => {
          const div = document.createElement('div');
          div.className = 'ritem';
          div.dataset.idx = idx;
          div.innerHTML = `<h4>${r.full_name || 'Untitled'}</h4><p>${r.title || ''}</p>`;
          list.appendChild(div);
        });
      } catch (err) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Error loading resumes.</p>';
      }
    });
  }

  const closeModalEl = document.getElementById('closeModal');
  if (closeModalEl) {
    closeModalEl.addEventListener('click', e => { e.stopPropagation(); document.getElementById('nexusModal').classList.remove('show'); });
  }
  const nexusModalEl = document.getElementById('nexusModal');
  if (nexusModalEl) {
    nexusModalEl.addEventListener('click', e => { if (e.target.id === 'nexusModal') document.getElementById('nexusModal').classList.remove('show'); });
  }

  document.getElementById('rlist').addEventListener('click', e => {
    const item = e.target.closest('.ritem');
    if (!item) return;
    const idx = Number(item.dataset.idx);
    if (isNaN(idx) || !savedResumes[idx]) return;
    const r = savedResumes[idx];
    
    if (r.full_name) document.getElementById('userName').value = r.full_name;
    
    let bg = '';
    if (r.professional_summary) bg += r.professional_summary + ' ';
    document.getElementById('background').value = bg.trim().substring(0, 400);
    document.getElementById('bgCt').textContent = `${document.getElementById('background').value.length} / 400`;

    if (r.skills && Array.isArray(r.skills)) {
      document.getElementById('keySkills').value = r.skills.slice(0, 8).join(', ');
    }

    let expStr = '';
    if (r.experience && Array.isArray(r.experience) && r.experience.length > 0) {
      r.experience.slice(0, 2).forEach(ex => {
        expStr += `${ex.title} at ${ex.company}: ${ex.description || ''}\n`;
      });
    }
    document.getElementById('experience').value = expStr.trim();

    document.getElementById('nexusModal').classList.remove('show');
    showToast('Context imported from saved resume!');
    updateLivePreview();
  });

  async function handlePDFUpload(input) {
    const file = (input.files && (input.files[0] || input.files.item(0))) || null;
    if (!file) return;
    const status = document.getElementById('pdfStatus');
    status.style.display = 'block';
    status.style.color = 'var(--text-muted)';
    status.textContent = `⏳ Parsing ${file.name}...`;
    
    const form = new FormData();
    form.append('resume', file);
    
    const session = await window.appSdk.auth.getSession();
    const headers = {};
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    try {
      const res = await fetch('/api/upload-resume', { method: 'POST', headers: headers, body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      if (data.resumeText) {
        const bg = document.getElementById('background');
        bg.value = data.resumeText.substring(0, 400).trim();
        document.getElementById('bgCt').textContent = `${bg.value.length} / 400`;
        
        status.textContent = `Imported: ${file.name}`;
        status.style.color = 'var(--success)';
        showToast('PDF background summary imported!');
        updateLivePreview();
      } else {
        throw new Error('No text extracted');
      }
    } catch (err) {
      console.error(err);
      status.textContent = `Upload failed: ${err.message}`;
      status.style.color = 'var(--danger)';
      showToast('PDF parsing failed: ' + err.message, true);
    }
    input.value = '';
  }

  document.getElementById('btnUploadPdf')?.addEventListener('click', () => { document.getElementById('fileIn').click(); });
  document.getElementById('fileIn')?.addEventListener('change', function() { handlePDFUpload(this); });

  document.getElementById('emailForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateForm()) return;

    document.getElementById('errAlert').classList.remove('show');
    document.getElementById('skelWrap').classList.add('show');
    document.getElementById('genBtn').disabled = true;

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
        linkedinUrl: document.getElementById('linkedinUrl').value.trim(),
        website: document.getElementById('companyWebsite').value.trim()
      },
      userContext: {
        name: document.getElementById('userName').value.trim(),
        background: document.getElementById('background').value.trim(),
        keySkills: document.getElementById('keySkills').value.trim(),
        experience: document.getElementById('experience').value.trim(),
        whyContacting: document.getElementById('whyContacting').value.trim()
      },
      length: selectedLengthPreset,
      lengthType: selectedLengthPreset,
      minLength: getSelectedLengthRange().min,
      maxLength: getSelectedLengthRange().max
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
        showToast('Elite emails generated successfully!');
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        const reason = controller.abortReason || controller.signal.reason || 'unknown';
        if (reason === 'stale') return;
        
        let errorMsg = 'AI request timed out. Please try again or use local fallbacks.';
        const alert = document.getElementById('errAlert');
        document.getElementById('errMsg').textContent = errorMsg;
        alert.classList.add('show');
        alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('Email generation failed: ' + errorMsg, true);
      } else {
        let errorMsg = err.message;
        const alert = document.getElementById('errAlert');
        document.getElementById('errMsg').textContent = errorMsg;
        alert.classList.add('show');
        alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('Email generation failed: ' + errorMsg, true);
      }
    } finally {
      if (activeGenerationController === controller) {
        document.getElementById('skelWrap').classList.remove('show');
        document.getElementById('genBtn').disabled = false;
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

    const variant = getVariantByKey(activeVariantKey);
    if (!variant) return;

    document.getElementById('previewSubject').textContent = `Subject: ${variant.subject}`;
    document.getElementById('previewBody').textContent = variant.body;
    
    const recipientName = document.getElementById('recipientName').value.trim();
    const companyName = document.getElementById('companyName').value.trim();
    document.getElementById('previewMeta').textContent = `To: ${recipientName || '[RecipientName]'} at ${companyName || '[CompanyName]'}`;
    
    const badge = document.getElementById('previewApproachBadge');
    badge.textContent = variant.approach || `${variant.tone} Tone`;
    badge.style.display = 'inline-block';

    document.querySelectorAll('.tab').forEach(btn => {
      btn.classList.toggle('on', btn.dataset.key === activeVariantKey);
    });
    document.getElementById('variantTabsRow').style.display = 'block';

    const spamAlert = document.getElementById('spamAlert');
    if (spamAlert) spamAlert.style.display = 'none';

    const spamRadar = document.getElementById('spamRadarBox');
    if (spamRadar) {
      spamRadar.style.display = 'block';
      const spamScore = currentGenerated.spamScore || 0;
      const spamScoreBadge = document.getElementById('spamScoreBadge');
      spamScoreBadge.textContent = `${spamScore}% Risk`;
      spamScoreBadge.className = 'score-badge ' + (spamScore >= 50 ? 'score-low' : spamScore >= 20 ? 'score-mid' : 'score-high');
      
      const spamWordsList = document.getElementById('spamWordsList');
      const spamWordsContainer = document.getElementById('spamWordsContainer');
      const bodyTextLower = (variant.body + ' ' + variant.subject).toLowerCase();
      const activeSpam = (currentGenerated.spamWords || []).filter(word => bodyTextLower.includes(word.toLowerCase()));
      
      if (activeSpam.length > 0) {
        spamWordsContainer.style.display = 'block';
        spamWordsList.innerHTML = activeSpam.map(w => `<span class="tag tag-missing" style="background:rgba(239,68,68,0.15); color:#fca5a5; border:1px solid rgba(239,68,68,0.3); font-size:0.75rem; padding:0.25rem 0.5rem; border-radius:4px;">${w}</span>`).join('');
      } else {
        spamWordsContainer.style.display = 'none';
      }
      
      const spamRecsList = document.getElementById('spamRecsList');
      const recommendations = currentGenerated.spamRecommendations || [
        "Keep the email length below 150 words.",
        "Ensure CTA is clear, low-friction, and has no sales trigger words."
      ];
      spamRecsList.innerHTML = recommendations.map(rec => `<li>${rec}</li>`).join('');
    }

    renderQualityMetrics();
    renderSubjectLines();

    if (currentGenerated.followUp) {
      document.getElementById('fuBody').textContent = currentGenerated.followUp;
      document.getElementById('fuCard').style.display = 'block';
    } else {
      document.getElementById('fuCard').style.display = 'none';
    }

    document.getElementById('optimizerBox').style.display = 'block';
    document.getElementById('subjectsBox').style.display = 'block';
    document.getElementById('qualityBox').style.display = 'block';
    
    updateLiveStats();
  }

  const vtabsEl = document.getElementById('vtabs');
  if (vtabsEl) {
    vtabsEl.addEventListener('click', e => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      activeVariantKey = tab.dataset.key;
      renderActiveVariant();
    });
  }

  function renderQualityMetrics() {
    if (!currentGenerated || !currentGenerated.evaluation) return;
    const evalData = currentGenerated.evaluation;

    const badge = document.getElementById('overallScoreBadge');
    badge.textContent = `Overall Score: ${evalData.overallScore}%`;
    badge.className = 'score-badge ' + (evalData.overallScore >= 75 ? 'score-high' : evalData.overallScore >= 50 ? 'score-mid' : 'score-low');

    function updateBar(id, val) {
      const valEl = document.getElementById(`scoreVal${id}`);
      const barEl = document.getElementById(`scoreBar${id}`);
      if (valEl && barEl) {
        valEl.textContent = `${val}%`;
        barEl.style.width = `${val}%`;
      }
    }

    updateBar('Personalization', evalData.personalizationScore || evalData.overallScore || 0);
    updateBar('OpenRate', evalData.openRatePrediction || evalData.overallScore || 0);
    updateBar('Recruiter', evalData.recruiterEngagementScore || evalData.overallScore || 0);
    updateBar('Tone', evalData.professionalToneScore || evalData.overallScore || 0);
    updateBar('Spam', evalData.spamRiskScore || currentGenerated.spamScore || 0);
    updateBar('Grammar', evalData.grammarScore || 95);
    updateBar('Clarity', evalData.clarityScore || 90);

    const listContainer = document.getElementById('suggestionsInteractiveList');
    if (listContainer) {
      listContainer.innerHTML = '';
      const suggestions = currentGenerated.suggestions || [];
      
      if (suggestions.length === 0) {
        listContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">No optimization recommendations. Your copy is ready to go!</p>';
      } else {
        suggestions.forEach(item => {
          const card = document.createElement('div');
          card.className = 'subject-item'; 
          card.style.cssText = 'flex-direction:column; align-items:flex-start; gap:0.5rem; padding:0.85rem; border-color:var(--border);';
          card.id = `suggestion-card-${item.id}`;
          
          card.innerHTML = `
            <div style="font-size:0.8rem; color:var(--text); font-weight:500;">${item.explanation}</div>
            ${item.originalText && item.suggestedText ? `
              <div style="font-size:0.75rem; color:var(--text-muted); background:rgba(0,0,0,0.15); padding:0.4rem; border-radius:4px; width:100%; border-left:2px solid var(--primary);">
                <div style="text-decoration:line-through; opacity:0.6;">${item.originalText}</div>
                <div style="color:var(--success); font-weight:500; margin-top:0.15rem;">+ ${item.suggestedText}</div>
              </div>
            ` : ''}
            <div style="display:flex; gap:0.4rem; width:100%; justify-content:flex-end; margin-top:0.25rem;">
              ${item.originalText && item.suggestedText ? `
                <button type="button" class="draft-btn apply" style="padding:0.2rem 0.5rem; font-size:0.7rem; background:rgba(16,185,129,0.15); color:#a7f3d0; border-color:rgba(16,185,129,0.3);" onclick="applySuggestion('${item.id}', \`${escapeJSQuotes(item.originalText)}\`, \`${escapeJSQuotes(item.suggestedText)}\`)">Apply</button>
              ` : ''}
              <button type="button" class="draft-btn ignore" style="padding:0.2rem 0.5rem; font-size:0.7rem; background:rgba(255,255,255,0.05); color:var(--text-muted); border-color:var(--border);" onclick="ignoreSuggestion('${item.id}')">Ignore</button>
              <button type="button" class="draft-btn regen" style="padding:0.2rem 0.5rem; font-size:0.7rem; background:rgba(124,58,237,0.15); color:#ddd6fe; border-color:rgba(124,58,237,0.3);" onclick="regenerateSuggestion('${item.id}', \`${escapeJSQuotes(item.explanation)}\`)">Regenerate</button>
            </div>
          `;
          listContainer.appendChild(card);
        });
      }
    }

    document.getElementById('strengthsText').innerHTML = `<strong>Strengths:</strong> ${evalData.strengths.join(' · ')}`;
    document.getElementById('weaknessesText').innerHTML = `<strong>Weaknesses:</strong> ${evalData.weaknesses.join(' · ')}`;
  }

  function escapeJSQuotes(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  function applySuggestion(id, originalText, suggestedText) {
    const previewBody = document.getElementById('previewBody');
    let currentText = previewBody.textContent;
    
    if (currentText.includes(originalText)) {
      currentText = currentText.replace(originalText, suggestedText);
      previewBody.textContent = currentText;
      
      const v = getVariantByKey(activeVariantKey);
      if (v) v.body = currentText;
      
      showToast('Suggestion applied successfully!');
      ignoreSuggestion(id);
    } else {
      const regex = new RegExp(originalText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
      if (regex.test(currentText)) {
        currentText = currentText.replace(regex, suggestedText);
        previewBody.textContent = currentText;
        const v = getVariantByKey(activeVariantKey);
        if (v) v.body = currentText;
        showToast('Suggestion applied successfully!');
        ignoreSuggestion(id);
      } else {
        showToast('Original text not found in preview. Edit manually.', true);
      }
    }
  }

  function ignoreSuggestion(id) {
    const el = document.getElementById(`suggestion-card-${id}`);
    if (el) {
      el.style.transition = 'all 0.3s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      setTimeout(() => {
        el.remove();
        const list = document.getElementById('suggestionsInteractiveList');
        if (list && list.children.length === 0) {
          list.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">All suggestions resolved!</p>';
        }
      }, 300);
    }
  }

  function regenerateSuggestion(id, explanation) {
    document.getElementById('optimizerFeedback').value = `Improve: ${explanation}`;
    document.getElementById('btnRunOptimizer').click();
    ignoreSuggestion(id);
  }

  function renderSubjectLines() {
    if (!currentGenerated || !currentGenerated.subjectLines) return;
    const listContainer = document.getElementById('subjectsList');
    listContainer.innerHTML = '';

    const activeSubject = document.getElementById('previewSubject').textContent.replace('Subject: ', '');

    currentGenerated.subjectLines.forEach(item => {
      const div = document.createElement('div');
      const isActive = item.text.trim() === activeSubject.trim();
      div.className = `subject-item ${isActive ? 'active' : ''}`;
      
      div.innerHTML = `
        <div class="subject-text">${item.text}</div>
        <div class="subject-badges">
          ${item.label ? `<span class="reco-badge" style="background:var(--primary);">${item.label}</span>` : ''}
          <span class="prob-badge">${item.openRate || item.probability || 'N/A'} open rate</span>
        </div>
      `;
      
      div.addEventListener('click', () => {
        document.getElementById('previewSubject').textContent = `Subject: ${item.text}`;
        const v = getVariantByKey(activeVariantKey);
        if (v) v.subject = item.text;
        renderSubjectLines();
        showToast('Subject line updated!');
      });

      listContainer.appendChild(div);
    });
  }

  document.getElementById('btnRegenSubjects')?.addEventListener('click', async () => {
    if (!currentGenerated) return;

    const bodyText = document.getElementById('previewBody').textContent;
    const btn = document.getElementById('btnRegenSubjects');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ ...';

    const payload = {
      action: 'regenerate-subjects',
      emailBody: bodyText,
      companyName: document.getElementById('companyName').value.trim(),
      recipientName: document.getElementById('recipientName').value.trim(),
      position: document.getElementById('position').value.trim(),
      emailGoal: document.getElementById('emailGoal').value
    };

    try {
      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/cold-email', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server returned error');

      if (data.subjectLines) {
        currentGenerated.subjectLines = data.subjectLines;
        renderSubjectLines();
        showToast('Fresh subject lines generated!');
      }
    } catch (err) {
      showToast('Failed to regenerate subjects: ' + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  document.getElementById('btnRunOptimizer')?.addEventListener('click', async () => {
    if (!currentGenerated) return;

    const feedback = document.getElementById('optimizerFeedback').value.trim();
    if (!feedback) return showToast('Please enter optimization feedback first.', true);

    const btn = document.getElementById('btnRunOptimizer');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Improving…';

    const range = getSelectedLengthRange();
    const payload = {
      action: 'optimize',
      emailBody: document.getElementById('previewBody').textContent,
      feedback: feedback,
      emailGoal: document.getElementById('emailGoal').value,
      recipientName: document.getElementById('recipientName').value.trim(),
      companyName: document.getElementById('companyName').value.trim(),
      position: document.getElementById('position').value.trim(),
      userName: document.getElementById('userName').value.trim(),
      background: document.getElementById('background').value.trim(),
      whyContacting: document.getElementById('whyContacting').value.trim(),
      length: selectedLengthPreset,
      lengthType: selectedLengthPreset,
      minLength: range.min,
      maxLength: range.max
    };

    try {
      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/cold-email', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error');

      if (data.optimizedBody) {
        const v = getVariantByKey(activeVariantKey);
        if (v) v.body = data.optimizedBody;
        if (data.evaluation) {
          currentGenerated.evaluation = data.evaluation;
        }
        renderActiveVariant();
        document.getElementById('optimizerFeedback').value = '';
        showToast('Email optimized and scores updated!');
      }
    } catch (err) {
      showToast('Optimization failed: ' + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  document.getElementById('btnCopyEmail')?.addEventListener('click', () => {
    const text = document.getElementById('previewBody').textContent;
    navigator.clipboard.writeText(text);
    showToast('Email body copied to clipboard!');
  });

  document.getElementById('btnCopySubject')?.addEventListener('click', () => {
    const text = document.getElementById('previewSubject').textContent.replace('Subject: ', '');
    navigator.clipboard.writeText(text);
    showToast('Subject line copied to clipboard!');
  });

  document.getElementById('cpFu')?.addEventListener('click', () => {
    const text = document.getElementById('fuBody').textContent;
    navigator.clipboard.writeText(text);
    showToast('Follow-up text copied to clipboard!');
  });

  document.getElementById('btnExportTxt')?.addEventListener('click', () => {
    const subject = document.getElementById('previewSubject').textContent;
    const body = document.getElementById('previewBody').textContent;
    const fullText = `${subject}\n\n${body}`;

    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const comp = (document.getElementById('companyName').value || 'outreach').replace(/\s+/g, '-');
    a.download = `ColdEmail-${comp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('TXT draft exported!');
  });

  document.getElementById('btnExportPdf')?.addEventListener('click', async () => {
    const bodyText = document.getElementById('previewBody').textContent;
    const subjectText = document.getElementById('previewSubject').textContent.replace('Subject: ', '');
    const btn = document.getElementById('btnExportPdf');
    const originalText = btn.textContent;
    
    btn.disabled = true;
    btn.textContent = 'Generating...';

    const payload = {
      type: 'cold-email',
      subject: subjectText,
      body: bodyText,
      companyName: document.getElementById('companyName').value.trim(),
      recipientName: document.getElementById('recipientName').value.trim(),
      senderName: document.getElementById('userName').value.trim()
    };

    try {
      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('PDF service returned error');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const comp = (document.getElementById('companyName').value || 'outreach').replace(/\s+/g, '-');
      a.download = `ColdEmail-${comp}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('PDF document downloaded!');
    } catch (err) {
      showToast('PDF download failed: ' + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  async function saveDraft() {
    const emailGoal = document.getElementById('emailGoal').value;
    const companyName = document.getElementById('companyName').value.trim();
    const position = document.getElementById('position').value.trim();
    const userName = document.getElementById('userName').value.trim();
    const background = document.getElementById('background').value.trim();
    
    if (!companyName || !position) {
      return showToast('Save requires at least Company Name and Recipient Position.', true);
    }

    const draftPayload = {
      emailGoal,
      companyName,
      position,
      userName,
      background,
      keySkills: document.getElementById('keySkills').value.trim(),
      experience: document.getElementById('experience').value.trim(),
      whyContacting: document.getElementById('whyContacting').value.trim(),
      linkedinUrl: document.getElementById('linkedinUrl').value.trim(),
      companyWebsite: document.getElementById('companyWebsite').value.trim(),
      length: selectedLengthPreset,
      subject: document.getElementById('previewSubject').textContent.replace('Subject: ', ''),
      body: document.getElementById('previewBody').textContent
    };

    try {
      const savedRecord = await DraftStore.save(draftPayload);
      if (savedRecord) {
        showToast('Draft saved successfully!');
        await loadHistory();
      }
    } catch (e) {
      showToast('Failed to save draft: ' + e.message, true);
    }
  }

  document.getElementById('btnSaveDraft')?.addEventListener('click', saveDraft);

  async function loadHistory() {
    const listContainer = document.getElementById('draftsList');
    if (!listContainer) return;
    try {
      const drafts = await DraftStore.list();
      window.allDrafts = drafts; 
      renderDraftsGrid(drafts);
    } catch (err) {
      listContainer.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Failed to load saved drafts.</p>';
    }
  }

  function renderDraftsGrid(drafts) {
    const listContainer = document.getElementById('draftsList');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (drafts.length === 0) {
      listContainer.innerHTML = '<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;padding:2rem;">No drafts found.</p>';
      return;
    }

    drafts.forEach(d => {
      let meta = {};
      try {
        meta = JSON.parse(d.variant);
      } catch (e) {
        meta = { variantName: d.variant || 'A' };
      }

      const dateStr = new Date(d.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });

      const isLocal = String(d.id).startsWith('local_');

      const card = document.createElement('div');
      card.className = 'draft-card';
      card.innerHTML = `
        <div>
          <div class="draft-card-meta">
            <span>${dateStr}</span>
            <span>${isLocal ? '💾 local' : '🌐 cloud'}</span>
          </div>
          <div class="draft-card-title">${d.company || 'Untitled'} - ${d.recipient_title || 'Untitled'}</div>
          <div class="draft-card-desc">${d.subject || 'No Subject'}\n${d.body || 'No Body'}</div>
        </div>
        <div class="draft-card-actions">
          <button class="draft-btn load" onclick="loadDraft('${d.id}')">Load</button>
          <button class="draft-btn" onclick="duplicateDraft('${d.id}')">Duplicate</button>
          <button class="draft-btn delete" onclick="deleteDraft('${d.id}')">Delete</button>
        </div>
      `;
      listContainer.appendChild(card);
    });
  }

  document.getElementById('draftSearch')?.addEventListener('input', e => {
    const term = e.target.value.toLowerCase().trim();
    if (!window.allDrafts) return;

    const filtered = window.allDrafts.filter(d => {
      return (d.company || '').toLowerCase().includes(term) ||
             (d.recipient_title || '').toLowerCase().includes(term) ||
             (d.subject || '').toLowerCase().includes(term) ||
             (d.body || '').toLowerCase().includes(term);
    });
    renderDraftsGrid(filtered);
  });

  window.loadDraft = function(id) {
    const d = window.allDrafts.find(item => String(item.id) === String(id));
    if (!d) return;

    currentDraftId = d.id;

    let meta = {};
    try {
      meta = JSON.parse(d.variant);
    } catch (e) {
      meta = { variantName: d.variant || 'A' };
    }

    activeVariantKey = meta.variantName || 'A';

    if (meta.emailGoal) document.getElementById('emailGoal').value = meta.emailGoal;
    document.getElementById('companyName').value = d.company || '';
    document.getElementById('position').value = d.recipient_title || '';
    document.getElementById('recipientName').value = meta.recipientName || '';
    if (meta.linkedinUrl) document.getElementById('linkedinUrl').value = meta.linkedinUrl;
    if (meta.website) document.getElementById('companyWebsite').value = meta.website;
    if (meta.userName) document.getElementById('userName').value = meta.userName;
    if (meta.background) document.getElementById('background').value = meta.background;
    if (meta.keySkills) document.getElementById('keySkills').value = meta.keySkills;
    if (meta.experience) document.getElementById('experience').value = meta.experience;
    if (meta.whyContacting) document.getElementById('whyContacting').value = meta.whyContacting;
    if (meta.lengthType) {
      setLengthUI(meta.lengthType, meta.minLength, meta.maxLength);
    } else if (meta.length) {
      const len = String(meta.length).toLowerCase();
      if (len.includes('short')) setLengthUI('Short');
      else if (len.includes('long')) setLengthUI('Long');
      else setLengthUI('Medium');
    } else {
      setLengthUI('Medium');
    }

    if (meta.generatedPayload) {
      currentGenerated = meta.generatedPayload;
    } else {
      currentGenerated = {
        variants: [
          { tone: 'Professional', subject: d.subject, body: d.body, approach: 'Loaded Draft' },
          { tone: 'Friendly', subject: d.subject, body: d.body, approach: 'Loaded Draft' },
          { tone: 'Executive', subject: d.subject, body: d.body, approach: 'Loaded Draft' },
          { tone: 'Startup', subject: d.subject, body: d.body, approach: 'Loaded Draft' },
          { tone: 'Technical', subject: d.subject, body: d.body, approach: 'Loaded Draft' },
          { tone: 'Networking', subject: d.subject, body: d.body, approach: 'Loaded Draft' }
        ],
        subjectLines: [{ text: d.subject, label: 'Conservative', openRate: 'N/A' }],
        evaluation: {
          overallScore: 80,
          strengths: ["Loaded draft"],
          weaknesses: ["Recalculation needed"],
          suggestions: ["Generate elite emails to get deep analysis"]
        },
        followUp: '',
        spamWords: []
      };
    }

    renderActiveVariant();
    document.getElementById('bgCt').textContent = `${(meta.background || '').length} / 400`;
    showToast('Draft loaded successfully!');
    
    document.getElementById('previewCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  window.duplicateDraft = async function(id) {
    const d = window.allDrafts.find(item => String(item.id) === String(id));
    if (!d) return;

    const record = {
      ...d,
      company: d.company + ' (Copy)',
      created_at: new Date().toISOString()
    };
    delete record.id; 

    try {
      if (supabaseClient && DraftStore.dbAvailable && !String(id).startsWith('local_')) {
        const { error } = await supabaseClient.from('email_history').insert([record]);
        if (error) throw error;
      } else {
        const newLocalId = 'local_' + Math.random().toString(36).substr(2, 9);
        let localDrafts = JSON.parse(localStorage.getItem('cc_email_drafts') || '[]');
        localDrafts.unshift({ ...record, id: newLocalId });
        localStorage.setItem('cc_email_drafts', JSON.stringify(localDrafts));
      }
      showToast('Draft duplicated!');
      await loadHistory();
    } catch (err) {
      showToast('Failed to duplicate draft: ' + err.message, true);
    }
  };

  window.deleteDraft = async function(id) {
    if (!confirm('Are you sure you want to delete this draft?')) return;
    try {
      await DraftStore.delete(id);
      if (String(currentDraftId) === String(id)) {
        currentDraftId = null;
      }
      showToast('Draft deleted!');
      await loadHistory();
    } catch (err) {
      showToast('Failed to delete draft: ' + err.message, true);
    }
  };

  // Expose methods to global space
  window.selectLengthOption = selectLengthOption;
  window.applySuggestion = applySuggestion;
  window.ignoreSuggestion = ignoreSuggestion;
  window.regenerateSuggestion = regenerateSuggestion;

  window.addEventListener('load', init);
})();
