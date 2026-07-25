(function() {
  let currentTaskId = null;

  function openProgress(taskId) {
    currentTaskId = taskId;

    if (window.WsClient) {
      WsClient.disconnectAll();
    }

    var bodyHtml = '<div class="task-progress-container">' +
      '<pre class="task-progress-output" id="taskProgressOutput">Loading...</pre>' +
      '</div>';

    var footerHtml = '<button class="btn btn-ghost" onclick="TaskProgress.close()">Close</button>';

    Modal.open('Task Progress \u2014 ' + taskId, bodyHtml, footerHtml);

    var modal = document.querySelector('.modal');
    if (modal) modal.classList.add('modal-fullscreen');

    loadHistory(taskId);

    if (window.WsClient) {
      WsClient.connect('task:' + taskId, function(data) {
        if (data.content) {
          appendOutput(data.content);
        }
      });
    }
  }

  async function loadHistory(taskId) {
    try {
      var res = await fetch('/api/tasks/' + taskId + '/events');
      var json = await res.json();
      var events = json.data || json || [];
      var output = document.getElementById('taskProgressOutput');
      if (!output) return;

      output.textContent = '';
      events.forEach(function(event) {
        if (event.type === 'log' && event.content) {
          appendOutput(event.content);
        }
      });
    } catch (e) {
      console.error('Failed to load task history:', e);
    }
  }

  function appendOutput(text) {
    var output = document.getElementById('taskProgressOutput');
    if (!output) return;

    output.innerHTML += parseAnsi(text);
    output.scrollTop = output.scrollHeight;
  }

  function parseAnsi(text) {
    if (!text) return '';

    var result = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    var colorMap = {
      '30': '#000', '31': '#f44336', '32': '#4caf50', '33': '#ff9800',
      '34': '#2196f3', '35': '#9c27b0', '36': '#00bcd4', '37': '#eaeaea',
      '90': '#666', '91': '#ff6b6b', '92': '#69db7c', '93': '#ffd43b',
      '94': '#74c0fc', '95': '#da77f2', '96': '#66d9e8', '97': '#fff'
    };

    result = result.replace(/\x1b\[0m/g, '</span>');

    var codes = Object.keys(colorMap);
    for (var i = 0; i < codes.length; i++) {
      var code = codes[i];
      var regex = new RegExp('\\x1b\\[' + code + 'm', 'g');
      result = result.replace(regex, '<span style="color:' + colorMap[code] + '">');
    }

    result = result.replace(/\x1b\[[0-9;]*m/g, '');

    return result + '\n';
  }

  function close() {
    if (window.WsClient && currentTaskId) {
      WsClient.disconnect('task:' + currentTaskId);
    }
    currentTaskId = null;
    Modal.close();
  }

  window.TaskProgress = {
    open: openProgress,
    close: close
  };
})();
