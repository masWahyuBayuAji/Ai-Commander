/**
 * Claude Code provider adapter
 * 
 * Builds spawn command for running Claude Code CLI in non-interactive mode.
 * 
 * IMPORTANT: The --permission-mode bypassPermissions flag is based on
 * ARCHITECTURE.md documentation. This should be verified against the actual
 * Claude Code CLI documentation as flags may change between versions.
 * 
 * TODO: Verify official CLI flags for Claude Code bypass-permission mode
 */

/**
 * Build spawn command for Claude Code CLI
 * @param {Object} options
 * @param {string} options.cwd - Working directory for the CLI
 * @param {string} options.initialPrompt - Initial prompt to send to the CLI
 * @returns {{ command: string, args: string[] }} Command and arguments for node-pty
 */
function buildSpawnCommand({ cwd, initialPrompt }) {
  // TODO: verifikasi flag CLI resmi Claude Code
  // Flag berdasarkan ARCHITECTURE.md: --permission-mode bypassPermissions
  const args = [
    '--permission-mode', 'bypassPermissions',
    '--print',  // Non-interactive mode, print output and exit
    '--verbose', // Verbose output for better logging
  ];

  return {
    command: 'claude',
    args,
  };
}

/**
 * Get the initial prompt to send to Claude Code CLI
 * @param {string} prompt - The prompt content
 * @returns {string} Formatted prompt for Claude Code
 */
function formatInitialPrompt(prompt) {
  // Claude Code accepts prompt via stdin after startup
  return prompt;
}

module.exports = {
  buildSpawnCommand,
  formatInitialPrompt,
};
