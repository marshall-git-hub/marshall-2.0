/**
 * Cestaky Shared Firebase Helpers
 * Common Firebase operations for both driver and admin views
 */

// Global Firebase instances (will be set by initCestakyFirebase)
let cestakyApp, cestakyAuth, cestakyDb;
let cestakyPendingWrites = false;
let cestakySaveTimers = new Map();

/**
 * Initialize Firebase for Cestaky module
 * @returns {Object} { app, auth, db }
 */
function initCestakyFirebase() {
    try {
        if (cestakyDb) {
            return { app: cestakyApp, auth: cestakyAuth, db: cestakyDb };
        }

        cestakyApp = firebase.initializeApp(window.FIREBASE_CONFIG);
        cestakyAuth = firebase.auth();
        cestakyDb = firebase.firestore();

        // Enable persistence
        cestakyDb.enablePersistence({ synchronizeTabs: true }).catch((err) => {
            if (err.code === 'failed-precondition') {
                console.warn('Persistence enabled in another tab');
            } else if (err.code === 'unimplemented') {
                console.warn('Persistence not supported in this browser');
            } else {
                console.warn('Persistence error:', err.code);
            }
        });

        return { app: cestakyApp, auth: cestakyAuth, db: cestakyDb };
    } catch (e) {
        console.warn('Firebase init skipped/misconfigured', e);
        return { app: null, auth: null, db: null };
    }
}

/**
 * Get Firebase instances
 * @returns {Object} { app, auth, db }
 */
function getCestakyFirebase() {
    return { app: cestakyApp, auth: cestakyAuth, db: cestakyDb };
}

/**
 * Check if user is authenticated
 * @returns {Promise<firebase.User|null>}
 */
async function getCestakyCurrentUser() {
    if (!cestakyAuth) return null;
    return new Promise((resolve) => {
        const unsubscribe = cestakyAuth.onAuthStateChanged((user) => {
            unsubscribe();
            resolve(user);
        });
    });
}

/**
 * Get reference to a driver's trips collection
 * @param {string} driverName 
 * @returns {firebase.firestore.CollectionReference|null}
 */
function getDriverTripsRef(driverName) {
    if (!cestakyDb || !driverName) return null;
    // Path: DRIVERS_LOG/drivers/{driverName}
    return cestakyDb.collection('DRIVERS_LOG').doc('drivers').collection(driverName);
}

/**
 * Get reference to a specific trip
 * @param {string} driverName 
 * @param {string} tripId 
 * @returns {firebase.firestore.DocumentReference|null}
 */
function getTripRef(driverName, tripId) {
    if (!cestakyDb || !driverName || !tripId) return null;
    // Path: DRIVERS_LOG/drivers/{driverName}/{tripId}
    return cestakyDb.collection('DRIVERS_LOG').doc('drivers').collection(driverName).doc(tripId);
}

/**
 * Load all drivers from the DRIVERS_LOG/drivers collection
 * @returns {Promise<Array>} Array of driver objects with their ride counts
 */
async function loadAllDrivers() {
    if (!cestakyDb) return [];

    try {
        // Get all driver subcollections from DRIVERS_LOG/drivers
        const driversDocRef = cestakyDb.collection('DRIVERS_LOG').doc('drivers');
        
        // First, get list of drivers from accessCodes to know which drivers exist
        const accessCodesSnapshot = await cestakyDb
            .collection('DRIVERS_LOG')
            .doc('accessCodes')
            .collection('drivers')
            .get();
        
        const drivers = [];
        const driverNames = new Set();

        // Get driver names from accessCodes
        for (const doc of accessCodesSnapshot.docs) {
            const data = doc.data();
            const name = data.driver || data.name || data.driver_name || doc.id;
            if (name) driverNames.add(name);
        }

        // For each driver, load their rides
        for (const driverName of driverNames) {
            const ridesSnapshot = await driversDocRef.collection(driverName).get();
            
            let completedCount = 0;
            let inProgressCount = 0;
            let latestRide = null;

            for (const tripDoc of ridesSnapshot.docs) {
                const tripData = tripDoc.data();
                if (tripData.completed === true) {
                    completedCount++;
                } else {
                    inProgressCount++;
                }

                // Track latest ride by timestamp
                const sortKey = tripData.completedAt?.toMillis?.() || 
                               tripData.startDate ? new Date(tripData.startDate).getTime() : 0;
                
                if (!latestRide || sortKey > latestRide.sortKey) {
                    latestRide = {
                        id: tripDoc.id,
                        sortKey: sortKey,
                        ...tripData
                    };
                }
            }

            drivers.push({
                name: driverName,
                totalRides: ridesSnapshot.size,
                completedRides: completedCount,
                inProgressRides: inProgressCount,
                latestRide: latestRide
            });
        }

        // Sort drivers alphabetically
        drivers.sort((a, b) => a.name.localeCompare(b.name, 'sk'));
        return drivers;
    } catch (e) {
        console.error('Error loading drivers:', e);
        return [];
    }
}

