-- 006_add_next_run_task_id.sql

ALTER TABLE tasks ADD COLUMN next_run_task_id TEXT NULL REFERENCES tasks(id);

CREATE INDEX idx_tasks_next_run_task ON tasks(next_run_task_id);
