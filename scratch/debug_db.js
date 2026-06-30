const { createClient } = require('@supabase/supabase-js');
require('../utils/env-loader');

async function testConnection() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('=== Database Connection Audit ===');
  console.log('Supabase URL:', url);
  console.log('Anon Key exists:', !!anonKey);
  console.log('Service Key exists:', !!serviceKey);

  if (!url || !anonKey) {
    console.error('Error: Missing environment variables');
    return;
  }

  // 1. Create client with Anon Key
  const supabase = createClient(url, anonKey);

  // 2. Try to query email_history
  console.log('\n--- Querying email_history (unauthenticated) ---');
  try {
    const { data, error } = await supabase.from('email_history').select('*').limit(1);
    if (error) {
      console.log('Error querying email_history:', error);
    } else {
      console.log('Success querying email_history (empty or data):', data);
    }
  } catch (err) {
    console.error('Exception during query:', err);
  }

  // 3. Try to query resumes using Service Role to see if that works
  if (serviceKey) {
    console.log('\n--- Querying email_history using Service Role ---');
    const supabaseAdmin = createClient(url, serviceKey);
    try {
      const { data, error } = await supabaseAdmin.from('email_history').select('*').limit(1);
      if (error) {
        console.log('Admin Error querying email_history:', error);
      } else {
        console.log('Admin Success querying email_history:', data);
      }
    } catch (err) {
      console.error('Admin Exception during query:', err);
    }
  }
}

testConnection();
