(function() {
  async function loadProjectAliasMappings() {
    var pgSelect = document.getElementById('projectGroupSelect');
    var projectGroupId = pgSelect ? pgSelect.value : null;

    if (!projectGroupId || projectGroupId === 'default') {
      renderProjectAliasMappings([]);
      return;
    }

    try {
      var res = await fetch('/api/project-alias-mappings?project_group_id=' + projectGroupId);
      var json = await res.json();
      var data = json.data || json || [];
      renderProjectAliasMappings(data);
    } catch (e) {
      console.error('Failed to load project alias mappings:', e);
      renderProjectAliasMappings([]);
    }
  }

  function renderProjectAliasMappings(data) {
    var container = document.getElementById('projectAliasSection');
    if (!container) return;

    if (data.length === 0) {
      container.innerHTML = '<div class="dashboard-section">' +
        '<div class="dashboard-title">Project Alias Mapping</div>' +
        '<div style="text-align:center; padding:20px; color:var(--color-text-muted);">No alias mappings found for this project group.</div>' +
        '</div>';
      return;
    }

    var rows = data.map(function(alias) {
      var isWorkingDir = alias.is_working_directory === 1;
      var workingDirBadge = isWorkingDir ? '<span class="badge badge-success">Working Directory</span>' : '';
      return '<tr>' +
        '<td>' + escapeHtml(alias.name) + '</td>' +
        '<td><code class="path-code">' + escapeHtml(alias.path) + '</code></td>' +
        '<td>' + workingDirBadge + '</td>' +
        '</tr>';
    }).join('');

    container.innerHTML = '<div class="dashboard-section">' +
      '<div class="dashboard-title">Project Alias Mapping</div>' +
      '<table class="data-table">' +
      '<thead><tr><th>Name Alias</th><th>Path</th><th>Is Default Working Directory</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table></div>';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.ProjectAliasMapping = {
    load: loadProjectAliasMappings
  };

  document.addEventListener('DOMContentLoaded', function() {
    loadProjectAliasMappings();

    var pgSelect = document.getElementById('projectGroupSelect');
    if (pgSelect) {
      pgSelect.addEventListener('change', function() {
        loadProjectAliasMappings();
      });
    }

    if (window.WsClient) {
      WsClient.connect('board', function(msg) {
        var evt = msg && msg.data;
        if (evt && (evt.type === 'project_group_updated' || evt.type === 'project_alias_updated')) {
          loadProjectAliasMappings();
        }
      });
    }
  });
})();
