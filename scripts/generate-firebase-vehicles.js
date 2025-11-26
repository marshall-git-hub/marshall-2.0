const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Helper function to normalize license plate
function normalizeLicensePlate(plate) {
  if (!plate) return null;
  return plate.toString().trim().toUpperCase().replace(/\s+/g, '');
}

// Helper function to normalize vehicle type
function normalizeVehicleType(type) {
  if (!type) return null;
  
  const normalized = type.toString().trim();
  const lower = normalized.toLowerCase();
  
  // Map to standard types
  if (lower.includes('osobné') || lower.includes('osobne') || lower.includes('osovné') || lower.includes('osovne')) {
    return 'Osobné Auto';
  }
  if (lower.includes('dodávka') || lower.includes('dodavka')) {
    return 'Dodávka';
  }
  if (lower.includes('náves mega') || lower.includes('naves mega') || lower.includes('návesmega')) {
    return 'Nakladný náves MEGA';
  }
  if (lower.includes('náves') || lower.includes('naves') || lower.includes('príves') || lower.includes('prives')) {
    if (!lower.includes('mega')) {
      return 'Nakladný náves';
    }
  }
  if (lower.includes('nakladné') || lower.includes('nakladne') || lower.includes('nákladné') || lower.includes('nakladne')) {
    if (!lower.includes('náves') && !lower.includes('naves') && !lower.includes('príves') && !lower.includes('prives')) {
      return 'Nakladné Auto';
    }
  }
  if (lower.includes('obyt') || lower.includes('obytné') || lower.includes('obytne')) {
    return 'specialne obytné vozidlo';
  }
  
  return 'Ostatne';
}

// Helper function to normalize model
function normalizeModel(model) {
  if (!model) return null;
  return model.toString().trim();
}

// Helper function to normalize year
function normalizeYear(year) {
  if (!year) return null;
  if (typeof year === 'number') {
    return Math.floor(year);
  }
  if (typeof year === 'string') {
    const num = parseFloat(year);
    if (!isNaN(num)) {
      return Math.floor(num);
    }
  }
  return year;
}

// Helper function to convert Excel date to ISO format
function formatExcelDate(excelDate) {
  if (!excelDate || excelDate === 0) return null;
  
  if (typeof excelDate === 'number') {
    try {
      const date = XLSX.SSF.parse_date_code(excelDate);
      if (date) {
        const year = date.y;
        const month = String(date.m).padStart(2, '0');
        const day = String(date.d).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      // Fallback method
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + excelDate * 86400000);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }
  }
  
  if (typeof excelDate === 'string') {
    // Try to parse date strings like "5/12/25" or "04.05.2026"
    const trimmed = excelDate.trim();
    
    // Check if it's already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    
    // Try to parse various date formats
    // Format: MM/DD/YY or M/D/YY
    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slashMatch) {
      let month = parseInt(slashMatch[1]);
      let day = parseInt(slashMatch[2]);
      let year = parseInt(slashMatch[3]);
      
      if (year < 100) {
        year += 2000; // Assume 20xx
      }
      
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    
    // Format: DD.MM.YYYY
    const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dotMatch) {
      const day = parseInt(dotMatch[1]);
      const month = parseInt(dotMatch[2]);
      const year = parseInt(dotMatch[3]);
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    
    // Return as-is if can't parse
    return trimmed;
  }
  
  return null;
}

// Helper function to determine vehicle category for collection
function getVehicleCollection(vehicleType) {
  const normalized = normalizeVehicleType(vehicleType);
  
  if (normalized === 'Osobné Auto') {
    return 'cars';
  } else if (normalized === 'Nakladné Auto') {
    return 'trucks';
  } else if (normalized === 'Nakladný náves' || normalized === 'Nakladný náves MEGA') {
    return 'trailers';
  } else {
    return 'other';
  }
}

// Map unit codes from Jednotka column to unit types
function mapUnitCode(unitCode) {
  if (!unitCode) return 'km'; // default
  
  const code = unitCode.toString().trim().toUpperCase();
  
  if (code === 'P') return 'km';
  if (code === 'K') return 'specificDate';
  if (code === 'R') return 'year';
  if (code === 'D') return 'day';
  if (code === 'M') return 'month';
  
  return 'km'; // default
}

