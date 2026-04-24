/*
  # Create notifications table

  ## Summary
  Adds a `notifications` table for delivering in-app alerts to users.

  ## New Tables

  ### `notifications`
  - `id` (uuid, PK) — auto-generated row identifier
  - `user_id` (uuid, FK → profiles.id ON DELETE CASCADE) — recipient
  - `type` (text) — one of: 'sale', 'price_drop', 'follow', 'like', 'purchase', 'story_sold'
  - `payload` (jsonb, default '{}') — arbitrary event data
  - `read` (boolean, default false) — read/unread state
  - `created_at` (timestamptz, default now()) — creation timestamp

  ## Security

  - RLS enabled; table is locked down by default
  - SELECT policy: authenticated users may read only their own rows
  - UPDATE policy: authenticated users may update only their own rows

  ## Indexes

  - `(user_id, created_at DESC)` — efficient per-user notification listing
*/

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       text        NOT NULL CHECK (type IN ('sale', 'price_drop', 'follow', 'like', 'purchase', 'story_sold')),
  payload    jsonb       NOT NULL DEFAULT '{}',
  read       boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx
  ON notifications (user_id, created_at DESC);
