const { router } = require('../router');
const taskRepo = require('../../db/repositories/task.repo');
const kanbanGroupRepo = require('../../db/repositories/kanbanGroup.repo');
const wsServer = require('../ws-server');

// GET /api/tasks/deleted - List deleted tasks
router.get('/api/tasks/deleted', (req, res) => {
  const tasks = taskRepo.listDeleted();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: tasks }));
});

// POST /api/tasks/:id/restore - Restore deleted task ke TO-DO
router.post('/api/tasks/:id/restore', (req, res, { params }) => {
  const existing = taskRepo.getById(params.id);
  if (!existing) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Task not found' }));
    return;
  }

  if (!existing.deleted_at) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Task is not deleted' }));
    return;
  }

  // Find TO-DO kanban group for this task's project
  const kanbanGroups = kanbanGroupRepo.listByProjectGroup(existing.project_group_id);
  const todoGroup = kanbanGroups.find(g => g.is_locked_todo === 1);
  if (!todoGroup) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'TO-DO kanban group not found' }));
    return;
  }

  const restored = taskRepo.restore(params.id, todoGroup.id);

  wsServer.broadcast('board', { type: 'task_created', data: restored });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: restored }));
});

module.exports = router;
