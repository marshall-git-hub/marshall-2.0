const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Load predefined services
const predefinedServicesPath = path.join(__dirname, '..', 'add to firebase', 'FLOTILA', 'predefined_services.json');
const predefinedServices = JSON.parse(fs.readFileSync(predefinedServicesPath, 'utf8'));

// Extract predefined service names
const predefinedNames = Object.values(predefinedServices).map(s => s.name);
console.log('Predefined service names:');
console.log('========================');
predefinedNames.sort().forEach((name, i) => {
  console.log(`${i + 1}. "${name}"`);
});

// Read all service Excel files
const servicesPath = path.join(__dirname, '..', 'add to firebase', 'services');
const serviceFiles = fs.readdirSync(servicesPath).filter(f => f.endsWith('.xls'));

console.log(`\nAnalyzing ${serviceFiles.length} service files...\n`);

const serviceNames = new Set();
const serviceNameCounts = {};

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
    
    if (nameColIndex === -1) continue;
    
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;
      
      const serviceName = row[nameColIndex];
      if (serviceName && typeof serviceName === 'string') {
        const trimmed = serviceName.trim();
        if (trimmed) {
          serviceNames.add(trimmed);
          serviceNameCounts[trimmed] = (serviceNameCounts[trimmed] || 0) + 1;
        }
      }
    }
  } catch (error) {
    console.error(`Error reading ${file}:`, error.message);
  }
}

console.log('\nService names found in Excel files:');
console.log('====================================');
Array.from(serviceNames).sort().forEach((name, i) => {
  const count = serviceNameCounts[name];
  console.log(`${i + 1}. "${name}" (${count} occurrences)`);
});

console.log(`\nTotal unique service names in Excel files: ${serviceNames.size}`);




