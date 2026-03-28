-- ── Resume Template Column ───────────────────────────────────────────────────
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS template_name VARCHAR DEFAULT 'modern';

-- ── Resume Shares Table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resume_shares (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id   UUID        NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    share_token TEXT        UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    is_active   BOOLEAN     DEFAULT TRUE
);

-- ── Resume Views Table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resume_views (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id   UUID        NOT NULL REFERENCES resume_shares(id) ON DELETE CASCADE,
    viewed_at  TIMESTAMPTZ DEFAULT NOW(),
    view_count INTEGER     DEFAULT 1
);

-- ── Enable Row-Level Security ─────────────────────────────────────────────────
ALTER TABLE resume_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_views  ENABLE ROW LEVEL SECURITY;

-- ── Policies: resume_shares ───────────────────────────────────────────────────

-- Authenticated owners can manage their own resume's shares
CREATE POLICY "auth_manage_own_resume_shares"
    ON resume_shares FOR ALL
    USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM resumes
            WHERE resumes.id = resume_shares.resume_id
              AND resumes.user_id = auth.uid()
        )
    )
    WITH CHECK (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM resumes
            WHERE resumes.id = resume_shares.resume_id
              AND resumes.user_id = auth.uid()
        )
    );

-- Public (unauthenticated) can SELECT active shares (needed for share page)
CREATE POLICY "public_read_active_shares"
    ON resume_shares FOR SELECT
    USING (is_active = TRUE);

-- ── Policies: resume_views ────────────────────────────────────────────────────

-- Public can INSERT a view for any active share
CREATE POLICY "public_insert_views"
    ON resume_views FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM resume_shares
            WHERE resume_shares.id = resume_views.share_id
              AND resume_shares.is_active = TRUE
        )
    );

-- Public can SELECT views
CREATE POLICY "public_read_views"
    ON resume_views FOR SELECT
    USING (TRUE);

-- ── Allow public to view shared resumes ──────────────────────────────────────
-- Adds a SELECT policy on the existing resumes table so the share page
-- can fetch resume content when a valid active share exists.
CREATE POLICY "public_view_shared_resumes"
    ON resumes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM resume_shares
            WHERE resume_shares.resume_id = resumes.id
              AND resume_shares.is_active = TRUE
        )
    );
