const pty = require('node-pty');
const { getAdapter } = require('./provider-adapters');
const wsServer = require('../server/ws-server');
const { buildOrchestratorPrompt } = require('./orchestrator-prompt-builder');
const opencodeAgentFile = require('./opencode-agent-file');
const projectGroupRepo = require('../db/repositories/projectGroup.repo');

let orchestratorProcess = null;
let currentProvider = null;
let orchestratorCwd = null;
let orchestratorProjectGroupId = null;

/**
 * Start orchestrator
 * @param {string} providerName - 'claude-code' or 'opencode'
 * @param {Object} [options]
 * @param {string} [options.cwd] - working directory
 * @param {string} [options.projectGroupId] - project group ID for context
 */
function start(providerName, options) {
  if (orchestratorProcess) {
    return { ok: false, error: 'Orchestrator already running' };
  }

  const adapter = getAdapter(providerName);
  if (!adapter) {
    return { ok: false, error: 'Unknown provider: ' + providerName };
  }

  const { cwd, projectGroupId } = options || {};
  const resolvedCwd = cwd || process.cwd();
  const systemPrompt = buildOrchestratorPrompt();

  // For opencode: write orchestrator agent file
  let agentName = null;
  if (providerName === 'opencode') {
    let projectGroupName = 'default';
    if (projectGroupId) {
      const pg = projectGroupRepo.getById(projectGroupId);
      if (pg) {
        projectGroupName = pg.name;
      }
    } else {
      // Use first project group name or 'default'
      const allPgs = projectGroupRepo.list();
      if (allPgs.length > 0) {
        projectGroupName = allPgs[0].name;
      }
    }
    agentName = opencodeAgentFile.getOrchestratorAgentName(projectGroupName);
    opencodeAgentFile.writeOrchestratorAgentFile({
      cwd: resolvedCwd,
      projectGroupName,
      instructions: systemPrompt,
    });
  }

  const { command, args } = adapter.buildSpawnCommand({
    cwd: resolvedCwd,
    interactive: true,
    systemPrompt,
    agentName,
  });

  try {
    console.log('Spawning:', command, args, 'cwd:', resolvedCwd);
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
      cwd: resolvedCwd,
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
      cleanupOrchestrator();
    });

    currentProvider = providerName;
    orchestratorCwd = resolvedCwd;
    orchestratorProjectGroupId = projectGroupId || null;

    return { ok: true };
  } catch (e) {
    console.error('Orchestrator start error:', e);
    // Cleanup agent file on error
    cleanupOrchestratorAgentFile();
    return { ok: false, error: e.message };
  }
}

/**
 * Cleanup orchestrator agent file for opencode
 */
function cleanupOrchestratorAgentFile() {
  if (currentProvider === 'opencode' && orchestratorCwd) {
    // Try to find and delete the agent file
    const allPgs = projectGroupRepo.list();
    const pgs = orchestratorProjectGroupId
      ? allPgs.filter(pg => pg.id === orchestratorProjectGroupId)
      : allPgs.length > 0 ? [allPgs[0]] : [];
    for (const pg of pgs) {
      opencodeAgentFile.deleteOrchestratorAgentFile({
        cwd: orchestratorCwd,
        projectGroupName: pg.name,
      });
    }
  }
}

/**
 * Cleanup orchestrator state
 */
function cleanupOrchestrator() {
  cleanupOrchestratorAgentFile();
  orchestratorProcess = null;
  currentProvider = null;
  orchestratorCwd = null;
  orchestratorProjectGroupId = null;
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
    cleanupOrchestrator();
    return { ok: true };
  } catch (e) {
    console.error('Orchestrator stop error:', e);
    cleanupOrchestrator();
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
