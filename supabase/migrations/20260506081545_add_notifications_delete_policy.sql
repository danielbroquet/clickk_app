/*
  # Add DELETE policy on notifications table

  ## Changes
  - Adds a Row Level Security policy allowing authenticated users to delete
    their own notifications (rows where user_id = auth.uid()).

  ## Security
  - Users can only delete notifications that belong to them.
  - Unauthenticated users cannot delete any notifications.
*/

CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
