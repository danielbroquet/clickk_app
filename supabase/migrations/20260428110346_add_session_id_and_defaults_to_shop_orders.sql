/*
  # Make shop_orders insertable from payment flows

  Background:
  Edge functions (create-listing-payment-intent, stripe-webhook) attempt
  to upsert into shop_orders using a `session_id` column for idempotency.
  That column did not exist, so every listing-purchase order insert was
  failing — buyers were charged and stock was decremented, but no order
  row was ever created. Two NOT NULL columns (`commission_chf`,
  `seller_amount_chf`) also had no defaults, which would have blocked
  inserts even after `session_id` was added.

  1. Modified Tables
    - `shop_orders`
      - Add `session_id` (text, nullable) — stores the Stripe checkout
        session id or payment intent id; used as the upsert idempotency
        key so retries from Stripe webhooks don't create duplicates.
      - Add a partial UNIQUE index on `session_id` (where not null) to
        back the `onConflict: "session_id"` upsert.
      - Set defaults of 0 for `commission_chf` and `seller_amount_chf`
        so inserts that don't supply these (current call sites) succeed.
        Existing rows are unaffected; the defaults only apply on insert
        when the field is omitted.

  2. Security
    - No change to RLS. Existing buyer/seller select policies remain.

  3. Notes
    - Platform commission logic is not encoded here. Defaults of 0 are
      safe placeholders; downstream payout code can interpret zero as
      "no commission applied yet" and compute on read if desired.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shop_orders'
      AND column_name = 'session_id'
  ) THEN
    ALTER TABLE public.shop_orders ADD COLUMN session_id text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS shop_orders_session_id_unique
  ON public.shop_orders (session_id)
  WHERE session_id IS NOT NULL;

ALTER TABLE public.shop_orders
  ALTER COLUMN commission_chf SET DEFAULT 0;

ALTER TABLE public.shop_orders
  ALTER COLUMN seller_amount_chf SET DEFAULT 0;
