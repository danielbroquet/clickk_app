/*
  # Enforce Stripe Connect onboarding before publishing drops

  ## Why
  Sellers who have not completed their Stripe Connect onboarding cannot receive
  payouts. Allowing them to publish drops would let buyers pay but funds would
  be stuck. We block INSERT on stories unless the seller has a complete onboarding.

  ## Change
  - Replace the existing permissive seller INSERT policies with a single strict one
    that checks seller_profiles.stripe_onboarding_complete = true and stripe_account_id IS NOT NULL.

  ## Security
  - Keeps all existing RLS logic (SELECT/UPDATE/DELETE untouched).
  - Only tightens INSERT.
*/

DROP POLICY IF EXISTS "sellers can insert own stories" ON stories;
DROP POLICY IF EXISTS "stories_seller_insert" ON stories;

CREATE POLICY "sellers with stripe onboarding can insert stories"
  ON stories FOR INSERT
  TO authenticated
  WITH CHECK (
    seller_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'seller'
    )
    AND EXISTS (
      SELECT 1 FROM seller_profiles
      WHERE seller_profiles.user_id = auth.uid()
        AND seller_profiles.stripe_onboarding_complete = true
        AND seller_profiles.stripe_account_id IS NOT NULL
    )
  );
