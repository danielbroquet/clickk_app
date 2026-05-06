/*
  # Add comment threading and like/dislike support

  1. Schema Changes
    - `comments` table: add `parent_comment_id`, `likes_count`, `dislikes_count`, `replies_count` columns
    - New `comment_likes` table for per-user votes (value: 1 = like, -1 = dislike)

  2. New Tables
    - `comment_likes`
      - `id` (uuid, primary key)
      - `comment_id` (uuid, FK → comments.id)
      - `user_id` (uuid, FK → auth.users.id)
      - `value` (smallint, 1 or -1)
      - unique constraint on (comment_id, user_id)

  3. Security
    - RLS enabled on `comment_likes`
    - Authenticated users can read all likes
    - Users can insert/delete only their own likes

  4. Triggers
    - Auto-update `likes_count` / `dislikes_count` on comments when comment_likes rows are inserted/deleted
    - Auto-update `replies_count` on parent comment when a child comment is inserted/deleted
*/

-- Add threading and count columns to comments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comments' AND column_name = 'parent_comment_id'
  ) THEN
    ALTER TABLE comments ADD COLUMN parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comments' AND column_name = 'likes_count'
  ) THEN
    ALTER TABLE comments ADD COLUMN likes_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comments' AND column_name = 'dislikes_count'
  ) THEN
    ALTER TABLE comments ADD COLUMN dislikes_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comments' AND column_name = 'replies_count'
  ) THEN
    ALTER TABLE comments ADD COLUMN replies_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Create comment_likes table
CREATE TABLE IF NOT EXISTS comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (1, -1)),
  created_at timestamptz DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read comment likes"
  ON comment_likes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own comment likes"
  ON comment_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comment likes"
  ON comment_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS comment_likes_comment_id_idx ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS comment_likes_user_id_idx ON comment_likes(user_id);
CREATE INDEX IF NOT EXISTS comments_parent_comment_id_idx ON comments(parent_comment_id);

-- Trigger: keep likes_count / dislikes_count in sync
CREATE OR REPLACE FUNCTION update_comment_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.value = 1 THEN
      UPDATE comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
    ELSE
      UPDATE comments SET dislikes_count = dislikes_count + 1 WHERE id = NEW.comment_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.value = 1 THEN
      UPDATE comments SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.comment_id;
    ELSE
      UPDATE comments SET dislikes_count = GREATEST(0, dislikes_count - 1) WHERE id = OLD.comment_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_comment_vote_counts ON comment_likes;
CREATE TRIGGER trg_comment_vote_counts
  AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW EXECUTE FUNCTION update_comment_vote_counts();

-- Trigger: keep replies_count on parent comment in sync
CREATE OR REPLACE FUNCTION update_comment_replies_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_comment_id IS NOT NULL THEN
    UPDATE comments SET replies_count = replies_count + 1 WHERE id = NEW.parent_comment_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_comment_id IS NOT NULL THEN
    UPDATE comments SET replies_count = GREATEST(0, replies_count - 1) WHERE id = OLD.parent_comment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_comment_replies_count ON comments;
CREATE TRIGGER trg_comment_replies_count
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_comment_replies_count();
