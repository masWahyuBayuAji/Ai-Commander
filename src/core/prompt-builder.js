/**
 * Prompt builder for AI agent initial prompt
 * 
 * Builds the initial prompt that gets sent to the AI agent when starting a task.
 * The prompt contains all necessary context for the agent to understand the kanban
 * workflow and how to transition between stages.
 * 
 * Format based on ARCHITECTURE.md §6.1:
 * - project_group_uuid (or "null" if not using grouping)
 * - task_uuid (short id)
 * - List of all kanban groups with uuid, slash_command, next_step_group_id, instruction
 * - Explicit command to run ai-commander-cli update ... when ready to move to next stage
 * - Task detail from user at the end with clear label
 */

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

  // Build the prompt
  const prompt = `=== AI COMMANDER TASK CONTEXT ===

Project Group UUID: ${projectGroupUuid}
Task UUID: ${taskUuid}
Current Kanban Group ID: ${task.kanban_group_id}
TO-DO Kanban Group ID: ${todoGroupId}

=== KANBAN GROUPS ===
Berikut adalah daftar seluruh kanban group yang tersedia:
${kanbanGroupsList}

=== INSTRUKSI WORKFLOW ===
1. Kamu sedang mengerjakan task dengan UUID: ${taskUuid}
2. Task ini berada di project group: ${projectGroupUuid}
3. Untuk berpindah ke tahap berikutnya, jalankan perintah berikut di terminal:
   
   ai-commander-cli update ${projectGroupUuid} ${taskUuid} <target_kanban_group_id>
   
   Ganti <target_kanban_group_id> dengan UUID kanban group tujuan.

4. Kamu HARUS memanggil ai-commander-cli update secara OTOMATIS ketika merasa
   pekerjaan pada tahap ini sudah selesai dan siap pindah ke tahap berikutnya.
5. Jangan menunggu konfirmasi manual dari user untuk berpindah tahap, kecuali
   instruksi tahap tsb secara eksplisit meminta konfirmasi manual.
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

  return `=== AI COMMANDER TASK CONTEXT ===

Project Group UUID: ${projectGroupUuid}
Task UUID: ${taskUuid}
Current Kanban Group ID: ${task.kanban_group_id}
TO-DO Kanban Group ID: ${todoGroupId}

=== KANBAN GROUPS ===
Berikut adalah daftar seluruh kanban group yang tersedia:
${kanbanGroupsList}

=== INSTRUKSI WORKFLOW ===
1. Kamu sedang mengerjakan task dengan UUID: ${taskUuid}
2. Task ini berada di project group: ${projectGroupUuid}
3. Untuk berpindah ke tahap berikutnya, jalankan perintah berikut di terminal:

   ai-commander-cli update ${projectGroupUuid} ${taskUuid} <target_kanban_group_id>

   Ganti <target_kanban_group_id> dengan UUID kanban group tujuan.

4. Kamu HARUS memanggil ai-commander-cli update secara OTOMATIS ketika merasa
   pekerjaan pada tahap ini sudah selesai dan siap pindah ke tahap berikutnya.
5. Jangan menunggu konfirmasi manual dari user untuk berpindah tahap, kecuali
   instruksi tahap tsb secara eksplisit meminta konfirmasi manual.
6. Ikuti instruksi khusus yang ada di kanban group saat ini jika ada.`;
}

module.exports = {
  buildInitialPrompt,
  buildAgentInstructions,
};
