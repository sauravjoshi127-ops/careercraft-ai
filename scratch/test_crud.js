const { createClient } = require('@supabase/supabase-js');
require('../utils/env-loader');

async function testCrud() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error('Error: Missing environment variables');
    return;
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false
    }
  });

  const email = `test_user_${Math.random().toString(36).substr(2, 9)}@example.com`;
  const password = 'TestPassword123!';

  console.log('--- Registering temporary test user ---');
  console.log('Email:', email);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password
  });

  if (signUpError) {
    console.error('Sign up failed:', signUpError);
    return;
  }

  const user = signUpData.user;
  const session = signUpData.session;
  console.log('Sign up success. User ID:', user?.id);
  console.log('Session access token exists:', !!session?.access_token);

  if (!user) {
    console.error('No user returned from sign up');
    return;
  }

  // Set the session on the client
  if (session) {
    await supabase.auth.setSession(session);
  }

  console.log('\n--- 1. SELECT test ---');
  const { data: selectData, error: selectError } = await supabase
    .from('email_history')
    .select('*')
    .limit(5);

  console.log('SELECT result error:', selectError);
  console.log('SELECT result data:', selectData);

  console.log('\n--- 2. INSERT test ---');
  const record = {
    user_id: user.id,
    company: 'CRUD Test Co',
    recipient_title: 'QA Engineer',
    subject: 'Test Subject',
    body: 'Test Body',
    status: 'draft'
  };

  const { data: insertData, error: insertError } = await supabase
    .from('email_history')
    .insert([record])
    .select();

  console.log('INSERT result error:', insertError);
  console.log('INSERT result data:', insertData);

  let insertedId = null;
  if (insertData && insertData[0]) {
    insertedId = insertData[0].id;
    console.log('Inserted Row ID:', insertedId);
  }

  if (insertedId) {
    console.log('\n--- 3. UPDATE test ---');
    const { data: updateData, error: updateError } = await supabase
      .from('email_history')
      .update({ subject: 'Updated Subject' })
      .eq('id', insertedId)
      .select();

    console.log('UPDATE result error:', updateError);
    console.log('UPDATE result data:', updateData);

    console.log('\n--- 4. DELETE test ---');
    const { error: deleteError } = await supabase
      .from('email_history')
      .delete()
      .eq('id', insertedId);

    console.log('DELETE result error:', deleteError);
  }

  // Clean up user if possible (admin client needed, or delete via api if supported)
  console.log('\nCRUD tests finished.');
}

testCrud();
