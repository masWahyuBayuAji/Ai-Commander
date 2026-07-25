(function() {
  function openModal(title, bodyHtml, footerHtml) {
    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    if (!overlay || !content) return;

    content.innerHTML = `
      <div class="modal-title">${title}</div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? '<div class="modal-footer">' + footerHtml + '</div>' : ''}
    `;
    overlay.classList.remove('hidden');
  }

  function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  window.Modal = {
    open: openModal,
    close: closeModal
  };

  document.addEventListener('DOMContentLoaded', function() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeModal();
      });
    }
  });
})();
