(function() {
  var currentTaskId = null;
  var term = null;
  var fitAddon = null;

  function createTerminal(containerId) {
    var container = document.getElementById(containerId);
    if (!container || term) return;

    term = new Terminal({
      cursorBlink: false,
      fontSize: 12,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
      },
      disableStdin: true,
      scrollback: 10000,
    });

    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    requestAnimationFrame(function() {
      fitAddon.fit();
    });
  }

  function destroyTerminal() {
    if (term) {
      term.dispose();
      term = null;
      fitAddon = null;
    }
  }

  function openProgress(taskId) {
    currentTaskId = taskId;
    destroyTerminal();

    var panel = document.getElementById('taskProgressPanel');
    var titleEl = document.getElementById('taskProgressTitle');

    titleEl.textContent = 'Task Progress \u2014 ' + taskId;
    panel.classList.add('visible');

    setTimeout(function() {
      createTerminal('taskProgressTerminal');
      loadHistory(taskId);
    }, 100);

    if (window.WsClient) {
      WsClient.connect('task:' + taskId, function(msg) {
        if (msg.data && msg.data.data && msg.data.type === 'log' && term) {
          term.write(msg.data.data);
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

  function close() {
    if (window.WsClient && currentTaskId) {
      WsClient.disconnect('task:' + currentTaskId);
    }
    currentTaskId = null;
    destroyTerminal();
    var panel = document.getElementById('taskProgressPanel');
    if (panel) panel.classList.remove('visible');
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

    var resizeTimeout;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(function() {
        if (fitAddon && term) {
          fitAddon.fit();
        }
      }, 150);
    });

    var observer = new ResizeObserver(function() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(function() {
        if (fitAddon && term) {
          fitAddon.fit();
        }
      }, 100);
    });
    var panel = document.getElementById('taskProgressPanel');
    if (panel) observer.observe(panel);
  });
})();
