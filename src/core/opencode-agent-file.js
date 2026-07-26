/**
 * OpenCode per-task agent file manager
 *
 * Menulis & menghapus file custom agent opencode (.opencode/agent/aic-task-<id>.md)
 * per task, sebagai pengganti flag --system yang tidak didukung opencode.
 *
 * Setiap task punya file agent sendiri (nama file pakai task.id yang sudah short-uuid),
 * jadi task yang berjalan bersamaan di project yang sama TIDAK saling menimpa file
 * satu sama lain (tidak ada race condition).
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Nama agent yang dipakai untuk flag `opencode run --agent <name>`
 * @param {string} taskId - task.id (sudah short uuid, misal "a1b2c3d4")
 * @returns {string} misal "aic-task-a1b2c3d4"
 */
function getAgentName(taskId) {
  return `aic-task-${taskId}`;
}

/**
 * Path lengkap ke file .md agent di dalam project
 * @param {string} cwd - working directory / repo path project
 * @param {string} taskId
 * @returns {string} path absolut ke file .md
 */
function getAgentFilePath(cwd, taskId) {
  return path.join(cwd, '.opencode', 'agent', `${getAgentName(taskId)}.md`);
}

/**
 * Tulis file agent ke disk. Folder .opencode/agent/ dibuat otomatis kalau belum ada.
 * @param {Object} options
 * @param {string} options.cwd - working directory project
 * @param {string} options.taskId - task.id
 * @param {string} options.instructions - isi instruksi (jadi body markdown agent)
 * @returns {string} path file yang ditulis
 */
function writeAgentFile({ cwd, taskId, instructions }) {
  const filePath = getAgentFilePath(cwd, taskId);
  const dir = path.dirname(filePath);

  fs.mkdirSync(dir, { recursive: true });

  const content = `---
description: Ai-Commander task agent (auto-generated, aman dihapus)
mode: primary
---
${instructions}
`;

  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

/**
 * Hapus file agent kalau ada. Dipanggil ketika task sudah selesai (masuk kanban DONE).
 * Tidak melempar error kalau file tidak ada (idempotent).
 * @param {Object} options
 * @param {string} options.cwd
 * @param {string} options.taskId
 */
function deleteAgentFile({ cwd, taskId }) {
  const filePath = getAgentFilePath(cwd, taskId);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error('Gagal hapus agent file:', filePath, e.message);
  }
}

module.exports = {
  getAgentName,
  getAgentFilePath,
  writeAgentFile,
  deleteAgentFile,
};
