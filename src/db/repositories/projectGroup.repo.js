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
  INSERT INTO project_groups (id, name, repo_path, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);
const updateStmt = db.prepare(`
  UPDATE project_groups SET name = ?, repo_path = ?, updated_at = ? WHERE id = ?
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

function create({ name, repoPath }) {
  const id = uuid();
  const now = new Date().toISOString();
  createStmt.run(id, name, repoPath, now, now);
  return getById(id);
}

function update(id, { name, repoPath }) {
  const now = new Date().toISOString();
  updateStmt.run(name, repoPath, now, id);
  return getById(id);
}

function softDelete(id) {
  const now = new Date().toISOString();
  softDeleteStmt.run(now, id);
}

module.exports = { list, getById, create, update, softDelete };