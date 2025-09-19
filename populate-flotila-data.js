// Script to populate Firebase with real flotila data from ccc.xls
// This script reads the CSV data and categorizes vehicles properly

const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

let fs = null;
let nodePath = null;
let csv = null;
let SheetJS = null;

if (!isBrowser) {
  try { fs = require('fs'); } catch {}
  try { nodePath = require('path'); } catch {}
  try { csv = require('csv-parser'); } catch {}
  try { SheetJS = require('xlsx'); } catch {}
} else {
  // In browser, expect XLSX to be available globally if included via script tag
  if (typeof window.XLSX !== 'undefined') {
    SheetJS = window.XLSX;
  }
}

// Function to determine vehicle type based on "druh vozidla"
function determineVehicleType(druhVozidla) {
  const type = druhVozidla.toLowerCase().trim();
  
  if (type.includes('nákladné vozidlo') || type.includes('nakladné vozidlo') || type.includes('nakladné vozidlo')) {
    return 'truck';
  } else if (type.includes('náves') || type.includes('náves') || type.includes('príves') || type.includes('prives')) {
    return 'trailer';
  } else if (type.includes('osobné auto') || type.includes('osobne auto')) {
    return 'personal';
  } else if (type.includes('dodávka') || type.includes('dodavka')) {
    return 'personal';
  } else if (type.includes('žeriav') || type.includes('vysokozdvižný') || type.includes('pracovný stroj') || type.includes('kompresor')) {
    return 'equipment';
  } else if (type.includes('specialne obyt')) {
    return 'personal';
  } else {
    return 'equipment';
  }
}

// Function to clean and format license plate
function cleanLicensePlate(spz) {
  return spz.trim().replace(/\s+/g, ' ').toUpperCase();
}

// Function to clean VIN
function cleanVIN(vin) {
  return vin ? vin.trim().toUpperCase() : null;
}

// Function to clean type/brand
function cleanType(typovaZnacka) {
  return typovaZnacka ? typovaZnacka.trim() : null;
}

