(function setupDielyDatabaseService() {
  if (!window.db || !window.firebase) {
    console.warn('Firestore nie je dostupný pre dielový modul.');
    return;
  }

  const FieldValue = firebase.firestore.FieldValue;
  
  // Map category IDs to Firestore sub-collection names
  const CATEGORY_TO_COLLECTION = {
    // Filtre subcategories
    'olejove': 'olejove',
    'naftove': 'naftove',
    'kabinove': 'kabinove',
    'vzduchove': 'vzduchove',
    'adblue': 'adblue',
    'vysusac-vzduchu': 'vysusac-vzduchu',
    'ostnane': 'ostnane',
    // Brakes subcategories
    'brzd-platnicky': 'brzd-platnicky',
    'brzd-kotuce': 'brzd-kotuce',
    'brzd-valce': 'brzd-valce',
    // Other category
    'ostatne': 'ostnane' // Store "ostatne" items in the ostnane collection for backwards compatibility
  };

  // Map section IDs to Firestore base paths
  const SECTION_TO_BASE_PATH = {
    'filtre': () => window.db.collection('STORAGE').doc('parts').collection('filters').doc('items'),
    'brakes': () => window.db.collection('STORAGE').doc('parts').collection('brakes').doc('items')
  };

  // Map category IDs to section IDs (for database path determination)
  const CATEGORY_TO_SECTION = {
    // Filtre categories
    'olejove': 'filtre',
    'naftove': 'filtre',
    'kabinove': 'filtre',
    'vzduchove': 'filtre',
    'adblue': 'filtre',
    'vysusac-vzduchu': 'filtre',
    'ostnane': 'filtre',
    // Brakes categories
    'brzd-platnicky': 'brakes',
    'brzd-kotuce': 'brakes',
    'brzd-valce': 'brakes',
    // Other category
    'ostatne': 'filtre' // Store "ostatne" items in filters collection under ostnane for backwards compatibility
  };

  const DielyDatabaseService = {
    _basePathForSection(sectionId) {
      const getPath = SECTION_TO_BASE_PATH[sectionId];
      if (!getPath) {
        // Default to filters if section not found
        return window.db.collection('STORAGE').doc('parts').collection('filters').doc('items');
      }
      return getPath();
    },

    _basePathForCategory(categoryId) {
      const sectionId = CATEGORY_TO_SECTION[categoryId] || 'filtre';
      return this._basePathForSection(sectionId);
    },

    _categoryCollection(categoryId) {
      const collectionName = CATEGORY_TO_COLLECTION[categoryId] || 'olejove';
      return this._basePathForCategory(categoryId).collection(collectionName);
    },

    // Listen to all category sub-collections and merge results
    async onDielyUpdate(callback) {
      // Wait for authenticated user
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
      const allDiely = {};
      let isInitialized = false;

      const mergeAndNotify = () => {
        if (!isInitialized) {
          // Wait for all categories to initialize
          const allReady = categories.every(cat => allDiely[cat] !== undefined);
          if (!allReady) return;
          isInitialized = true;
        }
        
        const merged = [];
        categories.forEach(cat => {
          if (allDiely[cat]) {
            merged.push(...allDiely[cat]);
          }
        });
        callback(merged);
      };

      categories.forEach(categoryId => {
        const collectionName = CATEGORY_TO_COLLECTION[categoryId];
        const basePath = this._basePathForCategory(categoryId);
        
        const unsubscribe = basePath
          .collection(collectionName)
          .orderBy('name')
          .onSnapshot((snapshot) => {
            allDiely[categoryId] = snapshot.docs.map((doc) => ({
              id: doc.id,
              category: categoryId,
              ...doc.data()
            }));
            mergeAndNotify();
          }, (error) => {
            allDiely[categoryId] = [];
            mergeAndNotify();
          });
        unsubscribes.push(unsubscribe);
      });

      // Return unsubscribe function
      return () => {
        unsubscribes.forEach(unsub => unsub());
      };
    },

    async createDiel(payload) {
      // Ensure authenticated user exists
      if (!window.auth || !window.auth.currentUser) {
        throw new Error('AUTH_REQUIRED');
      }

      const categoryId = payload.category || 'olejove';
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

    async adjustDielQuantity(id, categoryId, delta) {
      // Ensure authenticated user exists
      if (!window.auth || !window.auth.currentUser) {
        throw new Error('AUTH_REQUIRED');
      }

      const docRef = this._categoryCollection(categoryId).doc(id);
      await window.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(docRef);
        if (!snapshot.exists) {
          throw new Error('DIEL_NOT_FOUND');
        }
        const current = snapshot.data().quantity || 0;
        const next = Math.max(0, current + delta);
        transaction.update(docRef, {
          quantity: next,
          updatedAt: FieldValue.serverTimestamp()
        });
      });
    },

    async deleteDiel(id, categoryId) {
      return this._categoryCollection(categoryId).doc(id).delete();
    }
  };

  if (!window.DatabaseService) {
    window.DatabaseService = {};
  }
  
  // CRITICAL: Store reference to oil methods before assigning parts methods
  const existingOnOilsUpdate = window.DatabaseService.onOilsUpdate;
  
  // CRITICAL: Bind methods to DielyDatabaseService to preserve 'this' context
  const boundDielyService = {
    onDielyUpdate: DielyDatabaseService.onDielyUpdate.bind(DielyDatabaseService),
    createDiel: DielyDatabaseService.createDiel.bind(DielyDatabaseService),
    adjustDielQuantity: DielyDatabaseService.adjustDielQuantity.bind(DielyDatabaseService),
    deleteDiel: DielyDatabaseService.deleteDiel.bind(DielyDatabaseService)
  };
  
  // CRITICAL: Only assign parts methods, preserve oil methods
  Object.assign(window.DatabaseService, boundDielyService);
  
  // CRITICAL: Restore onOilsUpdate if it was overwritten (shouldn't happen, but safety check)
  if (existingOnOilsUpdate && !window.DatabaseService.onOilsUpdate) {
    console.warn('[WARNING] diely-database.js: onOilsUpdate was lost, restoring it');
    window.DatabaseService.onOilsUpdate = existingOnOilsUpdate;
  } else if (existingOnOilsUpdate && window.DatabaseService.onOilsUpdate !== existingOnOilsUpdate) {
    console.warn('[WARNING] diely-database.js: onOilsUpdate was overwritten, restoring original');
    window.DatabaseService.onOilsUpdate = existingOnOilsUpdate;
  }
  
  // Verify that onDielyUpdate was assigned correctly
  if (window.DatabaseService.onDielyUpdate) {
    console.log('[DEBUG] diely-database.js: onDielyUpdate method successfully assigned and bound to DielyDatabaseService');
  } else {
    console.error('[ERROR] diely-database.js: Failed to assign onDielyUpdate to DatabaseService!');
  }
  
  // CRITICAL: Verify onOilsUpdate still exists and wasn't overwritten
  if (!window.DatabaseService.onOilsUpdate) {
    console.error('[ERROR] diely-database.js: onOilsUpdate is missing after assigning parts methods!');
  } else if (window.DatabaseService.onOilsUpdate !== existingOnOilsUpdate && existingOnOilsUpdate) {
    console.error('[ERROR] diely-database.js: onOilsUpdate was overwritten by parts methods!');
  }
})();
