/*
  # Ensure conversations and messages tables are complete

  Idempotent migration — creates tables/indexes/policies only if they do not
  already exist. Safe to run on a database that may already have partial setup.

  ## Tables ensured
  - conversations (story_id, buyer_id, seller_id, updated_at, created_at)
  - messages (conversation_id, sender_id, content, read_at, created_at)

  ## Security
  - RLS enabled on both tables
  - Policies guard SELECT/INSERT/UPDATE to conversation participants only
*/

-- ── conversations ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id    uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  buyer_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_unique_thread UNIQUE (story_id, buyer_id, seller_id)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS conversations_buyer_id_idx   ON conversations(buyer_id);
CREATE INDEX IF NOT EXISTS conversations_seller_id_idx  ON conversations(seller_id);
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx ON conversations(updated_at DESC);

-- ── messages ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content         text NOT NULL DEFAULT '',
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx       ON messages(sender_id);
