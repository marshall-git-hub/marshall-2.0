(function initMarshallSessionGuard() {
  if (window.__marshallSessionGuardInitialized) {
    return;
  }
  window.__marshallSessionGuardInitialized = true;

  const LOGIN_URL = '/pages/index/index.html';
  let hasNonAnonymousUser = false;
  let authStateListenerAdded = false;

  function redirectToLogin() {
    if (window.location.pathname.endsWith('/index.html')) {
      return;
    }
    window.location.href = LOGIN_URL;
  }

  function shouldAllowAnonymousSignIn() {
    // Check if current page requires email/password login
    const path = window.location.pathname;
    // Pages that require email/password login should not allow anonymous sign-in
    if (path.includes('/flotila/') || path.includes('/diely/') || path.includes('/oleje/') || path.includes('/pnue/')) {
      return false;
    }
    // Only allow anonymous sign-in for cestaky and other pages that need it
    return true;
  }

  async function ensureAuthSession() {
    // Never sign in anonymously if page doesn't allow it
    if (!shouldAllowAnonymousSignIn()) {
      console.log('SessionGuard: Page requires email/password login, skipping anonymous sign-in');
      return;
    }
    
    // Wait longer for auth state to propagate after login
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if user is authenticated
    const currentUser = window.auth?.currentUser;
    
    // NEVER sign in anonymously if user is already authenticated with email/password
    if (currentUser && !currentUser.isAnonymous) {
      console.log('SessionGuard: User already authenticated (non-anonymous), skipping anonymous sign-in');
      hasNonAnonymousUser = true;
      return;
    }
    
    // If we know there's a non-anonymous user, never sign in anonymously
    if (hasNonAnonymousUser) {
      console.log('SessionGuard: Non-anonymous user exists, skipping anonymous sign-in');
      return;
    }
    
    // Only sign in anonymously if there's no user at all
    if (currentUser) {
      // There's already a user (probably anonymous), don't sign in again
      return;
    }
    
    if (!window.AuthService?.ensureAnonymousSession) {
      return;
    }
    
    try {
      await window.AuthService.ensureAnonymousSession();
    } catch (error) {
      console.warn('SessionGuard: unable to ensure auth session', error);
    }
  }

  // Listen for auth state changes FIRST, before ensuring session
  function setupAuthStateListener() {
    if (authStateListenerAdded || !window.auth?.onAuthStateChanged) {
      return;
    }
    
    authStateListenerAdded = true;
    window.auth.onAuthStateChanged(user => {
      if (!user) {
        hasNonAnonymousUser = false;
        redirectToLogin();
      } else if (!user.isAnonymous) {
        // User logged in with email/password - NEVER sign in anonymously
        hasNonAnonymousUser = true;
        console.log('SessionGuard: Non-anonymous user detected, will never sign in anonymously');
      } else {
        // User is anonymous
        hasNonAnonymousUser = false;
        console.log('SessionGuard: Anonymous user detected');
      }
    });
  }

  // Setup auth state listener first
  setupAuthStateListener();

  // Only ensure session if auth is ready and page allows anonymous
  if (window.auth) {
    // Check if there's already a non-anonymous user
    const currentUser = window.auth.currentUser;
    if (currentUser && !currentUser.isAnonymous) {
      hasNonAnonymousUser = true;
      console.log('SessionGuard: Non-anonymous user already exists on page load');
      return; // Don't sign in anonymously
    }
    
    // Wait before ensuring session
    setTimeout(() => {
      if (!hasNonAnonymousUser && shouldAllowAnonymousSignIn()) {
        ensureAuthSession();
      }
    }, 1500);
  } else {
    // Wait for auth to be available
    const checkAuth = setInterval(() => {
      if (window.auth) {
        clearInterval(checkAuth);
        setupAuthStateListener();
        const currentUser = window.auth.currentUser;
        if (currentUser && !currentUser.isAnonymous) {
          hasNonAnonymousUser = true;
          return; // Don't sign in anonymously
        }
        setTimeout(() => {
          if (!hasNonAnonymousUser && shouldAllowAnonymousSignIn()) {
            ensureAuthSession();
          }
        }, 1500);
      }
    }, 100);
    
    // Timeout after 5 seconds
    setTimeout(() => clearInterval(checkAuth), 5000);
  }
})();

