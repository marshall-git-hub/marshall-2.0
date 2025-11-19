(function setupOilDatabaseService() {
  if (!window.db || !window.firebase) {
    console.warn('Firestore nie je dostupný pre olejový modul.');
    return;
  }

  const FieldValue = firebase.firestore.FieldValue;
  
  // Map category IDs to Firestore sub-collection names
  const CATEGORY_TO_COLLECTION = {
    'motorove': 'engine_oils',
    'prevodove': 'transmission_oils',
    'diferencial': 'differencial_oils',
    'chladiaca': 'coolant'
  };

  const OilDatabaseService = {
    _basePath() {
      return window.db.collection('STORAGE').doc('oils');
    },

    _categoryCollection(categoryId) {
      const collectionName = CATEGORY_TO_COLLECTION[categoryId] || 'engine_oils';
      return this._basePath().collection(collectionName);
    },

    // Listen to all category sub-collections and merge results
    async onOilsUpdate(callback) {
      // Wait for authenticated user (not anonymous)
      if (!window.auth) {
        callback([]);
        return () => {};
      }

      // Check if user is already authenticated
      let user = window.auth.currentUser;
      
      if (!user) {
        // Wait for user to be authenticated
        await new Promise((resolve, reject) => {
          let unsubscribe;
          const timeout = setTimeout(() => {
            if (unsubscribe) unsubscribe();
            reject(new Error('AUTH_TIMEOUT'));
          }, 10000);
          
          unsubscribe = window.auth.onAuthStateChanged((authUser) => {
            if (authUser) {
              clearTimeout(timeout);
              unsubscribe();
              user = authUser;
              resolve();
            }
          });
        });
      }
      
      // Double-check user exists before setting up listeners
      if (!user) {
        callback([]);
        return () => {};
      }
      
      return this._setupListeners(callback);
    },

    _setupListeners(callback) {
      // Verify user is still authenticated
      if (!window.auth || !window.auth.currentUser) {
        callback([]);
        return () => {};
      }

      const categories = Object.keys(CATEGORY_TO_COLLECTION);
      const unsubscribes = [];
      const allOils = {};
      let isInitialized = false;

      const mergeAndNotify = () => {
        if (!isInitialized) {
          // Wait for all categories to initialize
          const allReady = categories.every(cat => allOils[cat] !== undefined);
          if (!allReady) return;
          isInitialized = true;
        }
        
        const merged = [];
        categories.forEach(cat => {
          if (allOils[cat]) {
            merged.push(...allOils[cat]);
          }
        });
        callback(merged);
      };

      categories.forEach(categoryId => {
        const collectionName = CATEGORY_TO_COLLECTION[categoryId];
        
        const unsubscribe = this._basePath()
          .collection(collectionName)
          .orderBy('name')
          .onSnapshot((snapshot) => {
            allOils[categoryId] = snapshot.docs.map((doc) => ({
              id: doc.id,
              category: categoryId,
              ...doc.data()
            }));
            mergeAndNotify();
          }, (error) => {
            allOils[categoryId] = [];
            mergeAndNotify();
          });
        unsubscribes.push(unsubscribe);
      });

      // Return unsubscribe function
      return () => {
        unsubscribes.forEach(unsub => unsub());
      };
    },

    async createOil(payload) {
      // Ensure authenticated user exists
      if (!window.auth || !window.auth.currentUser) {
        throw new Error('AUTH_REQUIRED');
      }

      const categoryId = payload.category || 'motorove';
      const collection = this._categoryCollection(categoryId);
      
      const doc = {
        name: payload.name,
        category: categoryId,
        quantity: typeof payload.quantity === 'number' ? payload.quantity : 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      
      return collection.add(doc);
    },

    async adjustOilQuantity(id, categoryId, delta) {
      // Ensure authenticated user exists
      if (!window.auth || !window.auth.currentUser) {
        throw new Error('AUTH_REQUIRED');
      }

      const docRef = this._categoryCollection(categoryId).doc(id);
      await window.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(docRef);
        if (!snapshot.exists) {
          throw new Error('OIL_NOT_FOUND');
        }
        const current = snapshot.data().quantity || 0;
        const next = Math.max(0, current + delta);
        transaction.update(docRef, {
          quantity: next,
          updatedAt: FieldValue.serverTimestamp()
        });
      });
    },

    async deleteOil(id, categoryId) {
      return this._categoryCollection(categoryId).doc(id).delete();
    }
  };

  if (!window.DatabaseService) {
    window.DatabaseService = {};
  }
  Object.assign(window.DatabaseService, OilDatabaseService);
})();

