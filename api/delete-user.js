import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // Only accept POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId } = req.body;

    // Validate userId
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        // Get environment variables
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        // Check if env vars exist
        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Missing env vars');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Create Supabase client with service role
        const supabase = createClient(supabaseUrl, serviceRoleKey);

        // Delete resumes
        const { error: resumeErr } = await supabase
            .from('resumes')
            .delete()
            .eq('user_id', userId);

        if (resumeErr) console.warn('Resume delete warning:', resumeErr);

        // Delete profile
        const { error: profileErr } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);

        if (profileErr) console.warn('Profile delete warning:', profileErr);

        // Delete auth user (PERMANENT)
        const { error: deleteErr } = await supabase.auth.admin.deleteUser(userId);

        if (deleteErr) {
            console.error('Auth delete error:', deleteErr);
            return res.status(400).json({ error: `Auth error: ${deleteErr.message}` });
        }

        console.log(`✅ User ${userId} deleted`);
        return res.status(200).json({ success: true, message: 'Account deleted' });

    } catch (err) {
        console.error('Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
