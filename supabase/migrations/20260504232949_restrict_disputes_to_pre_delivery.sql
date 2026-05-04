/*
  # Restrict disputes to pre-delivery window only

  ## Why
  Product decision: once the buyer confirms reception, the funds are released
  to the seller and the order is final. No return / no dispute is possible
  after delivery confirmation. The buyer must raise a dispute BEFORE confirming
  delivery (either while the parcel is en route, or during the 7-day auto-release
  window if they notice a problem on arrival).

  ## Changes
  - Disputes INSERT policy: only allow on status IN ('sold','shipped'). Remove
    the post-delivery 7-day window added previously.
  - on_dispute_opened trigger: revert to moving only sold/shipped to disputed.
    A 'delivered' story is final.
*/

DROP POLICY IF EXISTS "buyers can open disputes on their purchases" ON disputes;

CREATE POLICY "buyers can open disputes on their purchases"
  ON disputes FOR INSERT
  TO authenticated
  WITH CHECK (
    opened_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = disputes.story_id
        AND stories.buyer_id = auth.uid()
        AND stories.status IN ('sold','shipped')
    )
  );

CREATE OR REPLACE FUNCTION on_dispute_opened()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller uuid;
BEGIN
  UPDATE stories
     SET status = 'disputed', updated_at = now()
   WHERE id = NEW.story_id
     AND status IN ('sold','shipped')
  RETURNING seller_id INTO v_seller;

  IF v_seller IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, message, payload)
    VALUES (
      v_seller,
      'dispute_opened',
      'Litige ouvert',
      'Un acheteur a signalé un problème avec l''une de tes ventes. Notre équipe va examiner le dossier.',
      jsonb_build_object('story_id', NEW.story_id, 'dispute_id', NEW.id, 'reason', NEW.reason)
    );
  END IF;

  RETURN NEW;
END;
$$;
