let refuelingCount = 0;
let borderCrossingCount = 0;
let stopCount = 0;
let activeSection = 'header';

// Country neighbors mapping
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

// Get country name from code
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

// Firebase globals
let app, auth, db, driverUid = null, driverCode = null, currentTripId = null, driverName = null;
let saveTimers = new Map(); // debounce timers per path
let hasPendingWrites = false;

// Navigation state
let currentView = 'ride'; // 'ride', 'history', 'view-ride'
let viewingTripId = null;

// Initialize form with today's date and set up tab navigation
document.addEventListener('DOMContentLoaded', function() {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toTimeString().slice(0, 5);
    
    document.getElementById('startDate').value = today;
    document.getElementById('startTime').value = now;
    setupDateTimePlaceholders();

    // Init Firebase
    initFirebase();

    // Login overlay
    setupLogin();
    if (window.__MARSHALL_COMPANY_SESSION__) {
        bootstrapFromPortalSession(window.__MARSHALL_COMPANY_SESSION__);
    }

    // Set up tab navigation
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            switchSection(section);
        });
    });

    // Input autosave bindings (header fields)
    bindHeaderAutosave();

    // Network status
    window.addEventListener('online', updateSyncChip);
    window.addEventListener('offline', updateSyncChip);

    // Ensure overlay placeholders stay in sync if values change after load
    refreshDateTimePlaceholders();
});

function setupDateTimePlaceholders() {
    const wrappers = document.querySelectorAll('[data-placeholder-input]');
    wrappers.forEach(wrapper => {
        if (wrapper.dataset.overlayReady === 'true') return;
        const input = wrapper.querySelector('input');
        if (!input) return;
        const updateState = () => {
            if (input.value) {
                wrapper.classList.add('has-value');
            } else {
                wrapper.classList.remove('has-value');
            }
        };
        input.addEventListener('input', updateState);
        input.addEventListener('change', updateState);
        wrapper.dataset.overlayReady = 'true';
        updateState();
    });
}

function refreshDateTimePlaceholders() {
    document.querySelectorAll('[data-placeholder-input]').forEach(wrapper => {
        const input = wrapper.querySelector('input');
        if (!input) return;
        if (input.value) {
            wrapper.classList.add('has-value');
        } else {
            wrapper.classList.remove('has-value');
        }
    });
}

// Switch between sections
function switchSection(section) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.remove('active');
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(`section-${section}`).classList.add('active');
    
    // Add active class to selected tab
    document.querySelector(`[data-section="${section}"]`).classList.add('active');
    
    activeSection = section;
}

function initFirebase() {
    try {
        // firebase config expected in window.FIREBASE_CONFIG from firebase-config.js
        app = firebase.initializeApp(window.FIREBASE_CONFIG);
        auth = firebase.auth();
        db = firebase.firestore();
        
        // Enable persistence (deprecation warning is expected with compat SDK)
        // To remove warning, migrate to modular SDK and use cache settings
        db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
            if (err.code === 'failed-precondition') {
                // Multiple tabs open, persistence can only be enabled in one tab at a time
                console.warn('Persistence enabled in another tab');
            } else if (err.code === 'unimplemented') {
                // The current browser does not support persistence
                console.warn('Persistence not supported in this browser');
            } else {
                // Silently ignore other errors (e.g., quota exceeded)
                console.warn('Persistence error:', err.code);
            }
        });

        // Monitor pending writes
        db.onSnapshotsInSync(() => {
            // will be called when local writes synced; we'll recompute below
            computePendingWrites();
        });
    } catch (e) {
        console.warn('Firebase init skipped/misconfigured', e);
    }
}

// Login handler function - separated for reuse
async function handleLogin() {
    const err = document.getElementById('loginError');
    const overlay = document.getElementById('loginOverlay');
    const codeInput = document.getElementById('companyCode');
    
    err.classList.add('hidden');
    const code = (codeInput.value || '').trim();
    
    if (!db || !auth) { 
        err.textContent = 'Chýba konfigurácia Firebase'; 
        err.classList.remove('hidden'); 
        return; 
    }
    
    if (!code) { 
        err.textContent = 'Zadajte kód'; 
        err.classList.remove('hidden'); 
        return; 
    }
    
    try {
        // First sign in anonymously to get authentication (required to read accessCodes)
        const cred = await auth.signInAnonymously();
        driverUid = cred.user.uid;
        
        // Now verify code in accessCodes/{code} (requires auth)
        const doc = await db.collection('accessCodes').doc(code).get({ source: 'default' });
        if (!doc.exists || doc.data().active !== true) { 
            // Sign out if code is invalid
            await auth.signOut();
            driverUid = null;
            throw new Error('invalid'); 
        }
        
        const driverNameFromDoc = doc.data().driverName || null;
        const vehiclePlateFromDoc = doc.data().vehiclePlate || null;
        const trailerPlateFromDoc = doc.data().trailerPlate || null;
        driverCode = code;

        await applyDriverSession({
            driverLabel: driverNameFromDoc || 'Vodič',
            vehiclePlate: vehiclePlateFromDoc,
            trailerPlate: trailerPlateFromDoc
        });
    } catch (e) {
        console.error('Login error:', e);
        // Reset state on error
        driverUid = null;
        driverCode = null;
        driverName = null;
        currentTripId = null;
        
        if (e.message === 'invalid' || e.code === 'permission-denied') {
            err.textContent = 'Neplatný alebo neaktívny kód';
        } else {
            err.textContent = 'Chyba pri prihlasovaní: ' + (e.message || 'Neznáma chyba');
        }
        err.classList.remove('hidden');
        codeInput.focus();
    }
}

async function applyDriverSession({ driverLabel, vehiclePlate, trailerPlate }) {
    const overlay = document.getElementById('loginOverlay');
    const tabNav = document.getElementById('tabNavigation');
    const finishBtn = document.getElementById('finishRideContainer');
    const backBtn = document.getElementById('backBtn');
    const syncChip = document.getElementById('syncChip');
    const headerLogoutBtn = document.getElementById('headerLogoutBtn');

    currentTripId = null;
    driverName = driverLabel || 'Vodič';

    if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }

    updateSyncChip();
    updateHeaderDriverName();
    currentView = 'history';

    if (tabNav) tabNav.classList.add('hidden');
    if (finishBtn) finishBtn.classList.add('hidden');
    if (backBtn) backBtn.classList.add('hidden');
    if (syncChip) syncChip.classList.add('hidden');
    if (headerLogoutBtn) headerLogoutBtn.classList.remove('hidden');

    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.remove('active');
    });

    await ensureCurrentRide();

    requestAnimationFrame(() => {
        const vehiclePlateInput = document.getElementById('vehiclePlate');
        if (vehiclePlateInput && vehiclePlate && (!vehiclePlateInput.value || vehiclePlateInput.value.trim() === '')) {
            vehiclePlateInput.value = vehiclePlate;
            vehiclePlateInput.readOnly = false;
            if (currentTripId) {
                autosaveHeader();
            }
        }

        const trailerPlateInput = document.getElementById('trailerPlate');
        if (trailerPlateInput && trailerPlate && (!trailerPlateInput.value || trailerPlateInput.value.trim() === '')) {
            trailerPlateInput.value = trailerPlate;
            trailerPlateInput.readOnly = false;
            if (currentTripId) {
                autosaveHeader();
            }
        }
    });

    const historySection = document.getElementById('section-history');
    if (historySection) {
        historySection.classList.add('active');
    }

    requestAnimationFrame(() => {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.style.display = 'block';
        }

        const header = document.querySelector('.app-header');
        if (header) {
            header.style.display = 'block';
        }

        loadRideHistory();
    });

    autosaveHeader();
}

async function bootstrapFromPortalSession(session) {
    const overlay = document.getElementById('loginOverlay');
    const err = document.getElementById('loginError');

    if (!session) {
        return;
    }

    try {
        if (!db || !auth) {
            throw new Error('CHYBA_FIREBASE');
        }

        if (!window.AuthService || !window.AuthService.ensureAnonymousSession) {
            throw new Error('AUTH_SERVICE_MISSING');
        }

        const user = await window.AuthService.ensureAnonymousSession();
        driverUid = user?.uid || null;
        driverCode = session.code || null;

        await applyDriverSession({
            driverLabel: session.driver || 'Vodič',
            vehiclePlate: session.truck_spz,
            trailerPlate: session.trailer_spz
        });
    } catch (error) {
        console.error('Portal session login error:', error);
        sessionStorage.removeItem('marshallCompanySession');

        if (err) {
            err.textContent = 'Relácia expirovala. Vráťte sa na úvodnú stránku a prihláste sa znova.';
            err.classList.remove('hidden');
        }
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.style.display = 'flex';
        }
    }
}

function setupLogin() {
    const overlay = document.getElementById('loginOverlay');
    const loginBtn = document.getElementById('loginBtn');
    const codeInput = document.getElementById('companyCode');
    const portalSession = window.__MARSHALL_COMPANY_SESSION__;
    
    if (!overlay || !loginBtn || !codeInput) {
        console.error('Login elements not found');
        return;
    }

    if (portalSession) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
        return;
    }
    
    // Ensure overlay is visible
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
    
    // Remove any existing event listeners by cloning and replacing the button
    // This prevents multiple handlers from being attached
    const newLoginBtn = loginBtn.cloneNode(true);
    loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
    
    // Add click handler to new button
    newLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleLogin();
    });
    
    // Allow Enter key to trigger login
    codeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleLogin();
        }
    });
    
    // Focus on input
    setTimeout(() => {
        codeInput.focus();
    }, 100);
}

function updateSyncChip() {
    const chip = document.getElementById('syncChip');
    if (!navigator.onLine) {
        chip.textContent = 'Offline';
        chip.classList.add('offline');
        chip.classList.remove('unsaved');
        return;
    }
    chip.classList.remove('offline');
    chip.textContent = hasPendingWrites ? 'Unsaved' : 'Saved';
    if (hasPendingWrites) chip.classList.add('unsaved'); else chip.classList.remove('unsaved');
}

function computePendingWrites() {
    // Cheap approach: after small timeout mark as saved
    setTimeout(() => { hasPendingWrites = false; updateSyncChip(); }, 150);
}

function debounce(pathKey, fn, delay = 700) {
    if (saveTimers.has(pathKey)) clearTimeout(saveTimers.get(pathKey));
    const t = setTimeout(fn, delay);
    saveTimers.set(pathKey, t);
}

function bindHeaderAutosave() {
    const ids = ['vehiclePlate','trailerPlate','startDate','startTime','endDate','endTime','startOdometer','endOdometer'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => autosaveHeader());
        el.addEventListener('change', () => autosaveHeader());
    });
}

function getTripDocRef() {
    if (!db || !driverName || !currentTripId) return null;
    // structure: rides/{driverName}/trips/{tripId}
    return db.collection('rides').doc(driverName).collection('trips').doc(currentTripId);
}

