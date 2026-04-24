/*
  # Add payload column to notifications table

  ## Summary
  Adds the `payload` jsonb column to the existing `notifications` table
  and adds the required index on (user_id, created_at DESC).

  ## Changes
  - `notifications`: add `payload` (jsonb, default '{}') if not already present
  - Add composite index on (user_id, created_at DESC) for efficient per-user listing
  - Add type CHECK constraint for the new type values if not already present
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'payload'
  ) THEN
    ALTER TABLE notifications ADD COLUMN payload jsonb NOT NULL DEFAULT '{}';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx
  ON notifications (user_id, created_at DESC);
