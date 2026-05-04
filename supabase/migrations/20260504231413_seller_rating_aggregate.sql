/*
  # Denormalized seller rating aggregate

  ## Why
  Drop cards and profile pages display rating widely. Instead of recomputing
  AVG/COUNT on every render, we maintain denormalized counters on profiles.

  ## Changes
  - profiles.rating_avg (numeric) — average star rating, 0 if no review
  - profiles.rating_count (int) — number of reviews received
  - Trigger recompute_seller_rating() fires AFTER INSERT/UPDATE/DELETE on
    reviews and updates the seller's profile row.

  ## Security
  SECURITY DEFINER with locked search_path — only the trigger can write to
  these fields. Users cannot falsify their own ratings (the columns are
  updated only through this trigger).
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'profiles' AND column_name = 'rating_avg') THEN
    ALTER TABLE profiles ADD COLUMN rating_avg numeric(3,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'profiles' AND column_name = 'rating_count') THEN
    ALTER TABLE profiles ADD COLUMN rating_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION recompute_seller_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid;
BEGIN
  target := COALESCE(NEW.seller_id, OLD.seller_id);
  IF target IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE profiles p
     SET rating_avg = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM reviews WHERE seller_id = target), 0),
         rating_count = (SELECT COUNT(*) FROM reviews WHERE seller_id = target)
   WHERE p.id = target;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_recompute_rating ON reviews;

CREATE TRIGGER trg_reviews_recompute_rating
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION recompute_seller_rating();
