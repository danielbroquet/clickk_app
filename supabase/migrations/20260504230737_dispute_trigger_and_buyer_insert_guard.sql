/*
  # Dispute trigger + buyer-only insert guard

  ## Why
  When a buyer opens a dispute, we want to:
  1. Move the story to status 'disputed' (even though buyers can't UPDATE stories directly).
  2. Notify the seller that a dispute was opened.
  3. Restrict dispute creation to the actual buyer of the story on statuses that make
     sense (sold, shipped — not delivered or refunded).

  ## Changes
  - Replace the permissive disputes INSERT policy with a strict one that checks
    the caller is the buyer AND the story is in a disputable state.
  - Add trigger on disputes AFTER INSERT that:
      * updates stories.status to 'disputed'
      * inserts a notification for the seller

  ## Security
  - Trigger function runs SECURITY DEFINER with locked search_path.
*/

DROP POLICY IF EXISTS "users insert their own disputes" ON disputes;

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

DROP TRIGGER IF EXISTS trg_on_dispute_opened ON disputes;

CREATE TRIGGER trg_on_dispute_opened
AFTER INSERT ON disputes
FOR EACH ROW
EXECUTE FUNCTION on_dispute_opened();
