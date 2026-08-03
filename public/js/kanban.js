(function() {
  let kanbanData = [];
  let taskData = [];
  let linkingMode = null;
  let linkingFromTaskId = null;

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

    const html = '<div class="kanban-board" id="kanbanBoardInner">' + kanbanData.map(function(kg) {
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
        const linkBtnClass = linkingMode && linkingFromTaskId === t.id ? ' task-card-link-active' : '';

        let nextRunHtml = '';
        if (t.next_run_task_id) {
          nextRunHtml = '<div class="task-card-next-run">next run: ' + escapeHtml(t.next_run_task_id) + '</div>';
        }

        let linkBtnTitle = 'Link to next task';
        let linkBtnOnclick = 'KanbanBoard.startLink(\'' + t.id + '\')';
        let linkBtnSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/></svg>';

        if (linkingMode && linkingFromTaskId !== t.id) {
          linkBtnTitle = 'Drop link here';
          linkBtnOnclick = 'KanbanBoard.completeLink(\'' + t.id + '\')';
          linkBtnSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
        }

        if (linkingMode && linkingFromTaskId === t.id) {
          linkBtnTitle = 'Cancel link';
          linkBtnOnclick = 'KanbanBoard.cancelLink()';
          linkBtnSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        }

        const linkBtn = '<button class="btn btn-ghost btn-sm task-link-btn' + linkBtnClass + '" title="' + linkBtnTitle + '" onclick="' + linkBtnOnclick + '">' + linkBtnSvg + '</button>';

        return `
          <div class="${cardClass}${linkBtnClass}" draggable="true" data-task-id="${t.id}"
               ondragstart="KanbanBoard.onDragStart(event)" ondragend="KanbanBoard.onDragEnd(event)">
            <div class="task-card-header">
              <div class="task-card-id">${escapeHtml(t.id)}</div>
              ${linkBtn}
            </div>
            <div class="task-card-detail">${escapeHtml(detailSnippet)}</div>
            ${nextRunHtml}
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

    requestAnimationFrame(function() {
      drawConnectionLines();
    });
  }

  function drawConnectionLines() {
    var existing = document.getElementById('kanbanConnectionLines');
    if (existing) existing.remove();

    var board = document.getElementById('kanbanBoardInner');
    if (!board) return;

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'kanbanConnectionLines';
    svg.classList.add('kanban-connection-svg');
    svg.setAttribute('width', board.scrollWidth);
    svg.setAttribute('height', board.scrollHeight);

    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    var marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    var polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', 'var(--color-primary)');
    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);

    var boardRect = board.getBoundingClientRect();

    taskData.forEach(function(t) {
      if (!t.next_run_task_id) return;

      var sourceCard = board.querySelector('[data-task-id="' + t.id + '"]');
      var targetCard = board.querySelector('[data-task-id="' + t.next_run_task_id + '"]');
      if (!sourceCard || !targetCard) return;

      var sourceRect = sourceCard.getBoundingClientRect();
      var targetRect = targetCard.getBoundingClientRect();

      var x1 = sourceRect.right - boardRect.left + board.scrollLeft;
      var y1 = sourceRect.top - boardRect.top + board.scrollTop + sourceRect.height / 2;
      var x2 = targetRect.left - boardRect.left + board.scrollLeft;
      var y2 = targetRect.top - boardRect.top + board.scrollTop + targetRect.height / 2;

      if (x2 < x1) {
        x1 = sourceRect.left - boardRect.left + board.scrollLeft;
        x2 = targetRect.right - boardRect.left + board.scrollLeft;
      }

      var midX = (x1 + x2) / 2;

      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      var d = 'M ' + x1 + ' ' + y1 + ' C ' + midX + ' ' + y1 + ', ' + midX + ' ' + y2 + ', ' + x2 + ' ' + y2;
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'var(--color-primary)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-dasharray', '6 3');
      path.setAttribute('opacity', '0.6');
      path.setAttribute('marker-end', 'url(#arrowhead)');
      svg.appendChild(path);
    });

    board.style.position = 'relative';
    board.appendChild(svg);
  }

  function startLink(taskId) {
    if (linkingMode && linkingFromTaskId === taskId) {
      cancelLink();
      return;
    }
    linkingMode = true;
    linkingFromTaskId = taskId;
    renderBoard();
  }

  async function completeLink(targetTaskId) {
    if (!linkingFromTaskId || linkingFromTaskId === targetTaskId) {
      cancelLink();
      return;
    }

    await fetch('/api/tasks/' + linkingFromTaskId + '/next-run', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nextRunTaskId: targetTaskId })
    });

    linkingMode = false;
    linkingFromTaskId = null;
    loadBoard();
  }

  function cancelLink() {
    linkingMode = false;
    linkingFromTaskId = null;
    renderBoard();
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
        if (window.showNotification) {
          showNotification('Failed to start task: ' + (json.error || 'Unknown error'), 'error');
        } else {
          alert('Failed to start task: ' + (json.error || 'Unknown error'));
        }
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Start';
        }
        return;
      }
    } catch (e) {
      if (window.showNotification) {
        showNotification('Failed to start task: ' + e.message, 'error');
      } else {
        alert('Failed to start task: ' + e.message);
      }
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
    try {
      var res = await fetch('/api/tasks/' + taskId, { method: 'DELETE' });
      var json = await res.json();
      if (json.ok) {
        if (window.showNotification) {
          showNotification('Delete Success', 'success');
        }
      } else {
        if (window.showNotification) {
          showNotification('Delete Failed: ' + (json.error || 'Unknown error'), 'error');
        }
      }
    } catch (e) {
      if (window.showNotification) {
        showNotification('Delete Failed: ' + e.message, 'error');
      }
    }
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
      if (window.showNotification) {
        showNotification('Detail is required.', 'error');
      } else {
        alert('Detail is required.');
      }
      return;
    }

    try {
      var res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectGroupId: projectGroupId, detail: detail, aiProvider: aiProvider })
      });
      var json = await res.json();
      if (json.ok) {
        if (window.showNotification) {
          showNotification('Create Success', 'success');
        }
      } else {
        if (window.showNotification) {
          showNotification('Create Failed: ' + (json.error || 'Unknown error'), 'error');
        }
      }
    } catch (e) {
      if (window.showNotification) {
        showNotification('Create Failed: ' + e.message, 'error');
      }
    }

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
      if (window.showNotification) {
        showNotification('Detail is required.', 'error');
      } else {
        alert('Detail is required.');
      }
      return;
    }

    try {
      var res = await fetch('/api/tasks/' + taskId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detail: detail, aiProvider: aiProvider })
      });
      var json = await res.json();
      if (json.ok) {
        if (window.showNotification) {
          showNotification('Update Success', 'success');
        }
      } else {
        if (window.showNotification) {
          showNotification('Update Failed: ' + (json.error || 'Unknown error'), 'error');
        }
      }
    } catch (e) {
      if (window.showNotification) {
        showNotification('Update Failed: ' + e.message, 'error');
      }
    }

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
    openDeletedTasks: openDeletedTasks,
    startLink: startLink,
    completeLink: completeLink,
    cancelLink: cancelLink
  };

  document.addEventListener('DOMContentLoaded', function() {
    loadBoard();

    document.getElementById('projectGroupSelect').addEventListener('change', function() {
      var val = this.value;
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_project_group: val })
      }).catch(function() {});
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

    window.addEventListener('resize', function() {
      drawConnectionLines();
    });

    document.getElementById('kanbanView').addEventListener('scroll', function() {
      drawConnectionLines();
    });
  });
})();
