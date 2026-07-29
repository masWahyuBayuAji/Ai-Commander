/**
 * Claude Code provider adapter
 *
 * Builds spawn command for running Claude Code CLI.
 * Supports both interactive (orchestrator) and non-interactive (task runner) modes.
 *
 * Verified CLI flags (claude v2.1.216):
 * - Interactive: `claude --permission-mode bypassPermissions`
 * - Interactive with system prompt: `claude --permission-mode bypassPermissions --system-prompt "..."`
 * - Non-interactive: `claude --permission-mode bypassPermissions --print --verbose`
 * - Non-interactive with system prompt file: tambahkan `--append-system-prompt-file <path>`
 *   (flag ini resmi hanya berlaku bareng --print, lihat dokumentasi Claude Code CLI)
 */

/**
 * Build spawn command for Claude Code CLI
 * @param {Object} options
 * @param {string} options.cwd - Working directory for the CLI
 * @param {string} options.initialPrompt - Initial prompt to send to the CLI (task.detail untuk task runner)
 * @param {string} options.systemPrompt - System prompt untuk mode interaktif (orchestrator)
 * @param {string} [options.systemPromptFilePath] - Path ke file system prompt untuk mode non-interaktif (task runner)
 * @param {boolean} options.interactive - If true, spawn interactive mode (for orchestrator)
 * @returns {{ command: string, args: string[] }} Command and arguments for node-pty
 */
function buildSpawnCommand({ cwd, initialPrompt, systemPrompt, systemPromptFilePath, interactive }) {
  if (interactive) {
    const args = ['--permission-mode', 'bypassPermissions'];
    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }
    return { command: 'claude', args };
  }

  // Task runner mode: non-interactive with print flag
  const args = [
    '--permission-mode', 'bypassPermissions',
    '--print',
    '--verbose', // [2.c - Opsi A] tampilkan detail tool call (Bash/Grep/Read/dll) di output
  ];
  if (systemPromptFilePath) {
    // [2.b] Instruksi permanen (workflow + kanban) dikirim lewat file,
    // BUKAN digabung ke initialPrompt. Ini menghindari limit panjang
    // argumen CLI (ARG_MAX) kalau instruksinya panjang.
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
