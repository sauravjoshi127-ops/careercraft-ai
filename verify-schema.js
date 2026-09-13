const fs = require('fs');
const path = require('path');

/**
 * Verifies that the frontend resume form fields are present in the known database schema.
 * This is a development-time safeguard only.
 *
 * Returns true if schema is in sync (or cannot be verified), false if a mismatch is found.
 * NEVER throws. NEVER calls process.exit(). Safe to call in any environment including Vercel.
 */
function verifySchema() {
    try {
        const resumeJsPath = path.join(__dirname, 'resume.js');
        if (!fs.existsSync(resumeJsPath)) {
            // resume.js not present — nothing to verify
            return true;
        }

        const resumeJsContent = fs.readFileSync(resumeJsPath, 'utf8');
        const collectMatch = resumeJsContent.match(/function collectFormData\(\)\s*\{[\s\S]*?return\s*\{([\s\S]*?)\};/);
        if (!collectMatch) {
            // Pattern not found — cannot verify, proceed safely
            return true;
        }

        const frontendFields = [];
        for (const line of collectMatch[1].split(',')) {
            const parts = line.split(':');
            if (parts.length >= 2) {
                const field = parts[0].trim().replace(/['"]/g, '');
                if (field) frontendFields.push(field);
            }
        }

        const schemaFields = new Set([
            'id', 'user_id', 'created_at', 'updated_at',
            'full_name', 'email', 'phone', 'location',
            'professional_summary', 'experience', 'education',
            'certifications', 'skills', 'template_name',
            'font_family', 'spacing', 'accent_color'
        ]);

        const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
        let sqlContent = '';
        const mainMigration = path.join(__dirname, 'migrations.sql');
        if (fs.existsSync(mainMigration)) {
            sqlContent += fs.readFileSync(mainMigration, 'utf8') + '\n';
        }
        if (fs.existsSync(migrationsDir)) {
            for (const file of fs.readdirSync(migrationsDir)) {
                if (file.endsWith('.sql')) {
                    sqlContent += fs.readFileSync(path.join(migrationsDir, file), 'utf8') + '\n';
                }
            }
        }

        const addColumnRegex = /ADD COLUMN(?: IF NOT EXISTS)?\s+([a-zA-Z0-9_]+)/g;
        let match;
        while ((match = addColumnRegex.exec(sqlContent)) !== null) {
            schemaFields.add(match[1]);
        }

        const missingFields = frontendFields.filter(f => f && !schemaFields.has(f));

        if (missingFields.length > 0) {
            console.error('\n[Schema] MISMATCH — frontend expects DB columns not in known schema:');
            console.error('   Missing: ' + missingFields.join(', '));
            console.error('   Action:  Create a migration to add these columns to the resumes table.\n');
            // Return false — do NOT throw, do NOT call process.exit()
            // Auth, /api/config, and all other routes must continue to work.
            return false;
        }

        console.log('[Schema] Schema synchronization verified.');
        return true;
    } catch (err) {
        // Any unexpected error in schema verification must NOT crash the server
        console.warn('[Schema] Could not complete schema verification (non-fatal):', err.message);
        return true;
    }
}

module.exports = verifySchema;