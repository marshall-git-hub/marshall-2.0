(function setupFirebase(){
  if (window.firebaseInitialized) {
    return;
  }

  const firebaseConfig = {
    apiKey: "AIzaSyChV3hXA_QS5i3OctI4OLpISk5Q0CxRvf8",
    authDomain: "themarshall-3dc7e.firebaseapp.com",
    projectId: "themarshall-3dc7e",
    storageBucket: "themarshall-3dc7e.firebasestorage.app",
    messagingSenderId: "493868531488",
    appId: "1:493868531488:web:50a3820e6529819d7e6145",
    measurementId: "G-Y8KTFD6BQ1"
  };

  window.FIREBASE_CONFIG = firebaseConfig;

  if (!window.firebase || !window.firebase.apps) {
    console.warn('Firebase SDK (compat) must load before firebase-config.js');
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  window.db = firebase.firestore();
  window.auth = firebase.auth();
  window.AuthService = {
    login(email, password) {
      return window.auth.signInWithEmailAndPassword(email, password);
    },
    async ensureAnonymousSession() {
      if (!window.auth) {
        throw new Error('AUTH_NOT_READY');
      }
      
      // Always check current user first
      const currentUser = window.auth.currentUser;
      
      // If user is already authenticated (non-anonymous), NEVER sign in anonymously
      if (currentUser && !currentUser.isAnonymous) {
        console.log('ensureAnonymousSession: User already authenticated (non-anonymous), skipping anonymous sign-in');
        return currentUser;
      }
      
      // If there's already an anonymous user, return it
      if (currentUser && currentUser.isAnonymous) {
        return currentUser;
      }

      // Only sign in anonymously if there's NO user at all
      // Make sure no other operation is in progress
      if (!window.__marshallAnonAuthPromise) {
        window.__marshallAnonAuthPromise = window.auth.signInAnonymously()
          .then((cred) => {
            window.__marshallAnonAuthPromise = null;
            // Double check that we didn't get a non-anonymous user somehow
            if (cred.user && !cred.user.isAnonymous) {
              console.warn('ensureAnonymousSession: Got non-anonymous user when signing in anonymously');
            }
            return cred.user;
          })
          .catch((error) => {
            window.__marshallAnonAuthPromise = null;
            // Check if error is because user is already signed in
            if (error.code === 'auth/operation-not-allowed' || error.message.includes('already signed in')) {
              const existingUser = window.auth.currentUser;
              if (existingUser && !existingUser.isAnonymous) {
                console.log('ensureAnonymousSession: User is already signed in (non-anonymous)');
                return existingUser;
              }
            }
            throw error;
          });
      }

      return window.__marshallAnonAuthPromise;
    },
    logout() {
      return window.auth.signOut();
    },
    onAuthStateChanged(callback) {
      return window.auth.onAuthStateChanged(callback);
    },
    getCurrentUser() {
      return window.auth.currentUser;
    }
  };
  window.firebaseInitialized = true;
})();
