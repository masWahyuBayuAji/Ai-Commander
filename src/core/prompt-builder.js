/**
 * Prompt builder for AI agent initial prompt
 * 
 * Builds the initial prompt that gets sent to the AI agent when starting a task.
 * The prompt contains all necessary context for the agent to understand the kanban
 * workflow and how to transition between stages.
 * 
 * Format based on ARCHITECTURE.md §6.1:
 * - project_group_uuid (or "null" if not using grouping)
 * - project_alias_mappings (name → path for each alias in the project group)
 * - task_uuid (short id)
 * - List of all kanban groups with uuid, slash_command, next_step_group_id, instruction
 * - Explicit command to run ai-commander-cli update ... when ready to move to next stage
 * - Task detail from user at the end with clear label
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const projectAliasMappingRepo = require('../db/repositories/projectAliasMapping.repo');

/**
 * Build instruction to read AGENTS.md/CLAUDE.md before starting work.
 * Only generated when cwd is the user's home directory (no specific working dir configured).
 * @param {Object} options
 * @param {Object[]} options.aliases - Array of alias objects with { name, path }
 * @param {string} options.provider - 'opencode' or 'claude-code'
 * @returns {string} The read-first instruction section (or empty string if not needed)
 */
function buildReadInstructionsFirst({ aliases, provider }) {
  if (!aliases || aliases.length === 0) return '';

  const lines = aliases.map(alias => {
    const aliasDir = alias.path;
    if (provider === 'opencode') {
      const primaryFile = path.join(aliasDir, 'AGENTS.md');
      const fallbackFile = path.join(aliasDir, 'CLAUDE.md');
      const primaryExists = fs.existsSync(primaryFile);
      const fallbackExists = fs.existsSync(fallbackFile);
      if (primaryExists) {
        return `  - Path "${alias.name}" (${aliasDir}): Baca file \`${primaryFile}\` dan ikuti instruksinya.`;
      } else if (fallbackExists) {
        return `  - Path "${alias.name}" (${aliasDir}): File AGENTS.md tidak ditemukan, baca file \`${fallbackFile}\` dan ikuti instruksinya.`;
      } else {
        return `  - Path "${alias.name}" (${aliasDir}): Tidak ada file AGENTS.md maupun CLAUDE.md, lanjutkan tanpa instruksi tambahan.`;
      }
    } else {
      // claude-code: CLAUDE.md primary, AGENTS.md fallback
      const primaryFile = path.join(aliasDir, 'CLAUDE.md');
      const fallbackFile = path.join(aliasDir, 'AGENTS.md');
      const primaryExists = fs.existsSync(primaryFile);
      const fallbackExists = fs.existsSync(fallbackFile);
      if (primaryExists) {
        return `  - Path "${alias.name}" (${aliasDir}): Baca file \`${primaryFile}\` dan ikuti instruksinya.`;
      } else if (fallbackExists) {
        return `  - Path "${alias.name}" (${aliasDir}): File CLAUDE.md tidak ditemukan, baca file \`${fallbackFile}\` dan ikuti instruksinya.`;
      } else {
        return `  - Path "${alias.name}" (${aliasDir}): Tidak ada file CLAUDE.md maupun AGENTS.md, lanjutkan tanpa instruksi tambahan.`;
      }
    }
  }).join('\n');

  return `
=== INSTRUKSI PENTING: BACA FILE INSTRUKSI DI SETIAP PATH ===
Karena working directory saat ini adalah home directory (${os.homedir()}), kamu HARUS membaca file instruksi di setiap path project alias mapping SEBELUM memulai operasi apapun (membaca kode, menulis file, menjalankan command, dsb.) pada path tersebut:

${lines}

PENTING: Instruksi di atas WAJIB diikuti. Jangan mulai bekerja di suatu path sebelum membaca file instruksinya terlebih dahulu.`;
}

/**
 * Build the initial prompt for an AI agent task
 * @param {Object} options
 * @param {Object} options.task - Task object from database
 * @param {Object|null} options.projectGroup - Project group object (null if not using grouping)
 * @param {Object[]} options.kanbanGroups - List of kanban groups for this project
 * @param {boolean} [options.isCwdHome] - True if working directory is the user's home directory
 * @returns {string} The formatted initial prompt
 */
