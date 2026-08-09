/**
 * Claude Code provider adapter
 *
 * Builds spawn command for running Claude Code CLI.
 * Supports both interactive (orchestrator) and task runner modes.
 *
 * Verified CLI flags (claude v2.1.216):
 * - Interactive: `claude --dangerously-skip-permissions`
 * - Interactive with system prompt: `claude --dangerously-skip-permissions --system-prompt "..."`
 * - Interactive with system prompt file: `claude --dangerously-skip-permissions --append-system-prompt-file <path>`
 * - Headless: tambah `--print` agar output ke stdout dan exit otomatis
 */

/**
 * Build spawn command for Claude Code CLI
 * @param {Object} options
 * @param {string} options.cwd - Working directory for the CLI
 * @param {string} options.initialPrompt - Initial prompt to send to the CLI
 * @param {string} options.systemPrompt - System prompt untuk mode interaktif (orchestrator)
 * @param {string} [options.systemPromptFilePath] - Path ke file system prompt (task runner)
 * @param {boolean} options.interactive - If true, spawn interactive mode (for orchestrator)
 * @param {string} [options.agentMode] - 'interactive' atau 'headless' (task runner only)
 * @returns {{ command: string, args: string[] }} Command and arguments for node-pty
 */
function buildSpawnCommand({ cwd, initialPrompt, systemPrompt, systemPromptFilePath, interactive, agentMode }) {
  if (interactive) {
    const args = ['--dangerously-skip-permissions'];
    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }
    return { command: 'claude', args };
  }

  // Task runner mode
  const args = ['--dangerously-skip-permissions'];

  // HEADLESS: tambah --print agar output ke stdout dan exit otomatis
  // INTERACTIVE: tanpa --print, AI bisa tanya balik ke user
  if (agentMode === 'headless') {
    args.push('--print');
  }

  args.push('--verbose');

  if (systemPromptFilePath) {
    args.push('--append-system-prompt-file', systemPromptFilePath);
  }
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
