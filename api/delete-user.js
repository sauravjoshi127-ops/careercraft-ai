'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://your-supabase-url.supabase.co';  // Replace with your Supabase URL
const serviceRoleKey = 'your-service-role-key';  // Replace with your Service Role Key

const supabase = createClient(supabaseUrl, serviceRoleKey);

const deleteUserAccount = async (userId) => {
  try {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    
    if (error) {
      throw error;
    }
    console.log(`User with ID ${userId} has been deleted.`);
  } catch (error) {
    console.error('Error deleting user:', error.message);
  }
};

// Example usage
// deleteUserAccount('user-id-to-delete');

module.exports = { deleteUserAccount };
