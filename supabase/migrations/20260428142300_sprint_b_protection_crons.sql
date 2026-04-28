/*
  # Sprint B - Auto-protection crons

  Adds two automated protection jobs (auto-release for sellers,
  auto-cancel for buyers) plus a J+5 buyer-nudge notification.
  All three jobs run hourly via pg_cron and are idempotent.

  1. Schema changes
    - `shop_orders`: new `updated_at` column (timestamptz, default now())
      with a trigger that maintains it on UPDATE.
    - New table `auto_release_log` to record every automated action
      taken by the cron jobs.
      - `id` uuid pk
      - `type` text — 'auto_release_story' | 'auto_release_order'
                    | 'auto_cancel_story'  | 'auto_cancel_order'
                    | 'delivery_reminder_story'
      - `reference_id` uuid — story id or shop_order id
      - `executed_at` timestamptz default now()
      - `details` jsonb default '{}'
      - Unique index on (type, reference_id) for idempotency.

  2. Functions (security definer)
    - `auto_release_stories()` — for stories that are `status='shipped'`
       and `shipped_at < now() - 7 days`, call the `confirm-delivery`
       edge function via pg_net using the service role key and mark
       `release_reason='auto_released'`. Idempotent via release_reason.
    - `auto_release_shop_orders()` — for shop_orders with
      `delivery_status='shipped'` and `updated_at < now() - 7 days`,
      set `delivery_status='delivered'`, `delivered_at=now()`.
    - `auto_cancel_shop_orders()` — for shop_orders where
      `delivery_status='pending'` (or NULL) and
      `created_at < now() - 5 days`, set `status='cancelled'`.
      Stripe refund handled manually; logged as needs_admin=true.
    - `auto_cancel_stories()` — for stories where `status='sold'`
      AND `shipped_at IS NULL` AND `updated_at < now() - 5 days`,
      set `status='cancelled'`.
    - `send_delivery_reminders()` — for stories shipped 5+ days ago
      with no delivery confirmation and no prior reminder, insert a
      notification for the buyer.

  3. Scheduling (pg_cron)
    - Three hourly jobs wired up at `0 * * * *` (top of every hour).

  4. Security
    - RLS enabled on `auto_release_log`. No policies are added, so
      only the service role can read/write it.
    - Functions are SECURITY DEFINER, owned by postgres, with a
      hardened search_path.

  5. Important notes
    - Secrets (`supabase_url`, `service_role_key`) are read from
      `vault.decrypted_secrets`. If they aren't configured, the
      story-auto-release call is skipped (logged as `skipped`),
      so the migration is safe to apply even before vault setup.
    - Idempotency is enforced via the `release_reason` flag,
      delivery_status transitions, and a unique log key on
      (type, reference_id).
*/

-- ─── Schema additions ───────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shop_orders'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.shop_orders
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_shop_orders_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shop_orders_set_updated_at ON public.shop_orders;
CREATE TRIGGER shop_orders_set_updated_at
  BEFORE UPDATE ON public.shop_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_shop_orders_set_updated_at();

CREATE TABLE IF NOT EXISTS public.auto_release_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL,
  reference_id  uuid NOT NULL,
  executed_at   timestamptz NOT NULL DEFAULT now(),
  details       jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS auto_release_log_type_ref_uniq
  ON public.auto_release_log (type, reference_id);

ALTER TABLE public.auto_release_log ENABLE ROW LEVEL SECURITY;

-- ─── Job: auto-release stories (call confirm-delivery EF) ───────────

