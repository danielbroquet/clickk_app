/*
  # Security hardening: function search_path, RPC privileges, avatars policy

  ## Changes
  1. Pin `search_path` on 5 functions flagged as "Function Search Path Mutable":
     - update_comment_vote_counts, update_comment_replies_count, update_comment_counts,
       update_replies_count, tg_stories_set_archived_at.
  2. Revoke EXECUTE from `anon` and `authenticated` on SECURITY DEFINER functions
     that are trigger/cron helpers and must not be callable over PostgREST RPC:
     - cleanup_archived_stories, notify_followers_new_drop, notify_seller_address_ready,
       on_dispute_opened, recompute_seller_rating, update_comment_counts,
       update_comment_replies_count, update_comment_vote_counts, update_replies_count.
  3. Drop the broad `Anyone can view avatars` SELECT policy on `storage.objects`.
     Public bucket object URLs remain reachable without a SELECT policy; this just
     prevents directory-style listing.

  ## Security
  - Functions can no longer be hijacked by malicious temp schemas / mutable paths.
  - Trigger/internal helper functions cannot be invoked by clients via the REST API.
  - Avatars are still viewable via their public URL, but the bucket cannot be listed.
*/

-- 1) Pin search_path on flagged functions
ALTER FUNCTION public.update_comment_vote_counts()     SET search_path = public, pg_temp;
ALTER FUNCTION public.update_comment_replies_count()   SET search_path = public, pg_temp;
ALTER FUNCTION public.update_comment_counts()          SET search_path = public, pg_temp;
ALTER FUNCTION public.update_replies_count()           SET search_path = public, pg_temp;
ALTER FUNCTION public.tg_stories_set_archived_at()     SET search_path = public, pg_temp;

-- Also pin search_path on the other SECURITY DEFINER helpers (defence in depth)
ALTER FUNCTION public.cleanup_archived_stories()       SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_followers_new_drop()      SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_seller_address_ready()    SET search_path = public, pg_temp;
ALTER FUNCTION public.on_dispute_opened()              SET search_path = public, pg_temp;
ALTER FUNCTION public.recompute_seller_rating()        SET search_path = public, pg_temp;

-- 2) Revoke EXECUTE from anon / authenticated on SECURITY DEFINER helpers.
--    These are trigger or cron-only functions and must not be RPC-callable.
REVOKE EXECUTE ON FUNCTION public.cleanup_archived_stories()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_followers_new_drop()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_seller_address_ready()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_dispute_opened()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_seller_rating()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_comment_counts()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_comment_replies_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_comment_vote_counts()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_replies_count()         FROM PUBLIC, anon, authenticated;

-- 3) Drop the broad SELECT policy on avatars. Public URLs still work.
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
