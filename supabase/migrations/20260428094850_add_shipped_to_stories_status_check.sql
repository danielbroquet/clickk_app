/*
  # Add 'shipped' to stories status check constraint

  The stories.status column had a CHECK constraint that only allowed
  'active', 'sold', 'expired', 'delivered'. The mark-shipped edge function
  sets status = 'shipped', which was being rejected by the constraint.

  1. Modified Tables
    - `stories`
      - `status` check constraint updated to include 'shipped'
*/

ALTER TABLE stories
  DROP CONSTRAINT IF EXISTS stories_status_check;

ALTER TABLE stories
  ADD CONSTRAINT stories_status_check
  CHECK (status = ANY (ARRAY[
    'active'::text,
    'sold'::text,
    'expired'::text,
    'shipped'::text,
    'delivered'::text
  ]));
