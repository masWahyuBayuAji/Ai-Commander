const { router } = require('../router');
const settingsRepo = require('../../db/repositories/settings.repo');

// GET /api/settings - Ambil semua settings
router.get('/api/settings', (req, res) => {
  const settings = settingsRepo.getAllSettings();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: settings }));
});

// PUT /api/settings - Update settings
// Format: { key: value, key2: value2, ... } - merge dengan existing
router.put('/api/settings', (req, res, { body }) => {
  if (!body || typeof body !== 'object') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Body must be an object with key-value pairs' }));
    return;
  }

  for (const [key, value] of Object.entries(body)) {
    settingsRepo.setSetting(key, value);
  }

  const settings = settingsRepo.getAllSettings();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: settings }));
});

module.exports = router;
