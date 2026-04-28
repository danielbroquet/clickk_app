/*
  # Add buyer read policy to stories

  The stories table was missing an RLS SELECT policy for buyers.
  Existing policies only allowed:
    - Public read when status = 'active'
    - Seller read of their own stories

  This meant buyers querying `.eq('buyer_id', auth.uid())` received
  zero rows because no policy matched, causing the orders screen to
  appear empty even when purchases existed.

  1. Modified Security
    - `stories` table: add SELECT policy allowing buyers to read
      stories where they are the buyer (buyer_id = auth.uid())
*/

CREATE POLICY "stories_buyer_read_own"
  ON stories
  FOR SELECT
  TO authenticated
  USING (buyer_id = auth.uid());
