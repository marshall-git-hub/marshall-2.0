(function initMarshallSessionGuard() {
  if (window.__marshallSessionGuardInitialized) {
    return;
  }
  window.__marshallSessionGuardInitialized = true;

  const LOGIN_URL = '/pages/index/index.html';

  function redirectToLogin() {
    if (window.location.pathname.endsWith('/index.html')) {
      return;
    }
    window.location.href = LOGIN_URL;
  }

  async function ensureAuthSession() {
    if (!window.AuthService?.ensureAnonymousSession) {
      return;
    }
    try {
      await window.AuthService.ensureAnonymousSession();
    } catch (error) {
      console.warn('SessionGuard: unable to ensure auth session', error);
    }
  }

  if (window.auth?.onAuthStateChanged) {
    window.auth.onAuthStateChanged(user => {
      if (!user) {
        redirectToLogin();
      }
    });
  }

  ensureAuthSession();
})();

