/*
  # Allow buyers to read listings they have ordered

  The shop_listings SELECT policies only allowed reads when:
    - is_active = true (public browse)
    - seller_id = auth.uid() (seller sees own listings)

  This blocked the nested join in the shop_orders query for buyers
  whose order references an inactive listing (e.g. sold-out or
  deactivated), causing the listing sub-object to return null and
  the order to appear broken or missing in the orders screen.

  1. Modified Security
    - `shop_listings`: add SELECT policy allowing authenticated buyers
      to read any listing that appears in one of their shop_orders.
*/

CREATE POLICY "buyers_read_ordered_listings"
  ON shop_listings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shop_orders
      WHERE shop_orders.listing_id = shop_listings.id
        AND shop_orders.buyer_id = auth.uid()
    )
  );
