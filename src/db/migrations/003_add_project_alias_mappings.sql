-- Add use_alias_mapping column to project_groups
ALTER TABLE project_groups ADD COLUMN use_alias_mapping INTEGER NOT NULL DEFAULT 0;

-- Create project_alias_mappings table
CREATE TABLE project_alias_mappings (
  id TEXT PRIMARY KEY,
  project_group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL,
  FOREIGN KEY (project_group_id) REFERENCES project_groups(id)
);

CREATE INDEX idx_project_alias_mappings_group ON project_alias_mappings(project_group_id);
