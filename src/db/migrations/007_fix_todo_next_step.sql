-- 007_fix_todo_next_step.sql
-- Fix existing TO-DO groups that have NULL next_step_group_id
-- by pointing them to the ON PROGRESS group of the same project

UPDATE kanban_groups
SET next_step_group_id = (
  SELECT kg2.id
  FROM kanban_groups kg2
  WHERE kg2.project_group_id = kanban_groups.project_group_id
    AND kg2.name = 'ON PROGRESS'
    AND kg2.deleted_at IS NULL
  LIMIT 1
)
WHERE is_locked_todo = 1
  AND next_step_group_id IS NULL
  AND deleted_at IS NULL;
