/**
 * Cestaky Admin Module
 * Shows all drivers and their rides (read-only view for administrators)
 */

// State
let currentView = 'drivers'; // 'drivers', 'driver-rides', 'ride-detail'
let allDrivers = [];
let currentDriverName = null;
let currentDriverRides = [];
let currentRideId = null;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize Firebase
    window.CestakyFirebase.init();
    
    // Check if user is authenticated
    const { auth } = window.CestakyFirebase.get();
    if (!auth) {
        console.error('Firebase not initialized');
        showError('driversContainer', 'Chyba pri inicializácii Firebase');
        return;
    }

    // Wait for auth state
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            // Redirect to login if not authenticated
            window.location.href = '../../../pages/index/index.html';
            return;
        }
        
        // Load drivers
        await loadDrivers();
    });
});

/**
 * Load all drivers
 */
async function loadDrivers() {
    const container = document.getElementById('driversContainer');
    container.innerHTML = window.CestakyComponents.renderLoading('Načítavam vodičov...');
    
    try {
        allDrivers = await window.CestakyFirebase.loadAllDrivers();
        
        if (allDrivers.length === 0) {
            container.innerHTML = `
                <div class="empty-driver-state">
                    <span class="material-symbols-outlined">person_off</span>
                    <h3>Žiadni vodiči</h3>
                    <p>Zatiaľ neboli nájdení žiadni vodiči s jazdami.</p>
                </div>
            `;
            return;
        }
        
        renderDrivers(allDrivers);
    } catch (e) {
        console.error('Error loading drivers:', e);
        container.innerHTML = window.CestakyComponents.renderErrorState('Chyba pri načítaní vodičov');
    }
}

/**
 * Render drivers list
 */
