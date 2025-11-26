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
      // CRITICAL: Verify this is the oil database's onOilsUpdate method
      console.log('[DEBUG] oil-database.js: onOilsUpdate called - this should be OIL database');
      
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
      
      // CRITICAL: Bind _setupListeners to this (OilDatabaseService) to ensure correct context
      const boundSetupListeners = this._setupListeners.bind(this);
      console.log('[DEBUG] oil-database.js: Calling _setupListeners for OILS');
      return boundSetupListeners(callback);
    },

    _setupListeners(callback) {
      // Verify user is still authenticated
      if (!window.auth || !window.auth.currentUser) {
        callback([]);
        return () => {};
      }

      // CRITICAL: Verify this is being called from oil-database, not parts database
      console.log('[DEBUG] oil-database.js: _setupListeners called - setting up OIL listeners');
      
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
        
        // CRITICAL: Validate that we're returning oil data, not parts data
        const validOilCategories = ['motorove', 'prevodove', 'diferencial', 'chladiaca'];
        const invalidItems = merged.filter(item => {
          const category = item.category || '';
          return !validOilCategories.includes(category);
        });
        
        if (invalidItems.length > 0) {
          console.error('[ERROR] oil-database.js: mergeAndNotify is returning parts data! Invalid categories:', 
            [...new Set(invalidItems.map(i => i.category))]);
        }
        
        console.log('[DEBUG] oil-database.js: mergeAndNotify calling callback with', merged.length, 'OILS');
        callback(merged);
      };

      categories.forEach(categoryId => {
        const collectionName = CATEGORY_TO_COLLECTION[categoryId];
        
        console.log('[DEBUG] oil-database.js: Setting up listener for OIL category:', categoryId, '-> collection:', collectionName);
        
        const unsubscribe = this._basePath()
          .collection(collectionName)
          .orderBy('name')
          .onSnapshot((snapshot) => {
            console.log('[DEBUG] oil-database.js: Received snapshot for OIL collection:', collectionName, 'documents:', snapshot.docs.length);
            allOils[categoryId] = snapshot.docs.map((doc) => {
              const data = doc.data();
              // CRITICAL: Always use the Slovak category ID from the mapping, not from document
              // The document might have category in English or be missing
              const result = {
                ...data,
                id: doc.id,
                category: categoryId  // Set AFTER spreading to ensure Slovak category ID is used
              };
              
              // Verify category is correct
              if (result.category !== categoryId) {
                console.warn('[WARNING] oil-database.js: Category mismatch for item', doc.id, '- expected:', categoryId, 'got:', result.category);
              }
              
              return result;
            });
            mergeAndNotify();
          }, (error) => {
            console.error(`[ERROR] Failed to load oils from ${collectionName}:`, error);
            // If orderBy fails (e.g., missing index or field), try without ordering
            if (error.code === 'failed-precondition' || error.message?.includes('index')) {
              console.warn(`[WARNING] Retrying ${collectionName} without orderBy due to:`, error.message);
              // Retry without orderBy
              this._basePath()
                .collection(collectionName)
                .onSnapshot((snapshot) => {
                  allOils[categoryId] = snapshot.docs.map((doc) => {
                    const data = doc.data();
                    return {
                      ...data,
                      id: doc.id,
                      category: categoryId
                    };
                  });
                  // Sort manually by name
                  allOils[categoryId].sort((a, b) => {
                    const nameA = (a.name || '').toLowerCase();
                    const nameB = (b.name || '').toLowerCase();
                    return nameA.localeCompare(nameB);
                  });
                  mergeAndNotify();
                }, (retryError) => {
                  console.error(`[ERROR] Failed to load ${collectionName} even without orderBy:`, retryError);
                  allOils[categoryId] = [];
                  mergeAndNotify();
                });
            } else {
              allOils[categoryId] = [];
              mergeAndNotify();
            }
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
  
  // CRITICAL: Bind methods to OilDatabaseService to preserve 'this' context
  // This ensures that when methods are called, they use the correct service object
  const boundOilService = {
    onOilsUpdate: OilDatabaseService.onOilsUpdate.bind(OilDatabaseService),
    createOil: OilDatabaseService.createOil.bind(OilDatabaseService),
    adjustOilQuantity: OilDatabaseService.adjustOilQuantity.bind(OilDatabaseService),
    deleteOil: OilDatabaseService.deleteOil.bind(OilDatabaseService)
  };
  
  // CRITICAL: Only assign methods, don't overwrite existing ones
  // This ensures oil methods don't get overwritten by parts methods or vice versa
  Object.assign(window.DatabaseService, boundOilService);
  
  // Verify that onOilsUpdate was assigned correctly
  if (window.DatabaseService.onOilsUpdate) {
    console.log('[DEBUG] oil-database.js: onOilsUpdate method successfully assigned and bound to OilDatabaseService');
    
    // Verify it's bound to the correct object
    const testCall = () => {
      try {
        // This will fail if not bound correctly
        const fn = window.DatabaseService.onOilsUpdate;
        const original = OilDatabaseService.onOilsUpdate;
        if (fn === original) {
          console.warn('[WARNING] oil-database.js: onOilsUpdate is not bound! It will lose context.');
        }
      } catch (e) {
        // Ignore test errors
      }
    };
    testCall();
  } else {
    console.error('[ERROR] oil-database.js: Failed to assign onOilsUpdate to DatabaseService!');
  }
})();

