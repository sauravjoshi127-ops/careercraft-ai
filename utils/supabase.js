const { createClient } = require('@supabase/supabase-js');

/**
 * Initializes a Supabase client. If a token is provided and we are using the anon key,
 * it authenticates the client session so RLS policies are satisfied.
 */
async function getSupabaseClient(token = null) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is not configured in the environment.');
  }

  // Use service role key if available (admin access, bypasses RLS)
  if (serviceRoleKey) {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  // Fallback to anon key
  if (!anonKey) {
    throw new Error('Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_ANON_KEY is configured.');
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
