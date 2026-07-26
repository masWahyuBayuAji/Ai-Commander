const db = require('../connection');
const uuid = require('../../shared/uuid');
const os = require('node:os');

function listByProjectGroup(projectGroupId) {
  return db.prepare(
    'SELECT * FROM project_alias_mappings WHERE project_group_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
  ).all(projectGroupId);
}

function getById(id) {
  return db.prepare('SELECT * FROM project_alias_mappings WHERE id = ?').get(id);
}

function create({ projectGroupId, name, path, isWorkingDirectory = 0 }) {
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO project_alias_mappings (id, project_group_id, name, path, is_working_directory, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectGroupId, name, path, isWorkingDirectory ? 1 : 0, now, now);
  return getById(id);
}

function update(id, { name, path, isWorkingDirectory }) {
  const now = new Date().toISOString();
  const existing = getById(id);
  if (!existing) return null;
  db.prepare(`
    UPDATE project_alias_mappings SET name = ?, path = ?, is_working_directory = ?, updated_at = ? WHERE id = ?
  `).run(
    name ?? existing.name,
    path ?? existing.path,
    isWorkingDirectory !== undefined ? (isWorkingDirectory ? 1 : 0) : existing.is_working_directory,
    now,
    id
  );
  return getById(id);
}

function softDelete(id) {
  const now = new Date().toISOString();
  db.prepare('UPDATE project_alias_mappings SET deleted_at = ? WHERE id = ?').run(now, id);
}

function deleteByProjectGroup(projectGroupId) {
  const now = new Date().toISOString();
  db.prepare('UPDATE project_alias_mappings SET deleted_at = ? WHERE project_group_id = ? AND deleted_at IS NULL').run(now, projectGroupId);
}

/**
 * Set one alias as the working directory for a project group.
 * Clears is_working_directory for all other aliases in the same group first.
 * @param {string} projectGroupId
 * @param {string} aliasId - the alias to mark as working directory
 */
function setWorkingDirectory(projectGroupId, aliasId) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE project_alias_mappings SET is_working_directory = 0, updated_at = ?
    WHERE project_group_id = ? AND deleted_at IS NULL
  `).run(now, projectGroupId);
  db.prepare(`
    UPDATE project_alias_mappings SET is_working_directory = 1, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL
  `).run(now, aliasId);
}

/**
 * Clear all is_working_directory flags for a project group.
 * @param {string} projectGroupId
 */
function clearWorkingDirectory(projectGroupId) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE project_alias_mappings SET is_working_directory = 0, updated_at = ?
    WHERE project_group_id = ? AND deleted_at IS NULL
  `).run(now, projectGroupId);
}

/**
 * Get the working directory path for a project group.
 * Only uses alias if is_working_directory=1, otherwise os.homedir().
 * @param {string} projectGroupId
 * @returns {string}
 */
function getWorkingDirectoryPath(projectGroupId) {
  // Check is_working_directory
  const wd = db.prepare(
    "SELECT path FROM project_alias_mappings WHERE project_group_id = ? AND is_working_directory = 1 AND deleted_at IS NULL LIMIT 1"
  ).get(projectGroupId);
  if (wd) return wd.path;

  // No working directory marked → use user home (same as default project group)
  return os.homedir();
}

/**
 * @deprecated Use getWorkingDirectoryPath instead
 */
function getDefaultPath(projectGroupId) {
  return getWorkingDirectoryPath(projectGroupId);
}

module.exports = {
  listByProjectGroup,
  getById,
  create,
  update,
  softDelete,
  deleteByProjectGroup,
  setWorkingDirectory,
  clearWorkingDirectory,
  getWorkingDirectoryPath,
  getDefaultPath,
};
