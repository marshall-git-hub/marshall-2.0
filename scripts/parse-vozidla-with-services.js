const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Normalization mappings
const vehicleTypeNormalizations = {
  'osobné auto': 'osobné auto',
  'osovne auto': 'osobné auto',
  'osovné auto': 'osobné auto',
  'osobne auto': 'osobné auto',
  'osobné vozidlo': 'osobné auto',
  'Osobné auto': 'osobné auto',
  'nakladné vozidlo': 'nakladné vozidlo',
  'nakladne vozidlo': 'nakladné vozidlo',
  'nákladné vozidlo': 'nakladné vozidlo',
  'nákladne vozidlo': 'nakladné vozidlo',
  'Nakladné vozidlo': 'nakladné vozidlo',
  'nákladný náves': 'nákladný náves',
  'nakladný náves': 'nákladný náves',
  'Nakladný náves': 'nákladný náves',
  'Nákladný náves': 'nákladný náves',
  'nákladný náves MEGA': 'nákladný náves MEGA',
  'Nakladný náves MEGA': 'nákladný náves MEGA',
  'nákladný náves mulda': 'nákladný náves mulda',
  'vysokozdvižný vozík': 'vysokozdvižný vozík',
  'vysokozdvižny vozík': 'vysokozdvižný vozík',
  'skrutkový kompresor': 'skrutkový kompresor',
  'skrutkovy kompresor': 'skrutkový kompresor',
  'príves nákladný': 'príves nákladný',
  'Nákladný príves': 'príves nákladný',
  'Dodávka': 'dodávka',
  'dodávka': 'dodávka',
  'Pracovný stroj': 'pracovný stroj',
  'pracovný stroj': 'pracovný stroj',
  'žeriav': 'žeriav',
  'specialne obyt. vozidlo': 'speciálne obytné vozidlo',
};

// Helper function to normalize vehicle type
function normalizeVehicleType(type) {
  if (!type) return null;
  
  const lower = type.toLowerCase().trim();
  
  // Check exact matches first
  if (vehicleTypeNormalizations[lower]) {
    return vehicleTypeNormalizations[lower];
  }
  
  // Check for partial matches
  for (const [key, value] of Object.entries(vehicleTypeNormalizations)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return value;
    }
  }
  
  // Default: return trimmed original
  return type.trim();
}

// Helper function to normalize manufacturer/model names
function normalizeModel(model) {
  if (!model) return null;
  
  let normalized = model.trim();
  
  // Common normalizations for manufacturer names
  normalized = normalized.replace(/\bMercedes\s+Benz\b/gi, 'Mercedes-Benz');
  normalized = normalized.replace(/\bMercedes\s*-\s*Benz\b/gi, 'Mercedes-Benz');
  normalized = normalized.replace(/\bBMW\b/gi, 'BMW');
  normalized = normalized.replace(/\bMAN\b/gi, 'MAN');
  normalized = normalized.replace(/\bVolvo\b/gi, 'Volvo');
  normalized = normalized.replace(/\bScania\b/gi, 'Scania');
  normalized = normalized.replace(/\bRenault\b/gi, 'Renault');
  normalized = normalized.replace(/\bIveco\b/gi, 'Iveco');
  normalized = normalized.replace(/\bLinde\b/gi, 'Linde');
  normalized = normalized.replace(/\bAtmos\b/gi, 'Atmos');
  normalized = normalized.replace(/\bKOGEL\b/gi, 'KOGEL');
  normalized = normalized.replace(/\bKÖGEL\b/gi, 'KOGEL');
  normalized = normalized.replace(/\bSchwarzmuller\b/gi, 'Schwarzmuller');
  normalized = normalized.replace(/\bSCHWARZMULLER\b/gi, 'Schwarzmuller');
  normalized = normalized.replace(/\bActros\b/gi, 'Actros');
  normalized = normalized.replace(/\bactros\b/g, 'Actros');
  
  // Normalize spaces (multiple spaces to single space)
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Remove trailing spaces
  normalized = normalized.trim();
  
  return normalized;
}