// Build services from servis_data Excel files (B name, D norma, Signalizovať reminder, H/G last date)
function loadServisDataFromExcels(servisDir) {
  const plateToServices = {};

  // Only supported in Node environment with fs/path/xlsx available
  if (!SheetJS || !fs || !nodePath) {
    console.warn('XLSX library not available. Skipping servis_data import.');
    return plateToServices;
  }

  let files = [];
  try {
    files = fs.readdirSync(servisDir)
      .filter(f => f.toLowerCase().endsWith('.xls') || f.toLowerCase().endsWith('.xlsx'));
  } catch (e) {
    console.warn(`Could not read servis_data directory at ${servisDir}:`, e.message);
    return plateToServices;
  }

  const toCleanPlate = (filenamePlate) => cleanLicensePlate(filenamePlate);

  for (const file of files) {
    const fullPath = nodePath.join(servisDir, file);
    let workbook;
    try {
      workbook = SheetJS.readFile(fullPath, { cellDates: true, WTF: false });
    } catch (e) {
      console.warn(`Failed to read Excel file ${fullPath}: ${e.message}`);
      continue;
    }

    const firstSheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[firstSheetName];
    if (!ws) continue;

    const rows = SheetJS.utils.sheet_to_json(ws, { header: 1, raw: true });
    if (!rows || rows.length < 2) continue;

    // Header is first row
    const header = rows[0].map(h => (h || '').toString().trim());

    // Find column indices by letters/rules
    // B -> index 1, D -> index 3, G -> 6, H -> 7
    const COL_B = 1;
    const COL_D = 3;
    const COL_G = 6;
    const COL_H = 7;

    // Try to locate "Signalizovať" column in header, fallback to E (index 4)
    let signalIdx = header.findIndex(h => h.toLowerCase().includes('signal'));
    if (signalIdx === -1) signalIdx = 4; // column E

    const plate = toCleanPlate(nodePath.basename(file, nodePath.extname(file)));
    const services = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const name = (row[COL_B] || '').toString().trim();
      if (!name) continue;

      const normaRaw = row[COL_D];
      const signalRaw = signalIdx >= 0 ? row[signalIdx] : undefined;
      const lastH = row[COL_H];
      const lastG = row[COL_G];

      // Determine type and interval
      let type = 'km';
      let interval = null;

      const toNumber = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const num = Number(String(v).replace(/[^0-9.\-]/g, ''));
        return Number.isFinite(num) ? num : null;
      };

      const isDateObj = (v) => Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v);
      const parseDateLike = (v) => {
        if (isDateObj(v)) return v;
        if (typeof v === 'number') {
          // Excel date serial
          try { return SheetJS.SSF.parse_date_code(v) ? SheetJS.SSF.parse_date_code(v) : null; } catch { return null; }
        }
        if (typeof v === 'string') {
          const d = new Date(v);
          return isNaN(d) ? null : d;
        }
        return null;
      };

      let normaIsDate = false;
      let normaDate = null;

      if (isDateObj(normaRaw)) {
        normaIsDate = true;
        normaDate = normaRaw;
      } else {
        const maybeDate = parseDateLike(normaRaw);
        if (maybeDate) {
          normaIsDate = true;
          normaDate = maybeDate;
        }
      }

      if (normaIsDate) {
        type = 'date';
        // Derive an interval in days if possible using last done date; else default yearly
        let lastDateForInterval = null;
        const lastHDate = parseDateLike(lastH);
        const lastGDate = parseDateLike(lastG);
        if (lastHDate) lastDateForInterval = lastHDate;
        else if (lastGDate) lastDateForInterval = lastGDate;
        if (lastDateForInterval) {
          const ms = normaDate - lastDateForInterval;
          const days = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
          interval = days;
        } else {
          interval = 365; // sensible default
        }
      } else {
        const n = toNumber(normaRaw);
        if (n === null) continue; // skip if no norma
        if (n < 999) {
          type = 'date';
          interval = n; // days
        } else {
          type = 'km';
          interval = n; // km
        }
      }

      // Reminder from Signalizovať
      const reminderNum = toNumber(signalRaw);
      const serviceObj = {
        name,
        type,
        interval
      };
      if (type === 'date') {
        if (reminderNum !== null) serviceObj.reminderDays = reminderNum;
        // Last made date (only for day-based per requirement). Use H, else G
        const lastDate = parseDateLike(lastH) || parseDateLike(lastG);
        if (lastDate) {
          serviceObj.lastService = { date: lastDate };
        }
      } else if (type === 'km') {
        if (reminderNum !== null) serviceObj.reminderKm = reminderNum;
        // Optionally include lastService date if present (won't affect km calculation much)
        const lastDate = parseDateLike(lastH) || parseDateLike(lastG);
        if (lastDate) {
          serviceObj.lastService = { date: lastDate };
        }
      }

      services.push(serviceObj);
    }

    if (services.length) {
      plateToServices[plate] = services;
    }
  }

  return plateToServices;
}

