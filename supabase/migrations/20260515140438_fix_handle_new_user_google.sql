/*
  # Fix handle_new_user trigger for Google OAuth

  1. Changes
    - Replaces the handle_new_user() function to support Google OAuth sign-ins
    - Google OAuth does not provide a "username" field in raw_user_meta_data
    - Username is now derived from display name or email prefix when not explicitly provided
    - Username is sanitized: lowercased, special chars replaced with underscore, max 30 chars
    - Short unique suffix (first 6 chars of user ID) appended to avoid collisions
    - display_name is read from full_name, name, or username metadata fields

  2. Security
    - Function remains SECURITY DEFINER with search_path = public
    - Uses ON CONFLICT to safely handle re-runs without data loss

  3. Important Notes
    - Google uses "name" field in raw_user_meta_data for the display name
    - Email/password signups typically provide "username" in raw_user_meta_data
    - The trigger fires AFTER INSERT on auth.users
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _raw_username text;
  _username     text;
  _full_name    text;
BEGIN
  -- Get display name from any available source
  _full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '')
  );

  -- Build username: prefer explicit username, else derive from name/email
  _raw_username := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    split_part(NEW.email, '@', 1)
  );

  -- Sanitize: lowercase, replace non-alphanumeric with underscore, trim underscores
  _username := LOWER(regexp_replace(TRIM(_raw_username), '[^a-zA-Z0-9]', '_', 'g'));
  _username := LEFT(_username, 24);

  -- Append short unique suffix to avoid collisions
  _username := _username || '_' || LEFT(REPLACE(NEW.id::text, '-', ''), 6);

  INSERT INTO public.profiles (id, username, display_name, email, role)
  VALUES (
    NEW.id,
    _username,
    _full_name,
    NEW.email,
    'buyer'
  )
  ON CONFLICT (id) DO UPDATE
    SET username     = COALESCE(profiles.username, EXCLUDED.username),
        display_name = COALESCE(profiles.display_name, EXCLUDED.display_name),
        email        = EXCLUDED.email;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();