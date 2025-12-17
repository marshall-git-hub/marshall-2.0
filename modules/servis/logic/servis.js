// Service Management JavaScript
class ServiceManager {
  constructor() {
    this.services = {};
    this.vehicles = [];
    this.vehicleKms = {};
    this.predefinedServices = [];
    this.vehiclesDataMap = {}; // Store full vehicle data to avoid redundant queries
    this.init();
  }

  async init() {
    await this.loadVehicleKms();
    await this.loadVehicles();
    await this.loadServices();
    this.setupEventListeners();
    this.renderAllTables();
  }

  async loadVehicles() {
    try {
      // Load vehicles from your existing database
      if (window.DatabaseService && window.db) {
        try {
          const vehiclesMap = await window.DatabaseService.getAllVehicles();
          // Store full vehicle data map for use in loadServices()
          this.vehiclesDataMap = vehiclesMap;
          const licensePlates = Object.keys(vehiclesMap);
          if (licensePlates.length > 0) {
            this.vehicles = licensePlates.map(lp => {
              const vehicle = vehiclesMap[lp];
              return { 
                id: lp, 
                name: vehicle.licensePlate || lp, 
                type: vehicle.type || vehicle.vehicleType || 'vehicle',
                collectionSource: vehicle.collectionSource || ''
              };
            });
          }
        } catch (e) {
          // Derive from vehicles_km as a fallback
          if (this.vehicleKms && Object.keys(this.vehicleKms).length > 0) {
            this.vehicles = Object.keys(this.vehicleKms).map(id => ({ id, name: id, type: 'vehicle' }));
          } else {
            const trucks = await window.DatabaseService.getTrucks();
            const trailers = await window.DatabaseService.getTrailers();
            this.vehicles = [
              ...trucks.map(truck => ({ id: truck.id, name: truck.licensePlate || truck.id, type: 'truck' })),
              ...trailers.map(trailer => ({ id: trailer.id, name: trailer.licensePlate || trailer.id, type: 'trailer' }))
            ];
          }
        }
      } else {
        // Fallback to sample data if database service not available
        this.vehicles = [
          { id: 'ZC352BP', name: 'ZC 352 BP', type: 'truck' },
          { id: 'ZC328BL', name: 'ZC 328 BL', type: 'truck' },
          { id: 'ZC324BL', name: 'ZC 324 BL', type: 'truck' },
          { id: 'ZC153BL', name: 'ZC 153 BL', type: 'truck' },
          { id: 'ZC970BP', name: 'ZC 970 BP', type: 'truck' },
          { id: 'ZC675BT', name: 'ZC 675 BT', type: 'truck' },
          { id: 'ZC750BO', name: 'ZC 750 BO', type: 'truck' },
          { id: 'ZC383BL', name: 'ZC 383 BL', type: 'truck' },
          { id: 'ZC465BS', name: 'ZC 465 BS', type: 'truck' },
          { id: 'ZC449BV', name: 'ZC 449 BV', type: 'truck' },
          { id: 'ZC773BS', name: 'ZC 773 BS', type: 'truck' },
          { id: 'ZC889BS', name: 'ZC 889 BS', type: 'truck' },
          { id: 'ZC491BS', name: 'ZC 491 BS', type: 'truck' },
          { id: 'ZC974BP', name: 'ZC 974 BP', type: 'truck' },
          { id: 'ZC237YC', name: 'ZC 237YC', type: 'trailer' },
          { id: 'ZC859BR', name: 'ZC 859 BR', type: 'truck' },
          { id: 'ZC594BN', name: 'ZC 594 BN', type: 'truck' },
          { id: 'ZC388BS', name: 'ZC 388 BS', type: 'truck' },
          { id: 'VZV', name: 'VZV', type: 'forklift' },
          { id: 'ZC685BP', name: 'ZC 685 BP', type: 'truck' },
          { id: 'ZC206YD', name: 'ZC 206 YD', type: 'truck' },
          { id: 'ZC954BA', name: 'ZC 954 BA', type: 'truck' },
          { id: 'VZV2', name: 'VZV2', type: 'forklift' }
        ];
      }
    } catch (error) {
      console.error('Error loading vehicles:', error);
      this.vehicles = [];
    }
  }

  async loadVehicleKms() {
    try {
      if (window.DatabaseService && window.db) {
        this.vehicleKms = await window.DatabaseService.getAllVehicleKms();
      } else {
        this.vehicleKms = {};
      }

      // If vehicles list is empty, derive from kms keys
      if ((!this.vehicles || this.vehicles.length === 0) && this.vehicleKms && Object.keys(this.vehicleKms).length > 0) {
        this.vehicles = Object.keys(this.vehicleKms).map(id => ({ id, name: id, type: 'vehicle' }));
      }
    } catch (error) {
      console.error('Error loading vehicle KMs:', error);
      this.vehicleKms = {};
    }
  }

