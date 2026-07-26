const { router } = require('../router');
const orchestratorRunner = require('../../core/orchestrator-runner');
const taskRepo = require('../../db/repositories/task.repo');
const kanbanGroupRepo = require('../../db/repositories/kanbanGroup.repo');
const projectGroupRepo = require('../../db/repositories/projectGroup.repo');
const projectAliasMappingRepo = require('../../db/repositories/projectAliasMapping.repo');
const wsServer = require('../ws-server');

// POST /api/orchestrator/start - Start orchestrator PTY
router.post('/api/orchestrator/start', (req, res, { body }) => {
  const provider = (body && body.provider) || 'claude-code';
  const projectGroupId = (body && body.projectGroupId) || null;

  // Resolve cwd: use project group's alias mapping, or default to process.cwd()
  let cwd = null;
  if (projectGroupId) {
    const pg = projectGroupRepo.getById(projectGroupId);
    if (pg) {
      const aliasPath = projectAliasMappingRepo.getDefaultPath(pg.id);
      cwd = aliasPath || process.cwd();
    }
  }
  if (!cwd) {
    // fallback: use first project group with alias, or process.cwd()
    const allPgs = projectGroupRepo.list();
    for (const p of allPgs) {
      const aliasPath = projectAliasMappingRepo.getDefaultPath(p.id);
      if (aliasPath) { cwd = aliasPath; break; }
    }
    if (!cwd) cwd = process.cwd();
  }

  const result = orchestratorRunner.start(provider, { cwd, projectGroupId });
  res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
});

// POST /api/orchestrator/input - Send input to orchestrator PTY
router.post('/api/orchestrator/input', (req, res, { body }) => {
  if (!body || !body.text) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'text is required' }));
    return;
  }

  const result = orchestratorRunner.sendInput(body.text);
  res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
});

// POST /api/orchestrator/stop - Stop orchestrator PTY
router.post('/api/orchestrator/stop', (req, res) => {
  const result = orchestratorRunner.stop();
  res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
});

// GET /api/orchestrator/status - Check orchestrator status
router.get('/api/orchestrator/status', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    running: orchestratorRunner.isRunning(),
    provider: orchestratorRunner.getProvider(),
  }));
});

// POST /api/orchestrator/resize - Resize orchestrator PTY
router.post('/api/orchestrator/resize', (req, res, { body }) => {
  if (!body || !body.cols || !body.rows) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'cols and rows are required' }));
    return;
  }

  const result = orchestratorRunner.resize(body.cols, body.rows);
  res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
});

// POST /api/orchestrator/create-tasks - Buat task baru dari orchestrator
router.post('/api/orchestrator/create-tasks', (req, res, { body }) => {
  if (!body || !body.tasks || !Array.isArray(body.tasks) || body.tasks.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'tasks array is required' }));
    return;
  }

  const created = [];
  const errors = [];

  for (let i = 0; i < body.tasks.length; i++) {
    const t = body.tasks[i];
    if (!t.detail) {
      errors.push({ index: i, error: 'detail is required' });
      continue;
    }

    const projectGroupId = t.projectGroupId || null;
    const aiProvider = t.aiProvider || 'opencode';

    // Find TO-DO kanban group
    const kanbanGroups = kanbanGroupRepo.listByProjectGroup(projectGroupId);
    const todoGroup = kanbanGroups.find(g => g.is_locked_todo === 1);
    if (!todoGroup) {
      errors.push({ index: i, error: 'TO-DO kanban group not found for project: ' + projectGroupId });
      continue;
    }

    const task = taskRepo.create({
      projectGroupId,
      kanbanGroupId: todoGroup.id,
      title: t.title || t.detail.slice(0, 50),
      detail: t.detail,
      aiProvider,
    });

    wsServer.broadcast('board', { type: 'task_created', data: task });
    created.push(task);
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, created, errors }));
});

// GET /api/orchestrator/context - Ambil context untuk orchestrator prompt
router.get('/api/orchestrator/context', (req, res) => {
  const projectGroups = projectGroupRepo.list();

  const groups = projectGroups.map(pg => {
    const kanbanGroups = kanbanGroupRepo.listByProjectGroup(pg.id);
    const aliases = projectAliasMappingRepo.listByProjectGroup(pg.id);
    return {
      id: pg.id,
      name: pg.name,
      repoPath: aliases.length > 0 ? aliases[0].path : process.cwd(),
      aliases: aliases.map(a => ({ name: a.name, path: a.path })),
      kanbanGroups: kanbanGroups.map(kg => ({
        id: kg.id,
        name: kg.name,
        slashCommand: kg.slash_command,
        nextStepGroupId: kg.next_step_group_id,
        instruction: kg.instruction,
        isLockedTodo: kg.is_locked_todo === 1,
        isLockedDone: kg.is_locked_done === 1,
      })),
    };
  });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    projectGroups: groups,
  }));
});

module.exports = router;
