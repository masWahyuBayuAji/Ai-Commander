const { router } = require('../router');
const orchestratorRunner = require('../../core/orchestrator-runner');

// POST /api/orchestrator/start - Start orchestrator PTY
router.post('/api/orchestrator/start', (req, res, { body }) => {
  const provider = (body && body.provider) || 'claude-code';
  const result = orchestratorRunner.start(provider);
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

// GET /api/orchestrator/status - Check orchestrator status
router.get('/api/orchestrator/status', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ running: orchestratorRunner.isRunning() }));
});

module.exports = router;
