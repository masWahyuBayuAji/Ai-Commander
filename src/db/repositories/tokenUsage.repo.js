const db = require('../connection');
const generateShortId = require('../../shared/short-id');

function record({ projectGroupId, taskId, tokensInput, tokensOutput }) {
  const id = generateShortId();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO token_usage (id, project_group_id, task_id, tokens_input, tokens_output, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, projectGroupId, taskId, tokensInput, tokensOutput, now);
  return { id, projectGroupId, taskId, tokensInput, tokensOutput, recordedAt: now };
}

function sumByProjectGroup() {
  return db.prepare(`
    SELECT
      project_group_id AS projectGroupId,
      ROUND(SUM(tokens_input + tokens_output) / 1000.0, 2) AS totalTokensK
    FROM token_usage
    GROUP BY project_group_id
  `).all();
}

function countDoneByProjectGroup(doneKanbanGroupId) {
  return db.prepare(`
    SELECT
      project_group_id AS projectGroupId,
      COUNT(*) AS totalDone
    FROM tasks
    WHERE kanban_group_id = ? AND deleted_at IS NULL
    GROUP BY project_group_id
  `).all(doneKanbanGroupId);
}

module.exports = { record, sumByProjectGroup, countDoneByProjectGroup };