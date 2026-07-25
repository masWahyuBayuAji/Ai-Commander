(function() {
  async function openDeletedTasks() {
    try {
      var res = await fetch('/api/tasks/deleted');
      var json = await res.json();
      var tasks = json.data || json || [];

      var bodyHtml;
      if (tasks.length === 0) {
        bodyHtml = '<div style="text-align:center; padding:20px; color:var(--color-text-muted);">No deleted tasks.</div>';
      } else {
        bodyHtml = '<table class="data-table"><thead><tr>' +
          '<th>ID</th><th>Detail</th><th>Deleted At</th><th>Actions</th>' +
          '</tr></thead><tbody>' +
          tasks.map(function(t) {
            return '<tr>' +
              '<td style="font-family:monospace;">' + escapeHtml(t.id) + '</td>' +
              '<td>' + escapeHtml((t.detail || '').substring(0, 80)) + '</td>' +
              '<td>' + escapeHtml(t.deleted_at || '-') + '</td>' +
              '<td><button class="btn btn-success btn-sm" onclick="DeletedTask.restore(\'' + t.id + '\')">Move to To-Do</button></td>' +
              '</tr>';
          }).join('') +
          '</tbody></table>';
      }

      Modal.open('Deleted Tasks', bodyHtml, '');
    } catch (e) {
      console.error('Failed to load deleted tasks:', e);
    }
  }

  async function restore(taskId) {
    await fetch('/api/tasks/' + taskId + '/restore', { method: 'POST' });
    Modal.close();
    if (window.KanbanBoard) KanbanBoard.load();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.DeletedTask = {
    open: openDeletedTasks,
    restore: restore
  };
})();