function renderDrivers(drivers) {
    const container = document.getElementById('driversContainer');
    
    if (drivers.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <span class="material-symbols-outlined">search_off</span>
                <p>Žiadni vodiči nezodpovedajú vyhľadávaniu</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    // Render driver cards
    drivers.forEach(driver => {
        const card = window.CestakyComponents.renderDriverCard(driver, {
            onClick: () => openDriverRides(driver.name)
        });
        container.appendChild(card);
    });
}

/**
 * Filter drivers by search
 */
function filterDrivers() {
    const search = document.getElementById('driverSearch').value.toLowerCase().trim();
    
    if (!search) {
        renderDrivers(allDrivers);
        return;
    }
    
    const filtered = allDrivers.filter(driver => 
        driver.name.toLowerCase().includes(search)
    );
    
    renderDrivers(filtered);
}

/**
 * Open driver's rides
 */
async function openDriverRides(driverName) {
    currentDriverName = driverName;
    currentView = 'driver-rides';
    updateView();
    
    const container = document.getElementById('ridesContainer');
    const titleEl = document.getElementById('driverRidesTitle');
    const breadcrumbName = document.getElementById('breadcrumbDriverName');
    
    titleEl.textContent = `Jazdy - ${driverName}`;
    breadcrumbName.textContent = driverName;
    
    container.innerHTML = window.CestakyComponents.renderLoading('Načítavam jazdy...');
    
    try {
        currentDriverRides = await window.CestakyFirebase.loadDriverRides(driverName);
        
        if (currentDriverRides.length === 0) {
            container.innerHTML = window.CestakyComponents.renderEmptyState('Vodič nemá žiadne jazdy');
            return;
        }
        
        container.innerHTML = '';
        currentDriverRides.forEach(ride => {
            const card = window.CestakyComponents.renderRideCard(ride, {
                onClick: () => openRideDetail(ride.id),
                showDriver: false
            });
            container.appendChild(card);
        });
    } catch (e) {
        console.error('Error loading rides:', e);
        container.innerHTML = window.CestakyComponents.renderErrorState('Chyba pri načítaní jázd');
    }
}

/**
 * Open ride detail
 */
async function openRideDetail(rideId) {
    currentRideId = rideId;
    currentView = 'ride-detail';
    updateView();
    
    const container = document.getElementById('rideDetailContainer');
    const titleEl = document.getElementById('rideDetailTitle');
    
    container.innerHTML = window.CestakyComponents.renderLoading('Načítavam detail jazdy...');
    
    try {
        const rideData = await window.CestakyFirebase.loadRideComplete(currentDriverName, rideId);
        
        if (!rideData) {
            container.innerHTML = window.CestakyComponents.renderEmptyState('Jazda nebola nájdená');
            return;
        }
        
        // Find display ID
        const ride = currentDriverRides.find(r => r.id === rideId);
        const displayId = ride?.displayDriveId || rideId;
        titleEl.textContent = displayId;
        
        // Render ride header
        const header = rideData.header || {};
        const isCompleted = rideData.completed === true;
        const dateRange = window.CestakyComponents.formatDate(header.startDate) + 
            (header.endDate ? ' - ' + window.CestakyComponents.formatDate(header.endDate) : '');
        const totalKm = window.CestakyComponents.calculateTotalKm(header.startOdometer, header.endOdometer);
        
        let html = `
            <div class="ride-header-info">
                <div class="ride-header-icon">
                    <span class="material-symbols-outlined">receipt_long</span>
                </div>
                <div class="ride-header-details">
                    <div class="ride-header-title">${displayId}</div>
                    <div class="ride-header-subtitle">${dateRange}</div>
                </div>
                <div class="ride-header-status ${isCompleted ? 'completed' : 'in-progress'}">
                    ${isCompleted ? 'Dokončené' : 'Prebieha'}
                </div>
            </div>
            
            <div class="ride-quick-stats">
                <div class="quick-stat">
                    <span class="quick-stat-value">${header.vehiclePlate || '-'}</span>
                    <span class="quick-stat-label">Tahač</span>
                </div>
                <div class="quick-stat">
                    <span class="quick-stat-value">${header.trailerPlate || '-'}</span>
                    <span class="quick-stat-label">Príves</span>
                </div>
                <div class="quick-stat">
                    <span class="quick-stat-value">${totalKm}</span>
                    <span class="quick-stat-label">Vzdialenosť</span>
                </div>
                <div class="quick-stat">
                    <span class="quick-stat-value">${(rideData.fuel || []).length}</span>
                    <span class="quick-stat-label">Tankovaní</span>
                </div>
                <div class="quick-stat">
                    <span class="quick-stat-value">${(rideData.stops || []).length}</span>
                    <span class="quick-stat-label">Zastávok</span>
                </div>
            </div>
        `;
        
        // Add full ride view
        html += window.CestakyComponents.renderRideView(rideData);
        
        container.innerHTML = html;
    } catch (e) {
        console.error('Error loading ride detail:', e);
        container.innerHTML = window.CestakyComponents.renderErrorState('Chyba pri načítaní detailu jazdy');
    }
}

/**
 * Navigate back
 */
function navigateBack() {
    if (currentView === 'ride-detail') {
        currentView = 'driver-rides';
        currentRideId = null;
    } else if (currentView === 'driver-rides') {
        currentView = 'drivers';
        currentDriverName = null;
        currentDriverRides = [];
    }
    updateView();
}

/**
 * Navigate to drivers list
 */
function navigateToDrivers() {
    currentView = 'drivers';
    currentDriverName = null;
    currentDriverRides = [];
    currentRideId = null;
    updateView();
}

/**
 * Go to dashboard
 */
function goToDashboard() {
    window.location.href = '../../../../pages/dashboard/index.html';
}

/**
 * Update view based on current state
 */
function updateView() {
    const backBtn = document.getElementById('backBtn');
    const breadcrumb = document.getElementById('breadcrumb');
    const pageTitle = document.getElementById('pageTitle');
    
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.remove('active');
    });
    
    if (currentView === 'drivers') {
        document.getElementById('section-drivers').classList.add('active');
        backBtn.classList.add('hidden');
        breadcrumb.classList.add('hidden');
        pageTitle.textContent = 'Cestaky - Prehľad vodičov';
    } else if (currentView === 'driver-rides') {
        document.getElementById('section-driver-rides').classList.add('active');
        backBtn.classList.remove('hidden');
        breadcrumb.classList.remove('hidden');
        pageTitle.textContent = currentDriverName || 'Jazdy vodiča';
    } else if (currentView === 'ride-detail') {
        document.getElementById('section-ride-detail').classList.add('active');
        backBtn.classList.remove('hidden');
        breadcrumb.classList.remove('hidden');
        pageTitle.textContent = 'Detail jazdy';
    }
}

/**
 * Show error in container
 */
function showError(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = window.CestakyComponents.renderErrorState(message);
    }
}

