(function() {
  var container = null;

  function ensureContainer() {
    if (container) return;
    container = document.getElementById('notificationContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notificationContainer';
      container.style.cssText = 'position:fixed; top:16px; right:16px; z-index:10000; display:flex; flex-direction:column; gap:8px; pointer-events:none;';
      document.body.appendChild(container);
    }
  }

  function showNotification(message, type, duration) {
    ensureContainer();
    type = type || 'success';
    duration = duration || 3000;

    var item = document.createElement('div');
    item.className = 'notification-item notification-' + type;
    item.style.cssText = 'pointer-events:auto; padding:12px 20px; border-radius:8px; color:#fff; font-size:14px; font-weight:500; box-shadow:0 4px 12px rgba(0,0,0,0.15); display:flex; align-items:center; gap:10px; animation:notificationSlideIn 0.3s ease forwards; max-width:360px; cursor:pointer;';

    var icon = type === 'success' ? '&#10003;' : '&#10007;';
    item.innerHTML = '<span style="font-size:18px;">' + icon + '</span><span>' + escapeHtml(message) + '</span><span class="notification-close" style="margin-left:auto; opacity:0.7; font-size:18px; line-height:1;">&times;</span>';

    item.querySelector('.notification-close').addEventListener('click', function() {
      removeNotification(item);
    });

    item.addEventListener('click', function() {
      removeNotification(item);
    });

    container.appendChild(item);

    var timer = setTimeout(function() {
      removeNotification(item);
    }, duration);

    item._timer = timer;
  }

  function removeNotification(item) {
    if (!item || item._removed) return;
    item._removed = true;
    clearTimeout(item._timer);
    item.style.animation = 'notificationSlideOut 0.3s ease forwards';
    setTimeout(function() {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 300);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.showNotification = showNotification;
})();
