const { router } = require('../router');
const projectGroupRepo = require('../../db/repositories/projectGroup.repo');
const fs = require('node:fs');

// GET /api/project-groups - List project groups
router.get('/api/project-groups', (req, res, { query }) => {
  const includeDeleted = query.includeDeleted === 'true';
  const groups = projectGroupRepo.list({ includeDeleted });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: groups }));
});

// POST /api/project-groups - Buat project group baru
router.post('/api/project-groups', (req, res, { body }) => {
  if (!body || !body.name || !body.repoPath) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'name and repoPath are required' }));
    return;
  }

  const group = projectGroupRepo.create({ name: body.name, repoPath: body.repoPath });

  let warning = null;
  if (!fs.existsSync(body.repoPath)) {
    warning = 'Path tidak ditemukan';
  }

  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: group, warning }));
});

// PUT /api/project-groups/:id - Edit project group
router.put('/api/project-groups/:id', (req, res, { params, body }) => {
  const existing = projectGroupRepo.getById(params.id);
  if (!existing) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Project group not found' }));
    return;
  }

  if (!body || !body.name || !body.repoPath) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'name and repoPath are required' }));
    return;
  }

  const updated = projectGroupRepo.update(params.id, { name: body.name, repoPath: body.repoPath });

  let warning = null;
  if (!fs.existsSync(body.repoPath)) {
    warning = 'Path tidak ditemukan';
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: updated, warning }));
});

// DELETE /api/project-groups/:id - Soft delete project group
router.delete('/api/project-groups/:id', (req, res, { params }) => {
  const existing = projectGroupRepo.getById(params.id);
  if (!existing) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Project group not found' }));
    return;
  }

  projectGroupRepo.softDelete(params.id);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
});

module.exports = router;
