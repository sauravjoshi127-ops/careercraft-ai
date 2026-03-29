export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { userId } = req.body;

        const supabaseUrl = 'YOUR_SUPABASE_URL'; // Replace with your Supabase URL
        const supabaseServiceKey = 'YOUR_SUPABASE_SERVICE_ROLE_KEY'; // Replace with your Supabase service role key

        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Step 1: Delete user resumes from the database
        const { error: resumeError } = await supabase
            .from('resumes')
            .delete()
            .eq('user_id', userId);

        if (resumeError) {
            return res.status(400).json({ message: 'Error deleting user resumes', error: resumeError.message });
        }

        // Step 2: Delete user profile
        const { error: profileError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);

        if (profileError) {
            return res.status(400).json({ message: 'Error deleting user profile', error: profileError.message });
        }

        // Step 3: Permanently delete the auth user
        const { error: userDeletionError } = await supabase.auth.admin.deleteUser(userId);

        if (userDeletionError) {
            return res.status(400).json({ message: 'Error deleting auth user', error: userDeletionError.message });
        }

        return res.status(200).json({ message: 'User account deleted successfully.' });
    } else {
        return res.status(405).json({ message: 'Method not allowed' });
    }
}