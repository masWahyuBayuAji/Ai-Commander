const pty = require('node-pty');
const { getAdapter } = require('./provider-adapters');
const wsServer = require('../server/ws-server');

let orchestratorProcess = null;

function start(providerName, cwd) {
  if (orchestratorProcess) {
    return { ok: false, error: 'Orchestrator already running' };
  }

  const adapter = getAdapter(providerName);
  if (!adapter) {
    return { ok: false, error: 'Unknown provider: ' + providerName };
  }

  const { command, args } = adapter.buildSpawnCommand({ cwd: cwd || process.cwd() });

  try {
    orchestratorProcess = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: cwd || process.cwd(),
      env: process.env
    });

    orchestratorProcess.onData(function(data) {
      wsServer.broadcast('orchestrator', { content: data });
    });

    orchestratorProcess.onExit(function() {
      orchestratorProcess = null;
      wsServer.broadcast('orchestrator', { content: '\n[Orchestrator process exited]\n' });
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function sendInput(text) {
  if (!orchestratorProcess) {
    return { ok: false, error: 'Orchestrator not running' };
  }

  orchestratorProcess.write(text + '\n');
  return { ok: true };
}

function isRunning() {
  return orchestratorProcess !== null;
}

module.exports = { start, sendInput, isRunning };
