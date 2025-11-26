const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Load predefined services
const predefinedServicesPath = path.join(__dirname, '..', 'add to firebase', 'FLOTILA', 'predefined_services.json');
const predefinedServices = JSON.parse(fs.readFileSync(predefinedServicesPath, 'utf8'));

// Extract predefined service names
const predefinedNames = Object.values(predefinedServices).map(s => s.name);

// Function to normalize service name to match predefined services
function normalizeServiceName(excelName) {
  if (!excelName || typeof excelName !== 'string') return excelName;
  
  const trimmed = excelName.trim();
  const lower = trimmed.toLowerCase();
  
  // Direct mappings for common variations
  const mappings = {
    // STK / Technická kontrola
    'kontrola technická  stk': 'Technická kontrola (STK)',
    'kontrola technicka stk': 'Technická kontrola (STK)',
    'technická kontrola  a emisná': 'Technická kontrola (STK)',
    
    // Emisná kontrola
    'kontrola emisná': 'Emisná kontrola (EK)',
    
    // Karty
    'karta visa': 'Karta VISA',
    'karta as24': 'Karta AS24',
    'karta benzina': 'Karta Benzina',
    'karta eurowag': 'Karta Eurowag',
    
    // Dokumenty
    'dokument  koncesná listina': 'Koncesná listina',
    'dokument eurolicenia - modrá listina': 'Eurolicencia (modrá karta)',
    'dokument l- certifikát  lärmarmes kraft.': 'L - Certifikát',
    
    // Poistenie
    'poistenie výmena zelenej karty': 'Poistenie - zelená karta',
    'havarijné poistenie _platba': 'Poistenie - zelená karta',
    
    // Tachograf
    'kontrola stiahnutie tachografu': 'Stiahnutie tachografu',
    'kontrola pneumatik ciachovanie tachogr.': 'Ciachovanie tachografu',
    
    // Olej
    'výmena motorového oleje': 'Výmena oleja v motorove',
    'výměna motorového oleja,filtrov': 'Výmena oleja v motorove',
    'výmena motorového oleja filtrov': 'Výmena oleja v motorove',
    'výmena prevodového oleja': 'Výmena oleja v prevodovke',
    'výměna prevodového oleja': 'Výmena oleja v prevodovke',
    'výmena oleja diferenciálu': 'Výmena oleja v diferenciáli',
    'výmena oleja v retarder': 'Výmena oleja v diferenciáli',
    'výmena oleja v retardery': 'Výmena oleja v diferenciáli',
    
    // DPF
    'výmena dpf filtra': 'Výmena DPF filtra',
    'vymena dpf': 'Výmena DPF filtra',
    'výmena dpf filtra prehodený z zc300bp': 'Výmena DPF filtra',
    
    // Chladiaca zmes
    'výmena chladiacej zmesi': 'Výmena chladiacej zmesi',
    'výmena chladiacej zmesi s retardérom': 'Výmena chladiacej zmesi',
    'servis kontrola chlad.zmesi': 'Kontrola chladiacej zmesi',
    'servis kontrola chlad.zmesi (retardér)': 'Kontrola chladiacej zmesi',
    
    // Spojka
    'výmena spojky': 'Výmena spojky',
    
    // Trisky
    'výmena trisiek': 'Výmena trisiek',
    
    // Kontroly
    'servis kontrola komplet  bŕzd': 'Kontrola brźd',
    'servis kontrola hasiaci prístroj': 'Kontrola hasiacich prístrojov',
    'servis kontrola nastavenie geometrie': 'Nastavenie geometrie',
    'servis kontrola nastavenie ventilov': 'Kontrola/Nastavenie ventilov',
    
    // Ročné kontroly
    'servis ročná prehliadka náves': 'Ročná kontrola náves',
    'servis ročná prehliadka ťahač': 'Ročná kontrola tahač',
  };
  
  // Check exact match first (case-insensitive)
  if (mappings[lower]) {
    return mappings[lower];
  }
  
  // Try fuzzy matching
  for (const [pattern, predefined] of Object.entries(mappings)) {
    if (lower.includes(pattern) || pattern.includes(lower)) {
      return predefined;
    }
  }
  
  // Try to match with predefined services by similarity
  for (const predefined of predefinedNames) {
    const predefinedLower = predefined.toLowerCase();
    
    // Check if they're very similar (one contains the other or vice versa)
    if (lower.includes(predefinedLower) || predefinedLower.includes(lower)) {
      // Additional checks for better matching
      if (lower.includes('stk') && predefinedLower.includes('stk')) {
        return predefined;
      }
      if (lower.includes('emisná') && predefinedLower.includes('emisná')) {
        return predefined;
      }
      if (lower.includes('karta') && predefinedLower.includes('karta')) {
        return predefined;
      }
      if (lower.includes('oleja') && predefinedLower.includes('oleja')) {
        // More specific matching for oil changes
        if (lower.includes('motor') && predefinedLower.includes('motor')) {
          return predefined;
        }
        if (lower.includes('prevod') && predefinedLower.includes('prevodovke')) {
          return predefined;
        }
        if (lower.includes('diferenciál') && predefinedLower.includes('diferenciál')) {
          return predefined;
        }
      }
      if (lower.includes('chladiacej') && predefinedLower.includes('chladiacej')) {
        return predefined;
      }
      if (lower.includes('tachograf') && predefinedLower.includes('tachograf')) {
        return predefined;
      }
    }
  }
  
  // If no match found, return original (trimmed)
  return trimmed;
}

// Read all service Excel files
const servicesPath = path.join(__dirname, '..', 'add to firebase', 'services');
const serviceFiles = fs.readdirSync(servicesPath).filter(f => f.endsWith('.xls'));

console.log(`Processing ${serviceFiles.length} service files...\n`);

let totalChanges = 0;
const changeSummary = {};

for (const file of serviceFiles) {
  try {
    const filePath = path.join(servicesPath, file);
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
    
    if (rawData.length < 2) continue;
    
    const headers = rawData[0];
    const nameColIndex = headers.findIndex(h => h === 'Název' || h === 'Nazev');
    
    if (nameColIndex === -1) {
      console.log(`  ⚠ ${file}: No "Název" column found`);
      continue;
    }
    
    let fileChanges = 0;
    
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;
      
      const oldName = row[nameColIndex];
      if (!oldName || typeof oldName !== 'string') continue;
      
      const newName = normalizeServiceName(oldName);
      
      if (oldName.trim() !== newName) {
        row[nameColIndex] = newName;
        fileChanges++;
        totalChanges++;
        
        // Track changes
        const key = `${oldName.trim()} -> ${newName}`;
        changeSummary[key] = (changeSummary[key] || 0) + 1;
      }
    }
    
    if (fileChanges > 0) {
      // Convert back to worksheet
      const newWorksheet = XLSX.utils.aoa_to_sheet(rawData);
      workbook.Sheets[sheetName] = newWorksheet;
      
      // Write the file back
      XLSX.writeFile(workbook, filePath);
      console.log(`  ✓ ${file}: ${fileChanges} service name(s) updated`);
    }
  } catch (error) {
    console.error(`  ✗ ${file}: Error - ${error.message}`);
  }
}

console.log(`\nTotal changes: ${totalChanges}`);

if (Object.keys(changeSummary).length > 0) {
  console.log('\nChange summary:');
  console.log('===============');
  Object.entries(changeSummary)
    .sort((a, b) => b[1] - a[1])
    .forEach(([change, count]) => {
      console.log(`  "${change}" (${count} times)`);
    });
}

console.log('\n✅ All service files updated!');




