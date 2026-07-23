const fs = require('fs');
const path = require('path');

function verifySchema() {
    console.log('[Schema] Verifying resume schema synchronization...');
    const resumeJsPath = path.join(__dirname, 'resume.js');
    if (!fs.existsSync(resumeJsPath)) { return; }
    const resumeJsContent = fs.readFileSync(resumeJsPath, 'utf8');
    const collectMatch = resumeJsContent.match(/function collectFormData\(\)\s*\{[\s\S]*?return\s*\{([\s\S]*?)\};/);
    if (!collectMatch) return;
    const frontendFields = [];
    for (const line of collectMatch[1].split(',')) {
        const parts = line.split(':');
        if (parts.length >= 2) { frontendFields.push(parts[0].trim()); }
    }
    const schemaFields = new Set(['id', 'user_id', 'created_at', 'updated_at', 'full_name', 'email', 'phone', 'location', 'professional_summary', 'experience', 'education', 'certifications', 'skills', 'template_name', 'font_family', 'spacing', 'accent_color']);
    const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
    let sqlContent = '';
    const mainMigration = path.join(__dirname, 'migrations.sql');
    if (fs.existsSync(mainMigration)) sqlContent += fs.readFileSync(mainMigration, 'utf8') + '\n';
    if (fs.existsSync(migrationsDir)) {
        for (const file of fs.readdirSync(migrationsDir)) {
            if (file.endsWith('.sql')) sqlContent += fs.readFileSync(path.join(migrationsDir, file), 'utf8') + '\n';
        }
    }
    const addColumnRegex = /ADD COLUMN(?: IF NOT EXISTS)?\s+([a-zA-Z0-9_]+)/g;
    let match;
    while ((match = addColumnRegex.exec(sqlContent)) !== null) schemaFields.add(match[1]);
    const missingFields = [];
    for (const field of frontendFields) {
        if (!schemaFields.has(field)) missingFields.push(field);
    }
    if (missingFields.length > 0) {
        console.error('\n❌ [CRITICAL] SCHEMA MISMATCH ERROR ❌');
        console.error('The frontend expects fields that are not in the database schema: ' + missingFields.join(', '));
        console.error('Please create a database migration to add these columns to the resumes table.\n');
        process.exit(1);
    }
    console.log('✅ [Schema] Synchronization verified.');
}

module.exports = verifySchema;