/**
 * Load all rides for a specific driver
 * @param {string} driverName 
 * @param {number} limit 
 * @returns {Promise<Array>}
 */
async function loadDriverRides(driverName, limit = 50) {
    if (!cestakyDb || !driverName) return [];

    try {
        // Path: DRIVERS_LOG/drivers/{driverName}
        const ridesRef = cestakyDb.collection('DRIVERS_LOG').doc('drivers').collection(driverName);
        const snapshot = await ridesRef.limit(limit).get();

        if (snapshot.empty) return [];

        const rides = [];
        for (const doc of snapshot.docs) {
            const data = doc.data();
            
            // Load header from subcollection
            const headerSnapshot = await doc.ref.collection('header').limit(1).get();
            let header = {};
            if (!headerSnapshot.empty) {
                header = headerSnapshot.docs[0].data();
            } else if (data.header) {
                header = data.header;
            }

            const displayDriveId = resolveDisplayDriveId(doc.id, data, header);

            let sortKey = 0;
            if (data.completedAt && data.completedAt.toMillis) {
                sortKey = data.completedAt.toMillis();
            } else if (header.lastUpdatedAt && header.lastUpdatedAt.toMillis) {
                sortKey = header.lastUpdatedAt.toMillis();
            } else {
                sortKey = Date.now();
            }

            rides.push({
                id: doc.id,
                completed: data.completed || false,
                completedAt: data.completedAt,
                header: header,
                sortKey: sortKey,
                displayDriveId: displayDriveId
            });
        }

        // Sort by completedAt or lastUpdatedAt, newest first
        rides.sort((a, b) => b.sortKey - a.sortKey);
        return rides;
    } catch (e) {
        console.error('Error loading rides:', e);
        return [];
    }
}

/**
 * Load complete ride data including subcollections
 * @param {string} driverName 
 * @param {string} tripId 
 * @returns {Promise<Object|null>}
 */
async function loadRideComplete(driverName, tripId) {
    if (!cestakyDb || !driverName || !tripId) return null;

    try {
        // Path: DRIVERS_LOG/drivers/{driverName}/{tripId}
        const docRef = cestakyDb.collection('DRIVERS_LOG').doc('drivers').collection(driverName).doc(tripId);
        const doc = await docRef.get();

        // Load header from subcollection
        const headerSnapshot = await docRef.collection('header').limit(1).get();
        let header = {};
        if (!headerSnapshot.empty) {
            header = headerSnapshot.docs[0].data();
        } else if (doc.exists && doc.data().header) {
            header = doc.data().header;
        }

        // Load fuel entries
        const fuelSnapshot = await docRef.collection('fuel').get();
        const fuel = fuelSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // Load border entries
        const bordersSnapshot = await docRef.collection('border_crossing').get();
        const borders = bordersSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // Load stop entries
        const stopsSnapshot = await docRef.collection('stops').get();
        const stops = stopsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        return {
            id: tripId,
            completed: doc.exists ? doc.data().completed : false,
            header: header,
            fuel: fuel,
            borders: borders,
            stops: stops
        };
    } catch (e) {
        console.error('Error loading ride:', e);
        return null;
    }
}

/**
 * Debounce function for autosave
 * @param {string} pathKey 
 * @param {Function} fn 
 * @param {number} delay 
 */
function cestakyDebounce(pathKey, fn, delay = 700) {
    if (cestakySaveTimers.has(pathKey)) clearTimeout(cestakySaveTimers.get(pathKey));
    const t = setTimeout(fn, delay);
    cestakySaveTimers.set(pathKey, t);
}

/**
 * Save sub-entry to a trip's subcollection
 * @param {firebase.firestore.DocumentReference} tripRef 
 * @param {string} collectionName 
 * @param {string} docId 
 * @param {Object} data 
 */
function saveSubEntry(tripRef, collectionName, docId, data) {
    if (!tripRef) return;
    cestakyPendingWrites = true;
    cestakyDebounce(`${collectionName}-${docId}`, async () => {
        await tripRef.collection(collectionName).doc(docId).set(data, { merge: true });
        cestakyPendingWrites = false;
    });
}

