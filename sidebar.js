(function () {
  const KEY = 'admin_sidebar_collapsed';
  const MOBILE_BREAKPOINT = 1024;

  function isMobileViewport() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function applyState(collapsed) {
    const sidebar = document.getElementById('adminSidebar');
    const content = document.getElementById('adminContent');
    if (!sidebar || !content) return;

    if (isMobileViewport()) {
      sidebar.classList.remove('mobile-open');
      sidebar.classList.remove('collapsed');
      content.classList.remove('sidebar-collapsed');
      return;
    }

    sidebar.classList.remove('mobile-open');
    sidebar.classList.toggle('collapsed', collapsed);
    content.classList.toggle('sidebar-collapsed', collapsed);
  }

  function toggle() {
    const sidebar = document.getElementById('adminSidebar');
    if (!sidebar) return;

    if (isMobileViewport()) {
      sidebar.classList.toggle('mobile-open');
      return;
    }

    const collapsed = !sidebar.classList.contains('collapsed');
    applyState(collapsed);
    localStorage.setItem(KEY, collapsed ? '1' : '0');
  }

  function closeMobile() {
    const sidebar = document.getElementById('adminSidebar');
    if (!sidebar) return;
    sidebar.classList.remove('mobile-open');
  }

  function init() {
    applyState(localStorage.getItem(KEY) === '1');

    const adminContent = document.getElementById('adminContent');
    if (adminContent && !adminContent.dataset.mobileSidebarBound) {
      adminContent.addEventListener('click', () => {
        if (isMobileViewport()) closeMobile();
      });
      adminContent.dataset.mobileSidebarBound = '1';
    }

    if (!window.__adminSidebarResizeBound) {
      window.addEventListener('resize', () => {
        applyState(localStorage.getItem(KEY) === '1');
      });
      window.__adminSidebarResizeBound = true;
    }
  }

  window.toggleAdminSidebar = toggle;
  window.SidebarModule = { init, toggle, closeMobile };
})();