  async loadServices() {
    try {
      if (window.db && window.DatabaseService) {
        // Prepare category buckets
        const buckets = {
          stk: [],
          tachograph: [],
          dpf: [],
          calibration: [],
          geometry: [],
          'l-certificate': [],
          'engine-oil': [],
          'differential-oil': [],
          'transmission-oil': [],
          'annual-tractor': [],
          'annual-trailer': [],
          'brake-check': [],
          other: [],
          personal: []
        };

        const defaultKmReminder = 15000;
        const defaultDaysReminder = 30;

        const vehicles = this.vehicles || [];
        
        // Use already-loaded vehicle data to avoid redundant queries
        // If vehiclesDataMap is available, use it; otherwise fall back to parallel queries
        let vehicleInfoList = [];
        
        if (this.vehiclesDataMap && Object.keys(this.vehiclesDataMap).length > 0) {
          // Use cached data - much faster!
          vehicleInfoList = vehicles.map(vehicle => {
            const licensePlate = vehicle.name || vehicle.id;
            // Normalize license plate (remove spaces) to match the key format
            const normalizedPlate = (licensePlate || '').replace(/\s+/g, '');
            const vehicleData = this.vehiclesDataMap[normalizedPlate];
            
            if (!vehicleData) return null;
            
            return {
              vehicle,
              info: {
                ...vehicleData,
                licensePlate: vehicleData.licensePlate || normalizedPlate,
                kilometers: this.getCurrentKm(normalizedPlate) ?? vehicleData.kilometers ?? vehicleData.currentKm ?? 0,
                services: vehicleData.services || [],
                collectionSource: vehicleData.collectionSource || vehicle.collectionSource || ''
              }
            };
          }).filter(item => item !== null && item.info && item.info.services && item.info.services.length > 0);
        } else {
          // Fallback: fetch all vehicle info in parallel (still much faster than sequential)
          const infoPromises = vehicles.map(async (vehicle) => {
            const licensePlate = vehicle.name || vehicle.id;
            try {
              const info = await window.DatabaseService.getVehicleInfo(licensePlate);
              return info ? { vehicle, info } : null;
            } catch (e) {
              return null;
            }
          });
          
          const results = await Promise.all(infoPromises);
          vehicleInfoList = results.filter(item => item !== null && item.info && item.info.services && item.info.services.length > 0);
        }
        
        // Process all vehicles with their info
        for (const { vehicle, info } of vehicleInfoList) {
          const licensePlate = vehicle.name || vehicle.id;

          const currentKm = this.getCurrentKm(licensePlate) ?? info.kilometers ?? 0;
          
          // Check collection source - only cars and other go to "personal"
          const collectionSource = info.collectionSource || vehicle.collectionSource || '';
          const isCarOrOther = collectionSource === 'cars' || collectionSource === 'other';

          for (const svc of info.services) {
            // Normalize service format - handle both old (unit/norm/lastDate/lastKm) and new (type/interval/lastService) formats
            let type = svc.type || svc.unit || 'km';
            let interval = svc.interval || svc.norm || 0;
            let lastService = svc.lastService || null;
            
            // Convert old format to new format
            if (!lastService && (svc.lastDate || svc.lastKm !== undefined)) {
              lastService = {
                date: svc.lastDate || null,
                km: svc.lastKm !== undefined ? svc.lastKm : (svc.lastService?.km || 0)
              };
            }
            
            // Handle specificDate format (norm contains date string like "04.05.2026" or "17.10.2027")
            if ((type === 'specificDate' || type === 'specificdate') && svc.norm) {
              // Parse date from norm (format: "DD.MM.YYYY")
              const dateStr = String(svc.norm).trim();
              const parts = dateStr.split('.');
              if (parts.length === 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
                const year = parseInt(parts[2], 10);
                if (!isNaN(day) && !isNaN(month) && !isNaN(year) && month >= 0 && month < 12) {
                  const specificDate = new Date(year, month, day);
                  if (!isNaN(specificDate.getTime())) {
                    lastService = { date: specificDate.toISOString().split('T')[0] };
                    type = 'specificDate';
                    interval = 0; // specificDate doesn't use interval
                  }
                }
              }
            }
            
            // Get reminder values
            const reminderKm = svc.reminderKm != null ? svc.reminderKm : (svc.signal && type === 'km' ? svc.signal : defaultKmReminder);
            const reminderDays = svc.reminderDays != null ? svc.reminderDays : (svc.signal && type !== 'km' ? svc.signal : defaultDaysReminder);

            // Skip if we can't compute (no interval for non-specificDate, or no lastService)
            if (type !== 'specificDate' && !interval) continue;
            if (!lastService) continue;

            // Get timeUnit from service data (used for year/month/day calculations)
            // Flotila stores this as 'years', 'months', or 'days'
            let timeUnit = svc.timeUnit || null;
            // If timeUnit is not set, try to infer from old unit field
            if (!timeUnit && svc.unit) {
              if (svc.unit === 'year') timeUnit = 'years';
              else if (svc.unit === 'month') timeUnit = 'months';
              else if (svc.unit === 'day') timeUnit = 'days';
            }

            const calc = window.DatabaseService.calculateNextService(lastService, interval, currentKm, type, timeUnit);
            if (!calc) continue;

            // Decide visibility based on reminder thresholds
            let shouldShow = false;
            let entry = { 
              id: `${licensePlate}_${svc.name}`, 
              vehicle: licensePlate,
              originalName: svc.name || '' // Store original name for STK/EK identification
            };

            if (type === 'km') {
              const remainingKm = calc.remainingKm;
              const nextKm = calc.nextKm;
              if (typeof remainingKm === 'number') {
                shouldShow = remainingKm <= reminderKm;
                entry.km = nextKm;
                entry.note = `Zostáva ${remainingKm.toLocaleString()} km`;
                entry.priority = remainingKm <= 0 ? 'high' : (remainingKm <= Math.max(1, Math.floor(reminderKm / 2)) ? 'medium' : 'low');
              }
            } else if (type === 'date' || type === 'specificDate' || type === 'day' || type === 'month' || type === 'year') {
              const daysRemaining = calc.daysRemaining;
              const nextDate = calc.nextDate;
              if (typeof daysRemaining === 'number') {
                shouldShow = daysRemaining <= reminderDays;
                entry.date = nextDate instanceof Date ? nextDate.toISOString().slice(0, 10) : (nextDate || '');
                entry.priority = daysRemaining <= 0 ? 'high' : (daysRemaining <= Math.max(1, Math.floor(reminderDays / 2)) ? 'medium' : 'low');
              }
            }

            if (!shouldShow) continue;

            // Determine UI category and description
            let category = svc.category || this.mapServiceToCategory(svc.name || '');
            
            // If vehicle is from cars or other collection, move services to "personal" category
            // Except for STK and EK which should stay in their category for combination
            if (isCarOrOther && category !== 'stk' && category !== 'l-certificate') {
              category = 'personal';
            }
            
            if (!buckets[category]) buckets[category] = [];

            if (category === 'other' || category === 'personal') {
              entry.description = svc.name || '-';
              if (entry.km) entry.dateKm = entry.km;
            }

            buckets[category].push(entry);
          }
        }

        // Combine STK and EK services for the same vehicle
        // Use the earlier date (closer to being past)
        this.combineSTKAndEK(buckets);

        this.services = buckets;
      } else {
        // Fallback to sample data if database not available
        this.services = {
          stk: [
            { id: 'stk1', vehicle: 'ZC352BP', date: '2025-09-13', note: 'STK kontrola' },
            { id: 'stk2', vehicle: 'ZC328BL', date: '2025-09-18', note: 'STK kontrola' },
            { id: 'stk3', vehicle: 'ZC324BL', date: '2025-10-06', note: 'STK kontrola' },
            { id: 'stk4', vehicle: 'ZC153BL', date: '2025-10-12', note: 'STK kontrola' },
            { id: 'stk5', vehicle: 'ZC970BP', date: '2025-10-15', note: 'STK kontrola' }
          ],
          tachograph: [
            { id: 'tach1', vehicle: 'ZC675BT', date: '2025-09-25', note: 'Stiahnutie dát' },
            { id: 'tach2', vehicle: 'ZC750BO', date: '2025-09-25', note: 'Stiahnutie dát' },
            { id: 'tach3', vehicle: 'ZC352BP', date: '2025-09-25', note: 'Stiahnutie dát' },
            { id: 'tach4', vehicle: 'ZC383BL', date: '2025-09-26', note: 'Stiahnutie dát' },
            { id: 'tach5', vehicle: 'ZC465BS', date: '2025-10-02', note: 'Stiahnutie dát' },
            { id: 'tach6', vehicle: 'ZC449BV', date: '2025-10-02', note: 'Stiahnutie dát' }
          ],
          dpf: [
            { id: 'dpf1', vehicle: 'ZC889BS', km: 399572, note: 'DPF čistenie' },
            { id: 'dpf2', vehicle: 'ZC328BL', km: 774112, note: 'DPF čistenie' },
            { id: 'dpf3', vehicle: 'ZC491BS', km: 783953, note: 'DPF čistenie' }
          ],
          calibration: [],
          'l-certificate': [
            { id: 'lcert1', vehicle: 'ZC773BS', date: '2025-10-12', note: 'L-Certifikát kontrola' }
          ],
          'engine-oil': [
            { id: 'eo1', vehicle: 'ZC889BS', km: 399572, note: 'Výmena motorového oleja' },
            { id: 'eo2', vehicle: 'ZC328BL', km: 774112, note: 'Výmena motorového oleja' },
            { id: 'eo3', vehicle: 'ZC491BS', km: 783953, note: 'Výmena motorového oleja' }
          ],
          'differential-oil': [
            { id: 'do1', vehicle: 'ZC889BS', km: 388166, note: 'Výmena diferenciálneho oleja' },
            { id: 'do2', vehicle: 'ZC328BL', km: 760446, note: 'Výmena diferenciálneho oleja' }
          ],
          'transmission-oil': [
            { id: 'to1', vehicle: 'ZC889BS', km: 388166, note: 'Výmena prevodového oleja' },
            { id: 'to2', vehicle: 'ZC328BL', km: 760446, note: 'Výmena prevodového oleja' }
          ],
          'annual-tractor': [
            { id: 'at1', vehicle: 'ZC889BS', date: '2025-09-13', note: 'Ročná kontrola tahača' },
            { id: 'at2', vehicle: 'ZC974BP', date: '2025-10-02', note: 'Ročná kontrola tahača' },
            { id: 'at3', vehicle: 'ZC970BP', date: '2025-10-15', note: 'Ročná kontrola tahača' }
          ],
          'annual-trailer': [
            { id: 'an1', vehicle: 'ZC237YC', date: '2025-10-05', note: 'Ročná kontrola návesu' }
          ],
          'brake-check': [
            { id: 'bc1', vehicle: 'ZC237YC', date: '2025-10-05', note: 'Kontrola bŕzd' }
          ],
          other: [
            { id: 'oth1', vehicle: 'ZC675BT', dateKm: '530981', description: 'servis kontrola nastavenie ventilov', note: '' },
            { id: 'oth2', vehicle: 'ZC328BL', dateKm: '713159', description: 'servis kontrola nastavenie ventilov', note: '' },
            { id: 'oth3', vehicle: 'ZC328BL', dateKm: '760446', description: 'výmena prevodového oleja', note: '' },
            { id: 'oth4', vehicle: 'ZC153BL', dateKm: '825521', description: 'servis kontrola nastavenie ventilov', note: '' }
          ],
          personal: [
            { id: 'per1', vehicle: 'ZC859BR', date: '2024-01-01', description: 'výmena motorového oleja', note: '174977 km' },
            { id: 'per2', vehicle: 'ZC594BN', date: '2024-06-21', description: 'výmena chladiacej zmesi', note: '32600 km' },
            { id: 'per3', vehicle: 'ZC388BS', date: '2024-07-16', description: 'výmena motorového oleja', note: '' },
            { id: 'per4', vehicle: 'VZV', date: '2024-07-28', description: 'Výmena motorového oleja filtrov', note: '' },
            { id: 'per5', vehicle: 'ZC594BN', date: '2025-01-13', description: 'výmena prevodového oleja', note: '46000 km' },
            { id: 'per6', vehicle: 'ZC685BP', date: '2025-01-31', description: 'mýto diaľničná známka ročná SK', note: '' },
            { id: 'per7', vehicle: 'ZC206YD', date: '2025-01-31', description: 'mýto diaľničná známka ročná SK', note: '' },
            { id: 'per8', vehicle: 'ZC388BS', date: '2025-02-16', description: 'výmena chladiacej zmesi', note: '' },
            { id: 'per9', vehicle: 'ZC954BA', date: '2025-03-11', description: 'mýto diaľničná známka ročná SK', note: '' },
            { id: 'per10', vehicle: 'ZC388BS', date: '2025-05-01', description: 'mýto diaľničná známka ročná SK', note: '' },
            { id: 'per11', vehicle: 'VZV2', date: '2025-05-30', description: 'Výměna motorového oleja, filtrov', note: '' },
            { id: 'per12', vehicle: 'ZC954BA', date: '2025-07-14', description: 'výmena motorového oleja', note: '' },
            { id: 'per13', vehicle: 'ZC324BL', date: '2025-09-27', description: 'výmena motorového oleja', note: '' }
          ]
        };
      }
    } catch (error) {
      console.error('Error loading services:', error);
      this.services = {};
    }
  }

