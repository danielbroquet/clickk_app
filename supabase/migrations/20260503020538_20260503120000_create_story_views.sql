/*
  # Create story_views table

  Tracks which users viewed which drop (story) and when, to power the
  "recent viewers" social-proof pill in the feed (replacing the LIVE badge).

  1. New Tables
    - `story_views`
      - `id` (uuid, primary key)
      - `story_id` (uuid, FK -> stories.id, cascade delete)
      - `user_id` (uuid, FK -> profiles.id, set null on delete)
      - `viewed_at` (timestamptz, default now())

  2. Indexes
    - `story_views_story_viewed_idx` on (story_id, viewed_at DESC)
    - `story_views_recent_idx` partial index for last-10-minute window

  3. Security
    - RLS enabled
    - Authenticated users may INSERT their own view rows (user_id = auth.uid())
    - Authenticated users may SELECT all view rows (needed for count queries)

  4. Notes
    - The feed UI hides the badge when recent viewers < 2, so the table
      can be inserted into freely without leaking that a user is alone.
*/

CREATE TABLE IF NOT EXISTS public.story_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS story_views_story_viewed_idx
  ON public.story_views (story_id, viewed_at DESC);

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'story_views'
      AND policyname = 'Anyone can insert a view'
  ) THEN
    CREATE POLICY "Anyone can insert a view"
      ON public.story_views FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'story_views'
      AND policyname = 'Anyone can read view counts'
  ) THEN
    CREATE POLICY "Anyone can read view counts"
      ON public.story_views FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;
