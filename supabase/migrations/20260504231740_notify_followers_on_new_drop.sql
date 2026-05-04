/*
  # Notify followers when a seller publishes a new drop

  ## Why
  Users who follow a seller expect to be alerted the moment that seller
  publishes a new drop. Critical for Gen Z FOMO and seller retention.

  ## Changes
  - Extend notifications.type check to allow 'new_drop'.
  - Add trigger AFTER INSERT on stories: for each follower of the new drop's
    seller, insert a 'new_drop' notification containing story_id + title.

  ## Notes
  - The existing push-notification pipeline (send-push edge function + client
    subscription) picks up notifications by type.
  - Runs as SECURITY DEFINER with locked search_path for safety.
*/

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'outbid','auction_won','top_up','auction_ending','new_follower',
    'sale','purchase','story_sold','delivery_confirmed',
    'purchase_refunded','dispute_opened','new_drop'
  ]));

CREATE OR REPLACE FUNCTION notify_followers_new_drop()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_username text;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_seller_username
    FROM profiles
   WHERE id = NEW.seller_id;

  INSERT INTO notifications (user_id, type, title, message, payload)
  SELECT
    f.follower_id,
    'new_drop',
    'Nouveau drop',
    COALESCE('@' || v_seller_username, 'Un vendeur que tu suis') || ' vient de publier : ' || COALESCE(NEW.title, 'un nouveau drop'),
    jsonb_build_object('story_id', NEW.id, 'seller_id', NEW.seller_id)
  FROM follows f
  WHERE f.following_id = NEW.seller_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_followers_new_drop ON stories;

CREATE TRIGGER trg_notify_followers_new_drop
AFTER INSERT ON stories
FOR EACH ROW
EXECUTE FUNCTION notify_followers_new_drop();
