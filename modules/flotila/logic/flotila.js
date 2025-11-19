// Flotila Management System
class FlotilaManager {
  constructor() {
    this.trucks = {};
    this.trailers = {};
    this.selectedVehicle = null;
    this.currentUser = null;
    this.unsubscribeFunctions = [];
    this.redirecting = false; // Prevent multiple redirects
    this.cache = {
      trucks: {},
      trailers: {},
      vehicleKms: {},
      lastUpdated: null,
      ttl: 5 * 60 * 1000 // 5 minutes cache TTL
    };
    this.pagination = {
      currentPage: 1,
      itemsPerPage: 20,
      totalItems: 0
    };
    this.init();
  }

  async init() {
    this.setupAuth();
    this.bindEvents();
    
    // Wait a bit for Firebase auth to initialize
    setTimeout(() => {
      this.checkAuthState();
    }, 500);
  }

  setupAuth() {
    // Listen for auth state changes
    window.auth.onAuthStateChanged((user) => {
      this.currentUser = user;
      this.checkAuthState();
    });
    
    // Check current auth state
    const currentUser = window.auth.currentUser;
    this.currentUser = currentUser;
  }

  checkAuthState() {
    const authSection = document.getElementById('auth-section');
    const mainContent = document.getElementById('flotila-main-content');
    const logoutBtn = document.getElementById('auth-logout-btn');
    const loginBtn = document.getElementById('auth-login-btn');

    if (this.currentUser) {
      // User is logged in
      authSection.style.display = 'none';
      mainContent.style.display = 'block';
      logoutBtn.style.display = 'block';
      loginBtn.style.display = 'none';
      
      // Load data and render
      this.loadDataAndRender();
    } else {
      // User is not logged in - redirect to main login page
      if (!this.redirecting) {
        this.redirecting = true;
        window.location.href = '../../../pages/index/index.html';
      }
    }
  }

  async loadDataAndRender() {
    // Try to load from cache first
    if (this.loadFromCache()) {
      this.renderPairs();
      this.clearPolozkaPanel();
      return;
    }
    
    // If cache is invalid or empty, load from database
    await this.loadData();
    this.renderPairs();
    this.clearPolozkaPanel();
  }

  // Load data from Firebase with optimized batch queries
  async loadData() {
    try {
      if (!this.currentUser) {
        this.trucks = {};
        this.trailers = {};
        return;
      }
      
      // Show loading indicator
      this.showLoadingIndicator();
      
      // Get all vehicles from vehicles collection
      const snapshot = await window.db.collection('vehicles').get();
      
      this.trucks = {};
      this.trailers = {};
      
      if (snapshot.docs.length === 0) {
        this.hideLoadingIndicator();
        return;
      }
      
      // Load kilometer data from vehicles_km collection
      let vehicleKms = {};
      try {
        if (window.DatabaseService && window.DatabaseService.getAllVehicleKms) {
          vehicleKms = await window.DatabaseService.getAllVehicleKms();
        } else {
          // Fallback: load directly from Firebase
          const kmSnapshot = await window.db.collection('vehicles_km').get();
          kmSnapshot.docs.forEach(doc => {
            vehicleKms[doc.id] = doc.data().kilometers || 0;
          });
        }
      } catch (kmError) {
        console.warn('Error loading vehicle kilometers:', kmError);
        vehicleKms = {};
      }
      
      // Use batch queries to get all vehicle info documents at once
      const batch = window.db.batch();
      const vehicleInfoRefs = [];
      
      // Prepare all the document references
      for (const doc of snapshot.docs) {
        const licensePlate = doc.id;
        const infoRef = window.db.collection('vehicles')
          .doc(licensePlate)
          .collection('info')
          .doc('basic');
        vehicleInfoRefs.push({ licensePlate, ref: infoRef });
      }
      
      // Execute batch read
      const vehicleInfoSnapshots = await Promise.all(
        vehicleInfoRefs.map(({ ref }) => ref.get())
      );
      
      // Process the results
      for (let i = 0; i < vehicleInfoSnapshots.length; i++) {
        const infoSnapshot = vehicleInfoSnapshots[i];
        const { licensePlate } = vehicleInfoRefs[i];
        
        if (infoSnapshot.exists) {
          const vehicleData = infoSnapshot.data();
          
          // Add kilometer data from vehicles_km collection using normalized license plate
          const normalizedPlate = this.normalizeLicensePlate(licensePlate);
          const kmFromDb = vehicleKms[normalizedPlate];
          vehicleData.currentKm = kmFromDb || vehicleData.kilometers || 0;
          
          
          if (vehicleData.vehicleType === 'truck') {
            this.trucks[licensePlate] = {
              licensePlate,
              ...vehicleData
            };
          } else if (vehicleData.vehicleType === 'trailer') {
            this.trailers[licensePlate] = {
              licensePlate,
              ...vehicleData
            };
          }
        }
      }
      
      // Cache the data for faster subsequent loads
      this.cacheData();
      
      this.hideLoadingIndicator();
      
    } catch (error) {
      console.error('Error loading flotila data:', error);
      // Fallback to empty data
      this.trucks = {};
      this.trailers = {};
      this.hideLoadingIndicator();
    }
  }

