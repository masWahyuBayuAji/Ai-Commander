/**
 * OpenCode provider adapter
 *
 * Builds spawn command for running OpenCode CLI.
 * Supports both interactive (orchestrator) and non-interactive (task runner) modes.
 *
 * Verified CLI flags (opencode v1.18.5):
 * - Interactive: `opencode [--agent <name>]`
 * - Non-interactive: `opencode run --auto --agent <name> "prompt"`
 */

/**
 * Build spawn command for OpenCode CLI
 * @param {Object} options
 * @param {string} options.cwd - Working directory for the CLI
 * @param {string} options.initialPrompt - prompt/task detail yang dikirim ke opencode
 * @param {string} [options.agentName] - nama custom agent (opencode --agent <name>)
 * @param {boolean} options.interactive - If true, spawn interactive mode (for orchestrator)
 * @returns {{ command: string, args: string[] }} Command and arguments for node-pty
 */
function buildSpawnCommand({ cwd, initialPrompt, agentName, interactive }) {
  if (interactive) {
    // Orchestrator mode: opencode [--agent <name>]
    const args = [];
    if (agentName) {
      args.push('--agent', agentName);
    }
    return { command: 'opencode', args };
  }

  // Task runner mode: non-interactive, pakai custom agent per-task kalau ada
  const args = ['run', '--auto'];
  if (agentName) {
    args.push('--agent', agentName);
  }
  if (initialPrompt) {
    args.push(initialPrompt);
  }
  return { command: 'opencode', args };
}

/**
 * Get the initial prompt to send to OpenCode CLI
 * @param {string} prompt - The prompt content
 * @returns {string} Formatted prompt for OpenCode
 */
function formatInitialPrompt(prompt) {
  return prompt;
}

module.exports = {
  buildSpawnCommand,
  formatInitialPrompt,
};
