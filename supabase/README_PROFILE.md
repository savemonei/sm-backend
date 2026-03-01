# User profile table (for GET/PUT /profile)

The profile API stores user profile in Supabase for analytics and sync.

## 1. Create the table

In **Supabase Dashboard** → **SQL Editor**, run the migration:

- File: `supabase/migrations/20250126000000_create_user_profiles.sql`

Or run:

```sql
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

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_life_stage ON public.user_profiles(life_stage);
CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at ON public.user_profiles(updated_at DESC);
```

## 2. Set service role key

In **Supabase** → **Settings** → **API** copy the **service_role** key (secret).

- **Local:** Add to `.env`:  
  `SUPABASE_SERVICE_ROLE_KEY=your_service_role_key`
- **Vercel:** Add env var `SUPABASE_SERVICE_ROLE_KEY` in the project settings.

The backend uses this key to read/write `user_profiles` server-side. Never expose the service role key to the client.

## 3. Endpoints

- **GET /profile** – Returns `{ profile: UserProfile | null }`. Requires `Authorization: Bearer <access_token>`.
- **PUT /profile** – Upserts profile. Body: `user_id?`, `life_stages` (array), `primary_goals`, `use_case`, `birth_year`, `gender`, `profile_completed_at`. Requires Bearer token. The `life_stage` column stores a JSON array of life stages.

If `SUPABASE_SERVICE_ROLE_KEY` is not set, both return `503` with message that profile storage is not configured.
