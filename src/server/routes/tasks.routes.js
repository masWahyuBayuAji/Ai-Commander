const { router } = require('../router');
const taskRepo = require('../../db/repositories/task.repo');
const kanbanGroupRepo = require('../../db/repositories/kanbanGroup.repo');
const wsServer = require('../ws-server');
const { validateAndTransition } = require('../../core/kanban-state-machine');
const taskRunner = require('../../core/task-runner');

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

// POST /api/tasks/:id/start - Start task execution
// Based on ARCHITECTURE.md §6.1:
// 1. Move task from TO-DO to next_step_group_id of TO-DO (default: ON PROGRESS)
// 2. Broadcast board event
// 3. Call taskRunner.startTask(taskId) asynchronously
// 4. Return response immediately without waiting for task to finish
router.post('/api/tasks/:id/start', async (req, res, { params }) => {
  const task = taskRepo.getById(params.id);
  if (!task) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Task not found' }));
    return;
  }

  // Check if task is already running
  if (task.session_status === 'running') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Task is already running' }));
    return;
  }

  // Find TO-DO kanban group for this task's project
  const kanbanGroups = kanbanGroupRepo.listByProjectGroup(task.project_group_id);
  const todoGroup = kanbanGroups.find(g => g.is_locked_todo === 1);
  
  if (!todoGroup) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'TO-DO kanban group not found' }));
    return;
  }

  // Check if task is currently in TO-DO
  if (task.kanban_group_id !== todoGroup.id) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Task must be in TO-DO to start' }));
    return;
  }

  // Get next step from TO-DO group (default: ON PROGRESS)
  const nextStepGroupId = todoGroup.next_step_group_id;
  if (!nextStepGroupId) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'TO-DO group has no next step defined' }));
    return;
  }

  // Transition task from TO-DO to next step (ON PROGRESS)
  const transitionResult = validateAndTransition(params.id, nextStepGroupId);
  if (!transitionResult.ok) {
    res.writeHead(transitionResult.status || 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: transitionResult.error }));
    return;
  }

  // Broadcast board update
  wsServer.broadcast('board', { type: 'task_updated', data: transitionResult.task });

  // Start task asynchronously (don't wait for completion)
  taskRunner.startTask(params.id).catch(err => {
    console.error(`[TaskRunner] Error starting task ${params.id}:`, err);
  });

  // Return immediately with status 'starting'
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, status: 'starting' }));
});

// GET /api/tasks/:id/events - Get task log events for progress view
router.get('/api/tasks/:id/events', (req, res, { params }) => {
  const task = taskRepo.getById(params.id);
  if (!task) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Task not found' }));
    return;
  }

  const events = taskRepo.getEventsByTaskId(params.id);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: events }));
});

module.exports = router;
