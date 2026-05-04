/*
  # Automate refund when seller never ships

  ## Why
  The existing auto_cancel_stories() function only marks stories as 'cancelled'
  and flags needs_admin=true. We replace it with logic that calls the
  refund-no-ship edge function asynchronously via pg_net so the buyer is
  actually refunded via Stripe.

  ## Changes
  - Replace public.auto_cancel_stories() to call edge function refund-no-ship
    for each sold+unshipped story older than 5 days. pg_net.http_post is
    non-blocking; the edge function handles Stripe + DB updates idempotently.
  - Add a unique index on auto_release_log(type, reference_id) if not present,
    so the ON CONFLICT clauses in existing code remain safe.

  ## Notes
  - Edge function URL uses SUPABASE_URL from app settings. We read it from
    the vault-like GUC 'app.settings.supabase_url'. Fallback handled at runtime.
  - Service role key is read from GUC 'app.settings.service_role_key'.
  - If those GUCs aren't set, the function falls back to the legacy behavior
    (mark cancelled, needs_admin=true) so operations keep running.
*/

CREATE UNIQUE INDEX IF NOT EXISTS auto_release_log_type_ref_uk
  ON public.auto_release_log(type, reference_id);

CREATE OR REPLACE FUNCTION public.auto_cancel_stories()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  rec record;
  sb_url text;
  sb_key text;
BEGIN
  sb_url := current_setting('app.settings.supabase_url', true);
  sb_key := current_setting('app.settings.service_role_key', true);

  FOR rec IN
    SELECT id, buyer_id, seller_id, final_price_chf, stripe_payment_intent_id
      FROM public.stories
     WHERE status = 'sold'
       AND shipped_at IS NULL
       AND updated_at < now() - interval '5 days'
     LIMIT 100
  LOOP
    BEGIN
      IF sb_url IS NOT NULL AND sb_key IS NOT NULL AND rec.stripe_payment_intent_id IS NOT NULL THEN
        PERFORM extensions.http_post(
          url     := sb_url || '/functions/v1/refund-no-ship',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || sb_key
          ),
          body    := jsonb_build_object('story_id', rec.id)::text
        );

        INSERT INTO public.auto_release_log (type, reference_id, details)
        VALUES (
          'auto_cancel_story',
          rec.id,
          jsonb_build_object(
            'status',      'refund_dispatched',
            'buyer_id',    rec.buyer_id,
            'seller_id',   rec.seller_id,
            'amount_chf',  rec.final_price_chf
          )
        )
        ON CONFLICT (type, reference_id) DO NOTHING;
      ELSE
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
            'reason',      CASE
              WHEN rec.stripe_payment_intent_id IS NULL THEN 'seller_did_not_ship_no_pi'
              ELSE 'seller_did_not_ship_no_edge_config'
            END,
            'buyer_id',    rec.buyer_id,
            'seller_id',   rec.seller_id,
            'amount_chf',  rec.final_price_chf
          )
        )
        ON CONFLICT (type, reference_id) DO NOTHING;
      END IF;

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
