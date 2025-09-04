// Service Management JavaScript
class ServiceManager {
  constructor() {
    this.services = {};
    this.vehicles = [];
    this.init();
  }

  async init() {
    await this.loadVehicles();
    await this.loadServices();
    this.setupEventListeners();
    this.renderAllTables();
  }

  async loadVehicles() {
    try {
      // Load vehicles from your existing database
      if (window.DatabaseService) {
        const trucks = await window.DatabaseService.getTrucks();
        const trailers = await window.DatabaseService.getTrailers();
        
        this.vehicles = [
          ...trucks.map(truck => ({ id: truck.id, name: truck.licensePlate || truck.id, type: 'truck' })),
          ...trailers.map(trailer => ({ id: trailer.id, name: trailer.licensePlate || trailer.id, type: 'trailer' }))
        ];
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

  async loadServices() {
    try {
      if (window.DatabaseService && window.db) {
        // Load services from Firebase
        const snapshot = await window.db.collection('maintenance_services').get();
        const services = {};
        
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const category = data.category;
          
          if (!services[category]) {
            services[category] = [];
          }
          
          services[category].push({
            id: doc.id,
            ...data
          });
        });
        
        this.services = services;
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
          const kmLeft = this.calculateKmLeft(service.km);
          const indicator = this.getKmIndicator(kmLeft);
          kmDateCell = `<td class="km-cell">${service.km.toLocaleString()} km ${indicator}</td>`;
        } else if (service.dateKm) {
          // For Ostatné table, calculate km left and add indicator
          const kmLeft = this.calculateKmLeft(service.dateKm);
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
          const kmLeft = this.calculateKmLeft(service.km);
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
  calculateKmLeft(serviceKm) {
    // This would need to be connected to actual vehicle current km
    // For now, using a placeholder calculation
    const currentKm = 400000; // Placeholder - should get from vehicle data
    const diffKm = serviceKm - currentKm;
    return diffKm;
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
      
      // Create L-Certifikát section
      currentRow = this.createExcelSection(ws, 'B', 'D', currentRow,
        ['L-Certifikát', 'Datum', 'Poznamka'],
        this.services.lCert || [], 'l_certifikat', 'TableStyleMedium11');
      
      // Reset to column F for second column
      currentRow = 2;
      
      // Create Motor. olej section
      currentRow = this.createExcelSection(ws, 'F', 'H', currentRow,
        ['Motor. olej', 'Kilometrov', 'Poznamka'],
        this.services.engineOil || [], 'motor_olej', 'TableStyleMedium9');
      
      // Create Diferenciálny olej section
      currentRow = this.createExcelSection(ws, 'F', 'H', currentRow,
        ['Difer. olej', 'Kilometrov', 'Poznamka'],
        this.services.diffOil || [], 'difer_olej', 'TableStyleMedium9');
      
      // Create Prevodovka olej section
      currentRow = this.createExcelSection(ws, 'F', 'H', currentRow,
        ['Prevodovka olej', 'Kilometrov', 'Poznamka'],
        this.services.transmissionOil || [], 'prevodovka_olej', 'TableStyleMedium9');
      
      // Create Ročná tahač section
      currentRow = this.createExcelSection(ws, 'F', 'H', currentRow,
        ['Ročná tahač', 'Datum', 'Poznamka'],
        this.services.annualTractor || [], 'rocna_tahac', 'TableStyleMedium11');
      
      // Create Ročná náves section
      currentRow = this.createExcelSection(ws, 'F', 'H', currentRow,
        ['Ročná náves', 'Datum', 'Poznamka'],
        this.services.annualTrailer || [], 'rocna_naves', 'TableStyleMedium11');
      
      // Create Kontrola bŕzd section
      currentRow = this.createExcelSection(ws, 'F', 'H', currentRow,
        ['Kontrola Bŕzd', 'Datum', 'Poznamka'],
        this.services.brakeCheck || [], 'kontrola_brzd', 'TableStyleMedium9');
      
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
        const kmLeft = this.calculateKmLeft(service.km);
        dateKmValue = `${service.km.toLocaleString()} km (${kmLeft > 0 ? '+' : ''}${kmLeft} km)`;
        isOverdue = kmLeft < 0;
      } else if (service.dateKm) {
        const kmLeft = this.calculateKmLeft(service.dateKm);
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
}

// Initialize the service manager when DOM is loaded
let serviceManager;
document.addEventListener('DOMContentLoaded', function() {
  serviceManager = new ServiceManager();
});
