(function() {
  var currentTaskId = null;
  var term = null;
  var fitAddon = null;

  function createTerminal(containerId) {
    var container = document.getElementById(containerId);
    if (!container || term) return;

    term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
        black: '#0d1117',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#c9d1d9',
        brightBlack: '#484f58',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      allowProposedApi: true,
      scrollback: 10000,
    });

    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    try {
      var webLinksAddon = new WebLinksAddon.WebLinksAddon();
      term.loadAddon(webLinksAddon);
    } catch (e) {}

    term.open(container);

    requestAnimationFrame(function() {
      doFit();
    });

    term.onData(function(data) {
      if (!currentTaskId) return;
      fetch('/api/tasks/' + currentTaskId + '/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: data })
      }).catch(function() {
        // Task may have finished/no longer running -> ignore,
        // don't let errors bother the user. This is normal, not a bug.
      });
    });
  }

  function destroyTerminal() {
    if (term) {
      term.dispose();
      term = null;
      fitAddon = null;
    }
  }

  function sendResize() {
    if (!term || !currentTaskId) return;
    var dims = fitAddon.proposeDimensions();
    if (dims && dims.cols && dims.rows) {
      fetch('/api/tasks/' + currentTaskId + '/resize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols: dims.cols, rows: dims.rows })
      }).catch(function() {});
    }
  }

  function doFit() {
    if (fitAddon && term) {
      fitAddon.fit();
      sendResize();
    }
  }

  /**
   * Check task status and update Emergency Stop button visibility
   */
  async function checkTaskStatus(taskId) {
    var btn = document.getElementById('btnEmergencyStopTask');
    if (!btn) return;

    try {
      var res = await fetch('/api/tasks');
      var json = await res.json();
      var tasks = json.data || json || [];
      var task = tasks.find(function(t) { return t.id === taskId; });

      var isRunning = task && task.session_status === 'running';
      btn.style.display = isRunning ? '' : 'none';

      if (term) {
        term.options.disableStdin = !isRunning;
      }
    } catch (e) {
      btn.style.display = 'none';
    }
  }

  function openProgress(taskId) {
    currentTaskId = taskId;
    destroyTerminal();

    var panel = document.getElementById('taskProgressPanel');
    var titleEl = document.getElementById('taskProgressTitle');

    titleEl.textContent = 'Task Progress \u2014 ' + taskId;
    panel.classList.add('visible');

    // Check task status and show/hide Emergency Stop button
    checkTaskStatus(taskId);

    setTimeout(function() {
      createTerminal('taskProgressTerminal');
      loadHistory(taskId);
    }, 100);

      if (window.WsClient) {
      WsClient.connect('task:' + taskId, function(msg) {
        if (msg.data && msg.data.data && msg.data.type === 'log' && term) {
          term.write(msg.data.data);
        }
        // When task exits, update status immediately
        if (msg.data && msg.data.type === 'exit') {
          checkTaskStatus(taskId);
        }
      });

      // Also listen on board channel for task status updates
      WsClient.connect('board', function(msg) {
        var evt = msg && msg.data;
        if (evt && evt.type === 'task_updated' && evt.data && evt.data.id === taskId) {
          checkTaskStatus(taskId);
        }
      });
    }
  }

  async function loadHistory(taskId) {
    try {
      var res = await fetch('/api/tasks/' + taskId + '/events');
      var json = await res.json();
      var events = json.data || json || [];

      if (term) term.clear();

      events.forEach(function(event) {
        if (event.type === 'log' && event.content && term) {
          term.write(event.content);
        }
      });
    } catch (e) {
      console.error('Failed to load task history:', e);
    }
  }

  /**
   * Emergency stop the current running task
   */
  async function emergencyStop() {
    if (!currentTaskId) return;

    var btn = document.getElementById('btnEmergencyStopTask');
    if (!btn) return;

    if (!confirm('Are you sure you want to emergency stop this task?')) return;

    btn.disabled = true;
    btn.textContent = 'Stopping...';

    try {
      var res = await fetch('/api/tasks/' + currentTaskId + '/stop', { method: 'POST' });
      var json = await res.json();

      if (!json.ok) {
        if (window.showNotification) {
          showNotification('Failed to stop task: ' + (json.error || 'Unknown error'), 'error');
        } else {
          alert('Failed to stop task: ' + (json.error || 'Unknown error'));
        }
        btn.disabled = false;
        btn.textContent = 'Emergency Stop';
        return;
      }

      btn.style.display = 'none';
    } catch (e) {
      if (window.showNotification) {
        showNotification('Failed to stop task: ' + e.message, 'error');
      } else {
        alert('Failed to stop task: ' + e.message);
      }
      btn.disabled = false;
      btn.textContent = 'Emergency Stop';
    }
  }

  function close() {
    if (window.WsClient && currentTaskId) {
      WsClient.disconnect('task:' + currentTaskId);
    }
    currentTaskId = null;
    destroyTerminal();
    var panel = document.getElementById('taskProgressPanel');
    if (panel) panel.classList.remove('visible');

    // Hide Emergency Stop button on close
    var btn = document.getElementById('btnEmergencyStopTask');
    if (btn) {
      btn.style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Emergency Stop';
    }
  }

  window.TaskProgress = {
    open: openProgress,
    close: close
  };

  document.addEventListener('DOMContentLoaded', function() {
    var closeBtn = document.getElementById('btnCloseTaskProgress');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        close();
      });
    }

    // Emergency Stop button event listener
    var emergencyStopBtn = document.getElementById('btnEmergencyStopTask');
    if (emergencyStopBtn) {
      emergencyStopBtn.addEventListener('click', function() {
        emergencyStop();
      });
    }

    var resizeTimeout;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(doFit, 150);
    });

    var observer = new ResizeObserver(function() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(doFit, 100);
    });
    var panel = document.getElementById('taskProgressPanel');
    if (panel) observer.observe(panel);
  });
})();
