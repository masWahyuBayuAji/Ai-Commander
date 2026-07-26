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

const projectAliasMappingRepo = require('../db/repositories/projectAliasMapping.repo');

/**
 * Build the initial prompt for an AI agent task
 * @param {Object} options
 * @param {Object} options.task - Task object from database
 * @param {Object|null} options.projectGroup - Project group object (null if not using grouping)
 * @param {Object[]} options.kanbanGroups - List of kanban groups for this project
 * @returns {string} The formatted initial prompt
 */
function buildInitialPrompt({ task, projectGroup, kanbanGroups }) {
  const projectGroupUuid = projectGroup ? projectGroup.id : 'null';
  const taskUuid = task.id;

  // Build project alias mappings section
  let aliasMappingsSection = '';
  if (projectGroup) {
    const aliases = projectAliasMappingRepo.listByProjectGroup(projectGroup.id);
    if (aliases.length > 0) {
      const aliasLines = aliases.map(a => `  - ${a.name} → ${a.path}`).join('\n');
      aliasMappingsSection = `
=== PROJECT ALIAS MAPPINGS ===
Berikut adalah daftar alias untuk project group ini:
${aliasLines}`;
    }
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
 * @returns {string}
 */
function buildAgentInstructions({ task, projectGroup, kanbanGroups }) {
  const projectGroupUuid = projectGroup ? projectGroup.id : 'null';
  const taskUuid = task.id;

  // Build project alias mappings section
  let aliasMappingsSection = '';
  if (projectGroup) {
    const aliases = projectAliasMappingRepo.listByProjectGroup(projectGroup.id);
    if (aliases.length > 0) {
      const aliasLines = aliases.map(a => `  - ${a.name} → ${a.path}`).join('\n');
      aliasMappingsSection = `
=== PROJECT ALIAS MAPPINGS ===
Berikut adalah daftar alias untuk project group ini:
${aliasLines}`;
    }
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
6. Ikuti instruksi khusus yang ada di kanban group saat ini jika ada.`;
}

module.exports = {
  buildInitialPrompt,
  buildAgentInstructions,
};
