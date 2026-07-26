(function() {
  let currentView = 'kanban';
  let settings = {};
  let projectGroups = [];
  let kanbanGroups = [];
  let editingProjectGroup = null;
  let expandedGroupId = null;

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
    expandedGroupId = null;
    editingProjectGroup = null;
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

    container.innerHTML = `
      <div class="settings-page">
        <div class="settings-section">
          <div class="settings-section-title">General Settings</div>
          <div class="form-group" style="margin-bottom:0;">
            <label for="colorTheme">Select Theme</label>
            <select id="colorTheme" class="form-control">
              <option value="light-green-white">Light Green-White (Default)</option>
              <option value="dark-navy">Dark Navy</option>
            </select>
          </div>
        </div>

        <div class="settings-section" id="projectGroupSection">
          <div class="settings-section-title">Project Group</div>
          <table class="data-table" id="projectGroupTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="projectGroupBody"></tbody>
          </table>

          <div id="projectGroupFormContainer" style="margin-top:16px;">
            <div style="font-size:13px; font-weight:600; color:var(--color-text-muted); margin-bottom:8px;" id="pgFormTitle">Add Project Group</div>
            <div class="inline-form" style="flex-direction:column; align-items:stretch;">
              <div style="display:flex; gap:8px; align-items:flex-end; margin-bottom:12px;">
                <div class="form-group" style="flex:1; margin-bottom:0;">
                  <label>Name</label>
                  <input type="text" id="pgName" placeholder="e.g. RMS">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label>&nbsp;</label>
                  <label class="toggle-switch" style="display:flex; align-items:center; gap:8px; white-space:nowrap;">
                    <input type="checkbox" id="pgUseAlias">
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div style="margin-bottom:0; font-size:12px; color:var(--color-text-muted);" id="pgAliasLabel">
                  Use Alias Mapping: <strong id="pgAliasStrong">no</strong>
                </div>
              </div>

              <div id="pgSimplePath" style="margin-bottom:12px;">
                <div class="form-group" style="margin-bottom:0;">
                  <label>Path to Project</label>
                  <input type="text" id="pgPath" placeholder="/path/to/project">
                </div>
              </div>

              <div id="pgAliasForm" style="display:none; margin-bottom:12px;">
                <div style="font-size:12px; color:var(--color-text-muted); margin-bottom:8px;">Alias Mappings (name + path + WD checkbox):</div>
                <div id="pgAliasRows"></div>
                <button class="btn btn-ghost btn-sm" id="btnAddAlias" type="button" style="margin-top:8px;">+ Add Alias</button>
              </div>

              <div style="display:flex; gap:8px;">
                <button class="btn btn-primary" id="btnSaveProjectGroup">Save</button>
                <button class="btn btn-ghost" id="btnCancelProjectGroup" style="display:none">Cancel</button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section" id="kanbanGroupSection">
          <div class="settings-section-title">Kanban Group Setting</div>
          <div id="kanbanGroupProjectSelect" style="margin-bottom:12px;">
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
    var colorThemeSelect = document.getElementById('colorTheme');
    if (colorThemeSelect) {
      colorThemeSelect.value = settings.color_theme || 'light-green-white';
      colorThemeSelect.addEventListener('change', function() {
        var theme = this.value;
        settings.color_theme = theme;
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ color_theme: theme })
        }).then(function(res) { return res.json(); })
          .then(function(data) {
            settings = data.data;
            document.body.setAttribute('data-theme', theme);
            localStorage.setItem('color_theme', theme);
          });
      });
    }

    document.getElementById('btnSaveProjectGroup').addEventListener('click', saveProjectGroup);
    document.getElementById('btnCancelProjectGroup').addEventListener('click', cancelEditProjectGroup);

    var pgUseAlias = document.getElementById('pgUseAlias');
    pgUseAlias.addEventListener('change', function() {
      var checked = this.checked;
      document.getElementById('pgAliasStrong').textContent = checked ? 'yes' : 'no';
      document.getElementById('pgSimplePath').style.display = checked ? 'none' : '';
      document.getElementById('pgAliasForm').style.display = checked ? '' : 'none';
    });

    document.getElementById('btnAddAlias').addEventListener('click', function() {
      addAliasRow('', '');
    });

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

  function addAliasRow(name, path, isWorkingDirectory) {
    var container = document.getElementById('pgAliasRows');
    var row = document.createElement('div');
    row.className = 'pg-alias-row';
    row.style.cssText = 'display:flex; gap:8px; margin-bottom:8px; align-items:center;';
    row.innerHTML =
      '<input type="text" class="pg-alias-name" placeholder="e.g. frontend" value="' + escapeAttr(name) + '" style="flex:1; background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:6px 10px; border-radius:var(--radius); font-size:12px;">' +
      '<input type="text" class="pg-alias-path" placeholder="/path/to/project" value="' + escapeAttr(path) + '" style="flex:2; background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:6px 10px; border-radius:var(--radius); font-size:12px; font-family:monospace;">' +
      '<label class="pg-alias-wd-label" style="display:flex; align-items:center; gap:4px; white-space:nowrap; font-size:11px; color:var(--color-text-muted); cursor:pointer;" title="Jadikan working directory">' +
        '<input type="checkbox" class="pg-alias-wd" ' + (isWorkingDirectory ? 'checked' : '') + ' style="cursor:pointer;">' +
        'WD' +
      '</label>' +
      '<button class="btn btn-danger btn-sm pg-alias-remove" type="button">&times;</button>';
    row.querySelector('.pg-alias-remove').addEventListener('click', function() {
      row.remove();
    });
    row.querySelector('.pg-alias-wd').addEventListener('change', function() {
      if (this.checked) {
        var rows = container.querySelectorAll('.pg-alias-row');
        rows.forEach(function(r) {
          if (r !== row) {
            var cb = r.querySelector('.pg-alias-wd');
            if (cb) cb.checked = false;
          }
        });
      }
    });
    container.appendChild(row);
  }

  function renderProjectGroupTable() {
    return loadProjectGroups().then(function() {
      var tbody = document.getElementById('projectGroupBody');
      if (!tbody) return;

      var rows = [];

      rows.push('<tr class="pg-default-row">' +
        '<td>' +
          '<button class="btn btn-primary btn-sm pg-name-btn' + (expandedGroupId === 'default' ? ' pg-name-btn-active' : '') + '" onclick="SettingsPage.toggleDetail(\'default\')" style="text-align:left;">default</button>' +
        '</td>' +
        '<td class="actions">' +
          '<button class="btn btn-danger btn-sm" disabled style="opacity:0.5;cursor:not-allowed;">Delete</button>' +
        '</td>' +
      '</tr>');

      if (expandedGroupId === 'default') {
        var defaultPath = getDefaultAliasPath();
        rows.push('<tr class="pg-detail-row"><td colspan="2"><div class="pg-detail-content">' +
          '<div style="font-size:12px; color:var(--color-text-muted); margin-bottom:8px;">Path to Project (default):</div>' +
          '<div style="display:flex; gap:8px; align-items:center;">' +
            '<input type="text" id="defaultPathInput" value="' + escapeAttr(defaultPath) + '" placeholder="/path/to/project" style="flex:1; background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:6px 10px; border-radius:var(--radius); font-size:12px; font-family:monospace;">' +
            '<button class="btn btn-primary btn-sm" onclick="SettingsPage.saveDefaultPath()">Save</button>' +
          '</div>' +
        '</div></td></tr>');
      }

      projectGroups.forEach(function(pg) {
        var isExpanded = expandedGroupId === pg.id;
        rows.push('<tr>' +
          '<td>' +
            '<button class="btn btn-primary btn-sm pg-name-btn' + (isExpanded ? ' pg-name-btn-active' : '') + '" onclick="SettingsPage.toggleDetail(\'' + pg.id + '\')" style="text-align:left;">' + escapeHtml(pg.name) + '</button>' +
          '</td>' +
          '<td class="actions">' +
            '<button class="btn btn-danger btn-sm" onclick="SettingsPage.deleteProjectGroup(\'' + pg.id + '\')">Delete</button>' +
          '</td>' +
        '</tr>');

        if (isExpanded) {
          var useAlias = pg.use_alias_mapping === 1;
          var aliasRows = pg.aliases || [];
          var aliasRowsHtml = '';
          aliasRows.forEach(function(a) {
            var wdChecked = a.is_working_directory === 1 ? 'checked' : '';
            aliasRowsHtml += '<div class="pg-alias-row" style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">' +
              '<input type="text" class="pg-alias-name" value="' + escapeAttr(a.name) + '" placeholder="e.g. frontend" style="flex:1; background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:6px 10px; border-radius:var(--radius); font-size:12px;">' +
              '<input type="text" class="pg-alias-path" value="' + escapeAttr(a.path) + '" placeholder="/path/to/project" style="flex:2; background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:6px 10px; border-radius:var(--radius); font-size:12px; font-family:monospace;">' +
              '<label class="pg-alias-wd-label" style="display:flex; align-items:center; gap:4px; white-space:nowrap; font-size:11px; color:var(--color-text-muted); cursor:pointer;" title="Jadikan working directory">' +
                '<input type="checkbox" class="pg-alias-wd" data-id="' + a.id + '" ' + wdChecked + ' style="cursor:pointer;">' +
                'WD' +
              '</label>' +
              '<button class="btn btn-danger btn-sm pg-alias-remove" type="button" onclick="this.parentElement.remove()">&times;</button>' +
            '</div>';
          });

          var nameInputHtml = '<div style="display:flex; gap:8px; align-items:flex-end; margin-bottom:12px;">' +
            '<div style="flex:1;">' +
              '<div style="font-size:12px; color:var(--color-text-muted); margin-bottom:4px;">Name</div>' +
              '<input type="text" id="pgDetailName_' + pg.id + '" value="' + escapeAttr(pg.name) + '" style="width:100%; background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:6px 10px; border-radius:var(--radius); font-size:12px;">' +
            '</div>' +
            '<div style="display:flex; align-items:center; gap:8px;">' +
              '<label class="toggle-switch" style="display:flex; align-items:center; gap:8px; white-space:nowrap;">' +
                '<input type="checkbox" id="pgDetailUseAlias_' + pg.id + '" ' + (useAlias ? 'checked' : '') + ' onchange="SettingsPage.toggleDetailUseAlias(\'' + pg.id + '\', this.checked)">' +
                '<span class="toggle-slider"></span>' +
              '</label>' +
              '<div style="font-size:12px; color:var(--color-text-muted);">Use Alias Mapping: <strong id="pgDetailAliasStrong_' + pg.id + '">' + (useAlias ? 'yes' : 'no') + '</strong></div>' +
            '</div>' +
          '</div>';

          var simplePathHtml = '<div id="pgDetailSimplePath_' + pg.id + '" style="' + (useAlias ? 'display:none;' : '') + '">' +
            '<div style="font-size:12px; color:var(--color-text-muted); margin-bottom:4px;">Path to Project</div>' +
            '<div style="display:flex; gap:8px; align-items:center;">' +
              '<input type="text" id="pgDetailPath_' + pg.id + '" value="' + escapeAttr(getDefaultAliasPathForGroup(pg)) + '" placeholder="/path/to/project" style="flex:1; background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:6px 10px; border-radius:var(--radius); font-size:12px; font-family:monospace;">' +
            '</div>' +
          '</div>';

          var aliasFormHtml = '<div id="pgDetailAliasForm_' + pg.id + '" style="' + (useAlias ? '' : 'display:none;') + '">' +
            '<div style="font-size:12px; color:var(--color-text-muted); margin-bottom:4px;">Alias Mappings (name + path + WD checkbox):</div>' +
            '<div id="pgDetailAliasRows_' + pg.id + '">' + aliasRowsHtml + '</div>' +
            '<button class="btn btn-ghost btn-sm" onclick="SettingsPage.addDetailAliasRow(\'' + pg.id + '\')" style="margin-top:8px;">+ Add Alias</button>' +
          '</div>';

          rows.push('<tr class="pg-detail-row"><td colspan="2"><div class="pg-detail-content">' + nameInputHtml + simplePathHtml + aliasFormHtml +
            '<div style="margin-top:12px; display:flex; gap:8px;">' +
              '<button class="btn btn-primary btn-sm" onclick="SettingsPage.saveDetailGroup(\'' + pg.id + '\')">Save</button>' +
            '</div>' +
          '</div></td></tr>');
        }
      });

      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="color:var(--color-text-muted); text-align:center;">No project groups yet.</td></tr>';
      } else {
        tbody.innerHTML = rows.join('');
      }
    });
  }

  function getDefaultAliasPath() {
    var defaultAliasMapping = settings._defaultAliasMapping;
    if (defaultAliasMapping && defaultAliasMapping.path) return defaultAliasMapping.path;
    return '';
  }

  function getDefaultAliasPathForGroup(pg) {
    if (pg.aliases && pg.aliases.length > 0) {
      var defaultAlias = pg.aliases.find(function(a) { return a.name === 'default'; });
      if (defaultAlias) return defaultAlias.path;
      return pg.aliases[0].path;
    }
    return '';
  }

  async function saveProjectGroup() {
    var name = document.getElementById('pgName').value.trim();
    if (!name) {
      alert('Name is required.');
      return;
    }

    var useAlias = document.getElementById('pgUseAlias').checked;
    var payload = { name: name, useAliasMapping: useAlias };

    if (useAlias) {
      var aliasRows = document.querySelectorAll('#pgAliasRows .pg-alias-row');
      var aliases = [];
      aliasRows.forEach(function(row) {
        var aName = row.querySelector('.pg-alias-name').value.trim();
        var aPath = row.querySelector('.pg-alias-path').value.trim();
        var aWd = row.querySelector('.pg-alias-wd').checked;
        if (aName && aPath) {
          aliases.push({ name: aName, path: aPath, isWorkingDirectory: aWd });
        }
      });
      if (aliases.length === 0) {
        alert('Add at least one alias mapping.');
        return;
      }
      payload.aliases = aliases;
    } else {
      var path = document.getElementById('pgPath').value.trim();
      if (!path) {
        alert('Path to project is required.');
        return;
      }
      payload.path = path;
    }

    if (editingProjectGroup) {
      await fetch('/api/project-groups/' + editingProjectGroup, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      await fetch('/api/project-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
    document.getElementById('pgUseAlias').checked = false;
    document.getElementById('pgAliasStrong').textContent = 'no';
    document.getElementById('pgSimplePath').style.display = '';
    document.getElementById('pgAliasForm').style.display = 'none';
    document.getElementById('pgAliasRows').innerHTML = '';
    document.getElementById('btnSaveProjectGroup').textContent = 'Save';
    document.getElementById('btnCancelProjectGroup').style.display = 'none';
    document.getElementById('pgFormTitle').textContent = 'Add Project Group';
  }

  function editProjectGroup(id) {
    var pg = projectGroups.find(function(p) { return p.id === id; });
    if (!pg) return;

    editingProjectGroup = id;
    document.getElementById('pgName').value = pg.name;
    document.getElementById('pgFormTitle').textContent = 'Edit Project Group';
    document.getElementById('btnSaveProjectGroup').textContent = 'Update';
    document.getElementById('btnCancelProjectGroup').style.display = '';

    var useAlias = pg.use_alias_mapping === 1;
    document.getElementById('pgUseAlias').checked = useAlias;
    document.getElementById('pgAliasStrong').textContent = useAlias ? 'yes' : 'no';
    document.getElementById('pgSimplePath').style.display = useAlias ? 'none' : '';
    document.getElementById('pgAliasForm').style.display = useAlias ? '' : 'none';

    var aliasRows = document.getElementById('pgAliasRows');
    aliasRows.innerHTML = '';

    if (useAlias && pg.aliases && pg.aliases.length > 0) {
      pg.aliases.forEach(function(a) {
        addAliasRow(a.name, a.path, a.is_working_directory === 1);
      });
    } else if (!useAlias) {
      var simplePath = getDefaultAliasPathForGroup(pg);
      document.getElementById('pgPath').value = simplePath;
    }
  }

  async function deleteProjectGroup(id) {
    if (!confirm('Delete this project group?')) return;
    await fetch('/api/project-groups/' + id, { method: 'DELETE' });
    if (expandedGroupId === id) expandedGroupId = null;
    await renderProjectGroupTable();
    updateProjectGroupDropdown();
  }

  function toggleDetail(id) {
    editingProjectGroup = null;
    cancelEditProjectGroup();

    if (expandedGroupId === id) {
      expandedGroupId = null;
    } else {
      expandedGroupId = id;
    }
    renderProjectGroupTable();
  }

  function addDetailAliasRow(pgId) {
    var container = document.getElementById('pgDetailAliasRows_' + pgId);
    if (!container) return;
    var row = document.createElement('div');
    row.className = 'pg-alias-row';
    row.style.cssText = 'display:flex; gap:8px; margin-bottom:8px; align-items:center;';
    row.innerHTML =
      '<input type="text" class="pg-alias-name" placeholder="e.g. frontend" value="" style="flex:1; background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:6px 10px; border-radius:var(--radius); font-size:12px;">' +
      '<input type="text" class="pg-alias-path" placeholder="/path/to/project" value="" style="flex:2; background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:6px 10px; border-radius:var(--radius); font-size:12px; font-family:monospace;">' +
      '<label class="pg-alias-wd-label" style="display:flex; align-items:center; gap:4px; white-space:nowrap; font-size:11px; color:var(--color-text-muted); cursor:pointer;" title="Jadikan working directory">' +
        '<input type="checkbox" class="pg-alias-wd" style="cursor:pointer;">' +
        'WD' +
      '</label>' +
      '<button class="btn btn-danger btn-sm pg-alias-remove" type="button" onclick="this.parentElement.remove()">&times;</button>';
    row.querySelector('.pg-alias-wd').addEventListener('change', function() {
      if (this.checked) {
        var rows = container.querySelectorAll('.pg-alias-row');
        rows.forEach(function(r) {
          if (r !== row) {
            var cb = r.querySelector('.pg-alias-wd');
            if (cb) cb.checked = false;
          }
        });
      }
    });
    container.appendChild(row);
  }

  function toggleDetailUseAlias(pgId, checked) {
    var aliasStrong = document.getElementById('pgDetailAliasStrong_' + pgId);
    var simplePath = document.getElementById('pgDetailSimplePath_' + pgId);
    var aliasForm = document.getElementById('pgDetailAliasForm_' + pgId);
    if (aliasStrong) aliasStrong.textContent = checked ? 'yes' : 'no';
    if (simplePath) simplePath.style.display = checked ? 'none' : '';
    if (aliasForm) aliasForm.style.display = checked ? '' : 'none';
  }

  async function saveDetailGroup(pgId) {
    var pg = projectGroups.find(function(p) { return p.id === pgId; });
    if (!pg) return;

    var nameInput = document.getElementById('pgDetailName_' + pgId);
    var useAliasCheckbox = document.getElementById('pgDetailUseAlias_' + pgId);
    var name = nameInput ? nameInput.value.trim() : pg.name;
    var useAlias = useAliasCheckbox ? useAliasCheckbox.checked : pg.use_alias_mapping === 1;

    if (!name) {
      alert('Name is required.');
      return;
    }

    var payload = { name: name, useAliasMapping: useAlias };

    if (useAlias) {
      var aliasRows = document.querySelectorAll('#pgDetailAliasRows_' + pgId + ' .pg-alias-row');
      var aliases = [];
      aliasRows.forEach(function(row) {
        var aName = row.querySelector('.pg-alias-name').value.trim();
        var aPath = row.querySelector('.pg-alias-path').value.trim();
        var aWd = row.querySelector('.pg-alias-wd').checked;
        if (aName && aPath) {
          aliases.push({ name: aName, path: aPath, isWorkingDirectory: aWd });
        }
      });
      if (aliases.length === 0) {
        alert('Add at least one alias mapping.');
        return;
      }
      payload.aliases = aliases;
    } else {
      var pathEl = document.getElementById('pgDetailPath_' + pgId);
      var path = pathEl ? pathEl.value.trim() : '';
      if (!path) {
        alert('Path to project is required.');
        return;
      }
      payload.path = path;
    }

    await fetch('/api/project-groups/' + pgId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    await renderProjectGroupTable();
    updateProjectGroupDropdown();
  }

  async function saveDefaultPath() {
    var pathEl = document.getElementById('defaultPathInput');
    var path = pathEl ? pathEl.value.trim() : '';
    if (!path) {
      alert('Path to project is required.');
      return;
    }

    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_project_path: path })
    });

    settings.default_project_path = path;
    await renderProjectGroupTable();
  }

  async function renderKanbanGroupTable() {
    await loadProjectGroups();
    var pgSelect = document.getElementById('kanbanPgSelect');

    pgSelect.innerHTML = '<option value="default">default</option>' +
      projectGroups.map(function(pg) {
        return '<option value="' + pg.id + '">' + escapeHtml(pg.name) + '</option>';
      }).join('');

    pgSelect.onchange = function() {
      loadAndRenderKanbanGroups(this.value);
    };

    await loadAndRenderKanbanGroups('default');
  }

  async function loadAndRenderKanbanGroups(pgId) {
    var actualPgId = pgId === 'default' ? null : pgId;
    await loadKanbanGroups(actualPgId);

    if (pgId !== 'default' && pgId && kanbanGroups.length === 0) {
      await fetch('/api/kanban-groups/seed-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_group_id: pgId })
      });
      await loadKanbanGroups(pgId);
    }

    renderKanbanGroupRows();
  }

  function renderKanbanGroupRows() {
    var tbody = document.getElementById('kanbanGroupBody');
    if (!tbody) return;

    if (kanbanGroups.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="color:var(--color-text-muted); text-align:center;">No kanban groups.</td></tr>';
      return;
    }

    tbody.innerHTML = kanbanGroups.map(function(kg) {
      var isLocked = kg.is_locked_todo || kg.is_locked_done;
      var canDelete = !kg.is_locked_todo && !kg.is_locked_done && !kg.is_locked_delete;

      var nextOptions = kanbanGroups
        .filter(function(k) { return k.id !== kg.id; })
        .map(function(k) {
          var selected = kg.next_step_group_id === k.id ? 'selected' : '';
          return '<option value="' + k.id + '" ' + selected + '>' + escapeHtml(k.name) + '</option>';
        }).join('');

      return '<tr>' +
        '<td><input type="text" class="kg-name" data-id="' + kg.id + '" value="' + escapeAttr(kg.name) + '" ' + (isLocked ? 'disabled' : '') + ' style="background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:4px 8px; border-radius:var(--radius); font-size:12px; width:120px;"></td>' +
        '<td style="font-family:monospace; font-size:12px;">' + escapeHtml(kg.slash_command) + '</td>' +
        '<td><select class="kg-next-step" data-id="' + kg.id + '" ' + (isLocked ? 'disabled' : '') + ' style="background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:4px 8px; border-radius:var(--radius); font-size:12px;"><option value="">None</option>' + nextOptions + '</select></td>' +
        '<td><textarea class="kg-instruction" data-id="' + kg.id + '" rows="2" ' + (isLocked && kg.is_locked_todo ? 'disabled' : '') + ' placeholder="' + (isLocked && kg.is_locked_todo ? 'Locked' : 'Instruction...') + '" style="background:var(--color-bg); border:1px solid var(--color-border); color:var(--color-text); padding:4px 8px; border-radius:var(--radius); font-size:12px; width:140px; resize:vertical; font-family:inherit;">' + escapeHtml(kg.instruction || '') + '</textarea></td>' +
        '<td class="actions">' +
          (!isLocked ? '<button class="btn btn-ghost btn-sm" onclick="SettingsPage.saveKanbanGroup(\'' + kg.id + '\')">Save</button>' : '') +
          (canDelete ? '<button class="btn btn-danger btn-sm" onclick="SettingsPage.deleteKanbanGroup(\'' + kg.id + '\')">Delete</button>' : '') +
        '</td></tr>';
    }).join('');
  }

  async function addKanbanGroup() {
    var name = document.getElementById('kgName').value.trim();
    if (!name) {
      alert('Name is required.');
      return;
    }

    var slashCommand = '/' + name.toLowerCase().replace(/\s+/g, '-');
    var pgSelect = document.getElementById('kanbanPgSelect');
    var projectGroupId = pgSelect && pgSelect.value !== 'default' ? pgSelect.value : null;

    await fetch('/api/kanban-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, slashCommand: slashCommand, projectGroupId: projectGroupId })
    });

    document.getElementById('kgName').value = '';
    await renderKanbanGroupTable();
  }

  async function saveKanbanGroup(id) {
    var nameEl = document.querySelector('.kg-name[data-id="' + id + '"]');
    var nextEl = document.querySelector('.kg-next-step[data-id="' + id + '"]');
    var instrEl = document.querySelector('.kg-instruction[data-id="' + id + '"]');

    var newName = nameEl ? nameEl.value.trim() : null;
    var slashCommand = newName ? '/' + newName.toLowerCase().replace(/\s+/g, '-') : undefined;

    await fetch('/api/kanban-groups/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName || undefined,
        slash_command: slashCommand,
        nextStepGroupId: nextEl ? nextEl.value || null : null,
        instruction: instrEl ? instrEl.value || null : null
      })
    });

    await renderKanbanGroupTable();
  }

  async function deleteKanbanGroup(id) {
    if (!confirm('Delete this kanban group?')) return;
    var res = await fetch('/api/kanban-groups/' + id, { method: 'DELETE' });
    if (!res.ok) {
      var data = await res.json();
      alert(data.error || 'Failed to delete.');
    }
    await renderKanbanGroupTable();
  }

  async function updateProjectGroupDropdown() {
    await loadProjectGroups();
    var select = document.getElementById('projectGroupSelect');
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
    toggleDetail: toggleDetail,
    addDetailAliasRow: addDetailAliasRow,
    toggleDetailUseAlias: toggleDetailUseAlias,
    saveDetailGroup: saveDetailGroup,
    saveDefaultPath: saveDefaultPath,
    saveKanbanGroup: saveKanbanGroup,
    deleteKanbanGroup: deleteKanbanGroup,
    updateDropdown: updateProjectGroupDropdown
  };
})();
