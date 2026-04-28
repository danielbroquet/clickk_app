/*
  # Add push_token column to profiles

  Stores the Expo push notification token for each user so the app can
  send push notifications when new events occur (order shipped, delivery
  confirmed, new message, etc.).

  1. Modified tables
    - `profiles`
      - `push_token` (text, nullable) — Expo push token

  2. Security
    - Users can update their own push_token via the existing RLS policy
      that allows authenticated users to update their own profile row.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'push_token'
  ) THEN
    ALTER TABLE profiles ADD COLUMN push_token text DEFAULT NULL;
  END IF;
END $$;