// Normalize service name to match predefined services
function normalizeServiceName(name) {
  if (!name) return null;
  
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  
  // Direct mappings
  const mappings = {
    'kontrola technická  stk': 'Technická kontrola (STK)',
    'kontrola technicka stk': 'Technická kontrola (STK)',
    'technická kontrola  a emisná': 'Technická kontrola (STK)',
    'kontrola emisná': 'Emisná kontrola (EK)',
    'karta visa': 'Karta VISA',
    'karta as24': 'Karta AS24',
    'karta benzina': 'Karta Benzina',
    'karta eurowag': 'Karta Eurowag',
    'dokument  koncesná listina': 'Koncesná listina',
    'dokument eurolicenia - modrá listina': 'Eurolicencia (modrá karta)',
    'dokument l- certifikát  lärmarmes kraft.': 'L - Certifikát',
    'poistenie výmena zelenej karty': 'Poistenie - zelená karta',
    'havarijné poistenie _platba': 'Poistenie - zelená karta',
    'kontrola stiahnutie tachografu': 'Stiahnutie tachografu',
    'kontrola pneumatik ciachovanie tachogr.': 'Ciachovanie tachografu',
    'výmena motorového oleje': 'Výmena oleja v motorove',
    'výměna motorového oleja,filtrov': 'Výmena oleja v motorove',
    'výmena motorového oleja filtrov': 'Výmena oleja v motorove',
    'výmena prevodového oleja': 'Výmena oleja v prevodovke',
    'výměna prevodového oleja': 'Výmena oleja v prevodovke',
    'výmena oleja diferenciálu': 'Výmena oleja v diferenciáli',
    'výmena oleja v retarder': 'Výmena oleja v diferenciáli',
    'výmena oleja v retardery': 'Výmena oleja v diferenciáli',
    'výmena dpf filtra': 'Výmena DPF filtra',
    'vymena dpf': 'Výmena DPF filtra',
    'výmena chladiacej zmesi': 'Výmena chladiacej zmesi',
    'výmena chladiacej zmesi s retardérom': 'Výmena chladiacej zmesi',
    'servis kontrola chlad.zmesi': 'Kontrola chladiacej zmesi',
    'servis kontrola chlad.zmesi (retardér)': 'Kontrola chladiacej zmesi',
    'výmena spojky': 'Výmena spojky',
    'výmena trisiek': 'Výmena trisiek',
    'servis kontrola komplet  bŕzd': 'Kontrola brźd',
    'servis kontrola hasiaci prístroj': 'Kontrola hasiacich prístrojov',
    'servis kontrola nastavenie geometrie': 'Nastavenie geometrie',
    'servis kontrola nastavenie ventilov': 'Kontrola/Nastavenie ventilov',
    'servis ročná prehliadka náves': 'Ročná kontrola náves',
    'servis ročná prehliadka ťahač': 'Ročná kontrola tahač',
  };
  
  if (mappings[lower]) {
    return mappings[lower];
  }
  
  return trimmed;
}

// Parse service file
function parseServiceFile(servicePath) {
  try {
    const workbook = XLSX.readFile(servicePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
    
    if (rawData.length < 2) return [];
    
    const headers = rawData[0];
    
    const headerMap = {
      'Název': 'name',
      'Jednotka': 'unit',
      'Norma': 'norm',
      'Signalizovat': 'signal',
      'Dat. Posl.': 'lastDate'
    };
    
    const services = [];
    
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0 || !row[1]) continue; // Skip if no name
      
      const service = {};
      
      headers.forEach((header, index) => {
        const fieldName = headerMap[header];
        if (!fieldName) return;
        
        let value = row[index];
        
        if (fieldName === 'name') {
          value = normalizeServiceName(value);
        } else if (fieldName === 'unit') {
          // Map unit code to unit type
          value = mapUnitCode(value);
        } else if (fieldName === 'norm') {
          // Norm can be a date or number
          if (value && typeof value === 'number') {
            const date = formatExcelDate(value);
            if (date) {
              value = date;
            } else {
              value = value.toString();
            }
          } else if (value) {
            value = value.toString().trim();
          }
        } else if (fieldName === 'lastDate') {
          if (value && typeof value === 'number') {
            value = formatExcelDate(value);
          } else if (value) {
            value = value.toString().trim();
          }
        } else if (fieldName === 'signal') {
          if (value && typeof value === 'number') {
            value = Math.floor(value);
          }
        }
        
        if (value !== null && value !== undefined && value !== '') {
          service[fieldName] = value;
        }
      });
      
      // Add lastKm (initially 0, can be updated later)
      if (service.name) {
        service.lastKm = 0; // Will need to be set based on vehicle km when service was performed
        services.push(service);
      }
    }
    
    return services;
  } catch (error) {
    console.error(`Error parsing service file ${servicePath}:`, error.message);
    return [];
  }
}

// Read vozidla.xls
const vozidlaPath = path.join(__dirname, '..', 'add to firebase', 'vozidla.xls');
console.log('Reading vozidla.xls...');
const workbook = XLSX.readFile(vozidlaPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const rawData = XLSX.utils.sheet_to_json(worksheet, { 
  header: 1, 
  defval: null,
  raw: false 
});

const headers = rawData[0];

const headerMap = {
  'Kmenové č.': 'id',
  'SPZ': 'licensePlate',
  'Druh vozidla': 'vehicleType',
  'Typová značka': 'model',
  'VIN': 'vin',
  'Statistický druh': 'statisticalType',
  'V provozu od': 'inServiceFrom',
  'V provozu do': 'inServiceTo',
  'Č. tech. průkazu': 'technicalCertificateNumber',
  'Rok výroby': 'yearOfManufacture',
  'Užit. hmotnost': 'usefulWeight',
  'Hmotnost/objem': 'weightVolume',
  'Poznámka': 'note',
  'Středisko': 'center',
  'Os.č.řidiče': 'driverNumber',
  'SPZ návěsu': 'trailerLicensePlate',
  'Akt. stav tachografu': 'tachographStatus',
  'km od zařaz.': 'kmSinceInclusion',
  'Typ motoru': 'engineType',
  'Stav': 'status',
  'Koeficient nákladů': 'costCoefficient',
  'Palety': 'pallets',
  'Jméno řidiče': 'driverName',
  'Druh karoserie': 'bodyType',
  'Kód druhu vozidla (od 2022)': 'vehicleCode2022',
  'Kód druhu vozidla (od 2022)-popis': 'vehicleCode2022Description'
};

const vehicles = [];

for (let i = 1; i < rawData.length; i++) {
  const row = rawData[i];
  if (!row || row.length === 0 || !row[0]) continue;
  
  const vehicle = {};
  
  headers.forEach((header, index) => {
    const fieldName = headerMap[header];
    if (!fieldName) return;
    
    let value = row[index];
    
    if (fieldName === 'licensePlate') {
      value = normalizeLicensePlate(value);
    } else if (fieldName === 'vehicleType') {
      value = normalizeVehicleType(value);
    } else if (fieldName === 'model') {
      value = normalizeModel(value);
    } else if (fieldName === 'yearOfManufacture') {
      value = normalizeYear(value);
    } else if (fieldName === 'inServiceFrom' || fieldName === 'inServiceTo') {
      value = formatExcelDate(value);
    }
    
    if (value !== null && value !== undefined && value !== '') {
      vehicle[fieldName] = value;
    }
  });
  
  if (vehicle.licensePlate && vehicle.vehicleType && vehicle.model) {
    // Initialize services array
    vehicle.services = [];
    vehicles.push(vehicle);
  }
}

console.log(`\nProcessed ${vehicles.length} vehicles`);

// Parse service files
const servicesPath = path.join(__dirname, '..', 'add to firebase', 'services');
const serviceFiles = fs.readdirSync(servicesPath).filter(f => f.endsWith('.xls'));

console.log(`\nProcessing ${serviceFiles.length} service files...`);

for (const vehicle of vehicles) {
  const plate = vehicle.licensePlate;
  const normalizedPlate = plate.replace(/\s+/g, '').toUpperCase();
  
  // Try to find matching service file
  let serviceFile = serviceFiles.find(f => {
    const filePlate = f.replace(/\.xls$/i, '').replace(/\s+/g, '').toUpperCase();
    return filePlate === normalizedPlate;
  });
  
  if (!serviceFile) {
    serviceFile = serviceFiles.find(f => {
      const filePlate = f.replace(/\.xls$/i, '').replace(/\s+/g, '').toUpperCase();
      return normalizedPlate.includes(filePlate) || filePlate.includes(normalizedPlate);
    });
  }
  
  if (serviceFile) {
    const servicePath = path.join(servicesPath, serviceFile);
    const services = parseServiceFile(servicePath);
    if (services.length > 0) {
      vehicle.services = services;
      console.log(`  ✓ ${plate}: ${services.length} services`);
    }
  }
}

// Organize vehicles by collection
const vehiclesByCollection = {
  cars: {},
  trucks: {},
  trailers: {},
  other: {}
};

vehicles.forEach(vehicle => {
  const collection = getVehicleCollection(vehicle.vehicleType);
  const normalizedPlate = normalizeLicensePlate(vehicle.licensePlate);
  vehiclesByCollection[collection][normalizedPlate] = vehicle;
});

// Save JSON files
const outputPath = path.join(__dirname, '..', 'add to firebase', 'FLOTILA');

// Create directory if it doesn't exist
if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath, { recursive: true });
}

Object.entries(vehiclesByCollection).forEach(([collection, vehiclesMap]) => {
  const filePath = path.join(outputPath, `vehicles_${collection}.json`);
  fs.writeFileSync(filePath, JSON.stringify(vehiclesMap, null, 2), 'utf8');
  console.log(`\n✅ Saved ${Object.keys(vehiclesMap).length} ${collection} to ${filePath}`);
});

// Also save combined file
const allVehicles = {};
vehicles.forEach(vehicle => {
  const normalizedPlate = normalizeLicensePlate(vehicle.licensePlate);
  allVehicles[normalizedPlate] = vehicle;
});

const allVehiclesPath = path.join(outputPath, 'vehicles_all.json');
fs.writeFileSync(allVehiclesPath, JSON.stringify(allVehicles, null, 2), 'utf8');
console.log(`✅ Saved ${Object.keys(allVehicles).length} total vehicles to ${allVehiclesPath}`);

console.log('\n✅ All JSON files generated successfully!');

