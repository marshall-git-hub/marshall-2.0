// Flotila Management System
class FlotilaManager {
  constructor() {
    this.trucks = {};
    this.trailers = {};
    this.cars = {};
    this.other = {};
    this.selectedVehicle = null;
    this.currentUser = null;
    this.unsubscribeFunctions = [];
    this.redirecting = false; // Prevent multiple redirects
    this.cache = {
      trucks: {},
      trailers: {},
      cars: {},
      other: {},
      vehicleKms: {},
      lastUpdated: null,
      ttl: 5 * 60 * 1000 // 5 minutes cache TTL
    };
    this.pagination = {
      currentPage: 1,
      itemsPerPage: 20,
      totalItems: 0
    };
    // Bulk services state for adding services to multiple vehicles
    this.bulkServicesState = {
      selectedServices: [], // Array of service objects {id, name, type, interval, ...}
      selectedVehicles: [], // Array of {type: 'truck'|'trailer'|'car'|'other', licensePlate: string}
      predefinedListOpen: false,
      vehiclesListOpen: false,
      categoryOpen: { trucks: false, trailers: false, cars: false, other: false }
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

  // Helper method to get predefined services collection reference
  _predefinedServicesCollection() {
    return window.db.collection('FLOTILA').doc('predefined_services').collection('items');
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

  // Helper to get oil category title
  // Helper: Check if a category is a valid oil category
  isOilCategory(categoryId) {
    const validOilCategories = ['motorove', 'prevodove', 'diferencial', 'chladiaca'];
    return validOilCategories.includes(categoryId);
  }

  // Helper: Check if a category is a valid parts category
  isPartsCategory(categoryId) {
    const validPartsCategories = [
      'olejove', 'naftove', 'kabinove', 'vzduchove', 'adblue', 
      'vysusac-vzduchu', 'ostnane', 
      'brzd-platnicky', 'brzd-kotuce', 'brzd-valce'
    ];
    return validPartsCategories.includes(categoryId);
  }

  getOilCategoryTitle(categoryId) {
    const categoryMap = {
      'motorove': 'Motorové oleje',
      'prevodove': 'Prevodové oleje',
      'diferencial': 'Diferenciálne oleje',
      'chladiaca': 'Chladiaca kvapalina'
    };
    return categoryMap[categoryId] || categoryId;
  }

  // Helper methods for FLOTILA collection
  _flotilaCarsCollection() {
    return window.db.collection('FLOTILA').doc('cars').collection('items');
  }

  _flotilaTrucksCollection() {
    return window.db.collection('FLOTILA').doc('trucks').collection('items');
  }

  _flotilaTrailersCollection() {
    return window.db.collection('FLOTILA').doc('trailers').collection('items');
  }

  _flotilaOtherCollection() {
    return window.db.collection('FLOTILA').doc('other').collection('items');
  }

  async _getFlotilaVehicles() {
    const [carsSnapshot, trucksSnapshot, trailersSnapshot, otherSnapshot] = await Promise.all([
      this._flotilaCarsCollection().get(),
      this._flotilaTrucksCollection().get(),
      this._flotilaTrailersCollection().get(),
      this._flotilaOtherCollection().get()
    ]);

    // Keep vehicles separate by type
    const carsData = carsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const trucksData = trucksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const trailersData = trailersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const otherData = otherSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return { carsData, trucksData, trailersData, otherData };
  }

  // Helper to get the correct FLOTILA collection reference for a vehicle
  _getFlotilaCollectionForVehicle(vehicleOrPlate) {
    let category = 'truck';
    
    if (typeof vehicleOrPlate === 'string') {
      // It's a plate, find the vehicle
      const vehicle = this.trucks[vehicleOrPlate] || this.trailers[vehicleOrPlate] || this.cars[vehicleOrPlate] || this.other[vehicleOrPlate];
      if (vehicle) {
        if (vehicle.vehicleType === 'trailer') category = 'trailer';
        else if (vehicle.vehicleType === 'car') category = 'car';
        else if (vehicle.vehicleType === 'other') category = 'other';
        else category = vehicle?.category || 'truck';
      }
    } else {
      // It's a vehicle object
      if (vehicleOrPlate?.vehicleType === 'trailer') {
        category = 'trailer';
      } else if (vehicleOrPlate?.vehicleType === 'car') {
        category = 'car';
      } else if (vehicleOrPlate?.vehicleType === 'other') {
        category = 'other';
      } else {
        category = vehicleOrPlate?.category || 'truck';
      }
    }
    
    if (category === 'trailer') {
      return this._flotilaTrailersCollection();
    } else if (category === 'car') {
      return this._flotilaCarsCollection();
    } else if (category === 'other') {
      return this._flotilaOtherCollection();
    } else {
      return this._flotilaTrucksCollection();
    }
  }

  // Load data from Firebase with optimized batch queries
  async loadData() {
    try {
      if (!this.currentUser) {
        this.trucks = {};
        this.trailers = {};
        this.cars = {};
        this.other = {};
        return;
      }
      
      // Show loading indicator
      this.showLoadingIndicator();
      
      // Load from FLOTILA collection
      let carsData = [];
      let trucksData = [];
      let trailersData = [];
      let otherData = [];
      let vehicleKms = {};
      
      try {
        // Load all vehicles from FLOTILA collection
        const vehiclesResult = await this._getFlotilaVehicles();
        carsData = vehiclesResult.carsData;
        trucksData = vehiclesResult.trucksData;
        trailersData = vehiclesResult.trailersData;
        otherData = vehiclesResult.otherData;

        // Load vehicle kilometers from SHARED collection
        try {
          if (window.DatabaseService) {
            vehicleKms = await window.DatabaseService.getAllVehicleKms();
          } else {
            // Fallback to old structure
            const kmSnapshot = await window.db.collection('vehicles_km').get();
            kmSnapshot.docs.forEach(doc => {
              vehicleKms[doc.id] = doc.data().kilometers || 0;
            });
          }
        } catch (kmError) {
          console.warn('Error loading vehicle kilometers:', kmError);
        }
      } catch (error) {
        console.error('Error loading vehicles:', error);
        this.hideLoadingIndicator();
        return;
      }
      
      this.trucks = {};
      this.trailers = {};
      this.cars = {};
      this.other = {};
      
      // Process cars
      for (const car of carsData) {
        const licensePlate = car.licensePlate || car.id;
        const normalizedPlate = this.normalizeLicensePlate(licensePlate);
        const kmFromDb = vehicleKms[normalizedPlate] || vehicleKms[licensePlate] || car.kilometers || 0;
        
        this.cars[licensePlate] = {
          licensePlate,
          vehicleType: 'car',
          currentKm: kmFromDb,
          services: car.services || [],
          activeWorkSession: car.activeWorkSession || null,
          history: car.history || [],
          ...car
        };
      }
      
      // Process trucks
      for (const truck of trucksData) {
        const licensePlate = truck.licensePlate || truck.id;
        const normalizedPlate = this.normalizeLicensePlate(licensePlate);
        const kmFromDb = vehicleKms[normalizedPlate] || vehicleKms[licensePlate] || truck.kilometers || 0;
        
        this.trucks[licensePlate] = {
          licensePlate,
          vehicleType: 'truck',
          currentKm: kmFromDb,
          services: truck.services || [],
          activeWorkSession: truck.activeWorkSession || null,
          history: truck.history || [],
          ...truck
        };
      }
      
      // Process trailers
      for (const trailer of trailersData) {
        const licensePlate = trailer.licensePlate || trailer.id;
        const normalizedPlate = this.normalizeLicensePlate(licensePlate);
        const kmFromDb = vehicleKms[normalizedPlate] || vehicleKms[licensePlate] || trailer.kilometers || 0;
        
        this.trailers[licensePlate] = {
          licensePlate,
          vehicleType: 'trailer',
          currentKm: kmFromDb,
          services: trailer.services || [],
          activeWorkSession: trailer.activeWorkSession || null,
          history: trailer.history || [],
          ...trailer
        };
      }
      
      // Process other vehicles
      for (const other of otherData) {
        const licensePlate = other.licensePlate || other.id;
        const normalizedPlate = this.normalizeLicensePlate(licensePlate);
        const kmFromDb = vehicleKms[normalizedPlate] || vehicleKms[licensePlate] || other.kilometers || 0;
        
        this.other[licensePlate] = {
          licensePlate,
          vehicleType: 'other',
          currentKm: kmFromDb,
          services: other.services || [],
          activeWorkSession: other.activeWorkSession || null,
          history: other.history || [],
          ...other
        };
      }
      
      // Cache the data for faster subsequent loads
      this.cacheData();
      
      this.hideLoadingIndicator();
      
    } catch (error) {
      console.error('Error loading flotila data:', error);
      // Fallback to empty data
      this.trucks = {};
      this.trailers = {};
      this.cars = {};
      this.other = {};
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

    // Detail panel click to deselect vehicle (desktop only)
    document.getElementById('polozka-panel')?.addEventListener('click', (e) => {
      // Only deselect if clicking on the placeholder or outside vehicle content
      if (e.target.closest('.polozka-placeholder') || 
          (e.target.closest('.polozka-panel') && !e.target.closest('.vehicle-polozka'))) {
        this.deselectVehicle();
      }
    });

    // Mobile modal close button
    document.getElementById('mobile-vehicle-modal-close')?.addEventListener('click', () => {
      this.closeMobileModal();
    });

    // Close mobile modal when clicking overlay
    document.getElementById('mobile-vehicle-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('mobile-vehicle-modal-overlay')) {
        this.closeMobileModal();
      }
    });

    // Keyboard shortcut to deselect vehicle (Escape key)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.selectedVehicle) {
        if (this.isMobile()) {
          this.closeMobileModal();
        } else {
          this.deselectVehicle();
        }
      }
    });

