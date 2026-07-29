const taskRepo = require('../db/repositories/task.repo');
const kanbanGroupRepo = require('../db/repositories/kanbanGroup.repo');
const projectGroupRepo = require('../db/repositories/projectGroup.repo');
const projectAliasMappingRepo = require('../db/repositories/projectAliasMapping.repo');
const opencodeAgentFile = require('./opencode-agent-file');
const claudeCodeSystemPromptFile = require('./claude-code-system-prompt-file');

function validateAndTransition(taskId, targetKanbanGroupId) {
  const task = taskRepo.getById(taskId);
  if (!task) {
    return { ok: false, error: 'task not found', status: 404 };
  }

  const targetGroup = kanbanGroupRepo.getById(targetKanbanGroupId);
  if (!targetGroup) {
    return { ok: false, error: 'target kanban group not found', status: 400 };
  }

  const taskProjectGroupId = task.project_group_id;
  if (targetGroup.project_group_id !== null && targetGroup.project_group_id !== taskProjectGroupId) {
    return { ok: false, error: 'target kanban group does not belong to task project group', status: 400 };
  }

  const updatedTask = taskRepo.updateKanbanGroup(taskId, targetKanbanGroupId);

  // Cleanup: kalau task pindah ke kanban group DONE, hapus file agent opencode
  if (targetGroup.is_locked_done === 1 && task.ai_provider === 'opencode') {
    const projectGroup = task.project_group_id ? projectGroupRepo.getById(task.project_group_id) : null;
    const cwd = projectGroup ? (projectAliasMappingRepo.getDefaultPath(projectGroup.id) || process.cwd()) : process.cwd();
    opencodeAgentFile.deleteTaskAgentFile({ cwd, taskId: task.id });
  }

  // [2.b] Cleanup: kalau task pindah ke kanban group DONE, hapus file
  // system prompt claude-code
  if (targetGroup.is_locked_done === 1 && task.ai_provider === 'claude-code') {
    const projectGroup = task.project_group_id ? projectGroupRepo.getById(task.project_group_id) : null;
    const cwd = projectGroup ? (projectAliasMappingRepo.getDefaultPath(projectGroup.id) || process.cwd()) : process.cwd();
    claudeCodeSystemPromptFile.deleteTaskSystemPromptFile({ cwd, taskId: task.id });
  }

  return { ok: true, task: updatedTask };
}

module.exports = { validateAndTransition };
