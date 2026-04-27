/*
  # Create payouts_log audit table

  1. New Tables
    - `payouts_log`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles) — seller who requested the payout
      - `stripe_payout_id` (text, unique) — Stripe payout id (po_...)
      - `amount_chf` (numeric) — amount of the payout in CHF
      - `currency` (text) — 'chf'
      - `status` (text) — Stripe-reported status (pending, in_transit, paid, failed, canceled)
      - `arrival_date` (bigint, nullable) — unix epoch from Stripe
      - `created_at` (timestamptz, default now())

  2. Security
    - RLS enabled
    - Sellers can read only their own payout entries
    - Inserts/updates are service-role only (no policy needed for service role)

  3. Notes
    - Only an audit trail. Source of truth is Stripe.
    - Service role inserts from create-payout edge function.
*/

CREATE TABLE IF NOT EXISTS payouts_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_payout_id text UNIQUE NOT NULL,
  amount_chf numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'chf',
  status text NOT NULL DEFAULT 'pending',
  arrival_date bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payouts_log_user_id_idx ON payouts_log (user_id, created_at DESC);

ALTER TABLE payouts_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payouts_log'
      AND policyname = 'Users can view own payouts'
  ) THEN
    CREATE POLICY "Users can view own payouts"
      ON payouts_log
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
