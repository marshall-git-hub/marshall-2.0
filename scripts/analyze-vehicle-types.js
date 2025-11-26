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

// Collect all unique vehicle types
const vehicleTypes = new Set();

for (let i = 1; i < rawData.length; i++) {
  const row = rawData[i];
  if (!row || row.length === 0) continue;
  
  const vehicleType = row[vehicleTypeColIndex];
  if (vehicleType) {
    vehicleTypes.add(vehicleType.toString().trim());
  }
}

console.log('Current vehicle types found:');
console.log('==========================');
Array.from(vehicleTypes).sort().forEach((type, index) => {
  console.log(`${index + 1}. "${type}"`);
});

console.log(`\nTotal unique types: ${vehicleTypes.size}`);




