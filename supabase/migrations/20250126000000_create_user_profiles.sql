-- User profiles table (for analytics and app personalization)
-- Run this in Supabase SQL Editor or via Supabase CLI.

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  life_stage TEXT,
  primary_goals JSONB NOT NULL DEFAULT '[]',
  use_case TEXT,
  birth_year INTEGER,
  gender TEXT,
  profile_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optional: RLS if you ever query from the client with anon key.
-- For server-only access with service role key, RLS can stay disabled.
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for analytics (e.g. group by life_stage)
CREATE INDEX IF NOT EXISTS idx_user_profiles_life_stage ON public.user_profiles(life_stage);
CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at ON public.user_profiles(updated_at DESC);
