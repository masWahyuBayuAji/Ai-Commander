const db = require('../connection');
const generateShortId = require('../../shared/short-id');

function listByKanbanGroup(kanbanGroupId) {
  return db.prepare(
    'SELECT * FROM tasks WHERE kanban_group_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
  ).all(kanbanGroupId);
}

function listByProjectGroup(projectGroupId, { includeDeleted = false } = {}) {
  if (projectGroupId === null || projectGroupId === undefined) {
    return includeDeleted
      ? db.prepare('SELECT * FROM tasks ORDER BY created_at ASC').all()
      : db.prepare('SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY created_at ASC').all();
  }
  return includeDeleted
    ? db.prepare('SELECT * FROM tasks WHERE project_group_id = ? ORDER BY created_at ASC').all(projectGroupId)
    : db.prepare('SELECT * FROM tasks WHERE project_group_id = ? AND deleted_at IS NULL ORDER BY created_at ASC').all(projectGroupId);
}

function getById(id) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

function generateUniqueId() {
  let id;
  let attempts = 0;
  do {
    id = generateShortId();
    attempts++;
    if (attempts > 10) throw new Error('Failed to generate unique task id after 10 attempts');
  } while (db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(id));
  return id;
}

function create({ projectGroupId, kanbanGroupId, title, detail, aiProvider }) {
  const id = generateUniqueId();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks (id, project_group_id, kanban_group_id, title, detail, ai_provider, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectGroupId, kanbanGroupId, title, detail, aiProvider, now, now);
  return getById(id);
}

function update(id, fields) {
  const existing = getById(id);
  if (!existing) return null;

  const allowedFields = ['title', 'detail', 'ai_provider', 'session_pid', 'session_status', 'started_at', 'finished_at'];
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(fields)) {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return existing;

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return getById(id);
}

function updateKanbanGroup(id, newKanbanGroupId) {
  const existing = getById(id);
  if (!existing) throw new Error('Task not found');

  const now = new Date().toISOString();
  db.prepare('UPDATE tasks SET kanban_group_id = ?, updated_at = ? WHERE id = ?').run(newKanbanGroupId, now, id);

  const eventId = generateShortId();
  db.prepare(`
    INSERT INTO task_events (id, task_id, type, content, created_at)
    VALUES (?, ?, 'stage_change', ?, ?)
  `).run(eventId, id, JSON.stringify({ from: existing.kanban_group_id, to: newKanbanGroupId }), now);

  return getById(id);
}

function softDelete(id) {
  const now = new Date().toISOString();
  db.prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
}

function restore(id, todoKanbanGroupId) {
  const now = new Date().toISOString();
  db.prepare('UPDATE tasks SET deleted_at = NULL, kanban_group_id = ?, updated_at = ? WHERE id = ?').run(todoKanbanGroupId, now, id);
  return getById(id);
}

function listDeleted() {
  return db.prepare('SELECT * FROM tasks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all();
}

function getEventsByTaskId(taskId) {
  return db.prepare(
    "SELECT * FROM task_events WHERE task_id = ? AND type = 'log' ORDER BY created_at ASC"
  ).all(taskId);
}

module.exports = { listByKanbanGroup, listByProjectGroup, getById, create, update, updateKanbanGroup, softDelete, restore, listDeleted, getEventsByTaskId };