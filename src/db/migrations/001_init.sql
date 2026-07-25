-- 001_init.sql

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE project_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL
);

CREATE TABLE kanban_groups (
  id TEXT PRIMARY KEY,
  project_group_id TEXT NULL,
  name TEXT NOT NULL,
  slash_command TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_locked_todo INTEGER NOT NULL DEFAULT 0,
  is_locked_done INTEGER NOT NULL DEFAULT 0,
  next_step_group_id TEXT NULL,
  instruction TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL,
  FOREIGN KEY (project_group_id) REFERENCES project_groups(id),
  FOREIGN KEY (next_step_group_id) REFERENCES kanban_groups(id)
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_group_id TEXT NULL,
  kanban_group_id TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  ai_provider TEXT NOT NULL,
  session_pid INTEGER NULL,
  session_status TEXT NOT NULL DEFAULT 'idle',
  started_at TEXT NULL,
  finished_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL,
  FOREIGN KEY (project_group_id) REFERENCES project_groups(id),
  FOREIGN KEY (kanban_group_id) REFERENCES kanban_groups(id)
);

CREATE TABLE task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE token_usage (
  id TEXT PRIMARY KEY,
  project_group_id TEXT NULL,
  task_id TEXT NOT NULL,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX idx_tasks_kanban_group ON tasks(kanban_group_id);
CREATE INDEX idx_tasks_project_group ON tasks(project_group_id);
CREATE INDEX idx_tasks_deleted_at ON tasks(deleted_at);
CREATE INDEX idx_task_events_task_id ON task_events(task_id);
