-- Add professional_headline and projects to resumes table
ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS professional_headline TEXT;
ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS projects JSONB DEFAULT '[]'::jsonb;