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
    
    if (services.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="2" style="text-align: center; padding: 1rem; color: #6b7280;">
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
        dateCell = `<td class="km-cell">${service.dateKm}</td>`;
        kmCell = '<td>-</td>';
      } else {
        dateCell = '<td>-</td>';
        kmCell = '<td>-</td>';
      }

      let descriptionCell = '';
      if (service.description) {
        descriptionCell = `<td class="note-cell">${service.description}</td>`;
      }

      return `
        <tr>
          <td><span class="vehicle-plate">${vehicleName}</span></td>
          ${dateCell}
          ${descriptionCell}
        </tr>
      `;
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





  formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('sk-SK');
  }

  exportData() {
    try {
      // Create CSV content
      let csvContent = 'Vozidlo,Kategória,Dátum/Kilometre,Popis\n';
      
      Object.entries(this.services).forEach(([category, services]) => {
        services.forEach(service => {
          const vehicle = this.vehicles.find(v => v.id === service.vehicle);
          const vehicleName = vehicle ? vehicle.name : service.vehicle;
          const categoryName = this.getCategoryDisplayName(category);
          
          const row = [
            vehicleName,
            categoryName,
            service.date || service.km || service.dateKm || '',
            service.description || ''
          ].map(field => `"${field}"`).join(',');
          
          csvContent += row + '\n';
        });
      });
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `servis_udrzba_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('Data exported successfully');
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Chyba pri exporte dát');
    }
  }
}

// Initialize the service manager when DOM is loaded
let serviceManager;
document.addEventListener('DOMContentLoaded', function() {
  serviceManager = new ServiceManager();
});
