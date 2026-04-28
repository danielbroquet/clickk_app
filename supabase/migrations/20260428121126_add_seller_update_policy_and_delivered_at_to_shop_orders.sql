/*
  # seller shop_orders update policy + delivered_at column

  1. New Column
    - `shop_orders.delivered_at` (timestamptz, nullable)
      Timestamp set when delivery_status transitions to 'delivered'.

  2. Security
    - New UPDATE policy: sellers can update delivery_status and
      tracking_number on their own orders (seller_id = auth.uid()).
      WITH CHECK prevents re-routing to a different seller.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shop_orders' AND column_name = 'delivered_at'
  ) THEN
    ALTER TABLE shop_orders ADD COLUMN delivered_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shop_orders'
      AND policyname = 'Seller can update delivery status on own orders'
  ) THEN
    CREATE POLICY "Seller can update delivery status on own orders"
      ON shop_orders
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = seller_id)
      WITH CHECK (auth.uid() = seller_id);
  END IF;
END $$;
