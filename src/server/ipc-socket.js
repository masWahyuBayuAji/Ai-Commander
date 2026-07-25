const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { validateAndTransition } = require('../core/kanban-state-machine');
const taskRepo = require('../db/repositories/task.repo');
const wsServer = require('./ws-server');

const IPC_DIR = path.join(os.homedir(), '.ai-commander');
const SOCKET_PATH = path.join(IPC_DIR, 'ipc.sock');
const SERVER_INFO_PATH = path.join(IPC_DIR, 'server.json');

let httpPort = null;

function startIpcServer(port) {
  httpPort = port;

  if (!fs.existsSync(IPC_DIR)) {
    fs.mkdirSync(IPC_DIR, { recursive: true });
  }

  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }

  const server = net.createServer((socket) => {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (!line) continue;

        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          socket.write(JSON.stringify({ error: 'Invalid JSON' }) + '\n');
          continue;
        }

        handleMessage(socket, msg);
      }
    });

    socket.on('error', (err) => {
      console.error('IPC socket error:', err.message);
    });
  });

  server.listen(SOCKET_PATH, () => {
    const serverInfo = {
      httpPort: port,
      socketPath: SOCKET_PATH,
      pid: process.pid,
    };
    fs.writeFileSync(SERVER_INFO_PATH, JSON.stringify(serverInfo, null, 2));
    console.log(`IPC socket listening on ${SOCKET_PATH}`);
  });

  server.on('error', (err) => {
    console.error('IPC server error:', err.message);
  });

  return server;
}

function handleMessage(socket, msg) {
  if (msg.type === 'transition') {
    handleTransition(socket, msg);
  } else {
    socket.write(JSON.stringify({ error: `Unknown message type: ${msg.type}` }) + '\n');
  }
}

function handleTransition(socket, msg) {
  const { projectGroupId, taskId, targetKanbanGroupId } = msg;

  const result = validateAndTransition(taskId, targetKanbanGroupId);

  if (!result.ok) {
    socket.write(JSON.stringify({ error: result.error }) + '\n');
    socket.end();
    return;
  }

  wsServer.broadcast('board', {
    type: 'task_updated',
    data: result.task,
  });

  socket.write(JSON.stringify({ ok: true }) + '\n');
}

function getSocketPath() {
  return SOCKET_PATH;
}

module.exports = { startIpcServer, getSocketPath };
