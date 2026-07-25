const taskRepo = require('../db/repositories/task.repo');
const kanbanGroupRepo = require('../db/repositories/kanbanGroup.repo');

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

  return { ok: true, task: updatedTask };
}

module.exports = { validateAndTransition };
