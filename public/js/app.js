(function() {
  document.addEventListener('DOMContentLoaded', function() {
    // Load and apply color theme
    fetch('/api/settings')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var theme = (data.data && data.data.color_theme) || 'light-green-white';
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('color_theme', theme);
      })
      .catch(function() {
        var theme = localStorage.getItem('color-theme') || 'light-green-white';
        document.body.setAttribute('data-theme', theme);
      });

    document.querySelectorAll('.view-toggle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        SettingsPage.showView(this.dataset.view);
      });
    });

    document.getElementById('btnSettings').addEventListener('click', function() {
      SettingsPage.showView('settings');
    });

    // Dropdown toggle
    var toggle = document.getElementById('btnOrchestrator');
    var menu = document.getElementById('orchestratorMenu');

    toggle.addEventListener('click', function(e) {
      e.stopPropagation();
      menu.classList.toggle('show');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function() {
      menu.classList.remove('show');
    });

    // Orchestrator panel state
    var panel = document.getElementById('orchestratorPanel');
    var closeBtn = document.getElementById('btnCloseOrchestrator');
    var providerLabel = document.getElementById('orchestratorProviderLabel');

    function showPanel() {
      panel.classList.add('visible');
    }

    function hidePanel() {
      panel.classList.remove('visible');
    }

    // Handle provider selection - open panel instead of new tab
    document.querySelectorAll('.dropdown-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        var provider = this.getAttribute('data-provider');
        menu.classList.remove('show');

        // Update provider label
        providerLabel.textContent = provider === 'claude-code' ? 'Claude Code' : 'OpenCode';

        // Start orchestrator (only on first click)
        Orchestrator.start(provider);

        // Show panel
        showPanel();
      });
    });

    // Close panel button - just hide, don't kill terminal
    closeBtn.addEventListener('click', function() {
      hidePanel();
    });

    SettingsPage.updateDropdown();
  });
})();
