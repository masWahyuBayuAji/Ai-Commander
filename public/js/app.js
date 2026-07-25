(function() {
  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.view-toggle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        SettingsPage.showView(this.dataset.view);
      });
    });

    document.getElementById('btnSettings').addEventListener('click', function() {
      SettingsPage.showView('settings');
    });

    document.getElementById('btnOrchestrator').addEventListener('click', function() {
      window.open('/orchestrator.html', '_blank');
    });

    SettingsPage.updateDropdown();
  });
})();
