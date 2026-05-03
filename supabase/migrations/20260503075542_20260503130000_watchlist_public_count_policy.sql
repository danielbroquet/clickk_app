/*
  # Add public count SELECT policy to watchlist

  The existing SELECT policy restricts reads to own rows (auth.uid() = user_id).
  This blocks aggregate count queries used to show how many users watchlisted
  a given story. We add a separate permissive policy that allows authenticated
  users to read any row for count purposes.

  1. Changes
    - Add policy: "Authenticated users can read watchlist for counts"
      FOR SELECT TO authenticated USING (true)
      This allows count queries across all rows (e.g. per story_id).

  2. Security
    - Existing per-user SELECT policy stays in place.
    - The new policy only adds a read path; inserts/deletes remain owner-only.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'watchlist'
      AND policyname = 'Authenticated users can read watchlist for counts'
  ) THEN
    CREATE POLICY "Authenticated users can read watchlist for counts"
      ON public.watchlist FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;
