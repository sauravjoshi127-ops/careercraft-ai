const { createClient } = require('@supabase/supabase-js');
require('../utils/env-loader');

(async () => {
  console.log('Connecting to Supabase using Service Role Key...');
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false
    }
  });

  const email = 'confirmed_test_user@example.com';
  const password = 'Password123!';

  console.log(`Checking if user ${email} already exists...`);
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Failed to list users:', listError);
    process.exit(1);
  }

  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    console.log(`User exists with ID: ${existingUser.id}. Deleting user first to start fresh...`);
    const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id);
    if (deleteError) {
      console.error('Failed to delete existing user:', deleteError);
      process.exit(1);
    }
    console.log('User deleted successfully.');
  }

  console.log(`Creating auto-confirmed user: ${email}...`);
  const { data: userData, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: 'Confirmed Test User'
    }
  });

  if (createError) {
    console.error('Failed to create confirmed user:', createError);
    process.exit(1);
  }

  console.log('✅ User created successfully!', userData.user.id);
  process.exit(0);
})();
