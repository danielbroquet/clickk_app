/*
  # Drop shop_listings to focus 100% on reverse Dutch auctions

  CLICKK is pivoting to focus exclusively on reverse Dutch auctions ("drops",
  formerly "stories"). The classic marketplace (shop_listings) and its orders
  (shop_orders) are being removed. The `stories` table remains the single
  source of truth for everything sold on the platform.

  ## Changes

  1. Dropped Tables (CASCADE)
    - `shop_listings` — all classic marketplace items
    - `shop_orders` — cascades automatically because it references shop_listings
    - All RLS policies, triggers and functions attached to these tables are
      removed as part of the CASCADE.

  2. Stories Table — New Column
    - `viewer_count integer DEFAULT 0` — tracks concurrent live viewers of
      a drop (will power the "X watching" indicator).

  3. New Table: `watchlist`
    - `id uuid PK` (gen_random_uuid)
    - `user_id uuid FK profiles.id ON DELETE CASCADE`
    - `story_id uuid FK stories.id ON DELETE CASCADE`
    - `created_at timestamptz DEFAULT now()`
    - `UNIQUE (user_id, story_id)`
    - Index on `(user_id, created_at DESC)` for fast per-user lists.
    - RLS enabled. Only authenticated users may INSERT/SELECT/DELETE their
      own rows (where user_id = auth.uid()).

  ## Notes

  1. Manual cleanup
    - The Supabase Storage bucket `listing-images` should be deleted manually
      from the Supabase dashboard after this migration runs. Object-level
      storage policies referencing shop_listings are covered by the defensive
      DROP POLICY IF EXISTS statements below.

  2. Idempotency
    - All statements use defensive `IF EXISTS` / `IF NOT EXISTS` patterns so
      this migration can be safely re-run.
*/

-- ─── 1. Drop storage bucket policies for listing-images (defensive) ──────────

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (policyname ILIKE '%listing-image%' OR policyname ILIKE '%listing_image%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- ─── 2. Drop shop_listings (CASCADE removes shop_orders + deps) ──────────────

DROP TABLE IF EXISTS public.shop_orders CASCADE;
DROP TABLE IF EXISTS public.shop_listings CASCADE;

-- ─── 3. Drop any leftover shop_listings-related functions ────────────────────

DROP FUNCTION IF EXISTS public.update_shop_listing_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.decrement_listing_stock() CASCADE;

-- ─── 4. Stories: add viewer_count column ─────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stories'
      AND column_name = 'viewer_count'
  ) THEN
    ALTER TABLE public.stories ADD COLUMN viewer_count integer DEFAULT 0;
  END IF;
END $$;

-- ─── 5. Create watchlist table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, story_id)
);

CREATE INDEX IF NOT EXISTS watchlist_user_created_idx
  ON public.watchlist (user_id, created_at DESC);

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'watchlist'
      AND policyname = 'Users can view own watchlist'
  ) THEN
    CREATE POLICY "Users can view own watchlist"
      ON public.watchlist FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'watchlist'
      AND policyname = 'Users can add to own watchlist'
  ) THEN
    CREATE POLICY "Users can add to own watchlist"
      ON public.watchlist FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'watchlist'
      AND policyname = 'Users can remove from own watchlist'
  ) THEN
    CREATE POLICY "Users can remove from own watchlist"
      ON public.watchlist FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
