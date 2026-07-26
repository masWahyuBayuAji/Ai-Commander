const taskRepo = require('../db/repositories/task.repo');
const kanbanGroupRepo = require('../db/repositories/kanbanGroup.repo');
const { validateAndTransition } = require('./kanban-state-machine');
const taskRunner = require('./task-runner');
const wsServer = require('../server/ws-server');

async function triggerNextTask(nextTaskId) {
  console.log('[TriggerNext] === START triggerNextTask for:', nextTaskId, '===');

  const nextTask = taskRepo.getById(nextTaskId);
  if (!nextTask) {
    console.error('[TriggerNext] FAIL: Next task not found:', nextTaskId);
    return;
  }
  console.log('[TriggerNext] nextTask found:', {
    id: nextTask.id,
    kanban_group_id: nextTask.kanban_group_id,
    session_status: nextTask.session_status,
    project_group_id: nextTask.project_group_id,
    next_run_task_id: nextTask.next_run_task_id,
  });

  if (nextTask.session_status === 'running') {
    console.log('[TriggerNext] SKIP: Next task already running:', nextTaskId);
    return;
  }

  const kanbanGroups = kanbanGroupRepo.listByProjectGroup(nextTask.project_group_id);
  console.log('[TriggerNext] kanbanGroups count:', kanbanGroups.length, 'for project:', nextTask.project_group_id);
  kanbanGroups.forEach(function(g) {
    console.log('[TriggerNext]   group:', g.id, g.name, 'is_locked_todo:', g.is_locked_todo, 'next_step:', g.next_step_group_id);
  });

  const todoGroup = kanbanGroups.find(function(g) { return g.is_locked_todo === 1; });
  if (!todoGroup) {
    console.error('[TriggerNext] FAIL: TO-DO group not found for task:', nextTaskId, 'project:', nextTask.project_group_id);
    return;
  }
  console.log('[TriggerNext] todoGroup found:', todoGroup.id, todoGroup.name, 'next_step_group_id:', todoGroup.next_step_group_id);

  if (nextTask.kanban_group_id !== todoGroup.id) {
    console.log('[TriggerNext] FAIL: Next task NOT in TO-DO. Task kanban_group_id:', nextTask.kanban_group_id, '!= todoGroup.id:', todoGroup.id);
    return;
  }

  const nextStepGroupId = todoGroup.next_step_group_id;
  if (!nextStepGroupId) {
    console.error('[TriggerNext] FAIL: TO-DO group has no next_step_group_id');
    return;
  }

  console.log('[TriggerNext] Transitioning task', nextTaskId, 'from TO-DO to:', nextStepGroupId);
  const transitionResult = validateAndTransition(nextTaskId, nextStepGroupId);
  if (!transitionResult.ok) {
    console.error('[TriggerNext] FAIL: Transition error:', transitionResult.error);
    return;
  }
  console.log('[TriggerNext] Transition OK. Task now in kanban_group_id:', transitionResult.task.kanban_group_id);

  wsServer.broadcast('board', { type: 'task_updated', data: transitionResult.task });
  console.log('[TriggerNext] Board broadcast sent. Starting task:', nextTaskId);

  try {
    const startResult = await taskRunner.startTask(nextTaskId);
    console.log('[TriggerNext] startTask result:', startResult);
  } catch (err) {
    console.error('[TriggerNext] FAIL: startTask error:', err.message);
  }

  console.log('[TriggerNext] === END triggerNextTask for:', nextTaskId, '===');
}

module.exports = { triggerNextTask };
