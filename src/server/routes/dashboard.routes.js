const { router } = require('../router');
const tokenUsageRepo = require('../../db/repositories/tokenUsage.repo');
const kanbanGroupRepo = require('../../db/repositories/kanbanGroup.repo');
const projectGroupRepo = require('../../db/repositories/projectGroup.repo');

// GET /api/dashboard/summary - Dashboard summary per project group
router.get('/api/dashboard/summary', (req, res) => {
  const tokenUsage = tokenUsageRepo.sumByProjectGroup();

  const globalGroups = kanbanGroupRepo.listByProjectGroup(null);
  const doneGroup = globalGroups.find(g => g.is_locked_done === 1);

  let doneCount = [];
  if (doneGroup) {
    doneCount = tokenUsageRepo.countDoneByProjectGroup(doneGroup.id);
  }

  const projectGroups = projectGroupRepo.list();
  const summary = projectGroups.map(pg => {
    const tokenRow = tokenUsage.find(t => t.projectGroupId === pg.id);
    const doneRow = doneCount.find(d => d.projectGroupId === pg.id);
    return {
      projectGroupId: pg.id,
      projectGroupName: pg.name,
      totalTokensK: tokenRow ? tokenRow.totalTokensK : 0,
      totalDone: doneRow ? doneRow.totalDone : 0
    };
  });

  const globalToken = tokenUsage.find(t => !t.projectGroupId);
  const globalDone = doneCount.find(d => !d.projectGroupId);
  if (globalToken || globalDone) {
    summary.unshift({
      projectGroupId: null,
      projectGroupName: 'Global',
      totalTokensK: globalToken ? globalToken.totalTokensK : 0,
      totalDone: globalDone ? globalDone.totalDone : 0
    });
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: summary }));
});

module.exports = router;
