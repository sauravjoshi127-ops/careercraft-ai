/**
 * dashboard.js
 * Dashboard-specific controller logic, utilizing shared DashboardManager metrics.
 */
(function () {
  let currentUserId = null;

  async function loadDashboardData() {
    try {
      const ws = window.WorkspaceManager ? window.WorkspaceManager.workspace : 'ai';
      const isManual = ws === 'manual';

      const hour = new Date().getHours();
      let greeting = 'Good Evening';
      if (hour < 12) greeting = 'Good Morning';
      else if (hour < 17) greeting = 'Good Afternoon';
      
      const greetingSpan = document.getElementById('welcomeGreetingSpan');
      if (greetingSpan) greetingSpan.textContent = greeting;

      if (!window.DashboardManager) return;

      const data = await window.DashboardManager.fetchRawDashboardData(currentUserId);
      const resumes = data.resumes || [];
      const coverLetters = data.coverLetters || [];
      const emails = data.emails || [];

      let interviewHistory = [];
      try {
        interviewHistory = JSON.parse(localStorage.getItem('interview_history') || '[]');
      } catch(_) {}

      // ─── Render Metrics Row ───
      const metricsRow = document.getElementById('dashboardMetricsRow');
      if (metricsRow) {
        let latestResumeProgress = window.DashboardManager.calculateResumeProgress(resumes[0]);
        let avgInterviewScore = window.DashboardManager.calculateAverageInterviewScore(interviewHistory);

        let metricsHtml = `
          <div class="metric-item">
              <div class="metric-label">Resume Progress</div>
              <div class="metric-value">${resumes.length > 0 ? latestResumeProgress + '%' : '0%'}</div>
          </div>
          <div class="metric-item">
              <div class="metric-label">Cover Letters</div>
              <div class="metric-value">${coverLetters.length}</div>
          </div>
          <div class="metric-item">
              <div class="metric-label">Cold Emails</div>
              <div class="metric-value">${emails.length}</div>
          </div>
        `;

        if (!isManual) {
          metricsHtml += `
            <div class="metric-item">
                <div class="metric-label">Interview Score</div>
                <div class="metric-value">${interviewHistory.length > 0 ? avgInterviewScore + '%' : 'N/A'}</div>
            </div>
          `;
        }

        metricsHtml += `
          <div class="metric-item">
              <div class="metric-label">Applications Tracked</div>
              <div class="metric-value" style="opacity: 0.6; font-size: 1.1rem; padding-top: 0.3rem;">0 (Future)</div>
          </div>
        `;
        metricsRow.innerHTML = metricsHtml;
      }

      // ─── Render Smart Grid ───
      const smartGrid = document.getElementById('dashboardSmartGrid');
      if (smartGrid) {
        let gridHtml = '';

        // 1. Resume Card
        let resumeProgress = window.DashboardManager.calculateResumeProgress(resumes[0]);
        let resumeLastEdited = resumes.length > 0 ? window.DashboardManager.formatTimeAgo(new Date(resumes[0].created_at)) : 'Never';
        let resumeCount = resumes.length;
        let atsScore = 'N/A';
        let resumeBtnLink = 'resume.html';

        if (resumes.length > 0) {
          const latest = resumes[0];
          resumeBtnLink = `resume.html?edit=${latest.id}`;
          atsScore = latest.professional_summary ? Math.min(100, 60 + Math.round(latest.professional_summary.length / 20)) + '/100' : 'N/A';
        }

        gridHtml += `
          <div class="smart-card">
              <div class="smart-card-title">📝 Resume Builder</div>
              <div class="smart-card-stats">
                  <div class="smart-stat-row">
                      <span class="smart-stat-label">Resume Progress</span>
                      <span class="smart-stat-val">${resumeProgress}%</span>
                  </div>
                  <div class="smart-stat-row">
                      <span class="smart-stat-label">Last Edited</span>
                      <span class="smart-stat-val">${resumeLastEdited}</span>
                  </div>
                  <div class="smart-stat-row">
                      <span class="smart-stat-label">Saved Resumes</span>
                      <span class="smart-stat-val">${resumeCount}</span>
                  </div>
                  <div class="smart-stat-row">
                      <span class="smart-stat-label">ATS Score</span>
                      <span class="smart-stat-val">${atsScore}</span>
                  </div>
              </div>
              <a href="${resumeBtnLink}" class="btn-primary" style="margin-top: auto; text-align: center; width: 100%;">Continue Resume</a>
          </div>
        `;

        // 2. Cover Letter Card
        let letterCount = coverLetters.length;
        let letterLastEdited = coverLetters.length > 0 ? window.DashboardManager.formatTimeAgo(new Date(coverLetters[0].created_at || coverLetters[0].updated_at)) : 'Never';
        let targetCompany = coverLetters.length > 0 ? (coverLetters[0].company_name || 'N/A') : 'N/A';
        let letterBtnLink = 'cover-letter.html';

        gridHtml += `
          <div class="smart-card">
              <div class="smart-card-title">📨 Cover Letter AI</div>
              <div class="smart-card-stats">
                  <div class="smart-stat-row">
                      <span class="smart-stat-label">Letters Created</span>
                      <span class="smart-stat-val">${letterCount}</span>
                  </div>
                  <div class="smart-stat-row">
                      <span class="smart-stat-label">Last Generated</span>
                      <span class="smart-stat-val">${letterLastEdited}</span>
                  </div>
                  <div class="smart-stat-row">
                      <span class="smart-stat-label">Target Company</span>
                      <span class="smart-stat-val">${window.appSdk.ui.escapeHtml(targetCompany)}</span>
                  </div>
              </div>
              <a href="${letterBtnLink}" class="btn-primary" style="margin-top: auto; text-align: center; width: 100%;">Continue Writing</a>
          </div>
        `;

        // 3. Cold Email Card
        let emailCount = emails.length;
        let emailLastEdited = emails.length > 0 ? window.DashboardManager.formatTimeAgo(new Date(emails[0].created_at)) : 'Never';
        let favoriteTemplate = 'N/A';
        let emailBtnLink = 'cold-email.html';

        if (emails.length > 0) {
          const latest = emails[0];
          favoriteTemplate = latest.variant ? (latest.variant.charAt(0).toUpperCase() + latest.variant.slice(1)) : 'Custom';
        }

        gridHtml += `
          <div class="smart-card">
              <div class="smart-card-title">✉️ Cold Email Writer</div>
              <div class="smart-card-stats">
                  <div class="smart-stat-row">
                      <span class="smart-stat-label">Draft Count</span>
                      <span class="smart-stat-val">${emailCount}</span>
                  </div>
                  <div class="smart-stat-row">
                      <span class="smart-stat-label">Last Edited</span>
                      <span class="smart-stat-val">${emailLastEdited}</span>
                  </div>
                  <div class="smart-stat-row">
                      <span class="smart-stat-label">Favorite Template</span>
                      <span class="smart-stat-val">${favoriteTemplate}</span>
                  </div>
              </div>
              <a href="${emailBtnLink}" class="btn-primary" style="margin-top: auto; text-align: center; width: 100%;">Open Workspace</a>
          </div>
        `;

        // 4. Fourth Card
        if (!isManual) {
          let interviewSessionsCount = interviewHistory.length;
          let avgScore = 'N/A';
          let weakestSkill = 'N/A';

          if (interviewHistory.length > 0) {
            avgScore = window.DashboardManager.calculateAverageInterviewScore(interviewHistory) + '%';
            const improvements = interviewHistory.flatMap(h => h.improvements || []);
            weakestSkill = improvements.length > 0 ? improvements[0] : 'Communication';
            if (weakestSkill.length > 25) weakestSkill = weakestSkill.substring(0, 22) + '...';
          }

          gridHtml += `
            <div class="smart-card">
                <div class="smart-card-title">🎤 Interview Coach</div>
                <div class="smart-card-stats">
                    <div class="smart-stat-row">
                        <span class="smart-stat-label">Practice Sessions</span>
                        <span class="smart-stat-val">${interviewSessionsCount}</span>
                    </div>
                    <div class="smart-stat-row">
                        <span class="smart-stat-label">Average Score</span>
                        <span class="smart-stat-val">${avgScore}</span>
                    </div>
                    <div class="smart-stat-row">
                        <span class="smart-stat-label">Weakest Skill</span>
                        <span class="smart-stat-val" title="${window.appSdk.ui.escapeHtml(weakestSkill)}">${window.appSdk.ui.escapeHtml(weakestSkill)}</span>
                    </div>
                </div>
                <a href="interview.html" class="btn-primary" style="margin-top: auto; text-align: center; width: 100%;">Continue Practice</a>
            </div>
          `;
        } else {
          // Creator Studio: Recent Workspace Documents
          let recentResumeText = 'No recent resume';
          let recentLetterText = 'No recent letter';
          let recentEmailText = 'No recent email';

          let resumeLink = 'resume.html';
          let letterLink = 'cover-letter.html';
          let emailLink = 'cold-email.html';

          if (resumes.length > 0) {
            const r = resumes[0];
            recentResumeText = r.full_name ? `${r.full_name}'s Resume` : 'Untitled Resume';
            resumeLink = `resume.html?edit=${r.id}`;
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
            <div class="smart-card">
                <div class="smart-card-title">📁 Recent Workspace Docs</div>
                <div class="smart-card-stats" style="gap: 0.5rem; justify-content: center;">
                    <div style="font-size: 0.82rem; margin-bottom: 0.5rem; color: var(--text-3); font-weight: 700; text-transform: uppercase;">Recent Drafts</div>
                    <a href="${resumeLink}" class="smart-stat-row" style="text-decoration: none; cursor: pointer; padding: 0.4rem 0;">
                        <span class="smart-stat-label" style="color: var(--text-1); font-weight: 600;">📄 ${window.appSdk.ui.escapeHtml(recentResumeText)}</span>
                        <span style="color: var(--cyan); font-size: 0.8rem;">Open →</span>
                    </a>
                    <a href="${letterLink}" class="smart-stat-row" style="text-decoration: none; cursor: pointer; padding: 0.4rem 0;">
                        <span class="smart-stat-label" style="color: var(--text-1); font-weight: 600;">📨 ${window.appSdk.ui.escapeHtml(recentLetterText)}</span>
                        <span style="color: var(--cyan); font-size: 0.8rem;">Open →</span>
                    </a>
                    <a href="${emailLink}" class="smart-stat-row" style="text-decoration: none; cursor: pointer; padding: 0.4rem 0;">
                        <span class="smart-stat-label" style="color: var(--text-1); font-weight: 600;">✉️ ${window.appSdk.ui.escapeHtml(recentEmailText)}</span>
                        <span style="color: var(--cyan); font-size: 0.8rem;">Open →</span>
                    </a>
                </div>
                <button type="button" class="btn-primary" onclick="document.querySelector('.sidebar-item-btn[data-tab=resume]')?.click() || (window.location.href='resume.html')" style="margin-top: auto; text-align: center; width: 100%;">Open Documents</button>
            </div>
          `;
        }

        smartGrid.innerHTML = gridHtml;
      }

      // ─── Render Recent Activity ───
      const recentActivityList = document.getElementById('recentActivityList');
      if (recentActivityList) {
        let activityItems = [];

        if (resumes.length > 0) {
          const r = resumes[0];
          const timeAgo = window.DashboardManager.formatTimeAgo(new Date(r.created_at));
          activityItems.push({
            title: `Resume updated for ${r.full_name || 'profile'}`,
            time: timeAgo,
            link: `resume.html?edit=${r.id}`,
            actionText: 'Resume Builder',
            rawTime: new Date(r.created_at).getTime()
          });
        }

        if (coverLetters.length > 0) {
          const l = coverLetters[0];
          const timeAgo = window.DashboardManager.formatTimeAgo(new Date(l.created_at || l.updated_at));
          activityItems.push({
            title: `Cover letter generated for ${l.job_title || 'Role'} at ${l.company_name || 'Company'}`,
            time: timeAgo,
            link: `cover-letter.html`,
            actionText: 'Cover Letter AI',
            rawTime: new Date(l.created_at || l.updated_at).getTime()
          });
        }

        if (emails.length > 0) {
          const e = emails[0];
          const timeAgo = window.DashboardManager.formatTimeAgo(new Date(e.created_at));
          activityItems.push({
            title: `Cold email saved for ${e.recipient_title || 'Contact'} at ${e.company || 'Company'}`,
            time: timeAgo,
            link: `cold-email.html`,
            actionText: 'Cold Email Writer',
            rawTime: new Date(e.created_at).getTime()
          });
        }

        if (!isManual && interviewHistory.length > 0) {
          const h = interviewHistory[0];
          const timeAgo = window.DashboardManager.formatTimeAgo(new Date(h.createdAt));
          activityItems.push({
            title: `Mock interview completed: ${h.title} (Score: ${h.score}%)`,
            time: timeAgo,
            link: `interview.html`,
            actionText: 'Interview Coach',
            rawTime: new Date(h.createdAt).getTime()
          });
        }

        activityItems.sort((a, b) => b.rawTime - a.rawTime);

        if (activityItems.length === 0) {
          recentActivityList.innerHTML = `<div style="font-size: 0.85rem; color: var(--text-3); text-align: center; padding: 2rem;">No recent activity recorded.</div>`;
        } else {
          recentActivityList.innerHTML = activityItems.map(item => `
            <div class="activity-item">
                <div class="activity-content">
                    <div class="activity-title">${window.appSdk.ui.escapeHtml(item.title)}</div>
                    <div class="activity-time">${item.time} &bull; ${item.actionText}</div>
                </div>
                <a href="${item.link}" class="activity-action">Open →</a>
            </div>
          `).join('');
        }
      }

      // ─── Render Quick Resume List ───
      const quickResumeList = document.getElementById('quickResumeList');
      if (quickResumeList) {
        let quickHtml = '';

        let resumeLink = 'resume.html';
        let resumeSubtitle = 'Create new resume';
        if (resumes.length > 0) {
          const r = resumes[0];
          resumeLink = `resume.html?edit=${r.id}`;
          resumeSubtitle = `Continue editing ${r.full_name || 'Resume'}`;
        }
        quickHtml += `
          <a href="${resumeLink}" class="quick-item">
              <span class="quick-label">Resume Builder</span>
              <span class="quick-action-text">${window.appSdk.ui.escapeHtml(resumeSubtitle)}</span>
          </a>
        `;

        let letterLink = 'cover-letter.html';
        let letterSubtitle = 'Open latest draft';
        if (coverLetters.length > 0) {
          const l = coverLetters[0];
          letterSubtitle = `Open ${l.job_title || 'letter'} draft @ ${l.company_name || 'Acme'}`;
        }
        quickHtml += `
          <a href="${letterLink}" class="quick-item">
              <span class="quick-label">Cover Letter</span>
              <span class="quick-action-text">${window.appSdk.ui.escapeHtml(letterSubtitle)}</span>
          </a>
        `;

        let emailLink = 'cold-email.html';
        let emailSubtitle = 'Resume draft';
        if (emails.length > 0) {
          const e = emails[0];
          emailSubtitle = `Open intro draft for ${e.company || 'Acme'}`;
        }
        quickHtml += `
          <a href="${emailLink}" class="quick-item">
              <span class="quick-label">Cold Email</span>
              <span class="quick-action-text">${window.appSdk.ui.escapeHtml(emailSubtitle)}</span>
          </a>
        `;

        if (!isManual) {
          let interviewSubtitle = 'Start practice';
          if (interviewHistory.length > 0) {
            const h = interviewHistory[0];
            interviewSubtitle = `Resume ${h.title}`;
          }
          quickHtml += `
            <a href="interview.html" class="quick-item">
                <span class="quick-label">Interview Coach</span>
                <span class="quick-action-text">${window.appSdk.ui.escapeHtml(interviewSubtitle)}</span>
            </a>
          `;
        }

        quickResumeList.innerHTML = quickHtml;
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
  }

  async function initPage() {
    try {
      if (window.appSdk && window.appSdk.ready) {
        await window.appSdk.ready;
      }
      if (!window.AuthManager) return;
      const session = await window.AuthManager.requireAuth();
      if (!session) return;

      currentUserId = session.user.id;
      const name = session.user.user_metadata?.full_name
          || localStorage.getItem('userName')
          || session.user.email.split('@')[0];

      const nameEl = document.getElementById('welcomeNameSpan');
      if (nameEl) nameEl.textContent = name;

      const avatarEl = document.getElementById('avatarInitial');
      if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();

      // Release page curtain immediately to enable instant interactivity
      const curtain = document.getElementById('auth-guard-curtain');
      if (curtain) {
        curtain.style.opacity = '0';
        setTimeout(() => curtain.remove(), 400);
      }

      // Load secondary data asynchronously in background
      loadDashboardData();

      window.addEventListener('workspaceChanged', () => {
        loadDashboardData();
      });
    } catch (err) {
      console.error('Initialization error:', err);
      window.location.href = 'login.html?error=true';
    }
  }

  window.addEventListener('load', initPage);

  // Setup pro button if present
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-upgrade-pro');
    if (btn) {
      btn.onclick = async function(e){
        e.preventDefault();
        try {
          if (window.appSdk && window.appSdk.billing) {
            const upgraded = await window.appSdk.billing.initiateCheckout('pro_monthly', 299);
            if (upgraded) {
              btn.style.display = 'none';
            }
          }
        } catch (err) {
          console.error(err);
        }
      };
    }
  });
})();
