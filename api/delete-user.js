const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId } = req.body || {};

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Missing env vars');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);

        // Delete resumes
        await supabase.from('resumes').delete().eq('user_id', userId);

        // Delete profile
        await supabase.from('profiles').delete().eq('id', userId);

        // Delete auth user permanently
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
};