  setupEventListeners() {
    // Export button
    document.getElementById('export-btn').addEventListener('click', () => {
      this.exportData();
    });

    // Global search
    document.getElementById('global-search').addEventListener('input', (e) => {
      this.filterServices(e.target.value);
    });
  }

  renderAllTables() {
    Object.keys(this.services).forEach(category => {
      this.renderTable(category);
    });
    this.updateHeaderCounts();
  }



  renderTable(category) {
    const tbody = document.getElementById(`${category}-tbody`);
    if (!tbody) return;

    const services = this.services[category] || [];
    
    // Check if this is a 3-column table
    const isThreeColumn = category === 'other' || category === 'personal';
    const colSpan = isThreeColumn ? 3 : 2;
    
    if (services.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${colSpan}" style="text-align: center; padding: 1rem; color: #6b7280;">
            Žiadne úlohy
          </td>
        </tr>
      `;
      return;
    }

    // Sort services by priority and date
    services.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const aPriority = priorityOrder[a.priority || 'medium'] || 2;
      const bPriority = priorityOrder[b.priority || 'medium'] || 2;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      // If same priority, sort by date (earliest first)
      if (a.date && b.date) {
        return new Date(a.date) - new Date(b.date);
      }
      
      return 0;
    });

    tbody.innerHTML = services.map(service => {
      const vehicle = this.vehicles.find(v => v.id === service.vehicle);
      const vehicleName = vehicle ? vehicle.name : service.vehicle;
      
      let dateCell, kmCell;
      if (service.date) {
        dateCell = `<td class="date-cell">${this.formatDate(service.date)}</td>`;
        kmCell = '<td>-</td>';
      } else if (service.km) {
        dateCell = '<td>-</td>';
        kmCell = `<td class="km-cell">${service.km.toLocaleString()} km</td>`;
      } else if (service.dateKm) {
        dateCell = `<td class="km-cell">${parseInt(service.dateKm).toLocaleString()} km</td>`;
        kmCell = '<td>-</td>';
      } else {
        dateCell = '<td>-</td>';
        kmCell = '<td>-</td>';
      }

      let descriptionCell = '';
      if (service.description) {
        descriptionCell = `<td class="note-cell">${service.description}</td>`;
      }

      // Render different layouts for 3-column vs 2-column tables
      if (isThreeColumn) {
        // 3-column layout: Vehicle | Km/Date | Description
        let kmDateCell;
        if (service.date) {
          const daysLeft = this.calculateDaysLeft(service.date);
          const indicator = this.getDateIndicator(daysLeft);
          kmDateCell = `<td class="date-cell">${this.formatDate(service.date)} ${indicator}</td>`;
        } else if (service.km) {
          const kmLeft = this.calculateKmLeft(service.km, service.vehicle);
          const indicator = this.getKmIndicator(kmLeft);
          kmDateCell = `<td class="km-cell">${service.km.toLocaleString()} km ${indicator}</td>`;
        } else if (service.dateKm) {
          // For Ostatné table, calculate km left and add indicator
          const kmLeft = this.calculateKmLeft(parseInt(service.dateKm, 10), service.vehicle);
          const indicator = this.getKmIndicator(kmLeft);
          kmDateCell = `<td class="km-cell">${parseInt(service.dateKm).toLocaleString()} km ${indicator}</td>`;
        } else {
          kmDateCell = '<td>-</td>';
        }

        return `
          <tr>
            <td><span class="vehicle-plate">${vehicleName}</span></td>
            ${kmDateCell}
            <td class="note-cell">${service.description || '-'}</td>
          </tr>
        `;
      } else {
        // 2-column layout: Vehicle | Date only (NO descriptions)
        let content = '';
        if (service.date) {
          const daysLeft = this.calculateDaysLeft(service.date);
          const indicator = this.getDateIndicator(daysLeft);
          content = `${this.formatDate(service.date)} ${indicator}`;
        } else if (service.km) {
          const kmLeft = this.calculateKmLeft(service.km, service.vehicle);
          const indicator = this.getKmIndicator(kmLeft);
          content = `${service.km.toLocaleString()} km ${indicator}`;
        } else if (service.dateKm) {
          content = `${parseInt(service.dateKm).toLocaleString()} km`;
        } else {
          content = '-';
        }
        
        return `
          <tr>
            <td><span class="vehicle-plate">${vehicleName}</span></td>
            <td>${content}</td>
          </tr>
        `;
      }
    }).join('');
  }

  // Normalize license plate/IDs to match vehicles_km keys
  normalizeVehicleId(id) {
    if (!id) return id;
    return String(id).replace(/\s+/g, '').toUpperCase();
  }

  // Get current KM for a given vehicle, trying both exact and normalized IDs
  getCurrentKm(vehicleId) {
    if (!vehicleId) return undefined;
    const exact = this.vehicleKms[vehicleId];
    if (typeof exact === 'number') return exact;
    const norm = this.normalizeVehicleId(vehicleId);
    const byNorm = this.vehicleKms[norm];
    if (typeof byNorm === 'number') return byNorm;
    return undefined;
  }

  openModal(category = null) {
    const modal = document.getElementById('service-modal');
    const modalTitle = document.getElementById('modal-title');
    const categorySelect = document.getElementById('service-category');
    
    // Reset form
    document.getElementById('service-form').reset();
    
    // Set category if provided
    if (category) {
      categorySelect.value = category;
      categorySelect.disabled = true;
    } else {
      categorySelect.disabled = false;
    }
    
    // Populate vehicle select
    this.populateVehicleSelect();
    
    // Set modal title
    modalTitle.textContent = category ? `Pridať úlohu - ${this.getCategoryDisplayName(category)}` : 'Pridať novú úlohu';
    
    modal.style.display = 'block';
    this.currentEditId = null;
  }

  closeModal() {
    document.getElementById('service-modal').style.display = 'none';
    document.getElementById('service-category').disabled = false;
  }

  populateVehicleSelect() {
    const vehicleSelect = document.getElementById('vehicle-select');
    vehicleSelect.innerHTML = '<option value="">Vyberte vozidlo</option>';
    
    this.vehicles.forEach(vehicle => {
      const option = document.createElement('option');
      option.value = vehicle.id;
      option.textContent = vehicle.name;
      vehicleSelect.appendChild(option);
    });
  }

  getCategoryDisplayName(category) {
    const names = {
      'stk': 'STK + EK',
      'tachograph': 'Tachograf',
      'dpf': 'DPF čistenie',
      'calibration': 'Ciachovanie',
      'l-certificate': 'L-Certifikát',
      'engine-oil': 'Motorový olej',
      'differential-oil': 'Diferenciálny olej',
      'transmission-oil': 'Prevodový olej',
      'geometry': 'Geometria',
      'annual-tractor': 'Ročná tahač',
      'annual-trailer': 'Ročná náves',
      'brake-check': 'Kontrola bŕzd',
      'other': 'Ostatné',
      'personal': 'Osobné'
    };
    return names[category] || category;
  }







  filterServices(searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    
    document.querySelectorAll('.maintenance-table').forEach(table => {
      const rows = table.querySelectorAll('tbody tr');
      let hasVisibleRows = false;
      
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const isVisible = text.includes(searchLower);
        row.style.display = isVisible ? '' : 'none';
        if (isVisible) hasVisibleRows = true;
      });
      
      // Show/hide table based on search results
      table.style.display = hasVisibleRows ? '' : 'none';
    });
  }

  // Calculate days left until deadline (positive = days left, negative = days overdue)
  calculateDaysLeft(deadlineDate) {
    const today = new Date();
    const deadline = new Date(deadlineDate);
    const diffTime = deadline - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  // Calculate kilometers left until service (positive = km left, negative = km overdue)
  calculateKmLeft(serviceKm, vehicleId) {
    const currentKm = this.getCurrentKm(vehicleId);
    if (typeof currentKm !== 'number') return NaN;
    return serviceKm - currentKm;
  }

  // Get date indicator with color coding
  getDateIndicator(daysLeft) {
    if (daysLeft > 30) {
      return `<span class="indicator good">+${daysLeft} dní</span>`;
    } else if (daysLeft > 7) {
      return `<span class="indicator warning">+${daysLeft} dní</span>`;
    } else if (daysLeft > 0) {
      return `<span class="indicator urgent">+${daysLeft} dní</span>`;
    } else if (daysLeft === 0) {
      return `<span class="indicator overdue">Dnes</span>`;
    } else {
      return `<span class="indicator overdue">-${Math.abs(daysLeft)} dní</span>`;
    }
  }

  // Get kilometer indicator with color coding
  getKmIndicator(kmLeft) {
    if (!isFinite(kmLeft)) {
      return '';
    }
    if (kmLeft > 10000) {
      return `<span class="indicator good">+${kmLeft.toLocaleString()} km</span>`;
    } else if (kmLeft > 5000) {
      return `<span class="indicator warning">+${kmLeft.toLocaleString()} km</span>`;
    } else if (kmLeft > 0) {
      return `<span class="indicator urgent">+${kmLeft.toLocaleString()} km</span>`;
    } else if (kmLeft === 0) {
      return `<span class="indicator overdue">Teraz</span>`;
    } else {
      return `<span class="indicator overdue">-${Math.abs(kmLeft).toLocaleString()} km</span>`;
    }
  }

  // Get status text for Excel export (date-based)
  getStatusText(daysLeft) {
    if (daysLeft > 30) {
      return 'OK';
    } else if (daysLeft > 7) {
      return 'Varovanie';
    } else if (daysLeft > 0) {
      return 'Urgentné';
    } else if (daysLeft === 0) {
      return 'Dnes';
    } else {
      return 'Po termíne';
    }
  }

  // Get status text for Excel export (km-based)
  getKmStatusText(kmLeft) {
    if (!isFinite(kmLeft)) {
      return '';
    }
    if (kmLeft > 10000) {
      return 'OK';
    } else if (kmLeft > 5000) {
      return 'Varovanie';
    } else if (kmLeft > 0) {
      return 'Urgentné';
    } else if (kmLeft === 0) {
      return 'Teraz';
    } else {
      return 'Po termíne';
    }
  }





  formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('sk-SK');
  }

  exportData() {
    try {
      // Check if XLSX is available
      if (typeof XLSX === 'undefined') {
        alert('Excel export library not loaded. Please refresh the page and try again.');
        return;
      }
      
      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = wb.active;
      
      // Set column widths similar to your Python script
      // Note: SheetJS uses 0-based indexing, so we need to set widths for all columns
      const columnWidths = [];
      for (let i = 0; i < 26; i++) { // A-Z columns
        if (i === 1) columnWidths.push({ width: 17.8 });      // Column B
        else if (i === 2) columnWidths.push({ width: 18.5 }); // Column C
        else if (i === 3) columnWidths.push({ width: 17.5 }); // Column D
        else if (i === 5) columnWidths.push({ width: 14.75 }); // Column F
        else if (i === 6) columnWidths.push({ width: 18.5 }); // Column G
        else if (i === 7) columnWidths.push({ width: 17.5 }); // Column H
        else if (i === 9) columnWidths.push({ width: 10.4 }); // Column J
        else if (i === 10) columnWidths.push({ width: 18.7 }); // Column K
        else if (i === 11) columnWidths.push({ width: 37 });  // Column L
        else if (i === 12) columnWidths.push({ width: 17.5 }); // Column M
        else columnWidths.push({ width: 10 }); // Default width for other columns
      }
      ws['!cols'] = columnWidths;
      
      let currentRow = 2; // Start from row 2
      
      // Debug: Log the entire services object
      console.log('All services:', this.services);
      console.log('Services keys:', Object.keys(this.services));
      
      // Create STK + EK section
      console.log('Creating STK section with data:', this.services.stk);
      currentRow = this.createExcelSection(ws, 'B', 'D', currentRow, 
        ['STK + EK', 'Datum', 'Poznamka'], 
        this.services.stk || [], 'stk_ek', 'TableStyleMedium10');
      
      // Create Tachograph section
      currentRow = this.createExcelSection(ws, 'B', 'D', currentRow,
        ['Stiahnutie Tach.', 'Datum', 'Poznamka'],
        this.services.tachograph || [], 'tachograph', 'TableStyleMedium13');
      
      // Create DPF section
      currentRow = this.createExcelSection(ws, 'B', 'D', currentRow,
        ['DPF čistenie', 'Kilometrov', 'Poznamka'],
        this.services.dpf || [], 'dpf', 'TableStyleMedium11');
      
      // Create Ciachovanie section
      currentRow = this.createExcelSection(ws, 'B', 'D', currentRow,
        ['Ciachovanie', 'Datum', 'Poznamka'],
        this.services.calibration || [], 'ciachovanie', 'TableStyleMedium9');
      
      // Create Geometria section
      currentRow = this.createExcelSection(ws, 'B', 'D', currentRow,
        ['Geometria', 'Datum', 'Poznamka'],
        this.services.geometry || [], 'geometria', 'TableStyleMedium9');
      
      // Create L-Certifikát section
      currentRow = this.createExcelSection(ws, 'B', 'D', currentRow,
        ['L-Certifikát', 'Datum', 'Poznamka'],
        this.services['l-certificate'] || [], 'l_certifikat', 'TableStyleMedium11');
      
      // Reset to column F for second column
      currentRow = 2;
      
      // Create Motor. olej section
      currentRow = this.createExcelSection(ws, 'F', 'H', currentRow,
        ['Motor. olej', 'Kilometrov', 'Poznamka'],
        this.services['engine-oil'] || [], 'motor_olej', 'TableStyleMedium9');
      
      // Create Diferenciálny olej section
      currentRow = this.createExcelSection(ws, 'F', 'H', currentRow,
        ['Difer. olej', 'Kilometrov', 'Poznamka'],
        this.services['differential-oil'] || [], 'difer_olej', 'TableStyleMedium9');
      
      // Create Prevodovka olej section
      currentRow = this.createExcelSection(ws, 'F', 'H', currentRow,
        ['Prevodovka olej', 'Kilometrov', 'Poznamka'],
        this.services['transmission-oil'] || [], 'prevodovka_olej', 'TableStyleMedium9');
      
      // Create Ročná tahač section
      currentRow = this.createExcelSection(ws, 'F', 'H', currentRow,
        ['Ročná tahač', 'Datum', 'Poznamka'],
        this.services['annual-tractor'] || [], 'rocna_tahac', 'TableStyleMedium11');
      
      // Create Ročná náves section
      currentRow = this.createExcelSection(ws, 'F', 'H', currentRow,
        ['Ročná náves', 'Datum', 'Poznamka'],
        this.services['annual-trailer'] || [], 'rocna_naves', 'TableStyleMedium11');
      
      // Create Kontrola bŕzd section
      currentRow = this.createExcelSection(ws, 'F', 'H', currentRow,
        ['Kontrola Bŕzd', 'Datum', 'Poznamka'],
        this.services['brake-check'] || [], 'kontrola_brzd', 'TableStyleMedium9');
      
      // Reset to column J for third column
      currentRow = 2;
      
      // Create Ostatné section (3 columns)
      currentRow = this.createExcelSection(ws, 'J', 'M', currentRow,
        ['Ostatné', 'Datum', 'Kontrola', 'Poznamka'],
        this.services.other || [], 'ostatne', 'TableStyleMedium14', true);
      
      // Create Osobné section (3 columns)
      currentRow = this.createExcelSection(ws, 'J', 'M', currentRow + 20,
        ['Osobné', 'Datum', 'Kontrola', 'Poznamka'],
        this.services.personal || [], 'osobne', 'TableStyleMedium12', true);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Servis Údržba');
      
      // Generate filename with current date
      const fileName = `servis_udrzba_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      // Save the file
      XLSX.writeFile(wb, fileName);
      
      console.log('Data exported successfully to Excel');
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Chyba pri exporte dát');
    }
  }

