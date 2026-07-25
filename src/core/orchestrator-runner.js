const pty = require('node-pty');
const { getAdapter } = require('./provider-adapters');
const wsServer = require('../server/ws-server');

let orchestratorProcess = null;
let currentProvider = null;

function start(providerName, cwd) {
  if (orchestratorProcess) {
    return { ok: false, error: 'Orchestrator already running' };
  }

  const adapter = getAdapter(providerName);
  if (!adapter) {
    return { ok: false, error: 'Unknown provider: ' + providerName };
  }

  const { command, args } = adapter.buildSpawnCommand({
    cwd: cwd || process.cwd(),
    interactive: true,
  });

  try {
    console.log('Spawning:', command, args, 'cwd:', cwd || process.cwd());
    const spawnEnv = Object.assign({}, process.env);
    // Ensure PATH includes common locations for opencode/claude
    if (!spawnEnv.PATH) {
      spawnEnv.PATH = '/usr/local/bin:/usr/bin:/bin';
    }
    // Add user's local paths if HOME is set
    if (spawnEnv.HOME) {
      const userPaths = [
        spawnEnv.HOME + '/.opencode/bin',
        spawnEnv.HOME + '/.local/bin',
        spawnEnv.HOME + '/.nvm/versions/node/*/bin',
      ];
      spawnEnv.PATH = userPaths.join(':') + ':' + spawnEnv.PATH;
    }

    orchestratorProcess = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: cwd || process.cwd(),
      env: spawnEnv
    });

    orchestratorProcess.onData(function(data) {
      wsServer.broadcast('orchestrator', { content: data });
    });

    orchestratorProcess.onExit(function(code) {
      const exitCode = typeof code === 'object' ? (code.exitCode !== undefined ? code.exitCode : code.code) : code;
      const signal = typeof code === 'object' ? (code.signal || '') : '';
      console.log('Orchestrator process exited:', { exitCode, signal });
      wsServer.broadcast('orchestrator', { content: '\r\n[Orchestrator process exited, code: ' + exitCode + (signal ? ' signal: ' + signal : '') + ']\r\n' });
      orchestratorProcess = null;
      currentProvider = null;
    });

    currentProvider = providerName;
    return { ok: true };
  } catch (e) {
    console.error('Orchestrator start error:', e);
    return { ok: false, error: e.message };
  }
}

function sendInput(text) {
  if (!orchestratorProcess) {
    return { ok: false, error: 'Orchestrator not running' };
  }

  try {
    orchestratorProcess.write(text);
    return { ok: true };
  } catch (e) {
    console.error('Orchestrator sendInput error:', e);
    return { ok: false, error: e.message };
  }
}

function stop() {
  if (!orchestratorProcess) {
    return { ok: false, error: 'Orchestrator not running' };
  }

  try {
    orchestratorProcess.kill();
    orchestratorProcess = null;
    currentProvider = null;
    return { ok: true };
  } catch (e) {
    console.error('Orchestrator stop error:', e);
    orchestratorProcess = null;
    currentProvider = null;
    return { ok: false, error: e.message };
  }
}

function isRunning() {
  return orchestratorProcess !== null;
}

function getProvider() {
  return currentProvider;
}

function resize(cols, rows) {
  if (!orchestratorProcess) {
    return { ok: false, error: 'Orchestrator not running' };
  }

  try {
    orchestratorProcess.resize(cols, rows);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { start, stop, sendInput, isRunning, getProvider, resize };
