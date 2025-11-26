const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Read the vozidla.xls file
const vozidlaPath = path.join(__dirname, '..', 'add to firebase', 'vozidla.xls');
console.log('Reading vozidla.xls...');

const workbook = XLSX.readFile(vozidlaPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convert to JSON with headers to understand structure
const rawData = XLSX.utils.sheet_to_json(worksheet, { 
  header: 1, 
  defval: null,
  raw: false 
});

// Find header row (first row)
const headers = rawData[0];

// Find column indices
const modelColIndex = headers.findIndex(h => h === 'Typová značka' || h === 'Typova znacka');
const vehicleTypeColIndex = headers.findIndex(h => h === 'Druh vozidla' || h === 'Druh vozidla');

if (modelColIndex === -1) {
  console.error('Could not find "Typová značka" column');
  process.exit(1);
}

if (vehicleTypeColIndex === -1) {
  console.error('Could not find "Druh vozidla" column');
  process.exit(1);
}

console.log(`Found model column at index ${modelColIndex}`);
console.log(`Found vehicle type column at index ${vehicleTypeColIndex}`);

// Convert to array of arrays for easier manipulation
let changesCount = 0;

// Process each row (skip header row)
for (let i = 1; i < rawData.length; i++) {
  const row = rawData[i];
  
  if (!row || row.length === 0) continue;
  
  const model = row[modelColIndex];
  const vehicleType = row[vehicleTypeColIndex];
  
  if (!model || typeof model !== 'string') continue;
  
  let newModel = model;
  let changed = false;
  
  // Check if it's a Mercedes and nakladné vozidlo (truck)
  const isMercedes = /^Mercedes/i.test(model.trim());
  const isNakladneVozidlo = vehicleType && 
    (vehicleType.toString().toLowerCase().includes('nakladné') || 
     vehicleType.toString().toLowerCase().includes('nakladne') ||
     vehicleType.toString().toLowerCase().includes('nákladné') ||
     vehicleType.toString().toLowerCase().includes('nakladne'));
  
  if (isMercedes && isNakladneVozidlo) {
    newModel = 'Mercedes-Benz ACTROS';
    changed = true;
    changesCount++;
    console.log(`  Row ${i + 1}: "${model}" -> "${newModel}" (Mercedes truck)`);
  }
  
  // Change Schwarzmuller xx to just Schwarzmuller
  if (/Schwarzmuller/i.test(newModel) && newModel.trim() !== 'Schwarzmuller') {
    // Check if it's just "Schwarzmuller" with extra characters
    const schwarzmullerMatch = newModel.match(/^(Schwarzmuller)\s*.*$/i);
    if (schwarzmullerMatch) {
      newModel = 'Schwarzmuller';
      if (!changed) {
        changed = true;
        changesCount++;
        console.log(`  Row ${i + 1}: "${model}" -> "${newModel}" (Schwarzmuller)`);
      }
    }
  }
  
  // Change KOGEL or KÖGEL with additional text to just KÖGEL (replace entire string)
  if (/KOGEL/i.test(newModel) || (newModel.includes('KÖGEL') && newModel.trim() !== 'KÖGEL')) {
    const oldModel = newModel;
    newModel = 'KÖGEL';
    if (oldModel !== newModel) {
      if (!changed) {
        changed = true;
        changesCount++;
      }
      console.log(`  Row ${i + 1}: "${model}" -> "${newModel}" (KOGEL -> KÖGEL)`);
    }
  }
  
  // Update the row if changed
  if (changed) {
    row[modelColIndex] = newModel;
  }
}

// Convert back to worksheet
const newWorksheet = XLSX.utils.aoa_to_sheet(rawData);

// Update workbook
workbook.Sheets[sheetName] = newWorksheet;

// Write the file back
console.log(`\nTotal changes: ${changesCount}`);
console.log('Writing updated file...');
XLSX.writeFile(workbook, vozidlaPath);
console.log('✅ File updated successfully!');

