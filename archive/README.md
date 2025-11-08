# Archive - Removed Code and Files

This folder contains code and files that were removed from the main codebase but kept here for potential future use.

## Files Moved Here

- **populate-flotila-data.js** - Script for populating Firebase database with data from Excel files
- **convert-services-to-json.js** - Script to convert Excel service files to JSON format
- **debug-services.js** - Debug utility for testing services loading
- **ccc.xls** - Excel file used for data population
- **flotila-populate-code-removed.js** - Saved code from flotila.js that was removed

## Removed Functionality

### Populate Data Feature

The populate functionality was removed from:
- `flotila/flotila.js` - Removed `populateRealData()` method and event listener
- `flotila/index.html` - Removed populate button and script reference

All removed code is preserved in `flotila-populate-code-removed.js` with comments indicating where it was located in the original files.

## To Restore

If you need to restore this functionality:

1. Copy the files from this archive back to the root directory
2. Restore the `populateRealData()` method to `flotila.js` (see flotila-populate-code-removed.js)
3. Add the event listener back to `bindEvents()` method
4. Add the button HTML back to `flotila/index.html`
5. Add the script reference back to `flotila/index.html`

## Date Archived

2025-11-05



