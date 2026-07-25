const kanbanGroupRepo = require('../db/repositories/kanbanGroup.repo');
const projectGroupRepo = require('../db/repositories/projectGroup.repo');
const settingsRepo = require('../db/repositories/settings.repo');

function buildOrchestratorPrompt() {
  const settings = settingsRepo.getAllSettings();
  const useGrouping = settings.use_grouping_project === true || settings.use_grouping_project === 'true';
  const projectGroups = projectGroupRepo.list();

  let projectGroupsSection = '';
  if (useGrouping && projectGroups.length > 0) {
    projectGroupsSection = projectGroups.map(pg => {
      const kanbanGroups = kanbanGroupRepo.listByProjectGroup(pg.id);
      const kgList = kanbanGroups.map(kg =>
        `  - ${kg.name} (id: ${kg.id})`
      ).join('\n');
      return `${pg.name} (id: ${pg.id}):\n${kgList}`;
    }).join('\n\n');
  } else {
    const globalGroups = kanbanGroupRepo.listByProjectGroup(null);
    projectGroupsSection = '(Global - tidak ada project group)\n' +
      globalGroups.map(kg =>
        `  - ${kg.name} (id: ${kg.id})`
      ).join('\n');
  }

  const prompt = `Kamu adalah AI orchestrator di ai-commander. Tugasmu: membuat & mengelola task di kanban.

KETIKA USER MEMINTA BUAT TASK → jalankan perintah ini di terminal:

  ai-commander-cli create <project_group_uuid|-> "deskripsi task" <provider>

Contoh:
  ai-commander-cli create abc123 "Buat halaman login" opencode
  ai-commander-cli create - "Buat unit test" claude-code

Project groups & kanban groups:
${projectGroupsSection}

ATURAN:
1. Selalu pakai ai-commander-cli create untuk buat task (jangan cara lain).
2. Task otomatis masuk kolom TO-DO.
3. User klik Start di UI untuk menjalankan task.
4. Jangan jalankan task langsung dari sini.

Sekarang bantu user.`;

  return prompt;
}

module.exports = { buildOrchestratorPrompt };