CREATE OR REPLACE FUNCTION public.auto_release_stories()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  rec record;
  v_url   text;
  v_key   text;
  v_req   bigint;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets
   WHERE name = 'supabase_url'
   LIMIT 1;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;

  FOR rec IN
    SELECT id, buyer_id
      FROM public.stories
     WHERE status = 'shipped'
       AND shipped_at IS NOT NULL
       AND shipped_at < now() - interval '7 days'
       AND (release_reason IS NULL OR release_reason = '')
     LIMIT 50
  LOOP
    BEGIN
      IF v_url IS NULL OR v_key IS NULL THEN
        INSERT INTO public.auto_release_log (type, reference_id, details)
        VALUES (
          'auto_release_story',
          rec.id,
          jsonb_build_object('status', 'skipped', 'reason', 'vault_not_configured')
        )
        ON CONFLICT (type, reference_id) DO NOTHING;
        CONTINUE;
      END IF;

      SELECT net.http_post(
        url     := rtrim(v_url, '/') || '/functions/v1/confirm-delivery',
        body    := jsonb_build_object('story_id', rec.id, 'system', true),
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || v_key,
                     'apikey',        v_key
                   )
      ) INTO v_req;

      UPDATE public.stories
         SET release_reason = 'auto_released'
       WHERE id = rec.id
         AND (release_reason IS NULL OR release_reason = '');

      INSERT INTO public.auto_release_log (type, reference_id, details)
      VALUES (
        'auto_release_story',
        rec.id,
        jsonb_build_object('status', 'dispatched', 'request_id', v_req)
      )
      ON CONFLICT (type, reference_id) DO NOTHING;

    EXCEPTION WHEN others THEN
      INSERT INTO public.auto_release_log (type, reference_id, details)
      VALUES (
        'auto_release_story',
        rec.id,
        jsonb_build_object('status', 'error', 'message', SQLERRM)
      )
      ON CONFLICT (type, reference_id) DO NOTHING;
    END;
  END LOOP;
END;
$$;

-- ─── Job: auto-release shop_orders (direct SQL) ─────────────────────

CREATE OR REPLACE FUNCTION public.auto_release_shop_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT id
      FROM public.shop_orders
     WHERE delivery_status = 'shipped'
       AND updated_at < now() - interval '7 days'
     LIMIT 100
  LOOP
    BEGIN
      UPDATE public.shop_orders
         SET delivery_status = 'delivered',
             delivered_at    = now()
       WHERE id = rec.id
         AND delivery_status = 'shipped';

      INSERT INTO public.auto_release_log (type, reference_id, details)
      VALUES (
        'auto_release_order',
        rec.id,
        jsonb_build_object('status', 'released')
      )
      ON CONFLICT (type, reference_id) DO NOTHING;

    EXCEPTION WHEN others THEN
      INSERT INTO public.auto_release_log (type, reference_id, details)
      VALUES (
        'auto_release_order',
        rec.id,
        jsonb_build_object('status', 'error', 'message', SQLERRM)
      )
      ON CONFLICT (type, reference_id) DO NOTHING;
    END;
  END LOOP;
END;
$$;

-- ─── Job: auto-cancel shop_orders (seller never shipped) ────────────

CREATE OR REPLACE FUNCTION public.auto_cancel_shop_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT id, buyer_id, seller_id, total_chf
      FROM public.shop_orders
     WHERE (delivery_status = 'pending' OR delivery_status IS NULL)
       AND status = 'paid'
       AND created_at < now() - interval '5 days'
     LIMIT 100
  LOOP
    BEGIN
      UPDATE public.shop_orders
         SET status = 'cancelled'
       WHERE id = rec.id
         AND status = 'paid';

      INSERT INTO public.auto_release_log (type, reference_id, details)
      VALUES (
        'auto_cancel_order',
        rec.id,
        jsonb_build_object(
          'status',       'cancelled',
          'needs_admin',  true,
          'reason',       'seller_did_not_ship',
          'buyer_id',     rec.buyer_id,
          'seller_id',    rec.seller_id,
          'total_chf',    rec.total_chf
        )
      )
      ON CONFLICT (type, reference_id) DO NOTHING;

    EXCEPTION WHEN others THEN
      INSERT INTO public.auto_release_log (type, reference_id, details)
      VALUES (
        'auto_cancel_order',
        rec.id,
        jsonb_build_object('status', 'error', 'message', SQLERRM)
      )
      ON CONFLICT (type, reference_id) DO NOTHING;
    END;
  END LOOP;
END;
$$;

-- ─── Job: auto-cancel stories (seller never shipped) ────────────────

