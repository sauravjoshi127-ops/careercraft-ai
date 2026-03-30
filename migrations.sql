-- ── Resume Template Column ───────────────────────────────────────────────────
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS template_name VARCHAR DEFAULT 'modern'
    CHECK (template_name IN ('modern', 'classic', 'creative'));

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
-- ── Cover Letters Table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cover_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_title TEXT,
  company_name TEXT,
  job_description TEXT,
  highlights TEXT,
  tone TEXT,
  length TEXT,
  opening TEXT,
  closing TEXT,
  generated_letter TEXT,
  variants JSONB,
  keywords_used TEXT[],
  ats_score INT,
  relevance_score INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cover_letter_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cover_letter_id UUID NOT NULL REFERENCES cover_letters(id) ON DELETE CASCADE,
  suggestions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cover_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE cover_letter_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_manage_cover_letters"
ON cover_letters FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auth_manage_cover_letter_feedback"
ON cover_letter_feedback FOR ALL
USING (EXISTS (
  SELECT 1 FROM cover_letters
  WHERE cover_letters.id = cover_letter_feedback.cover_letter_id
  AND cover_letters.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM cover_letters
  WHERE cover_letters.id = cover_letter_feedback.cover_letter_id
  AND cover_letters.user_id = auth.uid()
));
