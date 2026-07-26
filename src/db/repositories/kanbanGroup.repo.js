const db = require('../connection');
const uuid = require('../../shared/uuid');

function listByProjectGroup(projectGroupId) {
  if (projectGroupId === null || projectGroupId === undefined) {
    return db.prepare(
      'SELECT * FROM kanban_groups WHERE project_group_id IS NULL AND deleted_at IS NULL ORDER BY position ASC'
    ).all();
  }
  return db.prepare(
    'SELECT * FROM kanban_groups WHERE project_group_id = ? AND deleted_at IS NULL ORDER BY position ASC'
  ).all(projectGroupId);
}

function getById(id) {
  return db.prepare('SELECT * FROM kanban_groups WHERE id = ?').get(id);
}

function create({ projectGroupId, name, slashCommand, position, isLockedTodo = 0, isLockedDone = 0, isLockedDelete = 0, nextStepGroupId = null, instruction = null }) {
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO kanban_groups (id, project_group_id, name, slash_command, position,
      is_locked_todo, is_locked_done, is_locked_delete, next_step_group_id, instruction, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectGroupId, name, slashCommand, position, isLockedTodo, isLockedDone, isLockedDelete, nextStepGroupId, instruction, now, now);
  return getById(id);
}

function update(id, { name, slashCommand, position, nextStepGroupId, instruction }) {
  const now = new Date().toISOString();
  const existing = getById(id);
  if (!existing) return null;

  db.prepare(`
    UPDATE kanban_groups SET name = ?, slash_command = ?, position = ?,
      next_step_group_id = ?, instruction = ?, updated_at = ?
    WHERE id = ?
  `).run(
    name ?? existing.name,
    slashCommand ?? existing.slash_command,
    position ?? existing.position,
    nextStepGroupId !== undefined ? nextStepGroupId : existing.next_step_group_id,
    instruction !== undefined ? instruction : existing.instruction,
    now,
    id
  );
  return getById(id);
}

function softDelete(id) {
  const existing = getById(id);
  if (!existing) {
    throw new Error('Kanban group not found');
  }
  if (existing.is_locked_todo === 1 || existing.is_locked_done === 1 || existing.is_locked_delete === 1) {
    throw new Error('Kanban group ini tidak boleh dihapus');
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE kanban_groups SET deleted_at = ? WHERE id = ?').run(now, id);
}

function createDefaultsForProjectGroup(projectGroupId) {
  const existing = listByProjectGroup(projectGroupId);
  if (existing.length > 0) {
    return [];
  }

  const todo = create({
    projectGroupId,
    name: 'TO-DO',
    slashCommand: '/to-do',
    position: 0,
    isLockedTodo: 1,
  });

  const done = create({
    projectGroupId,
    name: 'DONE',
    slashCommand: '/done',
    position: 2,
    isLockedDone: 1,
  });

  const onProgress = create({
    projectGroupId,
    name: 'ON PROGRESS',
    slashCommand: '/on-progress',
    position: 1,
    nextStepGroupId: done.id,
    isLockedDelete: 1,
  });

  return [todo, onProgress, done];
}

module.exports = { listByProjectGroup, getById, create, update, softDelete, createDefaultsForProjectGroup };