// Helper function to normalize year (remove decimals)
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

// Helper function to normalize license plate
function normalizeLicensePlate(spz) {
  if (!spz) return null;
  
  // Remove spaces and convert to uppercase
  let normalized = spz.toString().trim().toUpperCase().replace(/\s+/g, '');
  
  return normalized;
}

// Helper function to convert Excel date to ISO format
function formatExcelDate(excelDate) {
  if (!excelDate || excelDate === 0) return null;
  
  // Excel dates are stored as numbers (days since 1900-01-01)
  if (typeof excelDate === 'number') {
    const date = XLSX.SSF.parse_date_code(excelDate);
    if (!date) return null;
    
    const year = date.y;
    const month = String(date.m).padStart(2, '0');
    const day = String(date.d).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }
  
  // If it's already a string, try to parse it
  if (typeof excelDate === 'string') {
    return excelDate;
  }
  
  return null;
}

// Helper function to determine vehicle type for flotila (car, truck, trailer, other)
function determineVehicleCategory(vehicleType) {
  if (!vehicleType) return 'other';
  
  const lower = vehicleType.toLowerCase();
  
  // Cars (osobné)
  if (lower.includes('osobné') || lower.includes('osobne') || lower.includes('osovné') || lower.includes('osovne')) {
    return 'car';
  }
  
  // Trailers
  if (lower.includes('náves') || lower.includes('príves') || lower.includes('naves') || lower.includes('prives')) {
    return 'trailer';
  }
  
  // Trucks (nakladné vozidlo)
  if (lower.includes('nakladné') || lower.includes('nakladne') || lower.includes('nákladné') || lower.includes('nakladne')) {
    return 'truck';
  }
  
  // Other (vysokozdvižný vozík, kompresor, etc.)
  return 'other';
}

// Service name normalizations
const serviceNameNormalizations = {};

// Helper function to normalize service names
function normalizeServiceName(name) {
  if (!name) return null;
  
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  
  // Check if we have a normalization
  if (serviceNameNormalizations[lower]) {
    return serviceNameNormalizations[lower];
  }
  
  // Common normalizations
  let normalized = trimmed;
  
  // Normalize common service names
  if (lower.includes('stk') || lower.includes('technická')) {
    normalized = normalized.replace(/kontrola\s+technická\s+STK/gi, 'kontrola technická STK');
  }
  if (lower.includes('emisná') || lower.includes('emision')) {
    normalized = normalized.replace(/kontrola\s+emisná/gi, 'kontrola emisná');
  }
  
  // Normalize spaces
  normalized = normalized.replace(/\s+/g, ' ');
  
  return normalized;
}

