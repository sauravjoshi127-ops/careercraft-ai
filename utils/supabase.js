// Ensure environment variables are loaded (important for serverless functions bypassing server.js)
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Public fallback credentials (matching frontend app-sdk.js)
const FALLBACK_SUPABASE_URL = 'https://eduogxolvpqdtvtdiqav.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkdW9neG9sdnBxZHR2dGRpcWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjkzMjksImV4cCI6MjA5MDIwNTMyOX0.MmCTr5qceI2iSCBzs2AcLPhn7_aoKfsoWUoKMUwhPhc';

/**
 * Initializes a Supabase client. If a token is provided and we are using the anon key,
 * it authenticates the client session so RLS policies are satisfied.
 */
async function getSupabaseClient(token = null) {
  let supabaseUrl = process.env.SUPABASE_URL;
  let anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.warn('[Supabase] Warning: SUPABASE_URL is not configured in the environment. Falling back to default public credentials.');
    supabaseUrl = FALLBACK_SUPABASE_URL;
  }

  // Use service role key if available (admin access, bypasses RLS)
  if (serviceRoleKey) {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  // Fallback to anon key
  if (!anonKey) {
    if (supabaseUrl === FALLBACK_SUPABASE_URL) {
      anonKey = FALLBACK_SUPABASE_ANON_KEY;
    } else {
      throw new Error('Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_ANON_KEY is configured in the environment.');
    }
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // If we have a user token, set the session to make the client authenticated
  if (token) {
    const { error } = await supabase.auth.setSession({
      access_token: token,
      refresh_token: ''
    });
    if (error) {
      console.error('[Supabase] Failed to set session token:', error.message);
    }
  }

  return supabase;
}

/**
 * Authenticates a request using the Bearer token in the Authorization header.
 * Returns the authenticated user object, isPro status, and the configured Supabase client instance.
 * Throws an error with a status code if verification fails.
 */
async function authenticateRequest(req) {
  // Bypass authentication during local tests
  if (process.env.NODE_ENV === 'test') {
    return {
      user: { id: '00000000-0000-0000-0000-000000000000', email: 'test@example.com', user_metadata: { plan: 'pro', isPro: true } },
      isPro: true,
      supabase: null
    };
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    const err = new Error('Authentication required. Missing token.');
    err.status = 401;
    throw err;
  }

  const supabase = await getSupabaseClient(token);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    const err = new Error('Invalid or expired authentication session.');
    err.status = 401;
    throw err;
  }

  // Determine if user is Pro
  const isPro = user.user_metadata?.plan === 'pro' ||
                user.user_metadata?.isPro === true ||
                user.app_metadata?.plan === 'pro';

  return { user, isPro, supabase };
}

module.exports = {
  getSupabaseClient,
  authenticateRequest
};
