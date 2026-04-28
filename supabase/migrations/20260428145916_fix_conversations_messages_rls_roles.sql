/*
  # Fix RLS policies for conversations and messages tables

  ## Problem
  All existing policies on both tables are bound to the `public` role instead
  of the `authenticated` role. Authenticated users therefore match no policy
  and receive "permission denied".

  ## Changes

  ### conversations
  - Drop the two broken `public`-role SELECT policies and the one broken
    `public`-role INSERT policy.
  - Drop any pre-existing `authenticated`-role policies added by previous
    migrations to avoid duplicates.
  - Recreate SELECT, INSERT, and UPDATE policies correctly scoped to
    `authenticated`.

  ### messages
  - Drop the two broken `public`-role policies (SELECT, INSERT).
  - Recreate SELECT and INSERT policies scoped to `authenticated`.
  - Add a new UPDATE policy so participants can mark messages as read
    (set read_at), which previously had no policy at all.
*/

-- ─── conversations ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users see their own conversations"           ON conversations;
DROP POLICY IF EXISTS "Buyer can create conversation"               ON conversations;
DROP POLICY IF EXISTS "authenticated users read own conversations"  ON conversations;
DROP POLICY IF EXISTS "users_read_own_conversations"                ON conversations;
DROP POLICY IF EXISTS "users_insert_conversations"                  ON conversations;
DROP POLICY IF EXISTS "users_update_conversations"                  ON conversations;

CREATE POLICY "users_read_own_conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE POLICY "users_insert_conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE POLICY "users_update_conversations"
  ON conversations FOR UPDATE
  TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- ─── messages ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Participants can read messages"  ON messages;
DROP POLICY IF EXISTS "Participants can send messages"  ON messages;
DROP POLICY IF EXISTS "users_read_own_messages"         ON messages;
DROP POLICY IF EXISTS "users_insert_messages"           ON messages;
DROP POLICY IF EXISTS "users_update_messages"           ON messages;

CREATE POLICY "users_read_own_messages"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

CREATE POLICY "users_insert_messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

CREATE POLICY "users_update_messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );
