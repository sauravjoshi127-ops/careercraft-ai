/**
 * interview.js
 * Interview Coach feature logic.
 */
(function () {
  // State Tracking
  const state = {
    stage: 'setup', // 'setup' | 'strategy' | 'practice' | 'completed'
    persona: 'HR Specialist',
    questions: [],
    selectedId: '',
    history: [], // round-by-round evaluations { question, answer, score, evaluation }
    lastStrategy: null,
    lastEvaluation: null,
    lastRecommendations: null
  };

  let els = {};

  const storageKey = 'careercraft-interview-history';
  const draftKey = 'careercraft-interview-draft';
  const apiBase = window.location.protocol === 'file:' ? 'http://127.0.0.1:3000' : '';

  function apiUrl(path) {
    return `${apiBase}${path}`;
  }

  function setStatus(target, message, type = '') {
    if (!target) return;
    target.textContent = message;
    target.className = `status ${type}`.trim();
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(text || '')));
    return div.innerHTML;
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch (_err) {
      return [];
    }
  }

  function saveHistory(items) {
    localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 20)));
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(draftKey);
      return raw ? JSON.parse(raw) : null;
    } catch (_err) {
      return null;
    }
  }

  let draftTimer = null;
  function saveDraft() {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const context = readContext();
      localStorage.setItem(draftKey, JSON.stringify(context));
    }, 400);
  }

  function readContext() {
    return {
      jobTitle: els.jobTitle.value.trim(),
      companyName: els.companyName.value.trim(),
      experienceLevel: els.experienceLevel.value.trim(),
      interviewType: els.interviewType.value.trim(),
      jobDescription: els.jobDescription.value.trim(),
      resumeText: els.resumeText.value.trim(),
      focusAreas: els.focusAreas.value.trim(),
      persona: state.persona
    };
  }

  function setStage(newStage) {
    state.stage = newStage;

    [els.stepItem1, els.stepItem2, els.stepItem3, els.stepItem4].forEach(item => {
      if (item) item.className = 'step-item';
    });

    els.panelSetup.classList.add('is-hidden');
    els.panelStrategy.classList.add('is-hidden');
    els.panelPractice.classList.add('is-hidden');
    els.panelCompleted.classList.add('is-hidden');

    if (newStage === 'setup') {
      if (els.stepItem1) els.stepItem1.className = 'step-item active';
      els.panelSetup.classList.remove('is-hidden');
      if (els.pageHero) els.pageHero.classList.remove('is-hidden');
      setStatus(els.pageStatus, 'Start with your role, company, and resume.', '');
    } 
    else if (newStage === 'strategy') {
      if (els.stepItem1) els.stepItem1.className = 'step-item done';
      if (els.stepItem2) els.stepItem2.className = 'step-item active';
      els.panelStrategy.classList.remove('is-hidden');
      if (els.pageHero) els.pageHero.classList.add('is-hidden');
      renderStrategyView();
    } 
    else if (newStage === 'practice') {
      if (els.stepItem1) els.stepItem1.className = 'step-item done';
      if (els.stepItem2) els.stepItem2.className = 'step-item done';
      if (els.stepItem3) els.stepItem3.className = 'step-item active';
      els.panelPractice.classList.remove('is-hidden');
      if (els.pageHero) els.pageHero.classList.add('is-hidden');
      renderQuestionList();
      renderActiveQuestion();
    } 
    else if (newStage === 'completed') {
      if (els.stepItem1) els.stepItem1.className = 'step-item done';
      if (els.stepItem2) els.stepItem2.className = 'step-item done';
      if (els.stepItem3) els.stepItem3.className = 'step-item done';
      if (els.stepItem4) els.stepItem4.className = 'step-item active';
      els.panelCompleted.classList.remove('is-hidden');
      if (els.pageHero) els.pageHero.classList.add('is-hidden');
      renderCompletedDashboard();
    }
  }

  function renderStrategyView() {
    const data = state.lastStrategy;
    if (!data) return;

    els.strategyTitle.textContent = `${els.jobTitle.value.trim() || 'Job'} Strategy Overview`;
    
    let mdHtml = '';
    const paragraphs = (data.prep_strategy || '').split('\n').filter(Boolean);
    paragraphs.forEach(p => {
      if (p.startsWith('-') || p.startsWith('*')) {
        mdHtml += `<li>${escapeHtml(p.replace(/^[-*]\s*/, ''))}</li>`;
      } else {
        mdHtml += `<p>${escapeHtml(p)}</p>`;
      }
    });
    if (mdHtml.includes('<li>')) {
      mdHtml = mdHtml.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    }
    els.strategyContent.innerHTML = mdHtml || '<p>Review the job requirements and align key metrics from your resume.</p>';

    els.strategyFocusList.innerHTML = (data.focus_areas || []).map(item => `
      <span class="focus-badge">${escapeHtml(item)}</span>
    `).join('');

    const avatars = {
      'HR Specialist': '<svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      'Hiring Manager': '<svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      'Technical Lead': '<svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
      'Executive VP': '<svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
      'Stress Interviewer': '<svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
    };
    els.strategyInterviewerAvatar.innerHTML = avatars[state.persona] || '';
    els.strategyInterviewerName.textContent = state.persona === 'Stress Interviewer' ? 'Commander Vance' : state.persona === 'Technical Lead' ? 'Sanjay' : state.persona === 'Hiring Manager' ? 'Marcus' : state.persona === 'Executive VP' ? 'Victoria' : 'Elena';
    els.strategyInterviewerRole.textContent = state.persona;
  }

  function renderQuestionList() {
    els.qList.innerHTML = state.questions.map((q, idx) => {
      const histItem = state.history.find(h => h.question === q.question);
      const scoreBadge = histItem ? `<span class="q-score-badge">${histItem.score}%</span>` : '';
      return `
        <button type="button" class="q-item ${q.id === state.selectedId ? 'active' : ''}" data-id="${escapeHtml(q.id)}">
          <span class="q-badge">Q${idx + 1}</span>
          <div class="q-info">
            <div class="q-info-meta">
              <span>${escapeHtml(q.category || 'Focus')}</span>
            </div>
            <div class="q-item-text">${escapeHtml(q.question)}</div>
          </div>
          ${scoreBadge}
        </button>
      `;
    }).join('');
  }

  function renderActiveQuestion() {
    const q = state.questions.find(item => item.id === state.selectedId);
    if (!q) return;

    els.activeQuestionText.textContent = q.question;
    els.activeQuestionWhy.textContent = q.why_it_matters || 'This question tests alignment to job targets.';
    els.activeQuestionGuide.textContent = q.answer_guide || 'Use the STAR structure for this answer.';
    els.activeQuestionSamplePoints.innerHTML = (q.sample_points || []).map(point => `
      <li>${escapeHtml(point)}</li>
    `).join('');

    const avatars = {
      'HR Specialist': '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      'Hiring Manager': '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      'Technical Lead': '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
      'Executive VP': '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
      'Stress Interviewer': '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
    };
    els.speechAvatar.innerHTML = avatars[state.persona] || '';
    els.speechName.textContent = state.persona === 'Stress Interviewer' ? 'Commander Vance' : state.persona === 'Technical Lead' ? 'Sanjay' : state.persona === 'Hiring Manager' ? 'Marcus' : state.persona === 'Executive VP' ? 'Victoria' : 'Elena';
    
    const histItem = state.history.find(h => h.question === q.question);
    if (histItem?.evaluation?.persona_response) {
      els.speechText.textContent = `"${histItem.evaluation.persona_response}"`;
      els.personaSpeechBubble.classList.remove('is-hidden');
    } else {
      els.personaSpeechBubble.classList.add('is-hidden');
    }

    if (histItem) {
      renderEvaluationView(histItem.evaluation);
      els.answerText.value = histItem.answer;
      els.btnEvaluateAnswer.disabled = true;
    } else {
      resetEvaluationView();
      els.answerText.value = '';
      els.btnEvaluateAnswer.disabled = false;
    }
  }

  function resetEvaluationView() {
    els.evalBlock.classList.add('is-hidden');
    els.practiceStatus.textContent = '';
    els.practiceStatus.className = 'status';
  }

  function renderEvaluationView(data) {
    state.lastEvaluation = data;
    els.evalBlock.classList.remove('is-hidden');

    drawRadarChart(data.dimensions || {});

    const dimLabels = {
      technical_accuracy: 'Technical',
      communication: 'Communication',
      confidence: 'Confidence',
      structure: 'Structure',
      star_methodology: 'STAR method',
      leadership: 'Leadership',
      problem_solving: 'Problem solving'
    };
    els.dimensionBars.innerHTML = Object.keys(dimLabels).map(key => {
      const val = Number(data.dimensions?.[key]) || 50;
      return `
        <div class="dimension-bar-row">
          <span class="dim-name">${dimLabels[key]}</span>
          <div class="dim-progress"><span class="dim-fill" style="width: ${val}%"></span></div>
          <span class="dim-score">${val}%</span>
        </div>
      `;
    }).join('');

    els.strengthsList.innerHTML = (data.strengths || []).map(str => `
      <div class="checklist-item">
        <span class="checklist-bullet">✓</span>
        <span>${escapeHtml(str)}</span>
      </div>
    `).join('');
    els.improvementsList.innerHTML = (data.improvements || []).map(imp => `
      <div class="checklist-item">
        <span class="checklist-bullet">⚠</span>
        <span>${escapeHtml(imp)}</span>
      </div>
    `).join('');

    els.coachingTipText.textContent = data.coaching_tip || 'Structure your answer using specific task outcomes.';

    const activeTabBtn = els.modelAnswerTabs.querySelector('.model-tab-btn.active');
    const level = activeTabBtn ? activeTabBtn.getAttribute('data-level') : 'improved';
    renderModelAnswerContent(level);

    if (data.persona_response) {
      els.speechText.textContent = `"${data.persona_response}"`;
      els.personaSpeechBubble.classList.remove('is-hidden');
    }
  }

  function renderModelAnswerContent(level) {
    const data = state.lastEvaluation;
    if (!data?.model_answers) return;
    els.modelContentBox.textContent = data.model_answers[level] || 'No revised model answer returned.';
  }

  function renderCompletedDashboard() {
    const data = state.lastRecommendations;
    if (!data) return;

    const scores = state.history.map(item => Number(item.score)).filter(Number.isFinite);
    const avgScore = scores.length ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : 70;
    
    els.overallReportScore.textContent = `${avgScore}%`;
    els.overallReportGrade.textContent = avgScore >= 85 ? 'Excellent' : avgScore >= 70 ? 'Good' : avgScore >= 50 ? 'Needs practice' : 'Weak';
    els.overallReportSummary.textContent = data.overall_summary || 'Practice session completed successfully.';

    const compositeDims = {};
    const dimKeys = ['technical_accuracy', 'communication', 'confidence', 'structure', 'star_methodology', 'leadership', 'problem_solving'];
    dimKeys.forEach(k => {
      const sum = state.history.reduce((acc, curr) => acc + (Number(curr.evaluation?.dimensions?.[k]) || 50), 0);
      compositeDims[k] = state.history.length ? Math.round(sum / state.history.length) : 60;
    });

    drawRadarChartComposite(compositeDims);

    els.reportPlanList.innerHTML = (data.improvement_plan || []).map(item => `
      <div class="checklist-item">
        <span class="checklist-bullet">☐</span>
        <span>${escapeHtml(item)}</span>
      </div>
    `).join('');

    els.reportRecList.innerHTML = (data.practice_recommendations || []).map(item => `
      <div class="checklist-item">
        <span class="checklist-bullet">✦</span>
        <span>${escapeHtml(item)}</span>
      </div>
    `).join('');

    els.reportDimensionsDetails.innerHTML = Object.keys(data.dimension_analysis || {}).map(k => {
      const name = k.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `
        <div style="margin-bottom:0.75rem;">
          <strong style="color:var(--text-1); font-size:0.8rem; display:block;">${escapeHtml(name)}</strong>
          <span style="font-size:0.82rem; color:var(--text-2); line-height:1.5;">${escapeHtml(data.dimension_analysis[k])}</span>
        </div>
      `;
    }).join('');
  }

  function drawRadarChart(dimensions) {
    renderRadarSVG(dimensions, els.radarChartContainer);
  }

  function drawRadarChartComposite(dimensions) {
    renderRadarSVG(dimensions, els.finalRadarChartContainer);
  }

  function renderRadarSVG(dimensions, containerNode) {
    if (!containerNode) return;

    const width = 300;
    const height = 300;
    const cx = width / 2;
    const cy = height / 2;
    const r = 90; 

    const keys = [
      { key: 'technical_accuracy', label: 'Technical' },
      { key: 'communication', label: 'Comm' },
      { key: 'confidence', label: 'Confidence' },
      { key: 'structure', label: 'Structure' },
      { key: 'star_methodology', label: 'STAR' },
      { key: 'leadership', label: 'Leadership' },
      { key: 'problem_solving', label: 'Problem' }
    ];

    const isManual = document.documentElement.classList.contains('manual-studio-active');
    const accentColor = isManual ? '#6366f1' : 'var(--cyan)';
    const fillTheme = isManual ? 'rgba(99, 102, 241, 0.12)' : 'rgba(6, 182, 212, 0.12)';

    let gridLines = '';
    for (let level = 1; level <= 5; level++) {
      const radius = (r / 5) * level;
      const points = [];
      for (let i = 0; i < 7; i++) {
        const angle = (i * 2 * Math.PI) / 7 - Math.PI / 2;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        points.push(`${x},${y}`);
      }
      gridLines += `<polygon points="${points.join(' ')}" fill="none" stroke="var(--border-md)" stroke-width="0.75" />`;
    }

    let axes = '';
    let labels = '';
    for (let i = 0; i < 7; i++) {
      const angle = (i * 2 * Math.PI) / 7 - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      axes += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--border-md)" stroke-width="0.75" />`;

      const labelDistance = r + 20;
      const lx = cx + labelDistance * Math.cos(angle);
      const ly = cy + labelDistance * Math.sin(angle) + 4;
      const align = Math.cos(angle) > 0.1 ? 'start' : Math.cos(angle) < -0.1 ? 'end' : 'middle';
      labels += `<text x="${lx}" y="${ly}" fill="var(--text-3)" font-size="9" font-weight="700" text-anchor="${align}">${keys[i].label}</text>`;
    }

    const scorePoints = [];
    for (let i = 0; i < 7; i++) {
      const angle = (i * 2 * Math.PI) / 7 - Math.PI / 2;
      const scoreVal = dimensions[keys[i].key] || 50;
      const radius = (r * scoreVal) / 100;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      scorePoints.push(`${x},${y}`);
    }

    const polygonPath = `<polygon points="${scorePoints.join(' ')}" fill="${fillTheme}" stroke="${accentColor}" stroke-width="2" />`;

    let dots = '';
    for (let i = 0; i < 7; i++) {
      const angle = (i * 2 * Math.PI) / 7 - Math.PI / 2;
      const scoreVal = dimensions[keys[i].key] || 50;
      const radius = (r * scoreVal) / 100;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      dots += `<circle cx="${x}" cy="${y}" r="4" fill="${accentColor}" />`;
    }

    containerNode.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}">
        ${gridLines}
        ${axes}
        ${labels}
        ${polygonPath}
        ${dots}
      </svg>
    `;
  }

  async function generateStrategy() {
    const context = readContext();
    if (!context.jobTitle || !context.companyName) {
      setStatus(els.setupStatus, 'Please specify job title and company.', 'error');
      return;
    }

    setStatus(els.pageStatus, 'Formulating preparation strategy…', 'loading');
    setStatus(els.setupStatus, 'Analyzing your details…', 'loading');
    toggleControls(true);

    try {
      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(apiUrl('/api/interview-coach'), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          action: 'generate_strategy',
          ...context
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate strategy.');

      state.lastStrategy = data;
      state.questions = Array.isArray(data.questions) ? data.questions : [];
      state.selectedId = state.questions[0]?.id || '';
      state.history = []; 

      setStage('strategy');
      setStatus(els.pageStatus, 'Prep strategy formulated successfully.', 'success');
    } catch (error) {
      // Log full error internally — never expose to users
      console.error('[CareerCraft] Strategy generation error (internal):', error);
      const userMsg = 'We couldn\u2019t generate your strategy right now. Please try again.';
      setStatus(els.pageStatus, userMsg, 'error');
      setStatus(els.setupStatus, userMsg, 'error');
    } finally {
      toggleControls(false);
    }
  }

  async function evaluateAnswer() {
    const context = readContext();
    const question = state.questions.find(item => item.id === state.selectedId);

    if (!question) {
      setStatus(els.practiceStatus, 'Build question strategy first.', 'error');
      return;
    }

    const answer = els.answerText.value.trim();
    if (!answer) {
      setStatus(els.practiceStatus, 'Please type or speak an answer first.', 'error');
      return;
    }

    setStatus(els.pageStatus, 'Evaluating response…', 'loading');
    setStatus(els.practiceStatus, 'Reviewing your answer…', 'loading');
    toggleControls(true);

    try {
      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(apiUrl('/api/interview-coach'), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          action: 'evaluate_answer',
          question: question.question,
          answer: answer,
          history: state.history.map(item => ({ q: item.question, a: item.answer, s: item.score })),
          ...context
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to evaluate answer.');

      const roundData = {
        question: question.question,
        answer: answer,
        score: data.score,
        evaluation: data
      };

      const existingIdx = state.history.findIndex(h => h.question === question.question);
      if (existingIdx >= 0) {
        state.history[existingIdx] = roundData;
      } else {
        state.history.push(roundData);
      }

      renderQuestionList();
      renderEvaluationView(data);
      
      setStatus(els.pageStatus, 'Round evaluation completed.', 'success');
      setStatus(els.practiceStatus, 'Round evaluated successfully.', 'success');
    } catch (error) {
      // Log full error internally — never expose to users
      console.error('[CareerCraft] Answer evaluation error (internal):', error);
      const userMsg = 'We couldn\u2019t evaluate your answer right now. Please try again.';
      setStatus(els.pageStatus, userMsg, 'error');
      setStatus(els.practiceStatus, userMsg, 'error');
    } finally {
      toggleControls(false);
    }
  }

  async function finishSession() {
    if (state.history.length === 0) {
      alert('Please evaluate at least one answer before finishing.');
      return;
    }

    const context = readContext();
    setStatus(els.pageStatus, 'Generating personalized recommendations…', 'loading');
    setStatus(els.practiceStatus, 'Analyzing session results…', 'loading');
    toggleControls(true);

    try {
      const session = await window.appSdk.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(apiUrl('/api/interview-coach'), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          action: 'generate_recommendations',
          history: state.history.map(item => ({
            q: item.question,
            a: item.answer,
            score: item.score,
            dimensions: item.evaluation?.dimensions
          })),
          ...context
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch recommendations.');

      state.lastRecommendations = data;
      setStage('completed');
      
      saveSession();
    } catch (error) {
      // Log full error internally — never expose to users
      console.error('[CareerCraft] Recommendations generation error (internal):', error);
      const userMsg = 'We couldn\u2019t generate your recommendations right now. Please try again.';
      setStatus(els.pageStatus, userMsg, 'error');
      setStatus(els.practiceStatus, userMsg, 'error');
    } finally {
      toggleControls(false);
    }
  }

  async function uploadResume() {
    const file = els.resumeFile.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('resume', file);
    els.resumeUploadHint.textContent = 'Reading resume...';
    setStatus(els.setupStatus, 'Reading file content...', 'loading');

    try {
      const session = await window.appSdk.auth.getSession();
      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(apiUrl('/api/upload-resume'), {
        method: 'POST',
        headers: headers,
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to extract text.');

      els.resumeText.value = data.resumeText || '';
      els.resumeUploadHint.textContent = `Loaded ${file.name}.`;
      setStatus(els.setupStatus, 'Resume content loaded.', 'success');
      saveDraft();
    } catch (error) {
      els.resumeUploadHint.textContent = 'Failed to extract text.';
      setStatus(els.setupStatus, error.message, 'error');
    }
  }

  function toggleControls(disabled) {
    ['btnBuildStrategy', 'btnStartPractice', 'btnEvaluateAnswer', 'btnProceedNext', 'btnEndEarly', 'loadDemoBtn']
      .forEach(id => {
        const node = document.getElementById(id);
        if (node) node.disabled = disabled;
      });
  }

  function selectQuestion(id) {
    state.selectedId = id;
    renderQuestionList();
    renderActiveQuestion();
  }

  function proceedNext() {
    const data = state.lastEvaluation;
    if (!data?.next_question) {
      finishSession();
      return;
    }

    const nextQ = data.next_question;
    const alreadyExists = state.questions.some(q => q.question === nextQ.question);
    
    if (!alreadyExists) {
      nextQ.id = `q${state.questions.length + 1}`;
      state.questions.push(nextQ);
    }

    const nextId = state.questions[state.questions.length - 1].id;
    selectQuestion(nextId);
    
    window.scrollTo({ top: els.stepBar.offsetTop, behavior: 'smooth' });
  }

  function speakCurrentQuestion() {
    const q = state.questions.find(item => item.id === state.selectedId);
    if (!q || !window.speechSynthesis) {
      setStatus(els.practiceStatus, 'Speech synthesis not available.', 'error');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(q.question);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    setStatus(els.practiceStatus, 'Reading question text...', 'success');
  }

  let voiceRecognition = null;
  function startVoiceAnswer() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus(els.practiceStatus, 'Voice recognition not supported in this browser.', 'error');
      return;
    }

    if (voiceRecognition) {
      voiceRecognition.stop();
      voiceRecognition = null;
      els.btnVoiceAnswer.textContent = 'Speak Answer';
      return;
    }

    voiceRecognition = new Recognition();
    voiceRecognition.lang = 'en-US';
    voiceRecognition.interimResults = true;
    voiceRecognition.continuous = false;

    const baseText = els.answerText.value.trim();
    let finalText = '';

    voiceRecognition.onresult = event => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const val = event.results[i][0].transcript.trim();
        if (event.results[i].isFinal) {
          finalText = `${finalText} ${val}`.trim();
        } else {
          interimText = `${interimText} ${val}`.trim();
        }
      }
      els.answerText.value = [baseText, finalText, interimText].filter(Boolean).join(' ').trim();
    };

    voiceRecognition.onerror = () => {
      els.btnVoiceAnswer.textContent = 'Speak Answer';
      setStatus(els.practiceStatus, 'Voice capture failed.', 'error');
      voiceRecognition = null;
    };

    voiceRecognition.onend = () => {
      voiceRecognition = null;
      els.btnVoiceAnswer.textContent = 'Speak Answer';
      setStatus(els.practiceStatus, 'Voice answer captured.', 'success');
    };

    voiceRecognition.start();
    els.btnVoiceAnswer.textContent = 'Stop Recording';
    setStatus(els.practiceStatus, 'Recording answer. Speak clearly.', 'loading');
  }

  function saveSession() {
    const history = loadHistory();
    const scores = state.history.map(item => Number(item.score)).filter(Number.isFinite);
    const avgScore = scores.length ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : 70;

    const item = {
      title: `${els.jobTitle.value.trim() || 'Job'} Session`,
      company: els.companyName.value.trim() || 'Unknown Company',
      score: avgScore,
      grade: avgScore >= 85 ? 'Excellent' : avgScore >= 70 ? 'Good' : 'Needs Practice',
      strengths: state.history[0]?.evaluation?.strengths || [],
      improvements: state.history[0]?.evaluation?.improvements || [],
      createdAt: new Date().toISOString()
    };

    saveHistory([item, ...history]);
    renderHistory();
  }

  function renderHistory() {
    const history = loadHistory();
    els.historyCount.textContent = String(history.length);

    if (!els.progressSummary) return;

    if (!history.length) {
      els.progressSummary.textContent = 'No sessions saved yet.';
      els.historyList.innerHTML = `
        <div class="history-item">
          <strong>No session history found</strong>
          <span>Completed intelligence reports will appear here.</span>
        </div>`;
      return;
    }

    const scores = history.map(h => h.score).filter(Number.isFinite);
    const best = Math.max(...scores);
    const avg = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);

    els.progressSummary.textContent = `Progress metrics: average overall score ${avg}%, personal best ${best}%. Tracked over ${history.length} runs.`;

    els.historyList.innerHTML = history.map(h => `
      <div class="history-item">
        <strong>${escapeHtml(h.title)} at ${escapeHtml(h.company)}</strong>
        <span>Grade: ${escapeHtml(h.grade)} (${h.score}%) | ${new Date(h.createdAt).toLocaleDateString()}</span>
        ${h.strengths.length ? `<span style="font-size:0.75rem; color:var(--text-3);">Strength: ${escapeHtml(h.strengths[0])}</span>` : ''}
      </div>
    `).join('');
  }

  async function copyModelAnswer() {
    const txt = els.modelContentBox.textContent;
    if (!txt) return;

    try {
      await navigator.clipboard.writeText(txt);
      setStatus(els.practiceStatus, 'Model answer copied to clipboard.', 'success');
    } catch (_err) {
      setStatus(els.practiceStatus, 'Clipboard write blocked.', 'error');
    }
  }

  function loadDemo() {
    els.jobTitle.value = 'Frontend Architect';
    els.companyName.value = 'Stripe';
    els.experienceLevel.value = 'Senior';
    els.interviewType.value = 'System Design';
    els.jobDescription.value = 'Design high-scale dashboard platforms, optimize front-end runtime assets, build flexible component utilities, and guide core rendering performance initiatives.';
    els.resumeText.value = 'Architected a unified design library for dashboard services, improved client paint latency by 35% through custom asset streaming, and led technical reviews.';
    els.focusAreas.value = 'Client runtime rendering, system architecture, performance optimization';
    
    setStatus(els.setupStatus, 'Demo profile loaded. Build strategy when ready.', 'success');
    saveDraft();
  }

  function bindEvents() {
    document.getElementById('btnBuildStrategy').addEventListener('click', generateStrategy);
    document.getElementById('loadDemoBtn').addEventListener('click', loadDemo);

    document.getElementById('btnStartPractice').addEventListener('click', () => setStage('practice'));
    document.getElementById('btnBackToSetup').addEventListener('click', () => setStage('setup'));

    els.btnEvaluateAnswer.addEventListener('click', evaluateAnswer);
    els.btnProceedNext.addEventListener('click', proceedNext);
    els.btnEndEarly.addEventListener('click', finishSession);
    els.btnSpeakQuestion.addEventListener('click', speakCurrentQuestion);
    els.btnVoiceAnswer.addEventListener('click', startVoiceAnswer);
    els.btnCopyModel.addEventListener('click', copyModelAnswer);

    document.getElementById('btnRestartSession').addEventListener('click', () => {
      state.questions = [];
      state.history = [];
      state.selectedId = '';
      state.lastStrategy = null;
      state.lastEvaluation = null;
      state.lastRecommendations = null;
      setStage('setup');
    });

    document.getElementById('btnSaveSessionHistory').addEventListener('click', () => {
      saveSession();
      setStatus(els.setupStatus, 'Session saved in your browser history list.', 'success');
    });

    els.personaGrid.addEventListener('click', event => {
      const card = event.target.closest('.persona-card');
      if (!card) return;

      els.personaGrid.querySelectorAll('.persona-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.persona = card.getAttribute('data-persona');
      saveDraft();
    });

    els.modelAnswerTabs.addEventListener('click', event => {
      const btn = event.target.closest('.model-tab-btn');
      if (!btn) return;

      els.modelAnswerTabs.querySelectorAll('.model-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderModelAnswerContent(btn.getAttribute('data-level'));
    });

    els.qList.addEventListener('click', event => {
      const item = event.target.closest('.q-item');
      if (!item) return;
      selectQuestion(item.getAttribute('data-id'));
    });

    [els.jobTitle, els.companyName, els.jobDescription, els.resumeText, els.focusAreas, els.experienceLevel, els.interviewType]
      .forEach(node => node.addEventListener('input', saveDraft));

    els.resumeFile.addEventListener('change', uploadResume);
  }

  async function init() {
    await window.appSdk.ready;
    if (!window.AuthManager) return;
    const session = await window.AuthManager.requireAuth();
    if (!session) return;

    // Cache elements
    els = {
      stepBar: document.getElementById('stepBar'),
      stepItem1: document.getElementById('stepItem1'),
      stepItem2: document.getElementById('stepItem2'),
      stepItem3: document.getElementById('stepItem3'),
      stepItem4: document.getElementById('stepItem4'),
      pageHero: document.getElementById('pageHero'),
      pageStatus: document.getElementById('pageStatus'),
      panelSetup: document.getElementById('panelSetup'),
      panelStrategy: document.getElementById('panelStrategy'),
      panelPractice: document.getElementById('panelPractice'),
      panelCompleted: document.getElementById('panelCompleted'),
      resumeText: document.getElementById('resumeText'),
      resumeFile: document.getElementById('resumeFile'),
      resumeUploadHint: document.getElementById('resumeUploadHint'),
      jobTitle: document.getElementById('jobTitle'),
      companyName: document.getElementById('companyName'),
      jobDescription: document.getElementById('jobDescription'),
      focusAreas: document.getElementById('focusAreas'),
      experienceLevel: document.getElementById('experienceLevel'),
      interviewType: document.getElementById('interviewType'),
      personaGrid: document.getElementById('personaGrid'),
      setupStatus: document.getElementById('setupStatus'),
      strategyTitle: document.getElementById('strategyTitle'),
      strategyContent: document.getElementById('strategyContent'),
      strategyFocusList: document.getElementById('strategyFocusList'),
      strategyInterviewerAvatar: document.getElementById('strategyInterviewerAvatar'),
      strategyInterviewerName: document.getElementById('strategyInterviewerName'),
      strategyInterviewerRole: document.getElementById('strategyInterviewerRole'),
      qList: document.getElementById('qList'),
      personaSpeechBubble: document.getElementById('personaSpeechBubble'),
      speechAvatar: document.getElementById('speechAvatar'),
      speechName: document.getElementById('speechName'),
      speechText: document.getElementById('speechText'),
      activeQuestionText: document.getElementById('activeQuestionText'),
      activeQuestionWhy: document.getElementById('activeQuestionWhy'),
      activeQuestionGuide: document.getElementById('activeQuestionGuide'),
      activeQuestionSamplePoints: document.getElementById('activeQuestionSamplePoints'),
      answerText: document.getElementById('answerText'),
      btnVoiceAnswer: document.getElementById('btnVoiceAnswer'),
      btnSpeakQuestion: document.getElementById('btnSpeakQuestion'),
      btnEvaluateAnswer: document.getElementById('btnEvaluateAnswer'),
      practiceStatus: document.getElementById('practiceStatus'),
      voiceHint: document.getElementById('voiceHint'),
      evalBlock: document.getElementById('evalBlock'),
      radarChartContainer: document.getElementById('radarChartContainer'),
      dimensionBars: document.getElementById('dimensionBars'),
      strengthsList: document.getElementById('strengthsList'),
      improvementsList: document.getElementById('improvementsList'),
      coachingTipText: document.getElementById('coachingTipText'),
      modelAnswerTabs: document.getElementById('modelAnswerTabs'),
      modelContentBox: document.getElementById('modelContentBox'),
      btnCopyModel: document.getElementById('btnCopyModel'),
      btnProceedNext: document.getElementById('btnProceedNext'),
      btnEndEarly: document.getElementById('btnEndEarly'),
      overallReportScore: document.getElementById('overallReportScore'),
      overallReportGrade: document.getElementById('overallReportGrade'),
      overallReportSummary: document.getElementById('overallReportSummary'),
      finalRadarChartContainer: document.getElementById('finalRadarChartContainer'),
      reportPlanList: document.getElementById('reportPlanList'),
      reportRecList: document.getElementById('reportRecList'),
      reportDimensionsDetails: document.getElementById('reportDimensionsDetails'),
      historyDetails: document.getElementById('historyDetails'),
      historyCount: document.getElementById('historyCount'),
      progressSummary: document.getElementById('progressSummary'),
      historyList: document.getElementById('historyList')
    };

    bindEvents();
    
    const draft = loadDraft();
    if (draft) {
      els.jobTitle.value = draft.jobTitle || '';
      els.companyName.value = draft.companyName || '';
      els.experienceLevel.value = draft.experienceLevel || 'Mid';
      els.interviewType.value = draft.interviewType || 'Technical';
      els.jobDescription.value = draft.jobDescription || '';
      els.resumeText.value = draft.resumeText || '';
      els.focusAreas.value = draft.focusAreas || '';
      if (draft.persona) {
        state.persona = draft.persona;
        els.personaGrid.querySelectorAll('.persona-card').forEach(c => {
          if (c.getAttribute('data-persona') === draft.persona) c.classList.add('active');
          else c.classList.remove('active');
        });
      }
    }

    renderHistory();
    setStage('setup');
  }

  window.addEventListener('load', init);
})();
