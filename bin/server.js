#!/usr/bin/env node

const { createServer } = require('../src/server/http-server');
const { startIpcServer } = require('../src/server/ipc-socket');

const PORT = process.env.PORT || 4321;

const server = createServer(PORT);
server.listen(PORT, () => {
  console.log(`ai-commander server running at http://localhost:${PORT}`);
  startIpcServer(PORT);
});
