(function() {
  var started = false;

  async function start() {
    if (started) return;

    try {
      var res = await fetch('/api/orchestrator/start', { method: 'POST' });
      var json = await res.json();
      if (json.ok) {
        started = true;

        if (window.WsClient) {
          WsClient.connect('orchestrator', function(data) {
            var output = document.getElementById('orchestratorOutput');
            if (output && data.content) {
              output.textContent += data.content;
              output.scrollTop = output.scrollHeight;
            }
          });
        }
      } else {
        var output = document.getElementById('orchestratorOutput');
        if (output) output.textContent += '\n[Error: ' + (json.error || 'Failed to start') + ']\n';
      }
    } catch (e) {
      console.error('Failed to start orchestrator:', e);
    }
  }

  async function send() {
    var input = document.getElementById('orchestratorInput');
    if (!input || !input.value.trim()) return;

    var text = input.value.trim();
    input.value = '';

    var output = document.getElementById('orchestratorOutput');
    if (output) output.textContent += '\n> ' + text + '\n';

    await fetch('/api/orchestrator/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    });
  }

  window.Orchestrator = {
    start: start,
    send: send
  };

  document.addEventListener('DOMContentLoaded', function() {
    start();

    var input = document.getElementById('orchestratorInput');
    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') send();
      });
    }
  });
})();
