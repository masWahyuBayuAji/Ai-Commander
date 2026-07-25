/**
 * Task runner module
 * 
 * Manages the lifecycle of PTY processes for each task.
 * - Spawns PTY processes for AI provider CLIs
 * - Streams output to task_events and WebSocket
 * - Handles task state transitions
 * - Manages follow-up instructions to running tasks
 * 
 * Limitations (ocumented as per TASK-028):
 * - PTY processes are stored in an in-memory Map
 * - If server restarts, running tasks will be orphaned
 * - Orphaned tasks are handled by TASK-029 recovery mechanism
 */

const pty = require('node-pty');
const taskRepo = require('../db/repositories/task.repo');
const kanbanGroupRepo = require('../db/repositories/kanbanGroup.repo');
const projectGroupRepo = require('../db/repositories/projectGroup.repo');
const { buildInitialPrompt } = require('./prompt-builder');
const { getAdapter } = require('./provider-adapters');
const wsServer = require('../server/ws-server');
const uuid = require('../shared/uuid');
const db = require('../db/connection');
const tokenUsageParser = require('./token-usage-parser');

// In-memory map to track running PTY processes
// Key: taskId, Value: { ptyProcess, task, projectGroup, kanbanGroups }
const runningTasks = new Map();

/**
 * Start a task - spawn PTY process and begin execution
 * @param {string} taskId - The task ID to start
 * @returns {Object} Result with success status and task data
 */
async function startTask(taskId) {
  // Get task from database
  const task = taskRepo.getById(taskId);
  if (!task) {
    return { ok: false, error: 'Task not found' };
  }

  // Check if task is already running
  if (runningTasks.has(taskId)) {
    return { ok: false, error: 'Task is already running' };
  }

  // Get project group (if exists)
  let projectGroup = null;
  if (task.project_group_id) {
    projectGroup = projectGroupRepo.getById(task.project_group_id);
  }

  // Get kanban groups for this project
  const kanbanGroups = kanbanGroupRepo.listByProjectGroup(task.project_group_id);

  // Build initial prompt
  const initialPrompt = buildInitialPrompt({ task, projectGroup, kanbanGroups });

  // Get provider adapter
  const adapter = getAdapter(task.ai_provider);

  // Determine working directory
  const cwd = projectGroup ? projectGroup.repo_path : process.cwd();

  // Build spawn command
  const { command, args } = adapter.buildSpawnCommand({ cwd, initialPrompt });

  try {
    // Spawn PTY process
    const ptyProcess = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: cwd,
      env: process.env,
    });

    // Update task status in database
    const now = new Date().toISOString();
    taskRepo.update(taskId, {
      session_pid: ptyProcess.pid,
      session_status: 'running',
      started_at: now,
    });

    // Store in running tasks map
    runningTasks.set(taskId, {
      ptyProcess,
      task,
      projectGroup,
      kanbanGroups,
    });

    // Send initial prompt to PTY
    // Wait a short moment for the process to initialize
    setTimeout(() => {
      const formattedPrompt = adapter.formatInitialPrompt(initialPrompt);
      ptyProcess.write(formattedPrompt + '\n');
    }, 500);

    // Handle PTY output
    ptyProcess.onData((data) => {
      // Save to task_events
      const eventId = uuid();
      const eventNow = new Date().toISOString();
      db.prepare(`
        INSERT INTO task_events (id, task_id, type, content, created_at)
        VALUES (?, ?, 'log', ?, ?)
      `).run(eventId, taskId, data, eventNow);

      // Broadcast to WebSocket channel for this task
      wsServer.broadcast(`task:${taskId}`, {
        type: 'log',
        data: data,
      });

      // Parse for token usage
      tokenUsageParser.processChunk(data, {
        taskId,
        projectGroupId: task.project_group_id,
      });
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      const exitNow = new Date().toISOString();
      const status = exitCode === 0 ? 'finished' : 'error';
      
      // Update task status
      taskRepo.update(taskId, {
        session_status: status,
        finished_at: exitNow,
      });

      // Save exit event
      const exitEventId = uuid();
      db.prepare(`
        INSERT INTO task_events (id, task_id, type, content, created_at)
        VALUES (?, ?, 'error', ?, ?)
      `).run(exitEventId, taskId, `Process exited with code ${exitCode}${signal ? ` (signal: ${signal})` : ''}`, exitNow);

      // Broadcast task completion
      wsServer.broadcast('board', {
        type: 'task_updated',
        data: taskRepo.getById(taskId),
      });

      // Broadcast to task channel
      wsServer.broadcast(`task:${taskId}`, {
        type: 'exit',
        data: { exitCode, signal, status },
      });

      // Remove from running tasks
      runningTasks.delete(taskId);
    });

    return { ok: true, task: taskRepo.getById(taskId) };
  } catch (error) {
    // Update task status to error
    taskRepo.update(taskId, {
      session_status: 'error',
      finished_at: new Date().toISOString(),
    });

    // Save error event
    const errorEventId = uuid();
    db.prepare(`
      INSERT INTO task_events (id, task_id, type, content, created_at)
      VALUES (?, ?, 'error', ?, ?)
    `).run(errorEventId, taskId, `Failed to start task: ${error.message}`, new Date().toISOString());

    return { ok: false, error: error.message };
  }
}

/**
 * Send follow-up instruction to a running task
 * @param {string} taskId - The task ID
 * @param {string} text - The instruction text to send
 * @returns {Object} Result with success status
 */
function sendFollowupInstruction(taskId, text) {
  const runningTask = runningTasks.get(taskId);
  if (!runningTask) {
    return { ok: false, error: 'Task is not running' };
  }

  try {
    // Send the instruction to the PTY process
    runningTask.ptyProcess.write(text + '\n');

    // Save the instruction as a task event
    const eventId = uuid();
    db.prepare(`
      INSERT INTO task_events (id, task_id, type, content, created_at)
      VALUES (?, ?, 'log', ?, ?)
    `).run(eventId, taskId, `[Follow-up Instruction] ${text}`, new Date().toISOString());

    // Broadcast to task channel
    wsServer.broadcast(`task:${taskId}`, {
      type: 'followup_instruction',
      data: { text },
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Get status of a running task
 * @param {string} taskId - The task ID
 * @returns {Object|null} Task status info or null if not running
 */
function getTaskStatus(taskId) {
  const runningTask = runningTasks.get(taskId);
  if (!runningTask) {
    return null;
  }

  return {
    taskId,
    pid: runningTask.ptyProcess.pid,
    isRunning: runningTask.ptyProcess.pid > 0,
  };
}

/**
 * Get all running tasks
 * @returns {Object[]} List of running task info
 */
function getAllRunningTasks() {
  const tasks = [];
  for (const [taskId, runningTask] of runningTasks) {
    tasks.push({
      taskId,
      pid: runningTask.ptyProcess.pid,
      isRunning: runningTask.ptyProcess.pid > 0,
    });
  }
  return tasks;
}

module.exports = {
  startTask,
  sendFollowupInstruction,
  getTaskStatus,
  getAllRunningTasks,
};
