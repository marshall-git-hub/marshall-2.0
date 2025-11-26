const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Helper function to convert Excel date number to date string
function convertExcelDateToDateString(value) {
  if (value === null || value === undefined || value === '') {
    return value;
  }
  
  let numValue;
  if (typeof value === 'number') {
    numValue = value;
  } else if (typeof value === 'string') {
    // Check if it's a number string
    const trimmed = value.trim();
    if (/^\d+\.?\d*$/.test(trimmed)) {
      numValue = parseFloat(trimmed);
    } else {
      // Already a date string, return as is
      return value;
    }
  } else {
    return value;
  }
  
  if (isNaN(numValue)) {
    return value;
  }
  
  // Excel date serial number conversion
  try {
    // XLSX library method
    const excelDate = XLSX.SSF.parse_date_code(numValue);
    if (excelDate) {
      const year = excelDate.y;
      const month = String(excelDate.m).padStart(2, '0');
      const day = String(excelDate.d).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    // Fallback method
    // Excel dates are days since 1900-01-01 (but Excel incorrectly treats 1900 as leap year)
    const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
    const date = new Date(excelEpoch.getTime() + numValue * 86400000);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  
  return value;
}

// Read all service Excel files
const servicesPath = path.join(__dirname, '..', 'add to firebase', 'services');
const serviceFiles = fs.readdirSync(servicesPath).filter(f => f.endsWith('.xls'));

console.log(`Processing ${serviceFiles.length} service files...\n`);

// Columns to remove
const columnsToRemove = ['Kód', 'Změnu provedl', 'Datum změny', 'Kód agr.', 'Popis agregátu'];

// Column to fix date format
const dateColumnToFix = 'Dat. Posl.';

for (const file of serviceFiles) {
  try {
    const filePath = path.join(servicesPath, file);
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
    
    if (rawData.length < 2) {
      console.log(`  ⚠ ${file}: Not enough data`);
      continue;
    }
    
    const headers = rawData[0];
    
    // Find indices of columns to remove and date column
    const indicesToRemove = new Set();
    let dateColIndex = -1;
    
    headers.forEach((header, index) => {
      if (columnsToRemove.includes(header)) {
        indicesToRemove.add(index);
      }
      if (header === dateColumnToFix) {
        dateColIndex = index;
      }
    });
    
    // Create new data structure without removed columns
    const newData = [];
    
    // Calculate the new index of the date column after removals
    let newDateColIndex = -1;
    if (dateColIndex !== -1) {
      let currentNewIndex = 0;
      for (let j = 0; j < headers.length; j++) {
        if (indicesToRemove.has(j)) {
          continue;
        }
        if (j === dateColIndex) {
          newDateColIndex = currentNewIndex;
          break;
        }
        currentNewIndex++;
      }
    }
    
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row) continue;
      
      const newRow = [];
      let currentNewIndex = 0;
      
      for (let j = 0; j < headers.length; j++) {
        // Skip columns to remove
        if (indicesToRemove.has(j)) {
          continue;
        }
        
        let value = row[j];
        
        // Fix date column (skip header row)
        if (i > 0 && currentNewIndex === newDateColIndex && newDateColIndex !== -1) {
          value = convertExcelDateToDateString(value);
        }
        
        newRow.push(value);
        currentNewIndex++;
      }
      
      newData.push(newRow);
    }
    
    // Convert back to worksheet
    const newWorksheet = XLSX.utils.aoa_to_sheet(newData);
    
    // Update workbook
    workbook.Sheets[sheetName] = newWorksheet;
    
    // Write the file back
    XLSX.writeFile(workbook, filePath);
    
    const removedCount = indicesToRemove.size;
    const dateFixed = dateColIndex !== -1 ? ' (date fixed)' : '';
    console.log(`  ✓ ${file}: ${removedCount} column(s) removed${dateFixed}`);
    
  } catch (error) {
    console.error(`  ✗ ${file}: Error - ${error.message}`);
  }
}

console.log('\n✅ All service files updated!');

