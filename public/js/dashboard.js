(function() {
  async function loadDashboard() {
    try {
      var res = await fetch('/api/dashboard/summary');
      var json = await res.json();
      var data = json.data || json || [];
      renderDashboard(data);
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    }
  }

  function renderDashboard(data) {
    var container = document.getElementById('dashboardSection');
    if (!container) return;

    if (data.length === 0) {
      container.innerHTML = '';
      return;
    }

    var rows = data.map(function(d) {
      return '<tr>' +
        '<td>' + escapeHtml(d.projectGroupName || d.projectGroupId || 'Global') + '</td>' +
        '<td>' + (d.totalTokensK || 0) + 'K</td>' +
        '<td>' + (d.totalDone || 0) + '</td>' +
        '</tr>';
    }).join('');

    container.innerHTML = '<div class="dashboard-section">' +
      '<div class="dashboard-title">Dashboard</div>' +
      '<table class="data-table">' +
      '<thead><tr><th>Project Group</th><th>Total Token Usage (K)</th><th>Total Task Done</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table></div>';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.Dashboard = {
    load: loadDashboard
  };

  document.addEventListener('DOMContentLoaded', function() {
    loadDashboard();

    if (window.WsClient) {
      WsClient.connect('board', function(msg) {
        var evt = msg && msg.data;
        if (evt && (evt.type === 'task_updated' || evt.type === 'task_created' || evt.type === 'task_deleted')) {
          loadDashboard();
        }
      });
    }
  });
})();
