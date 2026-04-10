(function () {
  const KEY = 'admin_sidebar_collapsed';

  function applyState(collapsed) {
    const sidebar = document.getElementById('adminSidebar');
    const content = document.getElementById('adminContent');
    if (!sidebar || !content) return;
    sidebar.classList.toggle('collapsed', collapsed);
    content.classList.toggle('sidebar-collapsed', collapsed);
  }

  function toggle() {
    const sidebar = document.getElementById('adminSidebar');
    if (!sidebar) return;
    const collapsed = !sidebar.classList.contains('collapsed');
    applyState(collapsed);
    localStorage.setItem(KEY, collapsed ? '1' : '0');
  }

  function init() {
    applyState(localStorage.getItem(KEY) === '1');
  }

  window.toggleAdminSidebar = toggle;
  window.SidebarModule = { init, toggle };
})();
