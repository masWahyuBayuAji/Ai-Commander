/**
 * OpenCode agent file manager
 *
 * Menulis & menghapus file custom agent opencode (.opencode/agent/*.md)
 * untuk task runner (per-task) DAN orchestrator.
 *
 * Task runner: aic-task-<taskId>  — satu file per task (bersihkan saat DONE)
 * Orchestrator: aic-orchestrator-<projectGroupName> — satu file per project group
 *              (dihapus saat orchestrator stop)
 */

const fs = require('node:fs');
const path = require('node:path');

// ─── Task runner agent ───

/**
 * Nama agent untuk task runner
 * @param {string} taskId
 * @returns {string} misal "aic-task-a1b2c3d4"
 */
function getAgentName(taskId) {
  return `aic-task-${taskId}`;
}

/**
 * Path ke file agent task runner
 * @param {string} cwd
 * @param {string} taskId
 * @returns {string}
 */
function getAgentFilePath(cwd, taskId) {
  return path.join(cwd, '.opencode', 'agent', `${getAgentName(taskId)}.md`);
}

// ─── Orchestrator agent ───

/**
 * Nama agent untuk orchestrator
 * @param {string} projectGroupName - nama project group (sanitized)
 * @returns {string} misal "aic-orchestrator-my-project"
 */
function getOrchestratorAgentName(projectGroupName) {
  const sanitized = projectGroupName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `aic-orchestrator-${sanitized}`;
}

/**
 * Path ke file agent orchestrator
 * @param {string} cwd
 * @param {string} projectGroupName
 * @returns {string}
 */
function getOrchestratorAgentFilePath(cwd, projectGroupName) {
  return path.join(cwd, '.opencode', 'agent', `${getOrchestratorAgentName(projectGroupName)}.md`);
}

// ─── Shared write/delete helpers ───

/**
 * Tulis file agent ke disk. Folder .opencode/agent/ dibuat otomatis.
 * @param {Object} options
 * @param {string} options.filePath - path absolut ke file .md
 * @param {string} options.description - deskripsi agent (untuk frontmatter)
 * @param {string} options.instructions - isi instruksi (jadi body markdown)
 * @returns {string} path file yang ditulis
 */
function writeAgentFile({ filePath, description, instructions }) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const content = `---
description: ${description}
mode: primary
---
${instructions}
`;

  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

/**
 * Hapus file agent kalau ada (idempotent).
 * @param {string} filePath
 */
function deleteAgentFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error('Gagal hapus agent file:', filePath, e.message);
  }
}

/**
 * Tulis file agent untuk task runner (per-task)
 * @param {Object} options
 * @param {string} options.cwd
 * @param {string} options.taskId
 * @param {string} options.instructions
 * @returns {string} path file yang ditulis
 */
function writeTaskAgentFile({ cwd, taskId, instructions }) {
  return writeAgentFile({
    filePath: getAgentFilePath(cwd, taskId),
    description: 'Ai-Commander task agent (auto-generated, aman dihapus)',
    instructions,
  });
}

/**
 * Hapus file agent task runner
 * @param {Object} options
 * @param {string} options.cwd
 * @param {string} options.taskId
 */
function deleteTaskAgentFile({ cwd, taskId }) {
  deleteAgentFile(getAgentFilePath(cwd, taskId));
}

/**
 * Tulis file agent untuk orchestrator
 * @param {Object} options
 * @param {string} options.cwd
 * @param {string} options.projectGroupName
 * @param {string} options.instructions
 * @returns {string} path file yang ditulis
 */
function writeOrchestratorAgentFile({ cwd, projectGroupName, instructions }) {
  return writeAgentFile({
    filePath: getOrchestratorAgentFilePath(cwd, projectGroupName),
    description: 'Ai-Commander orchestrator agent (auto-generated)',
    instructions,
  });
}

/**
 * Hapus file agent orchestrator
 * @param {Object} options
 * @param {string} options.cwd
 * @param {string} options.projectGroupName
 */
function deleteOrchestratorAgentFile({ cwd, projectGroupName }) {
  deleteAgentFile(getOrchestratorAgentFilePath(cwd, projectGroupName));
}

module.exports = {
  getAgentName,
  getAgentFilePath,
  getOrchestratorAgentName,
  getOrchestratorAgentFilePath,
  writeAgentFile,
  deleteAgentFile,
  writeTaskAgentFile,
  deleteTaskAgentFile,
  writeOrchestratorAgentFile,
  deleteOrchestratorAgentFile,
};
