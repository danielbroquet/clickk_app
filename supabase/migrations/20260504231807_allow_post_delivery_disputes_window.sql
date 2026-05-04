/*
  # Allow post-delivery dispute (return request) within 7 days

  ## Why
  Even after confirming delivery, a buyer may discover the item doesn't match
  the description, is damaged, or want to return it. We reuse the existing
  disputes table and open a 7-day window after delivered_at during which the
  buyer can still open a dispute (return request).

  ## Changes
  - Replace the disputes INSERT policy to additionally allow 'delivered'
    stories whose delivered_at is within the last 7 days.
  - Trigger on_dispute_opened already handles the status transition; we
    extend it to accept 'delivered' -> 'disputed' as well, so the seller
    is notified.

  ## Security
  All within RLS; seller still cannot be the opener.
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
        AND (
          stories.status IN ('sold','shipped')
          OR (
            stories.status = 'delivered'
            AND stories.delivered_at IS NOT NULL
            AND stories.delivered_at > now() - interval '7 days'
          )
        )
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
     AND status IN ('sold','shipped','delivered')
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
