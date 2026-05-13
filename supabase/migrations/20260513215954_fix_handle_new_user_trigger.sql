/*
  # Fix handle_new_user trigger

  ## Problem
  The existing trigger ignores raw_user_meta_data and generates a random username
  instead of using the username and full_name provided during registration.

  ## Changes
  - Replaces handle_new_user() to read `username` and `full_name` from raw_user_meta_data
  - Falls back to email prefix if username is missing
  - Sets display_name from full_name (or name) metadata
  - Uses ON CONFLICT DO UPDATE so re-triggered rows (e.g. social auth) are handled safely
  - Existing users with broken usernames are NOT touched (trigger only fires on INSERT)
  - Recreates the trigger to ensure it points to the updated function
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _username  text;
  _full_name text;
BEGIN
  _username := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
    split_part(NEW.email, '@', 1)
  );

  _full_name := NULLIF(TRIM(COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name'
  )), '');

  INSERT INTO public.profiles (id, username, display_name, email, role)
  VALUES (
    NEW.id,
    _username,
    _full_name,
    NEW.email,
    'buyer'
  )
  ON CONFLICT (id) DO UPDATE
    SET username     = EXCLUDED.username,
        display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
        email        = EXCLUDED.email;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
