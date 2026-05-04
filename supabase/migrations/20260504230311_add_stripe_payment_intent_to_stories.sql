/*
  # Track Stripe PaymentIntent on each sold story

  ## Why
  To automatically refund a buyer when a seller never ships, we need the Stripe
  PaymentIntent id attached to the story at purchase time.

  ## Change
  - Add stories.stripe_payment_intent_id (nullable text).

  ## Security
  No policy change required — existing SELECT/UPDATE policies already gate access.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stories' AND column_name = 'stripe_payment_intent_id'
  ) THEN
    ALTER TABLE stories ADD COLUMN stripe_payment_intent_id text;
  END IF;
END $$;
