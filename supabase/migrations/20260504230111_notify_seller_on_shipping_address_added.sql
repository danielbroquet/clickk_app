/*
  # Notify seller when buyer attaches a shipping address

  ## Why
  After a sale, the seller is notified of the purchase but has no signal when the
  buyer has actually provided their shipping address. The seller must refresh
  the sales screen. We add a DB trigger that creates a notification row the
  moment an address is attached to a sold story.

  ## Change
  - Function notify_seller_address_ready() fires on UPDATE of stories when
    shipping_address_id transitions from NULL to a value.
  - Inserts a notification with type 'purchase' (existing allowed type) so the
    existing notification UI/push pipeline picks it up.

  ## Security
  - SECURITY DEFINER so the trigger can insert into notifications regardless of
    the current role. Sets a locked search_path for safety.
*/

CREATE OR REPLACE FUNCTION notify_seller_address_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.shipping_address_id IS NOT NULL
     AND (OLD.shipping_address_id IS NULL OR OLD.shipping_address_id <> NEW.shipping_address_id) THEN

    INSERT INTO notifications (user_id, type, title, message, payload)
    VALUES (
      NEW.seller_id,
      'purchase',
      'Adresse reçue',
      'L''acheteur a indiqué son adresse. Tu peux préparer l''expédition.',
      jsonb_build_object('story_id', NEW.id, 'kind', 'address_ready')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_seller_address_ready ON stories;

CREATE TRIGGER trg_notify_seller_address_ready
AFTER UPDATE OF shipping_address_id ON stories
FOR EACH ROW
EXECUTE FUNCTION notify_seller_address_ready();
