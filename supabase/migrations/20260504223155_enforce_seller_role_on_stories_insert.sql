/*
  # Enforce seller role on stories INSERT

  ## Problem
  The stories table had no INSERT RLS policy, meaning any authenticated user
  could insert rows directly via the API, bypassing the client-side "become seller" gate.

  ## Changes
  - Add INSERT policy: only profiles with role = 'seller' can insert stories,
    and seller_id must match the authenticated user's id.

  ## Security
  - Prevents non-seller accounts from publishing drops even if they bypass the UI
  - seller_id = auth.uid() ensures a seller cannot insert on behalf of another user
*/

CREATE POLICY "sellers can insert own stories"
  ON stories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    seller_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'seller'
    )
  );
