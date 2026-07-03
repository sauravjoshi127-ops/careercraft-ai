/**
 * CareerCraft AI Unified Client SDK (v1.0.0)
 * Centralizes Supabase integration, user auth guards, and common UI elements.
 */
(function () {

  // ─── Centralized Workspace Manager ─────────────────────────
  const WorkspaceManager = {
    workspace: localStorage.getItem('careercraft_workspace') || 'ai',

    init() {
      // Apply theme class early to avoid FOUC
      this.applyThemeClass();

      // Listen to cross-tab storage changes
      window.addEventListener('storage', (e) => {
        if (e.key === 'careercraft_workspace') {
          const val = e.newValue || 'ai';
          if (val !== this.workspace) {
            this.setWorkspace(val, false);
          }
        }
      });
    },

    applyThemeClass() {
      const page = window.location.pathname.split('/').pop() || 'index.html';
      const isAppPage = page !== 'index.html' && page !== 'login.html' && page !== 'signup.html' && page !== 'reset-password.html' && page !== '';
      const isDocPage = isAppPage && (page.startsWith('resume') || page.startsWith('cover-letter') || page.startsWith('cold-email') || page.startsWith('dashboard'));

      if (isAppPage) {
        if (this.workspace === 'manual') {
          document.body.classList.remove('theme-ai-active');
          document.body.classList.add('theme-manual-active');
          if (isDocPage) {
            document.body.classList.add('manual-studio-active');
          } else {
            document.body.classList.remove('manual-studio-active');
          }
        } else {
          document.body.classList.remove('theme-manual-active');
          document.body.classList.remove('manual-studio-active');
          document.body.classList.add('theme-ai-active');
        }
      }
    },

    getButtonHtml() {
      const active = this.workspace === 'manual';
      const label = active ? 'Manual Studio' : 'AI Studio';
      const dotColor = active ? '#10b981' : '#7c3aed';
      const dotGlow = active ? 'rgba(16,185,129,0.6)' : 'rgba(124,58,237,0.8)';
      return `
        <button type="button" class="workspace-toggle-btn" id="global-workspace-switcher" onclick="window.WorkspaceManager.toggle()" style="margin-right:0.5rem;">
          <span class="badge-dot" style="background: ${dotColor}; box-shadow: 0 0 10px ${dotGlow}; width: 7px; height: 7px; border-radius: 50%; display: inline-block;"></span>
          <span>${label}</span>
          <span style="opacity: 0.5;">↔</span>
        </button>
      `;
    },

    async toggle() {
      const target = this.workspace === 'ai' ? 'manual' : 'ai';
      await this.setWorkspace(target, true);
    },

    async setWorkspace(target, animate = true) {
      if (animate) {
        // Show portal loader
        let portal = document.getElementById('workspace-portal');
        if (!portal) {
          portal = document.createElement('div');
          portal.id = 'workspace-portal';
          portal.className = 'workspace-portal-overlay';
          portal.innerHTML = `
            <div class="workspace-portal-card">
              <div class="workspace-portal-spinner"></div>
              <div class="workspace-portal-title" id="portal-title">Aligning Workspace...</div>
              <div class="workspace-portal-subtitle" id="portal-subtitle">Applying design system tokens</div>
            </div>
          `;
          document.body.appendChild(portal);
        }

        const title = document.getElementById('portal-title');
        const subtitle = document.getElementById('portal-subtitle');
        if (title && subtitle) {
          title.textContent = target === 'manual' ? 'Opening Manual Studio' : 'Launching AI Studio';
          subtitle.textContent = target === 'manual' 
            ? 'Entering elegant Apple/Notion environment...' 
            : 'Powering up career copilot & ATS suggestions...';
        }

        portal.classList.add('active');
        document.body.classList.add('workspace-transitioning');

        // Let the portal and scale animations run (350ms)
        await new Promise(resolve => setTimeout(resolve, 350));
      }

      this.workspace = target;
      localStorage.setItem('careercraft_workspace', target);

      const page = window.location.pathname.split('/').pop() || 'index.html';
      if (target === 'manual' && page.startsWith('interview')) {
        if (animate) {
          await new Promise(resolve => setTimeout(resolve, 150));
          document.body.classList.remove('workspace-transitioning');
          const portal = document.getElementById('workspace-portal');
          if (portal) portal.classList.remove('active');
        }
        window.location.href = 'dashboard.html';
        return;
      }

      this.applyThemeClass();

      // Update button elements on page if they exist
      const btn = document.getElementById('global-workspace-switcher');
      if (btn) {
        const active = target === 'manual';
        const label = active ? 'Manual Studio' : 'AI Studio';
        const dotColor = active ? '#10b981' : '#7c3aed';
        const dotGlow = active ? 'rgba(16,185,129,0.6)' : 'rgba(124,58,237,0.8)';
        
        btn.innerHTML = `
          <span class="badge-dot" style="background: ${dotColor}; box-shadow: 0 0 10px ${dotGlow}; width: 7px; height: 7px; border-radius: 50%; display: inline-block;"></span>
          <span>${label}</span>
          <span style="opacity: 0.5;">↔</span>
        `;
      }

      // Broadcast event so other modules can react
      window.dispatchEvent(new CustomEvent('workspaceChanged', { detail: { workspace: target } }));

      if (animate) {
        await new Promise(resolve => setTimeout(resolve, 150));
        document.body.classList.remove('workspace-transitioning');
        const portal = document.getElementById('workspace-portal');
        if (portal) portal.classList.remove('active');
      }
    }
  };

  window.WorkspaceManager = WorkspaceManager;
  WorkspaceManager.init();

  const appSdk = {
    client: null,

    // Auth modules
    auth: {
      async getSession() {
        await appSdk.ready;
        if (!appSdk.client) return null;
        const { data: { session } } = await appSdk.client.auth.getSession();
        return session;
      },

      async getUser() {
        const session = await this.getSession();
        return session ? session.user : null;
      },

      async requireAuth(redirectPath = 'login.html') {
        const session = await this.getSession();
        if (!session) {
          // Check if redirect has parameter
          const currentPath = window.location.pathname.split('/').pop();
          const target = currentPath ? `${redirectPath}?redirect=${encodeURIComponent(currentPath + window.location.search)}` : redirectPath;
          window.location.href = target;
          return null;
        }
        return session;
      },

      async logout() {
        await appSdk.ready;
        if (appSdk.client) {
          await appSdk.client.auth.signOut();
        }
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userName');
        localStorage.removeItem('userId');
        localStorage.removeItem('userToken');
        window.location.href = 'index.html';
      }
    },

    // UI Modules
    ui: {
      showToast(message, typeOrIsError = 'success') {
        const isError = typeOrIsError === 'error' || typeOrIsError === true;
        const className = isError ? 'error' : 'success';

        let toast = document.getElementById('toast');
        if (!toast) {
          toast = document.createElement('div');
          toast.id = 'toast';
          toast.className = 'toast';
          document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.className = `toast ${className} show`;
        toast.style.display = 'block';

        // Keep displayed during transition, clear after 3 seconds
        if (toast.timeoutId) clearTimeout(toast.timeoutId);
        toast.timeoutId = setTimeout(() => {
          toast.classList.remove('show');
          setTimeout(() => {
            if (!toast.classList.contains('show')) {
              toast.style.display = 'none';
            }
          }, 400); // Wait for CSS transition (0.4s)
        }, 3000);
      },

      escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
      },

      formatDate(dateStr) {
        if (!dateStr) return 'Unknown date';
        return new Date(dateStr).toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric'
        });
      },

      isValidUUID(str) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      },

      async initLayout() {
        const page = window.location.pathname.split('/').pop() || 'index.html';
        const session = await appSdk.auth.getSession();
        
        // 1. Render Header Navigation
        const topnav = document.querySelector('.topnav') || document.querySelector('nav');
        if (topnav) {
          if (page === 'index.html' || page === '') {
            // Landing page header
            const rightButtons = session 
              ? `<a href="dashboard.html" class="btn-primary">Dashboard</a>
                 <div class="user-avatar" onclick="window.location.href='settings.html'" title="Go to settings" style="margin-left:0.5rem; display:inline-flex;">${(session.user.user_metadata?.full_name || session.user.email || 'U').charAt(0).toUpperCase()}</div>`
              : `<a href="login.html" class="btn-signin">Sign In</a>
                 <a href="signup.html" class="btn-primary">Get Started</a>`;
                 
            topnav.innerHTML = `
              <a href="index.html" class="logo">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="url(#paint0_linear)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 17L12 22L22 17" stroke="url(#paint1_linear)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 12L12 17L22 12" stroke="url(#paint2_linear)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <defs>
                          <linearGradient id="paint0_linear" x1="2" y1="2" x2="22" y2="12" gradientUnits="userSpaceOnUse">
                              <stop stop-color="#7c3aed"/>
                              <stop offset="1" stop-color="#a855f7"/>
                          </linearGradient>
                          <linearGradient id="paint1_linear" x1="2" y1="17" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                              <stop stop-color="#7c3aed"/>
                              <stop offset="1" stop-color="#a855f7"/>
                          </linearGradient>
                          <linearGradient id="paint2_linear" x1="2" y1="12" x2="22" y2="17" gradientUnits="userSpaceOnUse">
                              <stop stop-color="#7c3aed"/>
                              <stop offset="1" stop-color="#a855f7"/>
                          </linearGradient>
                      </defs>
                  </svg>
                  CareerCraft
              </a>
              <ul class="nav-links">
                  <li><a href="#features">Features</a></li>
                  <li><a href="#pricing">Pricing</a></li>
                  <li><a href="#">Enterprise</a></li>
              </ul>
              <div class="nav-buttons" style="display:flex; align-items:center; gap:0.5rem;">
                  ${rightButtons}
              </div>
            `;
          } else if (page === 'login.html' || page === 'signup.html' || page === 'reset-password.html') {
            // Simple back-to-home header
            topnav.innerHTML = `
              <a href="index.html" class="logo">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  CareerCraft AI
              </a>
              <a href="index.html" class="btn-primary" style="background: transparent; border: 1px solid var(--border-color); color: var(--text-primary); padding: 0.5rem 1rem; width: auto; font-size: 0.85rem;">← Back to Home</a>
            `;
          } else if (page === 'resume-share.html') {
            // Public share header
            topnav.innerHTML = `
              <a href="index.html" class="logo">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  CareerCraft AI
              </a>
              <a href="signup.html" class="btn-accent" style="padding: 0.5rem 1.2rem; width: auto; font-size: 0.85rem;">Get Started for Free</a>
            `;
          } else {
            // Authenticated App page header
            const name = session ? (session.user.user_metadata?.full_name 
              || localStorage.getItem('userName') 
              || session.user.email.split('@')[0]) : 'User';
            const initial = name.charAt(0).toUpperCase();

            const resumeActive = page.startsWith('resume') ? 'class="nav-btn active"' : 'class="nav-btn"';
            const coverLetterActive = page.startsWith('cover-letter') ? 'class="nav-btn active"' : 'class="nav-btn"';
            const coldEmailActive = page.startsWith('cold-email') ? 'class="nav-btn active"' : 'class="nav-btn"';
            const interviewActive = (page.startsWith('interview') || page.startsWith('mock')) ? 'class="nav-btn active"' : 'class="nav-btn"';

            topnav.innerHTML = `
              <a href="dashboard.html" class="logo">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span class="premium-gradient-text">CareerCraft AI</span>
              </a>
              <div class="nav-links" style="display:flex;gap:0.5rem;">
                  <a href="resume.html" ${resumeActive}>Resume</a>
                  <a href="cover-letter.html" ${coverLetterActive}>Cover Letter</a>
                  <a href="cold-email.html" ${coldEmailActive}>Cold Email</a>
                  <a href="interview.html" ${interviewActive}>Interview</a>
              </div>
              <div class="user-menu" style="display:flex; align-items:center; gap:0.75rem;">
                  ${window.WorkspaceManager ? window.WorkspaceManager.getButtonHtml() : ''}
                  <div class="user-avatar" id="avatarInitial" onclick="window.location.href='settings.html'" title="Account" style="display:flex; align-items:center; justify-content:center; cursor:pointer;">${initial}</div>
                  <a href="settings.html" class="nav-btn">Settings</a>
                  <button class="nav-btn" onclick="window.appSdk.auth.logout()">Sign Out</button>
              </div>
            `;
          }
        }

        // 2. Render Footer
        const footer = document.querySelector('footer');
        if (footer && (page === 'index.html' || page === '')) {
          footer.innerHTML = `
            <div class="footer-brand">
                <div class="logo" style="margin-bottom: 0.5rem; font-size: 1.2rem;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    CareerCraft AI
                </div>
                <p>&copy; 2026 CareerCraft AI Inc.<br>All rights reserved.</p>
            </div>
            <div class="footer-links">
                <a href="#">Privacy Policy</a>
                <a href="#">Terms of Service</a>
                <a href="#">Contact Support</a>
            </div>
          `;
        } else if (page !== 'index.html' && page !== 'login.html' && page !== 'signup.html' && page !== 'reset-password.html' && page !== '') {
          // Sleek subtle copyright footer inside authorized pages container
          const container = document.querySelector('.container') || document.querySelector('.shell');
          if (container && !document.querySelector('.app-mini-footer')) {
            const miniFooter = document.createElement('div');
            miniFooter.className = 'app-mini-footer';
            miniFooter.style.cssText = 'text-align: center; color: var(--text-3); font-size: 0.8rem; margin: 4rem 0 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border);';
            miniFooter.innerHTML = `&copy; 2026 CareerCraft AI &bull; Premium AI Career Toolkit`;
            container.appendChild(miniFooter);
          }
        }
      }
    },

    // Billing Module (Razorpay integration)
    billing: {
      async initiateCheckout(planId, amount) {
        const session = await appSdk.auth.getSession();
        if (!session) {
          appSdk.ui.showToast('Please log in again to upgrade.', 'error');
          return;
        }

        // Auto-load Razorpay checkout script if missing
        if (!window.Razorpay) {
          try {
            await loadScript('https://checkout.razorpay.com/v1/checkout.js');
          } catch (err) {
            console.error('Failed to load Razorpay Checkout script:', err);
            appSdk.ui.showToast('Failed to load payment gateway script.', 'error');
            throw err;
          }
        }

        try {
          const session = await appSdk.auth.getSession();
          const headers = { 'Content-Type': 'application/json' };
          if (session) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
          }

          // 1. Create Order on Server
          const response = await fetch('/api/create-order', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ amount: amount, planId: planId })
          });
          
          const orderData = await response.json();
          if (!response.ok) {
            throw new Error(orderData.error || 'Failed to create order');
          }

          // 2. Initialize Razorpay Checkout
          return new Promise((resolve, reject) => {
            const options = {
              key: orderData.key_id,
              amount: orderData.amount,
              currency: "INR",
              name: "CareerCraft AI",
              description: `Upgrade to ${planId === 'pro_lifetime' || planId === 'lifetime' ? 'Lifetime' : 'Pro'}`,
              order_id: orderData.id,
              handler: async function (paymentResponse) {
                try {
                  const verified = await appSdk.billing.verifyPayment(paymentResponse, planId);
                  resolve(verified);
                } catch (err) {
                  reject(err);
                }
              },
              prefill: {
                name: session.user.user_metadata?.full_name || '',
                email: session.user.email || ''
              },
              theme: {
                color: "#7c3aed"
              }
            };

            const rzp1 = new window.Razorpay(options);
            
            rzp1.on('payment.failed', function (res) {
              appSdk.ui.showToast("Payment Failed: " + res.error.description, 'error');
              reject(new Error(res.error.description));
            });
            
            rzp1.open();
          });
        } catch (err) {
          console.error("Checkout error:", err);
          appSdk.ui.showToast(err.message || "Failed to initiate checkout.", 'error');
          throw err;
        }
      },

      async verifyPayment(paymentDetails, planId) {
        const session = await appSdk.auth.getSession();
        const headers = { 'Content-Type': 'application/json' };
        if (session) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        try {
          const response = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
              razorpay_order_id: paymentDetails.razorpay_order_id,
              razorpay_payment_id: paymentDetails.razorpay_payment_id,
              razorpay_signature: paymentDetails.razorpay_signature,
              planId: planId
            })
          });

          const result = await response.json();
          if (response.ok && result.success) {
            appSdk.ui.showToast('Payment Successful! Welcome to Pro.', 'success');
            if (appSdk.client) {
              await appSdk.client.auth.refreshSession();
            }
            return true;
          } else {
            appSdk.ui.showToast(result.message || 'Payment verification failed.', 'error');
            return false;
          }
        } catch (err) {
          console.error("Verification error:", err);
          appSdk.ui.showToast('Verification error occurred.', 'error');
          return false;
        }
      }
    }
  };

  // Helper to load external scripts dynamically
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Helper to load stylesheet dynamically
  function loadStylesheet(url) {
    if (document.querySelector(`link[href="${url}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
  }

  // Start initialization immediately
  appSdk.ready = (async function init() {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    const isAppPage = page !== 'index.html' && page !== 'login.html' && page !== 'signup.html' && page !== 'reset-password.html' && page !== '';

    if (!window.supabase) {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      } catch (err) {
        console.error('Failed to dynamically load Supabase CDN:', err);
      }
    }

    // Load Manual Studio assets dynamically for authenticated app pages
    if (isAppPage) {
      loadStylesheet('manual-studio.css');
      loadScript('manual-studio.js').catch(err => {
        console.error('Failed to load manual-studio.js dynamically:', err);
      });
    }

    try {
      const configRes = await fetch('/api/config');
      if (!configRes.ok) {
        throw new Error(`Failed to load runtime configuration: ${configRes.status} ${configRes.statusText}`);
      }
      const config = await configRes.json();
      if (!config.supabaseUrl || !config.supabaseKey) {
        throw new Error('Missing required fields in runtime configuration: supabaseUrl and/or supabaseKey');
      }
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        appSdk.client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
      } else {
        console.error('Supabase library is not available.');
      }
    } catch (err) {
      console.error('[SDK] Failed to initialize Supabase client from /api/config. Check server SUPABASE_URL and SUPABASE_ANON_KEY setup in the README:', err);
    }

    // Auto-init navigation layouts when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => appSdk.ui.initLayout());
    } else {
      appSdk.ui.initLayout();
    }
  })();

  // Bind to global window namespace
  window.appSdk = appSdk;
})();
