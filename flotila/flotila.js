// Flotila Management System
class FlotilaManager {
  constructor() {
    this.trucks = {};
    this.trailers = {};
    this.selectedVehicle = null;
    this.currentUser = null;
    this.redirecting = false; // Prevent multiple redirects
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
        window.location.href = '../index.html';
      }
    }
  }

  async loadDataAndRender() {
    await this.loadData();
    this.renderPairs();
    this.clearDetailPanel();
  }

  // Load data from Firebase
  async loadData() {
    try {
      if (!this.currentUser) {
        this.trucks = {};
        this.trailers = {};
        return;
      }
      
      // Get all vehicles from vehicles collection
      const snapshot = await window.db.collection('vehicles').get();
      
      this.trucks = {};
      this.trailers = {};
      
      for (const doc of snapshot.docs) {
        const licensePlate = doc.id;
        
        // Get vehicle info from info subcollection
        const infoDoc = await window.db.collection('vehicles')
          .doc(licensePlate)
          .collection('info')
          .doc('basic')
          .get();
        
        if (infoDoc.exists) {
          const vehicleData = infoDoc.data();
          
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
    } catch (error) {
      console.error('Error loading flotila data:', error);
      // Fallback to empty data
      this.trucks = {};
      this.trailers = {};
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
    document.getElementById('detail-panel')?.addEventListener('click', (e) => {
      // Only deselect if clicking on the placeholder or outside vehicle content
      if (e.target.closest('.detail-placeholder') || 
          (e.target.closest('.detail-panel') && !e.target.closest('.vehicle-detail'))) {
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

  // Get trailer object by license plate
  getTrailer(plate) {
    if (!plate) return null;
    return this.trailers[plate] || null;
  }

  // Render truck-trailer pairs
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
    }

    // Render pairs
    const pairsHtml = filteredTrucks.map(truck => {
      const trailer = truck.trailer ? this.getTrailer(truck.trailer) : null;
      return this.createPairRow(truck, trailer);
    }).join('');

    pairList.innerHTML = pairsHtml;

    // Render unassigned trailers with search filter
    this.renderUnassignedTrailers(query);
  }

  // Create a pair row HTML
  createPairRow(truck, trailer) {
    const trailerClass = trailer ? 'has-trailer' : '';
    
    return `
      <div class="pair-row">
        <div class="vehicle-card truck-card" onclick="flotilaManager.showDetail('truck', '${truck.licensePlate}')">
          <div class="vehicle-info">
            <div class="vehicle-license">${truck.licensePlate}</div>
          </div>
        </div>
        <div class="vehicle-card trailer-card ${trailerClass}" onclick="flotilaManager.showDetail('trailer', '${trailer ? trailer.licensePlate : ''}')">
          <div class="vehicle-info">
            <div class="vehicle-license">${trailer ? trailer.licensePlate : 'Bez prívesu'}</div>
          </div>
        </div>
      </div>
    `;
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
      <div class="vehicle-card trailer-card" onclick="flotilaManager.showDetail('trailer', '${trailer.licensePlate}')">
        <div class="vehicle-info">
          <div class="vehicle-license">${trailer.licensePlate}</div>
        </div>
      </div>
    `).join('');

    unassignedTrailers.innerHTML = titleHtml + trailersHtml;
  }

  // Show vehicle detail
  async showDetail(type, plate) {
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
        vehicle.currentKm = data.currentKm || vehicle.kilometers || 0;
      } else {
        vehicle.services = [];
        vehicle.activeWorkSession = null;
        vehicle.history = [];
        vehicle.currentKm = vehicle.kilometers || 0;
      }
    } catch (error) {
      console.error('Error loading services and work session:', error);
      vehicle.services = [];
      vehicle.activeWorkSession = null;
      vehicle.history = [];
      vehicle.currentKm = vehicle.kilometers || 0;
    }
    
    this.renderDetailPanel(vehicle, type);
  }

  // Clear detail panel and show placeholder
  clearDetailPanel() {
    const detailPanel = document.getElementById('detail-panel');
    if (!detailPanel) return;
    
    // Remove has-vehicle class to reset height
    detailPanel.classList.remove('has-vehicle');
    
    // Reset to placeholder content
    detailPanel.innerHTML = `
      <div class="detail-placeholder">
        <svg width="64" height="64" fill="none" stroke="#9ca3af" stroke-width="1.5">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p>Vyberte vozidlo pre detail</p>
        <p style="font-size: 0.875rem; margin-top: 1rem; opacity: 0.7;">Kliknite pre zrušenie výberu alebo stlačte Escape</p>
      </div>
    `;
  }

  // Deselect current vehicle
  deselectVehicle() {
    this.selectedVehicle = null;
    this.clearDetailPanel();
  }

  // Render detail panel
  renderDetailPanel(vehicle, type) {
    const detailPanel = document.getElementById('detail-panel');
    if (!detailPanel) return;

    // Reset scroll position to top
    detailPanel.scrollTop = 0;
    
    // Add has-vehicle class to extend panel to bottom
    detailPanel.classList.add('has-vehicle');

    const typeText = type === 'truck' ? 'Nákladné auto' : 'Príves';
    const typeColor = type === 'truck' ? '#eab308' : '#2563eb';

    detailPanel.innerHTML = `
      <div class="vehicle-detail">
        <!-- Vehicle Header Info -->
  <div class="vehicle-header" style="display: flex; justify-content: space-between; align-items: center; padding: 0 0 10px 0; border-radius: 0; background: none; box-shadow: none;">
          <div class="vehicle-header-left" style="display: flex; flex-direction: column; gap: 4px;">
            <div class="vehicle-license-large" style="color: #374151; font-size: 1.2rem; font-weight: bold;">${vehicle.licensePlate}</div>
            <div class="vehicle-type" style="color: #6b7280; font-size: 0.95rem; letter-spacing: 1px;">${vehicle.type || 'Neznámy typ'}</div>
          </div>
          <div class="vehicle-header-right" style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <div class="vehicle-km-large" style="color: #374151; font-size: 1rem; font-weight: 600;">${vehicle.kilometers.toLocaleString()} km</div>
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
            <div class="services-section">
              <div class="services-grid">
                ${this.renderServiceTypes(vehicle.services || [])}
              </div>
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
                <div class="completed-work-sessions">
                  ${this.renderCompletedWorkSessions(vehicle.completedWorkSessions || [])}
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

  // Render service types
  renderServiceTypes(services) {
    if (!services || services.length === 0) {
      return '';
    }

    return services.map((service, index) => {
      const statusClass = this.getServiceStatusClass(service);
      return `
        <div class="service-type-card ${statusClass}">
          <div class="service-type-header">
            <div class="service-type-info">
              <h4 class="service-type-name">${service.name}</h4>
              <div class="service-type-interval">
                ${service.interval} ${service.type === 'km' ? 'km' : 'dni'}
              </div>
            </div>
            <div class="service-timing-info">
              <div class="service-due-date">
                ${service.type === 'km' ? this.calculateTargetKm(service) : this.calculateDueDate(service.lastService?.date, service.interval)}
              </div>
              <div class="service-remaining">
                ${service.type === 'km' ? this.calculateRemainingKm(service) : this.calculateRemainingDays(service.lastService?.date, service.interval)}
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
    }).join('');
  }

  // Render service list
  renderServiceList(services) {
    if (!services || services.length === 0) {
      return `
        <div class="no-services">
          <p>Žiadne servisné úlohy</p>
        </div>
      `;
    }

    return services.map(service => {
      const statusClass = service.status || 'pending';
      const statusText = service.status === 'overdue' ? 'Po termíne' : 
                        service.status === 'urgent' ? 'Naliehavé' : 'Čaká';
      
      return `
        <div class="service-item ${statusClass}">
          <div class="service-info">
            <div class="service-name">${service.name}</div>
            <div class="service-details">
              <span class="service-interval">${service.interval}${service.type === 'km' ? ' km' : ' dní'}</span>
            </div>
          </div>
          <div class="service-value ${service.type} ${statusClass}">
            ${service.value}
          </div>
          <button class="add-to-worklist-btn" onclick="window.flotilaManager.addToWorkList('${service.name}', '${service.type}', '${service.value}')">
            Pridať do práce
          </button>
        </div>
      `;
    }).join('');
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
      const statusText = item.status === 'completed' ? 'Dokončené' : (item.status === 'in-progress' ? 'V práci' : 'Čaká');
      
      return `
        <div class="work-item ${statusClass}">
          <div class="work-item-checkbox">
            <input type="checkbox" 
                   id="work-item-${item.id}" 
                   ${item.status === 'completed' ? 'checked' : ''} 
                   onchange="window.flotilaManager.toggleWorkItemStatus(${item.id})">
            <label for="work-item-${item.id}"></label>
          </div>
          <div class="work-item-info">
            <div class="work-item-name">${item.name}</div>
            <div class="work-item-details">
              <span class="service-value">${item.type === 'km' ? item.value + ' km' : item.value}</span>
            </div>
            <div class="work-item-status">${statusText}</div>
          </div>
          <div class="work-item-actions">
            <button class="btn-delete-work-item" onclick="window.flotilaManager.deleteWorkItem(${item.id})" title="Vymazať úlohu">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3,6 5,6 21,6"></polyline>
                <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"></path>
              </svg>
            </button>
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
    // Use history array if available, otherwise fall back to completedWorkSessions
    const history = this.selectedVehicle?.history || completedWorkSessions || [];
    
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

    return history.map(entry => {
      const entryDate = new Date(entry.date || entry.completedAt);
      const kilometers = entry.kilometers || 0;
      
      return `
        <div class="completed-work-session">
          <div class="completed-session-header">
            <div class="session-info">
              <div class="session-date">${entryDate.toLocaleDateString('sk-SK')}</div>
              <div class="session-kilometers">${kilometers.toLocaleString()} km</div>
            </div>
            <div class="session-summary">${entry.items.length} úloh dokončených</div>
          </div>
          <div class="completed-session-items">
            ${entry.items.map(item => `
              <div class="completed-session-item">
                <span class="item-name">${item.name}</span>
                <span class="item-value">${item.type === 'km' ? item.value + ' km' : item.value}</span>
              </div>
            `).join('')}
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
  addToWorkList(serviceName, serviceType, serviceValue) {
    // Check if there's already an active work session
    if (!this.selectedVehicle.activeWorkSession) {
      this.selectedVehicle.activeWorkSession = {
        id: Date.now(),
        startedAt: new Date().toISOString(),
        items: [],
        status: 'active'
      };
    }
    
    // Add the service to the work list
    const workItem = {
      id: Date.now() + Math.random(),
      name: serviceName,
      type: serviceType,
      value: serviceValue,
      status: 'pending', // pending -> in-progress -> completed
      addedAt: new Date().toISOString()
    };
    
    this.selectedVehicle.activeWorkSession.items.push(workItem);
    
    // Update the selectedVehicle reference to ensure consistency
    this.selectedVehicle = { ...this.selectedVehicle };
    
    // Save to database
    this.saveWorkSession();
    
    // Refresh the detail view to update UI
    this.showDetail(this.selectedVehicle.type === 'truck' ? 'truck' : 'trailer', this.selectedVehicle.licensePlate);
    
    // Show success message
    this.showNotification(`${serviceName} pridané do práce`, 'success');
  }



  // Show service type modal
  showServiceTypeModal(serviceIndex = null) {
    const isEditing = serviceIndex !== null;
    const serviceType = isEditing ? this.selectedVehicle.services?.[serviceIndex] : null;
    
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
              <h3>${isEditing ? 'Upraviť typ servisu' : 'Pridať typ servisu'}</h3>
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
                  <input type="text" id="service-type-name" value="${serviceType?.name || ''}" required placeholder="Zadajte názov servisu alebo vyberte z predvolených">
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
                    <input type="radio" name="interval-type" value="time" ${serviceType?.type === 'time' ? 'checked' : ''}>
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
                    <input type="radio" name="interval-type" value="specific-date" ${serviceType?.type === 'specific-date' ? 'checked' : ''}>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="form-section" id="interval-details-section">
              <div class="section-header">
                <h4>Nastavenie intervalu</h4>
                <div class="section-line"></div>
              </div>
              
              <div class="interval-details" id="km-details" style="display: ${serviceType?.type === 'km' || !serviceType ? 'block' : 'none'};">
                <div class="form-group">
                  <label for="service-interval-km">Interval (km):</label>
                  <input type="number" id="service-interval-km" value="${serviceType?.interval || ''}" placeholder="Napríklad: 50000">
                </div>
                <div class="form-group">
                  <label for="service-reminder-km">Upozornenie (km):</label>
                  <input type="number" id="service-reminder-km" value="${serviceType?.reminderKm || 15000}" placeholder="Napríklad: 15000">
                </div>
              </div>
              
              <div class="interval-details" id="time-details" style="display: ${serviceType?.type === 'time' ? 'block' : 'none'};">
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
                    <input type="number" id="service-reminder-time" value="${serviceType?.reminderDays || 30}" placeholder="Napríklad: 30">
                    <select id="reminder-time-unit">
                      <option value="days">Dní</option>
                      <option value="weeks">Týždňov</option>
                      <option value="months">Mesiacov</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div class="interval-details" id="specific-date-details" style="display: ${serviceType?.type === 'specific-date' ? 'block' : 'none'};">
                <div class="form-group">
                  <label for="service-specific-date">Dátum:</label>
                  <input type="date" id="service-specific-date" value="${serviceType?.specificDate || ''}">
                </div>
                <div class="form-group">
                  <label for="service-reminder-days">Upozornenie (dni):</label>
                  <input type="number" id="service-reminder-days" value="${serviceType?.reminderDays || 30}" placeholder="Napríklad: 30">
                </div>
              </div>
            </div>
            
            <div class="form-actions">
              <button type="button" class="btn-secondary" onclick="this.closest('.service-type-modal-overlay').remove()">Zrušiť</button>
              ${isEditing ? `
                <button type="button" class="btn-danger" onclick="window.flotilaManager.deleteService(${serviceIndex}); this.closest('.service-type-modal-overlay').remove();">Vymazať</button>
              ` : ''}
              <button type="submit" class="btn-primary">${isEditing ? 'Uložiť zmeny' : 'Vytvoriť servis'}</button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle form submission
    const form = modal.querySelector('#service-type-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleServiceTypeSubmit(serviceIndex);
    });
    
    // Handle interval type selection
    const intervalOptions = modal.querySelectorAll('.interval-option');
    const intervalDetailsSection = modal.querySelector('#interval-details-section');
    
    intervalOptions.forEach(option => {
      option.addEventListener('click', () => {
        // Update radio button
        const radio = option.querySelector('input[type="radio"]');
        radio.checked = true;
        
        // Update visual selection
        intervalOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        
        // Show/hide interval details
        const type = option.dataset.type;
        this.showIntervalDetails(type);
      });
    });
    
    // Initialize selection
    const selectedOption = modal.querySelector('.interval-option input[type="radio"]:checked');
    if (selectedOption) {
      selectedOption.closest('.interval-option').classList.add('selected');
    }
    
    // Focus on first input
    setTimeout(() => {
      const firstInput = modal.querySelector('#service-type-name');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  // Handle service type form submission
  handleServiceTypeSubmit(serviceIndex = null) {
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
    
    // Only add lastService for new services
    if (serviceIndex === null) {
      serviceData.lastService = {
        date: new Date(),
        km: this.selectedVehicle.currentKm || this.selectedVehicle.kilometers || 0
      };
    }
    
    if (serviceIndex !== null) {
      // Editing existing service
      this.updateService(serviceIndex, serviceData);
    } else {
      // Adding new service
      this.addService(serviceData);
    }
    
    // Close modal
    modal.remove();
  }

  // Add new service
  addService(serviceData) {
    if (!this.selectedVehicle.services) {
      this.selectedVehicle.services = [];
    }
    
    this.selectedVehicle.services.push(serviceData);
    
    // Save to database
    this.saveServices();
    
    // Update the selectedVehicle reference to ensure consistency
    this.selectedVehicle = { ...this.selectedVehicle };
    
    // Refresh the detail view
    this.showDetail(this.selectedVehicle.type === 'truck' ? 'truck' : 'trailer', this.selectedVehicle.licensePlate);
    
    this.showNotification('Servis bol úspešne pridaný!', 'success');
  }

  // Update existing service
  updateService(serviceIndex, serviceData) {
    if (this.selectedVehicle.services && this.selectedVehicle.services[serviceIndex]) {
      // Preserve existing lastService data
      const existingService = this.selectedVehicle.services[serviceIndex];
      const updatedService = {
        ...existingService,
        ...serviceData,
        lastService: existingService.lastService || serviceData.lastService
      };
      
      this.selectedVehicle.services[serviceIndex] = updatedService;
      
      // Save to database
      this.saveServices();
      
      // Update the selectedVehicle reference to ensure consistency
      this.selectedVehicle = { ...this.selectedVehicle };
      
      // Refresh the detail view
      this.showDetail(this.selectedVehicle.type === 'truck' ? 'truck' : 'trailer', this.selectedVehicle.licensePlate);
      
      this.showNotification('Servis bol úspešne upravený!', 'success');
    }
  }

  // Delete service
  deleteService(serviceIndex) {
    if (confirm('Naozaj chcete vymazať tento servis?')) {
      if (this.selectedVehicle.services) {
        this.selectedVehicle.services.splice(serviceIndex, 1);
        
        // Save to database
        this.saveServices();
        
        // Refresh the detail view
        this.showDetail(this.selectedVehicle.type === 'truck' ? 'truck' : 'trailer', this.selectedVehicle.licensePlate);
        
        this.showNotification('Servis bol úspešne vymazaný!', 'success');
      }
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

  // Show interval details based on type
  showIntervalDetails(type) {
    const kmDetails = document.getElementById('km-details');
    const timeDetails = document.getElementById('time-details');
    const specificDateDetails = document.getElementById('specific-date-details');
    
    // Hide all details
    if (kmDetails) kmDetails.style.display = 'none';
    if (timeDetails) timeDetails.style.display = 'none';
    if (specificDateDetails) specificDateDetails.style.display = 'none';
    
    // Show selected details
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
  toggleServiceFromWorkList(serviceName, serviceType, serviceInterval, serviceIndex) {
    if (this.isServiceInWorkList(serviceName)) {
      // Remove from work list
      this.removeFromWorkList(serviceName);
    } else {
      // Add to work list
      this.addToWorkList(serviceName, serviceType, serviceInterval);
    }
    
    // Refresh the entire detail view to update all UI elements
    this.showDetail(this.selectedVehicle.type === 'truck' ? 'truck' : 'trailer', this.selectedVehicle.licensePlate);
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
  removeFromWorkList(serviceName) {
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
    
    // Save to database
    this.saveWorkSession();
    
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
      
      if (Object.keys(updateData).length > 0) {
        await window.db.collection('vehicles')
          .doc(this.selectedVehicle.licensePlate)
          .collection('info')
          .doc('basic')
          .update(updateData);
      }
    } catch (error) {
      console.error('Error saving vehicle data:', error);
      this.showNotification('Chyba pri ukladaní dát vozidla', 'error');
    }
  }

  // Show schedule modal
  showScheduleModal(serviceName, serviceType, serviceValue, isCustom = false, serviceId = null) {
    const isEditing = serviceId !== null;
    const modal = document.createElement('div');
    modal.className = 'schedule-modal-overlay';
    modal.innerHTML = `
      <div class="schedule-modal">
        <div class="modal-header">
          <h3>${isEditing ? 'Upraviť úlohu' : (isCustom ? 'Pridať vlastnú úlohu' : 'Naplanovať úlohu')}</h3>
          <button class="close-btn" onclick="this.closest('.schedule-modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Názov úlohy:</label>
            <input type="text" id="service-name" value="${serviceName}" placeholder="Zadajte názov úlohy">
          </div>
          <div class="form-group">
            <label>Typ:</label>
            <select id="service-type">
              <option value="km" ${serviceType === 'km' ? 'selected' : ''}>Kilometre</option>
              <option value="date" ${serviceType === 'date' ? 'selected' : ''}>Dátum</option>
            </select>
          </div>
          <div class="form-group">
            <label>Hodnota:</label>
            <input type="text" id="service-value" value="${serviceValue}" placeholder="Zadajte hodnotu">
          </div>
          <div class="form-group">
            <label>Poznámka:</label>
            <textarea id="service-note" placeholder="Zadajte poznámku (voliteľné)"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.schedule-modal-overlay').remove()">Zrušiť</button>
          <button class="btn-primary" onclick="window.flotilaManager.confirmSchedule(${serviceId ? serviceId : 'null'})">${isEditing ? 'Uložiť' : 'Naplanovať'}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus on first input
    setTimeout(() => {
      const firstInput = modal.querySelector('#service-name');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  // Confirm schedule
  confirmSchedule(serviceId = null) {
    const modal = document.querySelector('.schedule-modal-overlay');
    const serviceName = document.getElementById('service-name').value.trim();
    const serviceType = document.getElementById('service-type').value;
    const serviceValue = document.getElementById('service-value').value.trim();
    const serviceNote = document.getElementById('service-note').value.trim();
    
    if (!serviceName || !serviceValue) {
      alert('Prosím vyplňte názov úlohy a hodnotu.');
      return;
    }
    
    if (serviceId) {
      // Editing existing service
      const service = this.selectedVehicle.scheduledServices.find(s => s.id === serviceId);
      if (service) {
        service.name = serviceName;
        service.type = serviceType;
        service.value = serviceValue;
        service.note = serviceNote;
        service.updatedAt = new Date().toISOString();
        
        this.showNotification('Úloha bola úspešne upravená!', 'success');
      }
    } else {
      // Adding new service
      if (!this.selectedVehicle.scheduledServices) {
        this.selectedVehicle.scheduledServices = [];
      }
      
      const scheduledService = {
        id: Date.now(),
        name: serviceName,
        type: serviceType,
        value: serviceValue,
        note: serviceNote,
        status: 'working',
        scheduledAt: new Date().toISOString(),
        vehicleId: this.selectedVehicle.licensePlate
      };
      
      this.selectedVehicle.scheduledServices.push(scheduledService);
      
      this.showNotification('Úloha bola úspešne naplanovaná!', 'success');
    }
    
    // Close modal
    modal.remove();
    
    // Refresh the detail view
    this.showDetail(this.selectedVehicle.type === 'truck' ? 'truck' : 'trailer', this.selectedVehicle.licensePlate);
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

  // Start working on a work item
  startWorkItem(itemId) {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    const item = this.selectedVehicle.activeWorkSession.items.find(i => i.id === itemId);
    if (item) {
      item.status = 'in-progress';
      item.startedAt = new Date().toISOString();
      
      // Refresh the detail view
      this.showDetail(this.selectedVehicle.type === 'truck' ? 'truck' : 'trailer', this.selectedVehicle.licensePlate);
      
      this.showNotification(`${item.name} - práca začala`, 'info');
    }
  }

  // Complete a work item
  completeWorkItem(itemId) {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    const item = this.selectedVehicle.activeWorkSession.items.find(i => i.id === itemId);
    if (item) {
      item.status = 'completed';
      item.completedAt = new Date().toISOString();
      
      // Refresh the detail view
      this.showDetail(this.selectedVehicle.type === 'truck' ? 'truck' : 'trailer', this.selectedVehicle.licensePlate);
      
      this.showNotification(`${item.name} - dokončené!`, 'success');
    }
  }

  // Toggle work item status (checkbox functionality)
  toggleWorkItemStatus(itemId) {
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
      
      // Save to database
      this.saveWorkSession();
      
      // Refresh the detail view
      this.showDetail(this.selectedVehicle.type === 'truck' ? 'truck' : 'trailer', this.selectedVehicle.licensePlate);
      
      this.showNotification(`${item.name} ${item.status === 'completed' ? 'označené ako dokončené' : 'označené ako nedokončené'}`, 'info');
    }
  }

  // Delete work item
  deleteWorkItem(itemId) {
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
        
        // Save to database
        this.saveWorkSession();
        
        // Refresh the detail view
        this.showDetail(this.selectedVehicle.type === 'truck' ? 'truck' : 'trailer', this.selectedVehicle.licensePlate);
        
        this.showNotification(`${item.name} vymazané z práce`, 'info');
      }
    }
  }

  // Update work start date
  updateWorkStartDate(newDate) {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    this.selectedVehicle.activeWorkSession.startedAt = new Date(newDate).toISOString();
    this.saveWorkSession();
    this.showNotification('Dátum začiatku práce aktualizovaný', 'info');
  }

  // Update work current kilometers
  updateWorkCurrentKm(newKm) {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    this.selectedVehicle.currentKm = parseInt(newKm) || 0;
    this.saveVehicleData();
    this.showNotification('Aktuálne km aktualizované', 'info');
  }

  // Finish job - move completed items to history
  finishJob() {
    if (!this.selectedVehicle.activeWorkSession) return;
    
    const completedItems = this.selectedVehicle.activeWorkSession.items.filter(item => item.status === 'completed');
    const pendingItems = this.selectedVehicle.activeWorkSession.items.filter(item => item.status !== 'completed');
    
    if (completedItems.length === 0) {
      this.showNotification('Žiadne úlohy nie sú dokončené', 'warning');
      return;
    }
    
    // Create history entry for completed items
    const historyEntry = {
      id: Date.now(),
      date: new Date().toISOString(),
      kilometers: this.selectedVehicle.currentKm || 0,
      items: completedItems.map(item => ({
        name: item.name,
        type: item.type,
        value: item.value,
        completedAt: item.completedAt
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
      this.updateServiceLastService(item.name, historyEntry.date, historyEntry.kilometers);
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
    
    // Save to database
    this.saveWorkSession();
    this.saveVehicleData();
    
    // Refresh the detail view
    this.showDetail(this.selectedVehicle.type === 'truck' ? 'truck' : 'trailer', this.selectedVehicle.licensePlate);
    
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

  // Finish the entire work session (legacy method - kept for compatibility)
  finishWorkSession() {
    this.finishJob();
  }

  // Show settings modal with drag and drop system
  showSettings() {
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
              <h3>Správa párovania</h3>
              <p>Presuňte prívesy medzi nákladnými autami pomocou drag & drop</p>
            </div>
          </div>
          <button class="close-btn" onclick="this.closest('.settings-modal-overlay').remove()">×</button>
        </div>
        
        <div class="modal-body">
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
          
          <div class="modal-footer">
            <button class="btn-secondary" onclick="this.closest('.settings-modal-overlay').remove()">Zrušiť</button>
            <button class="btn-primary" onclick="window.flotilaManager.savePairingChanges()">Uložiť zmeny</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Initialize drag and drop
    this.initializeDragAndDrop();
  }

  // Render trucks for drag and drop
  renderTrucksForDragDrop() {
    const trucks = Object.values(this.trucks).sort((a, b) => a.licensePlate.localeCompare(b.licensePlate));
    
    return trucks.map(truck => {
      const currentTrailer = truck.trailer ? this.getTrailer(truck.trailer) : null;
      return `
        <div class="drag-truck-item" data-truck="${truck.licensePlate}" draggable="true">
          <div class="drag-truck-info">
            <div class="drag-vehicle-license">${truck.licensePlate}</div>
            <div class="drag-vehicle-details">${truck.kilometers.toLocaleString()} km</div>
          </div>
          <div class="drag-trailer-slot" data-truck="${truck.licensePlate}">
            ${currentTrailer ? `
              <div class="drag-trailer-item" data-trailer="${currentTrailer.licensePlate}" draggable="true">
                <div class="drag-vehicle-license">${currentTrailer.licensePlate}</div>
                <div class="drag-vehicle-details">${currentTrailer.kilometers.toLocaleString()} km</div>
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
        <div class="drag-vehicle-details">${trailer.kilometers.toLocaleString()} km</div>
      </div>
    `).join('');
  }

  // Initialize drag and drop functionality
  initializeDragAndDrop() {
    const trailerItems = document.querySelectorAll('.drag-trailer-item');
    const trailerSlots = document.querySelectorAll('.drag-trailer-slot');
    const trailersList = document.getElementById('trailers-list');
    
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
      
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        
        if (draggedElement && draggedElement.classList.contains('drag-trailer-item')) {
          const draggedTrailerPlate = draggedElement.getAttribute('data-trailer');
          const targetTruckPlate = slot.getAttribute('data-truck');
          const currentTrailerInSlot = slot.querySelector('.drag-trailer-item');
          
          if (currentTrailerInSlot && currentTrailerInSlot !== draggedElement) {
            // Swap trailers - move current trailer to dragged trailer's original position
            this.swapTrailers(draggedElement, currentTrailerInSlot);
          } else {
            // Simple assignment
            this.assignTrailerToTruck(draggedElement, targetTruckPlate);
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
    
    trailersList.addEventListener('drop', (e) => {
      e.preventDefault();
      trailersList.classList.remove('drag-over');
      
      if (draggedElement && draggedElement.classList.contains('drag-trailer-item')) {
        const trailerPlate = draggedElement.getAttribute('data-trailer');
        
        // Remove trailer from its current position
        draggedElement.remove();
        
        // Add trailer back to unassigned list
        this.addTrailerToUnassignedList(trailerPlate);
        
        // Update the pairing data (remove trailer from truck)
        this.removeTrailerFromTruck(trailerPlate);
        
        // Refresh the trailers list
        this.refreshTrailersList();
      }
    });
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
  addTrailerToUnassignedList(trailerPlate) {
    const trailersList = document.getElementById('trailers-list');
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
  refreshTrailersList() {
    const trailersList = document.getElementById('trailers-list');
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
    this.loadData();
    this.renderPairs();
  }

  // Calculate due date based on last performed date and interval
  calculateDueDate(lastPerformed, interval) {
    if (!lastPerformed) {
      return 'Nastaviť dátum';
    }
    
    let lastDate;
    if (lastPerformed.toDate) {
      // Firebase Timestamp
      lastDate = lastPerformed.toDate();
    } else if (typeof lastPerformed === 'string') {
      // String date
      lastDate = new Date(lastPerformed);
    } else if (lastPerformed.seconds) {
      // Firebase Timestamp object
      lastDate = new Date(lastPerformed.seconds * 1000);
    } else {
      // Try as regular date
      lastDate = new Date(lastPerformed);
    }
    
    if (isNaN(lastDate.getTime())) {
      return 'Nastaviť dátum';
    }
    
    const dueDate = new Date(lastDate);
    dueDate.setDate(dueDate.getDate() + parseInt(interval));
    
    return dueDate.toLocaleDateString('sk-SK');
  }

  // Format number with spaces for better readability
  formatNumberWithSpaces(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // Calculate remaining days until due date
  calculateRemainingDays(lastPerformed, interval) {
    if (!lastPerformed) {
      return 'Nastaviť dátum';
    }
    
    let lastDate;
    if (lastPerformed.toDate) {
      // Firebase Timestamp
      lastDate = lastPerformed.toDate();
    } else if (typeof lastPerformed === 'string') {
      // String date
      lastDate = new Date(lastPerformed);
    } else if (lastPerformed.seconds) {
      // Firebase Timestamp object
      lastDate = new Date(lastPerformed.seconds * 1000);
    } else {
      // Try as regular date
      lastDate = new Date(lastPerformed);
    }
    
    if (isNaN(lastDate.getTime())) {
      return 'Nastaviť dátum';
    }
    
    const dueDate = new Date(lastDate);
    dueDate.setDate(dueDate.getDate() + parseInt(interval));
    
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
    if (!service.lastService?.km) return 'normal';
    
    const currentKm = this.selectedVehicle?.kilometers || 0;
    const targetKm = service.lastService.km + parseInt(service.interval);
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
    if (!service.lastService?.km) {
      return 'Nastaviť km';
    }
    
    const currentKm = this.selectedVehicle?.kilometers || 0;
    const targetKm = service.lastService.km + parseInt(service.interval);
    const remainingKm = targetKm - currentKm;
    
    if (remainingKm <= 0) {
      return `Prešlo ${this.formatNumberWithSpaces(Math.abs(remainingKm))} km`;
    } else {
      return `Zostáva ${this.formatNumberWithSpaces(remainingKm)} km`;
    }
  }

  // Calculate target km for km-based services
  calculateTargetKm(service) {
    if (!service.lastService?.km) {
      return 'Nastaviť km';
    }
    
    const targetKm = service.lastService.km + parseInt(service.interval);
    return `Pri ${this.formatNumberWithSpaces(targetKm)} km`;
  }

  // Get status for date-based services
  getDateServiceStatus(service) {
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
    dueDate.setDate(dueDate.getDate() + parseInt(service.interval));
    
    const today = new Date();
    const diffTime = dueDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const reminderDays = service.reminderDays || 30;
    
    if (diffDays < 0) {
      return 'overdue';
    } else if (diffDays <= reminderDays) {
      return 'reminder';
    } else {
      return 'normal';
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  window.flotilaManager = new FlotilaManager();
  await window.flotilaManager.init();
});

// Global function for onclick handlers
window.showDetail = function(type, plate) {
  if (window.flotilaManager) {
    window.flotilaManager.showDetail(type, plate);
  }
};