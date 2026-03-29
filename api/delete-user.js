import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Missing Supabase environment variables');
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        console.log(`Deleting user: ${userId}`);

        // Step 1: Delete user resumes
        await supabase.from('resumes').delete().eq('user_id', userId);

        // Step 2: Delete user profile
        await supabase.from('profiles').delete().eq('id', userId);

        // Step 3: Delete auth user permanently
        const { error: authError } = await supabase.auth.admin.deleteUser(userId);

        if (authError) {
            throw new Error(`Failed to delete auth user: ${authError.message}`);
        }

        console.log(`✅ User ${userId} deleted successfully`);
        return res.status(200).json({ 
            success: true,
            message: 'Account deleted permanently' 
        });

    } catch (error) {
        console.error('Delete error:', error);
        return res.status(500).json({ error: error.message });
    }
}