// Parse service files
function parseServiceFile(servicePath, licensePlate) {
  try {
    const workbook = XLSX.readFile(servicePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
    
    if (rawData.length < 2) return [];
    
    const headers = rawData[0];
    
    // Map headers to exclude columns: F (Změnu provedl), I (Kód agr.), J (Popis agregátu), and A (Kód)
    const headerMap = {
      'Kód': null, // Exclude
      'Název': 'name',
      'Jednotka': 'unit',
      'Norma': 'norm',
      'Signalizovat': 'signal',
      'Změnu provedl': null, // Exclude (F column)
      'Datum změny': 'changeDate',
      'Dat. Posl.': 'lastDate',
      'Kód agr.': null, // Exclude (I column)
      'Popis agregátu': null // Exclude (J column)
    };
    
    const services = [];
    
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0 || !row[1]) continue; // Skip if no name
      
      const service = {};
      
      headers.forEach((header, index) => {
        const fieldName = headerMap[header];
        if (!fieldName) return; // Skip excluded columns
        
        let value = row[index];
        
        if (fieldName === 'name') {
          value = normalizeServiceName(value);
        } else if (fieldName === 'norm') {
          // Norm can be a date or number - try to parse as date first
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
        } else if (fieldName === 'changeDate' || fieldName === 'lastDate') {
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
      
      // Only add services with a name
      if (service.name) {
        services.push(service);
      }
    }
    
    return services;
  } catch (error) {
    console.error(`Error parsing service file ${servicePath}:`, error.message);
    return [];
  }
}

// Read the vozidla.xls file
const vozidlaPath = path.join(__dirname, '..', 'add to firebase', 'vozidla.xls');
console.log('Reading vozidla.xls...');
const workbook = XLSX.readFile(vozidlaPath);

// Get the first sheet
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convert to JSON with headers
const rawData = XLSX.utils.sheet_to_json(worksheet, { 
  header: 1, 
  defval: null,
  raw: false 
});

// Extract headers
const headers = rawData[0];

// Map header names to field names
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
  'Datum změny': 'changeDate',
  'Změnu provedl': 'changedBy',
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
  'Zobr. v dopravě': 'showInTransport',
  'Zobr. v knize jízd': 'showInLogbook',
  'Druh karoserie': 'bodyType',
  'Kód druhu vozidla (od 2022)': 'vehicleCode2022',
  'Kód druhu vozidla (od 2022)-popis': 'vehicleCode2022Description'
};

// Process data rows
const vehicles = [];
const vehicleTypeStats = {};
const modelStats = {};

for (let i = 1; i < rawData.length; i++) {
  const row = rawData[i];
  
  // Skip empty rows
  if (!row || row.length === 0 || !row[0]) continue;
  
  const vehicle = {};
  
  // Map each column
  headers.forEach((header, index) => {
    const fieldName = headerMap[header] || header;
    let value = row[index];
    
    // Special handling for specific fields
    if (fieldName === 'licensePlate') {
      value = normalizeLicensePlate(value);
    } else if (fieldName === 'vehicleType') {
      value = normalizeVehicleType(value);
      // Track statistics
      if (value) {
        vehicleTypeStats[value] = (vehicleTypeStats[value] || 0) + 1;
      }
    } else if (fieldName === 'model') {
      value = normalizeModel(value);
      // Track statistics
      if (value) {
        modelStats[value] = (modelStats[value] || 0) + 1;
      }
    } else if (fieldName === 'yearOfManufacture') {
      value = normalizeYear(value);
    } else if (fieldName === 'inServiceFrom' || fieldName === 'inServiceTo' || fieldName === 'changeDate') {
      // Convert Excel dates
      if (value && typeof value === 'number') {
        value = formatExcelDate(value);
      }
    }
    
    // Only include non-null values
    if (value !== null && value !== undefined && value !== '') {
      vehicle[fieldName] = value;
    }
  });
  
  // Only add vehicles with a license plate
  if (vehicle.licensePlate) {
    // Add category for separation (car, truck, trailer, other)
    vehicle.category = determineVehicleCategory(vehicle.vehicleType);
    
    // Add type for flotila module (truck vs trailer for database structure)
    // Cars and other vehicles also go to trucks collection, trailers go to trailers collection
    if (vehicle.category === 'trailer') {
      vehicle.type = 'trailer';
    } else {
      vehicle.type = 'truck'; // cars, trucks, and other all go to trucks collection
    }
    
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

let servicesAdded = 0;
const serviceNameStats = {};

for (const vehicle of vehicles) {
  const plate = vehicle.licensePlate;
  
  // Try to find matching service file
  // Remove spaces and convert to uppercase for matching
  const normalizedPlate = plate.replace(/\s+/g, '').toUpperCase();
  
  // Try exact match first
  let serviceFile = serviceFiles.find(f => {
    const filePlate = f.replace(/\.xls$/i, '').replace(/\s+/g, '').toUpperCase();
    return filePlate === normalizedPlate;
  });
  
  // If not found, try partial match (in case of extra characters in filename)
  if (!serviceFile) {
    serviceFile = serviceFiles.find(f => {
      const filePlate = f.replace(/\.xls$/i, '').replace(/\s+/g, '').toUpperCase();
      return normalizedPlate.includes(filePlate) || filePlate.includes(normalizedPlate);
    });
  }
  
  if (serviceFile) {
    const servicePath = path.join(servicesPath, serviceFile);
    const services = parseServiceFile(servicePath, plate);
    
    if (services.length > 0) {
      vehicle.services = services;
      servicesAdded += services.length;
      
      // Track service name statistics
      services.forEach(s => {
        if (s.name) {
          serviceNameStats[s.name] = (serviceNameStats[s.name] || 0) + 1;
        }
      });
      
      console.log(`  ✓ ${plate}: ${services.length} services`);
    }
  }
}

console.log(`\nAdded ${servicesAdded} services total`);

// Print statistics
console.log('\nVehicle Type Statistics:');
Object.entries(vehicleTypeStats)
  .sort((a, b) => b[1] - a[1])
  .forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

console.log('\nService Name Statistics (top 15):');
Object.entries(serviceNameStats)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([name, count]) => {
    console.log(`  ${name}: ${count}`);
  });

// Separate vehicles by category
const vehiclesByCategory = {
  cars: {},
  trucks: {},
  trailers: {},
  other: {}
};

const vehiclesByPlate = {};

vehicles.forEach(vehicle => {
  const plate = vehicle.licensePlate;
  if (plate) {
    vehiclesByPlate[plate] = vehicle;
    
    // Separate by category
    const category = vehicle.category || 'other';
    if (category === 'car') {
      vehiclesByCategory.cars[plate] = vehicle;
    } else if (category === 'truck') {
      vehiclesByCategory.trucks[plate] = vehicle;
    } else if (category === 'trailer') {
      vehiclesByCategory.trailers[plate] = vehicle;
    } else {
      vehiclesByCategory.other[plate] = vehicle;
    }
  }
});

// Save main file with all vehicles
const outputPath = path.join(__dirname, '..', 'add to firebase', 'vehicles.json');
fs.writeFileSync(outputPath, JSON.stringify(vehiclesByPlate, null, 2), 'utf8');
console.log(`\n✅ Saved ${Object.keys(vehiclesByPlate).length} vehicles to ${outputPath}`);

// Save separated files
const carsPath = path.join(__dirname, '..', 'add to firebase', 'vehicles_cars.json');
fs.writeFileSync(carsPath, JSON.stringify(vehiclesByCategory.cars, null, 2), 'utf8');
console.log(`✅ Saved ${Object.keys(vehiclesByCategory.cars).length} cars to ${carsPath}`);

const trucksPath = path.join(__dirname, '..', 'add to firebase', 'vehicles_trucks.json');
fs.writeFileSync(trucksPath, JSON.stringify(vehiclesByCategory.trucks, null, 2), 'utf8');
console.log(`✅ Saved ${Object.keys(vehiclesByCategory.trucks).length} trucks to ${trucksPath}`);

const trailersPath = path.join(__dirname, '..', 'add to firebase', 'vehicles_trailers.json');
fs.writeFileSync(trailersPath, JSON.stringify(vehiclesByCategory.trailers, null, 2), 'utf8');
console.log(`✅ Saved ${Object.keys(vehiclesByCategory.trailers).length} trailers to ${trailersPath}`);

const otherPath = path.join(__dirname, '..', 'add to firebase', 'vehicles_other.json');
fs.writeFileSync(otherPath, JSON.stringify(vehiclesByCategory.other, null, 2), 'utf8');
console.log(`✅ Saved ${Object.keys(vehiclesByCategory.other).length} other vehicles to ${otherPath}`);

// Also save as array for easier inspection
const outputArrayPath = path.join(__dirname, '..', 'add to firebase', 'vehicles_array.json');
fs.writeFileSync(outputArrayPath, JSON.stringify(vehicles, null, 2), 'utf8');
console.log(`✅ Also saved as array to ${outputArrayPath}`);

// Print category statistics
console.log('\nVehicle Category Statistics:');
console.log(`  Cars (osobné): ${Object.keys(vehiclesByCategory.cars).length}`);
console.log(`  Trucks (nakladné): ${Object.keys(vehiclesByCategory.trucks).length}`);
console.log(`  Trailers (náves/príves): ${Object.keys(vehiclesByCategory.trailers).length}`);
console.log(`  Other: ${Object.keys(vehiclesByCategory.other).length}`);

