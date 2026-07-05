/**
 * dashboard-manager.js
 * Business logic calculations and shared metrics computation for dashboard view states.
 */
(function () {
  const DashboardManager = {
    // Shared calculations for resume progress
    calculateResumeProgress(resume) {
      if (!resume) return 0;
      let progress = 0;
      if (resume.full_name || resume.email || resume.phone) progress += 20;
      if (resume.professional_summary) progress += 20;
      if (resume.experience && resume.experience.length > 0) progress += 30;
      if (resume.education && resume.education.length > 0) progress += 15;
      if (resume.skills && resume.skills.length > 0) progress += 15;
      return progress;
    },

    // Calculates average interview score from local storage history
    calculateAverageInterviewScore(interviewHistory) {
      if (!interviewHistory || interviewHistory.length === 0) return 0;
      const scores = interviewHistory.map(h => Number(h.score)).filter(Number.isFinite);
      return scores.length ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : 0;
    },

    // Formats dates to "time ago" format
    formatTimeAgo(date) {
      const seconds = Math.floor((new Date() - date) / 1000);
      let interval = Math.floor(seconds / 31536000);
      if (interval >= 1) return interval + " year" + (interval > 1 ? "s" : "") + " ago";
      interval = Math.floor(seconds / 2592000);
      if (interval >= 1) return interval + " month" + (interval > 1 ? "s" : "") + " ago";
      interval = Math.floor(seconds / 86400);
      if (interval >= 1) return interval + " day" + (interval > 1 ? "s" : "") + " ago";
      interval = Math.floor(seconds / 3600);
      if (interval >= 1) return interval + " hour" + (interval > 1 ? "s" : "") + " ago";
      interval = Math.floor(seconds / 60);
      if (interval >= 1) return interval + " minute" + (interval > 1 ? "s" : "") + " ago";
      return "just now";
    },

    // Fetches all raw data required for dashboard in parallel (cached via StorageManager)
    async fetchRawDashboardData(userId) {
      if (window.StorageManager) {
        return window.StorageManager.getCache(`dashboard_data_${userId}`, async () => {
          const client = window.appSdk.client;
          const [resumesRes, coverLettersRes, emailsRes] = await Promise.all([
            client.from('resumes').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
            client.from('cover_letters').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
            client.from('email_history').select('*').eq('user_id', userId).order('created_at', { ascending: false })
          ]);
          return {
            resumes: resumesRes.data || [],
            coverLetters: coverLettersRes.data || [],
            emails: emailsRes.data || []
          };
        }, 3000); // 3-second cache TTL
      } else {
        const client = window.appSdk.client;
        const [resumesRes, coverLettersRes, emailsRes] = await Promise.all([
          client.from('resumes').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
          client.from('cover_letters').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
          client.from('email_history').select('*').eq('user_id', userId).order('created_at', { ascending: false })
        ]);
        return {
          resumes: resumesRes.data || [],
          coverLetters: coverLettersRes.data || [],
          emails: emailsRes.data || []
        };
      }
    }
  };

  window.DashboardManager = DashboardManager;
})();
