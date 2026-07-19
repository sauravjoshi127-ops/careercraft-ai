-- Add projects column to resumes table
ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS projects JSONB DEFAULT '[]'::jsonb;

-- Notify PostgREST to reload the schema cache
NOTIFY pgrst, 'reload schema';
