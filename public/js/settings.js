(function() {
  let currentView = 'kanban';
  let settings = {};
  let projectGroups = [];
  let kanbanGroups = [];
  let editingProjectGroup = null;
  let editingKanbanGroup = null;

  const views = {
    kanban: document.getElementById('kanbanView'),
    list: document.getElementById('listView'),
    settings: document.getElementById('settingsView')
  };

  function showView(name) {
    Object.keys(views).forEach(function(key) {
      views[key].classList.toggle('active', key === name);
    });
    currentView = name;

    document.querySelectorAll('.view-toggle').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.view === name);
    });

    if (name === 'settings') {
      loadSettings();
    }
  }

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      settings = await res.json();
    } catch (e) {
      settings = {};
    }
    renderSettings();
  }

  async function loadProjectGroups() {
    try {
      const res = await fetch('/api/project-groups');
      const data = await res.json();
      projectGroups = data.data || data || [];
    } catch (e) {
      projectGroups = [];
    }
  }

  async function loadKanbanGroups(projectGroupId) {
    try {
      let url = '/api/kanban-groups';
      if (projectGroupId) {
        url += '?project_group_id=' + projectGroupId;
      }
      const res = await fetch(url);
      const data = await res.json();
      kanbanGroups = data.data || data || [];
    } catch (e) {
      kanbanGroups = [];
    }
  }

  function renderSettings() {
    const container = views.settings;
    const useGrouping = settings.use_grouping_project === true || settings.use_grouping_project === 'true';

    container.innerHTML = `
      <div class="settings-page">
        <div class="settings-section">
          <div class="settings-section-title">General Settings</div>
          <div class="toggle-group">
            <label class="toggle-switch">
              <input type="checkbox" id="toggleGrouping" ${useGrouping ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
            <span class="toggle-label">Use Grouping Project? <strong>${useGrouping ? 'yes' : 'no'}</strong></span>
          </div>
        </div>

        <div class="settings-section" id="projectAliasSection" style="${useGrouping ? '' : 'display:none'}">
          <div class="settings-section-title">Project Alias Mapping</div>
          <table class="data-table" id="projectGroupTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Path</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="projectGroupBody"></tbody>
          </table>
          <div class="inline-form" id="projectGroupForm">
            <div class="form-group">
              <label>Name</label>
              <input type="text" id="pgName" placeholder="e.g. RMS">
            </div>
            <div class="form-group">
              <label>Path</label>
              <input type="text" id="pgPath" placeholder="/path/to/project">
            </div>
            <button class="btn btn-primary" id="btnSaveProjectGroup">Save</button>
            <button class="btn btn-ghost" id="btnCancelProjectGroup" style="display:none">Cancel</button>
          </div>
        </div>

        <div class="settings-section" id="kanbanGroupSection">
          <div class="settings-section-title">Kanban Group Setting</div>
          <div id="kanbanGroupProjectSelect" style="display:none; margin-bottom:12px;">
            <label style="font-size:13px; color:var(--color-text-muted); margin-right:8px;">Project Group:</label>
            <select id="kanbanPgSelect" style="background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:6px 12px; border-radius:var(--radius); font-size:13px;"></select>
          </div>
          <table class="data-table" id="kanbanGroupTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slash Command</th>
                <th>Next Step</th>
                <th>Instruction</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="kanbanGroupBody"></tbody>
          </table>
          <div class="inline-form" id="kanbanGroupForm">
            <div class="form-group">
              <label>Name</label>
              <input type="text" id="kgName" placeholder="e.g. TESTING">
            </div>
            <button class="btn btn-primary" id="btnAddKanbanGroup">Add Kanban Group</button>
          </div>
        </div>

        <div style="margin-top:16px;">
          <button class="btn btn-ghost" id="btnBackToBoard">Back to Board</button>
        </div>
      </div>
    `;

    bindSettingsEvents();
    renderProjectGroupTable();
    renderKanbanGroupTable();
  }

  function bindSettingsEvents() {
    document.getElementById('toggleGrouping').addEventListener('change', async function() {
      const val = this.checked;
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_grouping_project: val })
      });
      settings.use_grouping_project = val;
      document.getElementById('projectAliasSection').style.display = val ? '' : 'none';
      this.parentElement.nextElementSibling.querySelector('strong').textContent = val ? 'yes' : 'no';
      renderKanbanGroupTable();
    });

    document.getElementById('btnSaveProjectGroup').addEventListener('click', saveProjectGroup);
    document.getElementById('btnCancelProjectGroup').addEventListener('click', cancelEditProjectGroup);
    document.getElementById('btnAddKanbanGroup').addEventListener('click', addKanbanGroup);
    document.getElementById('btnBackToBoard').addEventListener('click', function() {
      showView('kanban');
    });

    document.querySelectorAll('.view-toggle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        showView(this.dataset.view);
      });
    });

    document.getElementById('btnSettings').addEventListener('click', function() {
      showView('settings');
    });
  }

  async function renderProjectGroupTable() {
    await loadProjectGroups();
    const tbody = document.getElementById('projectGroupBody');
    if (!tbody) return;

    if (projectGroups.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="color:var(--color-text-muted); text-align:center;">No project groups yet.</td></tr>';
      return;
    }

    tbody.innerHTML = projectGroups.map(function(pg) {
      return `
        <tr>
          <td>${escapeHtml(pg.name)}</td>
          <td style="font-family:monospace; font-size:12px;">${escapeHtml(pg.repo_path)}</td>
          <td class="actions">
            <button class="btn btn-ghost btn-sm" onclick="SettingsPage.editProjectGroup('${pg.id}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="SettingsPage.deleteProjectGroup('${pg.id}')">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function saveProjectGroup() {
    const name = document.getElementById('pgName').value.trim();
    const path = document.getElementById('pgPath').value.trim();

    if (!name || !path) {
      alert('Name and Path are required.');
      return;
    }

    if (editingProjectGroup) {
      await fetch('/api/project-groups/' + editingProjectGroup, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, repoPath: path })
      });
    } else {
      await fetch('/api/project-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, repoPath: path })
      });
    }

    cancelEditProjectGroup();
    await renderProjectGroupTable();
    updateProjectGroupDropdown();
  }

  function cancelEditProjectGroup() {
    editingProjectGroup = null;
    document.getElementById('pgName').value = '';
    document.getElementById('pgPath').value = '';
    document.getElementById('btnSaveProjectGroup').textContent = 'Save';
    document.getElementById('btnCancelProjectGroup').style.display = 'none';
  }

  function editProjectGroup(id) {
    const pg = projectGroups.find(function(p) { return p.id === id; });
    if (!pg) return;
    editingProjectGroup = id;
    document.getElementById('pgName').value = pg.name;
    document.getElementById('pgPath').value = pg.repo_path;
    document.getElementById('btnSaveProjectGroup').textContent = 'Update';
    document.getElementById('btnCancelProjectGroup').style.display = '';
  }

  async function deleteProjectGroup(id) {
    if (!confirm('Delete this project group?')) return;
    await fetch('/api/project-groups/' + id, { method: 'DELETE' });
    await renderProjectGroupTable();
    updateProjectGroupDropdown();
  }

  async function renderKanbanGroupTable() {
    const useGrouping = settings.use_grouping_project === true || settings.use_grouping_project === 'true';
    const pgSelect = document.getElementById('kanbanPgSelect');
    const pgSection = document.getElementById('kanbanGroupProjectSelect');

    if (useGrouping) {
      await loadProjectGroups();
      pgSection.style.display = '';
      pgSelect.innerHTML = projectGroups.map(function(pg) {
        return '<option value="' + pg.id + '">' + escapeHtml(pg.name) + '</option>';
      }).join('');

      pgSelect.onchange = function() {
        loadAndRenderKanbanGroups(this.value);
      };

      if (projectGroups.length > 0) {
        await loadAndRenderKanbanGroups(projectGroups[0].id);
      } else {
        kanbanGroups = [];
        renderKanbanGroupRows();
      }
    } else {
      pgSection.style.display = 'none';
      await loadKanbanGroups(null);
      renderKanbanGroupRows();
    }
  }

  async function loadAndRenderKanbanGroups(pgId) {
    await loadKanbanGroups(pgId);
    renderKanbanGroupRows();
  }

  function renderKanbanGroupRows() {
    const tbody = document.getElementById('kanbanGroupBody');
    if (!tbody) return;

    if (kanbanGroups.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="color:var(--color-text-muted); text-align:center;">No kanban groups.</td></tr>';
      return;
    }

    const otherGroups = kanbanGroups.filter(function(kg) {
      return !kg.is_locked_todo && !kg.is_locked_done;
    });

    tbody.innerHTML = kanbanGroups.map(function(kg) {
      const isLocked = kg.is_locked_todo || kg.is_locked_done;
      const nextOptions = kanbanGroups
        .filter(function(k) { return k.id !== kg.id; })
        .map(function(k) {
          const selected = kg.next_step_group_id === k.id ? 'selected' : '';
          return '<option value="' + k.id + '" ' + selected + '>' + escapeHtml(k.name) + '</option>';
        }).join('');

      return `
        <tr>
          <td>${escapeHtml(kg.name)}</td>
          <td style="font-family:monospace; font-size:12px;">${escapeHtml(kg.slash_command)}</td>
          <td>
            <select class="kg-next-step" data-id="${kg.id}" ${isLocked ? 'disabled' : ''} style="background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:4px 8px; border-radius:var(--radius); font-size:12px;">
              <option value="">None</option>
              ${nextOptions}
            </select>
          </td>
          <td>
            <input class="kg-instruction" data-id="${kg.id}" value="${escapeAttr(kg.instruction || '')}" ${isLocked && kg.is_locked_todo ? 'disabled' : ''} placeholder="${isLocked && kg.is_locked_todo ? 'Locked' : 'Instruction...'}" style="background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:4px 8px; border-radius:var(--radius); font-size:12px; width:140px;">
          </td>
          <td class="actions">
            ${!isLocked ? '<button class="btn btn-ghost btn-sm" onclick="SettingsPage.saveKanbanGroup(\'' + kg.id + '\')">Save</button>' : ''}
            ${!isLocked ? '<button class="btn btn-danger btn-sm" onclick="SettingsPage.deleteKanbanGroup(\'' + kg.id + '\')">Delete</button>' : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  async function addKanbanGroup() {
    const name = document.getElementById('kgName').value.trim();
    if (!name) {
      alert('Name is required.');
      return;
    }

    const slashCommand = '/' + name.toLowerCase().replace(/\s+/g, '-');
    const useGrouping = settings.use_grouping_project === true || settings.use_grouping_project === 'true';
    let projectGroupId = null;

    if (useGrouping) {
      const pgSelect = document.getElementById('kanbanPgSelect');
      projectGroupId = pgSelect ? pgSelect.value : null;
    }

    await fetch('/api/kanban-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        slashCommand: slashCommand,
        projectGroupId: projectGroupId
      })
    });

    document.getElementById('kgName').value = '';
    await renderKanbanGroupTable();
  }

  async function saveKanbanGroup(id) {
    const nextEl = document.querySelector('.kg-next-step[data-id="' + id + '"]');
    const instrEl = document.querySelector('.kg-instruction[data-id="' + id + '"]');

    await fetch('/api/kanban-groups/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nextStepGroupId: nextEl ? nextEl.value || null : null,
        instruction: instrEl ? instrEl.value || null : null
      })
    });

    await renderKanbanGroupTable();
  }

  async function deleteKanbanGroup(id) {
    if (!confirm('Delete this kanban group?')) return;
    const res = await fetch('/api/kanban-groups/' + id, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to delete.');
    }
    await renderKanbanGroupTable();
  }

  async function updateProjectGroupDropdown() {
    await loadProjectGroups();
    const select = document.getElementById('projectGroupSelect');
    if (!select) return;
    select.innerHTML = '<option value="default">default</option>' +
      projectGroups.map(function(pg) {
        return '<option value="' + pg.id + '">' + escapeHtml(pg.name) + '</option>';
      }).join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.SettingsPage = {
    showView: showView,
    editProjectGroup: editProjectGroup,
    deleteProjectGroup: deleteProjectGroup,
    saveKanbanGroup: saveKanbanGroup,
    deleteKanbanGroup: deleteKanbanGroup,
    updateDropdown: updateProjectGroupDropdown
  };
})();
