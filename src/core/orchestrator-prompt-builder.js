const kanbanGroupRepo = require('../db/repositories/kanbanGroup.repo');
const projectGroupRepo = require('../db/repositories/projectGroup.repo');

/**
 * Build the orchestrator system prompt / agent instructions.
 *
 * Contains:
 * - Project alias mapping (name → id)
 * - Kanban groups per project
 * - All CLI commands: create, update (move task)
 * - Workflow rules
 *
 * @param {Object} [options]
 * @param {string} [options.mode] - 'claude' for --system-prompt, 'opencode' for agent file
 * @returns {string}
 */
function buildOrchestratorPrompt(options) {
  const { mode } = options || {};
  const projectGroups = projectGroupRepo.list();

  // ── Project alias mapping ──
  let projectAliasSection = '';
  if (projectGroups.length > 0) {
    const aliasLines = projectGroups.map(pg =>
      `  - ${pg.name} → ${pg.id}`
    ).join('\n');
    projectAliasSection = `=== PROJECT ALIAS MAPPING ===
Gunakan UUID di bawah untuk <project_group_uuid> pada perintah CLI:
${aliasLines}`;
  } else {
    projectAliasSection = `=== PROJECT ALIAS MAPPING ===
Tidak ada project group. Gunakan "-" (tanda hubung) sebagai <project_group_uuid> untuk context global.`;
  }

  // ── Kanban groups section ──
  let kanbanGroupsSection = '';
  if (projectGroups.length > 0) {
    kanbanGroupsSection = projectGroups.map(pg => {
      const kanbanGroups = kanbanGroupRepo.listByProjectGroup(pg.id);
      const kgList = kanbanGroups.map(kg => {
        const nextStep = kg.next_step_group_id ? kg.next_step_group_id : 'none (final)';
        return `  - ${kg.name} (id: ${kg.id}) → next: ${nextStep}`;
      }).join('\n');
      return `${pg.name}:\n${kgList}`;
    }).join('\n\n');
  } else {
    const globalGroups = kanbanGroupRepo.listByProjectGroup(null);
    kanbanGroupsSection = 'Global:\n' +
      globalGroups.map(kg => {
        const nextStep = kg.next_step_group_id ? kg.next_step_group_id : 'none (final)';
        return `  - ${kg.name} (id: ${kg.id}) → next: ${nextStep}`;
      }).join('\n');
  }

  const prompt = `Kamu adalah AI orchestrator di ai-commander. Tugasmu: membuat & mengelola task di kanban.

${projectAliasSection}

=== KANBAN GROUPS ===
${kanbanGroupsSection}

=== PERINTAH CLI ===

1. BUAT TASK BARU:
   ai-commander-cli create <project_group_uuid|-> "deskripsi task" <provider>
   - project_group_uuid: UUID project (lihat alias mapping di atas), atau "-" untuk global
   - provider: "opencode" atau "claude-code"

   Contoh:
   ai-commander-cli create ${projectGroups.length > 0 ? projectGroups[0].id : '-'} "Buat halaman login dengan form validasi" opencode
   ai-commander-cli create ${projectGroups.length > 0 ? projectGroups[0].id : '-'} "Buat unit test untuk API users" claude-code

2. PINDAH TASK KE KANBAN LAIN (update/move):
   ai-commander-cli update <project_group_uuid|-> <task_uuid> <target_kanban_group_id>
   - project_group_uuid: UUID project yang sama dengan task
   - task_uuid: UUID task yang ingin dipindah
   - target_kanban_group_id: UUID kanban group tujuan

   Contoh:
   ai-commander-cli update ${projectGroups.length > 0 ? projectGroups[0].id : '-'} a1b2c3d4 ${kanbanGroupsSection.split('id: ')[1] ? kanbanGroupsSection.split('id: ')[1].split(')')[0] : 'kanban-uuid'}

=== ATURAN ===
1. Selalu pakai ai-commander-cli create untuk buat task (jangan cara lain).
2. Task otomatis masuk kolom TO-DO.
3. User klik Start di UI untuk menjalankan task (atau biarkan task menunggu).
4. Kamu bisa memindah task antar kanban group menggunakan ai-commander-cli update.
5. Pastikan project_group_uuid sesuai dengan project group task tersebut.
6. Jangan menjalankan task langsung dari sini.

Sekarang bantu user.`;

  return prompt;
}

module.exports = { buildOrchestratorPrompt };
