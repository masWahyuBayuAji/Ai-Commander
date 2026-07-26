const { router } = require('../router');
const projectAliasMappingRepo = require('../../db/repositories/projectAliasMapping.repo');

// GET /api/project-alias-mappings - List aliases for a project group
router.get('/api/project-alias-mappings', (req, res, { query }) => {
  const projectGroupId = query.project_group_id;
  if (!projectGroupId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'project_group_id is required' }));
    return;
  }

  const aliases = projectAliasMappingRepo.listByProjectGroup(projectGroupId);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: aliases }));
});

module.exports = router;
