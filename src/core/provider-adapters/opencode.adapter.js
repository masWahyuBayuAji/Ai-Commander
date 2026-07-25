/**
 * OpenCode provider adapter
 * 
 * Builds spawn command for running OpenCode CLI in non-interactive mode.
 * 
 * OpenCode is the AI coding assistant being used in this environment.
 * The CLI flags should be verified against the official OpenCode documentation.
 * 
 * TODO: Verify official CLI flags for OpenCode non-interactive mode
 */

/**
 * Build spawn command for OpenCode CLI
 * @param {Object} options
 * @param {string} options.cwd - Working directory for the CLI
 * @param {string} options.initialPrompt - Initial prompt to send to the CLI
 * @returns {{ command: string, args: string[] }} Command and arguments for node-pty
 */
function buildSpawnCommand({ cwd, initialPrompt }) {
  // OpenCode CLI flags for non-interactive mode
  // Based on common patterns for AI coding assistants
  // TODO: verifikasi flag CLI resmi OpenCode
  const args = [
    '--non-interactive',  // Run in non-interactive mode
    '--yes',              // Auto-approve actions
  ];

  return {
    command: 'opencode',
    args,
  };
}

/**
 * Get the initial prompt to send to OpenCode CLI
 * @param {string} prompt - The prompt content
 * @returns {string} Formatted prompt for OpenCode
 */
function formatInitialPrompt(prompt) {
  // OpenCode accepts prompt via stdin after startup
  return prompt;
}

module.exports = {
  buildSpawnCommand,
  formatInitialPrompt,
};
