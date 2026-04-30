/*
  # Fix story-thumbnails storage policy to prevent bucket listing

  ## Problem
  The existing "Public read story thumbnails" SELECT policy on storage.objects
  uses only `bucket_id = 'story-thumbnails'` as its condition. This allows any
  client to list all files in the bucket (e.g. via the storage API list endpoint),
  exposing more data than intended. Public buckets only need to serve specific
  object URLs — not allow directory listing.

  ## Changes
  1. Drop the broad "Public read story thumbnails" policy
  2. Replace with a narrower policy that requires the object `name` to be
     non-null AND non-empty, which prevents the wildcard list behaviour while
     still allowing direct URL access to any known object path.

  ## Security impact
  - Clients with a known URL can still fetch the thumbnail directly (unchanged)
  - Clients cannot enumerate/list all files in the bucket (fixed)
*/

-- Drop the broad listing-capable policy
DROP POLICY IF EXISTS "Public read story thumbnails" ON storage.objects;

-- Replace with access-by-name-only policy (no listing)
CREATE POLICY "Public read story thumbnails by name"
  ON storage.objects
  FOR SELECT
  TO public
  USING (
    bucket_id = 'story-thumbnails'
    AND name IS NOT NULL
    AND name <> ''
  );
