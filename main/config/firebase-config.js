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
      if (window.auth.currentUser) {
        return window.auth.currentUser;
      }

      if (!window.__marshallAnonAuthPromise) {
        window.__marshallAnonAuthPromise = window.auth.signInAnonymously()
          .then((cred) => {
            window.__marshallAnonAuthPromise = null;
            return cred.user;
          })
          .catch((error) => {
            window.__marshallAnonAuthPromise = null;
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
