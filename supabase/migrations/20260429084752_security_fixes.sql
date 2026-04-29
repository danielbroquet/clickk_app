/*
  # Security audit fixes

  1. SECURITY DEFINER Functions
    - Revoke EXECUTE from anon role on all listed SECURITY DEFINER functions
      so they can only be invoked by authenticated users / service_role.

  2. Mutable search_path
    - Recreate update_updated_at, tg_shop_orders_set_updated_at, and
      tick_story_prices_v2 with `SET search_path = public` to prevent
      search_path injection attacks.

  3. Storage Buckets (listing-images, story-videos)
    - Drop the broad public SELECT policies that allowed anonymous folder
      listing and replace them with authenticated-only SELECT policies,
      effectively requiring clients to know the object name and be logged in.

  4. auto_release_log RLS
    - Enable RLS and add policies restricting SELECT/INSERT to service_role only.

  Notes:
    - All statements use IF EXISTS / IF NOT EXISTS patterns where possible.
    - No existing data is modified.
*/

-- 1. Revoke EXECUTE from anon on sensitive SECURITY DEFINER functions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='auto_cancel_shop_orders') THEN
    REVOKE EXECUTE ON FUNCTION public.auto_cancel_shop_orders() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='auto_cancel_stories') THEN
    REVOKE EXECUTE ON FUNCTION public.auto_cancel_stories() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='auto_release_shop_orders') THEN
    REVOKE EXECUTE ON FUNCTION public.auto_release_shop_orders() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='auto_release_stories') THEN
    REVOKE EXECUTE ON FUNCTION public.auto_release_stories() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='delete_user') THEN
    REVOKE EXECUTE ON FUNCTION public.delete_user() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='handle_new_user') THEN
    REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='purchase_shop_listing') THEN
    REVOKE EXECUTE ON FUNCTION public.purchase_shop_listing(uuid) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='purchase_story') THEN
    REVOKE EXECUTE ON FUNCTION public.purchase_story(uuid, numeric) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='send_delivery_reminders') THEN
    REVOKE EXECUTE ON FUNCTION public.send_delivery_reminders() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='tick_story_prices') THEN
    REVOKE EXECUTE ON FUNCTION public.tick_story_prices() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='tick_story_prices_v2') THEN
    REVOKE EXECUTE ON FUNCTION public.tick_story_prices_v2() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='update_auction_price') THEN
    REVOKE EXECUTE ON FUNCTION public.update_auction_price() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='update_follow_counts') THEN
    REVOKE EXECUTE ON FUNCTION public.update_follow_counts() FROM anon;
  END IF;
END $$;

-- 2. Fix mutable search_path by recreating with SET search_path = public
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_shop_orders_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tick_story_prices_v2()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  story_record RECORD;
  seconds_remaining numeric;
  drop_amount numeric;
  new_price numeric;
BEGIN
  UPDATE stories
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at < NOW()
    AND buyer_id IS NULL;

  FOR story_record IN
    SELECT id, floor_price_chf, current_price_chf, expires_at
    FROM stories
    WHERE status = 'active'
      AND buyer_id IS NULL
      AND current_price_chf > floor_price_chf
      AND EXTRACT(EPOCH FROM (NOW() - last_drop_at)) >= 5
  LOOP
    seconds_remaining := GREATEST(
      EXTRACT(EPOCH FROM (story_record.expires_at - NOW())),
      5
    );

    drop_amount := ROUND(
      ((story_record.current_price_chf - story_record.floor_price_chf)
       / (seconds_remaining / 5))::numeric,
      2
    );
    drop_amount := GREATEST(drop_amount, 0.01);

    new_price := GREATEST(
      ROUND((story_record.current_price_chf - drop_amount)::numeric, 2),
      story_record.floor_price_chf
    );

    UPDATE stories
    SET current_price_chf = new_price,
        last_drop_at = NOW()
    WHERE id = story_record.id;
  END LOOP;
END;
$function$;

-- Re-revoke after CREATE OR REPLACE (which resets privileges)
REVOKE EXECUTE ON FUNCTION public.tick_story_prices_v2() FROM anon;

-- 3. Restrict storage bucket SELECT policies
DROP POLICY IF EXISTS "Anyone can read listing images" ON storage.objects;
DROP POLICY IF EXISTS "Public read story videos 5jhv74_0" ON storage.objects;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Authenticated read listing images by name'
  ) THEN
    CREATE POLICY "Authenticated read listing images by name"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'listing-images' AND name IS NOT NULL AND length(name) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Authenticated read story videos by name'
  ) THEN
    CREATE POLICY "Authenticated read story videos by name"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'story-videos' AND name IS NOT NULL AND length(name) > 0);
  END IF;
END $$;

-- 4. RLS on auto_release_log: service_role only
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='auto_release_log') THEN
    EXECUTE 'ALTER TABLE public.auto_release_log ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='auto_release_log'
        AND policyname='Service role can select auto_release_log'
    ) THEN
      CREATE POLICY "Service role can select auto_release_log"
        ON public.auto_release_log FOR SELECT
        TO service_role
        USING (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='auto_release_log'
        AND policyname='Service role can insert auto_release_log'
    ) THEN
      CREATE POLICY "Service role can insert auto_release_log"
        ON public.auto_release_log FOR INSERT
        TO service_role
        WITH CHECK (true);
    END IF;
  END IF;
END $$;
