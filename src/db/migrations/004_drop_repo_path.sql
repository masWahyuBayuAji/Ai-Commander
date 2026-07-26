-- Drop repo_path from project_groups (paths are now only in project_alias_mappings)
-- SQLite doesn't support DROP COLUMN, so recreate the table
-- Foreign keys are disabled by the migration runner during execution

CREATE TABLE project_groups_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  use_alias_mapping INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL
);

INSERT INTO project_groups_new (id, name, use_alias_mapping, created_at, updated_at, deleted_at)
SELECT id, name, use_alias_mapping, created_at, updated_at, deleted_at
FROM project_groups;

DROP TABLE project_groups;

ALTER TABLE project_groups_new RENAME TO project_groups;
