const db = require('../connection');
const uuid = require('../../shared/uuid');

const listStmt = db.prepare(
  'SELECT * FROM project_groups WHERE deleted_at IS NULL ORDER BY created_at ASC'
);
const listAllStmt = db.prepare(
  'SELECT * FROM project_groups ORDER BY created_at ASC'
);
const getByIdStmt = db.prepare(
  'SELECT * FROM project_groups WHERE id = ?'
);
const createStmt = db.prepare(`
  INSERT INTO project_groups (id, name, use_alias_mapping, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);
const updateStmt = db.prepare(`
  UPDATE project_groups SET name = ?, use_alias_mapping = ?, updated_at = ? WHERE id = ?
`);
const softDeleteStmt = db.prepare(
  'UPDATE project_groups SET deleted_at = ? WHERE id = ?'
);

function list({ includeDeleted = false } = {}) {
  return includeDeleted ? listAllStmt.all() : listStmt.all();
}

function getById(id) {
  return getByIdStmt.get(id);
}

function create({ name, useAliasMapping = 0 }) {
  const id = uuid();
  const now = new Date().toISOString();
  createStmt.run(id, name, useAliasMapping ? 1 : 0, now, now);
  return getById(id);
}

function update(id, { name, useAliasMapping }) {
  const now = new Date().toISOString();
  const existing = getById(id);
  if (!existing) return null;
  updateStmt.run(
    name ?? existing.name,
    useAliasMapping !== undefined ? (useAliasMapping ? 1 : 0) : existing.use_alias_mapping,
    now,
    id
  );
  return getById(id);
}

function softDelete(id) {
  const now = new Date().toISOString();
  softDeleteStmt.run(now, id);
}

module.exports = { list, getById, create, update, softDelete };
