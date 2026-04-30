/*
  # Story Thumbnails Infrastructure

  1. Schema Changes
    - `stories` table: adds `thumbnail_url` (TEXT, nullable) column

  2. Storage
    - Creates `story-thumbnails` bucket (public, 512KB max file size)

  3. Security
    - Public SELECT policy: anyone can read objects in the bucket
    - Authenticated INSERT policy: signed-in users can upload thumbnails
*/

ALTER TABLE stories ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('story-thumbnails', 'story-thumbnails', true, 524288)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read story thumbnails"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'story-thumbnails');

CREATE POLICY "Sellers can upload thumbnails"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'story-thumbnails');
