-- Preserve activity history when a group is deleted.
-- Activity rows keep group_name/description context, while group_id is cleared.
ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_group_id_fkey;

ALTER TABLE public.activities
  ADD CONSTRAINT activities_group_id_fkey
  FOREIGN KEY (group_id)
  REFERENCES public.groups(id)
  ON DELETE SET NULL;
