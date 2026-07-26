(function() {
  let kanbanData = [];
  let taskData = [];

  async function loadBoard() {
    const pgSelect = document.getElementById('projectGroupSelect');
    const projectGroupId = pgSelect ? pgSelect.value : null;

    try {
      let kgUrl = '/api/kanban-groups';
      if (projectGroupId && projectGroupId !== 'default') {
        kgUrl += '?project_group_id=' + projectGroupId;
      }
      const kgRes = await fetch(kgUrl);
      const kgJson = await kgRes.json();
      kanbanData = kgJson.data || kgJson || [];
      kanbanData.sort(function(a, b) { return a.position - b.position; });
    } catch (e) {
      kanbanData = [];
    }

    try {
      let tUrl = '/api/tasks';
      const params = [];
      if (projectGroupId && projectGroupId !== 'default') {
        params.push('project_group_id=' + projectGroupId);
      }
      if (params.length) tUrl += '?' + params.join('&');
      const tRes = await fetch(tUrl);
      const tJson = await tRes.json();
      taskData = tJson.data || tJson || [];
    } catch (e) {
      taskData = [];
    }

    renderBoard();
  }

  function renderBoard() {
    const container = document.getElementById('kanbanView');
    if (!container) return;

    if (kanbanData.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--color-text-muted);">No kanban groups found. Add some in Settings.</div>';
      return;
    }

    const html = '<div class="kanban-board">' + kanbanData.map(function(kg) {
      const tasks = taskData.filter(function(t) { return t.kanban_group_id === kg.id; });
      const isTodo = kg.is_locked_todo;
      const isDone = kg.is_locked_done;

      const cardsHtml = tasks.map(function(t) {
        const detailSnippet = (t.detail || '').substring(0, 100);
        const isRunning = t.session_status === 'running';
        const actionsHtml = [];
        if (isTodo) {
          if (isRunning) {
            actionsHtml.push('<button class="btn btn-success btn-sm btn-started" disabled>Running</button>');
          } else {
            actionsHtml.push('<button class="btn btn-success btn-sm" id="startBtn-' + t.id + '" onclick="KanbanBoard.startTask(\'' + t.id + '\')">Start</button>');
          }
        }
        if (isDone) {
          actionsHtml.push('<button class="btn btn-danger btn-sm" onclick="KanbanBoard.deleteTask(\'' + t.id + '\')">Delete</button>');
        }
        actionsHtml.push('<button class="btn btn-ghost btn-sm" onclick="KanbanBoard.editTask(\'' + t.id + '\')">Edit</button>');
        actionsHtml.push('<button class="btn btn-ghost btn-sm" onclick="KanbanBoard.viewTask(\'' + t.id + '\')">View</button>');

        const cardClass = isRunning ? 'task-card running' : 'task-card';

        return `
          <div class="${cardClass}" draggable="true" data-task-id="${t.id}"
               ondragstart="KanbanBoard.onDragStart(event)" ondragend="KanbanBoard.onDragEnd(event)">
            <div class="task-card-id">${escapeHtml(t.id)}</div>
            <div class="task-card-detail">${escapeHtml(detailSnippet)}</div>
            <div class="task-card-footer">
              <span class="task-card-provider">${escapeHtml(t.ai_provider)}</span>
              <div class="task-card-actions">${actionsHtml.join('')}</div>
            </div>
          </div>
        `;
      }).join('');

      const headerActions = [];
      if (isTodo) {
        headerActions.push('<button class="btn btn-primary btn-sm" onclick="KanbanBoard.openNewTaskModal()">+ New</button>');
      }
      if (isDone) {
        headerActions.push('<button class="btn btn-ghost btn-sm" onclick="KanbanBoard.openDeletedTasks()">Deleted</button>');
      }

      return `
        <div class="kanban-column" data-kanban-id="${kg.id}">
          <div class="kanban-column-header">
            <div class="col-title">
              ${escapeHtml(kg.name)}
              <span class="col-count">${tasks.length}</span>
            </div>
            <div class="col-actions">${headerActions.join('')}</div>
          </div>
          <div class="kanban-column-body"
               ondragover="KanbanBoard.onDragOver(event)"
               ondrop="KanbanBoard.onDrop(event)"
               ondragleave="KanbanBoard.onDragLeave(event)">
            ${cardsHtml}
          </div>
        </div>
      `;
    }).join('') + '</div>';

    container.innerHTML = html;
  }

  let draggedTaskId = null;

  function onDragStart(e) {
    draggedTaskId = e.target.dataset.taskId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedTaskId = null;
    document.querySelectorAll('.kanban-column-body').forEach(function(el) {
      el.classList.remove('drag-over');
    });
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
  }

  function onDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  async function onDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const column = e.currentTarget.closest('.kanban-column');
    const targetKanbanId = column.dataset.kanbanId;

    if (!draggedTaskId || !targetKanbanId) return;

    await fetch('/api/tasks/' + draggedTaskId + '/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetKanbanGroupId: targetKanbanId })
    });

    loadBoard();
  }

  async function startTask(taskId) {
    var btn = document.getElementById('startBtn-' + taskId);
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Starting...';
    }

    try {
      var res = await fetch('/api/tasks/' + taskId + '/start', { method: 'POST' });
      var json = await res.json();
      if (!json.ok) {
        alert('Failed to start task: ' + (json.error || 'Unknown error'));
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Start';
        }
        return;
      }
    } catch (e) {
      alert('Failed to start task: ' + e.message);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Start';
      }
      return;
    }

    loadBoard();
  }

  async function deleteTask(taskId) {
    if (!confirm('Delete this task?')) return;
    await fetch('/api/tasks/' + taskId, { method: 'DELETE' });
    loadBoard();
  }

  function viewTask(taskId) {
    if (window.TaskProgress) {
      TaskProgress.open(taskId);
    }
  }

  function openNewTaskModal() {
    var pgSelect = document.getElementById('projectGroupSelect');
    var projectGroupId = pgSelect && pgSelect.value !== 'default' ? pgSelect.value : null;

    var bodyHtml = '<div class="form-group">' +
      '<label>Task Detail</label>' +
      '<textarea id="newTaskDetail" rows="6" placeholder="Describe the task..."></textarea>' +
      '</div>' +
      '<div class="form-group">' +
      '<label>AI Provider</label>' +
      '<select id="newTaskProvider">' +
      '<option value="claude-code">Claude Code</option>' +
      '<option value="opencode">OpenCode</option>' +
      '</select></div>';

    var footerHtml = '<button class="btn btn-ghost" onclick="Modal.close()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="KanbanBoard.saveNewTask()">Save</button>';

    Modal.open('New Task', bodyHtml, footerHtml);
  }

  async function saveNewTask() {
    var detail = document.getElementById('newTaskDetail').value.trim();
    var aiProvider = document.getElementById('newTaskProvider').value;
    var pgSelect = document.getElementById('projectGroupSelect');
    var projectGroupId = pgSelect && pgSelect.value !== 'default' ? pgSelect.value : null;

    if (!detail) {
      alert('Detail is required.');
      return;
    }

    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectGroupId: projectGroupId, detail: detail, aiProvider: aiProvider })
    });

    Modal.close();
    loadBoard();
  }

  async function editTask(taskId) {
    var task = taskData.find(function(t) { return t.id === taskId; });
    if (!task) return;

    var bodyHtml = '<div class="form-group">' +
      '<label>Task Detail</label>' +
      '<textarea id="editTaskDetail" rows="6">' + escapeHtml(task.detail || '') + '</textarea>' +
      '</div>' +
      '<div class="form-group">' +
      '<label>AI Provider</label>' +
      '<select id="editTaskProvider">' +
      '<option value="claude-code"' + (task.ai_provider === 'claude-code' ? ' selected' : '') + '>Claude Code</option>' +
      '<option value="opencode"' + (task.ai_provider === 'opencode' ? ' selected' : '') + '>OpenCode</option>' +
      '</select></div>';

    var footerHtml = '<button class="btn btn-ghost" onclick="Modal.close()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="KanbanBoard.saveEditTask(\'' + taskId + '\')">Save</button>';

    Modal.open('Edit Task', bodyHtml, footerHtml);
  }

  async function saveEditTask(taskId) {
    var detail = document.getElementById('editTaskDetail').value.trim();
    var aiProvider = document.getElementById('editTaskProvider').value;

    if (!detail) {
      alert('Detail is required.');
      return;
    }

    await fetch('/api/tasks/' + taskId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detail: detail, aiProvider: aiProvider })
    });

    Modal.close();
    loadBoard();
  }

  function openDeletedTasks() {
    if (window.DeletedTask) {
      DeletedTask.open();
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.KanbanBoard = {
    load: loadBoard,
    onDragStart: onDragStart,
    onDragEnd: onDragEnd,
    onDragOver: onDragOver,
    onDragLeave: onDragLeave,
    onDrop: onDrop,
    startTask: startTask,
    deleteTask: deleteTask,
    viewTask: viewTask,
    openNewTaskModal: openNewTaskModal,
    saveNewTask: saveNewTask,
    editTask: editTask,
    saveEditTask: saveEditTask,
    openDeletedTasks: openDeletedTasks
  };

  document.addEventListener('DOMContentLoaded', function() {
    loadBoard();

    document.getElementById('projectGroupSelect').addEventListener('change', function() {
      loadBoard();
    });

    if (window.WsClient) {
      WsClient.connect('board', function(msg) {
        var evt = msg && msg.data;
        if (evt && evt.type && evt.type.startsWith('task_')) {
          loadBoard();
        }
      });
    }
  });
})();
