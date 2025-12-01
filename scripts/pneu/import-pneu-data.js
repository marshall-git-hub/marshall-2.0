/**
 * Script to import/update tyre data in Firestore from JSON exports.
 *
 * Usage:
 *   node scripts/pneu/import-pneu-data.js
 *
 * The script looks for JSON files inside `add to firebase/PNEU/new/`.
 * It supports filenames with or without the trailing " (1)" that macOS/Windows
 * add when downloading duplicates (e.g. `tires.json` or `tires (1).json`).
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccountPath = path.resolve(__dirname, '../../serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('serviceAccountKey.json not found. Please place it at the project root.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath))
});

const db = admin.firestore();
const DATA_DIR = path.resolve(__dirname, '../../add to firebase/PNEU/new');

const datasets = [
  {
    name: 'tires',
    fileBaseName: 'tires',
    getCollection: () => db.collection('TIRES').doc('storage').collection('items')
  },
  {
    name: 'trucks',
    fileBaseName: 'trucks',
    getCollection: () => db.collection('TIRES').doc('trucks').collection('items')
  },
  {
    name: 'trailers',
    fileBaseName: 'trailers',
    getCollection: () => db.collection('TIRES').doc('trailers').collection('items')
  },
  {
    name: 'truck_slots',
    fileBaseName: 'truck_slots',
    getCollection: () => db.collection('TIRES').doc('truck_slots').collection('items')
  },
  {
    name: 'trailer_slots',
    fileBaseName: 'trailer_slots',
    getCollection: () => db.collection('TIRES').doc('trailer_slots').collection('items')
  },
  {
    name: 'tire_history',
    fileBaseName: 'tire_history',
    getCollection: () => db.collection('TIRES').doc('history_tires').collection('items')
  }
];

function resolveJsonPath(baseName) {
  const withoutSuffix = path.join(DATA_DIR, `${baseName}.json`);
  if (fs.existsSync(withoutSuffix)) {
    return withoutSuffix;
  }

  const withSuffix = path.join(DATA_DIR, `${baseName} (1).json`);
  if (fs.existsSync(withSuffix)) {
    return withSuffix;
  }

  throw new Error(`Cannot find JSON file for "${baseName}" in ${DATA_DIR}`);
}

async function importDataset(dataset) {
  const filePath = resolveJsonPath(dataset.fileBaseName);
  const raw = fs.readFileSync(filePath, 'utf8');
  const payload = JSON.parse(raw);
  const entries = Object.entries(payload);

  if (entries.length === 0) {
    console.log(`- ${dataset.name}: nothing to import (empty JSON)`);
    return;
  }

  console.log(`- ${dataset.name}: importing ${entries.length} documents from ${path.basename(filePath)} ...`);

  const collectionRef = dataset.getCollection();
  const chunkSize = 400;

  for (let i = 0; i < entries.length; i += chunkSize) {
    const batch = db.batch();
    const slice = entries.slice(i, i + chunkSize);

    slice.forEach(([docId, docData]) => {
      batch.set(collectionRef.doc(docId), docData, { merge: true });
    });

    await batch.commit();
  }

  console.log(`  ✓ ${dataset.name}: import complete`);
}

(async () => {
  console.log('Starting PNEU data import...');
  for (const dataset of datasets) {
    try {
      await importDataset(dataset);
    } catch (err) {
      console.error(`  ✗ ${dataset.name}: ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
  console.log('Done.');
  process.exit();
})();

