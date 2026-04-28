/*
  # Buyer confirm-delivery policy on shop_orders

  1. Security
    - New UPDATE policy: buyers can update delivery_status and
      delivered_at on their own orders (buyer_id = auth.uid()).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shop_orders'
      AND policyname = 'buyers_confirm_delivery'
  ) THEN
    CREATE POLICY "buyers_confirm_delivery"
      ON shop_orders
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = buyer_id)
      WITH CHECK (auth.uid() = buyer_id);
  END IF;
END $$;
