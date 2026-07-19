/**
 * CareerCraft AI Unified Client SDK (app-sdk.js)
 * Centralizes Supabase initialization, user auth state queries, and API checkout payment interfaces.
 */
(function () {

  let resolveAuthReady;
  const authReady = new Promise(resolve => {
    resolveAuthReady = resolve;
  });

  const appSdk = {
    client: null,

    // Auth module (delegates to AuthManager if loaded for unified state)
    auth: {
      async getSession() {
        if (window.AuthManager) {
          return window.AuthManager.getSession();
        }
        await appSdk.ready;
        if (!appSdk.client) return null;
        const restoredSession = await authReady;
        const { data: { session } } = await appSdk.client.auth.getSession();
        return session || restoredSession;
      },

      async getUser() {
        if (window.AuthManager) {
          return window.AuthManager.getUser();
        }
        const session = await this.getSession();
        return session ? session.user : null;
      },

      async requireAuth(redirectPath = 'login.html') {
        if (window.AuthManager) {
          return window.AuthManager.requireAuth(redirectPath);
        }
        const session = await this.getSession();
        if (!session) {
          const currentPath = window.location.pathname.split('/').pop();
          const target = currentPath ? `${redirectPath}?redirect=${encodeURIComponent(currentPath + window.location.search)}` : redirectPath;
          window.location.href = target;
          return null;
        }
        return session;
      },

      async logout() {
        if (window.AuthManager) {
          return window.AuthManager.logout();
        }
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

    // UI proxy helpers (delegates style-free behaviors to active LayoutManager if loaded)
    ui: {
      showToast(message, typeOrIsError = 'success') {
        if (window.LayoutManager && typeof window.LayoutManager.showToast === 'function') {
          window.LayoutManager.showToast(message, typeOrIsError);
        } else {
          console.log(`[Toast Fallback] ${typeOrIsError === 'error' ? '❌' : '✅'} ${message}`);
        }
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
      }
    },

    // API Module for standardized error handling and timeouts
    api: {
      async safeFetch(url, options = {}, timeoutMs = 15000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const fetchOptions = { ...options, signal: controller.signal };

        try {
          const response = await fetch(url, fetchOptions);
          if (!response.ok) {
            let errorMsg = `HTTP Error ${response.status}`;
            try {
              const errData = await response.json();
              if (errData && errData.error) errorMsg = errData.error;
              else if (errData && errData.message) errorMsg = errData.message;
            } catch (e) {
              // Ignore JSON parse error, use default status text
            }
            throw new Error(errorMsg);
          }
          return response;
        } catch (error) {
          if (error.name === 'AbortError') {
            appSdk.ui.showToast('Request timed out. Please check your connection and try again.', 'error');
            throw new Error('Request timed out');
          }
          const msg = error.message || 'An unexpected network error occurred.';
          appSdk.ui.showToast(msg, 'error');
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      }
    },

    // Billing Module (Razorpay Checkout)
    billing: {
      async initiateCheckout(planId, amount) {
        const session = await appSdk.auth.getSession();
        if (!session) {
          appSdk.ui.showToast('Please log in again to upgrade.', 'error');
          return;
        }

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
          const headers = { 'Content-Type': 'application/json' };
          headers['Authorization'] = `Bearer ${session.access_token}`;

          // Create Order
          const response = await fetch('/api/create-order', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ amount: amount, planId: planId })
          });
          
          const orderData = await response.json();
          if (!response.ok) {
            throw new Error(orderData.error || 'Failed to create order');
          }

          // Checkout options
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
        if (!session) return false;
        
        const headers = { 'Content-Type': 'application/json' };
        headers['Authorization'] = `Bearer ${session.access_token}`;

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

  // Helper to load script dynamically
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Start initialization immediately
  appSdk.ready = (async function init() {
    if (!window.supabase) {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      } catch (err) {
        console.error('Failed to dynamically load Supabase CDN:', err);
      }
    }

    try {
      const configRes = await fetch('/api/config');
      if (!configRes.ok) {
        throw new Error(`Failed to load configuration: ${configRes.status}`);
      }
      const config = await configRes.json();
      if (!config.supabaseUrl || !config.supabaseKey) {
        throw new Error('Missing required fields in configuration');
      }
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        appSdk.client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
        appSdk.client.auth.onAuthStateChange((event, session) => {
          resolveAuthReady(session);
        });
      } else {
        console.error('Supabase library not available.');
        resolveAuthReady(null);
      }
    } catch (err) {
      console.error('[SDK] Failed to initialize Supabase client.', err);
      resolveAuthReady(null);
    }
  })();

  window.appSdk = appSdk;
})();
