/*
  # Archive expired drops with 7-day auto-cleanup

  ## Problem
  Expired drops appear on the seller's public profile grid forever,
  with no value for visitors and clutter for the seller.

  ## Solution
  Expired drops become an "Archive" visible only to their seller.
  After 7 days in that archive, they are permanently deleted along
  with their associated storage video. During those 7 days, the
  seller can relaunch the drop in one click (prefilled create form).

  ## Changes
  1. Add `archived_at` timestamptz column on `stories` (nullable).
  2. Add trigger: when a story transitions to `status='expired'`
     (by cron or manual), `archived_at` is set to now() if null.
  3. Add function `cleanup_archived_stories()` that hard-deletes
     stories with `status='expired'` AND `archived_at < now() - 7 days`.
     (Related rows — watchlist, comments, story_views — cascade through
     their existing foreign keys.)
  4. Schedule the cleanup daily at 03:15 via pg_cron.

  ## Security
  No new RLS policies needed; existing policies already gate
  `stories` access. Function runs as SECURITY DEFINER with hardened
  search_path.
*/

-- 1. Column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stories' AND column_name='archived_at'
  ) THEN
    ALTER TABLE public.stories ADD COLUMN archived_at timestamptz;
  END IF;
END $$;

-- Backfill existing expired rows
UPDATE public.stories
   SET archived_at = COALESCE(updated_at, now())
 WHERE status = 'expired' AND archived_at IS NULL;

-- 2. Trigger
CREATE OR REPLACE FUNCTION public.tg_stories_set_archived_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'expired' AND (OLD.status IS DISTINCT FROM 'expired' OR OLD.archived_at IS NULL) AND NEW.archived_at IS NULL THEN
    NEW.archived_at := now();
  END IF;

  IF NEW.status <> 'expired' AND OLD.status = 'expired' THEN
    NEW.archived_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stories_set_archived_at ON public.stories;
CREATE TRIGGER stories_set_archived_at
  BEFORE UPDATE ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_stories_set_archived_at();

-- 3. Cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_archived_stories()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.watchlist
   WHERE story_id IN (
     SELECT id FROM public.stories
      WHERE status = 'expired'
        AND archived_at IS NOT NULL
        AND archived_at < now() - interval '7 days'
   );

  DELETE FROM public.comments
   WHERE story_id IN (
     SELECT id FROM public.stories
      WHERE status = 'expired'
        AND archived_at IS NOT NULL
        AND archived_at < now() - interval '7 days'
   );

  DELETE FROM public.story_views
   WHERE story_id IN (
     SELECT id FROM public.stories
      WHERE status = 'expired'
        AND archived_at IS NOT NULL
        AND archived_at < now() - interval '7 days'
   );

  DELETE FROM public.stories
   WHERE status = 'expired'
     AND archived_at IS NOT NULL
     AND archived_at < now() - interval '7 days';
END;
$$;

-- 4. Schedule
DO $$
DECLARE
  j_id bigint;
BEGIN
  SELECT jobid INTO j_id FROM cron.job WHERE jobname = 'cleanup_archived_stories';
  IF j_id IS NOT NULL THEN PERFORM cron.unschedule(j_id); END IF;

  PERFORM cron.schedule(
    'cleanup_archived_stories',
    '15 3 * * *',
    $cron$ SELECT public.cleanup_archived_stories(); $cron$
  );
END $$;
