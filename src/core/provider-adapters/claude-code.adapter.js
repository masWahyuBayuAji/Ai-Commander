/**
 * Claude Code provider adapter
 *
 * Builds spawn command for running Claude Code CLI.
 * Supports both interactive (orchestrator) and non-interactive (task runner) modes.
 *
 * Verified CLI flags (claude v2.1.216):
 * - Interactive: `claude --permission-mode bypassPermissions`
 * - Non-interactive: `claude --permission-mode bypassPermissions --print`
 */

/**
 * Build spawn command for Claude Code CLI
 * @param {Object} options
 * @param {string} options.cwd - Working directory for the CLI
 * @param {string} options.initialPrompt - Initial prompt to send to the CLI
 * @param {boolean} options.interactive - If true, spawn interactive mode (for orchestrator)
 * @returns {{ command: string, args: string[] }} Command and arguments for node-pty
 */
function buildSpawnCommand({ cwd, initialPrompt, interactive }) {
  if (interactive) {
    // Orchestrator mode: interactive terminal with bypass permissions
    return {
      command: 'claude',
      args: ['--permission-mode', 'bypassPermissions'],
    };
  }

  // Task runner mode: non-interactive with print flag
  const args = [
    '--permission-mode', 'bypassPermissions',
    '--print',
  ];
  if (initialPrompt) {
    args.push(initialPrompt);
  }
  return { command: 'claude', args };
}

/**
 * Get the initial prompt to send to Claude Code CLI
 * @param {string} prompt - The prompt content
 * @returns {string} Formatted prompt for Claude Code
 */
function formatInitialPrompt(prompt) {
  return prompt;
}

module.exports = {
  buildSpawnCommand,
  formatInitialPrompt,
};