CREATE OR REPLACE FUNCTION public.auto_cancel_stories()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT id, buyer_id, seller_id, final_price_chf
      FROM public.stories
     WHERE status = 'sold'
       AND shipped_at IS NULL
       AND updated_at < now() - interval '5 days'
     LIMIT 100
  LOOP
    BEGIN
      UPDATE public.stories
         SET status = 'cancelled'
       WHERE id = rec.id
         AND status = 'sold'
         AND shipped_at IS NULL;

      INSERT INTO public.auto_release_log (type, reference_id, details)
      VALUES (
        'auto_cancel_story',
        rec.id,
        jsonb_build_object(
          'status',      'cancelled',
          'needs_admin', true,
          'reason',      'seller_did_not_ship',
          'buyer_id',    rec.buyer_id,
          'seller_id',   rec.seller_id,
          'amount_chf',  rec.final_price_chf
        )
      )
      ON CONFLICT (type, reference_id) DO NOTHING;

    EXCEPTION WHEN others THEN
      INSERT INTO public.auto_release_log (type, reference_id, details)
      VALUES (
        'auto_cancel_story',
        rec.id,
        jsonb_build_object('status', 'error', 'message', SQLERRM)
      )
      ON CONFLICT (type, reference_id) DO NOTHING;
    END;
  END LOOP;
END;
$$;

-- ─── Job: J+5 delivery reminder for buyers ──────────────────────────

CREATE OR REPLACE FUNCTION public.send_delivery_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT s.id, s.buyer_id
      FROM public.stories s
     WHERE s.status = 'shipped'
       AND s.shipped_at IS NOT NULL
       AND s.shipped_at <  now() - interval '5 days'
       AND s.shipped_at >= now() - interval '7 days'
       AND s.buyer_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.auto_release_log l
          WHERE l.type = 'delivery_reminder_story'
            AND l.reference_id = s.id
       )
     LIMIT 100
  LOOP
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, payload)
      VALUES (
        rec.buyer_id,
        'delivery_reminder',
        'Avez-vous reçu votre colis ?',
        'Sans confirmation dans 48h, le paiement sera libéré automatiquement au vendeur.',
        jsonb_build_object('story_id', rec.id)
      );

      INSERT INTO public.auto_release_log (type, reference_id, details)
      VALUES (
        'delivery_reminder_story',
        rec.id,
        jsonb_build_object('status', 'sent')
      )
      ON CONFLICT (type, reference_id) DO NOTHING;

    EXCEPTION WHEN others THEN
      INSERT INTO public.auto_release_log (type, reference_id, details)
      VALUES (
        'delivery_reminder_story',
        rec.id,
        jsonb_build_object('status', 'error', 'message', SQLERRM)
      )
      ON CONFLICT (type, reference_id) DO NOTHING;
    END;
  END LOOP;
END;
$$;

-- ─── pg_cron schedules (hourly, idempotent) ─────────────────────────

DO $$
DECLARE
  j_id bigint;
BEGIN
  -- auto-release (sellers): stories + shop_orders
  SELECT jobid INTO j_id FROM cron.job WHERE jobname = 'sprint_b_auto_release';
  IF j_id IS NOT NULL THEN PERFORM cron.unschedule(j_id); END IF;

  PERFORM cron.schedule(
    'sprint_b_auto_release',
    '0 * * * *',
    $cron$
      SELECT public.auto_release_stories();
      SELECT public.auto_release_shop_orders();
    $cron$
  );

  -- auto-cancel (buyers): stories + shop_orders
  SELECT jobid INTO j_id FROM cron.job WHERE jobname = 'sprint_b_auto_cancel';
  IF j_id IS NOT NULL THEN PERFORM cron.unschedule(j_id); END IF;

  PERFORM cron.schedule(
    'sprint_b_auto_cancel',
    '0 * * * *',
    $cron$
      SELECT public.auto_cancel_stories();
      SELECT public.auto_cancel_shop_orders();
    $cron$
  );

  -- J+5 buyer reminders for stories
  SELECT jobid INTO j_id FROM cron.job WHERE jobname = 'sprint_b_delivery_reminders';
  IF j_id IS NOT NULL THEN PERFORM cron.unschedule(j_id); END IF;

  PERFORM cron.schedule(
    'sprint_b_delivery_reminders',
    '0 * * * *',
    $cron$ SELECT public.send_delivery_reminders(); $cron$
  );
END $$;
