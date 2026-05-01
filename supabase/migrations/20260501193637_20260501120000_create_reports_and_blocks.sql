/*
  # Create reports and user_blocks tables

  Adds two tables required for App Store compliance with Apple's
  User-Generated Content moderation rules.

  1. New Tables
    - `reports`
      - `id` (uuid, PK)
      - `reporter_id` (uuid, FK -> profiles.id, cascade delete)
      - `target_type` (text, one of: story, listing, user, message)
      - `target_id` (uuid)
      - `reason` (text, one of: inappropriate, violence, fraud, counterfeit,
        illegal, spam, harassment, other)
      - `description` (text, nullable, <= 500 chars)
      - `status` (text, one of: pending, reviewed, actioned, dismissed;
        default 'pending')
      - `admin_notes` (text, nullable)
      - `created_at` (timestamptz, default now())
      - `reviewed_at` (timestamptz, nullable)
      - UNIQUE(reporter_id, target_type, target_id) — a user cannot
        report the same item twice.
    - `user_blocks`
      - `id` (uuid, PK)
      - `blocker_id` (uuid, FK -> profiles.id, cascade delete)
      - `blocked_id` (uuid, FK -> profiles.id, cascade delete)
      - `created_at` (timestamptz, default now())
      - UNIQUE(blocker_id, blocked_id)
      - CHECK(blocker_id <> blocked_id)

  2. Indexes
    - reports: (reporter_id, created_at DESC), (target_type, target_id),
      (status, created_at DESC)
    - user_blocks: (blocker_id, created_at DESC), (blocked_id)

  3. Security
    - RLS enabled on both tables.
    - reports:
      - INSERT: authenticated, reporter_id = auth.uid()
      - SELECT: authenticated, reporter_id = auth.uid()
      - No UPDATE/DELETE for regular users (admins act via service role).
    - user_blocks:
      - INSERT: authenticated, blocker_id = auth.uid()
      - SELECT: authenticated, blocker_id = auth.uid()
      - DELETE: authenticated, blocker_id = auth.uid()
      - No UPDATE (a block is either present or removed).

  4. Notes
    1. `target_id` is intentionally not a FK because it references
       multiple tables (polymorphic). Integrity is enforced at the app
       layer via `target_type`.
    2. Admin moderation uses the Supabase service role, which bypasses
       RLS, so no admin-facing policies are declared here.
*/

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('story', 'listing', 'user', 'message')),
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'inappropriate', 'violence', 'fraud', 'counterfeit',
    'illegal', 'spam', 'harassment', 'other'
  )),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CONSTRAINT reports_unique_reporter_target UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS reports_reporter_created_idx
  ON reports (reporter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS reports_target_idx
  ON reports (target_type, target_id);

CREATE INDEX IF NOT EXISTS reports_status_created_idx
  ON reports (status, created_at DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own reports"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can read their own reports"
  ON reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);


CREATE TABLE IF NOT EXISTS user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_unique UNIQUE (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocker_created_idx
  ON user_blocks (blocker_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx
  ON user_blocks (blocked_id);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own blocks"
  ON user_blocks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can read their own blocks"
  ON user_blocks FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users can delete their own blocks"
  ON user_blocks FOR DELETE
  TO authenticated
  USING (auth.uid() = blocker_id);
