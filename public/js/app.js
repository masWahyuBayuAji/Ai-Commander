(function() {
  document.addEventListener('DOMContentLoaded', function() {
    // Load and apply color theme
    fetch('/api/settings')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var theme = (data.data && data.data.color_theme) || 'dark-navy';
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('color_theme', theme);
      })
      .catch(function() {
        // Fallback to localStorage or default
        var theme = localStorage.getItem('color_theme') || 'dark-navy';
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
    var dropdown = document.getElementById('orchestratorDropdown');
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

    // Handle provider selection
    document.querySelectorAll('.dropdown-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        var provider = this.getAttribute('data-provider');
        menu.classList.remove('show');
        window.open('/orchestrator.html?provider=' + encodeURIComponent(provider), '_blank');
      });
    });

    SettingsPage.updateDropdown();
  });
})();
