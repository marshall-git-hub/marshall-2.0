#!/usr/bin/env node
/**
 * Script to convert Excel service files to JSON format for browser use
 * Run this in Node.js environment to create services.json file
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Service decoder function (same as in populate-flotila-data.js)
function decodeServiceName(originalName) {
  if (!originalName) return originalName;
  
  const name = originalName.toLowerCase().trim();
  
  
  // Technical Inspection (STK) - separate from EK
  if (name.includes('kontrola technicka stk') || name.includes('kontrola technická stk')) {
    return 'Technická kontrola (STK)';
  }
  
  // Emission Control (EK) - separate from STK
  if (name.includes('kontrola emisná') || name.includes('technická kontrola a emisná')) {
    return 'Emisná kontrola (EK)';
  }
  
  // Motor Oil Change
  if (name.includes('výmena motorového oleja') || name.includes('výměna motorového oleja')) {
    return 'Výmena oleja v Motore';
  }
  
  // Retarder Oil Change
  if (name.includes('výmena oleja v retarder') || name.includes('výmena oleja v retardery')) {
    return 'Výmena oleja v Retardery';
  }
  
  // Transmission Oil Change
  if (name.includes('výměna prevodového oleja') || name.includes('výmena prevodového oleja')) {
    return 'Výmena oleja v Prevodovke';
  }
  
  // Differential Oil Change
  if (name.includes('výmena oleja diferenciálu')) {
    return 'Výmena oleja v Diferenciali';
  }
  
  // DPF Service
  if (name.includes('vymena dpf') || name.includes('výmena dpf filtra')) {
    return 'Servis DPF filtra';
  }
  
  // Tachograph Service
  if (name.includes('kontrola stiahnutie tachografu')) {
    return 'Stiahnutie tachografu';
  }
  
  // Tire Marking (Ciachovanie)
  if (name.includes('kontrola pneumatik ciachovanie tachogr')) {
    return 'Ciachovanie tachografu';
  }
  
  // Annual Tractor Inspection
  if (name.includes('servis ročná prehliadka ťahač')) {
    return 'Ročná prehliadka ťahača';
  }
  
  // Annual Trailer Inspection
  if (name.includes('servis ročná prehliadka náves')) {
    return 'Ročná prehliadka návese';
  }
  
  // Highway Toll (Slovakia)
  if (name.includes('mýto diaľničná známka ročná sk')) {
    return 'Diaľničná známka Slovensko';
  }
  
  // L-Certificate
  if (name.includes('dokument l- certifikát') || name.includes('lärmarmes kraft')) {
    return 'L-Certifikát';
  }
  
  // Brake Service
  if (name.includes('servis kontrola komplet') && name.includes('bŕzd')) {
    return 'Kontrola bŕzd';
  }
  
  // Fire Extinguisher Service
  if (name.includes('servis kontrola hasiaci prístroj')) {
    return 'Kontrola hasiaci prístroj';
  }
  
  // Valve Adjustment Service
  if (name.includes('servis kontrola nastavenie ventilov')) {
    return 'Nastavenie ventilov';
  }
  
  // Capitalize first letter of the original name if no specific mapping found
  if (originalName && originalName.length > 0) {
    return originalName.charAt(0).toUpperCase() + originalName.slice(1);
  }
  
  return originalName;
}

// Function to clean license plate
function cleanLicensePlate(spz) {
  return spz.trim().replace(/\s+/g, ' ').toUpperCase();
}

// Load services from Excel files
function loadServisDataFromExcels(servisDir) {
  const plateToServices = {};

  let files = [];
  try {
    files = fs.readdirSync(servisDir)
      .filter(f => f.toLowerCase().endsWith('.xls') || f.toLowerCase().endsWith('.xlsx'));
  } catch (e) {
    console.error(`Could not read servis_data directory at ${servisDir}:`, e.message);
    return plateToServices;
  }

  const toCleanPlate = (filenamePlate) => cleanLicensePlate(filenamePlate);

  for (const file of files) {
    const fullPath = path.join(servisDir, file);
    let workbook;
    try {
      workbook = XLSX.readFile(fullPath, { cellDates: true, WTF: false });
    } catch (e) {
      console.warn(`Failed to read Excel file ${fullPath}: ${e.message}`);
      continue;
    }

    const firstSheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[firstSheetName];
    if (!ws) continue;

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    if (!rows || rows.length < 2) continue;

    // Header is first row
    const header = rows[0].map(h => (h || '').toString().trim());

    // Find column indices by letters/rules
    // B -> index 1, C -> index 2, D -> index 3, G -> 6, H -> 7
    const COL_B = 1;
    const COL_C = 2;
    const COL_D = 3;
    const COL_G = 6;
    const COL_H = 7;

    // Try to locate "Signalizovať" column in header, fallback to E (index 4)
    let signalIdx = header.findIndex(h => h.toLowerCase().includes('signal'));
    if (signalIdx === -1) signalIdx = 4; // column E

    const plate = toCleanPlate(path.basename(file, path.extname(file)));
    const services = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const name = (row[COL_B] || '').toString().trim();
      if (!name) continue;

      const intervalTypeRaw = (row[COL_C] || '').toString().trim();
      const normaRaw = row[COL_D];
      const signalRaw = signalIdx >= 0 ? row[signalIdx] : undefined;
      const lastH = row[COL_H];
      const lastG = row[COL_G];

      // Determine type and interval
      let type = 'km';
      let interval = null;
      let intervalType = null; // R=year, D=day, M=month

      const toNumber = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const num = Number(String(v).replace(/[^0-9.\-]/g, ''));
        return Number.isFinite(num) ? num : null;
      };

      // Check for interval type indicators in column C
      const parseIntervalType = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const str = String(v).toUpperCase().trim();
        
        // Check for R (rok/year), D (den/day), M (mesiac/month) indicators
        if (str === 'R' || str.includes('ROK')) {
          return 'year';
        } else if (str === 'D' || str.includes('DEN')) {
          return 'day';
        } else if (str === 'M' || str.includes('MESIAC')) {
          return 'month';
        }
        return null;
      };

      // Infer interval type based on value patterns
      const inferIntervalType = (v) => {
        if (v === null || v === undefined || v === '') return null;
        
        // Check if it's a date string (DD.MM.YYYY format)
        if (typeof v === 'string' && /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(v)) {
          return 'date';
        }
        
        const num = toNumber(v);
        if (num === null) return null;
        
        // Small numbers (1-31) are likely days
        if (num >= 1 && num <= 31) {
          return 'day';
        }
        // Medium numbers (32-365) are likely days (weeks/months)
        else if (num >= 32 && num <= 365) {
          return 'day';
        }
        // Large numbers (1000+) are likely kilometers
        else if (num >= 1000) {
          return 'km';
        }
        
        return null;
      };

      const isDateObj = (v) => Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v);
      const parseDateLike = (v) => {
        if (isDateObj(v)) return v;
        if (typeof v === 'number') {
          // Excel date serial
          try { return XLSX.SSF.parse_date_code(v) ? XLSX.SSF.parse_date_code(v) : null; } catch { return null; }
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

      // First check for interval type indicators from column C
      intervalType = parseIntervalType(intervalTypeRaw);
      
      // If no explicit indicators from column C, infer from value patterns in column D
      if (!intervalType) {
        intervalType = inferIntervalType(normaRaw);
      }
      
      
      
      
      // Only use date logic if we have a clear date string AND no interval type from Column C
      if (normaIsDate && !intervalType) {
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
        
        // Use interval type from Column C to determine the correct interval value
        if (intervalType === 'year') {
          type = 'year';
          interval = n; // years
        } else if (intervalType === 'month') {
          type = 'month';
          interval = n; // months
        } else if (intervalType === 'day') {
          type = 'day';
          interval = n; // days
        } else if (intervalType === 'km') {
          type = 'km';
          interval = n; // km
        } else if (intervalType === 'date') {
          type = 'date';
          interval = normaRaw; // keep the original date string
        } else {
          // Fallback to original logic
          if (n < 999) {
            type = 'date';
            interval = n; // days
          } else {
            type = 'km';
            interval = n; // km
          }
        }
      }

      // Reminder from Signalizovať
      const reminderNum = toNumber(signalRaw);
      const serviceObj = {
        name: decodeServiceName(name), // Use decoded service name
        type,
        interval
      };
      
      // Add reminder if present
      if (reminderNum !== null) {
        serviceObj.reminder = reminderNum;
      }
      
      // Add lastService date if present
      const lastDate = parseDateLike(lastH) || parseDateLike(lastG);
      if (lastDate) {
        serviceObj.lastService = { date: lastDate };
      }

      services.push(serviceObj);
    }

    if (services.length) {
      plateToServices[plate] = services;
    }
  }

  return plateToServices;
}

// Main conversion function
async function convertServicesToJSON() {
  try {
    console.log('Converting Excel service files to JSON...');
    
    const servisDir = path.join(__dirname, 'servis_data');
    const plateToServices = loadServisDataFromExcels(servisDir);
    
    const outputPath = path.join(servisDir, 'services.json');
    fs.writeFileSync(outputPath, JSON.stringify(plateToServices, null, 2));
    
    console.log(`✅ Successfully converted services to JSON!`);
    console.log(`📁 Output file: ${outputPath}`);
    console.log(`🚗 Vehicles with services: ${Object.keys(plateToServices).length}`);
    
    // Show sample data
    const samplePlate = Object.keys(plateToServices)[0];
    if (samplePlate) {
      console.log(`📋 Sample vehicle (${samplePlate}):`, plateToServices[samplePlate]);
    }
    
  } catch (error) {
    console.error('❌ Error converting services to JSON:', error);
  }
}

// Run the conversion
convertServicesToJSON();
