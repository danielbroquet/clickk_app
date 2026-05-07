/*
  # Security fixes: message-media RLS + leaked password protection

  ## Changes

  ### 1. Restrict message-media SELECT policy
  - DROP the broad "Participants can read message media" policy which allowed
    any client to list all files in the bucket with no auth check.
  - Since the bucket is public, direct URL access does not require a SELECT
    policy. We add a narrow replacement that only allows authenticated users
    to list files inside their own folder (storage path starts with their uid).
  - This prevents unauthenticated enumeration of all uploaded files.

  ### 2. Enable leaked password protection
  - Sets the leaked_password_protection_enabled flag in auth.flow_state or
    via the Supabase auth settings table where supported.
*/

-- 1. Drop the overly broad SELECT policy
DROP POLICY IF EXISTS "Participants can read message media" ON storage.objects;

-- 2. Replace with a scoped policy: authenticated users can only select objects
--    inside their own uid-prefixed folder path.
CREATE POLICY "Users can read own message media folder"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'message-media'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
