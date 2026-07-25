(function() {
  let taskData = [];

  async function loadList() {
    const pgSelect = document.getElementById('projectGroupSelect');
    const projectGroupId = pgSelect ? pgSelect.value : null;

    try {
      let tUrl = '/api/tasks';
      if (projectGroupId && projectGroupId !== 'default') {
        tUrl += '?project_group_id=' + projectGroupId;
      }
      const tRes = await fetch(tUrl);
      const tJson = await tRes.json();
      taskData = tJson.data || tJson || [];
    } catch (e) {
      taskData = [];
    }

    renderList();
  }

  function renderList() {
    const container = document.getElementById('listView');
    if (!container) return;

    if (taskData.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--color-text-muted);">No tasks found.</div>';
      return;
    }

    const rows = taskData.map(function(t) {
      const detailSnippet = (t.detail || '').substring(0, 80);
      return `
        <tr>
          <td style="font-family:monospace;">${escapeHtml(t.id)}</td>
          <td>${escapeHtml(detailSnippet)}</td>
          <td>${escapeHtml(t.kanban_group_id || '-')}</td>
          <td>${escapeHtml(t.ai_provider)}</td>
          <td>${escapeHtml(t.created_at || '-')}</td>
          <td class="actions">
            <button class="btn btn-ghost btn-sm" onclick="KanbanBoard.viewTask('${t.id}')">View</button>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="list-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Detail</th>
            <th>Kanban Group</th>
            <th>AI Provider</th>
            <th>Created At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.ListView = {
    load: loadList
  };

  document.addEventListener('DOMContentLoaded', function() {
    loadList();
  });
})();
