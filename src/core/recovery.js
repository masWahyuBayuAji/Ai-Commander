/**
 * Recovery module for orphaned tasks
 * 
 * When the server restarts, any tasks that were running (session_status = 'running')
 * will be orphaned because the PTY processes are no longer available.
 * 
 * This module:
 * 1. Queries all tasks with session_status = 'running' from previous sessions
 * 2. Sets session_status = 'interrupted' for these tasks
 * 3. Adds task_events (type error) with a message explaining the situation
 * 4. Does NOT try to auto-resume old PTY processes (out of scope for phase 1)
 * 
 * This should be called during server startup, before opening HTTP listener.
 */

const db = require('../db/connection');
const uuid = require('../shared/uuid');

/**
 * Recover orphaned tasks from previous server sessions
 * Should be called during server startup
 * @returns {Object} Recovery result with count of recovered tasks
 */
function recoverOrphanedTasks() {
  // Find all tasks with session_status = 'running'
  const orphanedTasks = db.prepare(
    'SELECT * FROM tasks WHERE session_status = ?'
  ).all('running');

  if (orphanedTasks.length === 0) {
    return { recovered: 0, tasks: [] };
  }

  const now = new Date().toISOString();
  const recoveredTasks = [];

  // Update each orphaned task
  for (const task of orphanedTasks) {
    // Update task status to interrupted
    db.prepare(`
      UPDATE tasks 
      SET session_status = 'interrupted', 
          updated_at = ?
      WHERE id = ?
    `).run(now, task.id);

    // Add error event
    const eventId = uuid();
    db.prepare(`
      INSERT INTO task_events (id, task_id, type, content, created_at)
      VALUES (?, ?, 'error', ?, ?)
    `).run(
      eventId,
      task.id,
      'Server direstart, session sebelumnya terputus. Silakan mulai ulang task ini secara manual.',
      now
    );

    recoveredTasks.push({
      id: task.id,
      title: task.title,
      project_group_id: task.project_group_id,
      kanban_group_id: task.kanban_group_id,
    });
  }

  console.log(`[Recovery] Recovered ${orphanedTasks.length} orphaned task(s)`);
  
  return {
    recovered: orphanedTasks.length,
    tasks: recoveredTasks,
  };
}

module.exports = {
  recoverOrphanedTasks,
};
