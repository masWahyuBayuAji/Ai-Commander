const pty = require('node-pty');
const os = require('node:os');
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

  // Detect if cwd is the user's home directory (no specific working dir configured)
  const isCwdHome = resolvedCwd === os.homedir();

  const systemPrompt = buildOrchestratorPrompt({ isCwdHome, provider: providerName });

  // For opencode: cleanup stale agent files from ALL project groups, then write new one
  let agentName = null;
  if (providerName === 'opencode') {
    // Cleanup stale orchestrator agent files in the resolved cwd
    const allPgsForCleanup = projectGroupRepo.list();
    for (const pg of allPgsForCleanup) {
      opencodeAgentFile.deleteOrchestratorAgentFile({
        cwd: resolvedCwd,
        projectGroupName: pg.name,
      });
    }

    let projectGroupName = 'default';
    if (projectGroupId) {
      const pg = projectGroupRepo.getById(projectGroupId);
      if (pg) {
        projectGroupName = pg.name;
      }
    } else {
      // Use first project group name or 'default'
      if (allPgsForCleanup.length > 0) {
        projectGroupName = allPgsForCleanup[0].name;
      }
    }
    agentName = opencodeAgentFile.getOrchestratorAgentName(projectGroupName);
    const agentFilePath = opencodeAgentFile.writeOrchestratorAgentFile({
      cwd: resolvedCwd,
      projectGroupName,
      instructions: systemPrompt,
    });
    console.log('[Orchestrator] OpenCode agent file written:', agentFilePath);
    console.log('[Orchestrator] Agent name:', agentName);
    console.log('[Orchestrator] CWD:', resolvedCwd);
    console.log('[Orchestrator] Prompt length:', systemPrompt.length, 'chars');
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
    // Cleanup ALL orchestrator agent files in the cwd
    const allPgs = projectGroupRepo.list();
    for (const pg of allPgs) {
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
