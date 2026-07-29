/**
 * Claude Code system prompt file manager
 *
 * Menulis & menghapus file system prompt sementara untuk task runner
 * provider claude-code. Dipakai bareng flag CLI `--append-system-prompt-file`.
 *
 * Kenapa file, bukan string langsung di argumen CLI?
 * Karena isi system prompt (kanban groups + workflow instruction) bisa panjang,
 * dan argumen CLI punya batas panjang (OS ARG_MAX). File jauh lebih aman.
 *
 * Task runner: satu file per task, disimpan di `.claude-tmp/task-<taskId>.md`
 * di dalam working directory task tsb. Dihapus otomatis saat task pindah ke
 * kolom DONE (lihat kanban-state-machine.js) DAN saat proses PTY exit
 * (lihat task-runner.js) sebagai jaring pengaman kalau lupa/gagal pindah DONE.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Path ke file system prompt untuk sebuah task
 * @param {string} cwd - working directory task tsb
 * @param {string} taskId
 * @returns {string}
 */
function getSystemPromptFilePath(cwd, taskId) {
  return path.join(cwd, '.claude-tmp', `task-${taskId}.md`);
}

/**
 * Tulis file system prompt ke disk. Folder `.claude-tmp/` dibuat otomatis
 * kalau belum ada.
 * @param {Object} options
 * @param {string} options.cwd
 * @param {string} options.taskId
 * @param {string} options.instructions - isi system prompt (workflow + kanban, TANPA task detail)
 * @returns {string} path file yang ditulis
 */
function writeTaskSystemPromptFile({ cwd, taskId, instructions }) {
  const filePath = getSystemPromptFilePath(cwd, taskId);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, instructions, 'utf8');
  return filePath;
}

/**
 * Hapus file system prompt kalau ada (idempotent, aman dipanggil berkali-kali).
 * @param {Object} options
 * @param {string} options.cwd
 * @param {string} options.taskId
 */
function deleteTaskSystemPromptFile({ cwd, taskId }) {
  const filePath = getSystemPromptFilePath(cwd, taskId);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error('Gagal hapus system prompt file:', filePath, e.message);
  }
}

module.exports = {
  getSystemPromptFilePath,
  writeTaskSystemPromptFile,
  deleteTaskSystemPromptFile,
};
