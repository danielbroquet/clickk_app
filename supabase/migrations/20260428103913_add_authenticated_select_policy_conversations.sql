/*
  # Fix conversations SELECT access for authenticated users

  The existing SELECT policy on conversations targets the `public` role,
  which can conflict with how Supabase evaluates RLS for the `authenticated`
  role, causing 403 errors for logged-in users.

  1. Changes
    - Add an explicit SELECT policy scoped to `authenticated` allowing
      users to read conversations where they are buyer_id or seller_id.
*/

CREATE POLICY "authenticated users read own conversations"
  ON conversations
  FOR SELECT
  TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());
