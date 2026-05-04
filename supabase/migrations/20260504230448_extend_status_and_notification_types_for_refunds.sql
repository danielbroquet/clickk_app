/*
  # Extend status and notification types to support refunds and disputes

  ## Why
  Automatic refunds (when seller never ships) and buyer disputes need new enum values.

  ## Changes
  1. stories.status — add 'refunded', 'cancelled', 'disputed'.
  2. notifications.type — add 'purchase_refunded', 'dispute_opened'.
*/

ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_status_check;
ALTER TABLE stories
  ADD CONSTRAINT stories_status_check
  CHECK (status = ANY (ARRAY[
    'active','sold','expired','shipped','delivered',
    'refunded','cancelled','disputed'
  ]));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'outbid','auction_won','top_up','auction_ending','new_follower',
    'sale','purchase','story_sold','delivery_confirmed',
    'purchase_refunded','dispute_opened'
  ]));
