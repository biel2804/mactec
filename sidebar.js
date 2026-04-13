(function () {
  const KEY = 'admin_sidebar_collapsed';
  const MOBILE_BREAKPOINT = 1024;

  function isMobileViewport() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function setMobileOpenState(isOpen) {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('adminSidebarOverlay');
    const menuButton = document.getElementById('adminMobileMenuButton');
    if (!sidebar) return;
    sidebar.classList.toggle('mobile-open', Boolean(isOpen));
    overlay?.classList.toggle('active', Boolean(isOpen));
    menuButton?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function applyState(collapsed) {
    const sidebar = document.getElementById('adminSidebar');
    const content = document.getElementById('adminContent');
    if (!sidebar || !content) return;

    if (isMobileViewport()) {
      setMobileOpenState(false);
      sidebar.classList.remove('collapsed');
      content.classList.remove('sidebar-collapsed');
      return;
    }

    setMobileOpenState(false);
    sidebar.classList.toggle('collapsed', collapsed);
    content.classList.toggle('sidebar-collapsed', collapsed);
  }

  function toggle(forceState) {
    const sidebar = document.getElementById('adminSidebar');
    if (!sidebar) return;

    if (isMobileViewport()) {
      const nextState = typeof forceState === 'boolean'
        ? forceState
        : !sidebar.classList.contains('mobile-open');
      setMobileOpenState(nextState);
      return;
    }

    const collapsed = !sidebar.classList.contains('collapsed');
    applyState(collapsed);
    localStorage.setItem(KEY, collapsed ? '1' : '0');
  }

  function closeMobile() {
    setMobileOpenState(false);
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

    if (!window.__adminSidebarEscapeBound) {
      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isMobileViewport()) {
          closeMobile();
        }
      });
      window.__adminSidebarEscapeBound = true;
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