/**
 * Delete sub-entry from a trip's subcollection
 * @param {firebase.firestore.DocumentReference} tripRef 
 * @param {string} collectionName 
 * @param {string} docId 
 */
function deleteSubEntry(tripRef, collectionName, docId) {
    if (!tripRef) return;
    cestakyPendingWrites = true;
    cestakyDebounce(`delete-${collectionName}-${docId}`, async () => {
        await tripRef.collection(collectionName).doc(docId).delete();
        cestakyPendingWrites = false;
    });
}

/**
 * Parse numeric value safely
 * @param {*} v 
 * @returns {number|null}
 */
function asNum(v) {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
}

/**
 * Generate unique trip ID
 * @param {string} startDate 
 * @param {string} overrideId 
 * @returns {string}
 */
function generateTripId(startDate, overrideId) {
    if (overrideId) return overrideId;
    if (!startDate) startDate = new Date().toISOString().split('T')[0];
    return `${startDate}_${Date.now()}`;
}

/**
 * Sanitize drive ID for Firestore document ID
 * @param {string} displayId 
 * @returns {string|null}
 */
function sanitizeDriveId(displayId) {
    if (!displayId) return null;
    return displayId.replace(/\//g, '_');
}

/**
 * Restore drive ID from document ID
 * @param {string} docId 
 * @returns {string|null}
 */
function restoreDriveIdFromDocId(docId) {
    if (typeof docId !== 'string') return null;
    const match = docId.match(/^([A-Z]{1,3}-[0-9]{4})_([0-9]{2})$/);
    if (match) return `${match[1]}/${match[2]}`;
    return null;
}

/**
 * Resolve display drive ID from various sources
 * @param {string} docId 
 * @param {Object} data 
 * @param {Object} header 
 * @returns {string|null}
 */
function resolveDisplayDriveId(docId, data, header) {
    if (header && typeof header.driveId === 'string' && header.driveId.trim() !== '') {
        return header.driveId;
    }
    if (data && typeof data.driveId === 'string' && data.driveId.trim() !== '') {
        return data.driveId;
    }
    return restoreDriveIdFromDocId(docId);
}

/**
 * Generate display Drive ID like AB-0001/25
 * @param {firebase.firestore.Firestore} db 
 * @param {string} driverName 
 * @param {string} driverFullName 
 * @param {string} yearTwoDigits 
 * @returns {Promise<string|null>}
 */
async function generateDriveDisplayId(db, driverName, driverFullName, yearTwoDigits) {
    if (!db || !driverName) return null;

    const parts = (driverFullName || '').trim().split(/\s+/).filter(Boolean);
    const firstInitial = parts[0]?.[0]?.toUpperCase() || '';
    const secondInitial = parts[1]?.[0]?.toUpperCase() || '';
    const initials = `${firstInitial}${secondInitial}`;

    // Path: DRIVERS_LOG/drivers/{driverName}
    const ridesRef = db.collection('DRIVERS_LOG').doc('drivers').collection(driverName);
    const snapshot = await ridesRef.limit(200).get();
    
    let maxSeq = 0;
    snapshot.forEach(doc => {
        const data = doc.data() || {};
        const header = data.header || null;
        let driveId = data.driveId || (header && header.driveId) || restoreDriveIdFromDocId(doc.id);
        
        if (typeof driveId === 'string' && driveId.startsWith(`${initials}-`)) {
            const m = driveId.match(/^[A-Z]{1,3}-([0-9]{4})\/([0-9]{2})$/);
            if (m) {
                const num = parseInt(m[1], 10);
                if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
            }
        }
    });

    const nextSeq = (maxSeq + 1).toString().padStart(4, '0');
    if (!initials || !yearTwoDigits) return null;
    return `${initials}-${nextSeq}/${yearTwoDigits}`;
}

// Country data for border crossings
const countryNeighbors = {
    'SK': ['PL', 'UA', 'AT', 'HU', 'CZ'],
    'PL': ['SK', 'DE', 'CZ', 'UA', 'LT', 'BY'],
    'UA': ['SK', 'PL', 'HU', 'RO', 'MD', 'BY', 'RU'],
    'AT': ['SK', 'HU', 'CZ', 'DE', 'IT', 'SI', 'CH', 'LI'],
    'HU': ['SK', 'UA', 'RO', 'RS', 'HR', 'SI', 'AT'],
    'CZ': ['SK', 'PL', 'DE', 'AT'],
    'DE': ['PL', 'CZ', 'AT', 'CH', 'FR', 'LU', 'BE', 'NL', 'DK'],
    'IT': ['AT', 'SI', 'CH', 'FR'],
    'SI': ['AT', 'IT', 'HU', 'HR'],
    'HR': ['HU', 'SI', 'IT', 'RS', 'BA', 'ME'],
    'RS': ['HU', 'HR', 'BA', 'ME', 'MK', 'AL', 'RO', 'BG'],
    'RO': ['UA', 'HU', 'RS', 'BG', 'MD'],
    'BG': ['RO', 'RS', 'MK', 'GR', 'TR'],
    'MK': ['RS', 'BG', 'GR', 'AL'],
    'AL': ['RS', 'MK', 'GR', 'ME'],
    'ME': ['RS', 'HR', 'BA', 'AL'],
    'BA': ['HR', 'RS', 'ME'],
    'RU': ['UA', 'BY', 'PL', 'LT', 'LV', 'EE', 'FI', 'NO'],
    'BY': ['PL', 'UA', 'RU', 'LT', 'LV'],
    'LT': ['PL', 'BY', 'RU', 'LV'],
    'LV': ['LT', 'BY', 'RU', 'EE'],
    'EE': ['LV', 'RU', 'FI'],
    'FI': ['EE', 'RU', 'SE', 'NO'],
    'NO': ['RU', 'FI', 'SE', 'DK'],
    'SE': ['NO', 'FI', 'DK'],
    'DK': ['SE', 'NO', 'DE'],
    'NL': ['DE', 'BE'],
    'BE': ['DE', 'NL', 'FR', 'LU'],
    'LU': ['DE', 'BE', 'FR'],
    'FR': ['DE', 'BE', 'LU', 'CH', 'IT', 'ES', 'AD', 'MC'],
    'CH': ['DE', 'AT', 'IT', 'FR', 'LI'],
    'LI': ['AT', 'CH'],
    'ES': ['FR', 'PT', 'AD'],
    'PT': ['ES'],
    'AD': ['FR', 'ES'],
    'MC': ['FR'],
    'GR': ['BG', 'MK', 'AL', 'TR'],
    'TR': ['BG', 'GR'],
    'MD': ['UA', 'RO'],
};

const countryNames = {
    'SK': 'Slovensko',
    'PL': 'Poľsko',
    'UA': 'Ukrajina',
    'AT': 'Rakúsko',
    'HU': 'Maďarsko',
    'CZ': 'Česká republika',
    'DE': 'Nemecko',
    'IT': 'Taliansko',
    'SI': 'Slovinsko',
    'HR': 'Chorvátsko',
    'RS': 'Srbsko',
    'RO': 'Rumunsko',
    'BG': 'Bulharsko',
    'MK': 'Severné Macedónsko',
    'AL': 'Albánsko',
    'ME': 'Čierna Hora',
    'BA': 'Bosna a Hercegovina',
    'RU': 'Rusko',
    'BY': 'Bielorusko',
    'LT': 'Litva',
    'LV': 'Lotyšsko',
    'EE': 'Estónsko',
    'FI': 'Fínsko',
    'NO': 'Nórsko',
    'SE': 'Švédsko',
    'DK': 'Dánsko',
    'NL': 'Holandsko',
    'BE': 'Belgicko',
    'LU': 'Luxembursko',
    'FR': 'Francúzsko',
    'CH': 'Švajčiarsko',
    'LI': 'Lichtenštajnsko',
    'ES': 'Španielsko',
    'PT': 'Portugalsko',
    'AD': 'Andorra',
    'MC': 'Monako',
    'GR': 'Grécko',
    'TR': 'Turecko',
    'MD': 'Moldavsko',
};

// Export for use in other modules
window.CestakyFirebase = {
    init: initCestakyFirebase,
    get: getCestakyFirebase,
    getCurrentUser: getCestakyCurrentUser,
    getDriverTripsRef,
    getTripRef,
    loadAllDrivers,
    loadDriverRides,
    loadRideComplete,
    saveSubEntry,
    deleteSubEntry,
    asNum,
    generateTripId,
    sanitizeDriveId,
    restoreDriveIdFromDocId,
    resolveDisplayDriveId,
    generateDriveDisplayId,
    debounce: cestakyDebounce,
    countryNeighbors,
    countryNames,
    get hasPendingWrites() { return cestakyPendingWrites; },
    set hasPendingWrites(v) { cestakyPendingWrites = v; }
};