function buildInitialPrompt({ task, projectGroup, kanbanGroups, isCwdHome }) {
  const projectGroupUuid = projectGroup ? projectGroup.id : 'null';
  const taskUuid = task.id;

  // Build project alias mappings section
  let aliasMappingsSection = '';
  let aliases = [];
  if (projectGroup) {
    aliases = projectAliasMappingRepo.listByProjectGroup(projectGroup.id);
    if (aliases.length > 0) {
      const aliasLines = aliases.map(a => `  - ${a.name} → ${a.path}`).join('\n');
      aliasMappingsSection = `
=== PROJECT ALIAS MAPPINGS ===
Berikut adalah daftar alias untuk project group ini:
${aliasLines}`;
    }
  }

  // Build read-instructions-first section (only when cwd is home directory)
  let readInstructionsSection = '';
  if (isCwdHome && aliases.length > 0) {
    readInstructionsSection = buildReadInstructionsFirst({ aliases, provider: 'claude-code' });
  }

  // Build kanban groups section
  const kanbanGroupsList = kanbanGroups.map(kg => {
    const nextStep = kg.next_step_group_id ? kg.next_step_group_id : 'null';
    const instruction = kg.instruction ? kg.instruction : 'Tidak ada instruksi khusus';
    
    return `  - ID: ${kg.id}
    Nama: ${kg.name}
    Slash Command: ${kg.slash_command}
    Next Step Group ID: ${nextStep}
    Instruksi: ${instruction}`;
  }).join('\n');

  // Find the TO-DO kanban group (is_locked_todo = 1)
  const todoGroup = kanbanGroups.find(kg => kg.is_locked_todo === 1);
  const todoGroupId = todoGroup ? todoGroup.id : 'null';

  // Find the DONE kanban group (is_locked_done = 1)
  const doneGroup = kanbanGroups.find(kg => kg.is_locked_done === 1);
  const doneGroupId = doneGroup ? doneGroup.id : 'null';

  // Find the current kanban group's next_step_group_id
  const currentGroup = kanbanGroups.find(kg => kg.id === task.kanban_group_id);
  const nextStepGroupId = currentGroup && currentGroup.next_step_group_id ? currentGroup.next_step_group_id : doneGroupId;

  // Build the prompt
  const prompt = `=== AI COMMANDER TASK CONTEXT ===

Project Group UUID: ${projectGroupUuid}${aliasMappingsSection}
Task UUID: ${taskUuid}
Current Kanban Group ID: ${task.kanban_group_id}
Next Step Group ID (gunakan ini untuk berpindah): ${nextStepGroupId}
TO-DO Kanban Group ID: ${todoGroupId}
DONE Kanban Group ID: ${doneGroupId}

=== KANBAN GROUPS ===
Berikut adalah daftar seluruh kanban group yang tersedia:
${kanbanGroupsList}

=== INSTRUKSI WORKFLOW ===
1. Kamu sedang mengerjakan task dengan UUID: ${taskUuid}
2. Task ini berada di project group: ${projectGroupUuid}
3. Ketika pekerjaan pada tahap ini sudah SELESAI, kamu WAJIB berpindah ke tahap
   berikutnya dengan menjalankan perintah berikut di terminal:

   ai-commander-cli update ${projectGroupUuid} ${taskUuid} ${nextStepGroupId}

4. PENTING: Kamu HARUS selalu menjalankan perintah di atas SETIAP KALI pekerjaan
   selesai. Jangan pernah melewatkannya. Tanpa perintah ini, task akan tetap
   terjebak di tahap ini dan tidak akan pernah pindah ke DONE.
5. Jangan menunggu konfirmasi manual dari user untuk berpindah tahap.
6. Ikuti instruksi khusus yang ada di kanban group saat ini jika ada.
${readInstructionsSection}
=== TASK DETAIL ===
${task.detail}`;

  return prompt;
}

