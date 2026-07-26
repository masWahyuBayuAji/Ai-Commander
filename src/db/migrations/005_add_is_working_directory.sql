-- Add is_working_directory column to project_alias_mappings
ALTER TABLE project_alias_mappings ADD COLUMN is_working_directory INTEGER NOT NULL DEFAULT 0;
