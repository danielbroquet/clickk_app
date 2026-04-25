/*
  # Add delivered status to stories and delivery_confirmed notification type

  1. Stories
    - Extend `stories.status` check constraint to include `'delivered'`
    - Add `delivered_at` (timestamptz, nullable) — set when buyer confirms reception
  2. Notifications
    - Extend `notifications.type` check constraint to include `'delivery_confirmed'`
  3. Notes
    - Non-destructive: existing rows are preserved; nullable column and widened CHECK only
    - story_id for delivery notifications is stored in `notifications.payload` jsonb
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'stories' AND constraint_name = 'stories_status_check'
  ) THEN
    ALTER TABLE stories DROP CONSTRAINT stories_status_check;
  END IF;
END $$;

ALTER TABLE stories
  ADD CONSTRAINT stories_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'sold'::text, 'expired'::text, 'delivered'::text]));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stories' AND column_name = 'delivered_at'
  ) THEN
    ALTER TABLE stories ADD COLUMN delivered_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'notifications' AND constraint_name = 'notifications_type_check'
  ) THEN
    ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
  END IF;
END $$;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'outbid'::text,
    'auction_won'::text,
    'top_up'::text,
    'auction_ending'::text,
    'new_follower'::text,
    'sale'::text,
    'purchase'::text,
    'story_sold'::text,
    'delivery_confirmed'::text
  ]));
