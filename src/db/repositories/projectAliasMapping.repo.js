const db = require('../connection');
const uuid = require('../../shared/uuid');

function listByProjectGroup(projectGroupId) {
  return db.prepare(
    'SELECT * FROM project_alias_mappings WHERE project_group_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
  ).all(projectGroupId);
}

function getById(id) {
  return db.prepare('SELECT * FROM project_alias_mappings WHERE id = ?').get(id);
}

function create({ projectGroupId, name, path }) {
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO project_alias_mappings (id, project_group_id, name, path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, projectGroupId, name, path, now, now);
  return getById(id);
}

function update(id, { name, path }) {
  const now = new Date().toISOString();
  const existing = getById(id);
  if (!existing) return null;
  db.prepare(`
    UPDATE project_alias_mappings SET name = ?, path = ?, updated_at = ? WHERE id = ?
  `).run(name ?? existing.name, path ?? existing.path, now, id);
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

function getDefaultPath(projectGroupId) {
  const alias = db.prepare(
    "SELECT path FROM project_alias_mappings WHERE project_group_id = ? AND name = 'default' AND deleted_at IS NULL"
  ).get(projectGroupId);
  if (alias) return alias.path;

  // Fallback: get first alias
  const first = db.prepare(
    'SELECT path FROM project_alias_mappings WHERE project_group_id = ? AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1'
  ).get(projectGroupId);
  return first ? first.path : null;
}

module.exports = { listByProjectGroup, getById, create, update, softDelete, deleteByProjectGroup, getDefaultPath };
