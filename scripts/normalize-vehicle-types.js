const XLSX = require('xlsx');
const path = require('path');

// Read the vozidla.xls file
const vozidlaPath = path.join(__dirname, '..', 'add to firebase', 'vozidla.xls');
console.log('Reading vozidla.xls...');

const workbook = XLSX.readFile(vozidlaPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convert to JSON with headers
const rawData = XLSX.utils.sheet_to_json(worksheet, { 
  header: 1, 
  defval: null,
  raw: false 
});

// Find header row
const headers = rawData[0];
const vehicleTypeColIndex = headers.findIndex(h => h === 'Druh vozidla' || h === 'Druh vozidla');

if (vehicleTypeColIndex === -1) {
  console.error('Could not find "Druh vozidla" column');
  process.exit(1);
}

console.log(`Found vehicle type column at index ${vehicleTypeColIndex}\n`);

// Function to normalize vehicle type
function normalizeVehicleType(type) {
  if (!type) return 'Ostatne';
  
  const normalized = type.toString().trim();
  const lower = normalized.toLowerCase();
  
  // Osobné Auto
  if (lower.includes('osobné') || lower.includes('osobne') || lower.includes('osovné') || lower.includes('osovne')) {
    return 'Osobné Auto';
  }
  
  // Dodávka
  if (lower.includes('dodávka') || lower.includes('dodavka')) {
    return 'Dodávka';
  }
  
  // Nakladný náves MEGA
  if (lower.includes('náves mega') || lower.includes('naves mega') || lower.includes('návesmega')) {
    return 'Nakladný náves MEGA';
  }
  
  // Nakladný náves (but not MEGA)
  if (lower.includes('náves') || lower.includes('naves')) {
    // Check if it's not MEGA
    if (!lower.includes('mega')) {
      return 'Nakladný náves';
    }
  }
  
  // Príves (trailer) - map to Nakladný náves
  if (lower.includes('príves') || lower.includes('prives')) {
    return 'Nakladný náves';
  }
  
  // Nakladné vozidlo / Nakladné Auto
  if (lower.includes('nakladné') || lower.includes('nakladne') || lower.includes('nákladné') || lower.includes('nakladne')) {
    // Check if it's a vehicle (not trailer)
    if (!lower.includes('náves') && !lower.includes('naves') && !lower.includes('príves') && !lower.includes('prives')) {
      return 'Nakladné Auto';
    }
  }
  
  // specialne obytné vozidlo
  if (lower.includes('obyt') || lower.includes('obytné') || lower.includes('obytne')) {
    return 'specialne obytné vozidlo';
  }
  
  // Everything else goes to Ostatne
  return 'Ostatne';
}

// Process each row
let changesCount = 0;
const typeMapping = {};

for (let i = 1; i < rawData.length; i++) {
  const row = rawData[i];
  if (!row || row.length === 0) continue;
  
  const oldType = row[vehicleTypeColIndex];
  if (!oldType) continue;
  
  const newType = normalizeVehicleType(oldType);
  
  if (oldType.toString().trim() !== newType) {
    row[vehicleTypeColIndex] = newType;
    changesCount++;
    
    // Track mappings
    if (!typeMapping[oldType]) {
      typeMapping[oldType] = newType;
    }
    
    console.log(`  Row ${i + 1}: "${oldType}" -> "${newType}"`);
  }
}

console.log(`\nTotal changes: ${changesCount}`);

// Show summary of mappings
console.log('\nType mappings:');
console.log('==============');
Object.entries(typeMapping).sort().forEach(([old, newType]) => {
  console.log(`  "${old}" -> "${newType}"`);
});

// Convert back to worksheet
const newWorksheet = XLSX.utils.aoa_to_sheet(rawData);

// Update workbook
workbook.Sheets[sheetName] = newWorksheet;

// Write the file back
console.log('\nWriting updated file...');
XLSX.writeFile(workbook, vozidlaPath);
console.log('✅ File updated successfully!');




