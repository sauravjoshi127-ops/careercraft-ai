export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        try {
            const { createClient } = require('@supabase/supabase-js');
            
            // Use environment variables for Supabase credentials
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

            if (!supabaseUrl || !supabaseServiceKey) {
                console.error('Missing env vars - URL:', !!supabaseUrl, 'Key:', !!supabaseServiceKey);
                throw new Error('Missing Supabase environment variables');
            }

            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            console.log(`Starting deletion for user: ${userId}`);

            // Step 1: Delete user resumes
            await supabase
                .from('resumes')
                .delete()
                .eq('user_id', userId);

            // Step 2: Delete user profile
            await supabase
                .from('profiles')
                .delete()
                .eq('id', userId);

            // Step 3: Permanently delete auth user using ADMIN API
            const { error: authError } = await supabase.auth.admin.deleteUser(userId);

            if (authError) {
                console.error('Auth deletion error:', authError);
                throw new Error(`Failed to delete auth user: ${authError.message}`);
            }

            console.log(`✅ User ${userId} deleted permanently`);
            return res.status(200).json({ 
                success: true,
                message: 'User account deleted permanently' 
            });

        } catch (error) {
            console.error('Delete error:', error.message);
            return res.status(500).json({ error: error.message });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }
}
