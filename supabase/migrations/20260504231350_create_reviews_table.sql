/*
  # Buyer reviews on sellers (post-delivery)

  ## Why
  Trust signal central to any C2C marketplace. Buyers rate sellers after
  delivery is confirmed; aggregated rating is shown on the seller profile
  and drop cards.

  ## New table: reviews
  - id (uuid, pk)
  - story_id (uuid, fk stories, unique) — one review per story
  - buyer_id (uuid, fk profiles) — author
  - seller_id (uuid, fk profiles) — target
  - rating (smallint 1-5)
  - comment (text, nullable, max 500)
  - created_at, updated_at

  ## Security (RLS)
  - Anyone (even anonymous) can READ reviews — they're public trust data.
  - Only the buyer of a DELIVERED story can INSERT a review, and only once.
  - Only the author can UPDATE or DELETE their own review (within 30 days).

  ## Indexes
  - On seller_id (for rating aggregation)
  - On buyer_id (for "my reviews" list)
  - Unique on story_id (prevents double reviews)
*/

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_seller ON reviews(seller_id);
CREATE INDEX IF NOT EXISTS idx_reviews_buyer ON reviews(buyer_id);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews are publicly readable"
  ON reviews FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "buyers can review delivered purchases"
  ON reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    buyer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = reviews.story_id
        AND stories.buyer_id = auth.uid()
        AND stories.seller_id = reviews.seller_id
        AND stories.status = 'delivered'
    )
  );

CREATE POLICY "authors can update own review within 30 days"
  ON reviews FOR UPDATE
  TO authenticated
  USING (buyer_id = auth.uid() AND created_at > now() - interval '30 days')
  WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "authors can delete own review within 30 days"
  ON reviews FOR DELETE
  TO authenticated
  USING (buyer_id = auth.uid() AND created_at > now() - interval '30 days');