/**
 * Build instruksi persisten (tanpa task detail) untuk disimpan sebagai body
 * custom agent opencode (.opencode/agent/aic-task-<id>.md)
 * @param {Object} options
 * @param {Object} options.task
 * @param {Object|null} options.projectGroup
 * @param {Object[]} options.kanbanGroups
 * @param {boolean} [options.isCwdHome] - True if working directory is the user's home directory
 * @returns {string}
 */
function buildAgentInstructions({ task, projectGroup, kanbanGroups, isCwdHome, provider = 'opencode' }) {
  const projectGroupUuid = projectGroup ? projectGroup.id : 'null';
  const taskUuid = task.id;

  // Build project alias mappings section
  let aliasMappingsSection = '';
  let aliases = [];
  if (projectGroup) {
    aliases = projectAliasMappingRepo.listByProjectGroup(projectGroup.id);
    if (aliases.length > 0) {
      const aliasLines = aliases.map(a => `  - ${a.name} → ${a.path}`).join('\n');
      aliasMappingsSection = `
=== PROJECT ALIAS MAPPINGS ===
Berikut adalah daftar alias untuk project group ini:
${aliasLines}`;
    }
  }

  // Build read-instructions-first section (only when cwd is home directory)
  let readInstructionsSection = '';
  if (isCwdHome && aliases.length > 0) {
    readInstructionsSection = buildReadInstructionsFirst({ aliases, provider });
  }

  const kanbanGroupsList = kanbanGroups.map(kg => {
    const nextStep = kg.next_step_group_id ? kg.next_step_group_id : 'null';
    const instruction = kg.instruction ? kg.instruction : 'Tidak ada instruksi khusus';
    return `  - ID: ${kg.id}
    Nama: ${kg.name}
    Slash Command: ${kg.slash_command}
    Next Step Group ID: ${nextStep}
    Instruksi: ${instruction}`;
  }).join('\n');

  const todoGroup = kanbanGroups.find(kg => kg.is_locked_todo === 1);
  const todoGroupId = todoGroup ? todoGroup.id : 'null';

  // Find the DONE kanban group (is_locked_done = 1)
  const doneGroup = kanbanGroups.find(kg => kg.is_locked_done === 1);
  const doneGroupId = doneGroup ? doneGroup.id : 'null';

  // Find the current kanban group's next_step_group_id
  const currentGroup = kanbanGroups.find(kg => kg.id === task.kanban_group_id);
  const nextStepGroupId = currentGroup && currentGroup.next_step_group_id ? currentGroup.next_step_group_id : doneGroupId;

  return `=== AI COMMANDER TASK CONTEXT ===

Project Group UUID: ${projectGroupUuid}${aliasMappingsSection}
Task UUID: ${taskUuid}
Current Kanban Group ID: ${task.kanban_group_id}
Next Step Group ID (gunakan ini untuk berpindah): ${nextStepGroupId}
TO-DO Kanban Group ID: ${todoGroupId}
DONE Kanban Group ID: ${doneGroupId}

=== KANBAN GROUPS ===
Berikut adalah daftar seluruh kanban group yang tersedia:
${kanbanGroupsList}

=== INSTRUKSI WORKFLOW ===
1. Kamu sedang mengerjakan task dengan UUID: ${taskUuid}
2. Task ini berada di project group: ${projectGroupUuid}
3. Ketika pekerjaan pada tahap ini sudah SELESAI, kamu WAJIB berpindah ke tahap
   berikutnya dengan menjalankan perintah berikut di terminal:

   ai-commander-cli update ${projectGroupUuid} ${taskUuid} ${nextStepGroupId}

4. PENTING: Kamu HARUS selalu menjalankan perintah di atas SETIAP KALI pekerjaan
   selesai. Jangan pernah melewatkannya. Tanpa perintah ini, task akan tetap
   terjebak di tahap ini dan tidak akan pernah pindah ke DONE.
5. Jangan menunggu konfirmasi manual dari user untuk berpindah tahap.
6. Ikuti instruksi khusus yang ada di kanban group saat ini jika ada.
${readInstructionsSection}`;
}

module.exports = {
  buildInitialPrompt,
  buildAgentInstructions,
  buildReadInstructionsFirst,
};