    // Handle window resize - close modal if switching from mobile to desktop
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (!this.isMobile() && document.getElementById('mobile-vehicle-modal')?.classList.contains('active')) {
          // Switched to desktop, close modal and show in panel instead
          const modal = document.getElementById('mobile-vehicle-modal');
          if (modal && this.selectedVehicle) {
            const vehicle = this.selectedVehicle;
            const type = vehicle.type;
            this.closeMobileModal();
            // Re-render in desktop panel
            this.renderPolozkaPanel(vehicle, type, false);
          }
        }
      }, 250);
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
    this.cache.cars = { ...this.cars };
    this.cache.other = { ...this.other };
    
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
    Object.values(this.cars).forEach(car => {
      const normalizedPlate = this.normalizeLicensePlate(car.licensePlate);
      this.cache.vehicleKms[normalizedPlate] = car.currentKm || 0;
    });
    Object.values(this.other).forEach(other => {
      const normalizedPlate = this.normalizeLicensePlate(other.licensePlate);
      this.cache.vehicleKms[normalizedPlate] = other.currentKm || 0;
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
      this.cars = { ...(this.cache.cars || {}) };
      this.other = { ...(this.cache.other || {}) };
      
      // Restore kilometer data from cache
      Object.values(this.trucks).forEach(truck => {
        const normalizedPlate = this.normalizeLicensePlate(truck.licensePlate);
        truck.currentKm = this.cache.vehicleKms[normalizedPlate] || truck.currentKm || 0;
      });
      Object.values(this.trailers).forEach(trailer => {
        const normalizedPlate = this.normalizeLicensePlate(trailer.licensePlate);
        trailer.currentKm = this.cache.vehicleKms[normalizedPlate] || trailer.currentKm || 0;
      });
      Object.values(this.cars).forEach(car => {
        const normalizedPlate = this.normalizeLicensePlate(car.licensePlate);
        car.currentKm = this.cache.vehicleKms[normalizedPlate] || car.currentKm || 0;
      });
      Object.values(this.other).forEach(other => {
        const normalizedPlate = this.normalizeLicensePlate(other.licensePlate);
        other.currentKm = this.cache.vehicleKms[normalizedPlate] || other.currentKm || 0;
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
    
    // Filter and sort cars
    let filteredCars = Object.values(this.cars)
      .sort((a, b) => a.licensePlate.localeCompare(b.licensePlate));
    
    // Filter and sort other vehicles
    let filteredOther = Object.values(this.other)
      .sort((a, b) => a.licensePlate.localeCompare(b.licensePlate));

    if (query) {
      const searchTerm = query.toLowerCase();
      filteredTrucks = filteredTrucks.filter(truck => {
        // Search in truck properties
        const truckMatch = 
          truck.licensePlate.toLowerCase().includes(searchTerm) ||
          (truck.vin && truck.vin.toLowerCase().includes(searchTerm)) ||
          truck.currentKm.toString().includes(searchTerm) ||
          (truck.model && truck.model.toLowerCase().includes(searchTerm)) ||
          (truck.vehicleType && truck.vehicleType.toLowerCase().includes(searchTerm));
        
        // Search in attached trailer properties
        if (truck.trailer) {
          const trailer = this.getTrailer(truck.trailer);
          if (trailer) {
            const trailerMatch = 
              trailer.licensePlate.toLowerCase().includes(searchTerm) ||
              (trailer.vin && trailer.vin.toLowerCase().includes(searchTerm)) ||
              (trailer.model && trailer.model.toLowerCase().includes(searchTerm));
            
            return truckMatch || trailerMatch;
          }
        }
        
        return truckMatch;
      });
      
      filteredCars = filteredCars.filter(car => {
        return car.licensePlate.toLowerCase().includes(searchTerm) ||
          (car.vin && car.vin.toLowerCase().includes(searchTerm)) ||
          car.currentKm.toString().includes(searchTerm) ||
          (car.model && car.model.toLowerCase().includes(searchTerm));
      });
      
      filteredOther = filteredOther.filter(other => {
        return other.licensePlate.toLowerCase().includes(searchTerm) ||
          (other.vin && other.vin.toLowerCase().includes(searchTerm)) ||
          other.currentKm.toString().includes(searchTerm) ||
          (other.model && other.model.toLowerCase().includes(searchTerm));
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

    // Build all sections HTML
    let allSectionsHtml = '';

    // 1. Tahače section
    if (filteredTrucks.length > 0) {
      allSectionsHtml += `
        <div class="trucks-pairs-section">
          <h3 class="trucks-pairs-title">
            Tahače (${filteredTrucks.length})
          </h3>
          <div class="trucks-pairs-content">
            ${pairsHtml}
            ${paginationHtml}
          </div>
        </div>
      `;
    }

    // 2. Nepriradené prívesy section (rendered separately below)
    // This is handled by renderUnassignedTrailers

    // 3. Osobné autá section
    if (filteredCars.length > 0) {
      const carsHtml = filteredCars.map(car => `
        <div class="vehicle-card car-card" onclick="flotilaManager.showPolozka('car', '${car.licensePlate}')">
          <div class="vehicle-info">
            <div class="vehicle-license">${car.licensePlate}</div>
          </div>
        </div>
      `).join('');

      allSectionsHtml += `
        <div class="cars-section">
          <h3 class="cars-section-title">
            Osobné autá (${filteredCars.length})
          </h3>
          <div class="cars-section-content">
            ${carsHtml}
          </div>
        </div>
      `;
    }

    // 4. Ostatné section
    if (filteredOther.length > 0) {
      const otherHtml = filteredOther.map(other => `
        <div class="vehicle-card other-card" onclick="flotilaManager.showPolozka('other', '${other.licensePlate}')">
          <div class="vehicle-info">
            <div class="vehicle-license">${other.licensePlate}</div>
          </div>
        </div>
      `).join('');

      allSectionsHtml += `
        <div class="other-section">
          <h3 class="other-section-title">
            Ostatné (${filteredOther.length})
          </h3>
          <div class="other-section-content">
            ${otherHtml}
          </div>
        </div>
      `;
    }

    pairList.innerHTML = allSectionsHtml;

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
  // Check if device is mobile
  isMobile() {
    return window.innerWidth <= 768;
  }

  // Open mobile modal
  openMobileModal() {
    const modal = document.getElementById('mobile-vehicle-modal');
    if (modal) {
      modal.classList.add('active');
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }
  }

  // Close mobile modal
  closeMobileModal() {
    const modal = document.getElementById('mobile-vehicle-modal');
    const modalBody = document.getElementById('mobile-vehicle-modal-body');
    if (modal) {
      modal.classList.remove('active');
      // Restore body scroll
      document.body.style.overflow = '';
    }
    // Clear modal content
    if (modalBody) {
      modalBody.innerHTML = '';
    }
    this.selectedVehicle = null;
  }

  async showPolozka(type, plate) {
    if (!plate) return;

    let vehicle = null;
    if (type === 'truck') {
      vehicle = Object.values(this.trucks).find(t => t.licensePlate === plate);
    } else if (type === 'trailer') {
      vehicle = Object.values(this.trailers).find(t => t.licensePlate === plate);
    } else if (type === 'car') {
      vehicle = Object.values(this.cars).find(t => t.licensePlate === plate);
    } else if (type === 'other') {
      vehicle = Object.values(this.other).find(t => t.licensePlate === plate);
    }

    if (!vehicle) return;

    this.selectedVehicle = { ...vehicle, type };
    
    // Highlight selected vehicle card
    this.highlightSelectedVehicle(plate);
    
    // Services should already be loaded with the vehicle data from TIRES collection
    // If not present, initialize empty arrays
    if (!vehicle.services) {
      vehicle.services = [];
    }
    if (!vehicle.activeWorkSession) {
      vehicle.activeWorkSession = null;
    }
    if (!vehicle.history) {
      vehicle.history = [];
    }
    
    // On mobile, show modal; on desktop, show inline panel
    if (this.isMobile()) {
      this.renderPolozkaPanel(vehicle, type, true); // true = mobile mode
      this.openMobileModal();
    } else {
      this.renderPolozkaPanel(vehicle, type, false); // false = desktop mode
    }
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
    this.clearSelectedVehicleHighlight();
    this.clearPolozkaPanel();
    // Close mobile modal if open
    if (this.isMobile()) {
      this.closeMobileModal();
    }
  }
  
  // Highlight selected vehicle card with glow effect
  highlightSelectedVehicle(plate) {
    // Remove previous selection
    this.clearSelectedVehicleHighlight();
    
    // Find all vehicle cards and highlight the selected one
    const allCards = document.querySelectorAll('.vehicle-card');
    allCards.forEach(card => {
      const licenseEl = card.querySelector('.vehicle-license');
      if (licenseEl && licenseEl.textContent === plate) {
        card.classList.add('selected');
      }
    });
  }
  
  // Clear selected vehicle highlight
  clearSelectedVehicleHighlight() {
    document.querySelectorAll('.vehicle-card.selected').forEach(card => {
      card.classList.remove('selected');
    });
  }

  // Render položka panel
  renderPolozkaPanel(vehicle, type, isMobile = false) {
    const targetPanel = isMobile 
      ? document.getElementById('mobile-vehicle-modal-body')
      : document.getElementById('polozka-panel');
    
    if (!targetPanel) return;

    // Reset scroll position to top
    targetPanel.scrollTop = 0;
    
    // For desktop, add has-vehicle class to extend panel to bottom
    if (!isMobile) {
      const detailPanel = document.getElementById('polozka-panel');
      if (detailPanel) {
        detailPanel.classList.add('has-vehicle');
      }
    }

    const typeText = type === 'truck' ? 'Nákladné auto' : 'Príves';
    const typeColor = type === 'truck' ? '#eab308' : '#2563eb';

    targetPanel.innerHTML = `
      <div class="vehicle-polozka">
        <!-- Vehicle Header Info -->
  <div class="vehicle-header" style="display: flex; justify-content: space-between; align-items: center; padding: 0 0 10px 0; border-radius: 0; background: none; box-shadow: none;">
          <div class="vehicle-header-left" style="display: flex; flex-direction: column; gap: 4px;">
            <div class="vehicle-license-large" style="color: #374151; font-size: 1.2rem; font-weight: bold;">${vehicle.licensePlate}</div>
            <div class="vehicle-type" style="color: #6b7280; font-size: 0.95rem; letter-spacing: 1px;">${vehicle.model || 'Neznámy model'}</div>
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
    const serviceType = service.type || service.unit || 'km';
    const serviceInterval = service.interval || service.norm;
    
    if (serviceType === 'km') {
      // For km-based services, use remaining km directly
      // Always get currentKm from SHARED/vehicles_km (via cache)
      const normalizedPlate = this.selectedVehicle?.licensePlate ? this.normalizeLicensePlate(this.selectedVehicle.licensePlate) : null;
      const currentKmFromShared = normalizedPlate ? (this.cache.vehicleKms[normalizedPlate] || 0) : 0;
      const currentKm = currentKmFromShared || this.selectedVehicle?.currentKm || this.selectedVehicle?.kilometers || 0;
      // Use lastKm or lastService.km when provided (including 0), otherwise fall back to current km
      const hasLastKm = (service.lastKm !== undefined && service.lastKm !== null) || (service.lastService && typeof service.lastService.km === 'number');
      const lastServiceKm = hasLastKm ? (service.lastKm !== undefined && service.lastKm !== null ? service.lastKm : service.lastService.km) : currentKm;
      const targetKm = lastServiceKm + parseInt(serviceInterval || 0);
      const remainingKm = targetKm - currentKm;
      return remainingKm; // Negative for overdue
    } else {
      // For date-based services, calculate remaining days and convert to km
      // 1 day = 2500/7 km ≈ 357 km/day
      const kmPerDay = 2500 / 7;
      
      if (serviceType === 'specificDate' || service.unit === 'specificDate' || service.specificDate) {
        const dateValue = service.specificDate || (service.unit === 'specificDate' ? service.norm : null) || serviceInterval;
        const specific = this.parseDateFlexible(dateValue);
        if (!specific) return Infinity; // No date set, put at end
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffTime = specific - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays * kmPerDay; // Negative for overdue
      }
      
      const lastDate = service.lastDate || service.lastService?.date;
      if (!lastDate) return Infinity; // No last service, put at end
      
      const lastPerformed = this.parseDateFlexible(lastDate);
      if (!lastPerformed) return Infinity;
      
      const interval = parseInt(serviceInterval) || 0;
      const timeUnit = service.timeUnit || (serviceType === 'year' ? 'years' : serviceType === 'month' ? 'months' : serviceType === 'day' ? 'days' : 'days');
      
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
    const dokumentyServices = [];
    const servisServices = [];
    const ostatneServices = [];

    services.forEach((service, originalIndex) => {
      const serviceName = (service.name || '').toLowerCase();
      const serviceUnit = (service.unit || service.type || '').toLowerCase();
      
      // Check if it's a km-based service first (these should go to Servis, not Dokumenty)
      const isKmBased = serviceUnit === 'km' || service.type === 'km';
      
      // Check if it's a dokumenty service (STK, EK, Ciachovanie, Stiahnutie)
      // But exclude km-based services from dokumenty
      const isDokumenty = !isKmBased && (
        serviceName.includes('technická kontrola') ||
        serviceName.includes('technicka kontrola') ||
        serviceName.includes('stk') ||
        serviceName.includes('emisná kontrola') ||
        serviceName.includes('emisna kontrola') ||
        serviceName.includes('ek') ||
        serviceName.includes('ciachovanie tachografu') ||
        serviceName.includes('stiahnutie tachografu')
      );
      
      // Check if it's a servis service (km unit, Ročná, Kontrola brzd)
      const isServis = 
        isKmBased ||
        serviceName.includes('ročná kontrola') ||
        serviceName.includes('rocna kontrola') ||
        serviceName.includes('ročná prehliadka') ||
        serviceName.includes('rocna prehliadka') ||
        serviceName.includes('kontrola brzd') ||
        serviceName.includes('kontrola brźd');

      if (isDokumenty) {
        dokumentyServices.push({ service, originalIndex });
      } else if (isServis) {
        servisServices.push({ service, originalIndex });
      } else {
        ostatneServices.push({ service, originalIndex });
      }
    });

    // Sort services by proximity to due date (ascending - closest first)
    dokumentyServices.sort((a, b) => {
      const aValue = this.calculateEquivalentKmUntilDue(a.service);
      const bValue = this.calculateEquivalentKmUntilDue(b.service);
      return aValue - bValue;
    });

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
      // Normalize service: use unit as type if type doesn't exist
      const serviceType = service.type || service.unit || 'km';
      const serviceInterval = service.interval || service.norm;
      // For specificDate services, use norm if specificDate is not set
      const serviceSpecificDate = service.specificDate || (service.unit === 'specificDate' || serviceType === 'specificDate' ? (service.norm || serviceInterval) : null);
      const serviceTimeUnit = service.timeUnit || (serviceType === 'year' ? 'years' : serviceType === 'day' ? 'days' : serviceType === 'month' ? 'months' : 'days');
      
      const statusClass = this.getServiceStatusClass(service);
      return `
        <div class="service-type-card ${statusClass}">
          <div class="service-type-header">
            <div class="service-type-info">
              <h4 class="service-type-name">${service.name}</h4>
              <div class="service-type-interval">
                ${this.getServiceIntervalText(serviceType, serviceInterval, serviceSpecificDate, serviceTimeUnit)}
              </div>
            </div>
            <div class="service-timing-info">
              <div class="service-due-date">
                ${serviceType === 'km' ? this.calculateTargetKm(service) : this.calculateDueDate(service.lastDate || service.lastService?.date, serviceInterval, serviceType, serviceSpecificDate || (service.unit === 'specificDate' ? service.norm : null), serviceTimeUnit)}
              </div>
              <div class="service-remaining">
                ${serviceType === 'km' ? this.calculateRemainingKm(service) : this.calculateRemainingDays(service.lastDate || service.lastService?.date, serviceInterval, serviceType, serviceSpecificDate || (service.unit === 'specificDate' ? service.norm : null), serviceTimeUnit)}
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

    // Dokumenty section (first section)
    if (dokumentyServices.length > 0) {
      html += `
        <div class="services-section-item">
          <div class="services-section-header collapsible" onclick="window.flotilaManager.toggleServiceSection('dokumenty-section')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14,2 14,8 20,8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10,9 9,9 8,9"></polyline>
            </svg>
            <h3>Dokumenty</h3>
            <span class="service-section-count">${dokumentyServices.length}</span>
            <svg class="dropdown-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform: rotate(180deg);">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
          <div class="services-section-content collapsible-content" id="dokumenty-section">
            <div class="services-grid">
              ${dokumentyServices.map(({ service, originalIndex }) => renderServiceCard(service, originalIndex)).join('')}
            </div>
          </div>
        </div>
      `;
    }

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

    // Get km value for work session - use workKm if set, otherwise use actual vehicle km from SHARED
    const normalizedPlate = this.selectedVehicle?.licensePlate ? this.normalizeLicensePlate(this.selectedVehicle.licensePlate) : null;
    const actualVehicleKm = normalizedPlate ? (this.cache.vehicleKms[normalizedPlate] || 0) : 0;
    const workKm = activeWorkSession.workKm !== undefined && activeWorkSession.workKm !== null ? activeWorkSession.workKm : actualVehicleKm;
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
              <label for="work-current-km">Km pre službu:</label>
              <input type="number" 
                     id="work-current-km" 
                     value="${workKm}" 
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
                          ${(() => {
                            // Handle both array and object formats
                            let polozkyArray = [];
                            if (Array.isArray(item.servicePolozky)) {
                              polozkyArray = item.servicePolozky.map((polozka, i) => {
                                if (typeof polozka === 'string') {
                                  return { type: 'text', name: polozka, key: `polozka_${i}` };
                                } else if (typeof polozka === 'object') {
                                  return { ...polozka, key: polozka.key || `polozka_${i}` };
                                }
                                return { type: 'text', name: String(polozka), key: `polozka_${i}` };
                              });
                            } else if (typeof item.servicePolozky === 'object') {
                              Object.entries(item.servicePolozky).forEach(([key, value]) => {
                                if (typeof value === 'string') {
                                  polozkyArray.push({ type: 'text', name: value, key: key });
                                } else if (typeof value === 'object' && value !== null) {
                                  polozkyArray.push({ ...value, key: key });
                                }
                              });
                            }
                            
                            return polozkyArray.map((polozka) => {
                              const key = polozka.key;
                            const isCompleted = item.polozkyStatus && item.polozkyStatus[key] === true;
                            const safeKey = JSON.stringify(key);
                              
                              // Format display name
                              let displayName = polozka.name || '';
                              if (polozka.type === 'oil' && polozka.quantity) {
                                displayName = `${polozka.name} - ${polozka.quantity}L`;
                              }
                              
                              const typeBadge = polozka.type === 'oil' ? '<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px; background: #3b82f6; color: white;">Olej</span>' :
                                              polozka.type === 'part' ? '<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px; background: #10b981; color: white;">Diel</span>' :
                                              '<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px; background: #6b7280; color: white;">Text</span>';
                              
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
                                    ${typeBadge}
                                  ${isEditing ? `
                                      <input type=\"text\" value=\"${this.escapeHtmlAttr(displayName)}\" onchange=\"window.flotilaManager.updateHistoryItemDetail(${entry.id}, ${idx}, ${safeKey}, this.value)\"> 
                                  ` : `
                                      ${this.escapeHtml(displayName)}
                                  `}
                                </span>
                              </div>
                            `;
                            }).join('');
                          })()}
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
  // isBulkMode: when true, the service will be added to bulk selection instead of a vehicle
  showServiceTypeEditModal(serviceIndex = null, serviceType = null, isBulkMode = false) {
    const isEditing = serviceIndex !== null;
    this._bulkModeForServiceModal = isBulkMode;
    
    // Normalize service data for editing - map unit to type and norm to interval
    let normalizedService = null;
    if (serviceType) {
      normalizedService = { ...serviceType };
      
      // Map unit to type
      if (normalizedService.unit) {
        if (normalizedService.unit === 'km') {
          normalizedService.type = 'km';
        } else if (normalizedService.unit === 'specificDate') {
          normalizedService.type = 'specificDate';
        } else if (normalizedService.unit === 'year' || normalizedService.unit === 'day' || normalizedService.unit === 'month') {
          normalizedService.type = 'date';
          // Map unit to timeUnit
          if (normalizedService.unit === 'year') {
            normalizedService.timeUnit = 'years';
          } else if (normalizedService.unit === 'month') {
            normalizedService.timeUnit = 'months';
          } else {
            normalizedService.timeUnit = 'days';
          }
        }
      }
      
      // Map norm to interval
      if (normalizedService.norm !== undefined && normalizedService.interval === undefined) {
        normalizedService.interval = normalizedService.norm;
      }
      
      // Map lastKm to lastService if needed
      if (normalizedService.lastKm !== undefined && !normalizedService.lastService) {
        normalizedService.lastService = {
          km: normalizedService.lastKm,
          date: normalizedService.lastDate || null
        };
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
                  <input type="text" id="service-type-name" value="${normalizedService?.name || serviceType?.name || ''}" required="" placeholder="Zadajte názov servisu alebo vyberte z predvolených">
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
                    <input type="radio" name="interval-type" value="km" ${(normalizedService?.type || serviceType?.type || serviceType?.unit) === 'km' ? 'checked' : ''}>
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
                    <input type="radio" name="interval-type" value="time" ${((normalizedService?.type || serviceType?.type) === 'date' && (normalizedService?.timeUnit || serviceType?.timeUnit)) && !(normalizedService?.specificDate || serviceType?.specificDate) ? 'checked' : ''}>
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
                    <input type="radio" name="interval-type" value="specific-date" ${((normalizedService?.type || serviceType?.type) === 'date' || (normalizedService?.unit || serviceType?.unit) === 'specificDate') && (normalizedService?.specificDate || serviceType?.specificDate || serviceType?.norm) ? 'checked' : ''}>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="form-section" id="interval-polozky-section">
              <div class="section-header">
                <h4>Nastavenie intervalu</h4>
                <div class="section-line"></div>
              </div>
              
              <div class="interval-polozky" id="km-polozky" style="display: ${(normalizedService?.type || serviceType?.type || serviceType?.unit) === 'km' ? 'block' : 'none'};">
                <div class="form-group">
                  <label for="service-interval-km">Interval (km):</label>
                  <input type="number" id="service-interval-km" value="${normalizedService?.interval || serviceType?.interval || serviceType?.norm || ''}" placeholder="Napríklad: 50000">
                </div>
                <div class="form-group">
                  <label for="service-reminder-km">Upozornenie (km):</label>
                  <input type="number" id="service-reminder-km" value="${normalizedService?.reminderKm || serviceType?.reminderKm || serviceType?.signal || '15000'}" placeholder="Napríklad: 15000">
                </div>
              </div>
              
              <div class="interval-polozky" id="time-polozky" style="display: ${((normalizedService?.type || serviceType?.type) === 'date' || (normalizedService?.unit || serviceType?.unit) === 'year' || (normalizedService?.unit || serviceType?.unit) === 'day' || (normalizedService?.unit || serviceType?.unit) === 'month') && (normalizedService?.timeUnit || serviceType?.timeUnit) && !(normalizedService?.specificDate || serviceType?.specificDate || serviceType?.norm) ? 'block' : 'none'};">
                <div class="form-group">
                  <label for="service-interval-time">Interval:</label>
                  <div class="time-input-group">
                    <input type="number" id="service-interval-time" value="${normalizedService?.interval || serviceType?.interval || serviceType?.norm || ''}" placeholder="Napríklad: 6">
                    <select id="time-unit">
                      <option value="days" ${(normalizedService?.timeUnit || serviceType?.timeUnit || serviceType?.unit) === 'days' || (normalizedService?.timeUnit || serviceType?.timeUnit || serviceType?.unit) === 'day' ? 'selected' : ''}>Dní</option>
                      <option value="months" ${(normalizedService?.timeUnit || serviceType?.timeUnit || serviceType?.unit) === 'months' || (normalizedService?.timeUnit || serviceType?.timeUnit || serviceType?.unit) === 'month' ? 'selected' : ''}>Mesiacov</option>
                      <option value="years" ${(normalizedService?.timeUnit || serviceType?.timeUnit || serviceType?.unit) === 'years' || (normalizedService?.timeUnit || serviceType?.timeUnit || serviceType?.unit) === 'year' ? 'selected' : ''}>Rokov</option>
                    </select>
                  </div>
                </div>
                <div class="form-group">
                  <label for="service-reminder-time">Upozornenie:</label>
                  <div class="time-input-group">
                    <input type="number" id="service-reminder-time" value="${normalizedService?.reminderDays || serviceType?.reminderDays || serviceType?.signal || '30'}" placeholder="Napríklad: 30">
                    <select id="reminder-time-unit">
                      <option value="days">Dní</option>
                      <option value="weeks">Týždňov</option>
                      <option value="months">Mesiacov</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div class="interval-polozky" id="specific-date-polozky" style="display: ${((normalizedService?.type || serviceType?.type) === 'date' || (normalizedService?.unit || serviceType?.unit) === 'specificDate') && (normalizedService?.specificDate || serviceType?.specificDate || serviceType?.norm) ? 'block' : 'none'};">
                <div class="form-group">
                  <label for="service-specific-date">Dátum:</label>
                  <input type="date" id="service-specific-date" value="${this.getDateInputValue(normalizedService || serviceType)}">
                </div>
                <div class="form-group">
                  <label for="service-reminder-days">Upozornenie (dni):</label>
                  <input type="number" id="service-reminder-days" value="${normalizedService?.reminderDays || serviceType?.reminderDays || serviceType?.signal || '30'}" placeholder="Napríklad: 30">
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
      option.addEventListener('click', (e) => {
        // Prevent event bubbling
        e.stopPropagation();
        
        // Update radio button FIRST
        const radio = option.querySelector('input[type="radio"]');
        if (radio) {
          // Uncheck all other radios first
          intervalOptions.forEach(opt => {
            const optRadio = opt.querySelector('input[type="radio"]');
            if (optRadio) {
              optRadio.checked = false;
            }
          });
          
          // Then check this one
          radio.checked = true;
          
          // Trigger change event to ensure it's registered
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Double-check it's still checked (in case something unchecks it)
          setTimeout(() => {
            if (!radio.checked) {
              console.warn('[WARNING] Radio was unchecked, re-checking...');
              radio.checked = true;
            }
          }, 10);
        } else {
          console.error('[ERROR] Radio button not found in interval-option');
        }
        
        // Update visual selection
        intervalOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        
        // Show/hide interval polozky
        const type = option.dataset.type;
        this.showIntervalDetails(type);
      });
      
      // Also handle radio button click directly
      const radio = option.querySelector('input[type="radio"]');
      if (radio) {
        radio.addEventListener('click', (e) => {
          e.stopPropagation();
          // Ensure this radio is checked
          radio.checked = true;
          
          // Update visual selection
          intervalOptions.forEach(opt => opt.classList.remove('selected'));
          option.classList.add('selected');
          
          // Show/hide interval polozky
          const type = option.dataset.type;
          this.showIntervalDetails(type);
        });
      }
    });
    
    // Initialize selection
    const selectedOption = modal.querySelector('.interval-option input[type="radio"]:checked');
    if (selectedOption) {
      const optionElement = selectedOption.closest('.interval-option');
      if (optionElement) {
        optionElement.classList.add('selected');
        // Show interval details for initial selection
        const type = optionElement.dataset.type;
        if (type) {
          this.showIntervalDetails(type);
        }
      }
    } else {
      // If no option is pre-selected, select the first one by default for new services
      if (!isEditing && intervalOptions.length > 0) {
        const firstOption = intervalOptions[0];
        if (firstOption) {
          const firstRadio = firstOption.querySelector('input[type="radio"]');
          if (firstRadio) {
            firstRadio.checked = true;
            firstOption.classList.add('selected');
            const type = firstOption.dataset.type;
            if (type) {
              this.showIntervalDetails(type);
            }
          }
        }
      }
    }
    
    // Populate service polozky if editing
    if (isEditing && (normalizedService?.servicePolozky || serviceType?.servicePolozky)) {
      const polozkyList = modal.querySelector('#service-polozky-list');
      const noDetails = polozkyList.querySelector('.no-polozky');
      
      if (noDetails) {
        noDetails.remove();
      }
      
      // Get service polozky from normalized or original service
      const servicePolozky = normalizedService?.servicePolozky || serviceType?.servicePolozky;
      
      // Handle both object and array formats, and both structured and legacy formats
      let polozkyArray = [];
      if (Array.isArray(servicePolozky)) {
        polozkyArray = servicePolozky;
      } else if (typeof servicePolozky === 'object' && servicePolozky !== null) {
        polozkyArray = Object.entries(servicePolozky).map(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            return { ...value, key: key };
          } else {
            return { type: 'text', name: String(value), key: key };
          }
        });
      }
      
      polozkyArray.forEach((detail, index) => {
        const detailId = 'detail_' + Date.now() + '_' + index;
        const detailElement = document.createElement('div');
        detailElement.className = 'service-polozka-item';
        
        // Handle both structured and legacy string formats
        let polozkaData, displayName, type;
        if (typeof detail === 'string') {
          // Legacy format
          polozkaData = { type: 'text', name: detail };
          displayName = detail;
          type = 'text';
        } else if (typeof detail === 'object' && detail !== null) {
          // Structured format
          polozkaData = { ...detail };
          
          // Fix: If name looks like JSON, try to extract the actual name
          let partName = detail.name || '';
          if (partName && partName.startsWith('{') && partName.includes('"name"')) {
            console.warn('[WARNING] Found JSON string in part name when rendering, extracting:', partName);
            const nameMatch = partName.match(/"name"\s*:\s*"([^"]+)"/);
            if (nameMatch && nameMatch[1]) {
              partName = nameMatch[1];
              polozkaData.name = partName;
            }
          }
          
          if (detail.type === 'oil' && detail.quantity) {
            displayName = `${partName} - ${detail.quantity}L`;
          } else if (detail.type === 'part' && detail.quantity) {
            const subcategoryTitle = detail.category ? this.getSubcategoryTitle(detail.category) : '';
            displayName = subcategoryTitle ? `${subcategoryTitle} - ${partName} - ${detail.quantity}ks` : `${partName} - ${detail.quantity}ks`;
          } else {
            displayName = partName || '';
          }
          type = detail.type || 'text';
        } else {
          polozkaData = { type: 'text', name: String(detail) };
          displayName = String(detail);
          type = 'text';
        }
        
        // Clean displayName to remove any JSON artifacts
        if (displayName && (displayName.startsWith('{') || displayName.includes('"name"'))) {
          console.warn('[WARNING] displayName contains JSON when rendering, cleaning:', displayName);
          const nameMatch = displayName.match(/"name"\s*:\s*"([^"]+)"/);
          if (nameMatch && nameMatch[1]) {
            displayName = nameMatch[1];
          } else {
            displayName = displayName.replace(/[{}"]/g, '').trim();
          }
        }
        
        detailElement.dataset.polozkaData = JSON.stringify(polozkaData);
        detailElement.innerHTML = `
          <div class="polozka-header">
            <span class="polozka-type-badge" style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px; background: ${type === 'oil' ? '#3b82f6' : type === 'part' ? '#10b981' : '#6b7280'}; color: white;">
              ${type === 'oil' ? 'Olej' : type === 'part' ? 'Diel' : 'Text'}
            </span>
            <span class="polozka-name">${this.escapeHtml(displayName)}</span>
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
      const snapshot = await this._predefinedServicesCollection().orderBy('name').get();
      
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
      selectedList.innerHTML = Array.from(selectedServices).map(item => {
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
    
    if (!this.selectedVehicle) {
      alert('Prosím vyberte vozidlo pred pridávaním služieb.');
      return;
    }
    
    // Verify authentication - require email/password login, not anonymous
    const currentUser = window.auth.currentUser;
    if (!currentUser) {
      alert('Musíte byť prihlásený pre pridávanie služieb. Prosím prihláste sa cez email a heslo.');
      // Show auth section
      const authSection = document.getElementById('auth-section');
      const mainContent = document.getElementById('flotila-main-content');
      if (authSection) authSection.style.display = 'block';
      if (mainContent) mainContent.style.display = 'none';
      return;
    }
    
    // Check if user is anonymous - anonymous users don't have write permissions
    if (currentUser.isAnonymous) {
      alert('Anonymný používateľ nemá oprávnenia na zápis. Prosím prihláste sa cez email a heslo.');
      // Show auth section
      const authSection = document.getElementById('auth-section');
      const mainContent = document.getElementById('flotila-main-content');
      if (authSection) authSection.style.display = 'block';
      if (mainContent) mainContent.style.display = 'none';
      return;
    }
    
    try {
      console.log('Adding services with user:', currentUser.uid, currentUser.email || '(no email)');
      
      const serviceIds = Array.from(selectedServices).map(item => item.dataset.serviceId);
      const services = [];
      
      // Load service data for each selected service
      for (const serviceId of serviceIds) {
        const doc = await this._predefinedServicesCollection().doc(serviceId).get();
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
              km: this.selectedVehicle?.currentKm || this.selectedVehicle?.kilometers || 0
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
      
      // Update the selectedVehicle reference to ensure consistency
      this.selectedVehicle = { ...this.selectedVehicle };
      
      // Save to database
      await this.saveServices();
      
      // Close modal
      document.querySelector('.service-type-modal-overlay').remove();
      
      // Update services UI without reloading from database - keeps vehicle open
      this.updateServicesUI();
      
      // Show success message
      const serviceNames = services.map(s => s.name).join(', ');
      this.showNotification(`Pridané servisy: ${serviceNames}`, 'success');
      
    } catch (error) {
      console.error('Error adding selected services:', error);
      alert('Chyba pri pridávaní služieb: ' + error.message);
    }
  }

  // Show service detail modal for adding service polozky
  async showServicePolozkaModal() {
    // Load oils for dropdown - wait a bit for the service to be available
    let oils = [];
    let unsubscribeFn = null;
    
    // Try to get oils from OilDatabaseService
    if (window.DatabaseService && typeof window.DatabaseService.onOilsUpdate === 'function') {
      try {
        unsubscribeFn = await window.DatabaseService.onOilsUpdate((oilsList) => {
          oils = oilsList || [];
          console.log('Loaded oils:', oils.length);
        });
        // Wait a bit for initial load
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.warn('Could not load oils:', error);
      }
    } else {
      console.warn('DatabaseService.onOilsUpdate not available');
    }

    const modal = document.createElement('div');
    modal.className = 'polozka-modal-overlay';
    modal.innerHTML = `
      <div class="polozka-modal" style="max-width: 500px;">
        <div class="modal-header">
          <h3>Pridať položku servisu</h3>
          <button class="close-btn" onclick="this.closest('.polozka-modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <form id="service-polozka-form">
            <div class="form-group">
              <label>Typ položky:</label>
              <div class="polozka-type-selector">
                <label class="polozka-type-option" data-type="text">
                  <input type="radio" name="polozka-type" value="text" checked onchange="window.flotilaManager.updatePolozkaTypeFields('text')">
                  <span>Len text</span>
                </label>
                <label class="polozka-type-option" data-type="oil">
                  <input type="radio" name="polozka-type" value="oil" onchange="window.flotilaManager.updatePolozkaTypeFields('oil')">
                  <span>Olej</span>
                </label>
                <label class="polozka-type-option" data-type="part">
                  <input type="radio" name="polozka-type" value="part" onchange="window.flotilaManager.updatePolozkaTypeFields('part')">
                  <span>Diel</span>
                </label>
              </div>
            </div>
            
            <!-- Text type fields -->
            <div id="polozka-text-fields" class="polozka-type-fields">
            <div class="form-group">
              <label for="polozka-name">Názov položky:</label>
                <input type="text" id="polozka-name" placeholder="Napríklad: Olejový filter">
              </div>
            </div>
            
            <!-- Oil type fields -->
            <div id="polozka-oil-fields" class="polozka-type-fields" style="display: none;">
              <div class="form-group">
                <label for="polozka-oil-search">Vyhľadať olej:</label>
                <input type="text" id="polozka-oil-search" placeholder="Zadajte názov oleja..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 8px;">
                <select id="polozka-oil-select" size="5" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;">
                  <option value="">-- Vyberte olej --</option>
                </select>
              </div>
              <div class="form-group">
                <label for="polozka-oil-quantity">Množstvo (L):</label>
                <input type="number" id="polozka-oil-quantity" step="0.1" min="0" placeholder="Napríklad: 14" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
              </div>
            </div>
            
            <!-- Part type fields -->
            <div id="polozka-part-fields" class="polozka-type-fields" style="display: none;">
              <div class="form-group">
                <label for="polozka-part-search">Vyhľadať diel:</label>
                <input type="text" id="polozka-part-search" placeholder="Zadajte názov dielu..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 8px;">
                <select id="polozka-part-select" size="5" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;">
                  <option value="">-- Vyberte diel (zatiaľ prázdne) --</option>
                </select>
              </div>
              <div class="form-group">
                <label for="polozka-part-quantity">Množstvo (ks):</label>
                <input type="number" id="polozka-part-quantity" step="1" min="1" placeholder="Napríklad: 2" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
              </div>
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
    
    // Populate oil dropdown and setup search
    const oilSelect = modal.querySelector('#polozka-oil-select');
    const oilSearch = modal.querySelector('#polozka-oil-search');
    let allOils = [...oils];
    
    const updateOilDropdown = (filteredOils) => {
      if (!oilSelect) return;
      
      // CRITICAL: Validate this is actually the oil select element
      if (oilSelect.id !== 'polozka-oil-select') {
        console.error('[ERROR] updateOilDropdown: Wrong select element! Expected polozka-oil-select, got:', oilSelect.id);
        return;
      }
      
      // CRITICAL: Validate that we're receiving oil data, not parts data
      const validOilCategories = ['motorove', 'prevodove', 'diferencial', 'chladiaca'];
      const partCategories = ['olejove', 'naftove', 'kabinove', 'vzduchove', 'adblue', 'vysusac-vzduchu', 'ostnane', 'brzd-platnicky', 'brzd-kotuce', 'brzd-valce'];
      const invalidData = filteredOils.filter(item => {
        const category = item.category || '';
        // Check if this looks like a part category
        return partCategories.includes(category) && !validOilCategories.includes(category);
      });
      
      if (invalidData.length > 0) {
        console.error('[ERROR] updateOilDropdown: Received parts data in oil dropdown! Parts categories found:', invalidData.map(d => d.category));
        console.error('[ERROR] This indicates onOilsUpdate is returning parts data instead of oil data!');
        // Filter out invalid data
        filteredOils = filteredOils.filter(item => {
          const category = item.category || '';
          return validOilCategories.includes(category);
        });
      }
      
      oilSelect.innerHTML = '';
      if (filteredOils.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '-- Žiadne oleje načítané --';
        option.disabled = true;
        oilSelect.appendChild(option);
      } else {
        // Group oils by category - only include valid oil categories
        const oilsByCategory = {};
        filteredOils.forEach(oil => {
          const category = oil.category || 'motorove';
          // Only include valid oil categories
          if (!validOilCategories.includes(category)) {
            console.warn('[WARNING] Skipping invalid oil category:', category, 'for item:', oil.name);
            return;
          }
          if (!oilsByCategory[category]) {
            oilsByCategory[category] = [];
          }
          oilsByCategory[category].push(oil);
        });
        
        // Create optgroups for each category
        const categoryOrder = ['motorove', 'prevodove', 'diferencial', 'chladiaca'];
        categoryOrder.forEach(categoryId => {
          if (oilsByCategory[categoryId] && oilsByCategory[categoryId].length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = this.getOilCategoryTitle(categoryId);
            oilsByCategory[categoryId].forEach(oil => {
              const option = document.createElement('option');
              option.value = JSON.stringify({ id: oil.id, name: oil.name, category: oil.category });
              option.textContent = `${oil.name} (${(oil.quantity || 0).toFixed(1)}L)`;
              optgroup.appendChild(option);
            });
            oilSelect.appendChild(optgroup);
          }
        });
        
        // Add any oils with unknown categories at the end (but only if they're valid oil categories)
        Object.keys(oilsByCategory).forEach(categoryId => {
          if (!categoryOrder.includes(categoryId) && oilsByCategory[categoryId].length > 0 && validOilCategories.includes(categoryId)) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = this.getOilCategoryTitle(categoryId);
            oilsByCategory[categoryId].forEach(oil => {
              const option = document.createElement('option');
              option.value = JSON.stringify({ id: oil.id, name: oil.name, category: oil.category });
              option.textContent = `${oil.name} (${(oil.quantity || 0).toFixed(1)}L)`;
              optgroup.appendChild(option);
            });
            oilSelect.appendChild(optgroup);
          }
        });
      }
    };
    
    // Setup real-time oil updates
    if (window.DatabaseService && typeof window.DatabaseService.onOilsUpdate === 'function') {
      const realTimeUnsubscribe = await window.DatabaseService.onOilsUpdate((oilsList) => {
        const receivedData = oilsList || [];
        // Validate data before using it
        const validOilCategories = ['motorove', 'prevodove', 'diferencial', 'chladiaca'];
        const actualOils = receivedData.filter(item => {
          const category = item.category || '';
          return validOilCategories.includes(category);
        });
        
        const invalidItems = receivedData.length - actualOils.length;
        if (invalidItems > 0) {
          console.error('[ERROR] onOilsUpdate returned', invalidItems, 'items that are NOT oils! Categories:', 
            [...new Set(receivedData.filter(i => !validOilCategories.includes(i.category || '')).map(i => i.category))]);
          console.error('[ERROR] This indicates a problem with the oil database service - it may be returning parts data!');
        }
        
        allOils = actualOils;
        
        if (allOils.length === 0 && receivedData.length > 0) {
          console.warn('[WARNING] No valid oils found! All items were filtered out as parts. Check if onOilsUpdate is returning the wrong data.');
        } else if (allOils.length === 0) {
          console.warn('[WARNING] No oils loaded. Check if oils exist in Firebase collections: engine_oils, transmission_oils, differencial_oils, coolant');
        }
        
        // Make sure we're still updating the correct select
        const currentOilSelect = document.getElementById('polozka-oil-select');
        if (!currentOilSelect || currentOilSelect !== oilSelect) {
          console.error('[ERROR] Oil select element changed or missing during update!');
          return;
        }
        
        if (oilSearch && oilSearch.value) {
          // Re-filter if search is active
          const searchTerm = oilSearch.value.toLowerCase();
          const filtered = allOils.filter(oil => 
            oil.name.toLowerCase().includes(searchTerm)
          );
          updateOilDropdown(filtered);
        } else {
          updateOilDropdown(allOils);
        }
      });
      
      // Clean up on modal close
      const closeBtn = modal.querySelector('.close-btn');
      if (closeBtn) {
        const originalClose = closeBtn.onclick;
        closeBtn.onclick = function() {
          if (realTimeUnsubscribe) realTimeUnsubscribe();
          if (originalClose) originalClose.call(this);
        };
      }
    }
    
    if (oilSearch && oilSelect) {
      oilSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = allOils.filter(oil => 
          oil.name.toLowerCase().includes(searchTerm)
        );
        updateOilDropdown(filtered);
      });
    }
    
    updateOilDropdown(allOils);
    
    // Clean up old unsubscribe
    if (unsubscribeFn) {
      setTimeout(() => unsubscribeFn && unsubscribeFn(), 2000);
    }
    
    // Setup part search - will be properly initialized when parts are loaded in updatePolozkaTypeFields
    // The search event listener is set up in loadPartsIntoSelect after parts are loaded
    
    // Set initial selected state for radio buttons
    const checkedRadio = modal.querySelector('input[name="polozka-type"]:checked');
    if (checkedRadio) {
      const checkedType = checkedRadio.value;
      const selectedOption = modal.querySelector(`.polozka-type-option[data-type="${checkedType}"]`);
      if (selectedOption) {
        selectedOption.classList.add('selected');
      }
    }
    
    // Add change listeners to radio buttons to update visual state
    modal.querySelectorAll('input[name="polozka-type"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        modal.querySelectorAll('.polozka-type-option').forEach(opt => {
          opt.classList.remove('selected');
        });
        const selectedOption = modal.querySelector(`.polozka-type-option[data-type="${e.target.value}"]`);
        if (selectedOption) {
          selectedOption.classList.add('selected');
        }
      });
    });
    
    // Focus on first input
    setTimeout(() => {
      const firstInput = modal.querySelector('#polozka-name');
      if (firstInput) firstInput.focus();
    }, 100);
  }
  
  // Load and populate parts for a select dropdown
  async loadPartsIntoSelect(searchInputId, selectId) {
    // Validate that we're working with part select elements
    if (!selectId || !selectId.includes('part-select')) {
      console.error('[ERROR] loadPartsIntoSelect: Invalid selectId for parts', selectId);
      return;
    }
    if (!searchInputId || !searchInputId.includes('part-search')) {
      console.error('[ERROR] loadPartsIntoSelect: Invalid searchInputId for parts', searchInputId);
      return;
    }
    
    // CRITICAL: Never allow oil select IDs
    if (selectId.includes('oil-select')) {
      console.error('[ERROR] loadPartsIntoSelect: Attempted to load parts into oil select!', selectId);
      return;
    }
    
    const select = document.getElementById(selectId);
    const searchInput = document.getElementById(searchInputId);
    
    if (!select) {
      console.error('[ERROR] loadPartsIntoSelect: Select element not found', selectId);
      return;
    }
    
    // Triple-check this is actually a part select, not an oil select
    if (select.id !== selectId || !select.id.includes('part-select')) {
      console.error('[ERROR] loadPartsIntoSelect: Select ID mismatch or wrong type', select.id, selectId);
      return;
    }
    
    // Final safeguard: explicitly reject oil selects
    if (select.id.includes('oil-select') || select.id === 'polozka-oil-select' || select.id === 'predefined-polozka-oil-select') {
      console.error('[ERROR] loadPartsIntoSelect: This is an oil select, aborting!', select.id);
      return;
    }
    
    // Check if user is authenticated first - if not, just show empty and allow manual entry
    if (!window.auth || !window.auth.currentUser) {
      select.innerHTML = '<option value="">-- Môžete zadať diel ručne --</option>';
      return;
    }
    
    // Clear existing options
    select.innerHTML = '<option value="">-- Načítavam diely... --</option>';
    
    let parts = [];
    let unsubscribeFn = null;
    
    // Store reference to all parts for search filtering
    let allParts = [];
    
    // Setup search filtering immediately - it will work once parts are loaded
    if (searchInput) {
      // Remove any existing listeners to avoid duplicates
      const newSearchInput = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(newSearchInput, searchInput);
      const actualSearchInput = document.getElementById(searchInputId);
      
      // Set up real-time search filtering
      actualSearchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        if (allParts.length > 0) {
          this.filterPartsSelect(select, allParts, searchTerm);
        } else {
          // If parts not loaded yet, still try to filter (will be empty)
          this.filterPartsSelect(select, [], searchTerm);
        }
      });
    }
    
    // Load parts from DielyDatabaseService - wrap in try-catch to prevent redirects
    if (window.DatabaseService && typeof window.DatabaseService.onDielyUpdate === 'function') {
      try {
        // Use Promise.race with timeout to prevent hanging
        const loadPromise = window.DatabaseService.onDielyUpdate((partsList) => {
          parts = partsList || [];
          allParts = partsList || []; // Store in allParts for search
          this.populatePartsSelect(select, parts, searchInput);
          
          // If search input has a value, filter immediately
          if (searchInput && searchInput.value) {
            const searchTerm = searchInput.value.toLowerCase();
            this.filterPartsSelect(select, allParts, searchTerm);
          }
        });
        
        // Race with timeout - if loading takes too long, just show empty
        await Promise.race([
          loadPromise.then(fn => {
            unsubscribeFn = fn;
            return Promise.resolve();
          }),
          new Promise(resolve => setTimeout(resolve, 2000))
        ]);
        
        // If parts weren't loaded after 2 seconds, show empty option
        if (parts.length === 0 && select.innerHTML.includes('Načítavam')) {
          console.warn('[WARNING] Parts not loaded after 2 seconds timeout');
          select.innerHTML = '<option value="">-- Môžete zadať diel ručne --</option>';
        } else {
          allParts = parts; // Ensure allParts is set
        }
      } catch (error) {
        // Log error but don't cause redirects
        console.error('[ERROR] Parts loading error:', error);
        select.innerHTML = '<option value="">-- Môžete zadať diel ručne --</option>';
        return; // Exit early
      }
    } else {
      // If service not available, just allow manual entry
      console.warn('[WARNING] DatabaseService.onDielyUpdate not available');
      select.innerHTML = '<option value="">-- Môžete zadať diel ručne --</option>';
      return;
    }
    
    // Store unsubscribe function for cleanup
    if (unsubscribeFn && select && typeof unsubscribeFn === 'function') {
      const cleanupKey = 'diely_unsubscribe_' + Date.now();
      select.dataset.unsubscribeFn = cleanupKey;
      window[cleanupKey] = unsubscribeFn;
    }
  }
  
  // Helper function to get subcategory title from category ID
  getSubcategoryTitle(categoryId) {
    const SECTION_DEFINITIONS = [
      {
        id: 'olejove',
        title: 'Olejové filtre',
        subcategories: [
          { id: 'olejove', title: 'Olejové filtre' }
        ]
      },
      {
        id: 'vzduchove',
        title: 'Vzduchové filtre',
        subcategories: [
          { id: 'vzduchove', title: 'Vzduchové filtre' }
        ]
      },
      {
        id: 'naftove',
        title: 'Naftové filtre',
        subcategories: [
          { id: 'naftove', title: 'Naftové filtre' }
        ]
      },
      {
        id: 'kabinove',
        title: 'Kabínové filtre',
        subcategories: [
          { id: 'kabinove', title: 'Kabínové filtre' }
        ]
      },
      {
        id: 'adblue',
        title: 'Adblue filtre',
        subcategories: [
          { id: 'adblue', title: 'Adblue filtre' }
        ]
      },
      {
        id: 'vysusac-vzduchu',
        title: 'Vysušače vzduchu',
        subcategories: [
          { id: 'vysusac-vzduchu', title: 'Vysušače vzduchu' }
        ]
      },
      {
        id: 'brzd-platnicky',
        title: 'Brzdové platničky',
        subcategories: [
          { id: 'brzd-platnicky', title: 'Brzdové platničky' }
        ]
      },
      {
        id: 'brzd-kotuce',
        title: 'Brzdové kotúče',
        subcategories: [
          { id: 'brzd-kotuce', title: 'Brzdové kotúče' }
        ]
      },
      {
        id: 'brzd-valce',
        title: 'Brzdové valce',
        subcategories: [
          { id: 'brzd-valce', title: 'Brzdové valce' }
        ]
      },
      {
        id: 'ostatne',
        title: 'Ostatné',
        subcategories: [
          { id: 'ostnane', title: 'Ostatné' },
          { id: 'ostatne', title: 'Ostatné' }
        ]
      }
    ];
    
    // Find the section and subcategory title
    for (const section of SECTION_DEFINITIONS) {
      const subcategory = section.subcategories.find(sub => sub.id === categoryId);
      if (subcategory) {
        return section.title; // Return section title instead of subcategory title
      }
    }
    return categoryId; // Fallback to category ID if not found
  }

  getSectionForCategory(categoryId) {
    const SECTION_DEFINITIONS = [
      {
        id: 'olejove',
        title: 'Olejové filtre',
        subcategories: [
          { id: 'olejove', title: 'Olejové filtre' }
        ]
      },
      {
        id: 'vzduchove',
        title: 'Vzduchové filtre',
        subcategories: [
          { id: 'vzduchove', title: 'Vzduchové filtre' }
        ]
      },
      {
        id: 'naftove',
        title: 'Naftové filtre',
        subcategories: [
          { id: 'naftove', title: 'Naftové filtre' }
        ]
      },
      {
        id: 'kabinove',
        title: 'Kabínové filtre',
        subcategories: [
          { id: 'kabinove', title: 'Kabínové filtre' }
        ]
      },
      {
        id: 'adblue',
        title: 'Adblue filtre',
        subcategories: [
          { id: 'adblue', title: 'Adblue filtre' }
        ]
      },
      {
        id: 'vysusac-vzduchu',
        title: 'Vysušače vzduchu',
        subcategories: [
          { id: 'vysusac-vzduchu', title: 'Vysušače vzduchu' }
        ]
      },
      {
        id: 'brzd-platnicky',
        title: 'Brzdové platničky',
        subcategories: [
          { id: 'brzd-platnicky', title: 'Brzdové platničky' }
        ]
      },
      {
        id: 'brzd-kotuce',
        title: 'Brzdové kotúče',
        subcategories: [
          { id: 'brzd-kotuce', title: 'Brzdové kotúče' }
        ]
      },
      {
        id: 'brzd-valce',
        title: 'Brzdové valce',
        subcategories: [
          { id: 'brzd-valce', title: 'Brzdové valce' }
        ]
      },
      {
        id: 'ostatne',
        title: 'Ostatné',
        subcategories: [
          { id: 'ostnane', title: 'Ostatné' },
          { id: 'ostatne', title: 'Ostatné' }
        ]
      }
    ];
    
    for (const section of SECTION_DEFINITIONS) {
      if (section.subcategories.some(sub => sub.id === categoryId)) {
        return section.id;
      }
    }
    return 'ostatne'; // Default to "ostatne" if not found
  }

  // Populate parts select dropdown
  populatePartsSelect(select, parts, searchInput = null) {
    if (!select) {
      console.error('[ERROR] populatePartsSelect: select is null');
      return;
    }
    
    
    // Make absolutely sure this is a part select, not an oil select
    if (!select.id || !select.id.includes('part-select')) {
      console.error('[ERROR] populatePartsSelect: Wrong select element - this is not a part select!', select.id);
      return; // Don't populate wrong select
    }
    
    // Triple check it's not an oil select - explicit ID checks
    if (select.id.includes('oil-select') || 
        select.id === 'polozka-oil-select' || 
        select.id === 'predefined-polozka-oil-select' ||
        select.id.startsWith('work-item-oil-select')) {
      console.error('[ERROR] populatePartsSelect: This is an oil select, not a part select!', select.id);
      return; // Don't populate oil select with parts
    }
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const filteredParts = searchTerm 
      ? parts.filter(part => {
          const sectionTitle = this.getSubcategoryTitle(part.category || 'olejove');
          return sectionTitle.toLowerCase().includes(searchTerm) || 
                 part.name.toLowerCase().includes(searchTerm);
        })
      : parts;
    
    if (filteredParts.length === 0) {
      select.innerHTML = '<option value="">-- Žiadne diely nenájdené --</option>';
      return;
    }
    
    // Group parts by section
    const SECTION_DEFINITIONS = [
      {
        id: 'olejove',
        title: 'Olejové filtre',
        subcategories: ['olejove']
      },
      {
        id: 'vzduchove',
        title: 'Vzduchové filtre',
        subcategories: ['vzduchove']
      },
      {
        id: 'naftove',
        title: 'Naftové filtre',
        subcategories: ['naftove']
      },
      {
        id: 'kabinove',
        title: 'Kabínové filtre',
        subcategories: ['kabinove']
      },
      {
        id: 'adblue',
        title: 'Adblue filtre',
        subcategories: ['adblue']
      },
      {
        id: 'vysusac-vzduchu',
        title: 'Vysušače vzduchu',
        subcategories: ['vysusac-vzduchu']
      },
      {
        id: 'brzd-platnicky',
        title: 'Brzdové platničky',
        subcategories: ['brzd-platnicky']
      },
      {
        id: 'brzd-kotuce',
        title: 'Brzdové kotúče',
        subcategories: ['brzd-kotuce']
      },
      {
        id: 'brzd-valce',
        title: 'Brzdové valce',
        subcategories: ['brzd-valce']
      },
      {
        id: 'ostatne',
        title: 'Ostatné',
        subcategories: ['ostnane', 'ostatne']
      }
    ];
    
    // Group parts by section
    const partsBySection = {};
    filteredParts.forEach(part => {
      const categoryId = part.category || 'olejove';
      const sectionId = this.getSectionForCategory(categoryId);
      if (!partsBySection[sectionId]) {
        partsBySection[sectionId] = [];
      }
      partsBySection[sectionId].push(part);
    });
    
    // Build HTML with optgroups
    let html = '';
    SECTION_DEFINITIONS.forEach(section => {
      const sectionParts = partsBySection[section.id];
      if (sectionParts && sectionParts.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = section.title;
        
        sectionParts.forEach(part => {
          const categoryId = part.category || 'olejove';
          const partInfo = JSON.stringify({
            id: part.id,
            name: part.name,
            category: categoryId
          });
          // CRITICAL: Don't use escapeHtml on JSON - it breaks JSON parsing by escaping quotes and braces
          // Only escape quotes for HTML attribute safety
          const escapedPartInfo = partInfo.replace(/"/g, '&quot;');
          const option = document.createElement('option');
          option.value = escapedPartInfo;
          option.textContent = `${part.name} (${part.quantity || 0} ks)`;
          optgroup.appendChild(option);
        });
        
        html += optgroup.outerHTML;
      }
    });
    
    select.innerHTML = html || '<option value="">-- Žiadne diely nenájdené --</option>';
  }
  
  // Filter parts select dropdown
  filterPartsSelect(select, parts, searchTerm) {
    if (!select || !parts) return;
    
    // Make absolutely sure this is a part select, not an oil select
    if (!select.id || !select.id.includes('part-select')) {
      console.error('filterPartsSelect: Wrong select element - this is not a part select!', select.id);
      return; // Don't filter wrong select
    }
    
    // Triple check it's not an oil select - explicit ID checks
    if (select.id.includes('oil-select') || 
        select.id === 'polozka-oil-select' || 
        select.id === 'predefined-polozka-oil-select' ||
        select.id.startsWith('work-item-oil-select')) {
      console.error('filterPartsSelect: This is an oil select, not a part select!', select.id);
      return; // Don't filter oil select
    }
    
    const filteredParts = searchTerm 
      ? parts.filter(part => {
          const sectionTitle = this.getSubcategoryTitle(part.category || 'olejove');
          return sectionTitle.toLowerCase().includes(searchTerm) || 
                 part.name.toLowerCase().includes(searchTerm);
        })
      : parts;
    
    // Use the same populatePartsSelect function for consistency (with optgroups)
    this.populatePartsSelect(select, filteredParts, null);
  }

  // Update polozka type fields visibility
  async updatePolozkaTypeFields(type) {
    const textFields = document.getElementById('polozka-text-fields');
    const oilFields = document.getElementById('polozka-oil-fields');
    const partFields = document.getElementById('polozka-part-fields');
    
    if (textFields) textFields.style.display = type === 'text' ? 'block' : 'none';
    if (oilFields) oilFields.style.display = type === 'oil' ? 'block' : 'none';
    if (partFields) partFields.style.display = type === 'part' ? 'block' : 'none';
    
    // Load parts ONLY if part type is selected - ensure we're using the correct select
    if (type === 'part' && partFields) {
      const partSelect = document.getElementById('polozka-part-select');
      const oilSelect = document.getElementById('polozka-oil-select');
      // Make sure we're not accidentally affecting oil select
      if (partSelect && partSelect.id === 'polozka-part-select') {
        await this.loadPartsIntoSelect('polozka-part-search', 'polozka-part-select');
      }
    }
    
    // Update radio button visual state
    const modal = document.querySelector('.polozka-modal-overlay');
    if (modal) {
      modal.querySelectorAll('.polozka-type-option').forEach(opt => {
        opt.classList.remove('selected');
      });
      const selectedOption = modal.querySelector(`.polozka-type-option[data-type="${type}"]`);
      if (selectedOption) {
        selectedOption.classList.add('selected');
      }
    }
  }

  // Update predefined polozka type fields visibility
  async updatePredefinedPolozkaTypeFields(type) {
    const textFields = document.getElementById('predefined-polozka-text-fields');
    const oilFields = document.getElementById('predefined-polozka-oil-fields');
    const partFields = document.getElementById('predefined-polozka-part-fields');
    
    if (textFields) textFields.style.display = type === 'text' ? 'block' : 'none';
    if (oilFields) oilFields.style.display = type === 'oil' ? 'block' : 'none';
    if (partFields) partFields.style.display = type === 'part' ? 'block' : 'none';
    
    // Load parts if part type is selected
    if (type === 'part' && partFields) {
      await this.loadPartsIntoSelect('predefined-polozka-part-search', 'predefined-polozka-part-select');
    }
    
    // Update radio button visual state
    const modal = document.querySelector('.polozka-modal-overlay');
    if (modal) {
      modal.querySelectorAll('.polozka-type-option').forEach(opt => {
        opt.classList.remove('selected');
      });
      const selectedOption = modal.querySelector(`.polozka-type-option[data-type="${type}"]`);
      if (selectedOption) {
        selectedOption.classList.add('selected');
      }
    }
  }

  // Add service detail to the list
  addServicePolozka() {
    const modal = document.querySelector('.polozka-modal-overlay');
    const typeRadio = modal.querySelector('input[name="polozka-type"]:checked');
    const type = typeRadio ? typeRadio.value : 'text';
    
    
    let polozkaData = { type: type };
    let displayName = '';
    
    if (type === 'text') {
      const name = document.getElementById('polozka-name').value.trim();
    if (!name) {
      alert('Prosím vyplňte názov položky.');
      return;
      }
      polozkaData.name = name;
      displayName = name;
    } else if (type === 'oil') {
      const oilSelect = document.getElementById('polozka-oil-select');
      const quantityInput = document.getElementById('polozka-oil-quantity');
      
      // DEBUG: Check if oil select has parts in it
      if (oilSelect && oilSelect.options.length > 0) {
        const firstOption = oilSelect.options[0];
        if (firstOption.value && firstOption.value.includes('"category"')) {
          const parsed = JSON.parse(firstOption.value);
          // Check if the category is a parts category (not an oil category)
          // 'olejove' in parts means "oil filters", not actual oils!
          if (parsed.category && this.isPartsCategory(parsed.category)) {
            console.error('[ERROR] Oil select contains parts items! Category:', parsed.category, '(olejove means oil filters in parts, not oils!)');
          } else if (parsed.category && !this.isOilCategory(parsed.category)) {
            console.warn('[WARNING] Oil select contains unknown category:', parsed.category);
          }
        }
      }
      
      if (!oilSelect || !oilSelect.value) {
        alert('Prosím vyberte olej.');
        return;
      }
      
      const quantity = parseFloat(quantityInput.value);
      if (isNaN(quantity) || quantity <= 0) {
        alert('Prosím zadajte platné množstvo v litroch.');
        return;
      }
      
      try {
        const oilInfo = JSON.parse(oilSelect.value);
        
        // Validate that this is actually an oil, not a part
        if (oilInfo.category && this.isPartsCategory(oilInfo.category)) {
          console.error('[ERROR] Selected item is a part, not an oil! Category:', oilInfo.category);
          alert('Chyba: Vybratá položka je diel, nie olej. Prosím vyberte olej z kategórie motorových, prevodových, diferenciálnych olejov alebo chladiacej kvapaliny.');
          return;
        }
        
        if (oilInfo.category && !this.isOilCategory(oilInfo.category)) {
          console.warn('[WARNING] Unknown oil category:', oilInfo.category);
        }
        
        polozkaData.oilId = oilInfo.id;
        polozkaData.category = oilInfo.category;
        polozkaData.name = oilInfo.name;
        polozkaData.quantity = quantity;
        displayName = `${oilInfo.name} - ${quantity}L`;
      } catch (e) {
        console.error('[ERROR] Failed to parse oil info:', e, 'Value:', oilSelect.value);
        alert('Chyba pri načítaní informácií o oleji. Skúste to znova.');
        return;
      }
    } else if (type === 'part') {
      const partSelect = document.getElementById('polozka-part-select');
      const quantityInput = document.getElementById('polozka-part-quantity');
      
      // For now, allow manual entry if no part selected
      let partName = '';
      let partCategory = null;
      if (partSelect && partSelect.value) {
        const rawValue = partSelect.value;
        
        try {
          // CRITICAL: Unescape HTML entities before parsing JSON
          // The browser may return &quot; instead of " in attribute values
          const unescapedValue = rawValue
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
          
          const partInfo = JSON.parse(unescapedValue);
          partName = partInfo.name || '';
          polozkaData.partId = partInfo.id;
          polozkaData.category = partInfo.category || 'olejove';
          partCategory = partInfo.category || 'olejove';
          
          if (!partName || partName.trim() === '') {
            console.error('[ERROR] Part name is empty after parsing:', partInfo);
            alert('Chyba: Názov dielu je prázdny. Skúste vybrať diel znova.');
            return;
          }
        } catch (e) {
          console.error('[ERROR] Failed to parse part JSON:', e, 'Raw value:', rawValue);
          // If JSON.parse fails, try to extract name from JSON string manually
          const valueStr = rawValue;
          // Try to extract name from JSON string like {"id":"...","name":"Part Name","category":"..."}
          const nameMatch = valueStr.match(/"name"\s*:\s*"([^"]+)"/);
          if (nameMatch && nameMatch[1]) {
            partName = nameMatch[1];
            // Try to extract category too
            const categoryMatch = valueStr.match(/"category"\s*:\s*"([^"]+)"/);
            if (categoryMatch && categoryMatch[1]) {
              partCategory = categoryMatch[1];
              polozkaData.category = categoryMatch[1];
            }
          } else {
            // If we can't extract, this is a serious error
            console.error('[ERROR] Could not extract part name from value:', valueStr);
            alert('Chyba pri načítaní informácií o diele. Skúste vybrať diel znova alebo ho zadajte ručne.');
            return;
          }
        }
      } else {
        // Manual entry fallback
        const manualInput = document.getElementById('polozka-part-search');
        if (manualInput && manualInput.value.trim()) {
          partName = manualInput.value.trim();
        } else {
          alert('Prosím vyberte alebo zadajte názov dielu.');
          return;
        }
      }
      
      // Ensure we have a valid part name
      if (!partName || partName.trim() === '') {
        console.error('[ERROR] Part name is empty after all processing');
        alert('Prosím vyberte alebo zadajte názov dielu.');
        return;
      }
      
      const quantity = parseInt(quantityInput.value);
      if (isNaN(quantity) || quantity <= 0) {
        alert('Prosím zadajte platné množstvo v kusoch.');
        return;
      }
      
      const finalPartName = partName.trim();
      
      polozkaData.name = finalPartName;
      polozkaData.quantity = quantity;
      const subcategoryTitle = partCategory ? this.getSubcategoryTitle(partCategory) : '';
      displayName = partCategory ? `${subcategoryTitle} - ${finalPartName} - ${quantity}ks` : `${finalPartName} - ${quantity}ks`;
    }
    
    // Add to service polozky list
    const polozkyList = document.getElementById('service-polozky-list');
    const noDetails = polozkyList.querySelector('.no-polozky');
    
    if (noDetails) {
      noDetails.remove();
    }
    
    // Final validation before adding
    if (!displayName || displayName.trim() === '') {
      console.error('[ERROR] displayName is empty, cannot add polozka');
      alert('Chyba: Názov položky je prázdny.');
      return;
    }
    
    if (!polozkaData.name || polozkaData.name.trim() === '') {
      console.error('[ERROR] polozkaData.name is empty, cannot add polozka');
      alert('Chyba: Názov položky je prázdny.');
      return;
    }
    
    const detailId = 'detail_' + Date.now();
    const detailElement = document.createElement('div');
    detailElement.className = 'service-polozka-item';
    detailElement.dataset.polozkaData = JSON.stringify(polozkaData);
    
    // Ensure displayName doesn't contain JSON or special characters that would break display
    const safeDisplayName = displayName.replace(/[{}"]/g, '').trim();
    if (safeDisplayName !== displayName) {
      console.warn('[WARNING] displayName contained special chars, cleaned:', displayName, '->', safeDisplayName);
    }
    
    detailElement.innerHTML = `
      <div class="polozka-header">
        <span class="polozka-type-badge" style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px; background: ${type === 'oil' ? '#3b82f6' : type === 'part' ? '#10b981' : '#6b7280'}; color: white;">
          ${type === 'oil' ? 'Olej' : type === 'part' ? 'Diel' : 'Text'}
        </span>
        <span class="polozka-name">${this.escapeHtml(safeDisplayName)}</span>
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
    if (!polozkyList) return [];
    
    const polozky = [];
    const detailItems = polozkyList.querySelectorAll('.service-polozka-item');
    
    detailItems.forEach((item, index) => {
      const polozkaDataStr = item.dataset.polozkaData;
      if (polozkaDataStr) {
        try {
          const polozkaData = JSON.parse(polozkaDataStr);
          polozky.push(polozkaData);
        } catch (e) {
          // Fallback: try to get from text content
          const nameElement = item.querySelector('.polozka-name');
      if (nameElement) {
        const name = nameElement.textContent.trim();
            // Remove type badge text if present
            const cleanName = name.replace(/^(Olej|Diel|Text)\s*/, '').trim();
            polozky.push({ type: 'text', name: cleanName });
          }
        }
      } else {
        // Legacy support: get from text content
        const nameElement = item.querySelector('.polozka-name');
        if (nameElement) {
          const name = nameElement.textContent.trim();
          const cleanName = name.replace(/^(Olej|Diel|Text)\s*/, '').trim();
          polozky.push({ type: 'text', name: cleanName });
        }
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
        const doc = await this._predefinedServicesCollection().doc(serviceId).get();
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
      // Handle both array and legacy string array formats
      const polozkyArray = Array.isArray(serviceData.servicePolozky) 
        ? serviceData.servicePolozky 
        : Object.values(serviceData.servicePolozky || {});
      
      polozkyArray.forEach((detail, index) => {
        const detailId = 'predefined_detail_' + Date.now() + '_' + index;
        const detailElement = document.createElement('div');
        detailElement.className = 'service-polozka-item';
        
        // Handle both structured and legacy string formats
        let polozkaData, displayName, type;
        if (typeof detail === 'string') {
          // Legacy format
          polozkaData = { type: 'text', name: detail };
          displayName = detail;
          type = 'text';
        } else if (typeof detail === 'object' && detail !== null) {
          // Structured format
          polozkaData = { ...detail };
          if (detail.type === 'oil' && detail.quantity) {
            displayName = `${detail.name} - ${detail.quantity}L`;
          } else {
            displayName = detail.name || '';
          }
          type = detail.type || 'text';
        } else {
          polozkaData = { type: 'text', name: String(detail) };
          displayName = String(detail);
          type = 'text';
        }
        
        detailElement.dataset.polozkaData = JSON.stringify(polozkaData);
        detailElement.innerHTML = `
          <div class="polozka-header">
            <span class="polozka-type-badge" style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px; background: ${type === 'oil' ? '#3b82f6' : type === 'part' ? '#10b981' : '#6b7280'}; color: white;">
              ${type === 'oil' ? 'Olej' : type === 'part' ? 'Diel' : 'Text'}
            </span>
            <span class="polozka-name">${this.escapeHtml(displayName)}</span>
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
  async showPredefinedServicePolozkaModal() {
    // Load oils for dropdown - wait a bit for the service to be available
    let oils = [];
    let unsubscribeFn = null;
    
    // Try to get oils from OilDatabaseService
    if (window.DatabaseService && typeof window.DatabaseService.onOilsUpdate === 'function') {
      try {
        unsubscribeFn = await window.DatabaseService.onOilsUpdate((oilsList) => {
          oils = oilsList || [];
          console.log('Loaded oils:', oils.length);
        });
        // Wait a bit for initial load
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.warn('Could not load oils:', error);
      }
    } else {
      console.warn('DatabaseService.onOilsUpdate not available');
    }

    const modal = document.createElement('div');
    modal.className = 'polozka-modal-overlay';
    modal.innerHTML = `
      <div class="polozka-modal" style="max-width: 500px;">
        <div class="modal-header">
          <h3>Pridať položku servisu</h3>
          <button class="close-btn" onclick="this.closest('.polozka-modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <form id="predefined-service-polozka-form">
            <div class="form-group">
              <label>Typ položky:</label>
              <div class="polozka-type-selector">
                <label class="polozka-type-option" data-type="text">
                  <input type="radio" name="predefined-polozka-type" value="text" checked onchange="window.flotilaManager.updatePredefinedPolozkaTypeFields('text')">
                  <span>Len text</span>
                </label>
                <label class="polozka-type-option" data-type="oil">
                  <input type="radio" name="predefined-polozka-type" value="oil" onchange="window.flotilaManager.updatePredefinedPolozkaTypeFields('oil')">
                  <span>Olej</span>
                </label>
                <label class="polozka-type-option" data-type="part">
                  <input type="radio" name="predefined-polozka-type" value="part" onchange="window.flotilaManager.updatePredefinedPolozkaTypeFields('part')">
                  <span>Diel</span>
                </label>
              </div>
            </div>
            
            <!-- Text type fields -->
            <div id="predefined-polozka-text-fields" class="polozka-type-fields">
            <div class="form-group">
              <label for="predefined-polozka-name">Názov položky:</label>
                <input type="text" id="predefined-polozka-name" placeholder="Napríklad: Olejový filter">
              </div>
            </div>
            
            <!-- Oil type fields -->
            <div id="predefined-polozka-oil-fields" class="polozka-type-fields" style="display: none;">
              <div class="form-group">
                <label for="predefined-polozka-oil-search">Vyhľadať olej:</label>
                <input type="text" id="predefined-polozka-oil-search" placeholder="Zadajte názov oleja..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 8px;">
                <select id="predefined-polozka-oil-select" size="5" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;">
                  <option value="">-- Vyberte olej --</option>
                </select>
              </div>
              <div class="form-group">
                <label for="predefined-polozka-oil-quantity">Množstvo (L):</label>
                <input type="number" id="predefined-polozka-oil-quantity" step="0.1" min="0" placeholder="Napríklad: 14" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
              </div>
            </div>
            
            <!-- Part type fields -->
            <div id="predefined-polozka-part-fields" class="polozka-type-fields" style="display: none;">
              <div class="form-group">
                <label for="predefined-polozka-part-search">Vyhľadať diel:</label>
                <input type="text" id="predefined-polozka-part-search" placeholder="Zadajte názov dielu..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 8px;">
                <select id="predefined-polozka-part-select" size="5" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;">
                  <option value="">-- Vyberte diel (zatiaľ prázdne) --</option>
                </select>
              </div>
              <div class="form-group">
                <label for="predefined-polozka-part-quantity">Množstvo (ks):</label>
                <input type="number" id="predefined-polozka-part-quantity" step="1" min="1" placeholder="Napríklad: 2" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
              </div>
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
    
    // Populate oil dropdown and setup search
    const oilSelect = modal.querySelector('#predefined-polozka-oil-select');
    const oilSearch = modal.querySelector('#predefined-polozka-oil-search');
    let allOils = [...oils];
    
    const updateOilDropdown = (filteredOils) => {
      if (!oilSelect) return;
      oilSelect.innerHTML = '';
      if (filteredOils.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '-- Žiadne oleje načítané --';
        option.disabled = true;
        oilSelect.appendChild(option);
      } else {
        // Group oils by category
        const oilsByCategory = {};
        filteredOils.forEach(oil => {
          const category = oil.category || 'motorove';
          if (!oilsByCategory[category]) {
            oilsByCategory[category] = [];
          }
          oilsByCategory[category].push(oil);
        });
        
        // Create optgroups for each category
        const categoryOrder = ['motorove', 'prevodove', 'diferencial', 'chladiaca'];
        categoryOrder.forEach(categoryId => {
          if (oilsByCategory[categoryId] && oilsByCategory[categoryId].length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = this.getOilCategoryTitle(categoryId);
            oilsByCategory[categoryId].forEach(oil => {
              const option = document.createElement('option');
              option.value = JSON.stringify({ id: oil.id, name: oil.name, category: oil.category });
              option.textContent = `${oil.name} (${(oil.quantity || 0).toFixed(1)}L)`;
              optgroup.appendChild(option);
            });
            oilSelect.appendChild(optgroup);
          }
        });
        
        // Add any oils with unknown categories at the end
        Object.keys(oilsByCategory).forEach(categoryId => {
          if (!categoryOrder.includes(categoryId) && oilsByCategory[categoryId].length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = this.getOilCategoryTitle(categoryId);
            oilsByCategory[categoryId].forEach(oil => {
              const option = document.createElement('option');
              option.value = JSON.stringify({ id: oil.id, name: oil.name, category: oil.category });
              option.textContent = `${oil.name} (${(oil.quantity || 0).toFixed(1)}L)`;
              optgroup.appendChild(option);
            });
            oilSelect.appendChild(optgroup);
          }
        });
      }
    };
    
    // Setup real-time oil updates
    if (window.DatabaseService && typeof window.DatabaseService.onOilsUpdate === 'function') {
      const realTimeUnsubscribe = await window.DatabaseService.onOilsUpdate((oilsList) => {
        allOils = oilsList || [];
        console.log('Oils updated in predefined modal:', allOils.length);
        if (oilSearch && oilSearch.value) {
          // Re-filter if search is active
          const searchTerm = oilSearch.value.toLowerCase();
          const filtered = allOils.filter(oil => 
            oil.name.toLowerCase().includes(searchTerm)
          );
          updateOilDropdown(filtered);
        } else {
          updateOilDropdown(allOils);
        }
      });
      
      // Clean up on modal close
      const closeBtn = modal.querySelector('.close-btn');
      if (closeBtn) {
        const originalClose = closeBtn.onclick;
        closeBtn.onclick = function() {
          if (realTimeUnsubscribe) realTimeUnsubscribe();
          if (originalClose) originalClose.call(this);
        };
      }
    }
    
    if (oilSearch && oilSelect) {
      oilSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = allOils.filter(oil => 
          oil.name.toLowerCase().includes(searchTerm)
        );
        updateOilDropdown(filtered);
      });
    }
    
    updateOilDropdown(allOils);
    
    // Clean up old unsubscribe
    if (unsubscribeFn) {
      setTimeout(() => unsubscribeFn && unsubscribeFn(), 2000);
    }
    
    // Setup part search (empty for now, can be populated later)
    const partSearch = modal.querySelector('#predefined-polozka-part-search');
    if (partSearch) {
      partSearch.addEventListener('input', (e) => {
        // Placeholder for future parts search
        console.log('Parts search:', e.target.value);
      });
    }
    
    // Set initial selected state for radio buttons
    const checkedRadio = modal.querySelector('input[name="predefined-polozka-type"]:checked');
    if (checkedRadio) {
      const checkedType = checkedRadio.value;
      const selectedOption = modal.querySelector(`.polozka-type-option[data-type="${checkedType}"]`);
      if (selectedOption) {
        selectedOption.classList.add('selected');
      }
    }
    
    // Add change listeners to radio buttons to update visual state
    modal.querySelectorAll('input[name="predefined-polozka-type"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        modal.querySelectorAll('.polozka-type-option').forEach(opt => {
          opt.classList.remove('selected');
        });
        const selectedOption = modal.querySelector(`.polozka-type-option[data-type="${e.target.value}"]`);
        if (selectedOption) {
          selectedOption.classList.add('selected');
        }
      });
    });
    
    // Focus on first input
    setTimeout(() => {
      const firstInput = modal.querySelector('#predefined-polozka-name');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  // Add predefined service detail to the list
  addPredefinedServicePolozka() {
    const modal = document.querySelector('.polozka-modal-overlay');
    const typeRadio = modal.querySelector('input[name="predefined-polozka-type"]:checked');
    const type = typeRadio ? typeRadio.value : 'text';
    
    let polozkaData = { type: type };
    let displayName = '';
    
    if (type === 'text') {
      const name = document.getElementById('predefined-polozka-name').value.trim();
    if (!name) {
      alert('Prosím vyplňte názov položky.');
      return;
      }
      polozkaData.name = name;
      displayName = name;
    } else if (type === 'oil') {
      const oilSelect = document.getElementById('predefined-polozka-oil-select');
      const quantityInput = document.getElementById('predefined-polozka-oil-quantity');
      
      if (!oilSelect || !oilSelect.value) {
        alert('Prosím vyberte olej.');
        return;
      }
      
      const quantity = parseFloat(quantityInput.value);
      if (isNaN(quantity) || quantity <= 0) {
        alert('Prosím zadajte platné množstvo v litroch.');
        return;
      }
      
      const oilInfo = JSON.parse(oilSelect.value);
      polozkaData.oilId = oilInfo.id;
      polozkaData.category = oilInfo.category;
      polozkaData.name = oilInfo.name;
      polozkaData.quantity = quantity;
      displayName = `${oilInfo.name} - ${quantity}L`;
    } else if (type === 'part') {
      const partSelect = document.getElementById('predefined-polozka-part-select');
      const quantityInput = document.getElementById('predefined-polozka-part-quantity');
      
      // For now, allow manual entry if no part selected
      let partName = '';
      let partCategory = null;
      if (partSelect && partSelect.value) {
        try {
          const partInfo = JSON.parse(partSelect.value);
          partName = partInfo.name;
          polozkaData.partId = partInfo.id;
          polozkaData.category = partInfo.category || 'olejove';
          partCategory = partInfo.category || 'olejove';
        } catch (e) {
          partName = partSelect.value;
        }
      } else {
        // Manual entry fallback
        const manualInput = document.getElementById('predefined-polozka-part-search');
        if (manualInput && manualInput.value.trim()) {
          partName = manualInput.value.trim();
        } else {
          alert('Prosím vyberte alebo zadajte názov dielu.');
          return;
        }
      }
      
      const quantity = parseInt(quantityInput.value);
      if (isNaN(quantity) || quantity <= 0) {
        alert('Prosím zadajte platné množstvo v kusoch.');
        return;
      }
      
      polozkaData.name = partName;
      polozkaData.quantity = quantity;
      const subcategoryTitle = partCategory ? this.getSubcategoryTitle(partCategory) : '';
      displayName = partCategory ? `${subcategoryTitle} - ${partName} - ${quantity}ks` : `${partName} - ${quantity}ks`;
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
    detailElement.dataset.polozkaData = JSON.stringify(polozkaData);
    detailElement.innerHTML = `
      <div class="polozka-header">
        <span class="polozka-type-badge" style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px; background: ${type === 'oil' ? '#3b82f6' : type === 'part' ? '#10b981' : '#6b7280'}; color: white;">
          ${type === 'oil' ? 'Olej' : type === 'part' ? 'Diel' : 'Text'}
        </span>
        <span class="polozka-name">${this.escapeHtml(displayName)}</span>
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
    if (!polozkyList) return [];
    
    const polozky = [];
    const detailItems = polozkyList.querySelectorAll('.service-polozka-item');
    
    detailItems.forEach((item, index) => {
      const polozkaDataStr = item.dataset.polozkaData;
      if (polozkaDataStr) {
        try {
          const polozkaData = JSON.parse(polozkaDataStr);
          polozky.push(polozkaData);
        } catch (e) {
          // Fallback: try to get from text content
          const nameElement = item.querySelector('.polozka-name');
      if (nameElement) {
        const name = nameElement.textContent.trim();
            const cleanName = name.replace(/^(Olej|Diel|Text)\s*/, '').trim();
            polozky.push({ type: 'text', name: cleanName });
          }
        }
      } else {
        // Legacy support: get from text content
        const nameElement = item.querySelector('.polozka-name');
        if (nameElement) {
          const name = nameElement.textContent.trim();
          const cleanName = name.replace(/^(Olej|Diel|Text)\s*/, '').trim();
          polozky.push({ type: 'text', name: cleanName });
        }
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
    if (servicePolozky && servicePolozky.length > 0) {
      // Store as array of structured objects
      serviceData.servicePolozky = servicePolozky.map((polozka, idx) => ({
        ...polozka,
        key: polozka.key || `polozka_${idx}`
      }));
    }

    try {
      if (serviceId) {
        // Update existing service
        await this._predefinedServicesCollection().doc(serviceId).update(serviceData);
        this.showNotification('Preddefinovaný servis bol aktualizovaný', 'success');
      } else {
        // Create new service
        serviceData.createdAt = new Date();
        await this._predefinedServicesCollection().add(serviceData);
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
      await this._predefinedServicesCollection().doc(serviceId).delete();
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
      const snapshot = await this._predefinedServicesCollection().orderBy('name').get();
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
    const isBulkMode = this._bulkModeForServiceModal === true;
    
    // Only check for selected vehicle if not in bulk mode
    if (!isBulkMode && !this.selectedVehicle) {
      alert('Prosím vyberte vozidlo pred pridávaním služieb.');
      return;
    }
    
    // Ensure user is authenticated (non-anonymous) - always required
    const currentUser = window.auth?.currentUser;
    if (!currentUser) {
      this.showNotification('Musíte byť prihlásený pre pridávanie služieb. Prosím prihláste sa cez email a heslo.', 'error');
      // Show auth section
      const authSection = document.getElementById('auth-section');
      const mainContent = document.getElementById('flotila-main-content');
      if (authSection) authSection.style.display = 'block';
      if (mainContent) mainContent.style.display = 'none';
      return;
    }
    
    // Check if user is anonymous - anonymous users don't have write permissions
    if (currentUser.isAnonymous) {
      this.showNotification('Anonymný používateľ nemá oprávnenia na zápis. Prosím prihláste sa cez email a heslo.', 'error');
      // Show auth section
      const authSection = document.getElementById('auth-section');
      const mainContent = document.getElementById('flotila-main-content');
      if (authSection) authSection.style.display = 'block';
      if (mainContent) mainContent.style.display = 'none';
      return;
    }
    
    const modal = document.querySelector('.service-type-modal-overlay');
    if (!modal) {
      console.error('[ERROR] Modal not found');
      alert('Chyba: Modal sa nenašiel. Skúste to znova.');
      return;
    }
    
    const nameInput = document.getElementById('service-type-name');
    if (!nameInput) {
      console.error('[ERROR] Name input not found');
      alert('Chyba: Pole pre názov servisu sa nenašlo. Skúste to znova.');
      return;
    }
    
    const name = nameInput.value.trim();
    
    // First, ensure radio button is checked if interval-option has selected class
    const selectedOption = modal.querySelector('.interval-option.selected');
    if (selectedOption) {
      const radio = selectedOption.querySelector('input[name="interval-type"]');
      if (radio && !radio.checked) {
        radio.checked = true;
      }
    }
    
    // Now find the selected radio button
    const selectedType = modal.querySelector('input[name="interval-type"]:checked');
    const type = selectedType ? selectedType.value : '';
    
    if (selectedOption) {
      const radioInOption = selectedOption.querySelector('input[name="interval-type"]');
    }
    
    if (!name) {
      alert('Prosím vyplňte názov servisu.');
      nameInput.focus();
      return;
    }
    
    if (!type) {
      alert('Prosím vyberte typ intervalu (Kilometre, Čas alebo Špecifický dátum).');
      // Try to focus first interval option
      const firstIntervalOption = modal.querySelector('input[name="interval-type"]');
      if (firstIntervalOption) {
        firstIntervalOption.closest('.interval-option')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    
    const serviceData = {
      name,
      type
    };
    
    // Handle different interval types - convert to new structure (unit, norm)
    switch (type) {
      case 'km':
        const intervalKm = document.getElementById('service-interval-km').value;
        const reminderKm = document.getElementById('service-reminder-km').value;
        
        if (!intervalKm) {
          alert('Prosím vyplňte interval v kilometroch.');
          return;
        }
        
        serviceData.unit = 'km';
        serviceData.norm = parseInt(intervalKm);
        serviceData.interval = parseInt(intervalKm); // Keep for backward compatibility
        if (reminderKm) {
          serviceData.reminderKm = parseInt(reminderKm);
          serviceData.signal = parseInt(reminderKm); // signal = reminderKm
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
        
        // Map timeUnit to unit
        if (timeUnit === 'years') {
          serviceData.unit = 'year';
        } else if (timeUnit === 'months') {
          serviceData.unit = 'month';
        } else {
          serviceData.unit = 'day';
        }
        
        serviceData.norm = parseInt(intervalTime);
        serviceData.interval = parseInt(intervalTime); // Keep for backward compatibility
        serviceData.timeUnit = timeUnit;
        serviceData.type = 'date'; // Keep for backward compatibility
        
        // Convert time units to days for reminder
        if (reminderTime) {
          let reminderDays = parseInt(reminderTime);
          if (reminderTimeUnit === 'weeks') reminderDays *= 7;
          if (reminderTimeUnit === 'months') reminderDays *= 30;
          serviceData.reminderDays = reminderDays;
          serviceData.signal = reminderDays; // signal = reminderDays
        }
        break;
        
      case 'specific-date':
        const specificDate = document.getElementById('service-specific-date').value;
        const reminderDays = document.getElementById('service-reminder-days').value;
        
        if (!specificDate) {
          alert('Prosím vyberte dátum.');
          return;
        }
        
        // Convert YYYY-MM-DD to DD.MM.YYYY format
        // Parse the date string directly to avoid timezone issues
        const [year, month, day] = specificDate.split('-');
        const dateInDDMMYYYY = `${day}.${month}.${year}`;
        
        serviceData.unit = 'specificDate';
        serviceData.norm = dateInDDMMYYYY; // Save in DD.MM.YYYY format
        // Only save signal (reminder days), don't save specificDate, type, or reminderDays
        if (reminderDays) {
          serviceData.signal = parseInt(reminderDays);
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
    if (servicePolozky && servicePolozky.length > 0) {
      // Store as array of structured objects
      serviceData.servicePolozky = servicePolozky.map((polozka, idx) => ({
        ...polozka,
        key: polozka.key || `polozka_${idx}`
      }));
    }

    // Handle lastKm and lastDate
    if (serviceIndex !== null) {
      // When editing, preserve lastKm and lastDate from existing service
      const existingService = this.selectedVehicle.services[serviceIndex];
      if (existingService.lastKm !== undefined && existingService.lastKm !== null) {
        serviceData.lastKm = existingService.lastKm;
      }
      if (existingService.lastDate) {
        serviceData.lastDate = existingService.lastDate;
      }
      // Also preserve lastService for backward compatibility
      if (existingService.lastService) {
        serviceData.lastService = existingService.lastService;
      }
    } else if (!isBulkMode) {
      // For new services (not bulk mode), initialize lastKm and lastService
      const currentKm = this.selectedVehicle?.currentKm || this.selectedVehicle?.kilometers || 0;
      serviceData.lastKm = 0; // Will be updated when service is performed
      serviceData.lastService = {
        date: new Date(),
        km: currentKm
      };
    }
    
    // Handle bulk mode - add service to bulk selection instead of vehicle
    if (isBulkMode) {
      this.addCustomServiceToBulk(serviceData);
      this._bulkModeForServiceModal = false; // Reset flag
      modal.remove();
      this.showNotification('Servis pridaný do výberu', 'success');
      return;
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
      
      // For specificDate services, remove unnecessary fields
      if (updatedService.unit === 'specificDate') {
        delete updatedService.specificDate;
        delete updatedService.type;
        delete updatedService.reminderDays;
      }
      
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
      
      // For specificDate services, remove unnecessary fields
      if (cleaned.unit === 'specificDate') {
        delete cleaned.specificDate;
        delete cleaned.type;
        delete cleaned.reminderDays;
      }
      
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
    
    // Verify authentication - require email/password login, not anonymous
    const currentUser = window.auth.currentUser;
    if (!currentUser) {
      this.showNotification('Musíte byť prihlásený pre ukladanie služieb. Prosím prihláste sa cez email a heslo.', 'error');
      // Show auth section
      const authSection = document.getElementById('auth-section');
      const mainContent = document.getElementById('flotila-main-content');
      if (authSection) authSection.style.display = 'block';
      if (mainContent) mainContent.style.display = 'none';
      return;
    }
    
    // Check if user is anonymous - anonymous users don't have write permissions
    if (currentUser.isAnonymous) {
      this.showNotification('Anonymný používateľ nemá oprávnenia na zápis. Prosím prihláste sa cez email a heslo.', 'error');
      // Show auth section
      const authSection = document.getElementById('auth-section');
      const mainContent = document.getElementById('flotila-main-content');
      if (authSection) authSection.style.display = 'block';
      if (mainContent) mainContent.style.display = 'none';
      return;
    }
    
    try {
      console.log('Saving services with user:', currentUser.uid, currentUser.email || '(no email)');
      
      const cleanedServices = this.cleanServiceData(this.selectedVehicle.services);
      const plate = this.selectedVehicle.licensePlate;
      const normalizedPlate = this.normalizeLicensePlate(plate);
      
      // Save to FLOTILA collection based on vehicle type
      const vehicleType = this.selectedVehicle.vehicleType;
      let collection;
      
      if (vehicleType === 'trailer' || (this.selectedVehicle.licensePlate && this.trailers[this.selectedVehicle.licensePlate])) {
        collection = this._flotilaTrailersCollection();
      } else if (vehicleType === 'car' || (this.selectedVehicle.licensePlate && this.cars[this.selectedVehicle.licensePlate])) {
        collection = this._flotilaCarsCollection();
      } else if (vehicleType === 'other' || (this.selectedVehicle.licensePlate && this.other[this.selectedVehicle.licensePlate])) {
        collection = this._flotilaOtherCollection();
      } else {
        collection = this._flotilaTrucksCollection();
      }
      
      await collection.doc(normalizedPlate).set({
        services: cleanedServices
      }, { merge: true });
      
      // Update local data to keep vehicle in memory synchronized
      const vehicleInMemory = this.trucks[plate] || this.trailers[plate] || this.cars[plate] || this.other[plate];
      if (vehicleInMemory) {
        vehicleInMemory.services = cleanedServices;
      }
      
      // Also update selectedVehicle to ensure it has the latest services
      if (this.selectedVehicle && this.selectedVehicle.licensePlate === plate) {
        this.selectedVehicle.services = cleanedServices;
      }
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
    
    // Ensure user is authenticated
    if (!this.currentUser && window.AuthService && window.AuthService.ensureAnonymousSession) {
      try {
        await window.AuthService.ensureAnonymousSession();
        this.currentUser = window.auth.currentUser;
      } catch (authError) {
        console.error('Auth error:', authError);
        return;
      }
    }
    
    if (!this.currentUser) {
      return;
    }
    
    try {
      const plate = this.selectedVehicle.licensePlate;
      const normalizedPlate = this.normalizeLicensePlate(plate);
      const collection = this._getFlotilaCollectionForVehicle(this.selectedVehicle);
      await collection.doc(normalizedPlate).set({
        activeWorkSession: this.selectedVehicle.activeWorkSession
      }, { merge: true });
    } catch (error) {
      console.error('Error saving work session:', error);
      this.showNotification('Chyba pri ukladaní pracovnej sessiony', 'error');
    }
  }

  // Save vehicle data to database
  async saveVehicleData() {
    if (!this.selectedVehicle) return;
    
    // Ensure user is authenticated
    if (!this.currentUser && window.AuthService && window.AuthService.ensureAnonymousSession) {
      try {
        await window.AuthService.ensureAnonymousSession();
        this.currentUser = window.auth.currentUser;
      } catch (authError) {
        console.error('Auth error:', authError);
        return;
      }
    }
    
    if (!this.currentUser) {
      return;
    }
    
    try {
      const updateData = {};
      
      // Don't save currentKm to FLOTILA - it comes from SHARED/vehicles_km
      // Only save services and history
      
      // Update services if they exist
      if (this.selectedVehicle.services) {
        updateData.services = this.selectedVehicle.services;
      }
      
      // Update history if it exists
      if (this.selectedVehicle.history) {
        updateData.history = this.selectedVehicle.history;
      }
      
      // Save to FLOTILA collection based on vehicle category
      if (Object.keys(updateData).length > 0) {
        const plate = this.selectedVehicle.licensePlate;
        const normalizedPlate = this.normalizeLicensePlate(plate);
        const category = this.selectedVehicle.category || 'truck';
        
        let collection;
        if (category === 'trailer') {
          collection = this._flotilaTrailersCollection();
        } else if (category === 'car') {
          collection = this._flotilaCarsCollection();
        } else if (category === 'other') {
          collection = this._flotilaOtherCollection();
        } else {
          collection = this._flotilaTrucksCollection();
        }
        
        await collection.doc(normalizedPlate).set(updateData, { merge: true });
      }
      
      // Don't update vehicles_km here - it should only be updated explicitly via updateWorkCurrentKm
      // or from external sources. currentKm is read-only from SHARED/vehicles_km
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

  // Update work current kilometers (only for work session display, NOT for vehicle km)
  async updateWorkCurrentKm(newKm) {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    const newKmValue = parseInt(newKm) || 0;
    // Only update the work session km for display - DO NOT update vehicle's actual km
    // Store it in the work session itself, not in selectedVehicle.currentKm
    this.selectedVehicle.activeWorkSession.workKm = newKmValue;
    
    // DO NOT update SHARED/vehicles_km - vehicle km should only be updated explicitly by user
    // DO NOT update selectedVehicle.currentKm - it should always come from SHARED/vehicles_km
    
    // Save work session to database (but not vehicle km)
    await this.saveWorkSession();
    
    // Update work session UI to show the new km value
    this.updateWorkSessionUI();
    
    this.showNotification('Km pre službu aktualizované (nezmení aktuálne km vozidla)', 'info');
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
    
    // Deduct polozky from storage before creating history entry
    await this.deductPolozkyFromStorage(completedItems);
    
    // Create history entry for completed items
    // Use the completion date from work session if available, otherwise use current date
    const completionDate = this.selectedVehicle.activeWorkSession.completionDate || new Date().toISOString();
    
    // Use work session km if available, otherwise use actual vehicle km from SHARED
    // The work session km is the km the service was performed at, not the vehicle's current km
    const workKm = this.selectedVehicle.activeWorkSession.workKm;
    const normalizedPlate = this.selectedVehicle.licensePlate ? this.normalizeLicensePlate(this.selectedVehicle.licensePlate) : null;
    const actualVehicleKm = normalizedPlate ? (this.cache.vehicleKms[normalizedPlate] || 0) : 0;
    const serviceKm = workKm !== undefined && workKm !== null ? workKm : actualVehicleKm;
    
    const historyEntry = {
      id: Date.now(),
      date: completionDate,
      kilometers: serviceKm,
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
  
  // Deduct polozky from storage when services are completed
  async deductPolozkyFromStorage(completedItems) {
    if (!window.DatabaseService) {
      console.warn('DatabaseService not available');
      return;
    }
    
    let oilDeductionCount = 0;
    let partDeductionCount = 0;
    let errorCount = 0;
    
    for (const item of completedItems) {
      const servicePolozky = item.servicePolozky || {};
      const polozkyStatus = item.polozkyStatus || {};
      
      // Handle both array and object formats
      let polozkyArray = [];
      if (Array.isArray(servicePolozky)) {
        polozkyArray = servicePolozky;
      } else if (typeof servicePolozky === 'object') {
        Object.entries(servicePolozky).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            polozkyArray.push({ ...value, key: key });
          } else if (typeof value === 'string') {
            // Legacy format - skip (no deduction for text-only polozky)
            return;
          }
        });
      }
      
      // Process each polozka
      for (const polozka of polozkyArray) {
        const key = polozka.key || polozka.name;
        const isUsed = polozkyStatus[key] === true;
        
        if (!isUsed || !polozka.quantity) {
          continue; // Skip unused polozky or those without quantity
        }
        
        // Deduct oil-type polozky
        if (polozka.type === 'oil') {
          // Check if we have oilId and category (required for deduction)
          if (!polozka.oilId || !polozka.category) {
            // Oil ID/category not set yet (filter will be added later)
            console.log(`Skipping oil deduction for ${polozka.name} - oilId/category not set (filter will be added later)`);
            continue;
          }
          
          if (!window.DatabaseService.adjustOilQuantity) {
            console.warn('adjustOilQuantity not available');
            continue;
          }
          
          try {
            const quantity = parseFloat(polozka.quantity);
            if (isNaN(quantity) || quantity <= 0) {
              console.warn(`Invalid quantity for polozka ${polozka.name}: ${polozka.quantity}`);
              continue;
            }
            
            // Deduct from storage (negative delta)
            await window.DatabaseService.adjustOilQuantity(
              polozka.oilId,
              polozka.category,
              -quantity
            );
            
            oilDeductionCount++;
            console.log(`Deducted ${quantity}L of ${polozka.name} from storage`);
          } catch (error) {
            console.error(`Error deducting oil ${polozka.name}:`, error);
            errorCount++;
            this.showNotification(`Chyba pri odpočítaní oleja ${polozka.name}`, 'error');
          }
        }
        // Deduct part-type polozky
        else if (polozka.type === 'part') {
          // Check if we have partId and category (required for deduction)
          if (!polozka.partId || !polozka.category) {
            // Try to get category from partInfo if available
            if (polozka.partId) {
              // If we have partId but no category, we need to find it
              // For now, skip if category is missing
              console.log(`Skipping part deduction for ${polozka.name} - category not set`);
              continue;
            } else {
              console.log(`Skipping part deduction for ${polozka.name} - partId not set`);
              continue;
            }
          }
          
          if (!window.DatabaseService.adjustDielQuantity) {
            console.warn('adjustDielQuantity not available');
            continue;
          }
          
          try {
            const quantity = parseInt(polozka.quantity);
            if (isNaN(quantity) || quantity <= 0) {
              console.warn(`Invalid quantity for polozka ${polozka.name}: ${polozka.quantity}`);
              continue;
            }
            
            // Deduct from storage (negative delta)
            await window.DatabaseService.adjustDielQuantity(
              polozka.partId,
              polozka.category,
              -quantity
            );
            
            partDeductionCount++;
            console.log(`Deducted ${quantity}ks of ${polozka.name} from storage`);
          } catch (error) {
            console.error(`Error deducting part ${polozka.name}:`, error);
            errorCount++;
            this.showNotification(`Chyba pri odpočítaní dielu ${polozka.name}`, 'error');
          }
        }
      }
    }
    
    const totalDeductions = oilDeductionCount + partDeductionCount;
    if (totalDeductions > 0) {
      const messages = [];
      if (oilDeductionCount > 0) {
        messages.push(`${oilDeductionCount} olej${oilDeductionCount > 1 ? 'ov' : ''}`);
      }
      if (partDeductionCount > 0) {
        messages.push(`${partDeductionCount} diel${partDeductionCount > 1 ? 'ov' : ''}`);
      }
      this.showNotification(`Odpočítaných ${messages.join(' a ')} zo skladu`, 'success');
    }
    
    if (errorCount > 0) {
      this.showNotification(`${errorCount} chýb pri odpočítaní zo skladu`, 'error');
    }
  }

  // Update service last service data
  updateServiceLastService(serviceName, date, kilometers) {
    if (!this.selectedVehicle.services) return;
    
    const service = this.selectedVehicle.services.find(s => s.name === serviceName);
    if (service) {
      // Update both lastService (for backward compatibility) and lastKm/lastDate (new structure)
      service.lastService = {
        date: date,
        km: kilometers  // Use 'km' to match the calculation methods
      };
      // Also update lastKm and lastDate fields
      service.lastKm = kilometers;
      // Convert date to YYYY-MM-DD format if it's a Date object or ISO string
      if (date instanceof Date) {
        service.lastDate = date.toISOString().split('T')[0];
      } else if (typeof date === 'string') {
        // If it's already in YYYY-MM-DD format, use it directly
        if (date.match(/^\d{4}-\d{2}-\d{2}/)) {
          service.lastDate = date.split('T')[0].split(' ')[0];
        } else {
          // Try to parse and format
          const parsed = this.parseDateFlexible(date);
          if (parsed) {
            service.lastDate = parsed.toISOString().split('T')[0];
          } else {
            service.lastDate = date;
          }
        }
      } else {
        service.lastDate = date;
      }
    }
  }

  // Recalculate all services' lastService from history items
  recalculateServicesLastServiceFromHistory() {
    if (!this.selectedVehicle) return;
    const services = this.selectedVehicle.services || [];
    const history = this.selectedVehicle.history || [];

    // Reset lastService, lastKm, and lastDate for all services
    services.forEach(svc => {
      if (!svc.lastService) svc.lastService = {};
      svc.lastService.date = undefined;
      svc.lastService.km = undefined;
      svc.lastKm = undefined;
      svc.lastDate = undefined;
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
          const dateStr = entryDate.toISOString().split('T')[0]; // YYYY-MM-DD format
          svc.lastService = { date: entryDate.toISOString(), km: entryKm };
          svc.lastKm = entryKm;
          svc.lastDate = dateStr;
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
  
  // Safely escape text for use inside HTML content
  escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
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

  // Update work item service polozka (structured format)
  async updateWorkItemServicePolozka(itemId, key, polozkaData) {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    const item = this.selectedVehicle.activeWorkSession.items.find(i => i.id === itemId);
    if (item) {
      // Convert servicePolozky to array format if it's an object
      if (!item.servicePolozky) {
        item.servicePolozky = [];
      } else if (!Array.isArray(item.servicePolozky)) {
        // Convert object to array
        item.servicePolozky = Object.entries(item.servicePolozky).map(([k, v]) => {
          if (typeof v === 'string') {
            return { type: 'text', name: v, key: k };
          } else if (typeof v === 'object' && v !== null) {
            return { ...v, key: k };
          }
          return { type: 'text', name: String(v), key: k };
        });
      }
      
      // Add the new polozka
      item.servicePolozky.push(polozkaData);
      
      // Initialize polozkyStatus if needed
      if (!item.polozkyStatus) {
        item.polozkyStatus = {};
      }
      item.polozkyStatus[key] = false; // Default to not completed
      
      // Update the selectedVehicle reference to ensure consistency
      this.selectedVehicle = { ...this.selectedVehicle };
      
      // Save to database
      await this.saveWorkSession();
    }
  }

  // Show modal to add new service detail to work item
  async showAddWorkItemDetailModal(itemId) {
    // Remove any existing modal first
    const existingModal = document.querySelector('.polozka-modal-overlay');
    if (existingModal) {
      existingModal.remove();
    }
    
    // Load oils for dropdown - wait a bit for the service to be available
    let oils = [];
    let unsubscribeFn = null;
    
    // Try to get oils from OilDatabaseService
    if (window.DatabaseService && typeof window.DatabaseService.onOilsUpdate === 'function') {
      try {
        unsubscribeFn = await window.DatabaseService.onOilsUpdate((oilsList) => {
          oils = oilsList || [];
          console.log('Loaded oils for work item:', oils.length);
        });
        // Wait a bit for initial load
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.warn('Could not load oils:', error);
      }
    } else {
      console.warn('DatabaseService.onOilsUpdate not available');
    }
    
    const modal = document.createElement('div');
    modal.className = 'polozka-modal-overlay';
    modal.innerHTML = `
      <div class="polozka-modal" style="max-width: 500px;">
        <div class="modal-header">
          <h3>Pridať položku servisu</h3>
          <button class="close-btn" onclick="this.closest('.polozka-modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group" style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Typ položky:</label>
            <div style="display: flex; gap: 12px;">
              <label class="polozka-type-option" data-type="text" style="display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 8px 12px; border: 2px solid #e5e7eb; border-radius: 8px; flex: 1; transition: all 0.2s; background: #f9fafb;">
                <input type="radio" name="polozka-type-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}" value="text" checked style="margin: 0;">
                <span>Len text</span>
              </label>
              <label class="polozka-type-option" data-type="oil" style="display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 8px 12px; border: 2px solid #e5e7eb; border-radius: 8px; flex: 1; transition: all 0.2s; background: #f9fafb;">
                <input type="radio" name="polozka-type-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}" value="oil" style="margin: 0;">
                <span>Olej</span>
              </label>
              <label class="polozka-type-option" data-type="part" style="display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 8px 12px; border: 2px solid #e5e7eb; border-radius: 8px; flex: 1; transition: all 0.2s; background: #f9fafb;">
                <input type="radio" name="polozka-type-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}" value="part" style="margin: 0;">
                <span>Diel</span>
              </label>
          </div>
          </div>
          <!-- Text type fields -->
          <div class="form-group" id="polozka-text-fields-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}">
            <label for="work-item-detail-label-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}">Názov položky:</label>
            <input type="text" id="work-item-detail-label-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}" placeholder="napr. Typ oleja, Značka pneumatík...">
          </div>
          
          <!-- Oil type fields -->
          <div class="form-group" id="polozka-oil-fields-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}" style="display: none;">
            <label for="work-item-oil-search-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}">Vyhľadať olej:</label>
            <input type="text" id="work-item-oil-search-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}" placeholder="Zadajte názov oleja..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 8px;">
            <select id="work-item-oil-select-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}" size="5" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;">
              <option value="">-- Vyberte olej --</option>
            </select>
            <div class="form-group" style="margin-top: 12px;">
              <label for="work-item-oil-quantity-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}">Množstvo (L):</label>
              <input type="number" id="work-item-oil-quantity-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}" step="0.1" min="0" placeholder="napr. 14" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
          </div>
          
          <!-- Part type fields -->
          <div class="form-group" id="polozka-part-fields-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}" style="display: none;">
            <label for="work-item-part-search-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}">Vyhľadať diel:</label>
            <input type="text" id="work-item-part-search-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}" placeholder="Zadajte názov dielu..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 8px;">
            <select id="work-item-part-select-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}" size="5" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;">
              <option value="">-- Vyberte diel (zatiaľ prázdne) --</option>
            </select>
            <div class="form-group" style="margin-top: 12px;">
              <label for="work-item-part-quantity-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}">Množstvo (ks):</label>
              <input type="number" id="work-item-part-quantity-${String(itemId).replace(/[^a-zA-Z0-9]/g, '_')}" step="1" min="1" placeholder="napr. 2" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.polozka-modal-overlay').remove()">Zrušiť</button>
          <button class="btn-primary" onclick="window.flotilaManager.addWorkItemDetail(${itemId})">Pridať</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners for radio buttons - sanitize itemId for selector
    const safeItemId = String(itemId).replace(/[^a-zA-Z0-9]/g, '_');
    const radioButtons = modal.querySelectorAll(`input[type="radio"][name="polozka-type-${safeItemId}"]`);
    radioButtons.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const type = e.target.value;
        this.togglePolozkaTypeInput(type, itemId);
        
        // Update visual state of radio options
        modal.querySelectorAll('.polozka-type-option').forEach(opt => {
          opt.style.background = '#f9fafb';
          opt.style.borderColor = '#e5e7eb';
        });
        const selectedOption = modal.querySelector(`.polozka-type-option[data-type="${type}"]`);
        if (selectedOption) {
          selectedOption.style.background = '#eff6ff';
          selectedOption.style.borderColor = '#3b82f6';
        }
      });
    });
    
    // Set initial state
    const selectedOption = modal.querySelector('.polozka-type-option[data-type="text"]');
    if (selectedOption) {
      selectedOption.style.background = '#eff6ff';
      selectedOption.style.borderColor = '#3b82f6';
    }
    
    // Populate oil dropdown and setup search
    const oilSelect = modal.querySelector(`#work-item-oil-select-${safeItemId}`);
    const oilSearch = modal.querySelector(`#work-item-oil-search-${safeItemId}`);
    let allOils = [...oils];
    
    const updateOilDropdown = (filteredOils) => {
      if (!oilSelect) return;
      oilSelect.innerHTML = '';
      if (filteredOils.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '-- Žiadne oleje načítané --';
        option.disabled = true;
        oilSelect.appendChild(option);
      } else {
        // Group oils by category
        const oilsByCategory = {};
        filteredOils.forEach(oil => {
          const category = oil.category || 'motorove';
          if (!oilsByCategory[category]) {
            oilsByCategory[category] = [];
          }
          oilsByCategory[category].push(oil);
        });
        
        // Create optgroups for each category
        const categoryOrder = ['motorove', 'prevodove', 'diferencial', 'chladiaca'];
        categoryOrder.forEach(categoryId => {
          if (oilsByCategory[categoryId] && oilsByCategory[categoryId].length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = this.getOilCategoryTitle(categoryId);
            oilsByCategory[categoryId].forEach(oil => {
              const option = document.createElement('option');
              option.value = JSON.stringify({ id: oil.id, name: oil.name, category: oil.category });
              option.textContent = `${oil.name} (${(oil.quantity || 0).toFixed(1)}L)`;
              optgroup.appendChild(option);
            });
            oilSelect.appendChild(optgroup);
          }
        });
        
        // Add any oils with unknown categories at the end
        Object.keys(oilsByCategory).forEach(categoryId => {
          if (!categoryOrder.includes(categoryId) && oilsByCategory[categoryId].length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = this.getOilCategoryTitle(categoryId);
            oilsByCategory[categoryId].forEach(oil => {
              const option = document.createElement('option');
              option.value = JSON.stringify({ id: oil.id, name: oil.name, category: oil.category });
              option.textContent = `${oil.name} (${(oil.quantity || 0).toFixed(1)}L)`;
              optgroup.appendChild(option);
            });
            oilSelect.appendChild(optgroup);
          }
        });
      }
    };
    
    // Setup real-time oil updates
    if (window.DatabaseService && typeof window.DatabaseService.onOilsUpdate === 'function') {
      const realTimeUnsubscribe = await window.DatabaseService.onOilsUpdate((oilsList) => {
        allOils = oilsList || [];
        console.log('Oils updated in work item modal:', allOils.length);
        if (oilSearch && oilSearch.value) {
          // Re-filter if search is active
          const searchTerm = oilSearch.value.toLowerCase();
          const filtered = allOils.filter(oil => 
            oil.name.toLowerCase().includes(searchTerm)
          );
          updateOilDropdown(filtered);
        } else {
          updateOilDropdown(allOils);
        }
      });
      
      // Clean up on modal close
      const closeBtn = modal.querySelector('.close-btn');
      if (closeBtn) {
        const originalClose = closeBtn.onclick;
        closeBtn.onclick = function() {
          if (realTimeUnsubscribe) realTimeUnsubscribe();
          if (originalClose) originalClose.call(this);
        };
      }
    }
    
    if (oilSearch && oilSelect) {
      oilSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = allOils.filter(oil => 
          oil.name.toLowerCase().includes(searchTerm)
        );
        updateOilDropdown(filtered);
      });
    }
    
    updateOilDropdown(allOils);
    
    // Clean up old unsubscribe
    if (unsubscribeFn) {
      setTimeout(() => unsubscribeFn && unsubscribeFn(), 2000);
    }
    
    // Parts will be loaded when part type is selected via togglePolozkaTypeInput
    // No need to pre-load here
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  // Toggle polozka type input visibility
  async togglePolozkaTypeInput(type, itemId = null) {
    if (!itemId) {
      console.warn('[WARNING] togglePolozkaTypeInput: itemId is null');
      return;
    }
    
    const safeItemId = String(itemId).replace(/[^a-zA-Z0-9]/g, '_');
    const textFields = document.getElementById(`polozka-text-fields-${safeItemId}`);
    const oilFields = document.getElementById(`polozka-oil-fields-${safeItemId}`);
    const partFields = document.getElementById(`polozka-part-fields-${safeItemId}`);
    
    // Hide all fields first
    if (textFields) textFields.style.display = 'none';
    if (oilFields) oilFields.style.display = 'none';
    if (partFields) partFields.style.display = 'none';
    
    // Show appropriate fields
    if (type === 'text' && textFields) {
      textFields.style.display = 'block';
    } else if (type === 'oil' && oilFields) {
      oilFields.style.display = 'block';
    } else if (type === 'part' && partFields) {
      partFields.style.display = 'block';
      // Load parts when part type is selected
      await this.loadPartsIntoSelect(
        `work-item-part-search-${safeItemId}`,
        `work-item-part-select-${safeItemId}`
      );
    }
  }

  // Add new service detail to work item
  async addWorkItemDetail(itemId) {
    const safeItemId = String(itemId).replace(/[^a-zA-Z0-9]/g, '_');
    const typeRadio = document.querySelector(`input[name="polozka-type-${itemId}"]:checked`);
    const type = typeRadio ? typeRadio.value : 'text';
    
    // Create a clean key for storage
    const key = 'polozka_' + Date.now();
    
    let polozkaData;
    
    if (type === 'text') {
      const nameInput = document.getElementById(`work-item-detail-label-${safeItemId}`);
      if (!nameInput || !nameInput.value.trim()) {
        this.showNotification('Prosím vyplňte názov položky.', 'warning');
        return;
      }
      const name = nameInput.value.trim();
      polozkaData = {
        type: 'text',
        name: name,
        key: key
      };
    } else if (type === 'oil') {
      const oilSelect = document.getElementById(`work-item-oil-select-${safeItemId}`);
      const quantityInput = document.getElementById(`work-item-oil-quantity-${safeItemId}`);
      
      if (!oilSelect || !oilSelect.value) {
        this.showNotification('Prosím vyberte olej.', 'warning');
        return;
      }
      
      const quantity = parseFloat(quantityInput.value);
      if (isNaN(quantity) || quantity <= 0) {
        this.showNotification('Prosím zadajte platné množstvo v litroch.', 'warning');
        return;
      }
      
      const oilInfo = JSON.parse(oilSelect.value);
      
      // Validate that this is actually an oil, not a part
      if (oilInfo.category && this.isPartsCategory(oilInfo.category)) {
        console.error('[ERROR] Selected item is a part, not an oil! Category:', oilInfo.category);
        this.showNotification('Chyba: Vybratá položka je diel, nie olej. Prosím vyberte olej.', 'error');
        return;
      }
      
      if (oilInfo.category && !this.isOilCategory(oilInfo.category)) {
        console.warn('[WARNING] Unknown oil category:', oilInfo.category);
      }
      
      polozkaData = {
        type: 'oil',
        name: oilInfo.name,
        oilId: oilInfo.id,
        category: oilInfo.category,
        quantity: quantity,
        key: key
      };
    } else if (type === 'part') {
      const partSelect = document.getElementById(`work-item-part-select-${safeItemId}`);
      const quantityInput = document.getElementById(`work-item-part-quantity-${safeItemId}`);
      const partSearch = document.getElementById(`work-item-part-search-${safeItemId}`);
      
      // For now, allow manual entry if no part selected
      let partName = '';
      let partCategory = null;
      if (partSelect && partSelect.value) {
        try {
          const partInfo = JSON.parse(partSelect.value);
          
          // Validate that this is actually a part, not an oil
          if (partInfo.category && this.isOilCategory(partInfo.category)) {
            console.error('[ERROR] Selected item is an oil, not a part! Category:', partInfo.category);
            this.showNotification('Chyba: Vybratá položka je olej, nie diel. Prosím vyberte diel.', 'error');
            return;
          }
          
          if (partInfo.category && !this.isPartsCategory(partInfo.category)) {
            console.warn('[WARNING] Unknown part category:', partInfo.category);
          }
          
          partName = partInfo.name || '';
          partCategory = partInfo.category || 'olejove';
        } catch (e) {
          // If JSON.parse fails, try to extract name from JSON string manually
          const valueStr = partSelect.value;
          // Try to extract name from JSON string like {"id":"...","name":"Part Name","category":"..."}
          const nameMatch = valueStr.match(/"name"\s*:\s*"([^"]+)"/);
          if (nameMatch && nameMatch[1]) {
            partName = nameMatch[1];
            // Try to extract category too
            const categoryMatch = valueStr.match(/"category"\s*:\s*"([^"]+)"/);
            if (categoryMatch && categoryMatch[1]) {
              partCategory = categoryMatch[1];
            }
          } else {
            // If we can't extract, use the raw value but warn
            console.warn('Could not parse part info, using raw value:', valueStr);
            partName = valueStr;
          }
        }
      } else if (partSearch && partSearch.value.trim()) {
        partName = partSearch.value.trim();
      } else {
        this.showNotification('Prosím vyberte alebo zadajte názov dielu.', 'warning');
        return;
      }
      
      // Ensure we have a valid part name
      if (!partName || partName.trim() === '') {
        this.showNotification('Prosím vyberte alebo zadajte názov dielu.', 'warning');
        return;
      }
      
      const quantity = parseInt(quantityInput.value);
      if (isNaN(quantity) || quantity <= 0) {
        this.showNotification('Prosím zadajte platné množstvo v kusoch.', 'warning');
        return;
      }
      
      const finalPartName = partName.trim();
      
      polozkaData = {
        type: 'part',
        name: finalPartName,
        quantity: quantity,
        key: key
      };
      
      // Add partId and category if part was selected from dropdown
      if (partSelect && partSelect.value) {
        try {
          const partInfo = JSON.parse(partSelect.value);
          polozkaData.partId = partInfo.id;
          polozkaData.category = partInfo.category || 'olejove';
        } catch (e) {
          console.error('[ERROR] addWorkItemDetail - Failed to parse part JSON:', e);
          // If parsing fails, try manual extraction
          const valueStr = partSelect.value;
          const idMatch = valueStr.match(/"id"\s*:\s*"([^"]+)"/);
          const categoryMatch = valueStr.match(/"category"\s*:\s*"([^"]+)"/);
          if (idMatch && idMatch[1]) {
            polozkaData.partId = idMatch[1];
          }
          if (categoryMatch && categoryMatch[1]) {
            polozkaData.category = categoryMatch[1];
          }
        }
      }
    }
    
    // Final validation
    if (!polozkaData || !polozkaData.name || polozkaData.name.trim() === '') {
      console.error('[ERROR] addWorkItemDetail - Invalid polozkaData:', polozkaData);
      this.showNotification('Chyba: Názov položky je prázdny.', 'error');
      return;
    }
    
    // Add the polozka to the work item
    await this.updateWorkItemServicePolozka(itemId, key, polozkaData);
    
    // Close modal
    const modal = document.querySelector('.polozka-modal-overlay');
    if (modal) {
      modal.remove();
    }
    
    // Update the UI to show the new polozka
    this.updateWorkSessionUI();
    
    this.showNotification('Položka pridaná', 'success');
  }

  // Render work item service polozky
  renderWorkItemServicePolozky(item) {
    // Get existing service polozky
    const servicePolozky = item.servicePolozky || {};
    const polozkyStatus = item.polozkyStatus || {}; // Track completion status
    
    // Handle both array and object formats, and both structured and legacy string formats
    let polozkyArray = [];
    if (Array.isArray(servicePolozky)) {
      polozkyArray = servicePolozky.map((polozka, idx) => {
        if (typeof polozka === 'string') {
          return { type: 'text', name: polozka, key: `polozka_${idx}` };
        } else if (typeof polozka === 'object') {
          return { ...polozka, key: polozka.key || `polozka_${idx}` };
        }
        return { type: 'text', name: String(polozka), key: `polozka_${idx}` };
      });
    } else if (typeof servicePolozky === 'object') {
      Object.entries(servicePolozky).forEach(([key, value]) => {
        if (typeof value === 'string') {
          // Legacy format: just a string
          polozkyArray.push({ type: 'text', name: value, key: key });
        } else if (typeof value === 'object' && value !== null) {
          // Structured format
          polozkyArray.push({ ...value, key: key });
        }
      });
    }
    
    // Generate HTML for existing detail fields
    const detailFields = polozkyArray.map(polozka => {
      const key = polozka.key;
      const isCompleted = polozkyStatus[key] === true;
      
      // Format display name and create editable quantity input for oil and parts
      let displayName = polozka.name || '';
      const quantity = polozka.quantity || 0;
      
      const typeBadge = polozka.type === 'oil' ? '<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px; background: #3b82f6; color: white;">Olej</span>' :
                      polozka.type === 'part' ? '<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px; background: #10b981; color: white;">Diel</span>' :
                      '<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px; background: #6b7280; color: white;">Text</span>';
      
      // Create editable quantity input for oil and parts
      let quantityInput = '';
      if (polozka.type === 'oil') {
        // Editable input for liters
        quantityInput = `
          <div style="display: flex; align-items: center; gap: 4px; margin-left: 8px;">
            <input 
              type="number" 
              step="0.1" 
              min="0" 
              value="${quantity}"
              style="width: 80px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;"
              onchange="window.flotilaManager.updatePolozkaQuantity(${item.id}, '${key}', parseFloat(this.value) || 0)"
              onclick="event.stopPropagation()"
            >
            <span style="font-size: 12px; color: #6b7280;">L</span>
          </div>
        `;
      } else if (polozka.type === 'part') {
        // Editable input for pieces
        quantityInput = `
          <div style="display: flex; align-items: center; gap: 4px; margin-left: 8px;">
            <input 
              type="number" 
              step="1" 
              min="1" 
              value="${quantity || 1}"
              style="width: 80px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;"
              onchange="window.flotilaManager.updatePolozkaQuantity(${item.id}, '${key}', parseInt(this.value) || 1)"
              onclick="event.stopPropagation()"
            >
            <span style="font-size: 12px; color: #6b7280;">ks</span>
          </div>
        `;
      }
      
      return `
        <div class="work-item-service-polozka ${isCompleted ? 'completed' : ''}" id="detail-${item.id}-${key}">
          <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
            ${typeBadge}
            <span style="flex: 1;">${this.escapeHtml(displayName)}</span>
            ${quantityInput}
          </div>
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

  // Update polozka quantity
  async updatePolozkaQuantity(itemId, polozkaKey, newQuantity) {
    if (!this.selectedVehicle || !this.selectedVehicle.activeWorkSession) {
      console.error('[ERROR] No active work session');
      return;
    }
    
    const item = this.selectedVehicle.activeWorkSession.items.find(i => i.id === itemId);
    if (!item) {
      console.error('[ERROR] Work item not found:', itemId);
      return;
    }
    
    // Ensure servicePolozky is in array format
    if (!item.servicePolozky) {
      item.servicePolozky = [];
    } else if (!Array.isArray(item.servicePolozky)) {
      // Convert object to array
      item.servicePolozky = Object.entries(item.servicePolozky).map(([k, v]) => {
        if (typeof v === 'string') {
          return { type: 'text', name: v, key: k };
        } else if (typeof v === 'object' && v !== null) {
          return { ...v, key: k };
        }
        return { type: 'text', name: String(v), key: k };
      });
    }
    
    // Find and update the polozka
    const polozkaIndex = item.servicePolozky.findIndex(p => p.key === polozkaKey);
    if (polozkaIndex !== -1) {
      // Update quantity
      item.servicePolozky[polozkaIndex].quantity = newQuantity;
      
      // Update the selectedVehicle reference to ensure consistency
      this.selectedVehicle = { ...this.selectedVehicle };
      
      // Save to database
      await this.saveWorkSession();
      
      // Re-render the polozky panel to show updated quantity
      const polozkyPanel = document.getElementById(`work-item-polozky-${itemId}`);
      if (polozkyPanel) {
        polozkyPanel.innerHTML = this.renderWorkItemServicePolozky(item);
      }
    } else {
      console.error('[ERROR] Polozka not found:', polozkaKey);
    }
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
          <button class="tab-btn" data-tab="bulk-services">Hromadné servisy</button>
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

          <div class="tab-panel" data-panel="bulk-services" style="display:none;">
            <div class="bulk-services-panel">
              <!-- Section 1: Services Selection -->
              <div class="bulk-section bulk-services-selection">
                <div class="bulk-section-header">
                  <h4>1. Vyberte servisy</h4>
                  <span class="bulk-count-badge" id="bulk-services-count">0 vybraných</span>
                </div>
                
                <div class="bulk-services-buttons">
                  <button class="bulk-add-custom-btn" onclick="window.flotilaManager.showBulkCustomServiceModal()">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Pridať vlastný servis
                  </button>
                  <button class="bulk-predefined-btn" onclick="window.flotilaManager.toggleBulkPredefinedList()">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                      <rect x="9" y="3" width="6" height="4" rx="1"/>
                      <path d="M9 12h6"/>
                      <path d="M9 16h6"/>
                    </svg>
                    Vybrať z preddefinovaných
                  </button>
                </div>

                <div class="bulk-predefined-list" id="bulk-predefined-list" style="display:none;">
                  <div class="bulk-search-container">
                    <input type="text" id="bulk-services-search" placeholder="Hľadať servisy..." oninput="window.flotilaManager.filterBulkPredefinedServices(this.value)">
                  </div>
                  <div class="bulk-predefined-items" id="bulk-predefined-items">
                    <div class="bulk-predefined-loading">Načítavam servisy...</div>
                  </div>
                </div>

                <div class="bulk-selected-services" id="bulk-selected-services">
                  <!-- Selected services chips will appear here -->
                </div>
              </div>

              <!-- Section 2: Vehicles Selection -->
              <div class="bulk-section bulk-vehicles-selection">
                <div class="bulk-section-header">
                  <h4>2. Vyberte vozidlá</h4>
                  <span class="bulk-count-badge" id="bulk-vehicles-count">0 vybraných</span>
                </div>

                <button class="bulk-vehicles-toggle-btn" onclick="window.flotilaManager.toggleBulkVehiclesList()">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="1" y="3" width="15" height="13"/>
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                    <circle cx="5.5" cy="18.5" r="2.5"/>
                    <circle cx="18.5" cy="18.5" r="2.5"/>
                  </svg>
                  Vybrať vozidlá
                  <svg class="bulk-toggle-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>

                <div class="bulk-vehicles-list" id="bulk-vehicles-list" style="display:none;">
                  <div class="bulk-search-container">
                    <input type="text" id="bulk-vehicles-search" placeholder="Hľadať vozidlá (SPZ)..." oninput="window.flotilaManager.filterBulkVehicles(this.value)">
                  </div>
                  <!-- Trucks category -->
                  <div class="bulk-vehicle-category">
                    <div class="bulk-category-header" onclick="window.flotilaManager.toggleBulkCategory('trucks')">
                      <input type="checkbox" id="bulk-select-all-trucks" onclick="event.stopPropagation(); window.flotilaManager.toggleBulkCategoryAll('trucks')">
                      <label for="bulk-select-all-trucks">Ťahače</label>
                      <span class="bulk-category-count" id="bulk-trucks-count">(0)</span>
                      <svg class="bulk-category-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>
                    <div class="bulk-category-items" id="bulk-trucks-items" style="display:none;"></div>
                  </div>

                  <!-- Trailers category -->
                  <div class="bulk-vehicle-category">
                    <div class="bulk-category-header" onclick="window.flotilaManager.toggleBulkCategory('trailers')">
                      <input type="checkbox" id="bulk-select-all-trailers" onclick="event.stopPropagation(); window.flotilaManager.toggleBulkCategoryAll('trailers')">
                      <label for="bulk-select-all-trailers">Návesy</label>
                      <span class="bulk-category-count" id="bulk-trailers-count">(0)</span>
                      <svg class="bulk-category-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>
                    <div class="bulk-category-items" id="bulk-trailers-items" style="display:none;"></div>
                  </div>

                  <!-- Cars category -->
                  <div class="bulk-vehicle-category">
                    <div class="bulk-category-header" onclick="window.flotilaManager.toggleBulkCategory('cars')">
                      <input type="checkbox" id="bulk-select-all-cars" onclick="event.stopPropagation(); window.flotilaManager.toggleBulkCategoryAll('cars')">
                      <label for="bulk-select-all-cars">Osobné</label>
                      <span class="bulk-category-count" id="bulk-cars-count">(0)</span>
                      <svg class="bulk-category-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>
                    <div class="bulk-category-items" id="bulk-cars-items" style="display:none;"></div>
                  </div>

                  <!-- Other category -->
                  <div class="bulk-vehicle-category">
                    <div class="bulk-category-header" onclick="window.flotilaManager.toggleBulkCategory('other')">
                      <input type="checkbox" id="bulk-select-all-other" onclick="event.stopPropagation(); window.flotilaManager.toggleBulkCategoryAll('other')">
                      <label for="bulk-select-all-other">Ostatné</label>
                      <span class="bulk-category-count" id="bulk-other-count">(0)</span>
                      <svg class="bulk-category-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>
                    <div class="bulk-category-items" id="bulk-other-items" style="display:none;"></div>
                  </div>
                </div>

              </div>

              <!-- Section 3: Apply Button -->
              <div class="bulk-section bulk-apply-section">
                <div class="bulk-apply-summary" id="bulk-apply-summary">
                  Vyberte servisy a vozidlá
                </div>
                <button class="bulk-apply-btn" id="bulk-apply-btn" onclick="window.flotilaManager.applyBulkServices()" disabled>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Aplikovať
                </button>
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
          const normalizedPlate = this.normalizeLicensePlate(licensePlate);
          const category = vehicleData.category || 'truck';
          let collection;
          if (category === 'trailer') {
            collection = this._flotilaTrailersCollection();
          } else if (category === 'car') {
            collection = this._flotilaCarsCollection();
          } else if (category === 'other') {
            collection = this._flotilaOtherCollection();
          } else {
            collection = this._flotilaTrucksCollection();
          }
          await collection.doc(normalizedPlate).set(vehicleData, { merge: true });
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
            const normalizedPlate = this.normalizeLicensePlate(truckWithTrailer);
            const truckCollection = this._getFlotilaCollectionForVehicle(truckWithTrailer);
            await truckCollection.doc(normalizedPlate).update({ trailer: null });
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
        const prevNormalized = this.normalizeLicensePlate(previousTruckPlate);
        const prevCollection = this._getFlotilaCollectionForVehicle(previousTruckPlate);
        const prevRef = prevCollection.doc(prevNormalized);
        batch.update(prevRef, { trailer: null });
      }
      const targetNormalized = this.normalizeLicensePlate(targetTruckPlate);
      const targetCollection = this._getFlotilaCollectionForVehicle(targetTruckPlate);
      const targetRef = targetCollection.doc(targetNormalized);
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
      
      const targetNormalized = this.normalizeLicensePlate(targetTruckPlate);
      const draggedNormalized = this.normalizeLicensePlate(draggedTruckPlate);
      const targetCollection = this._getFlotilaCollectionForVehicle(targetTruckPlate);
      const draggedCollection = this._getFlotilaCollectionForVehicle(draggedTruckPlate);
      
      const targetTruckRef = targetCollection.doc(targetNormalized);
      const draggedTruckRef = draggedCollection.doc(draggedNormalized);
      
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
        const normalizedPlate = this.normalizeLicensePlate(truckPlate);
        const truckCollection = this._getFlotilaCollectionForVehicle(truckPlate);
        const truckRef = truckCollection.doc(normalizedPlate);
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
    // Handle unit field (new structure) - for specificDate services
    if (type === 'specificDate' || type === 'specificDate' || specificDate) {
      const dateValue = specificDate || interval;
      const parsedDate = this.parseDateFlexible(dateValue);
      if (parsedDate) {
        return `Dátum: ${parsedDate.toLocaleDateString('sk-SK')}`;
      }
      return `Dátum: ${dateValue}`; // Fallback to raw value if parsing fails
    }
    
    // Check for km-based service FIRST (before time-based checks)
    // This handles both 'km' type and 'km' unit
    if (type === 'km') {
      const intervalNum = parseInt(interval) || 0;
      return `Každých ${this.formatNumberWithSpaces(intervalNum)} km`;
    }
    
    // Handle unit field mapping for time-based services
    if (type === 'year' || timeUnit === 'years' || timeUnit === 'year') {
      const intervalNum = parseInt(interval) || 1;
      const prefix = this.getEveryPrefix(intervalNum);
      return `${prefix} ${intervalNum} ${this.getUnitForm(intervalNum, 'years')}`;
    }
    if (type === 'month' || timeUnit === 'months' || timeUnit === 'month') {
      const intervalNum = parseInt(interval) || 1;
      const prefix = this.getEveryPrefix(intervalNum);
      return `${prefix} ${intervalNum} ${this.getUnitForm(intervalNum, 'months')}`;
    }
    if (type === 'day' || timeUnit === 'days' || timeUnit === 'day') {
      const intervalNum = parseInt(interval) || 1;
      const prefix = this.getEveryPrefix(intervalNum);
      return `${prefix} ${intervalNum} ${this.getUnitForm(intervalNum, 'days')}`;
    }
    
    switch (type) {
      case 'date': {
        const intervalNum = parseInt(interval) || 1;
        const prefix = this.getEveryPrefix(intervalNum);
        const unitForm = this.getUnitForm(intervalNum, timeUnit || 'days');
        return `${prefix} ${intervalNum} ${unitForm}`;
      }
      default: {
        // Fallback: if interval is a large number (>1000), assume it's km, otherwise days
        const intervalNum = parseInt(interval) || 1;
        if (intervalNum > 1000) {
          // Large numbers are likely km, not days
          return `Každých ${this.formatNumberWithSpaces(intervalNum)} km`;
        }
        // Small numbers default to days
        const prefix = this.getEveryPrefix(intervalNum);
        const unitForm = this.getUnitForm(intervalNum, timeUnit || 'days');
        return `${prefix} ${intervalNum} ${unitForm}`;
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
    // Handle unit field (new structure) - check if this is a specificDate service
    // For specificDate services, use specificDate or interval (which might be norm)
    if (type === 'specificDate' || type === 'specificDate' || specificDate) {
      const dateValue = specificDate || interval;
      const specific = this.parseDateFlexible(dateValue);
      return !specific ? 'Nastaviť dátum' : specific.toLocaleDateString('sk-SK');
    }
    
    // Handle unit field mapping for time-based services
    if (type === 'year' || timeUnit === 'years' || timeUnit === 'year') {
      timeUnit = 'years';
    } else if (type === 'month' || timeUnit === 'months' || timeUnit === 'month') {
      timeUnit = 'months';
    } else if (type === 'day' || timeUnit === 'days' || timeUnit === 'day') {
      timeUnit = 'days';
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
    if (isNaN(intervalNum)) return 'Neplatný interval';
    
    // Use timeUnit to determine how to add interval (default to days if not specified)
    const finalTimeUnit = timeUnit || 'days';
    if (finalTimeUnit === 'years') {
      dueDate.setFullYear(dueDate.getFullYear() + intervalNum);
    } else if (finalTimeUnit === 'months') {
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

  // Parse various date input shapes (string YYYY-MM-DD, DD.MM.YYYY, number ms, Firebase Timestamp, {_seconds})
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
      // Try DD.MM.YYYY format first
      const ddmmyyyyMatch = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (ddmmyyyyMatch) {
        const [, day, month, year] = ddmmyyyyMatch;
        const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        if (!isNaN(d.getTime())) return d;
      }
      // Try standard Date parsing (YYYY-MM-DD, etc.)
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  // Format date value to sk-SK using flexible parsing, fallback to '—'
  formatDateSk(value) {
    const d = this.parseDateFlexible(value);
    return d ? d.toLocaleDateString('sk-SK') : '—';
  }

  // Get date input value (YYYY-MM-DD) from service data (handles both DD.MM.YYYY and YYYY-MM-DD)
  getDateInputValue(service) {
    if (!service) return '';
    
    // Try specificDate first (YYYY-MM-DD format)
    if (service.specificDate && typeof service.specificDate === 'string') {
      if (service.specificDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return service.specificDate;
      }
    }
    
    // Try norm field (might be DD.MM.YYYY or YYYY-MM-DD)
    if (service.norm && typeof service.norm === 'string') {
      // Check if it's already in YYYY-MM-DD format
      if (service.norm.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return service.norm;
      }
      // Try to parse DD.MM.YYYY format
      const ddmmyyyyMatch = service.norm.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (ddmmyyyyMatch) {
        const [, day, month, year] = ddmmyyyyMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
    
    return '';
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
    // Handle unit field (new structure) - for specificDate services
    if (type === 'specificDate' || type === 'specificDate' || specificDate) {
      const dateValue = specificDate || interval;
      const specific = this.parseDateFlexible(dateValue);
      if (!specific) return 'Nastaviť dátum';
      const today = new Date();
      const diffTime = specific - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return `Prešlo ${Math.abs(diffDays)} dní`;
      if (diffDays === 0) return 'Dnes';
      return `Zostáva ${diffDays} dní`;
    }
    
    // Handle unit field mapping for time-based services
    if (type === 'year' || timeUnit === 'years' || timeUnit === 'year') {
      timeUnit = 'years';
    } else if (type === 'month' || timeUnit === 'months' || timeUnit === 'month') {
      timeUnit = 'months';
    } else if (type === 'day' || timeUnit === 'days' || timeUnit === 'day') {
      timeUnit = 'days';
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
    if (isNaN(intervalNum)) return 'Neplatný interval';
    
    // Use timeUnit to determine how to add interval (default to days if not specified)
    const finalTimeUnit = timeUnit || 'days';
    if (finalTimeUnit === 'years') {
      dueDate.setFullYear(dueDate.getFullYear() + intervalNum);
    } else if (finalTimeUnit === 'months') {
      dueDate.setMonth(dueDate.getMonth() + intervalNum);
    } else {
      dueDate.setDate(dueDate.getDate() + intervalNum);
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = dueDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (isNaN(diffDays)) return 'Chyba výpočtu';
    
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
    // Check both type and unit fields
    const serviceType = service.type || service.unit;
    if (serviceType === 'km') {
      return this.getKmServiceStatus(service);
    } else {
      return this.getDateServiceStatus(service);
    }
  }

  // Get status for km-based services
  getKmServiceStatus(service) {
    // Always get currentKm from SHARED/vehicles_km (via cache), not from selectedVehicle.currentKm
    const normalizedPlate = this.selectedVehicle?.licensePlate ? this.normalizeLicensePlate(this.selectedVehicle.licensePlate) : null;
    const currentKmFromShared = normalizedPlate ? (this.cache.vehicleKms[normalizedPlate] || 0) : 0;
    const currentKm = currentKmFromShared || this.selectedVehicle?.currentKm || this.selectedVehicle?.kilometers || 0;
    
    // Get interval from norm or interval field
    const interval = service.norm || service.interval;
    if (!interval) return 'no-date';
    
    // Check if we have lastKm or lastService.km - if not, return grey status
    const hasLastKm = (service.lastKm !== undefined && service.lastKm !== null) || (service.lastService && typeof service.lastService.km === 'number');
    if (!hasLastKm) {
      return 'no-date';
    }
    
    const lastServiceKm = service.lastKm !== undefined && service.lastKm !== null ? service.lastKm : service.lastService.km;
    
    const intervalNum = parseInt(interval);
    if (isNaN(intervalNum)) return 'no-date';
    
    const targetKm = lastServiceKm + intervalNum;
    const reminderKm = targetKm - (service.reminderKm || service.signal || 15000);
    
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
    // Always get currentKm from SHARED/vehicles_km (via cache), not from selectedVehicle.currentKm
    // which might be updated by work session but not reflect actual vehicle km
    const normalizedPlate = this.selectedVehicle?.licensePlate ? this.normalizeLicensePlate(this.selectedVehicle.licensePlate) : null;
    const currentKmFromShared = normalizedPlate ? (this.cache.vehicleKms[normalizedPlate] || 0) : 0;
    const currentKm = currentKmFromShared || this.selectedVehicle?.currentKm || this.selectedVehicle?.kilometers || 0;
    
    // Get interval from norm or interval field
    const interval = service.norm || service.interval;
    if (!interval) return 'Nastaviť interval';
    
    // Use lastKm or lastService.km when provided (including 0), otherwise fall back to current km
    const hasLastKm = (service.lastKm !== undefined && service.lastKm !== null) || (service.lastService && typeof service.lastService.km === 'number');
    const lastServiceKm = hasLastKm ? (service.lastKm !== undefined && service.lastKm !== null ? service.lastKm : service.lastService.km) : currentKm;
    
    const intervalNum = parseInt(interval);
    if (isNaN(intervalNum)) return 'Neplatný interval';
    
    const targetKm = lastServiceKm + intervalNum;
    const remainingKm = targetKm - currentKm;
    
    if (isNaN(remainingKm)) return 'Chyba výpočtu';
    
    if (remainingKm <= 0) {
      return `Prešlo ${this.formatNumberWithSpaces(Math.abs(remainingKm))} km`;
    } else {
      return `Zostáva ${this.formatNumberWithSpaces(remainingKm)} km`;
    }
  }

  // Calculate target km for km-based services
  calculateTargetKm(service) {
    // Always get currentKm from SHARED/vehicles_km (via cache) for fallback, but target is based on lastService
    const normalizedPlate = this.selectedVehicle?.licensePlate ? this.normalizeLicensePlate(this.selectedVehicle.licensePlate) : null;
    const currentKmFromShared = normalizedPlate ? (this.cache.vehicleKms[normalizedPlate] || 0) : 0;
    const currentKm = currentKmFromShared || this.selectedVehicle?.currentKm || this.selectedVehicle?.kilometers || 0;
    
    // Get interval from norm or interval field
    const interval = service.norm || service.interval;
    if (!interval) return 'Nastaviť interval';
    
    // Use lastKm or lastService.km when provided (including 0), otherwise fall back to current km
    const hasLastKm = (service.lastKm !== undefined && service.lastKm !== null) || (service.lastService && typeof service.lastService.km === 'number');
    const lastServiceKm = hasLastKm ? (service.lastKm !== undefined && service.lastKm !== null ? service.lastKm : service.lastService.km) : currentKm;
    
    const intervalNum = parseInt(interval);
    if (isNaN(intervalNum)) return 'Neplatný interval';
    
    const targetKm = lastServiceKm + intervalNum;
    if (isNaN(targetKm)) return 'Chyba výpočtu';
    
    return `Pri ${this.formatNumberWithSpaces(targetKm)} km`;
  }

  // Get status for date-based services
  getDateServiceStatus(service) {
    // Handle unit field (new structure)
    const serviceUnit = service.unit || service.type;
    
    // If a specific absolute date is set, use it directly
    if (serviceUnit === 'specificDate' || service.type === 'specificDate' || service.specificDate) {
      const dueDate = this.parseDateFlexible(service.specificDate || service.norm || service.interval);
      if (!dueDate) return 'no-date';
      const today = new Date();
      const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
      let reminderDays = service.reminderDays || service.signal || 30;
      if (diffDays < 0) return 'overdue';
      if (diffDays <= reminderDays) return 'reminder';
      return 'normal';
    }
    
    // Use lastDate or lastService.date - if not set, return grey status
    const lastPerformed = service.lastDate || service.lastService?.date;
    if (!lastPerformed) return 'no-date';
    
    let lastDate = this.parseDateFlexible(lastPerformed);
    if (!lastDate || isNaN(lastDate.getTime())) return 'normal';
    
    const dueDate = new Date(lastDate);
    const interval = service.norm || service.interval;
    const intervalNum = parseInt(interval);
    if (isNaN(intervalNum)) return 'normal';
    
    // Determine time unit from service.unit or service.timeUnit
    let timeUnit = service.timeUnit;
    if (!timeUnit && serviceUnit) {
      if (serviceUnit === 'year') timeUnit = 'years';
      else if (serviceUnit === 'month') timeUnit = 'months';
      else if (serviceUnit === 'day') timeUnit = 'days';
    }
    timeUnit = timeUnit || 'days';
    
    // Add interval based on time unit
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
    
    // Adjust reminder period based on service type
    let reminderDays = service.reminderDays || service.signal || 30;
    if (timeUnit === 'years') {
      reminderDays = service.reminderDays || service.signal || 90; // 3 months for yearly services
    } else if (timeUnit === 'months') {
      reminderDays = service.reminderDays || service.signal || 14; // 2 weeks for monthly services
    }
    
    if (diffDays < 0) {
      return 'overdue';
    } else if (diffDays <= reminderDays) {
      return 'reminder';
    } else {
      return 'normal';
    }
  }

  // ==================== BULK SERVICES METHODS ====================

  // Reset bulk services state
  resetBulkServicesState() {
    this.bulkServicesState = {
      selectedServices: [],
      selectedVehicles: [],
      predefinedListOpen: false,
      vehiclesListOpen: false,
      categoryOpen: { trucks: false, trailers: false, cars: false, other: false }
    };
  }

  // Toggle predefined services list visibility
  toggleBulkPredefinedList() {
    this.bulkServicesState.predefinedListOpen = !this.bulkServicesState.predefinedListOpen;
    const listEl = document.getElementById('bulk-predefined-list');
    if (listEl) {
      listEl.style.display = this.bulkServicesState.predefinedListOpen ? 'block' : 'none';
      if (this.bulkServicesState.predefinedListOpen) {
        this.loadBulkPredefinedServices();
      }
    }
  }

  // Load predefined services for bulk selection
  async loadBulkPredefinedServices() {
    const itemsEl = document.getElementById('bulk-predefined-items');
    if (!itemsEl) return;

    itemsEl.innerHTML = '<div class="bulk-predefined-loading">Načítavam servisy...</div>';

    try {
      const snapshot = await this._predefinedServicesCollection().orderBy('name').get();
      
      if (snapshot.empty) {
        itemsEl.innerHTML = '<div class="bulk-no-services">Žiadne preddefinované servisy</div>';
        return;
      }

      // Store services for filtering
      this._bulkPredefinedServicesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      this.renderBulkPredefinedServices(this._bulkPredefinedServicesCache);
      
    } catch (error) {
      console.error('Error loading predefined services:', error);
      itemsEl.innerHTML = '<div class="bulk-error">Chyba pri načítavaní servisov</div>';
    }
  }

  // Render predefined services list
  renderBulkPredefinedServices(services) {
    const itemsEl = document.getElementById('bulk-predefined-items');
    if (!itemsEl) return;

    if (services.length === 0) {
      itemsEl.innerHTML = '<div class="bulk-no-services">Žiadne servisy nenájdené</div>';
      return;
    }

    const servicesHtml = services.map(service => {
      const isSelected = this.bulkServicesState.selectedServices.some(s => s.id === service.id);
      const polozkyCount = service.servicePolozky ? service.servicePolozky.length : 0;
      
      return `
        <div class="bulk-predefined-item ${isSelected ? 'selected' : ''}" data-service-id="${service.id}" data-service-name="${service.name.toLowerCase()}">
          <input type="checkbox" 
                 id="bulk-service-${service.id}" 
                 ${isSelected ? 'checked' : ''}
                 onchange="window.flotilaManager.toggleBulkServiceSelection('${service.id}')">
          <label for="bulk-service-${service.id}">
            <span class="bulk-service-name">${service.name}</span>
            <span class="bulk-service-details">
              ${service.type === 'specificDate'
                ? this.formatDateSk(service.specificDate || service.interval)
                : (service.type === 'km'
                    ? `${this.formatNumberWithSpaces(service.interval)} km`
                    : `${service.interval} ${this.getUnitForm(service.interval, service.timeUnit || 'days')}`)}
              ${polozkyCount > 0 ? ` · ${polozkyCount} polož${polozkyCount !== 1 ? 'iek' : 'ka'}` : ''}
            </span>
          </label>
        </div>
      `;
    }).join('');

    itemsEl.innerHTML = servicesHtml;
  }

  // Filter predefined services by search term
  filterBulkPredefinedServices(searchTerm) {
    if (!this._bulkPredefinedServicesCache) return;
    
    const term = searchTerm.toLowerCase().trim();
    
    if (!term) {
      this.renderBulkPredefinedServices(this._bulkPredefinedServicesCache);
      return;
    }

    const filtered = this._bulkPredefinedServicesCache.filter(service => 
      service.name.toLowerCase().includes(term)
    );
    
    this.renderBulkPredefinedServices(filtered);
  }

  // Toggle service selection in bulk mode
  async toggleBulkServiceSelection(serviceId) {
    const existingIndex = this.bulkServicesState.selectedServices.findIndex(s => s.id === serviceId);
    
    if (existingIndex >= 0) {
      // Remove service
      this.bulkServicesState.selectedServices.splice(existingIndex, 1);
    } else {
      // Add service - fetch from database
      try {
        const doc = await this._predefinedServicesCollection().doc(serviceId).get();
        if (doc.exists) {
          this.bulkServicesState.selectedServices.push({ id: doc.id, ...doc.data() });
        }
      } catch (error) {
        console.error('Error fetching service:', error);
      }
    }

    this.updateBulkServicesUI();
  }

  // Show modal to add custom service for bulk
  showBulkCustomServiceModal() {
    // Reuse the existing service type modal but with a callback for bulk mode
    this.showServiceTypeEditModal(null, null, true);
  }

  // Add custom service to bulk selection (called from the service edit modal)
  addCustomServiceToBulk(serviceData) {
    // Generate a temporary ID for custom services
    const customId = 'custom_' + Date.now();
    this.bulkServicesState.selectedServices.push({
      id: customId,
      isCustom: true,
      ...serviceData
    });
    this.updateBulkServicesUI();
  }

  // Remove service from bulk selection
  removeBulkService(serviceId) {
    const index = this.bulkServicesState.selectedServices.findIndex(s => s.id === serviceId);
    if (index >= 0) {
      this.bulkServicesState.selectedServices.splice(index, 1);
      this.updateBulkServicesUI();
      // Also update checkbox in predefined list if visible
      const checkbox = document.getElementById(`bulk-service-${serviceId}`);
      if (checkbox) {
        checkbox.checked = false;
        checkbox.closest('.bulk-predefined-item')?.classList.remove('selected');
      }
    }
  }

  // Toggle vehicles list visibility
  toggleBulkVehiclesList() {
    this.bulkServicesState.vehiclesListOpen = !this.bulkServicesState.vehiclesListOpen;
    const listEl = document.getElementById('bulk-vehicles-list');
    const toggleBtn = document.querySelector('.bulk-vehicles-toggle-btn');
    
    if (listEl) {
      listEl.style.display = this.bulkServicesState.vehiclesListOpen ? 'block' : 'none';
      if (this.bulkServicesState.vehiclesListOpen) {
        this.populateBulkVehiclesList();
      }
    }
    if (toggleBtn) {
      toggleBtn.classList.toggle('expanded', this.bulkServicesState.vehiclesListOpen);
    }
  }

  // Populate vehicles list for bulk selection
  populateBulkVehiclesList(searchTerm = '') {
    const categories = [
      { id: 'trucks', data: this.trucks, label: 'Ťahače' },
      { id: 'trailers', data: this.trailers, label: 'Návesy' },
      { id: 'cars', data: this.cars, label: 'Osobné' },
      { id: 'other', data: this.other, label: 'Ostatné' }
    ];
    
    const term = searchTerm.toLowerCase().trim();

    categories.forEach(category => {
      const itemsEl = document.getElementById(`bulk-${category.id}-items`);
      const countEl = document.getElementById(`bulk-${category.id}-count`);
      let vehicles = Object.values(category.data).sort((a, b) => 
        a.licensePlate.localeCompare(b.licensePlate)
      );
      
      // Filter by search term
      if (term) {
        vehicles = vehicles.filter(v => 
          v.licensePlate.toLowerCase().includes(term)
        );
      }

      if (countEl) {
        const totalCount = Object.values(category.data).length;
        countEl.textContent = term ? `(${vehicles.length}/${totalCount})` : `(${totalCount})`;
      }

      if (itemsEl) {
        if (vehicles.length === 0) {
          itemsEl.innerHTML = term 
            ? '<div class="bulk-no-vehicles">Žiadne vozidlá nenájdené</div>'
            : '<div class="bulk-no-vehicles">Žiadne vozidlá</div>';
        } else {
          itemsEl.innerHTML = vehicles.map(vehicle => {
            const isSelected = this.bulkServicesState.selectedVehicles.some(
              v => v.type === category.id && v.licensePlate === vehicle.licensePlate
            );
            return `
              <div class="bulk-vehicle-item ${isSelected ? 'selected' : ''}" data-license="${vehicle.licensePlate.toLowerCase()}">
                <input type="checkbox" 
                       id="bulk-vehicle-${category.id}-${vehicle.licensePlate.replace(/\s/g, '_')}"
                       ${isSelected ? 'checked' : ''}
                       onchange="window.flotilaManager.toggleBulkVehicleSelection('${category.id}', '${vehicle.licensePlate}')">
                <label for="bulk-vehicle-${category.id}-${vehicle.licensePlate.replace(/\s/g, '_')}">
                  ${vehicle.licensePlate}
                </label>
              </div>
            `;
          }).join('');
        }
      }
    });

    this.updateBulkCategoryCheckboxes();
  }

  // Filter vehicles by search term
  filterBulkVehicles(searchTerm) {
    this.populateBulkVehiclesList(searchTerm);
  }

  // Toggle category expand/collapse
  toggleBulkCategory(categoryId) {
    this.bulkServicesState.categoryOpen[categoryId] = !this.bulkServicesState.categoryOpen[categoryId];
    const itemsEl = document.getElementById(`bulk-${categoryId}-items`);
    const headerEl = document.querySelector(`[onclick*="toggleBulkCategory('${categoryId}')"]`);
    
    if (itemsEl) {
      itemsEl.style.display = this.bulkServicesState.categoryOpen[categoryId] ? 'block' : 'none';
    }
    if (headerEl) {
      headerEl.classList.toggle('expanded', this.bulkServicesState.categoryOpen[categoryId]);
    }
  }

  // Toggle all vehicles in a category
  toggleBulkCategoryAll(categoryId) {
    const categoryData = {
      trucks: this.trucks,
      trailers: this.trailers,
      cars: this.cars,
      other: this.other
    };

    const vehicles = Object.values(categoryData[categoryId] || {});
    const allSelected = vehicles.every(v => 
      this.bulkServicesState.selectedVehicles.some(
        sv => sv.type === categoryId && sv.licensePlate === v.licensePlate
      )
    );

    if (allSelected) {
      // Deselect all in this category
      this.bulkServicesState.selectedVehicles = this.bulkServicesState.selectedVehicles.filter(
        v => v.type !== categoryId
      );
    } else {
      // Select all in this category
      vehicles.forEach(vehicle => {
        if (!this.bulkServicesState.selectedVehicles.some(
          v => v.type === categoryId && v.licensePlate === vehicle.licensePlate
        )) {
          this.bulkServicesState.selectedVehicles.push({
            type: categoryId,
            licensePlate: vehicle.licensePlate
          });
        }
      });
    }

    this.populateBulkVehiclesList();
    this.updateBulkServicesUI();
  }

  // Toggle individual vehicle selection
  toggleBulkVehicleSelection(type, licensePlate) {
    const existingIndex = this.bulkServicesState.selectedVehicles.findIndex(
      v => v.type === type && v.licensePlate === licensePlate
    );

    if (existingIndex >= 0) {
      this.bulkServicesState.selectedVehicles.splice(existingIndex, 1);
    } else {
      this.bulkServicesState.selectedVehicles.push({ type, licensePlate });
    }

    this.updateBulkCategoryCheckboxes();
    this.updateBulkServicesUI();
  }

  // Update category "select all" checkboxes state
  updateBulkCategoryCheckboxes() {
    const categories = ['trucks', 'trailers', 'cars', 'other'];
    const categoryData = {
      trucks: this.trucks,
      trailers: this.trailers,
      cars: this.cars,
      other: this.other
    };

    categories.forEach(categoryId => {
      const checkbox = document.getElementById(`bulk-select-all-${categoryId}`);
      if (!checkbox) return;

      const vehicles = Object.values(categoryData[categoryId] || {});
      if (vehicles.length === 0) {
        checkbox.checked = false;
        checkbox.indeterminate = false;
        return;
      }

      const selectedCount = vehicles.filter(v => 
        this.bulkServicesState.selectedVehicles.some(
          sv => sv.type === categoryId && sv.licensePlate === v.licensePlate
        )
      ).length;

      if (selectedCount === 0) {
        checkbox.checked = false;
        checkbox.indeterminate = false;
      } else if (selectedCount === vehicles.length) {
        checkbox.checked = true;
        checkbox.indeterminate = false;
      } else {
        checkbox.checked = false;
        checkbox.indeterminate = true;
      }
    });
  }

  // Remove vehicle from bulk selection
  removeBulkVehicle(type, licensePlate) {
    const index = this.bulkServicesState.selectedVehicles.findIndex(
      v => v.type === type && v.licensePlate === licensePlate
    );
    if (index >= 0) {
      this.bulkServicesState.selectedVehicles.splice(index, 1);
      this.populateBulkVehiclesList();
      this.updateBulkServicesUI();
    }
  }

  // Update the bulk services UI (counts, chips, apply button)
  updateBulkServicesUI() {
    const servicesCount = this.bulkServicesState.selectedServices.length;
    const vehiclesCount = this.bulkServicesState.selectedVehicles.length;

    // Update counts
    const servicesCountEl = document.getElementById('bulk-services-count');
    const vehiclesCountEl = document.getElementById('bulk-vehicles-count');
    if (servicesCountEl) {
      servicesCountEl.textContent = `${servicesCount} vybraných`;
    }
    if (vehiclesCountEl) {
      vehiclesCountEl.textContent = `${vehiclesCount} vybraných`;
    }

    // Update selected services chips
    const servicesChipsEl = document.getElementById('bulk-selected-services');
    if (servicesChipsEl) {
      if (servicesCount === 0) {
        servicesChipsEl.innerHTML = '';
      } else {
        servicesChipsEl.innerHTML = this.bulkServicesState.selectedServices.map(service => `
          <div class="bulk-chip bulk-service-chip">
            <span>${service.name}</span>
            <button onclick="window.flotilaManager.removeBulkService('${service.id}')" title="Odstrániť">×</button>
          </div>
        `).join('');
      }
    }

    // Update apply summary and button
    const summaryEl = document.getElementById('bulk-apply-summary');
    const applyBtn = document.getElementById('bulk-apply-btn');
    
    if (summaryEl) {
      if (servicesCount > 0 && vehiclesCount > 0) {
        summaryEl.textContent = `Pridať ${servicesCount} servis${servicesCount !== 1 ? 'ov' : ''} k ${vehiclesCount} vozidl${vehiclesCount !== 1 ? 'ám' : 'u'}`;
      } else {
        summaryEl.textContent = 'Vyberte servisy a vozidlá';
      }
    }

    if (applyBtn) {
      applyBtn.disabled = servicesCount === 0 || vehiclesCount === 0;
    }
  }

  // Apply bulk services to selected vehicles
  async applyBulkServices() {
    const { selectedServices, selectedVehicles } = this.bulkServicesState;

    if (selectedServices.length === 0 || selectedVehicles.length === 0) {
      this.showNotification('Vyberte aspoň jeden servis a jedno vozidlo', 'error');
      return;
    }

    const applyBtn = document.getElementById('bulk-apply-btn');
    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.innerHTML = `
        <svg class="loading-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
        </svg>
        Aplikujem...
      `;
    }

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const vehicle of selectedVehicles) {
        try {
          // Get the correct collection based on vehicle type
          let collection;
          let vehicleData;
          
          switch (vehicle.type) {
            case 'trucks':
              collection = this._flotilaTrucksCollection();
              vehicleData = this.trucks[vehicle.licensePlate];
              break;
            case 'trailers':
              collection = this._flotilaTrailersCollection();
              vehicleData = this.trailers[vehicle.licensePlate];
              break;
            case 'cars':
              collection = this._flotilaCarsCollection();
              vehicleData = this.cars[vehicle.licensePlate];
              break;
            case 'other':
              collection = this._flotilaOtherCollection();
              vehicleData = this.other[vehicle.licensePlate];
              break;
            default:
              continue;
          }

          if (!vehicleData) continue;

          // Prepare services to add (clone to avoid reference issues)
          const servicesToAdd = selectedServices.map(service => {
            const serviceClone = { ...service };
            // Remove the id for custom services to avoid conflicts
            if (serviceClone.isCustom) {
              delete serviceClone.id;
              delete serviceClone.isCustom;
            }
            // Add timestamp
            serviceClone.addedAt = new Date().toISOString();
            // Set lastKm: 0 for km-based services so next service is calculated from 0km
            if (serviceClone.type === 'km') {
              serviceClone.lastKm = 0;
            }
            return serviceClone;
          });

          // Get existing services or empty array
          const existingServices = vehicleData.services || [];
          
          // Combine services
          const updatedServices = [...existingServices, ...servicesToAdd];

          // Update in Firebase
          const normalizedPlate = this.normalizeLicensePlate(vehicle.licensePlate);
          await collection.doc(normalizedPlate).update({
            services: updatedServices
          });

          // Update local data
          vehicleData.services = updatedServices;
          
          successCount++;
        } catch (error) {
          console.error(`Error adding services to ${vehicle.licensePlate}:`, error);
          errorCount++;
        }
      }

      // Show result notification
      if (errorCount === 0) {
        this.showNotification(
          `Úspešne pridané ${selectedServices.length} servisov k ${successCount} vozidlám`,
          'success'
        );
      } else {
        this.showNotification(
          `Pridané k ${successCount} vozidlám, ${errorCount} chýb`,
          errorCount === selectedVehicles.length ? 'error' : 'warning'
        );
      }

      // Reset state and close modal
      this.resetBulkServicesState();
      document.querySelector('.settings-modal-overlay')?.remove();

      // Refresh the main view
      await this.loadDataAndRender();

    } catch (error) {
      console.error('Error applying bulk services:', error);
      this.showNotification('Chyba pri aplikovaní servisov: ' + error.message, 'error');
    } finally {
      if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Aplikovať
        `;
      }
    }
  }

  // ==================== END BULK SERVICES METHODS ====================

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