  // Helper method to create Excel sections with proper styling
  createExcelSection(ws, startCol, endCol, startRow, headers, services, sectionName, tableStyle, isThreeColumn = false) {
    console.log(`Creating section ${sectionName} with ${services.length} services`);
    const startColNum = startCol.charCodeAt(0) - 65 + 1;
    const endColNum = endCol.charCodeAt(0) - 65 + 1;
    
    // Set headers with styling
    for (let col = 0; col < headers.length; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: startRow - 1, c: startColNum - 1 + col });
      ws[cellAddress] = { v: headers[col] };
      
      // Style header
      ws[cellAddress].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: this.getHeaderColor(sectionName) } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } }
        }
      };
    }
    
         // Add data rows
     let dataRow = startRow;
     
     // If no services, just return the header row
     if (!services || services.length === 0) {
       console.log(`No services for section ${sectionName}`);
       return startRow + 2;
     }
     
     services.forEach(service => {
      const vehicle = this.vehicles.find(v => v.id === service.vehicle);
      const vehicleName = vehicle ? vehicle.name : service.vehicle;
      
      // Vehicle column
      const vehicleCell = XLSX.utils.encode_cell({ r: dataRow - 1, c: startColNum - 1 });
      ws[vehicleCell] = { v: vehicleName };
      ws[vehicleCell].s = {
        font: { name: "Courier New", size: 10, bold: true },
        fill: { fgColor: { rgb: "F3F4F6" } },
        border: { style: "thin", color: { rgb: "E5E7EB" } },
        alignment: { vertical: "center" }
      };
      
      // Date/KM column
      const dateKmCell = XLSX.utils.encode_cell({ r: dataRow - 1, c: startColNum });
      let dateKmValue = '';
      let isOverdue = false;
      
      if (service.date) {
        const daysLeft = this.calculateDaysLeft(service.date);
        dateKmValue = `${this.formatDate(service.date)} (${daysLeft > 0 ? '+' : ''}${daysLeft} dní)`;
        isOverdue = daysLeft < 0;
      } else if (service.km) {
        const kmLeft = this.calculateKmLeft(service.km, service.vehicle);
        dateKmValue = `${service.km.toLocaleString()} km (${kmLeft > 0 ? '+' : ''}${kmLeft} km)`;
        isOverdue = kmLeft < 0;
      } else if (service.dateKm) {
        const kmLeft = this.calculateKmLeft(parseInt(service.dateKm, 10), service.vehicle);
        dateKmValue = `${service.dateKm} (${kmLeft > 0 ? '+' : ''}${kmLeft} km)`;
        isOverdue = kmLeft < 0;
      }
      
      ws[dateKmCell] = { v: dateKmValue };
      ws[dateKmCell].s = {
        font: { color: { rgb: isOverdue ? "DC2626" : "059669" } },
        border: { style: "thin", color: { rgb: "E5E7EB" } },
        alignment: { vertical: "center" }
      };
      
      // Description column (for 3-column tables)
      if (isThreeColumn) {
        const descCell = XLSX.utils.encode_cell({ r: dataRow - 1, c: startColNum + 1 });
        ws[descCell] = { v: service.description || '' };
        ws[descCell].s = {
          border: { style: "thin", color: { rgb: "E5E7EB" } },
          alignment: { vertical: "center", wrapText: true }
        };
      }
      
      // Note column
      const noteCol = isThreeColumn ? startColNum + 2 : startColNum + 1;
      const noteCell = XLSX.utils.encode_cell({ r: dataRow - 1, c: noteCol });
      ws[noteCell] = { v: service.note || '' };
      ws[noteCell].s = {
        border: { style: "thin", color: { rgb: "E5E7EB" } },
        alignment: { vertical: "center", wrapText: true }
      };
      
      dataRow++;
    });
    
         // Add table formatting - simplified for better compatibility
     // Note: Excel table styles are applied through cell styling instead
     // of the !tables property for better compatibility
    
    return dataRow + 2; // Return next starting row
  }

  // Get header color based on section name
  getHeaderColor(sectionName) {
    const colors = {
      'stk_ek': 'EF4444',        // Red
      'tachograph': '3B82F6',    // Blue
      'dpf': '8B5CF6',          // Purple
      'ciachovanie': '06B6D4',   // Teal
      'geometria': '14B8A6',     // Teal-green
      'l_certifikat': '10B981',  // Green
      'motor_olej': '3B82F6',    // Blue
      'difer_olej': '6366F1',    // Indigo
      'prevodovka_olej': '06B6D4', // Teal
      'rocna_tahac': '10B981',   // Green
      'rocna_naves': '059669',   // Dark Green
      'kontrola_brzd': '3B82F6', // Blue
      'ostatne': 'F59E0B',       // Orange
      'osobne': '8B6CF6'         // Purple
    };
    return colors[sectionName] || '6B7280';
  }
  updateHeaderCounts() {
    // Show counts in headers, e.g., "Ostatné (5)"
    const categories = Object.keys(this.services);
    categories.forEach(category => {
      const table = document.querySelector(`.maintenance-table[data-category="${category}"]`);
      if (!table) return;
      const header = table.querySelector('.table-header h3');
      if (!header) return;
      const baseName = this.getCategoryDisplayName(category);
      const count = (this.services[category] || []).length;
      header.textContent = count > 0 ? `${baseName} (${count})` : baseName;
    });
  }
 
  mapServiceToCategory(name) {
    const n = String(name || '').toLowerCase();
    
    // STK and EK
    if (n.includes('stk') || n.includes('technická kontrola')) return 'stk';
    if (n.includes('ek') || n.includes('emisná kontrola')) return 'stk';
    
    // Tachograph
    if (n.includes('tach')) return 'tachograph';
    
    // Calibration
    if (n.includes('ciach')) return 'calibration';
    
    // Geometry
    if (n.includes('geometri') || n.includes('nastavenie geometrie')) return 'geometry';
    
    // L-Certificate
    if (n.includes('l-cert')) return 'l-certificate';
    
    // DPF - check before other oil services
    if (n.includes('dpf') || n.includes('výmena dpf') || n.includes('čistenie dpf')) return 'dpf';
    
    // Engine oil
    if (n.includes('motor') && n.includes('olej')) return 'engine-oil';
    
    // Differential oil
    if (n.includes('difer') && n.includes('olej')) return 'differential-oil';
    
    // Transmission oil
    if (n.includes('prevod') && n.includes('olej')) return 'transmission-oil';
    
    // Annual tractor
    if (n.includes('roč') && (n.includes('taha') || n.includes('ťaha'))) return 'annual-tractor';
    
    // Annual trailer
    if (n.includes('roč') && (n.includes('náv') || n.includes('naves'))) return 'annual-trailer';
    
    // Brake check - check for various brake-related terms
    // Handle "Kontrola brźd" - check for "kontrola" + "br" pattern (any character after br)
    // This catches: "kontrola brzd", "kontrola brźd", "kontrola bŕzd", etc.
    if (n.includes('kontrola') && n.includes('br')) {
      // Make sure it's actually about brakes (has br followed by z, ź, ŕ, or d)
      if (n.match(/br[źzdŕ]/) || n.includes('brzd')) return 'brake-check';
    }
    // Also check standalone brake terms anywhere in the string
    if (n.includes('brzd') || n.includes('brźd') || n.includes('bŕzd')) return 'brake-check';
    
    return 'other';
  }

  // Combine STK and EK services for the same vehicle, using the earlier date
  combineSTKAndEK(buckets) {
    const stkServices = buckets.stk || [];
    
    // Group services by vehicle, identifying STK vs EK by original service name
    const vehicleMap = new Map();
    
    stkServices.forEach(service => {
      const vehicle = service.vehicle;
      const serviceName = (service.originalName || '').toLowerCase();
      
      // Identify if this is STK or EK
      const isSTK = serviceName.includes('stk') || serviceName.includes('technická');
      const isEK = serviceName.includes('ek') || serviceName.includes('emisná');
      
      if (!vehicleMap.has(vehicle)) {
        vehicleMap.set(vehicle, { stk: null, ek: null, other: [] });
      }
      
      const entry = vehicleMap.get(vehicle);
      if (isSTK && !entry.stk) {
        entry.stk = service;
      } else if (isEK && !entry.ek) {
        entry.ek = service;
      } else {
        // Not clearly STK or EK, or already have both - keep as other
        entry.other.push(service);
      }
    });
    
    // Now combine STK and EK for vehicles that have both
    const combined = [];
    vehicleMap.forEach((entry, vehicle) => {
      if (entry.stk && entry.ek) {
        // Both STK and EK exist - combine them using the earlier date
        const stkDate = entry.stk.date ? new Date(entry.stk.date) : null;
        const ekDate = entry.ek.date ? new Date(entry.ek.date) : null;
        
        let combinedDate;
        let combinedPriority = entry.stk.priority || 'medium';
        
        if (stkDate && ekDate) {
          // Use the earlier date (closer to being past)
          combinedDate = stkDate < ekDate ? stkDate : ekDate;
          // Use higher priority (more urgent)
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          const stkPriority = priorityOrder[entry.stk.priority || 'medium'] || 2;
          const ekPriority = priorityOrder[entry.ek.priority || 'medium'] || 2;
          combinedPriority = stkPriority > ekPriority ? entry.stk.priority : entry.ek.priority;
        } else if (stkDate) {
          combinedDate = stkDate;
        } else if (ekDate) {
          combinedDate = ekDate;
        } else {
          // No dates, keep both separate
          combined.push(entry.stk);
          combined.push(entry.ek);
          combined.push(...entry.other);
          return;
        }
        
        // Create combined entry
        const combinedEntry = {
          id: `${vehicle}_STK_EK`,
          vehicle: vehicle,
          date: combinedDate.toISOString().split('T')[0],
          priority: combinedPriority,
          note: 'STK + EK'
        };
        
        combined.push(combinedEntry);
        combined.push(...entry.other);
      } else if (entry.stk) {
        // Only STK
        combined.push(entry.stk);
        combined.push(...entry.other);
      } else if (entry.ek) {
        // Only EK
        combined.push(entry.ek);
        combined.push(...entry.other);
      } else {
        // Neither STK nor EK
        combined.push(...entry.other);
      }
    });
    
    // Update the stk bucket
    buckets.stk = combined;
  }
 
}

// Initialize the service manager when DOM is loaded
let serviceManager;
document.addEventListener('DOMContentLoaded', function() {
  serviceManager = new ServiceManager();
});
