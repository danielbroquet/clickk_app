/*
  # Shipping addresses

  ## Why
  Buyers need to provide a shipping address so sellers know where to ship the item.
  We capture it once post-purchase, save it on the buyer profile, and reuse it on subsequent purchases.

  ## New table: shipping_addresses
  - id, user_id (fk profiles), full_name, line1, line2, postal_code, city, country (default 'CH'),
    phone, is_default, created_at, updated_at.

  ## New column on stories
  - shipping_address_id (uuid, fk shipping_addresses) — snapshot pointer for the sold drop.

  ## Security (RLS)
  - Buyers own full CRUD on their own addresses.
  - Sellers can read the one address attached to a story they sold (ship-to visibility).
  - ON DELETE SET NULL keeps historical orders intact if the buyer removes an address.
*/

CREATE TABLE IF NOT EXISTS shipping_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  line1 text NOT NULL DEFAULT '',
  line2 text,
  postal_code text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'CH',
  phone text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipping_addresses_user ON shipping_addresses(user_id);

ALTER TABLE shipping_addresses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stories' AND column_name = 'shipping_address_id'
  ) THEN
    ALTER TABLE stories
      ADD COLUMN shipping_address_id uuid REFERENCES shipping_addresses(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stories_shipping_address ON stories(shipping_address_id);

CREATE POLICY "users read own addresses"
  ON shipping_addresses FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users insert own addresses"
  ON shipping_addresses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users update own addresses"
  ON shipping_addresses FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users delete own addresses"
  ON shipping_addresses FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "sellers read address of their sold stories"
  ON shipping_addresses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.shipping_address_id = shipping_addresses.id
        AND stories.seller_id = auth.uid()
    )
  );
