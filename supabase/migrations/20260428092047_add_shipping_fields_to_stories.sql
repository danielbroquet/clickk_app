/*
  # Add shipping fields to stories table

  Adds three columns to support the seller shipping workflow:

  1. Modified Tables
    - `stories`
      - `shipped_at` (timestamptz, nullable) — timestamp when seller marked as shipped
      - `delivered_at` (timestamptz, nullable) — timestamp when buyer confirmed delivery
      - `tracking_number` (text, nullable) — Swiss Post tracking number (max 30 chars)

  2. Notes
    - All columns are nullable so existing rows are unaffected
    - No RLS changes required; existing story policies cover these columns
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stories' AND column_name = 'shipped_at'
  ) THEN
    ALTER TABLE stories ADD COLUMN shipped_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stories' AND column_name = 'delivered_at'
  ) THEN
    ALTER TABLE stories ADD COLUMN delivered_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stories' AND column_name = 'tracking_number'
  ) THEN
    ALTER TABLE stories ADD COLUMN tracking_number text CHECK (char_length(tracking_number) <= 30);
  END IF;
END $$;
