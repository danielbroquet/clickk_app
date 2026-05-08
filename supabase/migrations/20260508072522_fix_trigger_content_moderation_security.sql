/*
  # Fix security issues on trigger_content_moderation function

  1. Changes
    - Set a fixed search_path on `public.trigger_content_moderation` to prevent
      search_path hijacking attacks.
    - Revoke EXECUTE on the function from `anon` and `authenticated` roles so it
      cannot be called directly via the REST API as a SECURITY DEFINER function.
      It is only meant to run as a trigger (invoked by the database engine as the
      function owner), not by end-users.

  2. Security
    - Fixes "Function Search Path Mutable" advisory.
    - Fixes "Public/Signed-In Users Can Execute SECURITY DEFINER Function" advisory.
*/

ALTER FUNCTION public.trigger_content_moderation()
  SET search_path = public, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.trigger_content_moderation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trigger_content_moderation() FROM authenticated;
