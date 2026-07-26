const { router } = require('../router');
const projectGroupRepo = require('../../db/repositories/projectGroup.repo');
const projectAliasMappingRepo = require('../../db/repositories/projectAliasMapping.repo');
const fs = require('node:fs');

// GET /api/project-groups - List project groups (with aliases)
router.get('/api/project-groups', (req, res, { query }) => {
  const includeDeleted = query.includeDeleted === 'true';
  const groups = projectGroupRepo.list({ includeDeleted });

  // Attach aliases to each group
  const result = groups.map(function(pg) {
    const aliases = projectAliasMappingRepo.listByProjectGroup(pg.id);
    return { ...pg, aliases };
  });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: result }));
});

// POST /api/project-groups - Create project group with aliases
router.post('/api/project-groups', (req, res, { body }) => {
  if (!body || !body.name) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'name is required' }));
    return;
  }

  const useAliasMapping = body.useAliasMapping ? 1 : 0;

  // Create the project group
  const group = projectGroupRepo.create({
    name: body.name,
    useAliasMapping: useAliasMapping,
  });

  // Create alias mappings
  if (useAliasMapping && body.aliases && Array.isArray(body.aliases)) {
    for (const alias of body.aliases) {
      if (alias.name && alias.path) {
        projectAliasMappingRepo.create({
          projectGroupId: group.id,
          name: alias.name,
          path: alias.path,
        });
      }
    }
  } else if (!useAliasMapping && body.path) {
    // Auto-create default alias when not using alias mapping
    projectAliasMappingRepo.create({
      projectGroupId: group.id,
      name: 'default',
      path: body.path,
    });
  }

  // Check path warnings
  const warnings = [];
  const aliases = projectAliasMappingRepo.listByProjectGroup(group.id);
  for (const alias of aliases) {
    if (!fs.existsSync(alias.path)) {
      warnings.push('Path tidak ditemukan: ' + alias.path);
    }
  }

  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: { ...group, aliases }, warnings: warnings.length > 0 ? warnings : null }));
});

// PUT /api/project-groups/:id - Edit project group with aliases
router.put('/api/project-groups/:id', (req, res, { params, body }) => {
  const existing = projectGroupRepo.getById(params.id);
  if (!existing) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Project group not found' }));
    return;
  }

  if (!body || !body.name) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'name is required' }));
    return;
  }

  const useAliasMapping = body.useAliasMapping !== undefined ? (body.useAliasMapping ? 1 : 0) : existing.use_alias_mapping;

  // Update the project group
  const updated = projectGroupRepo.update(params.id, {
    name: body.name,
    useAliasMapping: useAliasMapping,
  });

  // Update alias mappings: delete old ones and create new ones
  projectAliasMappingRepo.deleteByProjectGroup(params.id);

  if (useAliasMapping && body.aliases && Array.isArray(body.aliases)) {
    for (const alias of body.aliases) {
      if (alias.name && alias.path) {
        projectAliasMappingRepo.create({
          projectGroupId: params.id,
          name: alias.name,
          path: alias.path,
        });
      }
    }
  } else if (!useAliasMapping && body.path) {
    projectAliasMappingRepo.create({
      projectGroupId: params.id,
      name: 'default',
      path: body.path,
    });
  }

  const aliases = projectAliasMappingRepo.listByProjectGroup(params.id);

  // Check path warnings
  const warnings = [];
  for (const alias of aliases) {
    if (!fs.existsSync(alias.path)) {
      warnings.push('Path tidak ditemukan: ' + alias.path);
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: { ...updated, aliases }, warnings: warnings.length > 0 ? warnings : null }));
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
