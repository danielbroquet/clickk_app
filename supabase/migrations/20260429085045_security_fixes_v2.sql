/*
  # Security audit fixes (v2)

  1. Revoke EXECUTE from PUBLIC, anon and authenticated on all flagged
     SECURITY DEFINER functions so they cannot be invoked through
     PostgREST /rpc/.

  2. Re-pin search_path = public on update_updated_at,
     tg_shop_orders_set_updated_at and tick_story_prices_v2.

  3. Move extension pg_net from the public schema to the extensions schema
     (recreated, since pg_net does not support ALTER EXTENSION ... SET SCHEMA).

  4. Ensure the broad public SELECT policies on storage.objects for buckets
     listing-images and story-videos are dropped.

  5. Add RLS policies on public.auto_release_log restricting SELECT/INSERT
     to service_role only.

  Notes:
    - "Leaked Password Protection" is a Supabase Auth dashboard setting and
      must be enabled in the Supabase Studio Auth settings (not via SQL).
*/

-- 1. Revoke EXECUTE from PUBLIC, anon, authenticated on SECURITY DEFINER functions
DO $$
DECLARE
  r record;
  fn_sig text;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'auto_cancel_shop_orders',
        'auto_cancel_stories',
        'auto_release_shop_orders',
        'auto_release_stories',
        'delete_user',
        'handle_new_user',
        'purchase_shop_listing',
        'purchase_story',
        'send_delivery_reminders',
        'tick_story_prices',
        'tick_story_prices_v2',
        'update_auction_price',
        'update_follow_counts'
      )
  LOOP
    fn_sig := format('public.%I(%s)', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn_sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn_sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn_sig);
  END LOOP;
END $$;

-- 2. Re-pin search_path on flagged functions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='update_updated_at') THEN
    EXECUTE 'ALTER FUNCTION public.update_updated_at() SET search_path = public';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='tg_shop_orders_set_updated_at') THEN
    EXECUTE 'ALTER FUNCTION public.tg_shop_orders_set_updated_at() SET search_path = public';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='tick_story_prices_v2') THEN
    EXECUTE 'ALTER FUNCTION public.tick_story_prices_v2() SET search_path = public';
  END IF;
END $$;

-- 3. Move pg_net out of public (drop + recreate in extensions schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_net' AND n.nspname = 'public'
  ) THEN
    CREATE SCHEMA IF NOT EXISTS extensions;
    EXECUTE 'DROP EXTENSION IF EXISTS pg_net';
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions';
  END IF;
END $$;

-- 4. Ensure broad storage SELECT policies are gone
DROP POLICY IF EXISTS "Anyone can read listing images" ON storage.objects;
DROP POLICY IF EXISTS "Public read story videos 5jhv74_0" ON storage.objects;

-- 5. RLS policies on auto_release_log (service_role only)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='auto_release_log') THEN
    EXECUTE 'ALTER TABLE public.auto_release_log ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='auto_release_log'
        AND policyname='Service role can select auto_release_log'
    ) THEN
      EXECUTE 'CREATE POLICY "Service role can select auto_release_log" ON public.auto_release_log FOR SELECT TO service_role USING (true)';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='auto_release_log'
        AND policyname='Service role can insert auto_release_log'
    ) THEN
      EXECUTE 'CREATE POLICY "Service role can insert auto_release_log" ON public.auto_release_log FOR INSERT TO service_role WITH CHECK (true)';
    END IF;
  END IF;
END $$;