  // Bind event listeners
  bindEvents() {
    document.getElementById('settings-btn')?.addEventListener('click', () => {
      this.showSettings();
    });
    
    // Search functionality
    document.getElementById('flotilaSearch')?.addEventListener('input', (e) => {
      this.renderPairs(e.target.value);
    });

    // Authentication events
    document.getElementById('auth-login-btn')?.addEventListener('click', () => {
      this.login();
    });

    document.getElementById('auth-logout-btn')?.addEventListener('click', () => {
      this.logout();
    });

    // Enter key for login
    document.getElementById('auth-password')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.login();
      }
    });

    // Detail panel click to deselect vehicle
    document.getElementById('polozka-panel')?.addEventListener('click', (e) => {
      // Only deselect if clicking on the placeholder or outside vehicle content
      if (e.target.closest('.polozka-placeholder') || 
          (e.target.closest('.polozka-panel') && !e.target.closest('.vehicle-polozka'))) {
        this.deselectVehicle();
      }
    });

    // Keyboard shortcut to deselect vehicle (Escape key)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.selectedVehicle) {
        this.deselectVehicle();
      }
    });
  }

  async login() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    if (!email || !password) {
      this.showAuthStatus('Prosím vyplňte email a heslo', 'error');
      return;
    }

    try {
      this.showAuthStatus('Prihlasujem...', 'info');
      await window.auth.signInWithEmailAndPassword(email, password);
      this.showAuthStatus('Úspešne prihlásený!', 'success');
    } catch (error) {
      console.error('Login error:', error);
      this.showAuthStatus('Chyba prihlásenia: ' + error.message, 'error');
    }
  }

  async logout() {
    try {
      await window.auth.signOut();
      this.showAuthStatus('Odhlásený', 'info');
    } catch (error) {
      console.error('Logout error:', error);
      this.showAuthStatus('Chyba odhlásenia: ' + error.message, 'error');
    }
  }

  showAuthStatus(message, type) {
    const statusDiv = document.getElementById('auth-status');
    statusDiv.textContent = message;
    statusDiv.className = `auth-status ${type}`;
    
    if (type === 'success') {
      setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = 'auth-status';
      }, 2000);
    }
  }

  // Show loading indicator
  showLoadingIndicator() {
    const pairList = document.getElementById('pair-list');
    if (pairList) {
      pairList.innerHTML = `
        <div class="loading-indicator">
          <div class="loading-spinner"></div>
          <p>Načítavam vozidlá...</p>
        </div>
      `;
    }
  }

  // Hide loading indicator
  hideLoadingIndicator() {
    // Loading indicator will be replaced by renderPairs()
  }

  // Cache data for faster subsequent loads
  cacheData() {
    this.cache.trucks = { ...this.trucks };
    this.cache.trailers = { ...this.trailers };
    
    // Cache kilometer data using normalized license plates
    this.cache.vehicleKms = {};
    Object.values(this.trucks).forEach(truck => {
      const normalizedPlate = this.normalizeLicensePlate(truck.licensePlate);
      this.cache.vehicleKms[normalizedPlate] = truck.currentKm || 0;
    });
    Object.values(this.trailers).forEach(trailer => {
      const normalizedPlate = this.normalizeLicensePlate(trailer.licensePlate);
      this.cache.vehicleKms[normalizedPlate] = trailer.currentKm || 0;
    });
    
    this.cache.lastUpdated = Date.now();
  }

  // Check if cache is valid
  isCacheValid() {
    if (!this.cache.lastUpdated) return false;
    return (Date.now() - this.cache.lastUpdated) < this.cache.ttl;
  }

  // Normalize license plate for matching (remove spaces, convert to uppercase)
  normalizeLicensePlate(plate) {
    if (!plate) return '';
    return plate.replace(/\s+/g, '').toUpperCase();
  }

  // Load data from cache if available and valid
  loadFromCache() {
    if (this.isCacheValid()) {
      this.trucks = { ...this.cache.trucks };
      this.trailers = { ...this.cache.trailers };
      
      // Restore kilometer data from cache
      Object.values(this.trucks).forEach(truck => {
        const normalizedPlate = this.normalizeLicensePlate(truck.licensePlate);
        truck.currentKm = this.cache.vehicleKms[normalizedPlate] || truck.currentKm || 0;
      });
      Object.values(this.trailers).forEach(trailer => {
        const normalizedPlate = this.normalizeLicensePlate(trailer.licensePlate);
        trailer.currentKm = this.cache.vehicleKms[normalizedPlate] || trailer.currentKm || 0;
      });
      
      return true;
    }
    return false;
  }

  // Get trailer object by license plate
  getTrailer(plate) {
    if (!plate) return null;
    return this.trailers[plate] || null;
  }

  // Render truck-trailer pairs with pagination
  renderPairs(query = "") {
    const pairList = document.getElementById('pair-list');
    const unassignedTrailers = document.getElementById('unassigned-trailers');
    
    if (!pairList || !unassignedTrailers) return;

    // Filter and sort trucks
    let filteredTrucks = Object.values(this.trucks)
      .sort((a, b) => a.licensePlate.localeCompare(b.licensePlate));

    if (query) {
      const searchTerm = query.toLowerCase();
      filteredTrucks = filteredTrucks.filter(truck => {
        // Search in truck properties
        const truckMatch = 
          truck.licensePlate.toLowerCase().includes(searchTerm) ||
          truck.vin.toLowerCase().includes(searchTerm) ||
          truck.kilometers.toString().includes(searchTerm) ||
          (truck.brand && truck.brand.toLowerCase().includes(searchTerm)) ||
          (truck.model && truck.model.toLowerCase().includes(searchTerm)) ||
          (truck.type && truck.type.toLowerCase().includes(searchTerm));
        
        // Search in attached trailer properties
        if (truck.trailer) {
          const trailer = this.getTrailer(truck.trailer);
          if (trailer) {
            const trailerMatch = 
              trailer.licensePlate.toLowerCase().includes(searchTerm) ||
              trailer.vin.toLowerCase().includes(searchTerm) ||
              (trailer.brand && trailer.brand.toLowerCase().includes(searchTerm)) ||
              (trailer.model && trailer.model.toLowerCase().includes(searchTerm)) ||
              (trailer.type && trailer.type.toLowerCase().includes(searchTerm));
            
            return truckMatch || trailerMatch;
          }
        }
        
        return truckMatch;
      });
      
      // Reset pagination when searching
      this.pagination.currentPage = 1;
    }

    // Update pagination info
    this.pagination.totalItems = filteredTrucks.length;
    const totalPages = Math.ceil(this.pagination.totalItems / this.pagination.itemsPerPage);
    
    // Get current page items
    const startIndex = (this.pagination.currentPage - 1) * this.pagination.itemsPerPage;
    const endIndex = startIndex + this.pagination.itemsPerPage;
    const currentPageTrucks = filteredTrucks.slice(startIndex, endIndex);

    // Render pairs for current page
    const pairsHtml = currentPageTrucks.map(truck => {
      const trailer = truck.trailer ? this.getTrailer(truck.trailer) : null;
      return this.createPairRow(truck, trailer);
    }).join('');

    // Add pagination controls if needed
    let paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = this.createPaginationControls(totalPages);
    }

    pairList.innerHTML = pairsHtml + paginationHtml;

    // Render unassigned trailers with search filter
    this.renderUnassignedTrailers(query);
  }

  // Create a pair row HTML
  createPairRow(truck, trailer) {
    const trailerClass = trailer ? 'has-trailer' : '';
    
    return `
      <div class="pair-row">
        <div class="vehicle-card truck-card" onclick="flotilaManager.showPolozka('truck', '${truck.licensePlate}')">
          <div class="vehicle-info">
            <div class="vehicle-license">${truck.licensePlate}</div>
          </div>
        </div>
        <div class="vehicle-card trailer-card ${trailerClass}" onclick="flotilaManager.showPolozka('trailer', '${trailer ? trailer.licensePlate : ''}')">
          <div class="vehicle-info">
            <div class="vehicle-license">${trailer ? trailer.licensePlate : 'Bez prívesu'}</div>
          </div>
        </div>
      </div>
    `;
  }

  // Create pagination controls
  createPaginationControls(totalPages) {
    const { currentPage, itemsPerPage, totalItems } = this.pagination;
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);
    
    let controls = `
      <div class="pagination-container">
        <div class="pagination-info">
          Zobrazujem ${startItem}-${endItem} z ${totalItems} vozidiel
        </div>
        <div class="pagination-controls">
    `;
    
    // Previous button
    if (currentPage > 1) {
      controls += `<button class="pagination-btn" onclick="flotilaManager.goToPage(${currentPage - 1})">‹ Predchádzajúca</button>`;
    }
    
    // Page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      const activeClass = i === currentPage ? 'active' : '';
      controls += `<button class="pagination-btn ${activeClass}" onclick="flotilaManager.goToPage(${i})">${i}</button>`;
    }
    
    // Next button
    if (currentPage < totalPages) {
      controls += `<button class="pagination-btn" onclick="flotilaManager.goToPage(${currentPage + 1})">Ďalšia ›</button>`;
    }
    
    controls += `
        </div>
      </div>
    `;
    
    return controls;
  }

  // Go to specific page
  goToPage(page) {
    const totalPages = Math.ceil(this.pagination.totalItems / this.pagination.itemsPerPage);
    if (page >= 1 && page <= totalPages) {
      this.pagination.currentPage = page;
      this.renderPairs();
    }
  }


  // Render unassigned trailers
  renderUnassignedTrailers(query = "") {
    const unassignedTrailers = document.getElementById('unassigned-trailers');
    if (!unassignedTrailers) return;

    // Get all assigned trailer plates
    const assignedTrailerPlates = Object.values(this.trucks)
      .map(t => t.trailer)
      .filter(Boolean);

    // Find unassigned trailers
    let unassigned = Object.values(this.trailers)
      .filter(trailer => !assignedTrailerPlates.includes(trailer.licensePlate))
      .sort((a, b) => a.licensePlate.localeCompare(b.licensePlate));

    // Apply search filter if query provided
    if (query) {
      const searchTerm = query.toLowerCase();
      unassigned = unassigned.filter(trailer => 
        trailer.licensePlate.toLowerCase().includes(searchTerm) ||
        trailer.vin.toLowerCase().includes(searchTerm) ||
        (trailer.brand && trailer.brand.toLowerCase().includes(searchTerm)) ||
        (trailer.model && trailer.model.toLowerCase().includes(searchTerm)) ||
        (trailer.type && trailer.type.toLowerCase().includes(searchTerm))
      );
    }

    if (unassigned.length === 0) {
      unassignedTrailers.innerHTML = '';
      return;
    }

    const titleHtml = `
      <h3 class="unassigned-title">
        Nepriradené prívesy (${unassigned.length})
      </h3>
    `;

    const trailersHtml = unassigned.map(trailer => `
      <div class="vehicle-card trailer-card" onclick="flotilaManager.showPolozka('trailer', '${trailer.licensePlate}')">
        <div class="vehicle-info">
          <div class="vehicle-license">${trailer.licensePlate}</div>
        </div>
      </div>
    `).join('');

    unassignedTrailers.innerHTML = titleHtml + trailersHtml;
  }

  // Show vehicle položka
  async showPolozka(type, plate) {
    if (!plate) return;

    const vehicle = type === 'truck' ? 
      Object.values(this.trucks).find(t => t.licensePlate === plate) :
      Object.values(this.trailers).find(t => t.licensePlate === plate);

    if (!vehicle) return;

    this.selectedVehicle = { ...vehicle, type };
    
    
    // Get services with calculations from Firebase
    try {
      const servicesWithCalculations = await window.DatabaseService.getServicesWithCalculations(plate);
      vehicle.services = servicesWithCalculations;
    } catch (error) {
      console.error('Error getting services with calculations:', error);
      vehicle.services = [];
    }
    
    // Load services and work session from database
    try {
      const vehicleInfo = await window.db.collection('vehicles')
        .doc(plate)
        .collection('info')
        .doc('basic')
        .get();
      
      if (vehicleInfo.exists) {
        const data = vehicleInfo.data();
        vehicle.services = data.services || [];
        vehicle.activeWorkSession = data.activeWorkSession || null;
        vehicle.history = data.history || [];
        // Preserve currentKm from vehicles_km collection, don't override it
        // vehicle.currentKm is already set correctly from the main data loading
      } else {
        vehicle.services = [];
        vehicle.activeWorkSession = null;
        vehicle.history = [];
        // Keep the currentKm that was loaded from vehicles_km collection
      }
    } catch (error) {
      console.error('Error loading services and work session:', error);
      vehicle.services = [];
      vehicle.activeWorkSession = null;
      vehicle.history = [];
      // Keep the currentKm that was loaded from vehicles_km collection
    }
    
    
    this.renderPolozkaPanel(vehicle, type);
  }

  // Clear položka panel and show placeholder
  clearPolozkaPanel() {
    const detailPanel = document.getElementById('polozka-panel');
    if (!detailPanel) return;
    
    // Remove has-vehicle class to reset height
    detailPanel.classList.remove('has-vehicle');
    
    // Reset to placeholder content
    detailPanel.innerHTML = `
      <div class="polozka-placeholder">
        <svg width="64" height="64" fill="none" stroke="#9ca3af" stroke-width="1.5">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p>Vyberte vozidlo pre položku</p>
        <p style="font-size: 0.875rem; margin-top: 1rem; opacity: 0.7;">Kliknite pre zrušenie výberu alebo stlačte Escape</p>
      </div>
    `;
  }

  // Deselect current vehicle
  deselectVehicle() {
    this.selectedVehicle = null;
    this.clearPolozkaPanel();
  }

  // Render položka panel
  renderPolozkaPanel(vehicle, type) {
    const detailPanel = document.getElementById('polozka-panel');
    if (!detailPanel) return;

    // Reset scroll position to top
    detailPanel.scrollTop = 0;
    
    // Add has-vehicle class to extend panel to bottom
    detailPanel.classList.add('has-vehicle');

    const typeText = type === 'truck' ? 'Nákladné auto' : 'Príves';
    const typeColor = type === 'truck' ? '#eab308' : '#2563eb';

    detailPanel.innerHTML = `
      <div class="vehicle-polozka">
        <!-- Vehicle Header Info -->
  <div class="vehicle-header" style="display: flex; justify-content: space-between; align-items: center; padding: 0 0 10px 0; border-radius: 0; background: none; box-shadow: none;">
          <div class="vehicle-header-left" style="display: flex; flex-direction: column; gap: 4px;">
            <div class="vehicle-license-large" style="color: #374151; font-size: 1.2rem; font-weight: bold;">${vehicle.licensePlate}</div>
            <div class="vehicle-type" style="color: #6b7280; font-size: 0.95rem; letter-spacing: 1px;">${vehicle.type || 'Neznámy typ'}</div>
          </div>
          <div class="vehicle-header-right" style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <div class="vehicle-km-large" style="color: #374151; font-size: 1rem; font-weight: 600;">${vehicle.currentKm.toLocaleString()} km</div>
            <div class="vehicle-vin" style="color: #6b7280; font-size: 0.85rem; letter-spacing: 1px;">${vehicle.vin}</div>
          </div>
        </div>
        <div style="height: 8px; width: 100%; margin: 12px 0 0 0; background: ${type === 'truck' ? '#eab308' : '#2563eb'}; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.10);"></div>
        
        <!-- Navigation Tabs -->
        <div class="vehicle-tabs" style="display: flex; gap: 16px; justify-content: flex-start; margin: 18px 0 0 0;">
          <button class="tab-button" data-tab="servis" style="background: #f3f4f6; color: ${typeColor}; font-weight: 600; border-radius: 14px; padding: 10px 32px; border: none;">
            <span>SERVIS</span>
          </button>
          <button class="tab-button" data-tab="historia" style="background: #f3f4f6; color: ${typeColor}; font-weight: 600; border-radius: 14px; padding: 10px 32px; border: none;">
            <span>HISTORIA</span>
          </button>

          <button class="tab-button" data-tab="diagnostika" style="background: #f3f4f6; color: ${typeColor}; font-weight: 600; border-radius: 14px; padding: 10px 32px; border: none;">
            <span>DIAGNOSTIKA</span>
          </button>
        </div>
        
        <!-- Tab Content -->
        <div class="tab-content">
          <!-- Servis Tab -->
          <div class="tab-pane" id="servis-tab">
            <!-- Services Section -->
            <div class="services-section" id="services-section">
              ${this.renderServiceTypes(vehicle.services || [])}
            </div>
            
            <!-- Add Service Type Button at Bottom -->
            <div class="add-service-type-section">
              <button class="add-service-type-btn" onclick="window.flotilaManager.showServiceTypeModal()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Pridať servis
              </button>
            </div>
          </div>
          
          <!-- Historia Tab -->
          <div class="tab-pane" id="historia-tab">
            <div class="history-content">
              <!-- Active Work Session Section -->
              <div class="history-section">
                <h3 class="section-title">Aktuálna práca</h3>
                ${this.renderActiveWorkSession(vehicle.activeWorkSession)}
              </div>
              
              <!-- Completed Work Sessions Section -->
              <div class="history-section">
                <h3 class="section-title">História práce</h3>
                <div class="history-search-container">
                  <input type="text" id="history-search" placeholder="Hľadať v histórii práce..." oninput="window.flotilaManager.filterHistory(this.value)">
                </div>
                <div class="completed-work-sessions">
                  ${this.renderCompletedWorkSessions()}
                </div>
              </div>
            </div>
          </div>
          

          
          <!-- Diagnostika Tab -->
          <div class="tab-pane" id="diagnostika-tab">
            <div class="empty-tab">
              <svg width="48" height="48" fill="none" stroke="#9ca3af" stroke-width="1.5">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
              </svg>
              <p>Diagnostika bude dostupná neskôr</p>
            </div>
          </div>
        </div>
        
      </div>
    `;

    // Bind tab switching events
    this.bindTabEvents();
  }

  // Calculate equivalent kilometers until due for sorting
  calculateEquivalentKmUntilDue(service) {
    if (service.type === 'km') {
      // For km-based services, use remaining km directly
      const currentKm = this.selectedVehicle?.currentKm || this.selectedVehicle?.kilometers || 0;
      const hasLastKm = service.lastService && typeof service.lastService.km === 'number';
      const lastServiceKm = hasLastKm ? service.lastService.km : currentKm;
      const targetKm = lastServiceKm + parseInt(service.interval);
      const remainingKm = targetKm - currentKm;
      return remainingKm; // Negative for overdue
    } else {
      // For date-based services, calculate remaining days and convert to km
      // 1 day = 2500/7 km ≈ 357 km/day
      const kmPerDay = 2500 / 7;
      
      if (service.type === 'specificDate' || service.specificDate) {
        const specific = this.parseDateFlexible(service.specificDate || service.interval);
        if (!specific) return Infinity; // No date set, put at end
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffTime = specific - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays * kmPerDay; // Negative for overdue
      }
      
      if (!service.lastService?.date) return Infinity; // No last service, put at end
      
      const lastPerformed = this.parseDateFlexible(service.lastService.date);
      if (!lastPerformed) return Infinity;
      
      const interval = parseInt(service.interval) || 0;
      const timeUnit = service.timeUnit || 'days';
      
      let nextDueDate = new Date(lastPerformed);
      if (timeUnit === 'months') {
        nextDueDate.setMonth(nextDueDate.getMonth() + interval);
      } else if (timeUnit === 'years') {
        nextDueDate.setFullYear(nextDueDate.getFullYear() + interval);
      } else {
        nextDueDate.setDate(nextDueDate.getDate() + interval);
      }
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = nextDueDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays * kmPerDay; // Negative for overdue
    }
  }

  // Render service types with sections
  renderServiceTypes(services) {
    if (!services || services.length === 0) {
      return '';
    }

    // Categorize services
    const servisServices = [];
    const ostatneServices = [];

    services.forEach((service, originalIndex) => {
      const serviceName = (service.name || '').toLowerCase();
      const isServis = 
        service.type === 'km' || 
        serviceName.includes('kontrola brzd') || 
        serviceName.includes('ročná prehliadka') ||
        serviceName.includes('rocna prehliadka');

      if (isServis) {
        servisServices.push({ service, originalIndex });
      } else {
        ostatneServices.push({ service, originalIndex });
      }
    });

    // Sort services by proximity to due date (ascending - closest first)
    servisServices.sort((a, b) => {
      const aValue = this.calculateEquivalentKmUntilDue(a.service);
      const bValue = this.calculateEquivalentKmUntilDue(b.service);
      return aValue - bValue;
    });

    ostatneServices.sort((a, b) => {
      const aValue = this.calculateEquivalentKmUntilDue(a.service);
      const bValue = this.calculateEquivalentKmUntilDue(b.service);
      return aValue - bValue;
    });

    // Helper function to render a single service card
    const renderServiceCard = (service, index) => {
      const statusClass = this.getServiceStatusClass(service);
      return `
        <div class="service-type-card ${statusClass}">
          <div class="service-type-header">
            <div class="service-type-info">
              <h4 class="service-type-name">${service.name}</h4>
              <div class="service-type-interval">
                ${this.getServiceIntervalText(service.type, service.interval, service.specificDate, service.timeUnit)}
              </div>
            </div>
            <div class="service-timing-info">
              <div class="service-due-date">
                ${service.type === 'km' ? this.calculateTargetKm(service) : this.calculateDueDate(service.lastService?.date, service.interval, service.type, service.specificDate, service.timeUnit)}
              </div>
              <div class="service-remaining">
                ${service.type === 'km' ? this.calculateRemainingKm(service) : this.calculateRemainingDays(service.lastService?.date, service.interval, service.type, service.specificDate, service.timeUnit)}
              </div>
            </div>
            <div class="service-type-actions">
              <button class="edit-service-btn" onclick="window.flotilaManager.editService(${index})" title="Upraviť">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="toggle-work-btn ${this.isServiceInWorkList(service.name) ? 'remove' : 'add'}" 
                      onclick="window.flotilaManager.toggleServiceFromWorkList('${service.name}', '${service.type}', '${service.interval}', ${index})" 
                      title="${this.isServiceInWorkList(service.name) ? 'Odobrať z práce' : 'Pridať do práce'}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  ${this.isServiceInWorkList(service.name) ? `
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  ` : `
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  `}
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
    };

    // Render sections
    let html = '';

    // Servis section
    if (servisServices.length > 0) {
      html += `
        <div class="services-section-item">
          <div class="services-section-header collapsible" onclick="window.flotilaManager.toggleServiceSection('servis-section')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
            </svg>
            <h3>Servis</h3>
            <span class="service-section-count">${servisServices.length}</span>
            <svg class="dropdown-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform: rotate(180deg);">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
          <div class="services-section-content collapsible-content" id="servis-section">
            <div class="services-grid">
              ${servisServices.map(({ service, originalIndex }) => renderServiceCard(service, originalIndex)).join('')}
            </div>
          </div>
        </div>
      `;
    }

    // Ostatné section
    if (ostatneServices.length > 0) {
      html += `
        <div class="services-section-item">
          <div class="services-section-header collapsible" onclick="window.flotilaManager.toggleServiceSection('ostatne-section')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <h3>Ostatné</h3>
            <span class="service-section-count">${ostatneServices.length}</span>
            <svg class="dropdown-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
          <div class="services-section-content collapsible-content" id="ostatne-section" style="display: none;">
            <div class="services-grid">
              ${ostatneServices.map(({ service, originalIndex }) => renderServiceCard(service, originalIndex)).join('')}
            </div>
          </div>
        </div>
      `;
    }

    return html;
  }

  // Toggle service section visibility
  toggleServiceSection(sectionId) {
    const content = document.getElementById(sectionId);
    const header = content?.previousElementSibling;
    const arrow = header?.querySelector('.dropdown-arrow');
    
    if (content && arrow) {
      const isHidden = content.style.display === 'none';
      content.style.display = isHidden ? 'block' : 'none';
      arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  }

  // Render active work session
  renderActiveWorkSession(activeWorkSession) {
    if (!activeWorkSession || !activeWorkSession.items || activeWorkSession.items.length === 0) {
      return `
        <div class="no-active-work">
          <svg width="48" height="48" fill="none" stroke="#9ca3af" stroke-width="1.5">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p>Žiadna aktívna práca</p>
          <p class="sub-text">Pridajte úlohy z karty Servis do práce</p>
        </div>
      `;
    }

    const workItemsHtml = activeWorkSession.items.map(item => {
      const statusClass = item.status === 'completed' ? 'completed' : (item.status === 'in-progress' ? 'in-progress' : 'pending');
      
      return `
        <div class="work-item ${statusClass}">
          <div class="work-item-header">
            <div class="work-item-checkbox" onclick="event.stopPropagation()">
              <input type="checkbox" 
                     id="work-item-${item.id}" 
                     ${item.status === 'completed' ? 'checked' : ''} 
                     onchange="window.flotilaManager.toggleWorkItemStatus(${item.id})">
              <label for="work-item-${item.id}"></label>
            </div>
            <div class="work-item-info">
              <div class="work-item-name">
                <input type="text" 
                       id="work-item-name-${item.id}" 
                       value="${item.name}" 
                       placeholder="Názov servisu"
                       onchange="window.flotilaManager.updateWorkItemName(${item.id}, this.value)">
              </div>
              <div class="work-item-polozky"></div>
            </div>
            <div class="work-item-actions">
              <button class="work-item-toggle" onclick="event.stopPropagation(); window.flotilaManager.toggleWorkItemPolozky(${item.id})" title="Zobraziť položky">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6,9 12,15 18,9"></polyline>
                </svg>
              </button>
              <button class="btn-delete-work-item" onclick="event.stopPropagation(); window.flotilaManager.deleteWorkItem(${item.id})" title="Vymazať úlohu">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3,6 5,6 21,6"></polyline>
                  <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="work-item-polozky-panel" id="work-item-polozky-${item.id}">
            <div class="work-item-notes">
              <label for="work-item-notes-${item.id}">Poznámky:</label>
              <textarea 
                id="work-item-notes-${item.id}" 
                placeholder="Pridajte poznámky k tejto úlohe..."
                onchange="window.flotilaManager.updateWorkItemNotes(${item.id}, this.value)"
              >${item.notes || ''}</textarea>
            </div>
            ${this.renderWorkItemServicePolozky(item)}
          </div>
        </div>
      `;
    }).join('');

    // Get current vehicle kilometers
    const currentKm = this.selectedVehicle?.currentKm || 0;
    const startDate = new Date(activeWorkSession.startedAt);
    const formattedDate = startDate.toISOString().split('T')[0]; // YYYY-MM-DD format for input

    return `
      <div class="active-work-session">
        <div class="work-session-header">
          <div class="work-session-info">
            <div class="work-session-date-input">
              <label for="work-start-date">Dátum začiatku:</label>
              <input type="date" 
                     id="work-start-date" 
                     value="${formattedDate}" 
                     onchange="window.flotilaManager.updateWorkStartDate(this.value)">
            </div>
            <div class="work-session-km-input">
              <label for="work-current-km">Aktuálne km:</label>
              <input type="number" 
                     id="work-current-km" 
                     value="${currentKm}" 
                     onchange="window.flotilaManager.updateWorkCurrentKm(this.value)"
                     placeholder="Zadajte km">
            </div>
            <span class="work-session-count">${activeWorkSession.items.filter(item => item.status === 'completed').length}/${activeWorkSession.items.length} dokončené</span>
          </div>
          <div class="work-session-actions">
            <button class="btn-finish-job" onclick="window.flotilaManager.finishJob()">
              Dokončiť prácu
            </button>
          </div>
        </div>
        <div class="work-items-list">
          ${workItemsHtml}
        </div>
      </div>
    `;
  }

  // Render completed work sessions
  renderCompletedWorkSessions(completedWorkSessions) {
    // Prefer explicitly provided list (even if empty); fallback to selected vehicle history
    const history = Array.isArray(completedWorkSessions)
      ? completedWorkSessions
      : (this.selectedVehicle?.history || []);
    
    if (!history || history.length === 0) {
      return `
        <div class="no-completed-work">
          <svg width="48" height="48" fill="none" stroke="#9ca3af" stroke-width="1.5">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p>Žiadna dokončená práca</p>
          <p class="sub-text">Dokončené pracovné sessiony sa zobrazia tu</p>
        </div>
      `;
    }

    // Sort history by date (newest first)
    const sortedHistory = history.sort((a, b) => {
      const dateA = new Date(a.date || a.completedAt);
      const dateB = new Date(b.date || b.completedAt);
      return dateB - dateA; // Descending order (newest first)
    });

    return sortedHistory.map(entry => {
      const entryDate = new Date(entry.date || entry.completedAt);
      const kilometers = entry.kilometers || 0;
      
      return `
        <div class="completed-work-session">
          <div class="completed-session-header">
            <div class="session-info">
              <div class="session-date">${entryDate.toLocaleDateString('sk-SK')}</div>
              <div class="session-kilometers">${kilometers.toLocaleString()} km</div>
            </div>
            <div class="session-summary">
              ${entry.items.length} úloh dokončených
              <span class="session-actions" style="display:inline-flex; gap:8px; margin-left:12px;">
                <button class="session-action-btn edit" title="Upraviť dátum a km" onclick="event.stopPropagation(); window.flotilaManager.showEditHistoryEntryModal(${entry.id})" style="border:none; background:#f3f4f6; padding:6px; border-radius:8px; cursor:pointer;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="session-action-btn delete" title="Vymazať záznam" onclick="event.stopPropagation(); window.flotilaManager.deleteHistoryEntry(${entry.id})" style="border:none; background:#fee2e2; color:#b91c1c; padding:6px; border-radius:8px; cursor:pointer;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </span>
            </div>
          </div>
          <div class="completed-session-items">
            ${entry.items.map((item, idx) => {
              const hasNotes = item.notes && item.notes.trim() !== '';
              const hasDetails = item.servicePolozky && Object.keys(item.servicePolozky).length > 0;
              const hasContent = hasNotes || hasDetails;
              const isEditing = this.isHistoryItemEditing ? this.isHistoryItemEditing(entry.id, idx) : false;
              
              return `
                <div class="completed-session-item">
                  <div class="completed-item-main">
                    ${isEditing ? `
                      <input type="text" class="completed-item-name-input" value="${this.escapeHtmlAttr(item.name)}" onchange="window.flotilaManager.updateHistoryItemName(${entry.id}, ${idx}, this.value)">
                    ` : `
                      <span class="item-name">${item.name}</span>
                    `}
                    <div class="completed-spacer"></div>
                    <div class="completed-item-actions">
                      ${!isEditing ? `
                        <button class="completed-item-edit" title="Upraviť" onclick="event.stopPropagation(); window.flotilaManager.toggleHistoryItemEdit(${entry.id}, ${idx})">Upraviť</button>
                        <button class="completed-item-delete" title="Odstrániť z vykonaných" onclick="event.stopPropagation(); window.flotilaManager.deleteHistoryItem(${entry.id}, ${idx})" style="border:none; background:#fff1f2; color:#9f1239; padding:4px 6px; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                      ` : `
                        <button class="btn-primary" onclick="event.stopPropagation(); window.flotilaManager.saveHistoryItemEdits(${entry.id}, ${idx})">Uložiť</button>
                        <button class="btn-secondary" onclick="event.stopPropagation(); window.flotilaManager.cancelHistoryItemEdits(${entry.id}, ${idx})">Zrušiť</button>
                      `}
                    </div>
                    ${hasContent && !isEditing ? `
                      <span class="action-divider"></span>
                      <button class="completed-item-toggle" onclick="event.stopPropagation(); window.flotilaManager.toggleCompletedItemPolozky('${entry.date || entry.completedAt}-${item.name}')" title="Zobraziť položky">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="6,9 12,15 18,9"></polyline>
                        </svg>
                      </button>
                    ` : ''}
                  </div>
                  ${hasContent ? `
                    <div class="completed-item-polozky-panel${isEditing ? ' expanded' : ''}" id="completed-item-polozky-${entry.date || entry.completedAt}-${item.name}">
                      ${hasNotes ? `
                        <div class="completed-item-notes">
                          <strong>Poznámky:</strong>
                          ${isEditing ? `
                            <textarea class="completed-item-notes-input" onchange="window.flotilaManager.updateHistoryItemNote(${entry.id}, ${idx}, this.value)">${item.notes || ''}</textarea>
                          ` : `
                            ${item.notes}
                          `}
                        </div>
                      ` : ''}
                      ${hasDetails ? `
                        <div class="completed-item-polozky">
                          ${Object.entries(item.servicePolozky).map(([key, value]) => {
                            const isCompleted = item.polozkyStatus && item.polozkyStatus[key] === true;
                            const safeKey = JSON.stringify(key);
                            return `
                              <div class="polozka-item ${isCompleted ? 'completed' : ''}">
                                <span class="polozka-checkbox">
                                  ${isEditing ? `
                                    <input type="checkbox" ${isCompleted ? 'checked' : ''} onchange="window.flotilaManager.toggleHistoryItemDetailStatus(${entry.id}, ${idx}, ${safeKey}, this.checked)">
                                  ` : `
                                    <input type="checkbox" ${isCompleted ? 'checked' : ''} disabled>
                                  `}
                                  <label></label>
                                </span>
                                <span class="polozka-content">
                                  ${isEditing ? `
                                    <input type=\"text\" value=\"${this.escapeHtmlAttr(String(value))}\" onchange=\"window.flotilaManager.updateHistoryItemDetail(${entry.id}, ${idx}, ${safeKey}, this.value)\"> 
                                  ` : `
                                    ${value}
                                  `}
                                </span>
                              </div>
                            `;
                          }).join('')}
                        </div>
                      ` : ''}
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  // Bind tab switching events
  bindTabEvents() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // Set initial active tab (SERVIS)
    const initialTab = tabButtons[0]; // First tab (SERVIS)
    const initialTabName = initialTab.getAttribute('data-tab');
    
    // Set initial active state
    initialTab.classList.add('active');
    document.getElementById(`${initialTabName}-tab`).classList.add('active');
    
    // Update button styling for initial state
    this.updateTabButtonStyles();

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.getAttribute('data-tab');
        
        // Remove active class from all buttons and panes
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));
        
        // Add active class to clicked button and corresponding pane
        button.classList.add('active');
        document.getElementById(`${targetTab}-tab`).classList.add('active');
        
        // Update button styling
        this.updateTabButtonStyles();
      });
    });
  }

  // Update tab button styles based on active state
  updateTabButtonStyles() {
    const tabButtons = document.querySelectorAll('.tab-button');
    // Get the type from the selectedVehicle or fallback to checking the vehicle data
    const vehicleType = this.selectedVehicle?.type || this.selectedVehicle?.vehicleType || 'truck';
    const typeColor = vehicleType === 'truck' ? '#eab308' : '#2563eb';
    
    tabButtons.forEach(button => {
      if (button.classList.contains('active')) {
        button.style.background = typeColor;
        button.style.color = '#fff';
        button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
      } else {
        button.style.background = '#f3f4f6';
        button.style.color = typeColor;
        button.style.boxShadow = 'none';
      }
    });
  }

  // Add service to work list
  async addToWorkList(serviceName, serviceType, serviceValue) {
    // Check if there's already an active work session
    if (!this.selectedVehicle.activeWorkSession) {
      this.selectedVehicle.activeWorkSession = {
        id: Date.now(),
        startedAt: new Date().toISOString(),
        items: [],
        status: 'active'
      };
    }
    
    // Find the service definition to get default polozky
    const serviceDefinition = this.selectedVehicle.services?.find(s => s.name === serviceName);
    
    // Add the service to the work list
    const workItem = {
      id: Date.now() + Math.random(),
      name: serviceName,
      type: serviceType,
      value: serviceValue,
      status: 'pending', // pending -> in-progress -> completed
      addedAt: new Date().toISOString(),
      notes: serviceDefinition?.notes || '',
      servicePolozky: serviceDefinition?.servicePolozky || {}
    };
    
    this.selectedVehicle.activeWorkSession.items.push(workItem);
    
    // Update the selectedVehicle reference to ensure consistency
    this.selectedVehicle = { ...this.selectedVehicle };
    
    // Save to database first
    await this.saveWorkSession();
    
    // Update UI immediately without reloading from database
    this.updateWorkSessionUI();
    
    // Show success message
    this.showNotification(`${serviceName} pridané do práce`, 'success');
  }



  // Show service type modal
  async showServiceTypeModal(serviceIndex = null) {
    const isEditing = serviceIndex !== null;
    const serviceType = isEditing ? this.selectedVehicle.services?.[serviceIndex] : null;
    
    // If editing, show the old detailed form
    if (isEditing) {
      this.showServiceTypeEditModal(serviceIndex, serviceType);
      return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'service-type-modal-overlay';
    modal.innerHTML = `
      <div class="service-type-modal">
        <div class="modal-header">
          <div class="modal-header-content">
            <div class="modal-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14,2 14,8 20,8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10,9 9,9 8,9"></polyline>
              </svg>
            </div>
            <div class="modal-title">
              <h3>Pridať servis</h3>
              <p>Vyberte preddefinované servisy alebo vytvorte nový</p>
            </div>
          </div>
          <button class="close-btn" onclick="this.closest('.service-type-modal-overlay').remove()">×</button>
        </div>
        
        <div class="modal-body">
          <div class="add-service-options">
            <!-- Create New Service Button -->
            <div class="create-new-service-section">
              <button class="create-new-service-btn" onclick="window.flotilaManager.showServiceTypeEditModal()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Vytvoriť nový servis
              </button>
            </div>
            
            <!-- Predefined Services List -->
            <div class="predefined-services-section">
              <div class="section-header">
                <h4>Preddefinované servisy</h4>
                <div class="section-line"></div>
              </div>
              
              <div class="predefined-services-list" id="predefined-services-selection-list">
                <div class="loading-services">Načítavam servisy...</div>
              </div>
              
              <!-- Selected Services Summary -->
              <div class="selected-services-summary" id="selected-services-summary" style="display: none;">
                <div class="summary-header">
                  <h5>Vybrané servisy (<span id="selected-count">0</span>)</h5>
                </div>
                <div class="selected-services-list" id="selected-services-list">
                  <!-- Selected services will be populated here -->
                </div>
              </div>
              
            </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="this.closest('.service-type-modal-overlay').remove()">Zrušiť</button>
          <button type="button" class="btn-primary" id="add-selected-services-btn" onclick="window.flotilaManager.addSelectedServices()" disabled>
            Pridať vybrané servisy
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Load predefined services
    await this.loadPredefinedServicesForSelection();
  }

  // Show service type edit modal (the detailed form)
  showServiceTypeEditModal(serviceIndex = null, serviceType = null) {
    const isEditing = serviceIndex !== null;
    
    const modal = document.createElement('div');
    modal.className = 'service-type-modal-overlay';
    modal.innerHTML = `
      <div class="service-type-modal">
        <div class="modal-header">
          <div class="modal-header-content">
            <div class="modal-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14,2 14,8 20,8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10,9 9,9 8,9"></polyline>
              </svg>
            </div>
            <div class="modal-title">
              <h3>${isEditing ? 'Upraviť servis' : 'Vytvoriť nový servis'}</h3>
              <p>${isEditing ? 'Upravte nastavenia servisu' : 'Vytvorte nový typ servisu pre vozidlo'}</p>
            </div>
          </div>
          <button class="close-btn" onclick="this.closest('.service-type-modal-overlay').remove()">×</button>
        </div>
        
        <div class="modal-body">
          <form id="service-type-form">
            <div class="form-section">
              <div class="section-header">
                <h4>Názov servisu</h4>
                <div class="section-line"></div>
              </div>
              
              <div class="form-group">
                <div class="input-with-dropdown">
                  <input type="text" id="service-type-name" value="${serviceType?.name || ''}" required="" placeholder="Zadajte názov servisu alebo vyberte z predvolených">
                  <button type="button" class="dropdown-btn" onclick="window.flotilaManager.toggleServiceDropdown()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="6,9 12,15 18,9"></polyline>
                    </svg>
                  </button>
                  <div class="dropdown-menu" id="service-dropdown" style="display: none;">
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Výmena oleja v motore')">Výmena oleja v motore</div>
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Výmena filtrov')">Výmena filtrov</div>
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Kontrola bŕzd')">Kontrola bŕzd</div>
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Kontrola klimatizácie')">Kontrola klimatizácie</div>
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Kontrola oleja')">Kontrola oleja</div>
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Kontrola pneumatík')">Kontrola pneumatík</div>
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Výmena sviečok')">Výmena sviečok</div>
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Kontrola chladiča')">Kontrola chladiča</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="form-section">
              <div class="section-header">
                <h4>Typ intervalu</h4>
                <div class="section-line"></div>
              </div>
              
              <div class="interval-type-selector">
                <div class="interval-option" data-type="km">
                  <div class="option-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                      <path d="M2 17l10 5 10-5"></path>
                      <path d="M2 12l10 5 10-5"></path>
                    </svg>
                  </div>
                  <div class="option-content">
                    <h5>Kilometre</h5>
                    <p>Podľa najazdených kilometrov</p>
                  </div>
                  <div class="option-radio">
                    <input type="radio" name="interval-type" value="km" ${serviceType?.type === 'km' ? 'checked' : ''}>
                  </div>
                </div>
                
                <div class="interval-option" data-type="time">
                  <div class="option-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12,6 12,12 16,14"></polyline>
                    </svg>
                  </div>
                  <div class="option-content">
                    <h5>Čas</h5>
                    <p>Podľa uplynutého času</p>
                  </div>
                  <div class="option-radio">
                    <input type="radio" name="interval-type" value="time" ${serviceType?.type === 'date' && serviceType?.timeUnit ? 'checked' : ''}>
                  </div>
                </div>
                
                <div class="interval-option" data-type="specific-date">
                  <div class="option-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                  </div>
                  <div class="option-content">
                    <h5>Špecifický dátum</h5>
                    <p>Na konkrétny dátum</p>
                  </div>
                  <div class="option-radio">
                    <input type="radio" name="interval-type" value="specific-date" ${serviceType?.type === 'date' && serviceType?.specificDate ? 'checked' : ''}>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="form-section" id="interval-polozky-section">
              <div class="section-header">
                <h4>Nastavenie intervalu</h4>
                <div class="section-line"></div>
              </div>
              
              <div class="interval-polozky" id="km-polozky" style="display: ${serviceType?.type === 'km' ? 'block' : 'none'};">
                <div class="form-group">
                  <label for="service-interval-km">Interval (km):</label>
                  <input type="number" id="service-interval-km" value="${serviceType?.interval || ''}" placeholder="Napríklad: 50000">
                </div>
                <div class="form-group">
                  <label for="service-reminder-km">Upozornenie (km):</label>
                  <input type="number" id="service-reminder-km" value="${serviceType?.reminderKm || '15000'}" placeholder="Napríklad: 15000">
                </div>
              </div>
              
              <div class="interval-polozky" id="time-polozky" style="display: ${serviceType?.type === 'date' && serviceType?.timeUnit ? 'block' : 'none'};">
                <div class="form-group">
                  <label for="service-interval-time">Interval:</label>
                  <div class="time-input-group">
                    <input type="number" id="service-interval-time" value="${serviceType?.interval || ''}" placeholder="Napríklad: 6">
                    <select id="time-unit">
                      <option value="days" ${serviceType?.timeUnit === 'days' ? 'selected' : ''}>Dní</option>
                      <option value="months" ${serviceType?.timeUnit === 'months' ? 'selected' : ''}>Mesiacov</option>
                      <option value="years" ${serviceType?.timeUnit === 'years' ? 'selected' : ''}>Rokov</option>
                    </select>
                  </div>
                </div>
                <div class="form-group">
                  <label for="service-reminder-time">Upozornenie:</label>
                  <div class="time-input-group">
                    <input type="number" id="service-reminder-time" value="${serviceType?.reminderDays || '30'}" placeholder="Napríklad: 30">
                    <select id="reminder-time-unit">
                      <option value="days">Dní</option>
                      <option value="weeks">Týždňov</option>
                      <option value="months">Mesiacov</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div class="interval-polozky" id="specific-date-polozky" style="display: ${serviceType?.type === 'date' && serviceType?.specificDate ? 'block' : 'none'};">
                <div class="form-group">
                  <label for="service-specific-date">Dátum:</label>
                  <input type="date" id="service-specific-date" value="${serviceType?.specificDate || ''}">
                </div>
                <div class="form-group">
                  <label for="service-reminder-days">Upozornenie (dni):</label>
                  <input type="number" id="service-reminder-days" value="${serviceType?.reminderDays || '30'}" placeholder="Napríklad: 30">
                </div>
              </div>
            </div>
            
            <div class="form-section" id="service-polozky-section">
              <div class="section-header">
                <h4>Položky servisu</h4>
                <div class="section-line"></div>
              </div>
              
              <div class="service-polozky-form">
                <div class="service-polozky-list" id="service-polozky-list">
                  <div class="no-polozky">Žiadne položky neboli pridané</div>
                </div>
                
                <div class="add-polozka-section">
                  <button type="button" class="btn-add-polozka" onclick="window.flotilaManager.showServicePolozkaModal()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Pridať položku
                  </button>
                </div>
                
                <div class="form-group">
                  <label for="service-notes">Poznámky k servisu:</label>
                  <textarea id="service-notes" placeholder="Pridajte poznámky k servisu...">${serviceType?.notes || ''}</textarea>
                </div>
              </div>
                </div>
                
            <div class="form-actions">
              <button type="button" class="btn-secondary" onclick="this.closest('.service-type-modal-overlay').remove()">Zrušiť</button>
              ${isEditing ? `<button type="button" class="btn-danger" onclick="window.flotilaManager.removeService(${serviceIndex})">Vymazať servis</button>` : ''}
              <button type="submit" class="btn-primary">${isEditing ? 'Uložiť zmeny' : 'Vytvoriť servis'}</button>
                </div>
          </form>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle form submission
    const form = modal.querySelector('#service-type-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleServiceTypeSubmit(serviceIndex);
    });
    
    // Handle interval type selection
    const intervalOptions = modal.querySelectorAll('.interval-option');
    
    intervalOptions.forEach(option => {
      option.addEventListener('click', () => {
        // Update radio button
        const radio = option.querySelector('input[type="radio"]');
        radio.checked = true;
        
        // Update visual selection
        intervalOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        
        // Show/hide interval polozky
        const type = option.dataset.type;
        this.showIntervalDetails(type);
      });
    });
    
    // Initialize selection
    const selectedOption = modal.querySelector('.interval-option input[type="radio"]:checked');
    if (selectedOption) {
      selectedOption.closest('.interval-option').classList.add('selected');
    }
    
    // Populate service polozky if editing
    if (isEditing && serviceType?.servicePolozky) {
      const polozkyList = modal.querySelector('#service-polozky-list');
      const noDetails = polozkyList.querySelector('.no-polozky');
      
      if (noDetails) {
        noDetails.remove();
      }
      
      // Add existing service polozky
      serviceType.servicePolozky.forEach((detail, index) => {
        const detailId = 'detail_' + Date.now() + '_' + index;
        const detailElement = document.createElement('div');
        detailElement.className = 'service-polozka-item';
        detailElement.innerHTML = `
          <div class="polozka-header">
            <span class="polozka-name">${detail}</span>
            <button type="button" class="remove-polozka-btn" onclick="window.flotilaManager.removeServicePolozka('${detailId}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        `;
        detailElement.id = detailId;
        polozkyList.appendChild(detailElement);
      });
    }
    
    // Focus on first input
    setTimeout(() => {
      const firstInput = modal.querySelector('#service-type-name');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  // Load predefined services for selection
  async loadPredefinedServicesForSelection() {
    const servicesList = document.getElementById('predefined-services-selection-list');
    if (!servicesList) return;
    
    try {
      const snapshot = await window.db.collection('predefined_services').orderBy('name').get();
      
      if (snapshot.empty) {
        servicesList.innerHTML = '<div class="no-services">Žiadne preddefinované servisy neboli nájdené</div>';
        return;
      }
      
      const services = snapshot.docs.map(doc => {
        const service = { id: doc.id, ...doc.data() };
        const polozkyCount = service.servicePolozky ? service.servicePolozky.length : 0;
        return `
          <div class="predefined-service-item" data-service-id="${service.id}">
            <div class="service-checkbox">
              <input type="checkbox" id="service-${service.id}" onchange="window.flotilaManager.toggleServiceSelection('${service.id}')">
              <label for="service-${service.id}"></label>
            </div>
            <div class="service-info">
              <div class="service-name">${service.name}</div>
              <div class="service-polozky">
                <span class="service-interval">
                  ${service.type === 'specificDate'
                    ? this.formatDateSk(service.specificDate || service.interval)
                    : (service.type === 'km'
                        ? `${this.formatNumberWithSpaces(service.interval)} km`
                        : `${service.interval} ${this.getUnitForm(service.interval, service.timeUnit || 'days')}`)}
                </span>
                <span class="service-type">${service.type === 'specificDate' ? 'Dátum' : (service.type === 'km' ? 'Km' : 'Čas')}</span>
                ${polozkyCount > 0 ? `<span class="service-polozky-count">${polozkyCount} polož${polozkyCount !== 1 ? 'iek' : 'ka'}</span>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      servicesList.innerHTML = services;
      
    } catch (error) {
      console.error('Error loading predefined services:', error);
      servicesList.innerHTML = '<div class="error-loading">Chyba pri načítavaní služieb</div>';
    }
  }

  // Toggle service selection
  toggleServiceSelection(serviceId) {
    const checkbox = document.getElementById(`service-${serviceId}`);
    const serviceItem = document.querySelector(`[data-service-id="${serviceId}"]`);
    const summary = document.getElementById('selected-services-summary');
    const selectedCount = document.getElementById('selected-count');
    const addButton = document.getElementById('add-selected-services-btn');
    
    if (checkbox.checked) {
      serviceItem.classList.add('selected');
    } else {
      serviceItem.classList.remove('selected');
    }
    
    // Update summary
    const selectedServices = document.querySelectorAll('.predefined-service-item.selected');
    const count = selectedServices.length;
    
    if (count > 0) {
      summary.style.display = 'block';
      selectedCount.textContent = count;
      addButton.disabled = false;
      
      // Update selected services list
      const selectedList = document.getElementById('selected-services-list');
      selectedList.innerHTML = selectedServices.map(item => {
        const name = item.querySelector('.service-name').textContent;
        return `<div class="selected-service-item">${name}</div>`;
      }).join('');
    } else {
      summary.style.display = 'none';
      addButton.disabled = true;
    }
  }

  // Add selected services to vehicle
  async addSelectedServices() {
    const selectedServices = document.querySelectorAll('.predefined-service-item.selected');
    
    if (selectedServices.length === 0) {
      alert('Prosím vyberte aspoň jeden servis.');
      return;
    }
    
    try {
      const serviceIds = Array.from(selectedServices).map(item => item.dataset.serviceId);
      const services = [];
      
      // Load service data for each selected service
      for (const serviceId of serviceIds) {
        const doc = await window.db.collection('predefined_services').doc(serviceId).get();
        if (doc.exists) {
          const serviceData = { id: doc.id, ...doc.data() };
          
          // Convert predefined service to vehicle service format
          const vehicleService = {
            name: serviceData.name,
            type: serviceData.type,
            interval: serviceData.interval,
            servicePolozky: serviceData.servicePolozky || [],
            notes: serviceData.notes || '',
            lastService: {
              date: new Date().toISOString().split('T')[0],
              km: this.selectedVehicle.kilometers || 0
            }
          };
          
          // Add specific fields based on type
          if (serviceData.type === 'km') {
            vehicleService.reminderKm = serviceData.reminderKm;
          } else if (serviceData.type === 'date') {
            if (serviceData.timeUnit) {
              vehicleService.timeUnit = serviceData.timeUnit;
            }
            if (serviceData.specificDate) {
              vehicleService.specificDate = serviceData.specificDate;
            }
            vehicleService.reminderDays = serviceData.reminderDays;
          }
          
          services.push(vehicleService);
        }
      }
      
      // Add services to vehicle
      if (!this.selectedVehicle.services) {
        this.selectedVehicle.services = [];
      }
      
      this.selectedVehicle.services.push(...services);
      
      // Save to database
      await window.db.collection('vehicles').doc(this.selectedVehicle.licensePlate).collection('info').doc('basic').update({
        services: this.selectedVehicle.services
      });
      
      // Close modal
      document.querySelector('.service-type-modal-overlay').remove();
      
      // Refresh vehicle display
      await this.loadDataAndRender();
      
      // Show success message
      const serviceNames = services.map(s => s.name).join(', ');
      this.showNotification(`Pridané servisy: ${serviceNames}`, 'success');
      
    } catch (error) {
      console.error('Error adding selected services:', error);
      alert('Chyba pri pridávaní služieb: ' + error.message);
    }
  }

  // Show service detail modal for adding service polozky
  showServicePolozkaModal() {
    const modal = document.createElement('div');
    modal.className = 'polozka-modal-overlay';
    modal.innerHTML = `
      <div class="polozka-modal">
        <div class="modal-header">
          <h3>Pridať položku servisu</h3>
          <button class="close-btn" onclick="this.closest('.polozka-modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <form id="service-polozka-form">
            <div class="form-group">
              <label for="polozka-name">Názov položky:</label>
              <input type="text" id="polozka-name" required placeholder="Napríklad: Olejový filter">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="this.closest('.polozka-modal-overlay').remove()">Zrušiť</button>
          <button type="button" class="btn-primary" onclick="window.flotilaManager.addServicePolozka()">Pridať položku</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus on first input
    setTimeout(() => {
      const firstInput = modal.querySelector('#polozka-name');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  // Add service detail to the list
  addServicePolozka() {
    const modal = document.querySelector('.polozka-modal-overlay');
    const name = document.getElementById('polozka-name').value.trim();
    
    if (!name) {
      alert('Prosím vyplňte názov položky.');
      return;
    }
    
    // Add to service polozky list
    const polozkyList = document.getElementById('service-polozky-list');
    const noDetails = polozkyList.querySelector('.no-polozky');
    
    if (noDetails) {
      noDetails.remove();
    }
    
    const detailId = 'detail_' + Date.now();
    const detailElement = document.createElement('div');
    detailElement.className = 'service-polozka-item';
    detailElement.innerHTML = `
      <div class="polozka-header">
        <span class="polozka-name">${name}</span>
        <button type="button" class="remove-polozka-btn" onclick="window.flotilaManager.removeServicePolozka('${detailId}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
    detailElement.id = detailId;
    
    polozkyList.appendChild(detailElement);
    
    // Close modal
    modal.remove();
  }

  // Remove service detail from the list
  removeServicePolozka(detailId) {
    const detailElement = document.getElementById(detailId);
    if (detailElement) {
      detailElement.remove();
      
      // Show "no polozky" message if list is empty
      const polozkyList = document.getElementById('service-polozky-list');
      if (polozkyList.children.length === 0) {
        polozkyList.innerHTML = '<div class="no-polozky">Žiadne položky neboli pridané</div>';
      }
    }
  }

  // Get current service polozky from the modal
  getCurrentServicePolozky() {
    const polozkyList = document.getElementById('service-polozky-list');
    const polozky = [];
    
    const detailItems = polozkyList.querySelectorAll('.service-polozka-item');
    detailItems.forEach(item => {
      const nameElement = item.querySelector('.polozka-name');
      
      if (nameElement) {
        const name = nameElement.textContent.trim();
        polozky.push(name);
      }
    });
    
    return polozky;
  }

  // Show predefined service modal
  async showPredefinedServiceModal(serviceId = null) {
    const isEditing = serviceId !== null;
    let serviceData = null;
    
    // Load existing service data if editing
    if (isEditing) {
      try {
        const doc = await window.db.collection('predefined_services').doc(serviceId).get();
        if (doc.exists) {
          serviceData = { id: doc.id, ...doc.data() };
        }
      } catch (error) {
        console.error('Error loading service data:', error);
        alert('Chyba pri načítavaní dát servisu');
        return;
      }
    }
    
    const modal = document.createElement('div');
    modal.className = 'service-type-modal-overlay';
    modal.innerHTML = `
      <div class="service-type-modal">
        <div class="modal-header">
          <div class="modal-header-content">
            <div class="modal-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14,2 14,8 20,8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10,9 9,9 8,9"></polyline>
              </svg>
            </div>
            <div class="modal-title">
              <h3>${isEditing ? 'Upraviť preddefinovaný servis' : 'Pridať preddefinovaný servis'}</h3>
              <p>${isEditing ? 'Upravte nastavenia preddefinovaného servisu' : 'Vytvorte nový preddefinovaný servis pre všetky vozidlá'}</p>
            </div>
          </div>
          <button class="close-btn" onclick="this.closest('.service-type-modal-overlay').remove()">×</button>
        </div>
        
        <div class="modal-body">
          <form id="predefined-service-form">
            <div class="form-section">
              <div class="section-header">
                <h4>Názov servisu</h4>
                <div class="section-line"></div>
              </div>
              
              <div class="form-group">
                <div class="input-with-dropdown">
                  <input type="text" id="predefined-service-name" value="${serviceData?.name || ''}" required="" placeholder="Zadajte názov servisu alebo vyberte z predvolených">
                  <button type="button" class="dropdown-btn" onclick="window.flotilaManager.toggleServiceDropdown()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="6,9 12,15 18,9"></polyline>
                    </svg>
                  </button>
                  <div class="dropdown-menu" id="service-dropdown" style="display: none;">
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Výmena oleja v motore')">Výmena oleja v motore</div>
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Výmena filtrov')">Výmena filtrov</div>
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Kontrola bŕzd')">Kontrola bŕzd</div>
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Kontrola klimatizácie')">Kontrola klimatizácie</div>
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Kontrola oleja')">Kontrola oleja</div>
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Kontrola pneumatík')">Kontrola pneumatík</div>
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Výmena sviečok')">Výmena sviečok</div>
                    <div class="dropdown-item" onclick="window.flotilaManager.selectServiceName('Kontrola chladiča')">Kontrola chladiča</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="form-section">
              <div class="section-header">
                <h4>Typ intervalu</h4>
                <div class="section-line"></div>
              </div>
              
              <div class="interval-type-selector">
                <div class="interval-option" data-type="km">
                  <div class="option-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                      <path d="M2 17l10 5 10-5"></path>
                      <path d="M2 12l10 5 10-5"></path>
                    </svg>
                  </div>
                  <div class="option-content">
                    <h5>Kilometre</h5>
                    <p>Podľa najazdených kilometrov</p>
                  </div>
                  <div class="option-radio">
                    <input type="radio" name="predefined-interval-type" value="km" ${serviceData?.type === 'km' ? 'checked' : ''}>
                  </div>
                </div>
                
                <div class="interval-option" data-type="time">
                  <div class="option-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12,6 12,12 16,14"></polyline>
                    </svg>
                  </div>
                  <div class="option-content">
                    <h5>Čas</h5>
                    <p>Podľa uplynutého času</p>
                  </div>
                  <div class="option-radio">
                    <input type="radio" name="predefined-interval-type" value="time" ${serviceData?.type === 'date' && serviceData?.timeUnit ? 'checked' : ''}>
                  </div>
                </div>
                
                <div class="interval-option" data-type="specific-date">
                  <div class="option-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                  </div>
                  <div class="option-content">
                    <h5>Špecifický dátum</h5>
                    <p>Na konkrétny dátum</p>
                  </div>
                  <div class="option-radio">
                    <input type="radio" name="predefined-interval-type" value="specific-date" ${serviceData?.type === 'date' && serviceData?.specificDate ? 'checked' : ''}>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="form-section" id="predefined-interval-polozky-section">
              <div class="section-header">
                <h4>Nastavenie intervalu</h4>
                <div class="section-line"></div>
              </div>
              
              <div class="interval-polozky" id="predefined-km-polozky" style="display: ${serviceData?.type === 'km' ? 'block' : 'none'};">
                <div class="form-group">
                  <label for="predefined-service-interval-km">Interval (km):</label>
                  <input type="number" id="predefined-service-interval-km" value="${serviceData?.interval || ''}" placeholder="Napríklad: 50000">
                </div>
                <div class="form-group">
                  <label for="predefined-service-reminder-km">Upozornenie (km):</label>
                  <input type="number" id="predefined-service-reminder-km" value="${serviceData?.reminderKm || '15000'}" placeholder="Napríklad: 15000">
                </div>
              </div>
              
              <div class="interval-polozky" id="predefined-time-polozky" style="display: ${serviceData?.type === 'date' && serviceData?.timeUnit ? 'block' : 'none'};">
                <div class="form-group">
                  <label for="predefined-service-interval-time">Interval:</label>
                  <div class="time-input-group">
                    <input type="number" id="predefined-service-interval-time" value="${serviceData?.interval || ''}" placeholder="Napríklad: 6">
                    <select id="predefined-time-unit">
                      <option value="days" ${serviceData?.timeUnit === 'days' ? 'selected' : ''}>Dní</option>
                      <option value="months" ${serviceData?.timeUnit === 'months' ? 'selected' : ''}>Mesiacov</option>
                      <option value="years" ${serviceData?.timeUnit === 'years' ? 'selected' : ''}>Rokov</option>
                    </select>
                  </div>
                </div>
                <div class="form-group">
                  <label for="predefined-service-reminder-time">Upozornenie:</label>
                  <div class="time-input-group">
                    <input type="number" id="predefined-service-reminder-time" value="${serviceData?.reminderDays || '30'}" placeholder="Napríklad: 30">
                    <select id="predefined-reminder-time-unit">
                      <option value="days">Dní</option>
                      <option value="weeks">Týždňov</option>
                      <option value="months">Mesiacov</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div class="interval-polozky" id="predefined-specific-date-polozky" style="display: ${serviceData?.type === 'date' && serviceData?.specificDate ? 'block' : 'none'};">
                <div class="form-group">
                  <label for="predefined-service-specific-date">Dátum:</label>
                  <input type="date" id="predefined-service-specific-date" value="${serviceData?.specificDate || ''}">
                </div>
                <div class="form-group">
                  <label for="predefined-service-reminder-days">Upozornenie (dni):</label>
                  <input type="number" id="predefined-service-reminder-days" value="${serviceData?.reminderDays || '30'}" placeholder="Napríklad: 30">
                </div>
              </div>
            </div>
            
            <div class="form-section" id="predefined-service-polozky-section">
              <div class="section-header">
                <h4>Položky servisu</h4>
                <div class="section-line"></div>
              </div>
              
              <div class="service-polozky-form">
                <div class="service-polozky-list" id="predefined-service-polozky-list">
                  <div class="no-polozky">Žiadne položky neboli pridané</div>
                </div>
                
                <div class="add-polozka-section">
                  <button type="button" class="btn-add-polozka" onclick="window.flotilaManager.showPredefinedServicePolozkaModal()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Pridať položku
                  </button>
                </div>
                
                <div class="form-group">
                  <label for="predefined-service-notes">Poznámky k servisu:</label>
                  <textarea id="predefined-service-notes" placeholder="Pridajte poznámky k servisu...">${serviceData?.notes || ''}</textarea>
                </div>
              </div>
            </div>
            
            <div class="form-actions">
              <button type="button" class="btn-secondary" onclick="this.closest('.service-type-modal-overlay').remove()">Zrušiť</button>
              ${isEditing ? `
                <button type="button" class="btn-danger" onclick="window.flotilaManager.deletePredefinedService('${serviceId}'); this.closest('.service-type-modal-overlay').remove();">Vymazať</button>
              ` : ''}
              <button type="submit" class="btn-primary">${isEditing ? 'Uložiť zmeny' : 'Vytvoriť preddefinovaný servis'}</button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle form submission
    const form = modal.querySelector('#predefined-service-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handlePredefinedServiceSubmit(serviceId);
    });
    
    // Handle interval type selection
    const intervalOptions = modal.querySelectorAll('.interval-option');
    const intervalDetailsSection = modal.querySelector('#predefined-interval-polozky-section');
    
    intervalOptions.forEach(option => {
      option.addEventListener('click', () => {
        // Update radio button
        const radio = option.querySelector('input[type="radio"]');
        radio.checked = true;
        
        // Update visual selection
        intervalOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        
        // Show/hide interval polozky
        const type = option.dataset.type;
        this.showPredefinedIntervalDetails(type);
      });
    });
    
    // Initialize selection
    const selectedOption = modal.querySelector('.interval-option input[type="radio"]:checked');
    if (selectedOption) {
      selectedOption.closest('.interval-option').classList.add('selected');
    }
    
    // Populate service polozky if editing
    if (isEditing && serviceData?.servicePolozky) {
      const polozkyList = modal.querySelector('#predefined-service-polozky-list');
      const noDetails = polozkyList.querySelector('.no-polozky');
      
      if (noDetails) {
        noDetails.remove();
      }
      
      // Add existing service polozky
      serviceData.servicePolozky.forEach((detail, index) => {
        const detailId = 'predefined_detail_' + Date.now() + '_' + index;
        const detailElement = document.createElement('div');
        detailElement.className = 'service-polozka-item';
        detailElement.innerHTML = `
          <div class="polozka-header">
            <span class="polozka-name">${detail}</span>
            <button type="button" class="remove-polozka-btn" onclick="window.flotilaManager.removePredefinedServicePolozka('${detailId}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        `;
        detailElement.id = detailId;
        polozkyList.appendChild(detailElement);
      });
    }
    
    // Focus on first input
    setTimeout(() => {
      const firstInput = modal.querySelector('#predefined-service-name');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  // Show predefined interval polozky based on type
  showPredefinedIntervalDetails(type) {
    const kmDetails = document.getElementById('predefined-km-polozky');
    const timeDetails = document.getElementById('predefined-time-polozky');
    const specificDateDetails = document.getElementById('predefined-specific-date-polozky');
    
    // Hide all polozky first
    if (kmDetails) kmDetails.style.display = 'none';
    if (timeDetails) timeDetails.style.display = 'none';
    if (specificDateDetails) specificDateDetails.style.display = 'none';
    
    // Show the selected type
    switch (type) {
      case 'km':
        if (kmDetails) kmDetails.style.display = 'block';
        break;
      case 'time':
        if (timeDetails) timeDetails.style.display = 'block';
        break;
      case 'specific-date':
        if (specificDateDetails) specificDateDetails.style.display = 'block';
        break;
    }
  }

  // Show predefined service detail modal
  showPredefinedServicePolozkaModal() {
    const modal = document.createElement('div');
    modal.className = 'polozka-modal-overlay';
    modal.innerHTML = `
      <div class="polozka-modal">
        <div class="modal-header">
          <h3>Pridať položku servisu</h3>
          <button class="close-btn" onclick="this.closest('.polozka-modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <form id="predefined-service-polozka-form">
            <div class="form-group">
              <label for="predefined-polozka-name">Názov položky:</label>
              <input type="text" id="predefined-polozka-name" required placeholder="Napríklad: Olejový filter">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="this.closest('.polozka-modal-overlay').remove()">Zrušiť</button>
          <button type="button" class="btn-primary" onclick="window.flotilaManager.addPredefinedServicePolozka()">Pridať položku</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus on first input
    setTimeout(() => {
      const firstInput = modal.querySelector('#predefined-polozka-name');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  // Add predefined service detail to the list
  addPredefinedServicePolozka() {
    const modal = document.querySelector('.polozka-modal-overlay');
    const name = document.getElementById('predefined-polozka-name').value.trim();
    
    if (!name) {
      alert('Prosím vyplňte názov položky.');
      return;
    }
    
    // Add to service polozky list
    const polozkyList = document.getElementById('predefined-service-polozky-list');
    const noDetails = polozkyList.querySelector('.no-polozky');
    
    if (noDetails) {
      noDetails.remove();
    }
    
    const detailId = 'predefined_detail_' + Date.now();
    const detailElement = document.createElement('div');
    detailElement.className = 'service-polozka-item';
    detailElement.innerHTML = `
      <div class="polozka-header">
        <span class="polozka-name">${name}</span>
        <button type="button" class="remove-polozka-btn" onclick="window.flotilaManager.removePredefinedServicePolozka('${detailId}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
    detailElement.id = detailId;
    
    polozkyList.appendChild(detailElement);
    
    // Close modal
    modal.remove();
  }

  // Remove predefined service detail from the list
  removePredefinedServicePolozka(detailId) {
    const detailElement = document.getElementById(detailId);
    if (detailElement) {
      detailElement.remove();
      
      // Show "no polozky" message if list is empty
      const polozkyList = document.getElementById('predefined-service-polozky-list');
      if (polozkyList.children.length === 0) {
        polozkyList.innerHTML = '<div class="no-polozky">Žiadne položky neboli pridané</div>';
      }
    }
  }

  // Get current predefined service polozky from the modal
  getCurrentPredefinedServicePolozky() {
    const polozkyList = document.getElementById('predefined-service-polozky-list');
    const polozky = [];
    
    const detailItems = polozkyList.querySelectorAll('.service-polozka-item');
    detailItems.forEach(item => {
      const nameElement = item.querySelector('.polozka-name');
      
      if (nameElement) {
        const name = nameElement.textContent.trim();
        polozky.push(name);
      }
    });
    
    return polozky;
  }

  // Handle predefined service form submission
  async handlePredefinedServiceSubmit(serviceId = null) {
    const modal = document.querySelector('.service-type-modal-overlay');
    const name = document.getElementById('predefined-service-name').value.trim();
    const selectedType = modal.querySelector('input[name="predefined-interval-type"]:checked');
    const type = selectedType ? selectedType.value : '';
    
    if (!name || !type) {
      alert('Prosím vyplňte názov servisu a vyberte typ intervalu.');
      return;
    }
    
    const serviceData = {
      name,
      type
    };
    
    // Handle different interval types
    switch (type) {
      case 'km':
        const intervalKm = document.getElementById('predefined-service-interval-km').value;
        const reminderKm = document.getElementById('predefined-service-reminder-km').value;
        
        if (!intervalKm) {
          alert('Prosím vyplňte interval v kilometroch.');
          return;
        }
        
        serviceData.interval = parseInt(intervalKm);
        if (reminderKm) {
          serviceData.reminderKm = parseInt(reminderKm);
        }
        break;
        
      case 'time':
        const intervalTime = document.getElementById('predefined-service-interval-time').value;
        const timeUnit = document.getElementById('predefined-time-unit').value;
        const reminderTime = document.getElementById('predefined-service-reminder-time').value;
        const reminderTimeUnit = document.getElementById('predefined-reminder-time-unit').value;
        
        if (!intervalTime) {
          alert('Prosím vyplňte časový interval.');
          return;
        }
        
        serviceData.interval = parseInt(intervalTime);
        serviceData.timeUnit = timeUnit;
        serviceData.type = 'date'; // Convert to date for compatibility
        
        // Convert time units to days for reminder
        if (reminderTime) {
          let reminderDays = parseInt(reminderTime);
          if (reminderTimeUnit === 'weeks') reminderDays *= 7;
          if (reminderTimeUnit === 'months') reminderDays *= 30;
          serviceData.reminderDays = reminderDays;
        }
        break;
        
      case 'specific-date':
        const specificDate = document.getElementById('predefined-service-specific-date').value;
        const reminderDays = document.getElementById('predefined-service-reminder-days').value;
        
        if (!specificDate) {
          alert('Prosím vyberte dátum.');
          return;
        }
        
        serviceData.specificDate = specificDate;
        serviceData.type = 'date'; // Convert to date for compatibility
        if (reminderDays) {
          serviceData.reminderDays = parseInt(reminderDays);
        }
        break;
    }
    
    // Add service notes
    const notes = document.getElementById('predefined-service-notes')?.value;
    if (notes) {
      serviceData.notes = notes;
    }

    // Add service polozky
    const servicePolozky = this.getCurrentPredefinedServicePolozky();
    if (Object.keys(servicePolozky).length > 0) {
      serviceData.servicePolozky = servicePolozky;
    }

    try {
      if (serviceId) {
        // Update existing service
        await window.db.collection('predefined_services').doc(serviceId).update(serviceData);
        this.showNotification('Preddefinovaný servis bol aktualizovaný', 'success');
      } else {
        // Create new service
        serviceData.createdAt = new Date();
        await window.db.collection('predefined_services').add(serviceData);
        this.showNotification('Preddefinovaný servis bol vytvorený', 'success');
      }
      
      // Close modal
      modal.remove();
      
      // Refresh predefined services list
      this.refreshPredefinedServicesList();
      
    } catch (error) {
      console.error('Error saving predefined service:', error);
      alert('Chyba pri ukladaní preddefinovaného servisu: ' + error.message);
    }
  }

  // Delete predefined service
  async deletePredefinedService(serviceId) {
    if (!confirm('Naozaj chcete vymazať tento preddefinovaný servis?')) {
      return;
    }
    
    try {
      await window.db.collection('predefined_services').doc(serviceId).delete();
      this.showNotification('Preddefinovaný servis bol vymazaný', 'success');
      this.refreshPredefinedServicesList();
    } catch (error) {
      console.error('Error deleting predefined service:', error);
      alert('Chyba pri mazaní preddefinovaného servisu: ' + error.message);
    }
  }

  // Refresh predefined services list
  async refreshPredefinedServicesList() {
    const rowsContainer = document.querySelector('#predef-services-rows');
    if (!rowsContainer) return;
    
    try {
      const snapshot = await window.db.collection('predefined_services').orderBy('name').get();
      const rows = snapshot.docs.map(doc => {
        const s = { id: doc.id, ...doc.data() };
        const polozkyCount = s.servicePolozky ? s.servicePolozky.length : 0;
        return `
          <div class="service-row">
            <div style="flex:2;">${s.name}</div>
            <div style="flex:1;">
              ${s.type === 'specificDate'
                ? this.formatDateSk(s.specificDate || s.interval)
                : (s.type === 'km'
                    ? `${this.formatNumberWithSpaces(s.interval)} km`
                    : `${s.interval} ${this.getUnitForm(s.interval, s.timeUnit || 'days')}`)}
            </div>
            <div style="flex:1;">${s.type === 'specificDate' ? 'Dátum' : (s.type === 'km' ? 'Km' : 'Čas')}</div>
            <div style="flex:1;">${polozkyCount} polož${polozkyCount !== 1 ? 'iek' : 'ka'}</div>
            <div style="width:120px; display:flex; gap:6px;">
              <button onclick="window.flotilaManager.showPredefinedServiceModal('${s.id}')" style="padding:4px 8px; background:#3b82f6; color:white; border:none; border-radius:4px; cursor:pointer; font-size:0.75rem;">Upraviť</button>
              <button data-del="${s.id}" class="delete-btn">Zmazať</button>
            </div>
          </div>`;
      }).join('');
      
      rowsContainer.innerHTML = rows || '<div style="padding:12px; color:#6b7280;">Zatiaľ žiadne položky</div>';
      
      // Add delete event listeners
      rowsContainer.querySelectorAll('button[data-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-del');
          await this.deletePredefinedService(id);
        });
      });
      
    } catch (error) {
      console.error('Error loading predefined services:', error);
      rowsContainer.innerHTML = '<div style="padding:12px; color:#ef4444;">Chyba pri načítavaní služieb</div>';
    }
  }

  // Handle service type form submission
  async handleServiceTypeSubmit(serviceIndex = null) {
    const modal = document.querySelector('.service-type-modal-overlay');
    const name = document.getElementById('service-type-name').value.trim();
    const selectedType = modal.querySelector('input[name="interval-type"]:checked');
    const type = selectedType ? selectedType.value : '';
    
    if (!name || !type) {
      alert('Prosím vyplňte názov servisu a vyberte typ intervalu.');
      return;
    }
    
    const serviceData = {
      name,
      type
    };
    
    // Handle different interval types
    switch (type) {
      case 'km':
        const intervalKm = document.getElementById('service-interval-km').value;
        const reminderKm = document.getElementById('service-reminder-km').value;
        
        if (!intervalKm) {
          alert('Prosím vyplňte interval v kilometroch.');
          return;
        }
        
        serviceData.interval = parseInt(intervalKm);
        if (reminderKm) {
          serviceData.reminderKm = parseInt(reminderKm);
        }
        break;
        
      case 'time':
        const intervalTime = document.getElementById('service-interval-time').value;
        const timeUnit = document.getElementById('time-unit').value;
        const reminderTime = document.getElementById('service-reminder-time').value;
        const reminderTimeUnit = document.getElementById('reminder-time-unit').value;
        
        if (!intervalTime) {
          alert('Prosím vyplňte časový interval.');
          return;
        }
        
        serviceData.interval = parseInt(intervalTime);
        serviceData.timeUnit = timeUnit;
        serviceData.type = 'date'; // Convert to date for compatibility
        
        // Convert time units to days for reminder
        if (reminderTime) {
          let reminderDays = parseInt(reminderTime);
          if (reminderTimeUnit === 'weeks') reminderDays *= 7;
          if (reminderTimeUnit === 'months') reminderDays *= 30;
          serviceData.reminderDays = reminderDays;
        }
        break;
        
      case 'specific-date':
        const specificDate = document.getElementById('service-specific-date').value;
        const reminderDays = document.getElementById('service-reminder-days').value;
        
        if (!specificDate) {
          alert('Prosím vyberte dátum.');
          return;
        }
        
        serviceData.specificDate = specificDate;
        serviceData.type = 'date'; // Convert to date for compatibility
        if (reminderDays) {
          serviceData.reminderDays = parseInt(reminderDays);
        }
        break;
    }
    
    // Add service notes
    const notes = document.getElementById('service-notes')?.value;
    if (notes) {
      serviceData.notes = notes;
    }

    // Add service polozky
    const servicePolozky = this.getCurrentServicePolozky();
    if (Object.keys(servicePolozky).length > 0) {
      // Convert to simple key-value format for storage
      const simpleDetails = {};
      Object.keys(servicePolozky).forEach(key => {
        const detail = servicePolozky[key];
        if (typeof detail === 'object') {
          simpleDetails[key] = detail.value;
        } else {
          simpleDetails[key] = detail;
        }
      });
      serviceData.servicePolozky = simpleDetails;
    }

    // Only add lastService for new services
    if (serviceIndex === null) {
      serviceData.lastService = {
        date: new Date(),
        km: this.selectedVehicle.currentKm || this.selectedVehicle.kilometers || 0
      };
    }
    
    if (serviceIndex !== null) {
      // Editing existing service
      await this.updateService(serviceIndex, serviceData);
    } else {
      // Adding new service
      await this.addService(serviceData);
    }
    
    // Close modal
    modal.remove();
  }

  // Add new service
  async addService(serviceData) {
    if (!this.selectedVehicle.services) {
      this.selectedVehicle.services = [];
    }
    
    this.selectedVehicle.services.push(serviceData);
    
    // Save to database first
    await this.saveServices();
    
    // Update the selectedVehicle reference to ensure consistency
    this.selectedVehicle = { ...this.selectedVehicle };
    
    // Update services UI without reloading from database
    this.updateServicesUI();
    
    this.showNotification('Servis bol úspešne pridaný!', 'success');
  }

  // Update existing service
  async updateService(serviceIndex, serviceData) {
    if (this.selectedVehicle.services && this.selectedVehicle.services[serviceIndex]) {
      // Preserve existing lastService data
      const existingService = this.selectedVehicle.services[serviceIndex];
      const updatedService = {
        ...existingService,
        ...serviceData,
        lastService: existingService.lastService || serviceData.lastService
      };
      
      this.selectedVehicle.services[serviceIndex] = updatedService;
      
      // Save to database first
      await this.saveServices();
      
      // Update the selectedVehicle reference to ensure consistency
      this.selectedVehicle = { ...this.selectedVehicle };
      
      // Update services UI without reloading from database
      this.updateServicesUI();
      
      this.showNotification('Servis bol úspešne upravený!', 'success');
    }
  }

  // Delete service
  async deleteService(serviceIndex) {
    if (confirm('Naozaj chcete vymazať tento servis?')) {
      if (this.selectedVehicle.services) {
        this.selectedVehicle.services.splice(serviceIndex, 1);
        
        // Save to database first
        await this.saveServices();
        
        // Update services UI without reloading from database
        this.updateServicesUI();
        
        this.showNotification('Servis bol úspešne vymazaný!', 'success');
      }
    }
  }

  // Remove service (alias for deleteService)
  async removeService(serviceIndex) {
    await this.deleteService(serviceIndex);
    // Close any open modals
    const modal = document.querySelector('.service-type-modal-overlay');
    if (modal) {
      modal.remove();
    }
  }

  // Clean undefined values from service data
  cleanServiceData(services) {
    return services.map(service => {
      const cleaned = {};
      Object.keys(service).forEach(key => {
        if (service[key] !== undefined) {
          cleaned[key] = service[key];
        }
      });
      return cleaned;
    });
  }

  // Toggle service dropdown
  toggleServiceDropdown() {
    const dropdown = document.getElementById('service-dropdown');
    if (dropdown) {
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
  }

  // Select service name from dropdown
  selectServiceName(name) {
    const input = document.getElementById('service-type-name');
    if (input) {
      input.value = name;
      this.toggleServiceDropdown();
    }
  }


  // Update work item name
  async updateWorkItemName(itemId, name) {
    const workItem = this.selectedVehicle.activeWorkSession.items.find(item => item.id === itemId);
    if (workItem) {
      workItem.name = name;
      await this.saveWorkSession();
      this.updateWorkSessionUI();
    }
  }



  // Render service polozky list for service creation/editing
  renderServiceDetailsList(servicePolozky) {
    const detailKeys = Object.keys(servicePolozky);
    
    if (detailKeys.length === 0) {
      return '<div class="no-polozky">Žiadne položky neboli pridané</div>';
    }
    
    return detailKeys.map(key => {
      const detail = servicePolozky[key];
      const label = typeof detail === 'object' ? detail.label : key;
      const value = typeof detail === 'object' ? detail.value : detail;
      const fullDetail = value ? `${label}: ${value}` : label;
      
      return `
        <div class="service-polozka-item" id="service-polozka-${key}">
          <div class="input-with-delete">
            <input 
              type="text" 
              id="service-polozka-${key}" 
              value="${fullDetail}"
              placeholder="Napríklad: Typ oleja: 5W-30"
              onchange="window.flotilaManager.updateServiceDetail('${key}', this.value)"
            >
            <button type="button" class="remove-polozka-btn" onclick="window.flotilaManager.removeServicePolozka('${key}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Show service detail modal
  showServicePolozkaModal() {
    const modal = document.createElement('div');
    modal.className = 'polozka-modal-overlay';
    modal.innerHTML = `
      <div class="polozka-modal">
        <div class="modal-header">
          <h3>Pridať položku servisu</h3>
          <button class="close-btn" onclick="this.closest('.polozka-modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="service-polozka-value">Detail:</label>
            <input type="text" id="service-polozka-value" placeholder="Napríklad: Typ oleja: 5W-30, Množstvo: 6.5 l...">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.polozka-modal-overlay').remove()">Zrušiť</button>
          <button class="btn-primary" onclick="window.flotilaManager.addServicePolozka()">Pridať</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  // Add service detail
  addServicePolozka() {
    const valueInput = document.getElementById('service-polozka-value');
    
    if (!valueInput || !valueInput.value.trim()) {
      alert('Prosím vyplňte detail.');
      return;
    }
    
    const detailText = valueInput.value.trim();
    
    // Parse the detail text (format: "Label: Value")
    let label, value;
    if (detailText.includes(':')) {
      const parts = detailText.split(':');
      label = parts[0].trim();
      value = parts.slice(1).join(':').trim();
    } else {
      label = detailText;
      value = '';
    }
    
    // Store the original label for display and use a clean key for storage
    const key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    
    // Get current service polozky
    const polozkyList = document.getElementById('service-polozky-list');
    if (polozkyList) {
      const currentDetails = this.getCurrentServicePolozky();
      currentDetails[key] = {
        label: label,
        value: value
      };
      
      // Update the display
      polozkyList.innerHTML = this.renderServiceDetailsList(currentDetails);
    }
    
    // Close modal
    const modal = document.querySelector('.polozka-modal-overlay');
    if (modal) {
      modal.remove();
    }
  }

  // Remove service detail
  removeServicePolozka(key) {
    const polozkyList = document.getElementById('service-polozky-list');
    if (polozkyList) {
      const currentDetails = this.getCurrentServicePolozky();
      delete currentDetails[key];
      
      // Update the display
      polozkyList.innerHTML = this.renderServiceDetailsList(currentDetails);
    }
  }

  // Update service detail
  updateServiceDetail(key, value) {
    const polozkyList = document.getElementById('service-polozky-list');
    if (polozkyList) {
      const currentDetails = this.getCurrentServicePolozky();
      
      // Parse the full detail text (format: "Label: Value")
      let label, detailValue;
      if (value.includes(':')) {
        const parts = value.split(':');
        label = parts[0].trim();
        detailValue = parts.slice(1).join(':').trim();
      } else {
        label = value;
        detailValue = '';
      }
      
      if (typeof currentDetails[key] === 'object') {
        currentDetails[key].label = label;
        currentDetails[key].value = detailValue;
      } else {
        currentDetails[key] = {
          label: label,
          value: detailValue
        };
      }
    }
  }

  // Get current service polozky from the form
  getCurrentServicePolozky() {
    const polozkyList = document.getElementById('service-polozky-list');
    if (!polozkyList) return {};
    
    const polozky = {};
    const detailInputs = polozkyList.querySelectorAll('input[id^="service-polozka-"]');
    
    detailInputs.forEach(input => {
      const key = input.id.replace('service-polozka-', '');
      const fullDetail = input.value.trim();
      
      // Parse the full detail text (format: "Label: Value")
      let label, value;
      if (fullDetail.includes(':')) {
        const parts = fullDetail.split(':');
        label = parts[0].trim();
        value = parts.slice(1).join(':').trim();
      } else {
        label = fullDetail;
        value = '';
      }
      
      polozky[key] = {
        label: label,
        value: value
      };
    });
    
    return polozky;
  }

  // Show interval polozky based on type
  showIntervalDetails(type) {
    const kmDetails = document.getElementById('km-polozky');
    const timeDetails = document.getElementById('time-polozky');
    const specificDateDetails = document.getElementById('specific-date-polozky');
    
    // Hide all polozky
    if (kmDetails) kmDetails.style.display = 'none';
    if (timeDetails) timeDetails.style.display = 'none';
    if (specificDateDetails) specificDateDetails.style.display = 'none';
    
    // Show selected polozky
    switch (type) {
      case 'km':
        if (kmDetails) kmDetails.style.display = 'block';
        break;
      case 'time':
        if (timeDetails) timeDetails.style.display = 'block';
        break;
      case 'specific-date':
        if (specificDateDetails) specificDateDetails.style.display = 'block';
        break;
    }
  }

  // Save services to database
  async saveServices() {
    if (!this.selectedVehicle) return;
    
    try {
      const cleanedServices = this.cleanServiceData(this.selectedVehicle.services);
      await window.db.collection('vehicles')
        .doc(this.selectedVehicle.licensePlate)
        .collection('info')
        .doc('basic')
        .update({
          services: cleanedServices
        });
    } catch (error) {
      console.error('Error saving services:', error);
      this.showNotification('Chyba pri ukladaní servisov', 'error');
    }
  }

  // Edit service (alias for showServiceTypeModal)
  editService(serviceIndex) {
    this.showServiceTypeModal(serviceIndex);
  }

  // Check if service is in work list
  isServiceInWorkList(serviceName) {
    if (!this.selectedVehicle.activeWorkSession || !this.selectedVehicle.activeWorkSession.items) {
      return false;
    }
    return this.selectedVehicle.activeWorkSession.items.some(item => item.name === serviceName);
  }

  // Toggle service from work list
  async toggleServiceFromWorkList(serviceName, serviceType, serviceInterval, serviceIndex) {
    if (this.isServiceInWorkList(serviceName)) {
      // Remove from work list
      await this.removeFromWorkList(serviceName);
    } else {
      // Add to work list
      await this.addToWorkList(serviceName, serviceType, serviceInterval);
    }
    
    // Update service button state
    this.updateServiceButtonState(serviceName, serviceIndex);
  }

  // Update service button state
  updateServiceButtonState(serviceName, serviceIndex) {
    const button = document.querySelector(`[onclick*="toggleServiceFromWorkList('${serviceName}"]`);
    if (button) {
      const isInWorkList = this.isServiceInWorkList(serviceName);
      button.className = `toggle-work-btn ${isInWorkList ? 'remove' : 'add'}`;
      button.title = isInWorkList ? 'Odobrať z práce' : 'Pridať do práce';
      
      // Update the SVG icon
      const svg = button.querySelector('svg');
      if (svg) {
        svg.innerHTML = isInWorkList ? `
          <line x1="5" y1="12" x2="19" y2="12"></line>
        ` : `
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        `;
      }
    }
  }

  // Remove from work list
  async removeFromWorkList(serviceName) {
    if (!this.selectedVehicle.activeWorkSession || !this.selectedVehicle.activeWorkSession.items) {
      return;
    }
    
    this.selectedVehicle.activeWorkSession.items = this.selectedVehicle.activeWorkSession.items.filter(
      item => item.name !== serviceName
    );
    
    // If no items left, clear the work session
    if (this.selectedVehicle.activeWorkSession.items.length === 0) {
      this.selectedVehicle.activeWorkSession = null;
    }
    
    // Update the selectedVehicle reference to ensure consistency
    this.selectedVehicle = { ...this.selectedVehicle };
    
    // Save to database first
    await this.saveWorkSession();
    
    // Update UI immediately without reloading from database
    this.updateWorkSessionUI();
    
    this.showNotification(`${serviceName} odobrané z práce`, 'success');
  }

  // Save work session to database
  async saveWorkSession() {
    if (!this.selectedVehicle) return;
    
    try {
      await window.db.collection('vehicles')
        .doc(this.selectedVehicle.licensePlate)
        .collection('info')
        .doc('basic')
        .update({
          activeWorkSession: this.selectedVehicle.activeWorkSession
        });
    } catch (error) {
      console.error('Error saving work session:', error);
      this.showNotification('Chyba pri ukladaní pracovnej sessiony', 'error');
    }
  }

  // Save vehicle data to database
  async saveVehicleData() {
    if (!this.selectedVehicle) return;
    
    try {
      const updateData = {};
      
      // Update current kilometers
      if (this.selectedVehicle.currentKm !== undefined) {
        updateData.currentKm = this.selectedVehicle.currentKm;
      }
      
      // Update services if they exist
      if (this.selectedVehicle.services) {
        updateData.services = this.selectedVehicle.services;
      }
      
      // Update history if it exists
      if (this.selectedVehicle.history) {
        updateData.history = this.selectedVehicle.history;
      }
      
      // Save to vehicles collection
      if (Object.keys(updateData).length > 0) {
        await window.db.collection('vehicles')
          .doc(this.selectedVehicle.licensePlate)
          .collection('info')
          .doc('basic')
          .update(updateData);
      }
      
      // Also update vehicles_km collection if kilometers changed
      if (this.selectedVehicle.currentKm !== undefined) {
        const normalizedPlate = this.normalizeLicensePlate(this.selectedVehicle.licensePlate);
        await window.db.collection('vehicles_km').doc(normalizedPlate).set({
          kilometers: this.selectedVehicle.currentKm,
          updatedAt: new Date()
        }, { merge: true });
      }
    } catch (error) {
      console.error('Error saving vehicle data:', error);
      this.showNotification('Chyba pri ukladaní dát vozidla', 'error');
    }
  }

  // Show notification
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  // Toggle work item status (checkbox functionality)
  async toggleWorkItemStatus(itemId) {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    const item = this.selectedVehicle.activeWorkSession.items.find(i => i.id === itemId);
    if (item) {
      item.status = item.status === 'completed' ? 'pending' : 'completed';
      if (item.status === 'completed') {
        item.completedAt = new Date().toISOString();
      } else {
        delete item.completedAt;
      }
      
      // Update the selectedVehicle reference to ensure consistency
      this.selectedVehicle = { ...this.selectedVehicle };
      
      // Save to database first
      await this.saveWorkSession();
      
      // Update UI immediately without reloading from database
      this.updateWorkSessionUI();
      
      this.showNotification(`${item.name} ${item.status === 'completed' ? 'označené ako dokončené' : 'označené ako nedokončené'}`, 'info');
    }
  }

  // Delete work item
  async deleteWorkItem(itemId) {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    const item = this.selectedVehicle.activeWorkSession.items.find(i => i.id === itemId);
    if (item) {
      if (confirm(`Naozaj chcete vymazať úlohu "${item.name}"?`)) {
        this.selectedVehicle.activeWorkSession.items = this.selectedVehicle.activeWorkSession.items.filter(i => i.id !== itemId);
        
        // If no items left, clear the work session
        if (this.selectedVehicle.activeWorkSession.items.length === 0) {
          this.selectedVehicle.activeWorkSession = null;
        }
        
        // Update the selectedVehicle reference to ensure consistency
        this.selectedVehicle = { ...this.selectedVehicle };
        
        // Save to database first
        await this.saveWorkSession();
        
        // Update UI immediately without reloading from database
        this.updateWorkSessionUI();
        
        this.showNotification(`${item.name} vymazané z práce`, 'info');
      }
    }
  }

  // Update work start date
  async updateWorkStartDate(newDate) {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    this.selectedVehicle.activeWorkSession.startedAt = new Date(newDate).toISOString();
    
    // Update the work session completion date to use this date
    this.selectedVehicle.activeWorkSession.completionDate = new Date(newDate).toISOString();
    
    await this.saveWorkSession();
    this.showNotification('Dátum začiatku práce aktualizovaný', 'info');
  }

  // Update work current kilometers
  async updateWorkCurrentKm(newKm) {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    this.selectedVehicle.currentKm = parseInt(newKm) || 0;
    await this.saveVehicleData();
    
    // Update vehicles_km collection with new kilometer data
    try {
      const normalizedPlate = this.normalizeLicensePlate(this.selectedVehicle.licensePlate);
      await window.db.collection('vehicles_km').doc(normalizedPlate).set({
        kilometers: this.selectedVehicle.currentKm,
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error('Error updating vehicles_km collection:', error);
    }
    
    // Update services UI to reflect new current kilometers
    this.updateServicesUI();
    
    this.showNotification('Aktuálne km aktualizované', 'info');
  }

  // Finish job - move completed items to history
  async finishJob() {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    const completedItems = this.selectedVehicle.activeWorkSession.items.filter(item => item.status === 'completed');
    const pendingItems = this.selectedVehicle.activeWorkSession.items.filter(item => item.status !== 'completed');
    
    if (completedItems.length === 0) {
      this.showNotification('Žiadne úlohy nie sú dokončené', 'warning');
      return;
    }
    
    // Create history entry for completed items
    // Use the completion date from work session if available, otherwise use current date
    const completionDate = this.selectedVehicle.activeWorkSession.completionDate || new Date().toISOString();
    
    const historyEntry = {
      id: Date.now(),
      date: completionDate,
      kilometers: this.selectedVehicle.currentKm || 0,
      items: completedItems.map(item => ({
        name: item.name,
        type: item.type,
        value: item.value,
        completedAt: item.completedAt,
        notes: item.notes || '',
        servicePolozky: item.servicePolozky || {},
        polozkyStatus: item.polozkyStatus || {}
      })),
      workSessionId: this.selectedVehicle.activeWorkSession.id
    };
    
    // Add to history
    if (!this.selectedVehicle.history) {
      this.selectedVehicle.history = [];
    }
    this.selectedVehicle.history.push(historyEntry);
    
    // Update services with completion data
    completedItems.forEach(item => {
      this.updateServiceLastService(item.name, completionDate, historyEntry.kilometers);
    });
    
    // Update active work session - keep only pending items
    if (pendingItems.length > 0) {
      this.selectedVehicle.activeWorkSession.items = pendingItems;
    } else {
      // All items completed, clear the work session
      this.selectedVehicle.activeWorkSession = null;
    }
    
    // Update the selectedVehicle reference to ensure consistency
    this.selectedVehicle = { ...this.selectedVehicle };
    
    // Save to database first
    await Promise.all([
      this.saveWorkSession(),
      this.saveVehicleData()
    ]);
    
    // Update UI immediately without reloading from database
    this.updateWorkSessionUI();
    this.updateHistoryUI();
    this.updateServicesUI(); // Update services to show new calculations
    
    this.showNotification(`${completedItems.length} úloh dokončených a uložených do histórie!`, 'success');
  }

  // Update service last service data
  updateServiceLastService(serviceName, date, kilometers) {
    if (!this.selectedVehicle.services) return;
    
    const service = this.selectedVehicle.services.find(s => s.name === serviceName);
    if (service) {
      service.lastService = {
        date: date,
        km: kilometers  // Use 'km' to match the calculation methods
      };
    }
  }

  // Recalculate all services' lastService from history items
  recalculateServicesLastServiceFromHistory() {
    if (!this.selectedVehicle) return;
    const services = this.selectedVehicle.services || [];
    const history = this.selectedVehicle.history || [];

    // Reset lastService for all services
    services.forEach(svc => {
      if (!svc.lastService) svc.lastService = {};
      svc.lastService.date = undefined;
      svc.lastService.km = undefined;
    });

    // Build a map of latest (by date) history per service name
    history.forEach(entry => {
      const entryDate = new Date(entry.date || entry.completedAt);
      const entryKm = entry.kilometers || 0;
      const items = Array.isArray(entry.items) ? entry.items : [];
      items.forEach(item => {
        const svc = services.find(s => s.name === item.name);
        if (!svc) return;
        const prevDateRaw = svc.lastService?.date;
        let prevDate = prevDateRaw ? (prevDateRaw.toDate ? prevDateRaw.toDate() : new Date(prevDateRaw)) : null;
        if (!prevDate || entryDate > prevDate) {
          svc.lastService = { date: entryDate.toISOString(), km: entryKm };
        }
      });
    });
  }

  // Update work session UI without reloading from database
  updateWorkSessionUI() {
    const historiaTab = document.getElementById('historia-tab');
    if (historiaTab) {
      const activeWorkSection = historiaTab.querySelector('.history-section');
      if (activeWorkSection) {
        const activeWorkContent = this.renderActiveWorkSession(this.selectedVehicle.activeWorkSession);
        activeWorkSection.innerHTML = `
          <h3 class="section-title">Aktuálna práca</h3>
          ${activeWorkContent}
        `;
      }
    }
  }

  // Update history UI without reloading from database
  updateHistoryUI() {
    const historiaTab = document.getElementById('historia-tab');
    if (historiaTab) {
      const historySections = historiaTab.querySelectorAll('.history-section');
      if (historySections.length > 1) {
        const completedWorkSection = historySections[1];
        const completedWorkContent = this.renderCompletedWorkSessions();
        completedWorkSection.innerHTML = `
          <h3 class="section-title">História práce</h3>
          <div class="history-search-container">
            <input type="text" id="history-search" placeholder="Hľadať v histórii práce..." oninput="window.flotilaManager.filterHistory(this.value)">
          </div>
          <div class="completed-work-sessions">
            ${completedWorkContent}
          </div>
        `;
      }
    }
  }

  // Toggle work item polozky dropdown
  toggleWorkItemPolozky(itemId) {
    const polozkyPanel = document.getElementById(`work-item-polozky-${itemId}`);
    const toggleButton = document.querySelector(`[onclick*="toggleWorkItemPolozky(${itemId})"]`);
    
    if (polozkyPanel && toggleButton) {
      const isExpanded = polozkyPanel.classList.contains('expanded');
      
      if (isExpanded) {
        polozkyPanel.classList.remove('expanded');
        toggleButton.classList.remove('expanded');
      } else {
        polozkyPanel.classList.add('expanded');
        toggleButton.classList.add('expanded');
      }
    }
  }

  // Toggle completed work item polozky dropdown
  toggleCompletedItemPolozky(itemId) {
    const polozkyPanel = document.getElementById(`completed-item-polozky-${itemId}`);
    const toggleButton = document.querySelector(`[onclick*="toggleCompletedItemPolozky('${itemId}')"]`);
    
    if (polozkyPanel && toggleButton) {
      const isExpanded = polozkyPanel.classList.contains('expanded');
      
      if (isExpanded) {
        polozkyPanel.classList.remove('expanded');
        toggleButton.classList.remove('expanded');
      } else {
        polozkyPanel.classList.add('expanded');
        toggleButton.classList.add('expanded');
      }
    }
  }

  // --- History item edit state helpers ---
  isHistoryItemEditing(entryId, itemIndex) {
    if (!this._historyEditing) return false;
    return this._historyEditing.entryId === entryId && this._historyEditing.itemIndex === itemIndex;
  }

  toggleHistoryItemEdit(entryId, itemIndex) {
    if (this.isHistoryItemEditing(entryId, itemIndex)) {
      this._historyEditing = null;
    } else {
      // Create a deep copy of current values to edit
      const entry = (this.selectedVehicle?.history || []).find(e => e.id === entryId);
      if (!entry) return;
      const item = entry.items?.[itemIndex];
      if (!item) return;
      this._historyEditing = {
        entryId,
        itemIndex,
        draft: {
          name: item.name,
          notes: item.notes || '',
          servicePolozky: item.servicePolozky ? JSON.parse(JSON.stringify(item.servicePolozky)) : {},
          polozkyStatus: item.polozkyStatus ? { ...item.polozkyStatus } : {}
        }
      };
    }
    this.updateHistoryUI();
  }

  updateHistoryItemName(entryId, itemIndex, newName) {
    if (!this.isHistoryItemEditing(entryId, itemIndex) || !this._historyEditing) return;
    this._historyEditing.draft.name = newName;
  }

  updateHistoryItemNote(entryId, itemIndex, newNote) {
    if (!this.isHistoryItemEditing(entryId, itemIndex) || !this._historyEditing) return;
    this._historyEditing.draft.notes = newNote;
  }

  updateHistoryItemDetail(entryId, itemIndex, key, value) {
    if (!this.isHistoryItemEditing(entryId, itemIndex) || !this._historyEditing) return;
    this._historyEditing.draft.servicePolozky[key] = value;
  }

  toggleHistoryItemDetailStatus(entryId, itemIndex, key, checked) {
    if (!this.isHistoryItemEditing(entryId, itemIndex) || !this._historyEditing) return;
    this._historyEditing.draft.polozkyStatus[key] = !!checked;
  }

  async saveHistoryItemEdits(entryId, itemIndex) {
    if (!this.isHistoryItemEditing(entryId, itemIndex) || !this._historyEditing) return;
    if (!this.selectedVehicle || !this.selectedVehicle.history) return;
    const entry = this.selectedVehicle.history.find(e => e.id === entryId);
    if (!entry) return;
    const item = entry.items?.[itemIndex];
    if (!item) return;

    const { draft } = this._historyEditing;
    item.name = draft.name;
    item.notes = draft.notes;
    item.servicePolozky = draft.servicePolozky;
    item.polozkyStatus = draft.polozkyStatus;

    // persist and refresh
    await this.saveVehicleData();
    this.recalculateServicesLastServiceFromHistory();
    this._historyEditing = null;
    this.updateHistoryUI();
    this.updateServicesUI();
    this.showNotification('Úpravy položky uložené', 'success');
  }

  cancelHistoryItemEdits(entryId, itemIndex) {
    if (!this.isHistoryItemEditing(entryId, itemIndex)) return;
    this._historyEditing = null;
    this.updateHistoryUI();
  }

  // Safely escape text for use inside HTML attribute values
  escapeHtmlAttr(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Show modal to edit history entry (date, kilometers)
  showEditHistoryEntryModal(entryId) {
    if (!this.selectedVehicle || !this.selectedVehicle.history) return;
    const entry = this.selectedVehicle.history.find(e => e.id === entryId);
    if (!entry) return;
    const dateForInput = new Date(entry.date || entry.completedAt).toISOString().split('T')[0];
    const kmForInput = entry.kilometers || 0;

    const modal = document.createElement('div');
    modal.className = 'schedule-modal-overlay';
    modal.innerHTML = `
      <div class="schedule-modal">
        <div class="modal-header">
          <h3>Upraviť záznam histórie</h3>
          <button class="close-btn" onclick="this.closest('.schedule-modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Dátum:</label>
            <input type="date" id="edit-history-date" value="${dateForInput}">
          </div>
          <div class="form-group">
            <label>Km:</label>
            <input type="number" id="edit-history-km" value="${kmForInput}" placeholder="Zadajte km">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.schedule-modal-overlay').remove()">Zrušiť</button>
          <button class="btn-primary" onclick="window.flotilaManager.confirmEditHistoryEntry(${entryId})">Uložiť</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Confirm edit of history entry
  async confirmEditHistoryEntry(entryId) {
    if (!this.selectedVehicle || !this.selectedVehicle.history) return;
    const modal = document.querySelector('.schedule-modal-overlay');
    const dateInput = document.getElementById('edit-history-date');
    const kmInput = document.getElementById('edit-history-km');
    if (!dateInput || !kmInput) return;

    const newDateStr = dateInput.value;
    const newKm = parseInt(kmInput.value, 10) || 0;

    const entryIndex = this.selectedVehicle.history.findIndex(e => e.id === entryId);
    if (entryIndex === -1) return;

    this.selectedVehicle.history[entryIndex].date = new Date(newDateStr).toISOString();
    this.selectedVehicle.history[entryIndex].kilometers = newKm;

    // Recalculate lastService fields from updated history
    this.recalculateServicesLastServiceFromHistory();
    await this.saveVehicleData();

    if (modal) modal.remove();
    this.updateHistoryUI();
    this.updateServicesUI();
    this.showNotification('Záznam histórie bol upravený', 'success');
  }

  // Delete whole history entry
  async deleteHistoryEntry(entryId) {
    if (!this.selectedVehicle || !this.selectedVehicle.history) return;
    if (!confirm('Naozaj chcete vymazať celý záznam histórie?')) return;

    this.selectedVehicle.history = (this.selectedVehicle.history || []).filter(e => e.id !== entryId);
    this.recalculateServicesLastServiceFromHistory();
    await this.saveVehicleData();
    this.updateHistoryUI();
    this.updateServicesUI();
    this.showNotification('Záznam histórie bol vymazaný', 'info');
  }

  // Delete a single item from history entry
  async deleteHistoryItem(entryId, itemIndex) {
    if (!this.selectedVehicle || !this.selectedVehicle.history) return;
    const entryIndex = this.selectedVehicle.history.findIndex(e => e.id === entryId);
    if (entryIndex === -1) return;
    const entry = this.selectedVehicle.history[entryIndex];
    if (!entry.items || itemIndex < 0 || itemIndex >= entry.items.length) return;

    if (!confirm('Naozaj chcete odstrániť túto položku z vykonanej práce?')) return;

    entry.items.splice(itemIndex, 1);
    if (entry.items.length === 0) {
      // Remove whole entry if no items remain
      this.selectedVehicle.history.splice(entryIndex, 1);
    } else {
      // Keep back updated entry
      this.selectedVehicle.history[entryIndex] = entry;
    }

    // Recalculate lastService fields from updated history
    this.recalculateServicesLastServiceFromHistory();
    await this.saveVehicleData();
    this.updateHistoryUI();
    this.updateServicesUI();
    this.showNotification('Položka bola odstránená z histórie', 'info');
  }

  // Update work item notes
  async updateWorkItemNotes(itemId, notes) {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    const item = this.selectedVehicle.activeWorkSession.items.find(i => i.id === itemId);
    if (item) {
      item.notes = notes;
      
      // Update the selectedVehicle reference to ensure consistency
      this.selectedVehicle = { ...this.selectedVehicle };
      
      // Save to database
      await this.saveWorkSession();
      
      this.showNotification('Poznámky uložené', 'info');
    }
  }

  // Update work item service detail
  async updateWorkItemServiceDetail(itemId, field, value) {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    const item = this.selectedVehicle.activeWorkSession.items.find(i => i.id === itemId);
    if (item) {
      if (!item.servicePolozky) {
        item.servicePolozky = {};
      }
      item.servicePolozky[field] = value;
      
      // Update the selectedVehicle reference to ensure consistency
      this.selectedVehicle = { ...this.selectedVehicle };
      
      // Save to database
      await this.saveWorkSession();
    }
  }

  // Show modal to add new service detail to work item
  showAddWorkItemDetailModal(itemId) {
    const modal = document.createElement('div');
    modal.className = 'polozka-modal-overlay';
    modal.innerHTML = `
      <div class="polozka-modal">
        <div class="modal-header">
          <h3>Pridať položku servisu</h3>
          <button class="close-btn" onclick="this.closest('.polozka-modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="work-item-detail-label">Názov položky:</label>
            <input type="text" id="work-item-detail-label" placeholder="napr. Typ oleja, Značka pneumatík...">
          </div>
          <div class="form-group">
            <label for="work-item-detail-value">Hodnota:</label>
            <input type="text" id="work-item-detail-value" placeholder="napr. 5W-30, Michelin...">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.polozka-modal-overlay').remove()">Zrušiť</button>
          <button class="btn-primary" onclick="window.flotilaManager.addWorkItemDetail(${itemId})">Pridať</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  // Add new service detail to work item
  async addWorkItemDetail(itemId) {
    const labelInput = document.getElementById('work-item-detail-label');
    const valueInput = document.getElementById('work-item-detail-value');
    
    if (!labelInput || !valueInput || !labelInput.value.trim() || !valueInput.value.trim()) {
      this.showNotification('Prosím vyplňte názov aj hodnotu detailu.', 'warning');
      return;
    }
    
    const label = labelInput.value.trim();
    const value = valueInput.value.trim();
    
    // Create a clean key for storage
    const key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    
    // Add the detail to the work item
    await this.updateWorkItemServiceDetail(itemId, key, value);
    
    // Close modal
    const modal = document.querySelector('.polozka-modal-overlay');
    if (modal) {
      modal.remove();
    }
    
    // Update the UI to show the new detail
    this.updateWorkSessionUI();
    
    this.showNotification('Detail pridaný', 'success');
  }

  // Render work item service polozky
  renderWorkItemServicePolozky(item) {
    // Get existing service polozky
    const servicePolozky = item.servicePolozky || {};
    const polozkyStatus = item.polozkyStatus || {}; // Track completion status
    const detailKeys = Object.keys(servicePolozky);
    
    // Generate HTML for existing detail fields
    const detailFields = detailKeys.map(key => {
      const isCompleted = polozkyStatus[key] === true;
      return `
        <div class="work-item-service-polozka ${isCompleted ? 'completed' : ''}" id="detail-${item.id}-${key}">
          <input 
            type="text" 
            id="${key}-${item.id}" 
            value="${servicePolozky[key]}"
            placeholder="Zadajte hodnotu..."
            onchange="window.flotilaManager.updateWorkItemServiceDetail(${item.id}, '${key}', this.value)"
          >
          <div class="polozka-checkbox">
            <input 
              type="checkbox" 
              id="polozka-${item.id}-${key}" 
              ${isCompleted ? 'checked' : ''} 
              onchange="window.flotilaManager.togglePolozkaStatus(${item.id}, '${key}', this.checked)"
            >
            <label for="polozka-${item.id}-${key}"></label>
          </div>
        </div>
      `;
    }).join('');
    
    return `
      <div class="work-item-service-polozky" id="service-polozky-${item.id}">
        ${detailFields}
        <div class="add-service-polozka">
          <button type="button" class="btn-add-polozka" onclick="window.flotilaManager.showAddWorkItemDetailModal(${item.id})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Pridať položku
          </button>
        </div>
      </div>
    `;
  }

  // Toggle polozka completion status
  togglePolozkaStatus(itemId, polozkaKey, isCompleted) {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    const item = this.selectedVehicle.activeWorkSession.items.find(i => i.id === itemId);
    if (!item) return;
    
    // Initialize polozkyStatus if it doesn't exist
    if (!item.polozkyStatus) {
      item.polozkyStatus = {};
    }
    
    // Update the status
    item.polozkyStatus[polozkaKey] = isCompleted;
    
    // Update the visual state
    const polozkaElement = document.getElementById(`detail-${itemId}-${polozkaKey}`);
    if (polozkaElement) {
      if (isCompleted) {
        polozkaElement.classList.add('completed');
      } else {
        polozkaElement.classList.remove('completed');
      }
    }
    
    // Save to database
    this.saveVehicleData();
  }

  // Update services UI without reloading from database
  updateServicesUI() {
    const servisTab = document.getElementById('servis-tab');
    if (servisTab) {
      const servicesSection = servisTab.querySelector('#services-section');
      if (servicesSection) {
        const servicesContent = this.renderServiceTypes(this.selectedVehicle.services || []);
        servicesSection.innerHTML = servicesContent;
      }
    }
  }

  // Show settings modal with tabs (Pairing, Add Vehicle, Predefined Services)
  showSettings() {
    // Close any existing modal first
    const existingModal = document.querySelector('.settings-modal-overlay');
    if (existingModal) {
      existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'settings-modal-overlay';
    modal.innerHTML = `
      <div class="settings-modal">
        <div class="modal-header">
          <div class="modal-header-content">
            <div class="modal-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </div>
            <div class="modal-title">
              <h3>Nastavenia</h3>
              <p>Správa párovania, vozidiel a typov servisov</p>
            </div>
          </div>
          <button class="close-btn" onclick="this.closest('.settings-modal-overlay').remove()">×</button>
        </div>

        <div class="modal-tabs">
          <button class="tab-btn active" data-tab="pairing">Párovanie</button>
          <button class="tab-btn" data-tab="add-vehicle">Pridať vozidlo</button>
          <button class="tab-btn" data-tab="predefined-services">Preddefinované servisy</button>
        </div>

        <div class="modal-body">
          <div class="tab-panel" data-panel="pairing">
            <div class="drag-drop-container">
              <div class="trucks-section">
                <h4>Nákladné autá</h4>
                <div class="trucks-list" id="trucks-list">
                  ${this.renderTrucksForDragDrop()}
                </div>
              </div>
              <div class="trailers-section">
                <h4>Prívesy</h4>
                <div class="trailers-list" id="trailers-list">
                  ${this.renderTrailersForDragDrop()}
                </div>
              </div>
            </div>
          </div>

          <div class="tab-panel" data-panel="add-vehicle" style="display:none;">
            <form id="add-vehicle-form">
              <div class="vehicle-type-group">
                <label>
                  <input type="radio" name="vehicleType" value="truck" checked> Truck
                </label>
                <label>
                  <input type="radio" name="vehicleType" value="trailer"> Trailer
                </label>
              </div>
              <div class="form-group">
                <label>SPZ</label>
                <input required name="licensePlate" placeholder="Zadajte SPZ" />
              </div>
              <div class="form-group">
                <label>VIN</label>
                <input name="vin" placeholder="Zadajte VIN" />
              </div>
              <div class="form-group">
                <label>Značka</label>
                <input name="brand" placeholder="Značka" />
              </div>
              <div class="form-group">
                <label>Model</label>
                <input name="model" placeholder="Model" />
              </div>
              <div class="form-group">
                <label>Typ</label>
                <input name="type" placeholder="Typ (napr. ťahač, náves)" />
              </div>
              <div class="form-group">
                <label>Km</label>
                <input name="kilometers" type="number" placeholder="0" />
              </div>
              <div class="form-actions">
                <button type="button" id="cancel-add-vehicle">Zrušiť</button>
                <button type="submit" class="primary">Pridať vozidlo</button>
              </div>
            </form>
          </div>

          <div class="tab-panel" data-panel="predefined-services" style="display:none;">
            <div class="predefined-services-management">
              
              <div class="add-predefined-service-section">
                <button class="add-predefined-service-btn" onclick="window.flotilaManager.showPredefinedServiceModal()">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Pridať preddefinovaný servis
                </button>
                </div>

              <div id="predef-services-list">
                <div class="header-row">
                  <div style="flex:2;">Názov</div>
                  <div style="flex:1;">Interval</div>
                  <div style="flex:1;">Typ</div>
                  <div style="flex:1;">Detaily</div>
                  <div style="width:120px;">Akcie</div>
                </div>
                <div id="predef-services-rows"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Allow closing by clicking the dimmed overlay (outside the modal) or pressing ESC
    const closeModal = () => {
      modal.remove();
      document.removeEventListener('keydown', onKeyDown);
    };
    
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    
    document.addEventListener('keydown', onKeyDown);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
    // Prevent clicks inside the modal from bubbling to the overlay
    modal.querySelector('.settings-modal').addEventListener('click', (e) => e.stopPropagation());
    
    // Update the X button to use the same close function
    modal.querySelector('.close-btn').onclick = closeModal;

    // Tabs behavior
    const tabButtons = modal.querySelectorAll('.tab-btn');
    const tabPanels = modal.querySelectorAll('.tab-panel');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-tab');
        tabPanels.forEach(panel => {
          panel.style.display = panel.getAttribute('data-panel') === target ? '' : 'none';
        });
      });
    });

    // Initialize pairing DnD for pairing tab
    this.initializeDragAndDrop(modal);

    // Wire Add Vehicle
    const addForm = modal.querySelector('#add-vehicle-form');
    if (addForm) {
      addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(addForm);
        const vehicleType = formData.get('vehicleType') || 'truck';
        const licensePlate = (formData.get('licensePlate') || '').toString().trim();
        if (!licensePlate) { alert('Zadajte SPZ'); return; }
        const vehicleData = {
          vehicleType,
          licensePlate,
          vin: (formData.get('vin') || '').toString().trim(),
          brand: (formData.get('brand') || '').toString().trim(),
          model: (formData.get('model') || '').toString().trim(),
          type: (formData.get('type') || '').toString().trim(),
          kilometers: Number(formData.get('kilometers') || 0),
          services: []
        };
        try {
          await window.db.collection('vehicles').doc(licensePlate).collection('info').doc('basic').set(vehicleData);
          alert('Vozidlo pridané');
          // Reload data to show new vehicle
          await this.loadDataAndRender();
          // Switch back to pairing tab so user can pair if needed
          modal.querySelector('[data-tab="pairing"]').click();
        } catch (err) {
          console.error(err);
          alert('Chyba pri pridávaní vozidla: ' + err.message);
        }
      });
      modal.querySelector('#cancel-add-vehicle')?.addEventListener('click', () => {
        modal.querySelector('[data-tab="pairing"]').click();
      });
    }

    // Initialize predefined services list
    this.refreshPredefinedServicesList();
  }

  // Render trucks for drag and drop
  renderTrucksForDragDrop() {
    const trucks = Object.values(this.trucks).sort((a, b) => a.licensePlate.localeCompare(b.licensePlate));
    
    return trucks.map(truck => {
      const currentTrailer = truck.trailer ? this.getTrailer(truck.trailer) : null;
      return `
        <div class="drag-truck-item" data-truck="${truck.licensePlate}" draggable="true" style="display: flex; align-items: center; gap: 12px;">
          <div class="drag-vehicle-license" style="min-width: 80px;">${truck.licensePlate}</div>
          <div class="drag-trailer-slot" data-truck="${truck.licensePlate}" style="flex: 1;">
            ${currentTrailer ? `
              <div class="drag-trailer-item" data-trailer="${currentTrailer.licensePlate}" draggable="true">
                <div class="drag-vehicle-license">${currentTrailer.licensePlate}</div>
                <div class="drag-vehicle-polozkas"></div>
              </div>
            ` : `
              <div class="drag-drop-zone">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7,10 12,15 17,10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span>Presuňte príves sem</span>
              </div>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  // Render trailers for drag and drop
  renderTrailersForDragDrop() {
    const assignedTrailerPlates = Object.values(this.trucks)
      .map(t => t.trailer)
      .filter(Boolean);
    
    const unassignedTrailers = Object.values(this.trailers)
      .filter(trailer => !assignedTrailerPlates.includes(trailer.licensePlate))
      .sort((a, b) => a.licensePlate.localeCompare(b.licensePlate));
    
    if (unassignedTrailers.length === 0) {
      return `
        <div class="no-trailers">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <p>Všetky prívesy sú priradené</p>
        </div>
      `;
    }
    
    return unassignedTrailers.map(trailer => `
      <div class="drag-trailer-item" data-trailer="${trailer.licensePlate}" draggable="true">
        <div class="drag-vehicle-license">${trailer.licensePlate}</div>
        <div class="drag-vehicle-polozkas"></div>
      </div>
    `).join('');
  }

  // Initialize drag and drop functionality (scoped to container)
  initializeDragAndDrop(container) {
    const trailerItems = container.querySelectorAll('.drag-trailer-item');
    const trailerSlots = container.querySelectorAll('.drag-trailer-slot');
    const trailersList = container.querySelector('.trailers-list');
    
    let draggedElement = null;
    
    // Add drag events to trailer items
    trailerItems.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedElement = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', item.outerHTML);
      });
      
      item.addEventListener('dragend', (e) => {
        item.classList.remove('dragging');
        draggedElement = null;
      });
    });
    
    // Add drop events to trailer slots
    trailerSlots.forEach(slot => {
      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        slot.classList.add('drag-over');
      });
      
      slot.addEventListener('dragleave', (e) => {
        slot.classList.remove('drag-over');
      });
      
      slot.addEventListener('drop', async (e) => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        
        if (draggedElement && draggedElement.classList.contains('drag-trailer-item')) {
          const draggedTrailerPlate = draggedElement.getAttribute('data-trailer');
          const targetTruckPlate = slot.getAttribute('data-truck');
          const currentTrailerInSlot = slot.querySelector('.drag-trailer-item');
          
          if (currentTrailerInSlot && currentTrailerInSlot !== draggedElement) {
            // Swap trailers - move current trailer to dragged trailer's original position
            await this.swapTrailers(draggedElement, currentTrailerInSlot);
          } else {
            // Simple assignment
            await this.assignTrailerToTruck(draggedElement, targetTruckPlate, container);
          }
        }
      });
    });
    
    // Add drag events to trailers list for returning trailers
    trailersList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      trailersList.classList.add('drag-over');
    });
    
    trailersList.addEventListener('dragleave', (e) => {
      if (!trailersList.contains(e.relatedTarget)) {
        trailersList.classList.remove('drag-over');
      }
    });
    
    trailersList.addEventListener('drop', async (e) => {
      e.preventDefault();
      trailersList.classList.remove('drag-over');
      
      if (draggedElement && draggedElement.classList.contains('drag-trailer-item')) {
        const trailerPlate = draggedElement.getAttribute('data-trailer');
        // Capture source slot before removal so we can reset it to drop zone
        const sourceSlotFromDom = draggedElement.closest('.drag-trailer-slot');
        
        // Remove trailer from its current position and reset the source slot UI
        draggedElement.remove();
        if (sourceSlotFromDom) {
          sourceSlotFromDom.innerHTML = `
            <div class="drag-drop-zone">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7,10 12,15 17,10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Presuňte príves sem</span>
            </div>
          `;
        }
        
        // Add trailer back to unassigned list
        this.addTrailerToUnassignedList(trailerPlate, container);
        
        // Update the pairing data (remove trailer from truck)
        this.removeTrailerFromTruck(trailerPlate);
        
        // Refresh the trailers list
        this.refreshTrailersList(container);
        
        // Refresh the main pairing display to show the change immediately
        this.renderPairs();

        // Determine which truck had this trailer for persistence (prefer DOM source slot)
        let truckWithTrailer = sourceSlotFromDom?.getAttribute('data-truck') || null;
        if (!truckWithTrailer) {
          for (const truckPlate in this.trucks) {
            if (this.trucks[truckPlate].trailer === trailerPlate) {
              truckWithTrailer = truckPlate;
              break;
            }
          }
        }

        // Persist removal to database (best-effort; UI already updated)
        if (truckWithTrailer) {
          try {
            const truckRef = window.db.collection('vehicles').doc(truckWithTrailer).collection('info').doc('basic');
            await truckRef.update({ trailer: null });
          } catch (error) {
            console.error('Error saving trailer removal:', error);
            this.showNotification('Chyba pri ukladaní odstránenia prívesu', 'error');
          }
        }
      }
    });
  }

  // Assign trailer to truck
  async assignTrailerToTruck(draggedElement, targetTruckPlate, container) {
    const trailerPlate = draggedElement.getAttribute('data-trailer');
    // Capture source slot from DOM before we remove the element
    const sourceSlotFromDom = draggedElement.closest('.drag-trailer-slot');
    
    // Find previous truck that had this trailer (if any)
    let previousTruckPlate = null;
    for (const plate in this.trucks) {
      if (this.trucks[plate]?.trailer === trailerPlate) {
        previousTruckPlate = plate;
        break;
      }
    }
    
    // Update the truck's trailer assignment in memory
    this.removeTrailerFromTruck(trailerPlate);
    if (this.trucks[targetTruckPlate]) {
      this.trucks[targetTruckPlate].trailer = trailerPlate;
    }
    
    // Save the change to database immediately (clear from previous truck, set on target)
    try {
      const batch = window.db.batch();
      if (previousTruckPlate && previousTruckPlate !== targetTruckPlate) {
        const prevRef = window.db.collection('vehicles').doc(previousTruckPlate).collection('info').doc('basic');
        batch.update(prevRef, { trailer: null });
      }
      const targetRef = window.db.collection('vehicles').doc(targetTruckPlate).collection('info').doc('basic');
      batch.update(targetRef, { trailer: trailerPlate });
      await batch.commit();
    } catch (error) {
      console.error('Error saving trailer assignment:', error);
      this.showNotification('Chyba pri ukladaní priradenia prívesu', 'error');
      return;
    }
    
    // Update the UI - move the trailer element to the truck slot (scoped to modal)
    const targetSlot = container.querySelector(`.drag-trailer-slot[data-truck="${targetTruckPlate}"]`);
    const previousSlot = previousTruckPlate ? container.querySelector(`.drag-trailer-slot[data-truck="${previousTruckPlate}"]`) : null;
    if (targetSlot) {
      // Remove the trailer from its current position
      draggedElement.remove();
      
      // Add the trailer to the target slot
      targetSlot.innerHTML = `
        <div class="drag-trailer-item" data-trailer="${trailerPlate}" draggable="true">
          <div class="drag-vehicle-license">${trailerPlate}</div>
          <div class="drag-vehicle-polozkas"></div>
        </div>
      `;
      
      // Re-add drag events to the new trailer element
      this.addDragEventsToTrailerItem(targetSlot.querySelector('.drag-trailer-item'));
    }
    
    // If there was a previous slot (coming from another truck), show empty drop zone there
    const slotToClear = previousSlot || sourceSlotFromDom;
    if (slotToClear && slotToClear !== targetSlot) {
      slotToClear.innerHTML = `
        <div class="drag-drop-zone">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>Presuňte príves sem</span>
        </div>
      `;
    }
    
    // Refresh the unassigned trailers list
    this.refreshTrailersList(container);
    
    // Refresh the main pairing display to show the change immediately
    this.renderPairs();
  }

  // Swap trailers between trucks
  async swapTrailers(draggedElement, currentTrailerInSlot) {
    const draggedTrailerPlate = draggedElement.getAttribute('data-trailer');
    const currentTrailerPlate = currentTrailerInSlot.getAttribute('data-trailer');
    const targetTruckPlate = currentTrailerInSlot.closest('.drag-trailer-slot').getAttribute('data-truck');
    const draggedTruckPlate = draggedElement.closest('.drag-trailer-slot').getAttribute('data-truck');
    
    // Update truck assignments in memory
    if (this.trucks[targetTruckPlate]) {
      this.trucks[targetTruckPlate].trailer = draggedTrailerPlate;
    }
    if (this.trucks[draggedTruckPlate]) {
      this.trucks[draggedTruckPlate].trailer = currentTrailerPlate;
    }
    
    // Save the changes to database immediately
    try {
      const batch = window.db.batch();
      
      const targetTruckRef = window.db.collection('vehicles').doc(targetTruckPlate).collection('info').doc('basic');
      const draggedTruckRef = window.db.collection('vehicles').doc(draggedTruckPlate).collection('info').doc('basic');
      
      batch.update(targetTruckRef, { trailer: draggedTrailerPlate });
      batch.update(draggedTruckRef, { trailer: currentTrailerPlate });
      
      await batch.commit();
    } catch (error) {
      console.error('Error saving trailer swap:', error);
      this.showNotification('Chyba pri ukladaní výmeny prívesov', 'error');
      return;
    }
    
    // Swap the trailer elements in the UI
    const targetSlot = currentTrailerInSlot.closest('.drag-trailer-slot');
    const draggedSlot = draggedElement.closest('.drag-trailer-slot');
    
    if (targetSlot && draggedSlot) {
      // Create new trailer elements
      const newDraggedTrailer = `
        <div class="drag-trailer-item" data-trailer="${currentTrailerPlate}" draggable="true">
          <div class="drag-vehicle-license">${currentTrailerPlate}</div>
          <div class="drag-vehicle-polozkas"></div>
        </div>
      `;
      
      const newTargetTrailer = `
        <div class="drag-trailer-item" data-trailer="${draggedTrailerPlate}" draggable="true">
          <div class="drag-vehicle-license">${draggedTrailerPlate}</div>
          <div class="drag-vehicle-polozkas"></div>
        </div>
      `;
      
      // Update the slots
      draggedSlot.innerHTML = newDraggedTrailer;
      targetSlot.innerHTML = newTargetTrailer;
      
      // Re-add drag events to both new trailer elements
      this.addDragEventsToTrailerItem(draggedSlot.querySelector('.drag-trailer-item'));
      this.addDragEventsToTrailerItem(targetSlot.querySelector('.drag-trailer-item'));
    }
    
    // Refresh the main pairing display to show the change immediately
    this.renderPairs();
  }

  // Add drag events to a trailer item
  addDragEventsToTrailerItem(item) {
    let draggedElement = null;
    
    item.addEventListener('dragstart', (e) => {
      draggedElement = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', item.outerHTML);
    });
    
    item.addEventListener('dragend', (e) => {
      item.classList.remove('dragging');
      draggedElement = null;
    });
  }

  // Add trailer to unassigned list
  addTrailerToUnassignedList(trailerPlate, container) {
    const trailersList = container.querySelector('.trailers-list');
    const trailer = this.trailers[trailerPlate];
    
    if (trailer) {
      // Remove "no trailers" message if it exists
      const noTrailers = trailersList.querySelector('.no-trailers');
      if (noTrailers) {
        noTrailers.remove();
      }
      
      const trailerItem = document.createElement('div');
      trailerItem.className = 'drag-trailer-item';
      trailerItem.setAttribute('data-trailer', trailerPlate);
      trailerItem.draggable = true;
      trailerItem.innerHTML = `
        <div class="drag-vehicle-license">${trailerPlate}</div>
      `;
      
      this.addDragEventsToTrailerItem(trailerItem);
      trailersList.appendChild(trailerItem);
    }
  }

  // Refresh trailers list
  refreshTrailersList(container) {
    const trailersList = container.querySelector('.trailers-list');
    const currentTrailers = trailersList.querySelectorAll('.drag-trailer-item');
    
    if (currentTrailers.length === 0) {
      trailersList.innerHTML = `
        <div class="no-trailers">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <p>Všetky prívesy sú priradené</p>
        </div>
      `;
    }
  }

  // Update pairing data
  updatePairingData(truckPlate, trailerPlate) {
    // Remove trailer from any existing truck
    this.removeTrailerFromTruck(trailerPlate);
    
    // Assign trailer to the new truck
    if (this.trucks[truckPlate]) {
      this.trucks[truckPlate].trailer = trailerPlate;
    }
  }

  // Remove trailer from truck
  removeTrailerFromTruck(trailerPlate) {
    Object.values(this.trucks).forEach(truck => {
      if (truck.trailer === trailerPlate) {
        truck.trailer = null;
      }
    });
  }

  // Save pairing changes to database
  async savePairingChanges() {
    try {
      const batch = window.db.batch();
      
      // Update all trucks with their trailer assignments
      for (const truckPlate in this.trucks) {
        const truck = this.trucks[truckPlate];
        const truckRef = window.db.collection('vehicles').doc(truckPlate).collection('info').doc('basic');
        batch.update(truckRef, {
          trailer: truck.trailer || null
        });
      }
      
      await batch.commit();
      
      this.showNotification('Zmeny párovania boli úspešne uložené!', 'success');
      
      // Close the modal
      const modal = document.querySelector('.settings-modal-overlay');
      if (modal) {
        modal.remove();
      }
      
      // Refresh the main view
      this.renderPairs();
      
    } catch (error) {
      console.error('Error saving pairing changes:', error);
      this.showNotification('Chyba pri ukladaní zmien párovania', 'error');
    }
  }

  // Search functionality
  search(query) {
    this.renderPairs(query);
  }

  // Refresh data
  refresh() {
    // Force refresh by invalidating cache
    this.cache.lastUpdated = null;
    this.loadDataAndRender();
  }

  // Get service interval text in Czech/Slovak
  getServiceIntervalText(type, interval, specificDate = null, timeUnit = null) {
    if (type === 'specificDate' || specificDate) {
      const dateValue = specificDate || interval;
      return `Dátum: ${this.formatDateSk(dateValue)}`;
    }
    switch (type) {
      case 'km':
        return `Každých ${this.formatNumberWithSpaces(interval)} km`;
      case 'date': {
        const prefix = this.getEveryPrefix(interval);
        const unitForm = this.getUnitForm(interval, timeUnit);
        return `${prefix} ${interval} ${unitForm}`;
      }
      default: {
        // Fallback to days
        const prefix = this.getEveryPrefix(interval);
        const unitForm = this.getUnitForm(interval, 'days');
        return `${prefix} ${interval} ${unitForm}`;
      }
    }
  }

  // Return correct Slovak prefix: Každý (1), Každé (2-4), Každých (5+)
  getEveryPrefix(count) {
    const n = parseInt(count, 10);
    if (n === 1) return 'Každý';
    if (n >= 2 && n <= 4) return 'Každé';
    return 'Každých';
  }

  // Return correct Slovak unit form for given count and timeUnit
  // timeUnit: 'days' | 'months' | 'years'
  getUnitForm(count, timeUnit) {
    const n = parseInt(count, 10);
    const many = (n >= 5);
    const few = (n >= 2 && n <= 4);
    switch (timeUnit) {
      case 'years':
        if (n === 1) return 'rok';
        if (few) return 'roky';
        return 'rokov';
      case 'months':
        if (n === 1) return 'mesiac';
        if (few) return 'mesiace';
        return 'mesiacov';
      case 'days':
      default:
        if (n === 1) return 'deň';
        if (few) return 'dni';
        return 'dní';
    }
  }

  // Calculate due date based on last performed date, interval and type
  calculateDueDate(lastPerformed, interval, type = 'date', specificDate = null, timeUnit = null) {
    if (type === 'specificDate' || specificDate) {
      const specific = this.parseDateFlexible(specificDate || interval);
      return !specific ? 'Nastaviť dátum' : specific.toLocaleDateString('sk-SK');
    }
    if (!lastPerformed) {
      return 'Nastaviť dátum';
    }
    
    const lastDate = this.parseDateFlexible(lastPerformed);
    
    if (!lastDate) {
      return 'Nastaviť dátum';
    }
    
    const dueDate = new Date(lastDate);
    const intervalNum = parseInt(interval);
    // type is 'date' here, so use timeUnit
    if (timeUnit === 'years') {
      dueDate.setFullYear(dueDate.getFullYear() + intervalNum);
    } else if (timeUnit === 'months') {
      dueDate.setMonth(dueDate.getMonth() + intervalNum);
    } else {
      dueDate.setDate(dueDate.getDate() + intervalNum);
    }
    
    return dueDate.toLocaleDateString('sk-SK');
  }

  // Format number with spaces for better readability
  formatNumberWithSpaces(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // Parse various date input shapes (string YYYY-MM-DD, number ms, Firebase Timestamp, {_seconds})
  parseDateFlexible(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') {
      try { return value.toDate(); } catch (_) { /* noop */ }
    }
    if (typeof value === 'object') {
      if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
      if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
    }
    if (typeof value === 'number') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  // Format date value to sk-SK using flexible parsing, fallback to '—'
  formatDateSk(value) {
    const d = this.parseDateFlexible(value);
    return d ? d.toLocaleDateString('sk-SK') : '—';
  }

  // Filter history by search term
  filterHistory(searchTerm) {
    if (!this.selectedVehicle || !this.selectedVehicle.history) return;
    
    const history = this.selectedVehicle.history || [];
    const searchLower = (searchTerm || '').toLowerCase();
    
    // Filter history entries
    const filteredHistory = history.filter(entry => {
      // Search in date
      const rawDate = entry.date || entry.completedAt;
      const dateObj = rawDate && typeof rawDate?.toDate === 'function' ? rawDate.toDate() : new Date(rawDate);
      const dateStr = (dateObj instanceof Date && !isNaN(dateObj))
        ? dateObj.toLocaleDateString('sk-SK').toLowerCase()
        : '';
      if (dateStr.includes(searchLower)) return true;
      
      // Search in kilometers
      const kmStr = this.formatNumberWithSpaces(entry.kilometers || 0).toLowerCase();
      if (kmStr.includes(searchLower)) return true;
      
      // Search in service names
      const items = Array.isArray(entry.items) ? entry.items : [];
      return items.some(item => String(item.name || '').toLowerCase().includes(searchLower));
    });
    
    // Update the display scoped to História tab
    const historiaTab = document.getElementById('historia-tab');
    const container = historiaTab ? historiaTab.querySelector('.completed-work-sessions') : document.querySelector('.completed-work-sessions');
    if (container) {
      container.innerHTML = this.renderCompletedWorkSessions(filteredHistory);
    }
  }

  // Calculate remaining days until due date
  calculateRemainingDays(lastPerformed, interval, type = 'date', specificDate = null, timeUnit = null) {
    if (type === 'specificDate' || specificDate) {
      const specific = this.parseDateFlexible(specificDate || interval);
      if (!specific) return 'Nastaviť dátum';
      const today = new Date();
      const diffTime = specific - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return `Prešlo ${Math.abs(diffDays)} dní`;
      if (diffDays === 0) return 'Dnes';
      return `Zostáva ${diffDays} dní`;
    }
    if (!lastPerformed) {
      return 'Nastaviť dátum';
    }
    
    const lastDate = this.parseDateFlexible(lastPerformed);
    
    if (!lastDate) {
      return 'Nastaviť dátum';
    }
    
    const dueDate = new Date(lastDate);
    const intervalNum = parseInt(interval);
    if (timeUnit === 'years') {
      dueDate.setFullYear(dueDate.getFullYear() + intervalNum);
    } else if (timeUnit === 'months') {
      dueDate.setMonth(dueDate.getMonth() + intervalNum);
    } else {
      dueDate.setDate(dueDate.getDate() + intervalNum);
    }
    
    const today = new Date();
    const diffTime = dueDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return `Prešlo ${Math.abs(diffDays)} dní`;
    } else if (diffDays === 0) {
      return 'Dnes';
    } else {
      return `Zostáva ${diffDays} dní`;
    }
  }

  // Get service status class (normal, reminder, overdue)
  getServiceStatusClass(service) {
    if (service.type === 'km') {
      return this.getKmServiceStatus(service);
    } else {
      return this.getDateServiceStatus(service);
    }
  }

  // Get status for km-based services
  getKmServiceStatus(service) {
    const currentKm = this.selectedVehicle?.currentKm || this.selectedVehicle?.kilometers || 0;
    
    // Use lastService.km when provided (including 0), otherwise fall back to current km
    const hasLastKm = service.lastService && typeof service.lastService.km === 'number';
    const lastServiceKm = hasLastKm ? service.lastService.km : currentKm;
    const targetKm = lastServiceKm + parseInt(service.interval);
    const reminderKm = targetKm - (service.reminderKm || 15000);
    
    if (currentKm >= targetKm) {
      return 'overdue';
    } else if (currentKm >= reminderKm) {
      return 'reminder';
    } else {
      return 'normal';
    }
  }

  // Calculate remaining km for km-based services
  calculateRemainingKm(service) {
    const currentKm = this.selectedVehicle?.currentKm || this.selectedVehicle?.kilometers || 0;
    
    // Use lastService.km when provided (including 0), otherwise fall back to current km
    const hasLastKm = service.lastService && typeof service.lastService.km === 'number';
    const lastServiceKm = hasLastKm ? service.lastService.km : currentKm;
    const targetKm = lastServiceKm + parseInt(service.interval);
    const remainingKm = targetKm - currentKm;
    
    // Debug logging for first service calculation
    if (service.name && !this._debugLogged) {
      this._debugLogged = true;
    }
    
    if (remainingKm <= 0) {
      return `Prešlo ${this.formatNumberWithSpaces(Math.abs(remainingKm))} km`;
    } else {
      return `Zostáva ${this.formatNumberWithSpaces(remainingKm)} km`;
    }
  }

  // Calculate target km for km-based services
  calculateTargetKm(service) {
    const currentKm = this.selectedVehicle?.currentKm || this.selectedVehicle?.kilometers || 0;
    
    // Use lastService.km when provided (including 0), otherwise fall back to current km
    const hasLastKm = service.lastService && typeof service.lastService.km === 'number';
    const lastServiceKm = hasLastKm ? service.lastService.km : currentKm;
    const targetKm = lastServiceKm + parseInt(service.interval);
    return `Pri ${this.formatNumberWithSpaces(targetKm)} km`;
  }

  // Get status for date-based services
  getDateServiceStatus(service) {
    // If a specific absolute date is set, use it directly
    if (service.type === 'specificDate' || service.specificDate) {
      const dueDate = this.parseDateFlexible(service.specificDate || service.interval);
      if (!dueDate) return 'normal';
      const today = new Date();
      const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
      let reminderDays = service.reminderDays || 30;
      if (diffDays < 0) return 'overdue';
      if (diffDays <= reminderDays) return 'reminder';
      return 'normal';
    }
    if (!service.lastService?.date) return 'normal';
    
    let lastDate;
    if (service.lastService.date.toDate) {
      lastDate = service.lastService.date.toDate();
    } else if (typeof service.lastService.date === 'string') {
      lastDate = new Date(service.lastService.date);
    } else if (service.lastService.date.seconds) {
      lastDate = new Date(service.lastService.date.seconds * 1000);
    } else {
      lastDate = new Date(service.lastService.date);
    }
    
    if (isNaN(lastDate.getTime())) return 'normal';
    
    const dueDate = new Date(lastDate);
    const intervalNum = parseInt(service.interval);
    // type is 'date' here; use timeUnit
    if (service.timeUnit === 'years') {
      dueDate.setFullYear(dueDate.getFullYear() + intervalNum);
    } else if (service.timeUnit === 'months') {
      dueDate.setMonth(dueDate.getMonth() + intervalNum);
    } else {
      dueDate.setDate(dueDate.getDate() + intervalNum);
    }
    
    const today = new Date();
    const diffTime = dueDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Adjust reminder period based on service type
    let reminderDays = service.reminderDays || 30;
    if (service.timeUnit === 'years') {
      reminderDays = service.reminderDays || 90; // 3 months for yearly services
    } else if (service.timeUnit === 'months') {
      reminderDays = service.reminderDays || 14; // 2 weeks for monthly services
    }
    
    if (diffDays < 0) {
      return 'overdue';
    } else if (diffDays <= reminderDays) {
      return 'reminder';
    } else {
      return 'normal';
    }
  }

  // Cleanup method to close all Firebase listeners
  cleanup() {
    // Close all unsubscribe functions
    this.unsubscribeFunctions.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this.unsubscribeFunctions = [];
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  window.flotilaManager = new FlotilaManager();
  await window.flotilaManager.init();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.flotilaManager) {
    window.flotilaManager.cleanup();
  }
  if (window.cleanupFirebaseListeners) {
    window.cleanupFirebaseListeners();
  }
});

// Global function for onclick handlers
window.showPolozka = function(type, plate) {
  if (window.flotilaManager) {
    window.flotilaManager.showPolozka(type, plate);
  }
};
