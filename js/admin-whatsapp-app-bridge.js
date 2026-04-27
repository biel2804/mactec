(function () {
  const DEFAULT_NAVIGATION = {
    backToAdmin: '/orcamento.html?admin=1',
    home: '/',
    logout: '/admin-login.html?status=logout'
  };

  function isStandalone() {
    const byDisplayMode = Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    const byIOS = Boolean(window.navigator && window.navigator.standalone);
    return byDisplayMode || byIOS;
  }

  function readRuntimeConfig() {
    const body = document.body;
    const params = new URLSearchParams(window.location.search || '');
    const entry = body?.dataset?.appEntry === 'app' ? 'app' : 'admin';
    const appModeByQuery = params.get('appMode') === '1' || params.get('app') === '1';
    const appMode = appModeByQuery || entry === 'app' || isStandalone();

    return {
      appName: body?.dataset?.appName || 'MacTec Messenger',
      entry,
      appMode,
      standalone: isStandalone(),
      navigation: { ...DEFAULT_NAVIGATION },
      pwa: {
        swPath: '/service-worker.js'
      }
    };
  }

  function applyRuntimeToDom(runtime) {
    document.documentElement.dataset.appMode = runtime.appMode ? '1' : '0';
    document.documentElement.dataset.appEntry = runtime.entry;
  }

  function registerServiceWorker(runtime) {
    if (!runtime.appMode) return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(runtime.pwa.swPath, { scope: '/' }).catch((error) => {
      console.warn('Falha ao registrar service worker do MacTec Messenger.', error);
    });
  }

  const runtime = readRuntimeConfig();
  window.AdminWhatsAppRuntime = runtime;
  applyRuntimeToDom(runtime);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => registerServiceWorker(runtime), { once: true });
  } else {
    registerServiceWorker(runtime);
  }
})();