// Main function to process CSV and populate database
async function populateRealFlotilaData() {
  try {
    console.log('Starting to process real flotila data...');
    
    const vehicles = [];
    const plateToServices = (!isBrowser && nodePath)
      ? loadServisDataFromExcels(nodePath.join(__dirname, 'servis_data'))
      : {};
    const vehicleStats = {
      trucks: 0,
      trailers: 0,
      personal: 0,
      vans: 0,
      equipment: 0,
      special: 0,
      other: 0,
      total: 0
    };

    // Read and parse CSV/XLS in Node vs Browser
    if (!isBrowser && fs && csv) {
      await new Promise((resolve, reject) => {
        fs.createReadStream('ccc.csv')
          .pipe(csv())
          .on('data', (row) => {
            const spz = cleanLicensePlate(row.SPZ);
            const druhVozidla = row['Druh vozidla'];
            const typovaZnacka = cleanType(row['Typová značka']);
            const vin = cleanVIN(row.VIN);

            if (!spz || spz === 'SPZ' || !druhVozidla) return;

            const vehicleType = determineVehicleType(druhVozidla);
            const vehicleData = {
              licensePlate: spz,
              vin: vin,
              type: typovaZnacka,
              vehicleType: vehicleType,
              druhVozidla: druhVozidla,
              kilometers: 0,
              services: plateToServices[spz] || [],
              createdAt: new Date(),
              updatedAt: new Date()
            };

            vehicles.push(vehicleData);
            vehicleStats[vehicleType]++;
            vehicleStats.total++;
          })
          .on('end', resolve)
          .on('error', reject);
      });
    } else {
      // Browser: try to fetch ccc.xls first (preferred), then ccc.csv
      let parsedRows = [];
      try {
        if (SheetJS) {
          const fileUrl = window.location.pathname.includes('/flotila/') ? '../ccc.xls' : 'ccc.xls';
          const resp = await fetch(fileUrl);
          if (!resp.ok) throw new Error('Failed to fetch ccc.xls');
          const arrayBuf = await resp.arrayBuffer();
          const wb = SheetJS.read(arrayBuf, { type: 'array' });
          const firstSheetName = wb.SheetNames[0];
          const ws = wb.Sheets[firstSheetName];
          parsedRows = SheetJS.utils.sheet_to_json(ws);
        }
      } catch (_) {
        // Fallback to CSV fetch
        const fileUrlCsv = window.location.pathname.includes('/flotila/') ? '../ccc.csv' : 'ccc.csv';
        const resp = await fetch(fileUrlCsv);
        if (!resp.ok) throw new Error('Failed to fetch ccc.csv');
        const text = await resp.text();
        const lines = text.split(/\r?\n/).filter(Boolean);
        const headers = lines.shift().split(',').map(h => h.trim());
        parsedRows = lines.map(line => {
          const cols = line.split(',');
          const row = {};
          headers.forEach((h, i) => row[h] = cols[i]);
          return row;
        });
      }

      for (const row of parsedRows) {
        const spz = cleanLicensePlate(row.SPZ || row['SPZ ']);
        const druhVozidla = row['Druh vozidla'] || row['Druh vozidla '];
        const typovaZnacka = cleanType(row['Typová značka'] || row['Typová značka ']);
        const vin = cleanVIN(row.VIN);
        if (!spz || spz === 'SPZ' || !druhVozidla) continue;
        const vehicleType = determineVehicleType(druhVozidla);
        vehicles.push({
          licensePlate: spz,
          vin: vin,
          type: typovaZnacka,
          vehicleType: vehicleType,
          druhVozidla: druhVozidla,
          kilometers: 0,
          services: [],
          createdAt: new Date(),
          updatedAt: new Date()
        });
        vehicleStats[vehicleType]++;
        vehicleStats.total++;
      }
    }

    console.log('Vehicle statistics:', vehicleStats);
    console.log(`Total vehicles to process: ${vehicles.length}`);

    // Process vehicles in batches
    let processedCount = 0;
    let errorCount = 0;
    const batchSize = 10;

    for (let i = 0; i < vehicles.length; i += batchSize) {
      const batch = vehicles.slice(i, i + batchSize);
      
      for (const vehicle of batch) {
        try {
          // First, create the main vehicle document
          await window.db.collection('vehicles').doc(vehicle.licensePlate).set({
            licensePlate: vehicle.licensePlate,
            createdAt: vehicle.createdAt
          });
          
          // Then save vehicle info in the info subcollection
          await window.db.collection('vehicles')
            .doc(vehicle.licensePlate)
            .collection('info')
            .doc('basic')
            .set(vehicle);
          
          processedCount++;
          console.log(`Processed: ${vehicle.licensePlate} (${vehicle.vehicleType})`);
          
        } catch (vehicleError) {
          errorCount++;
          console.error(`Error processing vehicle ${vehicle.licensePlate}:`, vehicleError);
        }
      }
      
      // Small delay between batches to avoid overwhelming Firebase
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\nProcessing completed!`);
    console.log(`Successfully processed: ${processedCount} vehicles`);
    console.log(`Errors: ${errorCount} vehicles`);
    console.log('\nVehicle type breakdown:');
    Object.entries(vehicleStats).forEach(([type, count]) => {
      if (type !== 'total') {
        console.log(`  ${type}: ${count}`);
      }
    });
    
    if (errorCount === 0) {
      alert(`Real flotila data has been populated successfully! Processed ${processedCount} vehicles.`);
    } else {
      alert(`Real flotila data populated with errors! Processed: ${processedCount}, Errors: ${errorCount}. Check console for details.`);
    }
    
  } catch (error) {
    console.error('Error populating real flotila data:', error);
    alert('Error populating real flotila data: ' + error.message);
  }
}

// Function to preview the data before populating
async function previewRealFlotilaData() {
  try {
    console.log('Previewing real flotila data...');
    
    const vehicles = [];
    const vehicleStats = {
      trucks: 0,
      trailers: 0,
      personal: 0,
      vans: 0,
      equipment: 0,
      special: 0,
      other: 0,
      total: 0
    };

    if (!isBrowser && fs && csv) {
      await new Promise((resolve, reject) => {
        fs.createReadStream('ccc.csv')
          .pipe(csv())
          .on('data', (row) => {
            const spz = cleanLicensePlate(row.SPZ);
            const druhVozidla = row['Druh vozidla'];
            const typovaZnacka = cleanType(row['Typová značka']);
            const vin = cleanVIN(row.VIN);
            if (!spz || spz === 'SPZ' || !druhVozidla) return;
            const vehicleType = determineVehicleType(druhVozidla);
            vehicles.push({
              licensePlate: spz,
              vin: vin,
              type: typovaZnacka,
              vehicleType: vehicleType,
              druhVozidla: druhVozidla
            });
            vehicleStats[vehicleType]++;
            vehicleStats.total++;
          })
          .on('end', resolve)
          .on('error', reject);
      });
    } else {
      let parsedRows = [];
      try {
        if (SheetJS) {
          const fileUrl = window.location.pathname.includes('/flotila/') ? '../ccc.xls' : 'ccc.xls';
          const resp = await fetch(fileUrl);
          if (!resp.ok) throw new Error('Failed to fetch ccc.xls');
          const arrayBuf = await resp.arrayBuffer();
          const wb = SheetJS.read(arrayBuf, { type: 'array' });
          const firstSheetName = wb.SheetNames[0];
          const ws = wb.Sheets[firstSheetName];
          parsedRows = SheetJS.utils.sheet_to_json(ws);
        }
      } catch (_) {
        const fileUrlCsv = window.location.pathname.includes('/flotila/') ? '../ccc.csv' : 'ccc.csv';
        const resp = await fetch(fileUrlCsv);
        if (!resp.ok) throw new Error('Failed to fetch ccc.csv');
        const text = await resp.text();
        const lines = text.split(/\r?\n/).filter(Boolean);
        const headers = lines.shift().split(',').map(h => h.trim());
        parsedRows = lines.map(line => {
          const cols = line.split(',');
          const row = {};
          headers.forEach((h, i) => row[h] = cols[i]);
          return row;
        });
      }

      for (const row of parsedRows) {
        const spz = cleanLicensePlate(row.SPZ || row['SPZ ']);
        const druhVozidla = row['Druh vozidla'] || row['Druh vozidla '];
        const typovaZnacka = cleanType(row['Typová značka'] || row['Typová značka ']);
        const vin = cleanVIN(row.VIN);
        if (!spz || spz === 'SPZ' || !druhVozidla) continue;
        const vehicleType = determineVehicleType(druhVozidla);
        vehicles.push({
          licensePlate: spz,
          vin: vin,
          type: typovaZnacka,
          vehicleType: vehicleType,
          druhVozidla: druhVozidla
        });
        vehicleStats[vehicleType]++;
        vehicleStats.total++;
      }
    }

    console.log('\n=== VEHICLE DATA PREVIEW ===');
    console.log('Vehicle statistics:', vehicleStats);
    console.log('\nFirst 10 vehicles:');
    vehicles.slice(0, 10).forEach((vehicle, index) => {
      console.log(`${index + 1}. ${vehicle.licensePlate} - ${vehicle.vehicleType} - ${vehicle.type || 'N/A'} - ${vehicle.vin || 'N/A'}`);
    });
    
    console.log('\nVehicle type examples:');
    const typeExamples = {};
    vehicles.forEach(vehicle => {
      if (!typeExamples[vehicle.vehicleType]) {
        typeExamples[vehicle.vehicleType] = vehicle.druhVozidla;
      }
    });
    Object.entries(typeExamples).forEach(([type, example]) => {
      console.log(`  ${type}: "${example}"`);
    });
    
    return vehicles;
    
  } catch (error) {
    console.error('Error previewing real flotila data:', error);
    throw error;
  }
}

// Export functions for use in browser console
if (typeof window !== 'undefined') {
  window.populateRealFlotilaData = populateRealFlotilaData;
  window.previewRealFlotilaData = previewRealFlotilaData;
  try {
    console.log('[populate-flotila-data v3] Functions attached to window:', {
      populateRealFlotilaData: typeof window.populateRealFlotilaData,
      previewRealFlotilaData: typeof window.previewRealFlotilaData
    });
  } catch {}
}

// If running in Node.js environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    populateRealFlotilaData,
    previewRealFlotilaData,
    determineVehicleType,
    cleanLicensePlate,
    cleanVIN,
    cleanType
  };
}

