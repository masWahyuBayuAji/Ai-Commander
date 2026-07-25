/**
 * OpenCode provider adapter
 *
 * Builds spawn command for running OpenCode CLI.
 * Supports both interactive (orchestrator) and non-interactive (task runner) modes.
 *
 * Verified CLI flags (opencode v1.18.5):
 * - Interactive: `opencode` (no flags)
 * - Interactive with system prompt: `opencode --system "Focus on security"`
 * - Non-interactive: `opencode run --auto "prompt"`
 */

/**
 * Build spawn command for OpenCode CLI
 * @param {Object} options
 * @param {string} options.cwd - Working directory for the CLI
 * @param {string} options.initialPrompt - Initial prompt to send to the CLI
 * @param {string} options.systemPrompt - System prompt for persistent instructions (orchestrator mode)
 * @param {boolean} options.interactive - If true, spawn interactive mode (for orchestrator)
 * @returns {{ command: string, args: string[] }} Command and arguments for node-pty
 */
function buildSpawnCommand({ cwd, initialPrompt, systemPrompt, interactive }) {
  if (interactive) {
    const args = [];
    if (systemPrompt) {
      args.push('--system', systemPrompt);
    }
    return { command: 'opencode', args };
  }

  // Task runner mode: non-interactive with run subcommand
  const args = ['run', '--auto'];
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
