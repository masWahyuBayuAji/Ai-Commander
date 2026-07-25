const { router } = require('../router');
const taskRepo = require('../../db/repositories/task.repo');
const kanbanGroupRepo = require('../../db/repositories/kanbanGroup.repo');
const wsServer = require('../ws-server');
const { validateAndTransition } = require('../../core/kanban-state-machine');

// GET /api/tasks - List tasks
router.get('/api/tasks', (req, res, { query }) => {
  let { project_group_id, kanban_group_id } = query;

  if (project_group_id === 'null' || project_group_id === undefined || project_group_id === '') {
    project_group_id = null;
  }
  if (kanban_group_id === 'null' || kanban_group_id === undefined || kanban_group_id === '') {
    kanban_group_id = null;
  }

  let tasks;
  if (kanban_group_id) {
    tasks = taskRepo.listByKanbanGroup(kanban_group_id);
  } else {
    tasks = taskRepo.listByProjectGroup(project_group_id);
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: tasks }));
});

// POST /api/tasks - Buat task baru
router.post('/api/tasks', (req, res, { body }) => {
  if (!body || !body.detail || !body.aiProvider) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'detail and aiProvider are required' }));
    return;
  }

  const projectGroupId = body.projectGroupId || null;

  // Find TO-DO kanban group for this project
  const kanbanGroups = kanbanGroupRepo.listByProjectGroup(projectGroupId);
  const todoGroup = kanbanGroups.find(g => g.is_locked_todo === 1);
  if (!todoGroup) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'TO-DO kanban group not found' }));
    return;
  }

  const task = taskRepo.create({
    projectGroupId,
    kanbanGroupId: todoGroup.id,
    title: body.title || body.detail.slice(0, 50),
    detail: body.detail,
    aiProvider: body.aiProvider,
  });

  wsServer.broadcast('board', { type: 'task_created', data: task });

  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: task }));
});

// PUT /api/tasks/:id - Edit task
router.put('/api/tasks/:id', (req, res, { params, body }) => {
  const existing = taskRepo.getById(params.id);
  if (!existing) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Task not found' }));
    return;
  }

  if (!body) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Body is required' }));
    return;
  }

  const updated = taskRepo.update(params.id, {
    detail: body.detail,
    aiProvider: body.aiProvider,
    title: body.title,
  });

  wsServer.broadcast('board', { type: 'task_updated', data: updated });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: updated }));
});

// DELETE /api/tasks/:id - Soft delete task
router.delete('/api/tasks/:id', (req, res, { params }) => {
  const existing = taskRepo.getById(params.id);
  if (!existing) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Task not found' }));
    return;
  }

  taskRepo.softDelete(params.id);

  wsServer.broadcast('board', { type: 'task_deleted', data: { id: params.id } });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
});

// POST /api/tasks/:id/transition - Pindah kanban group
router.post('/api/tasks/:id/transition', (req, res, { params, body }) => {
  if (!body || !body.targetKanbanGroupId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'targetKanbanGroupId is required' }));
    return;
  }

  const result = validateAndTransition(params.id, body.targetKanbanGroupId);

  if (!result.ok) {
    res.writeHead(result.status || 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: result.error }));
    return;
  }

  wsServer.broadcast('board', { type: 'task_updated', data: result.task });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, data: result.task }));
});

module.exports = router;
