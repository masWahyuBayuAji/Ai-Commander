const { router } = require('../router');
const kanbanGroupRepo = require('../../db/repositories/kanbanGroup.repo');
const wsServer = require('../ws-server');

// GET /api/kanban-groups - List kanban groups
router.get('/api/kanban-groups', (req, res, { query }) => {
  let projectGroupId = query.project_group_id;
  if (projectGroupId === 'null' || projectGroupId === undefined || projectGroupId === '') {
    projectGroupId = null;
  }
  const groups = kanbanGroupRepo.listByProjectGroup(projectGroupId);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: groups }));
});

// POST /api/kanban-groups - Tambah kanban group
router.post('/api/kanban-groups', (req, res, { body }) => {
  if (!body || !body.name) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'name is required' }));
    return;
  }

  // Validate next_step_group_id if provided
  if (body.next_step_group_id) {
    const nextGroup = kanbanGroupRepo.getById(body.next_step_group_id);
    if (!nextGroup) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'next_step_group_id references an invalid kanban group' }));
      return;
    }
    // Must belong to same project group
    const pgId = body.project_group_id || null;
    if (nextGroup.project_group_id !== pgId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'next_step_group_id must belong to the same project group' }));
      return;
    }
  }

  // Get max position for this project group
  const existing = kanbanGroupRepo.listByProjectGroup(body.project_group_id || null);
  const maxPosition = existing.length > 0 ? Math.max(...existing.map(g => g.position)) : -1;

  const group = kanbanGroupRepo.create({
    projectGroupId: body.project_group_id || null,
    name: body.name,
    slashCommand: body.slash_command || `/${body.name.toLowerCase().replace(/\s+/g, '-')}`,
    position: body.position ?? maxPosition + 1,
    nextStepGroupId: body.next_step_group_id || null,
    instruction: body.instruction || null,
  });

  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: group }));

  wsServer.broadcast('board', { type: 'kanban_group_updated', data: group });
});

// PUT /api/kanban-groups/:id - Edit kanban group
router.put('/api/kanban-groups/:id', (req, res, { params, body }) => {
  const existing = kanbanGroupRepo.getById(params.id);
  if (!existing) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Kanban group not found' }));
    return;
  }

  // Validate next_step_group_id if provided
  if (body && body.next_step_group_id) {
    const nextGroup = kanbanGroupRepo.getById(body.next_step_group_id);
    if (!nextGroup) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'next_step_group_id references an invalid kanban group' }));
      return;
    }
    if (nextGroup.project_group_id !== existing.project_group_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'next_step_group_id must belong to the same project group' }));
      return;
    }
  }

  const updated = kanbanGroupRepo.update(params.id, {
    name: body?.name,
    slashCommand: body?.slash_command,
    position: body?.position,
    nextStepGroupId: body?.next_step_group_id !== undefined ? body.next_step_group_id : undefined,
    instruction: body?.instruction !== undefined ? body.instruction : undefined,
  });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: updated }));

  wsServer.broadcast('board', { type: 'kanban_group_updated', data: updated });
});

// DELETE /api/kanban-groups/:id - Hapus kanban group
router.delete('/api/kanban-groups/:id', (req, res, { params }) => {
  const existing = kanbanGroupRepo.getById(params.id);
  if (!existing) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Kanban group not found' }));
    return;
  }

  try {
    kanbanGroupRepo.softDelete(params.id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));

    wsServer.broadcast('board', { type: 'kanban_group_updated', data: { id: params.id, deleted: true } });
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

module.exports = router;