function autosaveHeader() {
    const docRef = getTripDocRef();
    if (!docRef) return;
    const header = {
        driver: driverName || null,
        vehiclePlate: document.getElementById('vehiclePlate').value || null,
        trailerPlate: document.getElementById('trailerPlate').value || null,
        startDate: document.getElementById('startDate').value || null,
        startTime: document.getElementById('startTime').value || null,
        endDate: document.getElementById('endDate').value || null,
        endTime: document.getElementById('endTime').value || null,
        startOdometer: asNum(document.getElementById('startOdometer').value),
        endOdometer: asNum(document.getElementById('endOdometer').value),
        lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    hasPendingWrites = true; updateSyncChip();
    // Update header to show total km
    updateHeaderDriverName();
    debounce('header', async () => {
        // Save header to subcollection
        await docRef.collection('header').doc('data').set(header, { merge: true });
        // Also save completed status to main document
        await docRef.set({ 
            completed: false,
            driverName: driverName,
            startDate: header.startDate,
            endDate: header.endDate || null
        }, { merge: true });
        computePendingWrites();
    });
}

function saveSubEntry(collectionName, idSuffix, data) {
    const base = getTripDocRef();
    if (!base) return;
    hasPendingWrites = true; updateSyncChip();
    debounce(`${collectionName}-${idSuffix}`, async () => {
        await base.collection(collectionName).doc(idSuffix).set(data, { merge: true });
        computePendingWrites();
    });
}

function deleteSubEntry(collectionName, idSuffix) {
    const base = getTripDocRef();
    if (!base) return;
    hasPendingWrites = true; updateSyncChip();
    debounce(`delete-${collectionName}-${idSuffix}`, async () => {
        await base.collection(collectionName).doc(idSuffix).delete();
        computePendingWrites();
    });
}

function asNum(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

function getEntryNumberFromId(id) {
    if (typeof id !== 'string') return -Infinity;
    const match = id.match(/-(\d+)$/);
    return match ? parseInt(match[1], 10) : -Infinity;
}

function updateEntryDisplayNumbers(containerId, prefix, label) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const entries = Array.from(container.querySelectorAll(`[id^="${prefix}-"]`));
    if (entries.length === 0) return;
    entries.sort((a, b) => getEntryNumberFromId(a.id) - getEntryNumberFromId(b.id));
    entries.forEach((entry, index) => {
        const displayNumber = index + 1;
        const entryNumberEl = entry.querySelector('.entry-number');
        if (entryNumberEl) {
            entryNumberEl.textContent = `${label} #${displayNumber}`;
        }
        const titleTextEl = entry.querySelector('.confirmed-entry-title span:last-child');
        if (titleTextEl && titleTextEl.textContent?.includes('#')) {
            titleTextEl.textContent = `${label} #${displayNumber}`;
        }
    });
}

function refreshStopNumbers() {
    updateEntryDisplayNumbers('stopContainer', 'stop', 'Zastávka');
}

function refreshRefuelingNumbers() {
    updateEntryDisplayNumbers('refuelingContainer', 'refueling', 'Tankovanie');
}

function refreshBorderNumbers() {
    updateEntryDisplayNumbers('borderCrossingContainer', 'border', 'Prechod');
}

function insertEntrySorted(container, entry, prefix) {
    if (!container || !entry) return;
    const newNumber = getEntryNumberFromId(entry.id);
    if (!isFinite(newNumber)) {
        container.appendChild(entry);
        return;
    }
    const selector = `[id^="${prefix}-"]`;
    const siblings = Array.from(container.children).filter(child => child !== entry && child.matches && child.matches(selector));
    const target = siblings.find(child => getEntryNumberFromId(child.id) < newNumber);
    if (target) {
        container.insertBefore(entry, target);
    } else {
        container.appendChild(entry);
    }
}

// Check if there's an unconfirmed (form) entry in container
function hasUnconfirmedEntry(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return false;
    // Check if there's any entry that doesn't have the 'confirmed-entry' class
    const unconfirmed = container.querySelector('.dynamic-entry:not(.confirmed-entry)');
    return unconfirmed !== null;
}

// Check if previous stop has departure time
function previousStopHasDeparture() {
    const container = document.getElementById('stopContainer');
    if (!container) return true; // If no container, allow (shouldn't happen)
    
    const stops = Array.from(container.querySelectorAll('[id^="stop-"]'));
    if (stops.length === 0) return true; // No stops yet, allow
    
    // Check the first stop (most recent)
    const firstStop = stops[0];
    const isConfirmed = firstStop.classList.contains('confirmed-entry');
    
    if (isConfirmed) {
        // Check confirmed card
        const rows = firstStop.querySelectorAll('.confirmed-entry-row');
        for (const row of rows) {
            const label = row.querySelector('.confirmed-entry-label')?.textContent.replace(':', '').trim();
            if (label === 'Odchod') {
                const value = row.querySelector('.confirmed-entry-value')?.textContent.trim();
                return value && value.length > 0;
            }
        }
        return false;
    } else {
        // Check form
        const departureDate = firstStop.querySelector('input[name^="stopDepartureDate_"]')?.value;
        const departure = firstStop.querySelector('input[name^="stopDeparture_"]')?.value;
        return (departureDate && departure) || departure; // Either date+time or just time is OK
    }
}

// Add refueling entry
function addRefueling() {
    // Check if there's already an unconfirmed entry
    if (hasUnconfirmedEntry('refuelingContainer')) {
        alert('Prosím najprv potvrďte alebo odstráňte existujúce tankovanie pred pridaním nového.');
        return;
    }
    
    // Get next number based on existing entries
    const nextNumber = getNextRefuelingNumber();
    refuelingCount = Math.max(refuelingCount, nextNumber);
    const container = document.getElementById('refuelingContainer');
    
    // Remove empty state if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    const entry = document.createElement('div');
    entry.className = 'dynamic-entry';
    entry.id = `refueling-${refuelingCount}`;
    
    entry.innerHTML = `
        <div class="dynamic-entry-header">
            <span class="entry-number">Tankovanie #${refuelingCount}</span>
            <button type="button" class="btn-remove" onclick="removeRefueling(${refuelingCount})" title="Odstrániť">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/>
                </svg>
            </button>
        </div>
        <div class="form-row">
            <div class="form-group">
                <input type="date" name="refuelingDate_${refuelingCount}" required>
            </div>
            <div class="form-group">
                <input type="time" name="refuelingTime_${refuelingCount}" required>
            </div>
        </div>
        <div class="form-group">
            <label>Miesto tankovania</label>
            <input type="text" name="refuelingLocation_${refuelingCount}" placeholder="Pumpa / mesto" required>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Množstvo (l)</label>
                <input type="number" name="refuelingAmount_${refuelingCount}" step="0.1" placeholder="0.0" inputmode="decimal" required>
            </div>
            <div class="form-group">
                <label>Cena celkom (€)</label>
                <input type="number" name="refuelingTotalPrice_${refuelingCount}" step="0.01" placeholder="0.00" inputmode="decimal" required>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Stav tachometra (km)</label>
                <input type="number" name="refuelingOdometer_${refuelingCount}" step="0.1" placeholder="0" inputmode="decimal" required>
            </div>
        </div>
        <div class="form-group">
            <label>Spôsob platby</label>
            <select name="refuelingPayment_${refuelingCount}" required>
                <option value="">Vyberte spôsob platby</option>
                <option value="eurowag">Eurowag</option>
                <option value="as24">AS24</option>
                <option value="benzina">Benzina</option>
                <option value="cash">Hotovosť</option>
            </select>
        </div>
        <div class="form-group">
            <button type="button" class="btn-confirm" onclick="confirmRefueling(${refuelingCount})">
                <span class="material-symbols-outlined">check_circle</span>
                Potvrdiť
            </button>
        </div>
    `;
    
    insertEntrySorted(container, entry, 'refueling');
    refreshRefuelingNumbers();
    entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Bind autosave for this entry
    bindRefuelingAutosave(refuelingCount);
    updateContainerCompactMode('refuelingContainer');
}

function removeRefueling(id) {
    const entry = document.getElementById(`refueling-${id}`);
    if (entry) {
        // Delete from Firebase first
        deleteSubEntry('fuel', `refueling-${id}`);
        
        // Then remove from DOM
        entry.remove();
        
        // Check if container is empty and show empty state
        const container = document.getElementById('refuelingContainer');
        if (container.children.length === 0) {
            container.innerHTML = '<p class="empty-state">Zatiaľ žiadne tankovania</p>';
            refuelingCount = 0; // Reset counter
        } else {
            updateContainerCompactMode('refuelingContainer');
        }
        refreshRefuelingNumbers();
    }
}

// Confirm refueling entry - convert to card view
function confirmRefueling(id) {
    const entry = document.getElementById(`refueling-${id}`);
    if (!entry) return;
    
    // Get form values
    const date = entry.querySelector(`[name="refuelingDate_${id}"]`)?.value || '';
    const time = entry.querySelector(`[name="refuelingTime_${id}"]`)?.value || '';
    const location = entry.querySelector(`[name="refuelingLocation_${id}"]`)?.value || '';
    const amount = entry.querySelector(`[name="refuelingAmount_${id}"]`)?.value || '';
    const totalPrice = entry.querySelector(`[name="refuelingTotalPrice_${id}"]`)?.value || '';
    const odometer = entry.querySelector(`[name="refuelingOdometer_${id}"]`)?.value || '';
    const payment = entry.querySelector(`[name="refuelingPayment_${id}"]`)?.value || '';
    
    // Validate required fields
    if (!date || !time || !location || !amount || !totalPrice || !odometer || !payment) {
        alert('Prosím vyplňte všetky povinné polia');
        return;
    }
    
    // Save data first
    const payload = {
        date: date || null,
        time: time || null,
        location: location || null,
        amount: asNum(amount),
        totalPrice: asNum(totalPrice),
        odometer: asNum(odometer),
        payment: payment || null,
        confirmed: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    saveSubEntry('fuel', `refueling-${id}`, payload);
    
    // Get container and move entry to top
    const container = document.getElementById('refuelingContainer');
    
    // Convert to card view
    const paymentLabels = {
        'eurowag': 'Eurowag',
        'as24': 'AS24',
        'benzina': 'Benzina',
        'cash': 'Hotovosť'
    };
    
    entry.className = 'dynamic-entry confirmed-entry';
    entry.innerHTML = `
        <div class="confirmed-entry-header">
            <div class="confirmed-entry-title">
                <span class="material-symbols-outlined">local_gas_station</span>
                <span>Tankovanie #${id}</span>
            </div>
            <div class="confirmed-entry-actions">
                <button type="button" class="btn-edit" onclick="editRefueling(${id})" title="Upraviť">
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button type="button" class="btn-remove" onclick="removeRefueling(${id})" title="Odstrániť">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="confirmed-entry-content">
            <div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Dátum:</span>
                <span class="confirmed-entry-value">${date}</span>
            </div>
            <div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Čas:</span>
                <span class="confirmed-entry-value">${time}</span>
            </div>
            <div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Miesto:</span>
                <span class="confirmed-entry-value">${location}</span>
            </div>
            <div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Množstvo:</span>
                <span class="confirmed-entry-value">${amount} l</span>
            </div>
            <div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Cena:</span>
                <span class="confirmed-entry-value">${totalPrice} €</span>
            </div>
            <div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Tachometer:</span>
                <span class="confirmed-entry-value">${odometer} km</span>
            </div>
            <div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Platba:</span>
                <span class="confirmed-entry-value">${paymentLabels[payment] || payment}</span>
            </div>
        </div>
    `;
    
    if (container) {
        insertEntrySorted(container, entry, 'refueling');
    }
    
    updateContainerCompactMode('refuelingContainer');
    refreshRefuelingNumbers();
}

// Edit refueling entry - convert back to form
function editRefueling(id) {
    const entry = document.getElementById(`refueling-${id}`);
    if (!entry) return;
    
    // Get current values from card
    const content = entry.querySelector('.confirmed-entry-content');
    const rows = content.querySelectorAll('.confirmed-entry-row');
    const values = {};
    rows.forEach(row => {
        const label = row.querySelector('.confirmed-entry-label')?.textContent.replace(':', '').trim();
        const value = row.querySelector('.confirmed-entry-value')?.textContent.trim();
        if (label === 'Dátum') values.date = value;
        else if (label === 'Čas') values.time = value;
        else if (label === 'Miesto') values.location = value;
        else if (label === 'Množstvo') values.amount = value.replace(' l', '');
        else if (label === 'Cena') values.totalPrice = value.replace(' €', '');
        else if (label === 'Tachometer') values.odometer = value.replace(' km', '');
        else if (label === 'Platba') {
            const paymentMap = {
                'Eurowag': 'eurowag',
                'AS24': 'as24',
                'Benzina': 'benzina',
                'Hotovosť': 'cash'
            };
            values.payment = paymentMap[value] || value;
        }
    });
    
    // Convert back to form
    entry.className = 'dynamic-entry';
    entry.innerHTML = `
        <div class="dynamic-entry-header">
            <span class="entry-number">Tankovanie #${id}</span>
            <button type="button" class="btn-remove" onclick="removeRefueling(${id})" title="Odstrániť">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/>
                </svg>
            </button>
        </div>
        <div class="form-row">
            <div class="form-group">
                <input type="date" name="refuelingDate_${id}" value="${values.date || ''}" required>
            </div>
            <div class="form-group">
                <input type="time" name="refuelingTime_${id}" value="${values.time || ''}" required>
            </div>
        </div>
        <div class="form-group">
            <label>Miesto tankovania</label>
            <input type="text" name="refuelingLocation_${id}" value="${values.location || ''}" placeholder="Pumpa / mesto" required>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Množstvo (l)</label>
                <input type="number" name="refuelingAmount_${id}" value="${values.amount || ''}" step="0.1" placeholder="0.0" inputmode="decimal" required>
            </div>
            <div class="form-group">
                <label>Cena celkom (€)</label>
                <input type="number" name="refuelingTotalPrice_${id}" value="${values.totalPrice || ''}" step="0.01" placeholder="0.00" inputmode="decimal" required>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Stav tachometra (km)</label>
                <input type="number" name="refuelingOdometer_${id}" value="${values.odometer || ''}" step="0.1" placeholder="0" inputmode="decimal" required>
            </div>
        </div>
        <div class="form-group">
            <label>Spôsob platby</label>
            <select name="refuelingPayment_${id}" required>
                <option value="">Vyberte spôsob platby</option>
                <option value="eurowag" ${values.payment === 'eurowag' ? 'selected' : ''}>Eurowag</option>
                <option value="as24" ${values.payment === 'as24' ? 'selected' : ''}>AS24</option>
                <option value="benzina" ${values.payment === 'benzina' ? 'selected' : ''}>Benzina</option>
                <option value="cash" ${values.payment === 'cash' ? 'selected' : ''}>Hotovosť</option>
            </select>
        </div>
        <div class="form-group">
            <button type="button" class="btn-confirm" onclick="confirmRefueling(${id})">
                <span class="material-symbols-outlined">check_circle</span>
                Potvrdiť
            </button>
        </div>
    `;
    
    // Re-bind autosave
    bindRefuelingAutosave(id);
    updateContainerCompactMode('refuelingContainer');
    refreshRefuelingNumbers();
}

// Update container to compact mode if 3+ entries
function updateContainerCompactMode(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const entries = container.querySelectorAll('.dynamic-entry, .confirmed-entry');
    if (entries.length >= 3) {
        container.classList.add('compact-mode');
    } else {
        container.classList.remove('compact-mode');
    }
}

function bindRefuelingAutosave(i) {
    const root = document.getElementById(`refueling-${i}`);
    if (!root) return;
    root.querySelectorAll('input,select').forEach(el => {
        const handler = () => {
        const payload = {
            date: root.querySelector(`[name="refuelingDate_${i}"]`)?.value || null,
            time: root.querySelector(`[name="refuelingTime_${i}"]`)?.value || null,
            location: root.querySelector(`[name="refuelingLocation_${i}"]`)?.value || null,
            amount: asNum(root.querySelector(`[name="refuelingAmount_${i}"]`)?.value),
            totalPrice: asNum(root.querySelector(`[name="refuelingTotalPrice_${i}"]`)?.value),
            odometer: asNum(root.querySelector(`[name="refuelingOdometer_${i}"]`)?.value),
            payment: root.querySelector(`[name="refuelingPayment_${i}"]`)?.value || null,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        saveSubEntry('fuel', `refueling-${i}`, payload);
        };
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
    });
}

// Favorite countries (shown first)
const favoriteCountries = ['SK', 'AT', 'CZ', 'HU'];

// Get all countries for dropdown (favorites first, then sorted)
function getAllCountries() {
    const all = Object.keys(countryNames);
    const favorites = favoriteCountries.filter(code => all.includes(code));
    const others = all.filter(code => !favoriteCountries.includes(code)).sort();
    return [...favorites, ...others];
}

// Update border "to" dropdown based on "from" selection
function updateBorderToDropdown(id, fromCountry) {
    const toSelect = document.querySelector(`[name="borderTo_${id}"]`);
    if (!toSelect) return;
    if (!fromCountry) {
        toSelect.innerHTML = '<option value="">Vyberte štát</option>';
        return;
    }
    
    // Clear existing options
    toSelect.innerHTML = '<option value="">Vyberte štát</option>';
    
    // Get neighbors
    const neighbors = countryNeighbors[fromCountry.toUpperCase()] || [];
    
    if (neighbors.length === 0) {
        // If no neighbors found, show all countries (favorites first)
        getAllCountries().forEach(code => {
            if (code !== fromCountry.toUpperCase()) {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = `${code} - ${countryNames[code] || code}`;
                toSelect.appendChild(option);
            }
        });
    } else {
        // Show only neighbors, but prioritize favorites
        const neighborFavorites = neighbors.filter(code => favoriteCountries.includes(code));
        const neighborOthers = neighbors.filter(code => !favoriteCountries.includes(code));
        
        // Add favorites first
        neighborFavorites.forEach(code => {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = `${code} - ${countryNames[code] || code}`;
            toSelect.appendChild(option);
        });
        
        // Then add others
        neighborOthers.forEach(code => {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = `${code} - ${countryNames[code] || code}`;
            toSelect.appendChild(option);
        });
    }
}

function getLastBorderDestinationCountry() {
    const container = document.getElementById('borderCrossingContainer');
    if (!container) return null;
    const entries = Array.from(container.querySelectorAll('[id^="border-"]'));
    for (const entry of entries) {
        if (entry.classList.contains('confirmed-entry')) {
            const rows = entry.querySelectorAll('.confirmed-entry-row');
            for (const row of rows) {
                const label = row.querySelector('.confirmed-entry-label')?.textContent.replace(':', '').trim();
                if (label === 'Štát do') {
                    const value = row.querySelector('.confirmed-entry-value')?.textContent || '';
                    const code = value.split(' - ')[0]?.trim();
                    if (code) return code.toUpperCase();
                }
            }
        } else {
            const select = entry.querySelector(`select[name^="borderTo_"]`);
            const value = select?.value;
            if (value) return value.toUpperCase();
        }
    }
    return null;
}

// Add border crossing entry
function addBorderCrossing() {
    // Check if there's already an unconfirmed entry
    if (hasUnconfirmedEntry('borderCrossingContainer')) {
        alert('Prosím najprv potvrďte alebo odstráňte existujúci prechod hraníc pred pridaním nového.');
        return;
    }
    
    // Get next number based on existing entries
    const nextNumber = getNextBorderCrossingNumber();
    borderCrossingCount = Math.max(borderCrossingCount, nextNumber);
    const container = document.getElementById('borderCrossingContainer');
    const suggestedFromCountry = getLastBorderDestinationCountry();
    
    // Remove empty state if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    const entry = document.createElement('div');
    entry.className = 'dynamic-entry';
    entry.id = `border-${borderCrossingCount}`;
    
    // Build country options for "from" dropdown
    const countryOptions = getAllCountries().map(code => 
        `<option value="${code}">${code} - ${countryNames[code] || code}</option>`
    ).join('');
    
    entry.innerHTML = `
        <div class="dynamic-entry-header">
            <span class="entry-number">Prechod #${borderCrossingCount}</span>
            <button type="button" class="btn-remove" onclick="removeBorderCrossing(${borderCrossingCount})" title="Odstrániť">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/>
                </svg>
            </button>
        </div>
        <div class="form-row">
            <div class="form-group">
                <input type="date" name="borderDate_${borderCrossingCount}" required>
            </div>
            <div class="form-group">
                <input type="time" name="borderTime_${borderCrossingCount}" required>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Štát z</label>
                <select name="borderFrom_${borderCrossingCount}" id="borderFrom_${borderCrossingCount}" required>
                    <option value="">Vyberte štát</option>
                    ${countryOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Štát do</label>
                <select name="borderTo_${borderCrossingCount}" id="borderTo_${borderCrossingCount}" required>
                    <option value="">Najprv vyberte štát z</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <label>Stav tachometra (km)</label>
            <input type="number" name="borderOdometer_${borderCrossingCount}" step="0.1" placeholder="0" inputmode="decimal" required>
        </div>
        <div class="form-group">
            <button type="button" class="btn-confirm" onclick="confirmBorderCrossing(${borderCrossingCount})">
                <span class="material-symbols-outlined">check_circle</span>
                Potvrdiť
            </button>
        </div>
    `;
    
    insertEntrySorted(container, entry, 'border');
    refreshBorderNumbers();
    entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Add event listener for "from" country change
    const fromSelect = document.getElementById(`borderFrom_${borderCrossingCount}`);
    if (fromSelect) {
        if (suggestedFromCountry) {
            fromSelect.value = suggestedFromCountry;
            updateBorderToDropdown(borderCrossingCount, suggestedFromCountry);
        }
        fromSelect.addEventListener('change', function() {
            updateBorderToDropdown(borderCrossingCount, this.value);
        });
    }

    if (suggestedFromCountry) {
        setTimeout(() => {
            const toSelect = document.getElementById(`borderTo_${borderCrossingCount}`);
            if (toSelect) {
                toSelect.value = '';
            }
        }, 0);
    }

    bindBorderAutosave(borderCrossingCount);
    updateContainerCompactMode('borderCrossingContainer');
}

function removeBorderCrossing(id) {
    const entry = document.getElementById(`border-${id}`);
    if (entry) {
        // Delete from Firebase first
        deleteSubEntry('border_crossing', `border-${id}`);
        
        // Then remove from DOM
        entry.remove();
        
        // Check if container is empty and show empty state
        const container = document.getElementById('borderCrossingContainer');
        if (container.children.length === 0) {
            container.innerHTML = '<p class="empty-state">Zatiaľ žiadne prechody hraníc</p>';
            borderCrossingCount = 0; // Reset counter
        } else {
            updateContainerCompactMode('borderCrossingContainer');
        }
        refreshBorderNumbers();
    }
}

// Confirm border crossing entry - convert to card view
function confirmBorderCrossing(id) {
    const entry = document.getElementById(`border-${id}`);
    if (!entry) return;
    
    // Get form values
    const date = entry.querySelector(`[name="borderDate_${id}"]`)?.value || '';
    const time = entry.querySelector(`[name="borderTime_${id}"]`)?.value || '';
    const from = entry.querySelector(`[name="borderFrom_${id}"]`)?.value || '';
    const to = entry.querySelector(`[name="borderTo_${id}"]`)?.value || '';
    const odometer = entry.querySelector(`[name="borderOdometer_${id}"]`)?.value || '';
    
    // Validate required fields
    if (!date || !time || !from || !to || !odometer) {
        alert('Prosím vyplňte všetky povinné polia');
        return;
    }
    
    // Save data first
    const payload = {
        date: date || null,
        time: time || null,
        from: from || null,
        to: to || null,
        odometer: asNum(odometer),
        confirmed: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    saveSubEntry('border_crossing', `border-${id}`, payload);
    
    // Get container and move entry to top
    const container = document.getElementById('borderCrossingContainer');
    
    // Convert to card view
    entry.className = 'dynamic-entry confirmed-entry';
    entry.innerHTML = `
        <div class="confirmed-entry-header">
            <div class="confirmed-entry-title">
                <span class="material-symbols-outlined">place</span>
                <span>Prechod #${id}</span>
            </div>
            <div class="confirmed-entry-actions">
                <button type="button" class="btn-edit" onclick="editBorderCrossing(${id})" title="Upraviť">
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button type="button" class="btn-remove" onclick="removeBorderCrossing(${id})" title="Odstrániť">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="confirmed-entry-content">
            <div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Dátum:</span>
                <span class="confirmed-entry-value">${date}</span>
            </div>
            <div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Čas:</span>
                <span class="confirmed-entry-value">${time}</span>
            </div>
            <div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Štát z:</span>
                <span class="confirmed-entry-value">${from} - ${countryNames[from] || from}</span>
            </div>
            <div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Štát do:</span>
                <span class="confirmed-entry-value">${to} - ${countryNames[to] || to}</span>
            </div>
            <div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Tachometer:</span>
                <span class="confirmed-entry-value">${odometer} km</span>
            </div>
        </div>
    `;
    
    if (container) {
        insertEntrySorted(container, entry, 'border');
    }
    
    updateContainerCompactMode('borderCrossingContainer');
    refreshBorderNumbers();
}

// Edit border crossing entry - convert back to form
function editBorderCrossing(id) {
    const entry = document.getElementById(`border-${id}`);
    if (!entry) return;
    
    // Get current values from card
    const content = entry.querySelector('.confirmed-entry-content');
    const rows = content.querySelectorAll('.confirmed-entry-row');
    const values = {};
    rows.forEach(row => {
        const label = row.querySelector('.confirmed-entry-label')?.textContent.replace(':', '').trim();
        const value = row.querySelector('.confirmed-entry-value')?.textContent.trim();
        if (label === 'Dátum') values.date = value;
        else if (label === 'Čas') values.time = value;
        else if (label === 'Štát z') values.from = value.split(' - ')[0];
        else if (label === 'Štát do') values.to = value.split(' - ')[0];
        else if (label === 'Tachometer') values.odometer = value.replace(' km', '');
    });
    
    // Build country options for "from" dropdown
    const countryOptions = getAllCountries().map(code => 
        `<option value="${code}" ${values.from === code ? 'selected' : ''}>${code} - ${countryNames[code] || code}</option>`
    ).join('');
    
    // Convert back to form
    entry.className = 'dynamic-entry';
    entry.innerHTML = `
        <div class="dynamic-entry-header">
            <span class="entry-number">Prechod #${id}</span>
            <button type="button" class="btn-remove" onclick="removeBorderCrossing(${id})" title="Odstrániť">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/>
                </svg>
            </button>
        </div>
        <div class="form-row">
            <div class="form-group">
                <input type="date" name="borderDate_${id}" value="${values.date || ''}" required>
            </div>
            <div class="form-group">
                <input type="time" name="borderTime_${id}" value="${values.time || ''}" required>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Štát z</label>
                <select name="borderFrom_${id}" id="borderFrom_${id}" required>
                    <option value="">Vyberte štát</option>
                    ${countryOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Štát do</label>
                <select name="borderTo_${id}" id="borderTo_${id}" required>
                    <option value="">Najprv vyberte štát z</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <label>Stav tachometra (km)</label>
            <input type="number" name="borderOdometer_${id}" value="${values.odometer || ''}" step="0.1" placeholder="0" inputmode="decimal" required>
        </div>
        <div class="form-group">
            <button type="button" class="btn-confirm" onclick="confirmBorderCrossing(${id})">
                <span class="material-symbols-outlined">check_circle</span>
                Potvrdiť
            </button>
        </div>
    `;
    
    // Update "to" dropdown based on "from" selection
    const fromSelect = document.getElementById(`borderFrom_${id}`);
    if (fromSelect && values.from) {
        fromSelect.value = values.from;
        updateBorderToDropdown(id, values.from);
        // Set "to" value after dropdown is populated
        setTimeout(() => {
            const toSelect = document.getElementById(`borderTo_${id}`);
            if (toSelect && values.to) {
                toSelect.value = values.to;
            }
        }, 100);
    }
    
    // Add event listener for "from" country change
    if (fromSelect) {
        fromSelect.addEventListener('change', function() {
            updateBorderToDropdown(id, this.value);
        });
    }
    
    // Re-bind autosave
    bindBorderAutosave(id);
    updateContainerCompactMode('borderCrossingContainer');
    refreshBorderNumbers();
}

function bindBorderAutosave(i) {
    const root = document.getElementById(`border-${i}`);
    if (!root) return;
    const handler = () => {
        const payload = {
            date: root.querySelector(`[name="borderDate_${i}"]`)?.value || null,
            time: root.querySelector(`[name="borderTime_${i}"]`)?.value || null,
            from: root.querySelector(`[name="borderFrom_${i}"]`)?.value || null,
            to: root.querySelector(`[name="borderTo_${i}"]`)?.value || null,
            odometer: asNum(root.querySelector(`[name="borderOdometer_${i}"]`)?.value),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        saveSubEntry('border_crossing', `border-${i}`, payload);
    };
    root.querySelectorAll('input,select').forEach(el => {
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
    });
}

// Add stop entry
function addStop() {
    // Check if there's already an unconfirmed entry
    if (hasUnconfirmedEntry('stopContainer')) {
        alert('Prosím najprv potvrďte alebo odstráňte existujúcu zastávku pred pridaním novej.');
        return;
    }
    
    // Check if previous stop has departure time
    if (!previousStopHasDeparture()) {
        alert('Prosím najprv zadajte čas odchodu v predchádzajúcej zastávke pred pridaním novej.');
        return;
    }
    
    // Get next number based on existing entries
    const nextNumber = getNextStopNumber();
    stopCount = Math.max(stopCount, nextNumber);
    const container = document.getElementById('stopContainer');
    
    // Remove empty state if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    const entry = document.createElement('div');
    entry.className = 'dynamic-entry';
    entry.id = `stop-${stopCount}`;
    
    entry.innerHTML = `
        <div class="dynamic-entry-header">
            <span class="entry-number">Zastávka #${stopCount}</span>
            <button type="button" class="btn-remove" onclick="removeStop(${stopCount})" title="Odstrániť">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/>
                </svg>
            </button>
        </div>
        <div class="form-group">
            <label>Miesto</label>
            <input type="text" name="stopLocation_${stopCount}" placeholder="Mesto / adresa / GPS" required>
        </div>
        <div class="form-group">
            <label>Poznámka</label>
            <textarea name="stopNote_${stopCount}" placeholder="Poznámka k zastávke"></textarea>
        </div>
        <div class="form-group">
            <label>Stav tachometra (km)</label>
            <input type="number" name="stopOdometer_${stopCount}" step="0.1" placeholder="0" inputmode="decimal" required>
        </div>
        ${container.children.length === 0 ? `
        <div class="form-group">
            <label>Odchod</label>
            <div class="form-row">
                <div class="form-group">
                    <input type="date" name="stopDepartureDate_${stopCount}" required>
                </div>
                <div class="form-group">
                    <input type="time" name="stopDeparture_${stopCount}" required>
                </div>
            </div>
        </div>
        ` : `
        <div class="form-group">
            <label>Príchod</label>
            <div class="form-row">
                <div class="form-group">
                    <input type="date" name="stopArrivalDate_${stopCount}" required>
                </div>
                <div class="form-group">
                    <input type="time" name="stopArrival_${stopCount}" required>
                </div>
            </div>
        </div>
        <div class="form-group">
            <label>Odchod</label>
            <div class="form-row">
                <div class="form-group">
                    <input type="date" name="stopDepartureDate_${stopCount}">
                </div>
                <div class="form-group">
                    <input type="time" name="stopDeparture_${stopCount}">
                </div>
            </div>
        </div>
        `}
        <div class="form-row">
            <div class="form-group">
                <label>Naložené (kg)</label>
                <input type="number" name="stopLoaded_${stopCount}" step="0.1" placeholder="0">
            </div>
            <div class="form-group">
                <label>Vyložené (kg)</label>
                <input type="number" name="stopUnloaded_${stopCount}" step="0.1" placeholder="0">
            </div>
        </div>
        <div class="form-group">
            <button type="button" class="btn-confirm" onclick="confirmStop(${stopCount})">
                <span class="material-symbols-outlined">check_circle</span>
                Potvrdiť
            </button>
        </div>
    `;
    
    insertEntrySorted(container, entry, 'stop');
    refreshStopNumbers();
    entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    bindStopAutosave(stopCount);
    updateContainerCompactMode('stopContainer');
    recalculateStopDistances();
    recomputeHeaderFromStops();
}

// Helper function to get next entry number for stops
function getNextStopNumber() {
    const container = document.getElementById('stopContainer');
    if (!container) return 1;
    const entries = container.querySelectorAll('[id^="stop-"]');
    return entries.length + 1;
}

// Helper function to get next entry number for refueling
function getNextRefuelingNumber() {
    const container = document.getElementById('refuelingContainer');
    if (!container) return 1;
    const entries = container.querySelectorAll('[id^="refueling-"]');
    return entries.length + 1;
}

// Helper function to get next entry number for border crossings
function getNextBorderCrossingNumber() {
    const container = document.getElementById('borderCrossingContainer');
    if (!container) return 1;
    const entries = container.querySelectorAll('[id^="border-"]');
    return entries.length + 1;
}

// Recalculate distances for all stops
function recalculateStopDistances() {
    const container = document.getElementById('stopContainer');
    if (!container) return;

    container.querySelectorAll('.stop-distance').forEach(el => el.remove());

    const entries = Array.from(container.querySelectorAll('[id^="stop-"]'));
    let prevConfirmed = null;

    entries.forEach(entry => {
        if (!entry.classList.contains('confirmed-entry')) {
            return;
        }

        const currentOdo = getStopOdometerValue(entry);
        if (prevConfirmed) {
            const prevOdo = getStopOdometerValue(prevConfirmed);
            if (prevOdo != null && currentOdo != null) {
                const rawDistance = Math.abs(currentOdo - prevOdo);
                if (!isFinite(rawDistance)) {
                    prevConfirmed = entry;
                    return;
                }
                const indicator = document.createElement('div');
                indicator.className = 'stop-distance';
                const distance = Math.round(rawDistance);
                indicator.textContent = `${distance} km od predchádzajúcej zastávky`;
                container.insertBefore(indicator, entry);
            }
        }

        prevConfirmed = entry;
    });
}

function getStopOdometerValue(entry) {
    if (!entry) return null;
    const dataValue = entry.dataset?.odometer;
    if (dataValue !== undefined) {
        const parsed = parseFloat(dataValue);
        if (!isNaN(parsed)) return parsed;
    }
    const row = Array.from(entry.querySelectorAll('.confirmed-entry-row')).find(
        r => r.querySelector('.confirmed-entry-label')?.textContent.includes('Tachometer')
    );
    if (!row) return null;
    const text = row.querySelector('.confirmed-entry-value')?.textContent;
    if (!text) return null;
    const match = text.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : null;
}

function removeStop(id) {
    const entry = document.getElementById(`stop-${id}`);
    if (entry) {
        // Delete from Firebase first
        deleteSubEntry('stops', `stop-${id}`);
        
        // Then remove from DOM
        entry.remove();
        
        // Recalculate distances for remaining stops
        recalculateStopDistances();
        
        // Recompute header from remaining stops
        recomputeHeaderFromStops();
        
        // Check if container is empty and show empty state
        const container = document.getElementById('stopContainer');
        if (container.children.length === 0) {
            container.innerHTML = '<p class="empty-state">Zatiaľ žiadne zastávky</p>';
            stopCount = 0; // Reset counter
        } else {
            updateContainerCompactMode('stopContainer');
        }
        refreshStopNumbers();
    }
}

// Confirm stop entry - convert to card view
function confirmStop(id) {
    const entry = document.getElementById(`stop-${id}`);
    if (!entry) return;
    
    // Get form values
    const location = entry.querySelector(`[name="stopLocation_${id}"]`)?.value || '';
    const note = entry.querySelector(`[name="stopNote_${id}"]`)?.value || '';
    const odometer = entry.querySelector(`[name="stopOdometer_${id}"]`)?.value || '';
    const arrivalDate = entry.querySelector(`[name="stopArrivalDate_${id}"]`)?.value || '';
    const arrival = entry.querySelector(`[name="stopArrival_${id}"]`)?.value || '';
    const departureDate = entry.querySelector(`[name="stopDepartureDate_${id}"]`)?.value || '';
    const departure = entry.querySelector(`[name="stopDeparture_${id}"]`)?.value || '';
    const loaded = entry.querySelector(`[name="stopLoaded_${id}"]`)?.value || '';
    const unloaded = entry.querySelector(`[name="stopUnloaded_${id}"]`)?.value || '';
    
    // Check if this is the first stop (last in DOM)
    const stopContainer = document.getElementById('stopContainer');
    const allStopsList = Array.from(stopContainer.querySelectorAll('[id^="stop-"]'));
    const isFirstStop = allStopsList.length > 0 && allStopsList[allStopsList.length - 1].id === `stop-${id}`;
    
    // Validate required fields
    // First stop requires: location, odometer, departure
    // Subsequent stops require: location, odometer, arrival
    if (!location || !odometer) {
        alert('Prosím vyplňte všetky povinné polia (Miesto, Tachometer)');
        return;
    }
    if (isFirstStop) {
        // First stop requires departure only
        if (!departureDate || !departure) {
            alert('Prosím vyplňte dátum a čas odchodu pre prvú zastávku');
            return;
        }
    } else {
        // Subsequent stops require arrival
        if (!arrivalDate || !arrival) {
            alert('Prosím vyplňte dátum a čas príchodu');
            return;
        }
    }
    
    // Save data first
    const payload = {
        location: location || null,
        note: note || null,
        odometer: asNum(odometer),
        arrivalDate: arrivalDate || null,
        arrival: arrival || null,
        departureDate: departureDate || null,
        departure: departure || null,
        loaded: asNum(loaded),
        unloaded: asNum(unloaded),
        confirmed: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    saveSubEntry('stops', `stop-${id}`, payload);
    
    // Convert to card view
    entry.className = 'dynamic-entry confirmed-entry';
    entry.innerHTML = `
        <div class="confirmed-entry-header">
            <div class="confirmed-entry-title">
                <span class="material-symbols-outlined">flyover</span>
                <span>Zastávka #${id}</span>
            </div>
            <div class="confirmed-entry-actions">
                <button type="button" class="btn-edit" onclick="editStop(${id})" title="Upraviť">
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button type="button" class="btn-remove" onclick="removeStop(${id})" title="Odstrániť">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="confirmed-entry-content">
            <div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Miesto:</span>
                <span class="confirmed-entry-value">${location}</span>
            </div>
            ${note ? `<div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Poznámka:</span>
                <span class="confirmed-entry-value">${note}</span>
            </div>` : ''}
            <div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Tachometer:</span>
                <span class="confirmed-entry-value">${odometer} km</span>
            </div>
            ${arrivalDate && arrival ? `<div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Príchod:</span>
                <span class="confirmed-entry-value">${arrivalDate} ${arrival}</span>
            </div>` : ''}
            ${departureDate && departure ? `<div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Odchod:</span>
                <span class="confirmed-entry-value">${departureDate} ${departure}</span>
            </div>` : departure ? `<div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Odchod:</span>
                <span class="confirmed-entry-value">${arrivalDate || departureDate || ''} ${departure}</span>
            </div>` : ''}
            ${loaded || unloaded ? `<div class="confirmed-entry-row">
                <span class="confirmed-entry-label">Naložené/Vyložené:</span>
                <span class="confirmed-entry-value">${loaded || '0'} kg / ${unloaded || '0'} kg</span>
            </div>` : ''}
        </div>
    `;
    entry.dataset.odometer = asNum(odometer) ?? '';
    
    if (stopContainer) {
        insertEntrySorted(stopContainer, entry, 'stop');
    }
    
    updateContainerCompactMode('stopContainer');
    recalculateStopDistances();
    recomputeHeaderFromStops();
    refreshStopNumbers();
}

// Edit stop entry - convert back to form
function editStop(id) {
    const entry = document.getElementById(`stop-${id}`);
    if (!entry) return;
    
    // Get current values from card
    const content = entry.querySelector('.confirmed-entry-content');
    const rows = content.querySelectorAll('.confirmed-entry-row');
    const values = {};
    rows.forEach(row => {
        const label = row.querySelector('.confirmed-entry-label')?.textContent.replace(':', '').trim();
        const value = row.querySelector('.confirmed-entry-value')?.textContent.trim();
        if (label === 'Miesto') values.location = value;
        else if (label === 'Poznámka') values.note = value;
        else if (label === 'Tachometer') values.odometer = value.replace(' km', '');
        else if (label === 'Príchod') {
            const parts = value.split(' ');
            values.arrivalDate = parts[0];
            values.arrival = parts[1] || '';
        }
        else if (label === 'Odchod') {
            const parts = value.split(' ');
            values.departureDate = parts[0];
            values.departure = parts[1] || '';
        }
        else if (label === 'Naložené/Vyložené') {
            const parts = value.split(' / ');
            values.loaded = parts[0].replace(' kg', '');
            values.unloaded = parts[1].replace(' kg', '');
        }
    });
    
    // Check if this is the first stop (last in DOM)
    const container = document.getElementById('stopContainer');
    const allStops = Array.from(container.querySelectorAll('[id^="stop-"]'));
    const isFirstStop = allStops.length > 0 && allStops[allStops.length - 1].id === `stop-${id}`;
    
    // Convert back to form
    entry.className = 'dynamic-entry';
    entry.innerHTML = `
        <div class="dynamic-entry-header">
            <span class="entry-number">Zastávka #${id}</span>
            <button type="button" class="btn-remove" onclick="removeStop(${id})" title="Odstrániť">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/>
                </svg>
            </button>
        </div>
        <div class="form-group">
            <label>Miesto</label>
            <input type="text" name="stopLocation_${id}" value="${values.location || ''}" placeholder="Mesto / adresa / GPS" required>
        </div>
        <div class="form-group">
            <label>Poznámka</label>
            <textarea name="stopNote_${id}" placeholder="Poznámka k zastávke">${values.note || ''}</textarea>
        </div>
        <div class="form-group">
            <label>Stav tachometra (km)</label>
            <input type="number" name="stopOdometer_${id}" value="${values.odometer || ''}" step="0.1" placeholder="0" inputmode="decimal" required>
        </div>
        ${isFirstStop ? `
        <div class="form-group">
            <label>Odchod</label>
            <div class="form-row">
                <div class="form-group">
                    <input type="date" name="stopDepartureDate_${id}" value="${values.departureDate || ''}" required>
                </div>
                <div class="form-group">
                    <input type="time" name="stopDeparture_${id}" value="${values.departure || ''}" required>
                </div>
            </div>
        </div>
        ` : `
        <div class="form-group">
            <label>Príchod</label>
            <div class="form-row">
                <div class="form-group">
                    <input type="date" name="stopArrivalDate_${id}" value="${values.arrivalDate || ''}" required>
                </div>
                <div class="form-group">
                    <input type="time" name="stopArrival_${id}" value="${values.arrival || ''}" required>
                </div>
            </div>
        </div>
        <div class="form-group">
            <label>Odchod</label>
            <div class="form-row">
                <div class="form-group">
                    <input type="date" name="stopDepartureDate_${id}" value="${values.departureDate || ''}">
                </div>
                <div class="form-group">
                    <input type="time" name="stopDeparture_${id}" value="${values.departure || ''}">
                </div>
            </div>
        </div>
        `}
        <div class="form-row">
            <div class="form-group">
                <label>Naložené (kg)</label>
                <input type="number" name="stopLoaded_${id}" value="${values.loaded || ''}" step="0.1" placeholder="0">
            </div>
            <div class="form-group">
                <label>Vyložené (kg)</label>
                <input type="number" name="stopUnloaded_${id}" value="${values.unloaded || ''}" step="0.1" placeholder="0">
            </div>
        </div>
        <div class="form-group">
            <button type="button" class="btn-confirm" onclick="confirmStop(${id})">
                <span class="material-symbols-outlined">check_circle</span>
                Potvrdiť
            </button>
        </div>
    `;
    
    // Re-bind autosave
    bindStopAutosave(id);
    delete entry.dataset.odometer;
    updateContainerCompactMode('stopContainer');
    recalculateStopDistances();
    recomputeHeaderFromStops();
    refreshStopNumbers();
}

function bindStopAutosave(i) {
    const root = document.getElementById(`stop-${i}`);
    if (!root) return;
    const handler = () => {
        const payload = {
            location: root.querySelector(`[name="stopLocation_${i}"]`)?.value || null,
            note: root.querySelector(`[name="stopNote_${i}"]`)?.value || null,
            odometer: asNum(root.querySelector(`[name="stopOdometer_${i}"]`)?.value),
            arrivalDate: root.querySelector(`[name="stopArrivalDate_${i}"]`)?.value || null,
            arrival: root.querySelector(`[name="stopArrival_${i}"]`)?.value || null,
            departureDate: root.querySelector(`[name="stopDepartureDate_${i}"]`)?.value || null,
            departure: root.querySelector(`[name="stopDeparture_${i}"]`)?.value || null,
            loaded: asNum(root.querySelector(`[name="stopLoaded_${i}"]`)?.value),
            unloaded: asNum(root.querySelector(`[name="stopUnloaded_${i}"]`)?.value),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        saveSubEntry('stops', `stop-${i}`, payload);
        recomputeHeaderFromStops();
    };
    root.querySelectorAll('input,select,textarea').forEach(el => {
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
    });
}

function recomputeHeaderFromStops() {
    // Find all stops in DOM and compute start/end date/time and odometer
    // Note: stops are added at the top, so first in DOM is chronologically LAST (most recent)
    const stops = Array.from(document.querySelectorAll('[id^="stop-"]'));
    if (stops.length === 0) return;
    const parseTime = (t) => t && t.length >= 4 ? t : null;
    const toDate = (dateStr) => dateStr || null;
    let chronologicallyFirst = null, chronologicallyLast = null;
    
    // Process all stops to find the chronologically first and last
    for (const el of stops) {
        // Check if it's a confirmed entry (card view) or form
        const isConfirmed = el.classList.contains('confirmed-entry');
        let arrivalDate, arrival, departureDate, departure, odometer;
        
        if (isConfirmed) {
            // Extract from card view
            const rows = el.querySelectorAll('.confirmed-entry-row');
            rows.forEach(row => {
                const label = row.querySelector('.confirmed-entry-label')?.textContent.replace(':', '').trim();
                const value = row.querySelector('.confirmed-entry-value')?.textContent.trim();
                if (label === 'Príchod') {
                    const parts = value.split(' ');
                    arrivalDate = parts[0];
                    arrival = parts[1] || '';
                } else if (label === 'Odchod') {
                    const parts = value.split(' ');
                    departureDate = parts[0];
                    departure = parts[1] || '';
                } else if (label === 'Tachometer') {
                    odometer = asNum(value.replace(' km', ''));
                }
            });
        } else {
            // Extract from form
            const arrivalDateEl = el.querySelector('input[name^="stopArrivalDate_"]');
            const arrivalEl = el.querySelector('input[name^="stopArrival_"]');
            const departureDateEl = el.querySelector('input[name^="stopDepartureDate_"]');
            const departureEl = el.querySelector('input[name^="stopDeparture_"]');
            const odoEl = el.querySelector('input[name^="stopOdometer_"]');
            arrivalDate = arrivalDateEl?.value || null;
            arrival = parseTime(arrivalEl?.value || null);
            departureDate = departureDateEl?.value || null;
            departure = parseTime(departureEl?.value || null);
            odometer = asNum(odoEl?.value);
        }
        
        const current = {
            arrivalDate: arrivalDate || (document.getElementById('startDate')?.value || new Date().toISOString().slice(0,10)),
            arrival,
            departureDate: departureDate || arrivalDate || (document.getElementById('startDate')?.value || new Date().toISOString().slice(0,10)),
            departure,
            odometer
        };
        
        // First stop in DOM is chronologically LAST (most recent)
        // Last stop in DOM is chronologically FIRST (oldest)
        if (!chronologicallyLast) chronologicallyLast = current; // First in DOM = most recent
        chronologicallyFirst = current; // Keep updating to get the last in DOM = oldest
    }
    
    // Set start from departure time of chronologically first stop (oldest, last in DOM)
    if (chronologicallyFirst) {
        // Use departure time for start (first zastávka departure)
        document.getElementById('startDate').value = toDate(chronologicallyFirst.departureDate || chronologicallyFirst.arrivalDate);
        document.getElementById('startTime').value = chronologicallyFirst.departure || chronologicallyFirst.arrival || '';
        document.getElementById('startOdometer').value = chronologicallyFirst.odometer != null ? chronologicallyFirst.odometer : '';
    }
    
    // Set end from arrival time of the last zastávka without departure time (final destination)
    // Iterate through stops to find the most recent one without departure
    // (stops are ordered: first in DOM = most recent, last in DOM = oldest)
    let finalStop = null;
    for (const el of stops) {
        const isConfirmed = el.classList.contains('confirmed-entry');
        let departure, arrivalDate, arrival, odometer;
        
        if (isConfirmed) {
            // Extract from card view
            const rows = el.querySelectorAll('.confirmed-entry-row');
            rows.forEach(row => {
                const label = row.querySelector('.confirmed-entry-label')?.textContent.replace(':', '').trim();
                const value = row.querySelector('.confirmed-entry-value')?.textContent.trim();
                if (label === 'Odchod') {
                    const parts = value.split(' ');
                    departure = parts.length > 1 ? value : (parts[0] || null);
                } else if (label === 'Príchod') {
                    const parts = value.split(' ');
                    arrivalDate = parts[0];
                    arrival = parts[1] || '';
                } else if (label === 'Tachometer') {
                    odometer = asNum(value.replace(' km', ''));
                }
            });
        } else {
            // Extract from form
            const departureDateEl = el.querySelector('input[name^="stopDepartureDate_"]');
            const departureEl = el.querySelector('input[name^="stopDeparture_"]');
            const arrivalDateEl = el.querySelector('input[name^="stopArrivalDate_"]');
            const arrivalEl = el.querySelector('input[name^="stopArrival_"]');
            const odoEl = el.querySelector('input[name^="stopOdometer_"]');
            
            departure = (departureDateEl?.value && departureEl?.value) ? 
                `${departureDateEl.value} ${departureEl.value}` : 
                (departureEl?.value || null);
            arrivalDate = arrivalDateEl?.value || null;
            arrival = parseTime(arrivalEl?.value || null);
            odometer = asNum(odoEl?.value);
        }
        
        // If this stop doesn't have departure AND has arrival, it's the final destination
        // Since we iterate from first in DOM (most recent) to last (oldest),
        // the first one without departure is the actual final destination
        if (!departure && arrivalDate && arrival) {
            finalStop = {
                arrivalDate: arrivalDate || (document.getElementById('startDate')?.value || new Date().toISOString().slice(0,10)),
                arrival,
                odometer: odometer != null ? odometer : null
            };
            break; // Found the final stop (most recent without departure)
        }
    }
    
    // If no stop without departure found, use the most recent stop's departure
    if (!finalStop && chronologicallyLast) {
        finalStop = {
            arrivalDate: chronologicallyLast.departureDate || chronologicallyLast.arrivalDate,
            arrival: chronologicallyLast.departure || chronologicallyLast.arrival,
            odometer: chronologicallyLast.odometer
        };
    }
    
    // Set end from final stop
    if (finalStop) {
        document.getElementById('endDate').value = toDate(finalStop.arrivalDate);
        document.getElementById('endTime').value = finalStop.arrival || '';
        document.getElementById('endOdometer').value = finalStop.odometer != null ? finalStop.odometer : '';
    }
    autosaveHeader();
    updateTotalKm(); // Update total km in hlavička
}

// Form submission
document.getElementById('tripForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const data = {};
    
    // Collect all form data
    for (let [key, value] of formData.entries()) {
        if (data[key]) {
            // If key already exists, convert to array
            if (Array.isArray(data[key])) {
                data[key].push(value);
            } else {
                data[key] = [data[key], value];
            }
        } else {
            data[key] = value;
        }
    }
    
    // Organize dynamic entries
    const refuelings = [];
    const borderCrossings = [];
    const stops = [];
    
    for (let i = 1; i <= refuelingCount; i++) {
        const entry = document.getElementById(`refueling-${i}`);
        if (entry) {
            refuelings.push({
                date: data[`refuelingDate_${i}`],
                time: data[`refuelingTime_${i}`],
                location: data[`refuelingLocation_${i}`],
                amount: data[`refuelingAmount_${i}`],
                odometer: data[`refuelingOdometer_${i}`],
                totalPrice: data[`refuelingTotalPrice_${i}`],
                payment: data[`refuelingPayment_${i}`]
            });
        }
    }
    
    for (let i = 1; i <= borderCrossingCount; i++) {
        const entry = document.getElementById(`border-${i}`);
        if (entry) {
            borderCrossings.push({
                date: data[`borderDate_${i}`],
                time: data[`borderTime_${i}`],
                from: data[`borderFrom_${i}`],
                to: data[`borderTo_${i}`],
                odometer: data[`borderOdometer_${i}`]
            });
        }
    }
    
    for (let i = 1; i <= stopCount; i++) {
        const entry = document.getElementById(`stop-${i}`);
        if (entry) {
            stops.push({
                location: data[`stopLocation_${i}`],
                note: data[`stopNote_${i}`],
                arrival: data[`stopArrival_${i}`],
                departure: data[`stopDeparture_${i}`],
                odometer: data[`stopOdometer_${i}`],
                loaded: data[`stopLoaded_${i}`],
                unloaded: data[`stopUnloaded_${i}`]
            });
        }
    }
    
    const tripData = {
        header: {
            driver: data.driver,
            vehiclePlate: data.vehiclePlate,
            startDate: data.startDate,
            startTime: data.startTime,
            endDate: data.endDate,
            endTime: data.endTime,
            startOdometer: data.startOdometer,
            endOdometer: data.endOdometer
        },
        refuelings: refuelings,
        borderCrossings: borderCrossings,
        stops: stops
    };
    
    // Also persist full header immediately
    autosaveHeader();
    console.log('Trip Data (local):', JSON.stringify(tripData, null, 2));
    alert('Údaje uložené (autosave).');
});


// Update header with driver name
function updateTotalKm() {
    const totalKmField = document.getElementById('totalKm');
    if (totalKmField) {
        const startOdo = document.getElementById('startOdometer')?.value;
        const endOdo = document.getElementById('endOdometer')?.value;
        if (startOdo && endOdo) {
            const start = parseFloat(startOdo);
            const end = parseFloat(endOdo);
            if (!isNaN(start) && !isNaN(end) && end >= start) {
                const totalKm = (end - start).toFixed(1);
                totalKmField.value = `${totalKm} km`;
            } else {
                totalKmField.value = '';
            }
        } else {
            totalKmField.value = '';
        }
    }
}

function updateHeaderDriverName() {
    const headerName = document.getElementById('headerDriverName');
    if (headerName) {
        headerName.textContent = driverName || 'Vodič';
    }
    
    // Also update total km in hlavička
    updateTotalKm();
}

// Navigation functions
function navigateToHistory() {
    currentView = 'history';
    viewingTripId = null;
    
    // Ensure main content is visible
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.style.display = 'block';
    }
    
    updateView();
    loadRideHistory();
}

function navigateToCurrentRide() {
    currentView = 'ride';
    viewingTripId = null;
    updateView();
}

function viewPastRide(tripId) {
    currentView = 'view-ride';
    viewingTripId = tripId;
    updateView();
    loadPastRide(tripId);
}

// Open ride for editing (for in-progress rides)
async function openRideForEditing(tripId) {
    if (!db || !driverName) return;
    
    // Clear form first to avoid showing old data
    clearForm();
    
    // Set as current trip
    currentTripId = tripId;
    currentView = 'ride';
    
    // Load the ride data into the form
    await loadRideData(tripId, false);
    
    // Update view to show edit mode
    updateView();
}

function updateView() {
    // Hide all sections - use only CSS classes, no inline styles
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.remove('active');
    });
    
    // Hide/show tab navigation
    const tabNav = document.getElementById('tabNavigation');
    const finishBtn = document.getElementById('finishRideContainer');
    const backBtn = document.getElementById('backBtn');
    const syncChip = document.getElementById('syncChip');
    const headerLogoutBtn = document.getElementById('headerLogoutBtn');
    
    if (currentView === 'ride') {
        if (tabNav) {
            tabNav.classList.remove('hidden');
        }
        if (finishBtn) {
            finishBtn.classList.remove('hidden');
        }
        if (backBtn) {
            backBtn.classList.remove('hidden');
            backBtn.onclick = () => navigateToHistory();
        }
        if (syncChip) {
            syncChip.classList.remove('hidden');
        }
        if (headerLogoutBtn) {
            headerLogoutBtn.classList.add('hidden');
        }
        // Switch to header section - this will show the section and set active tab
        switchSection('header');
    } else if (currentView === 'history') {
        const section = document.getElementById('section-history');
        if (section) {
            section.classList.add('active');
        }
        if (tabNav) {
            tabNav.classList.add('hidden');
        }
        if (finishBtn) {
            finishBtn.classList.add('hidden');
        }
        if (backBtn) {
            backBtn.classList.add('hidden');
        }
        if (syncChip) {
            syncChip.classList.add('hidden');
        }
        if (headerLogoutBtn) {
            headerLogoutBtn.classList.remove('hidden');
        }
    } else if (currentView === 'view-ride') {
        const section = document.getElementById('section-view-ride');
        if (section) {
            section.classList.add('active');
        }
        if (tabNav) {
            tabNav.classList.add('hidden');
        }
        if (finishBtn) {
            finishBtn.classList.add('hidden');
        }
        if (backBtn) {
            backBtn.classList.remove('hidden');
            backBtn.onclick = () => navigateToHistory();
        }
        if (syncChip) {
            syncChip.classList.add('hidden');
        }
        if (headerLogoutBtn) {
            headerLogoutBtn.classList.add('hidden');
        }
    }
}

// Generate unique trip ID with date and timestamp
function generateTripId(startDate, overrideId) {
    if (overrideId) {
        return overrideId;
    }
    if (!startDate) {
        startDate = new Date().toISOString().split('T')[0];
    }
    // Format: YYYY-MM-DD_timestamp or YYYY-MM-DD_YYYY-MM-DD_id if end date exists
    const timestamp = Date.now();
    return `${startDate}_${timestamp}`;
}

function sanitizeDriveId(displayId) {
    if (!displayId) return null;
    return displayId.replace(/\//g, '_');
}

function restoreDriveIdFromDocId(docId) {
    if (typeof docId !== 'string') return null;
    const match = docId.match(/^([A-Z]{1,3}-[0-9]{4})_([0-9]{2})$/);
    if (match) {
        return `${match[1]}/${match[2]}`;
    }
    return null;
}

function resolveDisplayDriveId(docId, data, header) {
    if (header && typeof header.driveId === 'string' && header.driveId.trim() !== '') {
        return header.driveId;
    }
    if (data && typeof data.driveId === 'string' && data.driveId.trim() !== '') {
        return data.driveId;
    }
    return restoreDriveIdFromDocId(docId);
}

// Generate display Drive ID like AB-0001/25
async function generateDriveDisplayId(driverFullName, yearTwoDigits) {
    if (!db || !driverName) return null;
    // Build initials from provided full name (take first letters of first two tokens)
    const parts = (driverFullName || '').trim().split(/\s+/).filter(Boolean);
    const firstInitial = parts[0]?.[0]?.toUpperCase() || '';
    const secondInitial = parts[1]?.[0]?.toUpperCase() || '';
    const initials = `${firstInitial}${secondInitial}`;
    // Scan existing trips to find the biggest sequence for these initials
    const ridesRef = db.collection('rides').doc(driverName).collection('trips');
    const snapshot = await ridesRef.limit(200).get();
    let maxSeq = 0;
    snapshot.forEach(doc => {
        const data = doc.data() || {};
        const header = data.header || null;
        let driveId = null;
        // Prefer header subdoc if present (will be loaded in separate place normally)
        // But to avoid extra reads here, we also check flattened field on main doc if present.
        if (data.driveId) driveId = data.driveId;
        if (!driveId && header && header.driveId) driveId = header.driveId;
        if (!driveId) {
            driveId = restoreDriveIdFromDocId(doc.id);
        }
        if (typeof driveId === 'string' && driveId.startsWith(`${initials}-`)) {
            const m = driveId.match(/^[A-Z]{1,3}-([0-9]{4})\/([0-9]{2})$/);
            if (m) {
                const num = parseInt(m[1], 10);
                if (!Number.isNaN(num)) {
                    if (num > maxSeq) maxSeq = num;
                }
            }
        }
    });
    const nextSeq = (maxSeq + 1).toString().padStart(4, '0');
    const yy = yearTwoDigits;
    if (!initials || !yy) return null;
    return `${initials}-${nextSeq}/${yy}`;
}

// Clear form completely
function clearForm() {
    refuelingCount = 0;
    borderCrossingCount = 0;
    stopCount = 0;
    
    document.getElementById('refuelingContainer').innerHTML = '<p class="empty-state">Zatiaľ žiadne tankovania</p>';
    document.getElementById('borderCrossingContainer').innerHTML = '<p class="empty-state">Zatiaľ žiadne prechody hraníc</p>';
    document.getElementById('stopContainer').innerHTML = '<p class="empty-state">Zatiaľ žiadne zastávky</p>';
    
    // Reset form fields - but keep driver name from global variable
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toTimeString().slice(0, 5);
    
    document.getElementById('startDate').value = today;
    document.getElementById('startTime').value = now;
    document.getElementById('endDate').value = '';
    document.getElementById('endTime').value = '';
    document.getElementById('startOdometer').value = '';
    document.getElementById('endOdometer').value = '';
    refreshDateTimePlaceholders();
    
    // Restore vehicle plate and trailer plate from access code if available
    // (This will be set during login, but we don't clear them here to preserve user input)
}

// Ensure current ride exists
async function ensureCurrentRide() {
    if (!db || !driverName) return;
    
    try {
        // Check if there's an incomplete ride
        const ridesRef = db.collection('rides').doc(driverName).collection('trips');
        // Query for rides where completed is false
        const snapshotFalse = await ridesRef.where('completed', '==', false).limit(1).get();
        
        if (!snapshotFalse.empty) {
            // Use existing incomplete ride
            const doc = snapshotFalse.docs[0];
            currentTripId = doc.id;
            await loadRideData(currentTripId, false);
        } else {
            // No incomplete ride found - don't create a trip yet, wait for user to click "Nová jazda"
            // Just set currentTripId to null so createNewRide will create it
            currentTripId = null;
            clearForm();
        }
    } catch (e) {
        console.error('Error ensuring current ride:', e);
        // Fallback to creating new ride
        const today = new Date().toISOString().split('T')[0];
        const yearTwoDigits = new Date().getFullYear().toString().slice(-2);
        const displayId = await generateDriveDisplayId(driverName, yearTwoDigits);
        const sanitizedId = sanitizeDriveId(displayId);
        currentTripId = generateTripId(today, sanitizedId);
        clearForm();
    }
}

// Load ride data into form
async function loadRideData(tripId, readOnly = false) {
    if (!db || !driverName) return;
    
    const docRef = db.collection('rides').doc(driverName).collection('trips').doc(tripId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
        // If document doesn't exist, try loading header from subcollection
        const headerSnapshot = await docRef.collection('header').limit(1).get();
        if (headerSnapshot.empty) return;
    }
    
    // Load header from subcollection (new structure)
    const headerSnapshot = await docRef.collection('header').limit(1).get();
    if (!headerSnapshot.empty) {
        const headerData = headerSnapshot.docs[0].data();
        const h = headerData;
        if (document.getElementById('vehiclePlate')) document.getElementById('vehiclePlate').value = h.vehiclePlate || '';
        if (document.getElementById('trailerPlate')) document.getElementById('trailerPlate').value = h.trailerPlate || '';
        if (document.getElementById('startDate')) document.getElementById('startDate').value = h.startDate || '';
        if (document.getElementById('startTime')) document.getElementById('startTime').value = h.startTime || '';
        if (document.getElementById('endDate')) document.getElementById('endDate').value = h.endDate || '';
        if (document.getElementById('endTime')) document.getElementById('endTime').value = h.endTime || '';
        if (document.getElementById('startOdometer')) document.getElementById('startOdometer').value = h.startOdometer || '';
        if (document.getElementById('endOdometer')) document.getElementById('endOdometer').value = h.endOdometer || '';
        // Update total km after loading
        updateTotalKm();
        refreshDateTimePlaceholders();
    } else {
        // Fallback: try loading from old structure (document data)
        const data = doc.exists ? doc.data() : {};
        if (data.header) {
            const h = data.header;
            if (document.getElementById('vehiclePlate')) document.getElementById('vehiclePlate').value = h.vehiclePlate || '';
            if (document.getElementById('trailerPlate')) document.getElementById('trailerPlate').value = h.trailerPlate || '';
            if (document.getElementById('startDate')) document.getElementById('startDate').value = h.startDate || '';
            if (document.getElementById('startTime')) document.getElementById('startTime').value = h.startTime || '';
            if (document.getElementById('endDate')) document.getElementById('endDate').value = h.endDate || '';
            if (document.getElementById('endTime')) document.getElementById('endTime').value = h.endTime || '';
            if (document.getElementById('startOdometer')) document.getElementById('startOdometer').value = h.startOdometer || '';
            if (document.getElementById('endOdometer')) document.getElementById('endOdometer').value = h.endOdometer || '';
            // Update total km after loading
            updateTotalKm();
            refreshDateTimePlaceholders();
        }
    }
    
    refreshDateTimePlaceholders();
    
    if (readOnly) return;
    
    // Load sub-collections
    await loadSubCollection('fuel', 'refueling', addRefueling, bindRefuelingAutosave);
    await loadSubCollection('border_crossing', 'border', addBorderCrossing, bindBorderAutosave);
    await loadSubCollection('stops', 'stop', addStop, bindStopAutosave);
}

async function loadSubCollection(collectionName, prefix, addFn, bindFn) {
    if (!db || !driverName || !currentTripId) return;
    
    const base = getTripDocRef();
    if (!base) return;
    
    // Clear existing entries first
    if (prefix === 'refueling') {
        document.getElementById('refuelingContainer').innerHTML = '';
        refuelingCount = 0;
    } else if (prefix === 'border') {
        document.getElementById('borderCrossingContainer').innerHTML = '';
        borderCrossingCount = 0;
    } else if (prefix === 'stop') {
        document.getElementById('stopContainer').innerHTML = '';
        stopCount = 0;
    }
    
    const snapshot = await base.collection(collectionName).get();
    
    if (snapshot.empty) {
        // Show empty state
        if (prefix === 'refueling') {
            document.getElementById('refuelingContainer').innerHTML = '<p class="empty-state">Zatiaľ žiadne tankovania</p>';
        } else if (prefix === 'border') {
            document.getElementById('borderCrossingContainer').innerHTML = '<p class="empty-state">Zatiaľ žiadne prechody hraníc</p>';
        } else if (prefix === 'stop') {
            document.getElementById('stopContainer').innerHTML = '<p class="empty-state">Zatiaľ žiadne zastávky</p>';
        }
        return;
    }
    
    // Convert to array and sort by entry number (descending - newest first)
    const docsArray = [];
    snapshot.forEach(doc => {
        const match = doc.id.match(new RegExp(`${prefix}-(\\d+)`));
        if (match) {
            const num = parseInt(match[1]);
            docsArray.push({ doc, num, data: doc.data() });
            
            // Update max count
            if (prefix === 'refueling') refuelingCount = Math.max(refuelingCount, num);
            else if (prefix === 'border') borderCrossingCount = Math.max(borderCrossingCount, num);
            else if (prefix === 'stop') stopCount = Math.max(stopCount, num);
        }
    });
    
    // Sort by number descending (newest first)
    docsArray.sort((a, b) => b.num - a.num);
    
    // Add entries in sorted order (newest first)
    docsArray.forEach(({ doc, num, data }) => {
        const entryId = `${prefix === 'refueling' ? 'refueling' : prefix === 'border' ? 'border' : 'stop'}-${num}`;
        
        // If entry is confirmed, restore as card directly
        if (data.confirmed) {
            restoreConfirmedEntry(entryId, data, prefix, num);
        } else {
            addFn();
            const entry = document.getElementById(entryId);
            if (entry) {
                populateEntry(entry, data, prefix, num);
                bindFn(num);
            }
        }
    });
    
    // Update compact mode after loading
    if (prefix === 'refueling') {
        updateContainerCompactMode('refuelingContainer');
    } else if (prefix === 'border') {
        updateContainerCompactMode('borderCrossingContainer');
    } else if (prefix === 'stop') {
        updateContainerCompactMode('stopContainer');
        recalculateStopDistances();
        recomputeHeaderFromStops();
    }
}

// Restore confirmed entry as card view
function restoreConfirmedEntry(entryId, data, prefix, num) {
    const container = prefix === 'refueling' ? document.getElementById('refuelingContainer') :
                     prefix === 'border' ? document.getElementById('borderCrossingContainer') :
                     document.getElementById('stopContainer');
    if (!container) return;
    
    // Update counters to ensure they're at least as high as the entry number
    if (prefix === 'refueling') {
        refuelingCount = Math.max(refuelingCount, num);
    } else if (prefix === 'border') {
        borderCrossingCount = Math.max(borderCrossingCount, num);
    } else if (prefix === 'stop') {
        stopCount = Math.max(stopCount, num);
    }
    
    // Remove empty state if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    
    const entry = document.createElement('div');
    entry.className = 'dynamic-entry confirmed-entry';
    entry.id = entryId;
    
    if (prefix === 'refueling') {
        const paymentLabels = {
            'eurowag': 'Eurowag',
            'as24': 'AS24',
            'benzina': 'Benzina',
            'cash': 'Hotovosť'
        };
        entry.innerHTML = `
            <div class="confirmed-entry-header">
                <div class="confirmed-entry-title">
                    <span class="material-symbols-outlined">local_gas_station</span>
                    <span>Tankovanie #${num}</span>
                </div>
                <div class="confirmed-entry-actions">
                    <button type="button" class="btn-edit" onclick="editRefueling(${num})" title="Upraviť">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button type="button" class="btn-remove" onclick="removeRefueling(${num})" title="Odstrániť">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="confirmed-entry-content">
                <div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Dátum:</span>
                    <span class="confirmed-entry-value">${data.date || ''}</span>
                </div>
                <div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Čas:</span>
                    <span class="confirmed-entry-value">${data.time || ''}</span>
                </div>
                <div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Miesto:</span>
                    <span class="confirmed-entry-value">${data.location || ''}</span>
                </div>
                <div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Množstvo:</span>
                    <span class="confirmed-entry-value">${data.amount != null ? data.amount : ''} l</span>
                </div>
                <div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Cena:</span>
                    <span class="confirmed-entry-value">${data.totalPrice != null ? data.totalPrice : ''} €</span>
                </div>
                <div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Tachometer:</span>
                    <span class="confirmed-entry-value">${data.odometer != null ? data.odometer : ''} km</span>
                </div>
                <div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Platba:</span>
                    <span class="confirmed-entry-value">${paymentLabels[data.payment] || data.payment || ''}</span>
                </div>
            </div>
        `;
    } else if (prefix === 'border') {
        entry.innerHTML = `
            <div class="confirmed-entry-header">
                <div class="confirmed-entry-title">
                    <span class="material-symbols-outlined">place</span>
                    <span>Prechod #${num}</span>
                </div>
                <div class="confirmed-entry-actions">
                    <button type="button" class="btn-edit" onclick="editBorderCrossing(${num})" title="Upraviť">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button type="button" class="btn-remove" onclick="removeBorderCrossing(${num})" title="Odstrániť">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="confirmed-entry-content">
                <div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Dátum:</span>
                    <span class="confirmed-entry-value">${data.date || ''}</span>
                </div>
                <div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Čas:</span>
                    <span class="confirmed-entry-value">${data.time || ''}</span>
                </div>
                <div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Štát z:</span>
                    <span class="confirmed-entry-value">${data.from || ''} - ${countryNames[data.from] || data.from || ''}</span>
                </div>
                <div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Štát do:</span>
                    <span class="confirmed-entry-value">${data.to || ''} - ${countryNames[data.to] || data.to || ''}</span>
                </div>
                <div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Tachometer:</span>
                    <span class="confirmed-entry-value">${data.odometer != null ? data.odometer : ''} km</span>
                </div>
            </div>
        `;
    } else if (prefix === 'stop') {
        entry.innerHTML = `
            <div class="confirmed-entry-header">
                <div class="confirmed-entry-title">
                    <span class="material-symbols-outlined">flyover</span>
                    <span>Zastávka #${num}</span>
                </div>
                <div class="confirmed-entry-actions">
                    <button type="button" class="btn-edit" onclick="editStop(${num})" title="Upraviť">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button type="button" class="btn-remove" onclick="removeStop(${num})" title="Odstrániť">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="confirmed-entry-content">
                <div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Miesto:</span>
                    <span class="confirmed-entry-value">${data.location || ''}</span>
                </div>
                ${data.note ? `<div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Poznámka:</span>
                    <span class="confirmed-entry-value">${data.note}</span>
                </div>` : ''}
                <div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Tachometer:</span>
                    <span class="confirmed-entry-value">${data.odometer != null ? data.odometer : ''} km</span>
                </div>
                ${(data.arrivalDate && data.arrival) ? `<div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Príchod:</span>
                    <span class="confirmed-entry-value">${data.arrivalDate} ${data.arrival}</span>
                </div>` : ''}
                ${data.departureDate && data.departure ? `<div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Odchod:</span>
                    <span class="confirmed-entry-value">${data.departureDate} ${data.departure}</span>
                </div>` : data.departure ? `<div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Odchod:</span>
                    <span class="confirmed-entry-value">${data.arrivalDate || data.departureDate || ''} ${data.departure}</span>
                </div>` : ''}
                ${(data.loaded || data.unloaded) ? `<div class="confirmed-entry-row">
                    <span class="confirmed-entry-label">Naložené/Vyložené:</span>
                    <span class="confirmed-entry-value">${data.loaded || 0} kg / ${data.unloaded || 0} kg</span>
                </div>` : ''}
            </div>
        `;
        entry.dataset.odometer = data.odometer != null ? data.odometer : '';
    }
    
    const prefixKey = prefix === 'refueling' ? 'refueling' : prefix === 'border' ? 'border' : 'stop';
    insertEntrySorted(container, entry, prefixKey);
    
    if (prefix === 'refueling') {
        refreshRefuelingNumbers();
    } else if (prefix === 'border') {
        refreshBorderNumbers();
    } else if (prefix === 'stop') {
        refreshStopNumbers();
    }
}

function populateEntry(entry, data, prefix, num) {
    if (prefix === 'refueling') {
        const dateInput = entry.querySelector(`[name="refuelingDate_${num}"]`);
        if (dateInput) dateInput.value = data.date || '';
        const timeInput = entry.querySelector(`[name="refuelingTime_${num}"]`);
        if (timeInput) timeInput.value = data.time || '';
        const locationInput = entry.querySelector(`[name="refuelingLocation_${num}"]`);
        if (locationInput) locationInput.value = data.location || '';
        const amountInput = entry.querySelector(`[name="refuelingAmount_${num}"]`);
        if (amountInput) amountInput.value = data.amount != null ? data.amount : '';
        const priceInput = entry.querySelector(`[name="refuelingTotalPrice_${num}"]`);
        if (priceInput) priceInput.value = data.totalPrice != null ? data.totalPrice : '';
        const odometerInput = entry.querySelector(`[name="refuelingOdometer_${num}"]`);
        if (odometerInput) odometerInput.value = data.odometer != null ? data.odometer : '';
        const paymentSelect = entry.querySelector(`[name="refuelingPayment_${num}"]`);
        if (paymentSelect) paymentSelect.value = data.payment || '';
    } else if (prefix === 'border') {
        const dateInput = entry.querySelector(`[name="borderDate_${num}"]`);
        if (dateInput) dateInput.value = data.date || '';
        const timeInput = entry.querySelector(`[name="borderTime_${num}"]`);
        if (timeInput) timeInput.value = data.time || '';
        const fromSelect = entry.querySelector(`[name="borderFrom_${num}"]`);
        if (fromSelect) {
            fromSelect.value = data.from || '';
            if (data.from) {
                updateBorderToDropdown(num, data.from);
                setTimeout(() => {
                    const toSelect = entry.querySelector(`[name="borderTo_${num}"]`);
                    if (toSelect && data.to) {
                        toSelect.value = data.to;
                    }
                }, 100);
            }
        }
        const odometerInput = entry.querySelector(`[name="borderOdometer_${num}"]`);
        if (odometerInput) odometerInput.value = data.odometer != null ? data.odometer : '';
    } else if (prefix === 'stop') {
        const locationInput = entry.querySelector(`[name="stopLocation_${num}"]`);
        if (locationInput) locationInput.value = data.location || '';
        const noteInput = entry.querySelector(`[name="stopNote_${num}"]`);
        if (noteInput) noteInput.value = data.note || '';
        const odometerInput = entry.querySelector(`[name="stopOdometer_${num}"]`);
        if (odometerInput) odometerInput.value = data.odometer != null ? data.odometer : '';
        const arrivalDateInput = entry.querySelector(`[name="stopArrivalDate_${num}"]`);
        if (arrivalDateInput) arrivalDateInput.value = data.arrivalDate || '';
        const arrivalInput = entry.querySelector(`[name="stopArrival_${num}"]`);
        if (arrivalInput) arrivalInput.value = data.arrival || '';
        const departureDateInput = entry.querySelector(`[name="stopDepartureDate_${num}"]`);
        if (departureDateInput) departureDateInput.value = data.departureDate || '';
        const departureInput = entry.querySelector(`[name="stopDeparture_${num}"]`);
        if (departureInput) departureInput.value = data.departure || '';
        const loadedInput = entry.querySelector(`[name="stopLoaded_${num}"]`);
        if (loadedInput) loadedInput.value = data.loaded != null ? data.loaded : '';
        const unloadedInput = entry.querySelector(`[name="stopUnloaded_${num}"]`);
        if (unloadedInput) unloadedInput.value = data.unloaded != null ? data.unloaded : '';
    }
}

// Load ride history
async function loadRideHistory() {
    if (!db || !driverName) return;
    
    const container = document.getElementById('historyContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Načítavam históriu...</p></div>';
    
    try {
        const ridesRef = db.collection('rides').doc(driverName).collection('trips');
        // Get all rides, we'll sort client-side
        const snapshot = await ridesRef.limit(50).get();
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="empty-state">Zatiaľ žiadne jazdy</p>';
            return;
        }
        
        container.innerHTML = '';
        
        // Convert to array and sort
        const rides = [];
        for (const doc of snapshot.docs) {
            const data = doc.data();
            // Load header from subcollection
            const headerSnapshot = await doc.ref.collection('header').limit(1).get();
            let header = {};
            if (!headerSnapshot.empty) {
                header = headerSnapshot.docs[0].data();
            } else if (data.header) {
                // Fallback to old structure
                header = data.header;
            }
            const displayDriveId = resolveDisplayDriveId(doc.id, data, header);
            
            let sortKey = 0;
            if (data.completedAt && data.completedAt.toMillis) {
                sortKey = data.completedAt.toMillis();
            } else if (header.lastUpdatedAt && header.lastUpdatedAt.toMillis) {
                sortKey = header.lastUpdatedAt.toMillis();
            } else {
                // Fallback to document ID timestamp or current time
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
        
        rides.forEach(ride => {
            const isCompleted = ride.completed === true;
            const header = ride.header || {};
            const startDate = header.startDate || ride.id.split('_')[0] || 'Neznámy dátum';
            const endDate = header.endDate || null;
            const driver = header.driver || driverName || 'Vodič';
            const vehicle = header.vehiclePlate || '-';
            const trailer = header.trailerPlate || '-';
            const rawStartOdo = header.startOdometer != null ? parseFloat(header.startOdometer) : null;
            const rawEndOdo = header.endOdometer != null ? parseFloat(header.endOdometer) : null;
            let distance = '-';
            if (!Number.isNaN(rawStartOdo) && !Number.isNaN(rawEndOdo) && rawEndOdo >= rawStartOdo) {
                distance = (rawEndOdo - rawStartOdo).toFixed(1) + ' km';
            }
            const startTime = header.startTime || '';
            const endTime = header.endTime || '';
            const timeRange = startTime || endTime ? `${startTime || '-'}${endTime ? ' - ' + endTime : ''}` : '-';
            const driveId = ride.displayDriveId || null;
            
            // Format date range: "start date - finish date" or "start date - present"
            let dateRange = formatDate(startDate);
            if (endDate) {
                dateRange += ' - ' + formatDate(endDate);
            } else if (!isCompleted) {
                dateRange += ' - present';
            }
            
            const item = document.createElement('div');
            item.className = 'history-item';
            
            // If ride is in progress, open it for editing, otherwise view-only
            if (isCompleted) {
                item.onclick = () => viewPastRide(ride.id);
            } else {
                item.onclick = () => openRideForEditing(ride.id);
            }
            
            item.innerHTML = `
                <div class="history-item-header">
                    <div class="history-item-title">
                        <div class="history-item-id">${driveId ? driveId : dateRange}</div>
                        <div class="history-item-dates">${dateRange}</div>
                    </div>
                    <div class="history-item-status ${isCompleted ? 'completed' : 'in-progress'}">
                        ${isCompleted ? 'Dokončené' : 'Prebieha'}
                    </div>
                </div>
                <div class="history-item-body">
                    <div class="history-item-column">
                        <div class="history-item-row">
                            <span class="material-symbols-outlined history-item-icon">person</span>
                            <span class="history-item-value">${driver}</span>
                        </div>
                        <div class="history-item-row">
                            <span class="material-symbols-outlined history-item-icon">schedule</span>
                            <span class="history-item-value">${timeRange}</span>
                        </div>
                        <div class="history-item-row">
                            <span class="material-symbols-outlined history-item-icon">straighten</span>
                            <span class="history-item-value">${distance}</span>
                        </div>
                    </div>
                    <div class="history-item-column history-item-column-right">
                        <div class="history-item-row">
                            <span class="material-symbols-outlined history-item-icon">directions_car</span>
                            <span class="history-item-value">${vehicle}</span>
                        </div>
                        ${trailer !== '-' ? `
                        <div class="history-item-row">
                            <span class="material-symbols-outlined history-item-icon">local_shipping</span>
                            <span class="history-item-value">${trailer}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
            
            container.appendChild(item);
        });
    } catch (e) {
        console.error('Error loading history:', e);
        container.innerHTML = '<p class="empty-state">Chyba pri načítaní histórie</p>';
    }
}

function formatDate(dateStr) {
    if (!dateStr) return 'Neznámy dátum';
    try {
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr;
    }
}

// Load past ride in read-only view
async function loadPastRide(tripId) {
    if (!db || !driverName) return;
    
    const container = document.getElementById('viewRideContainer');
    if (!container) return;
    
    container.innerHTML = '<p class="empty-state">Načítavam údaje...</p>';
    
    try {
        const docRef = db.collection('rides').doc(driverName).collection('trips').doc(tripId);
        
        // Load header from subcollection
        const headerSnapshot = await docRef.collection('header').limit(1).get();
        let header = {};
        if (!headerSnapshot.empty) {
            header = headerSnapshot.docs[0].data();
        } else {
            // Fallback: try old structure
            const doc = await docRef.get();
            if (doc.exists && doc.data().header) {
                header = doc.data().header;
            }
        }
        
        let html = '<div class="view-ride-section">';
        html += '<div class="view-ride-section-title"><span class="material-symbols-outlined">description</span>Hlavička jazdy</div>';
        html += renderReadonlyFields(header, [
            { key: 'driver', label: 'Šofér' },
            { key: 'vehiclePlate', label: 'SPZ' },
            { key: 'trailerPlate', label: 'Príves (SPZ)' },
            { key: 'startDate', label: 'Dátum začiatku' },
            { key: 'startTime', label: 'Čas začiatku' },
            { key: 'endDate', label: 'Dátum konca' },
            { key: 'endTime', label: 'Čas konca' },
            { key: 'startOdometer', label: 'Začiatočný stav (km)', format: (v) => v != null ? v.toFixed(1) : null },
            { key: 'endOdometer', label: 'Konečný stav (km)', format: (v) => v != null ? v.toFixed(1) : null },
        ]);
        html += '</div>';
        
        // Load sub-collections
        const tankovania = await loadSubCollectionForView(docRef, 'fuel');
        if (tankovania.length > 0) {
            html += '<div class="view-ride-section">';
            html += '<div class="view-ride-section-title"><span class="material-symbols-outlined">local_gas_station</span>Tankovania</div>';
            tankovania.forEach((item, idx) => {
                html += '<div class="readonly-entry">';
                html += `<div class="readonly-entry-title">Tankovanie #${idx + 1}</div>`;
                const paymentLabels = {
                    'eurowag': 'Eurowag',
                    'as24': 'AS24',
                    'benzina': 'Benzina',
                    'cash': 'Hotovosť'
                };
                html += renderReadonlyFields(item, [
                    { key: 'date', label: 'Dátum' },
                    { key: 'time', label: 'Čas' },
                    { key: 'location', label: 'Miesto' },
                    { key: 'amount', label: 'Množstvo (l)', format: (v) => v != null ? v.toFixed(1) : null },
                    { key: 'totalPrice', label: 'Cena celkom (€)', format: (v) => v != null ? v.toFixed(2) : null },
                    { key: 'odometer', label: 'Stav tachometra (km)', format: (v) => v != null ? v.toFixed(1) : null },
                    { key: '_payment', label: 'Spôsob platby', value: paymentLabels[item.payment] || item.payment || '' },
                ]);
                html += '</div>';
            });
            html += '</div>';
        }
        
        const prechody = await loadSubCollectionForView(docRef, 'border_crossing');
        if (prechody.length > 0) {
            html += '<div class="view-ride-section">';
            html += '<div class="view-ride-section-title"><span class="material-symbols-outlined">place</span>Prechody hraníc</div>';
            prechody.forEach((item, idx) => {
                html += '<div class="readonly-entry">';
                html += `<div class="readonly-entry-title">Prechod #${idx + 1}</div>`;
                const fromStr = item.from ? `${item.from} - ${countryNames[item.from] || item.from}` : item.from || '';
                const toStr = item.to ? `${item.to} - ${countryNames[item.to] || item.to}` : item.to || '';
                html += renderReadonlyFields(item, [
                    { key: 'date', label: 'Dátum' },
                    { key: 'time', label: 'Čas' },
                    { key: '_from', label: 'Štát z', value: fromStr },
                    { key: '_to', label: 'Štát do', value: toStr },
                    { key: 'odometer', label: 'Stav tachometra (km)', format: (v) => v != null ? v.toFixed(1) : null },
                ]);
                html += '</div>';
            });
            html += '</div>';
        }
        
        const zastavky = await loadSubCollectionForView(docRef, 'stops');
        if (zastavky.length > 0) {
            html += '<div class="view-ride-section">';
            html += '<div class="view-ride-section-title"><span class="material-symbols-outlined">flyover</span>Zastávky</div>';
            zastavky.forEach((item, idx) => {
                html += '<div class="readonly-entry">';
                html += `<div class="readonly-entry-title">Zastávka #${idx + 1}</div>`;
                const arrivalStr = item.arrivalDate && item.arrival ? `${item.arrivalDate} ${item.arrival}` : 
                                   item.arrival ? item.arrival : '';
                const departureStr = item.departureDate && item.departure ? `${item.departureDate} ${item.departure}` :
                                     item.departure && item.arrivalDate ? `${item.arrivalDate} ${item.departure}` :
                                     item.departure ? item.departure : '';
                html += renderReadonlyFields(item, [
                    { key: 'location', label: 'Miesto' },
                    { key: 'note', label: 'Poznámka' },
                    { key: 'odometer', label: 'Stav tachometra (km)', format: (v) => v != null ? v.toFixed(1) : null },
                    { key: '_arrival', label: 'Príchod', value: arrivalStr },
                    { key: '_departure', label: 'Odchod', value: departureStr },
                    { key: 'loaded', label: 'Naložené (kg)', format: (v) => v != null ? v.toFixed(1) : null },
                    { key: 'unloaded', label: 'Vyložené (kg)', format: (v) => v != null ? v.toFixed(1) : null },
                ]);
                html += '</div>';
            });
            html += '</div>';
        }
        
        container.innerHTML = html;
    } catch (e) {
        console.error('Error loading past ride:', e);
        container.innerHTML = '<p class="empty-state">Chyba pri načítaní údajov</p>';
    }
}

async function loadSubCollectionForView(docRef, collectionName) {
    const snapshot = await docRef.collection(collectionName).get();
    const items = [];
    snapshot.forEach(doc => {
        items.push(doc.data());
    });
    return items.sort((a, b) => {
        const dateA = a.date || '';
        const timeA = a.time || '';
        const dateB = b.date || '';
        const timeB = b.time || '';
        return (dateA + timeA).localeCompare(dateB + timeB);
    });
}

function renderReadonlyFields(data, fields) {
    let html = '';
    fields.forEach(field => {
        // Support custom value field (for computed fields)
        const value = field.value !== undefined ? field.value : data[field.key];
        const formatted = field.format ? field.format(value) : value;
        // Skip fields that start with underscore unless they have a value
        if (field.key.startsWith('_') && !formatted) return;
        html += '<div class="readonly-field">';
        html += `<div class="readonly-field-label">${field.label}</div>`;
        html += `<div class="readonly-field-value ${!formatted ? 'empty' : ''}">${formatted || '(prázdne)'}</div>`;
        html += '</div>';
    });
    return html;
}

// Finish current ride
async function finishCurrentRide() {
    if (!db || !driverName || !currentTripId) return;
    
    if (!confirm('Naozaj chcete dokončiť túto jazdu? Po dokončení sa vytvorí nová jazda.')) {
        return;
    }
    
    try {
        const docRef = getTripDocRef();
        if (docRef) {
            // Mark as completed in main document
            await docRef.set({
                completed: true,
                completedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        
        // Clear form and reset trip ID - don't create new ride automatically
        clearForm();
        currentTripId = null;
        
        // Navigate to history
        navigateToHistory();
        
        alert('Jazda bola dokončená. Pre vytvorenie novej jazdy kliknite na "Nová jazda".');
    } catch (e) {
        console.error('Error finishing ride:', e);
        alert('Chyba pri dokončovaní jazdy');
    }
}

// Create new ride
async function createNewRide() {
    if (!db || !driverName) return;
    
    try {
        // Clear form first to ensure no old data persists (but preserve vehicle/trailer plates from access code)
        const vehiclePlateValue = document.getElementById('vehiclePlate')?.value || '';
        const trailerPlateValue = document.getElementById('trailerPlate')?.value || '';
        
        clearForm();
        
        // Restore vehicle/trailer plates after clearForm
        const vehiclePlateInput = document.getElementById('vehiclePlate');
        const trailerPlateInput = document.getElementById('trailerPlate');
        if (vehiclePlateInput && vehiclePlateValue) {
            vehiclePlateInput.value = vehiclePlateValue;
        }
        if (trailerPlateInput && trailerPlateValue) {
            trailerPlateInput.value = trailerPlateValue;
        }
        
        // Create new unique ride ID
        const today = new Date().toISOString().split('T')[0];
        const yearTwoDigits = new Date().getFullYear().toString().slice(-2);
        const displayId = await generateDriveDisplayId(driverName, yearTwoDigits);
        const sanitizedId = sanitizeDriveId(displayId);
        currentTripId = generateTripId(today, sanitizedId);
        
        // Initialize the document to mark it as not completed
        const docRef = getTripDocRef();
        if (docRef) {
            await docRef.set({
                completed: false,
                driverName: driverName,
                startDate: today
            }, { merge: true });
            // Generate and store Drive Display ID (e.g., BM-0001/25)
        }
        
        // Save header data including vehicle/trailer plates
        autosaveHeader();
        
        // Navigate to ride view
        navigateToCurrentRide();
    } catch (e) {
        console.error('Error creating new ride:', e);
        alert('Chyba pri vytváraní novej jazdy');
    }
}

// Logout
async function logout() {
    const portalSessionKey = 'marshallCompanySession';
    const portalSnapshot = (() => {
        if (window.__MARSHALL_COMPANY_SESSION__) {
            return window.__MARSHALL_COMPANY_SESSION__;
        }
        try {
            const raw = sessionStorage.getItem(portalSessionKey);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    })();
    const hadPortalSession = !!portalSnapshot;

    if (!auth) {
        if (hadPortalSession) {
            try {
                sessionStorage.removeItem(portalSessionKey);
            } catch (_) {}
            window.location.href = '../../../pages/index/index.html';
        }
        return;
    }
    
    try {
        // Sign out from Firebase
        await auth.signOut();

        try {
            sessionStorage.removeItem(portalSessionKey);
        } catch (_) {}
        window.__MARSHALL_COMPANY_SESSION__ = null;
        
        // Clear state
        driverUid = null;
        driverCode = null;
        currentTripId = null;
        driverName = null;
        currentView = 'ride';
        viewingTripId = null;
        
        // Clear form
        refuelingCount = 0;
        borderCrossingCount = 0;
        stopCount = 0;
        const tripForm = document.getElementById('tripForm');
        if (tripForm) tripForm.reset();
        document.getElementById('refuelingContainer').innerHTML = '<p class="empty-state">Zatiaľ žiadne tankovania</p>';
        document.getElementById('borderCrossingContainer').innerHTML = '<p class="empty-state">Zatiaľ žiadne prechody hraníc</p>';
        document.getElementById('stopContainer').innerHTML = '<p class="empty-state">Zatiaľ žiadne zastávky</p>';
        
        // Hide all sections
        document.querySelectorAll('.content-section').forEach(sec => {
            sec.classList.remove('active');
        });
        
        // Hide main content areas
        const mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.style.display = 'none';
        
        const header = document.querySelector('.app-header');
        if (header) header.style.display = 'none';
        
        // Hide navigation elements
        const tabNav = document.getElementById('tabNavigation');
        const finishBtn = document.getElementById('finishRideContainer');
        const backBtn = document.getElementById('backBtn');
        const syncChip = document.getElementById('syncChip');
        const headerLogoutBtn = document.getElementById('headerLogoutBtn');
        
        if (tabNav) {
            tabNav.classList.add('hidden');
        }
        if (finishBtn) {
            finishBtn.classList.add('hidden');
        }
        if (backBtn) {
            backBtn.classList.add('hidden');
        }
        if (syncChip) {
            syncChip.classList.add('hidden');
        }
        if (headerLogoutBtn) {
            headerLogoutBtn.classList.add('hidden');
        }
        
        if (hadPortalSession) {
            window.location.href = '../../../pages/index/index.html';
            return;
        }

        // Reset login form and show overlay for standalone usage
        const codeInput = document.getElementById('companyCode');
        if (codeInput) {
            codeInput.value = '';
        }
        
        const loginOverlay = document.getElementById('loginOverlay');
        if (loginOverlay) {
            loginOverlay.classList.remove('hidden');
            loginOverlay.style.display = 'flex';
        }
        
        setupLogin();
        
    } catch (e) {
        console.error('Error logging out:', e);
        try {
            sessionStorage.removeItem(portalSessionKey);
        } catch (_) {}
        window.__MARSHALL_COMPANY_SESSION__ = null;

        if (hadPortalSession) {
            window.location.href = '../../../pages/index/index.html';
            return;
        }
        
        // Even if logout fails, try to show login
        const loginOverlay = document.getElementById('loginOverlay');
        if (loginOverlay) {
            loginOverlay.classList.remove('hidden');
            loginOverlay.style.display = 'flex';
        }
        setupLogin();
    }
}
