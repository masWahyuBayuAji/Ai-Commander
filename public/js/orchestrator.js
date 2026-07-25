(function() {
  var term = null;
  var fitAddon = null;
  var started = false;
  var wsConnected = false;

  function createTerminal() {
    var container = document.getElementById('orchestratorTerminal');
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
      fetch('/api/orchestrator/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: data })
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

  function connectWebSocket() {
    if (!wsConnected && window.WsClient) {
      WsClient.connect('orchestrator', function(msg) {
        if (msg.data && msg.data.content && term) {
          term.write(msg.data.content);
        }
      });
      wsConnected = true;
    }
  }

  async function start(provider) {
    // Always stop existing process first, then start fresh
    destroyTerminal();
    started = false;
    wsConnected = false;
    await fetch('/api/orchestrator/stop', { method: 'POST' }).catch(function() {});

    try {
      var res = await fetch('/api/orchestrator/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider || 'claude-code' })
      });
      var json = await res.json();
      if (json.ok) {
        started = true;
        createTerminal();
        connectWebSocket();
      } else {
        if (term) {
          term.writeln('\r\n\x1b[31m[Error: ' + (json.error || 'Failed to start') + ']\x1b[0m');
        }
      }
    } catch (e) {
      console.error('Failed to start orchestrator:', e);
    }
  }

  function sendResize() {
    if (!term) return;
    var dims = fitAddon.proposeDimensions();
    if (dims && dims.cols && dims.rows) {
      fetch('/api/orchestrator/resize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols: dims.cols, rows: dims.rows })
      });
    }
  }

  function doFit() {
    if (fitAddon && term) {
      fitAddon.fit();
      sendResize();
    }
  }

  window.Orchestrator = {
    start: start,
    fit: doFit,
    reset: function() {
      destroyTerminal();
      started = false;
      wsConnected = false;
      return fetch('/api/orchestrator/stop', { method: 'POST' });
    }
  };

  document.addEventListener('DOMContentLoaded', function() {
    var resizeTimeout;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(doFit, 150);
    });

    var observer = new ResizeObserver(function() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(doFit, 100);
    });
    var panel = document.getElementById('orchestratorPanel');
    if (panel) observer.observe(panel);
  });
})();
