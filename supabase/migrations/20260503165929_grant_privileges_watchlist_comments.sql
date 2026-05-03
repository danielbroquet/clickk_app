/*
  # Grant table privileges for watchlist and comments

  ## Problem
  The `watchlist` and `comments` tables have RLS policies defined correctly,
  but the `authenticated` and `anon` roles are missing the basic table-level
  GRANT privileges (SELECT, INSERT, UPDATE, DELETE). Postgres checks GRANTs
  BEFORE evaluating RLS, so every insert/select from the client was silently
  failing with "permission denied", causing:
    1. Heart/like optimistically appears then rolls back; nothing saved.
    2. Watchlist screen always empty.
    3. Comment "send" spins then nothing publishes.

  ## Changes
  1. Grant SELECT, INSERT, DELETE on `public.watchlist` to authenticated
  2. Grant SELECT on `public.watchlist` to anon (for public counts)
  3. Grant SELECT, INSERT, DELETE on `public.comments` to authenticated
  4. Grant SELECT on `public.comments` to anon (public reads)

  ## Security
  No policy changes. RLS remains the real gate:
    - watchlist inserts/deletes still restricted to `auth.uid() = user_id`
    - comments inserts still restricted to `user_id = auth.uid()`
    - comments deletes still restricted to own rows
*/

GRANT SELECT, INSERT, DELETE ON public.watchlist TO authenticated;
GRANT SELECT ON public.watchlist TO anon;

GRANT SELECT, INSERT, DELETE ON public.comments TO authenticated;
GRANT SELECT ON public.comments TO anon;
