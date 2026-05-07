-- PR 1: account lifecycle hardening.
--
-- Historical project content should survive auth.users deletion for audit and
-- collaboration continuity. Private per-user rows already cascade elsewhere;
-- authored/assigned task history is anonymized by nulling user references.

ALTER TABLE public.task_comments
  DROP CONSTRAINT IF EXISTS task_comments_author_id_fkey;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_creator_fkey;

ALTER TABLE public.task_comments
  ALTER COLUMN author_id DROP NOT NULL;

ALTER TABLE ONLY public.task_comments
  ADD CONSTRAINT task_comments_author_id_fkey
  FOREIGN KEY (author_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
  ADD CONSTRAINT tasks_assignee_id_fkey
  FOREIGN KEY (assignee_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
  ADD CONSTRAINT tasks_creator_fkey
  FOREIGN KEY (creator)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.task_comments.author_id IS
  'Nullable after account lifecycle hardening: auth.users deletion preserves historical comments with author_id set null.';

COMMENT ON CONSTRAINT tasks_creator_fkey ON public.tasks IS
  'ON DELETE SET NULL preserves historical project/task rows when an auth user is deleted.';

COMMENT ON CONSTRAINT tasks_assignee_id_fkey ON public.tasks IS
  'ON DELETE SET NULL preserves task history while clearing deleted-user assignments.';
