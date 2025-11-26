const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// Load data from "add to firebase" folder
//const tires = require("../add to firebase/tires.json");
//const tireHistory = require("../add to firebase/tire_history.json");
const trailers = require("../add to firebase/PNEU/trailers.json");
//const trailerSlots = require("../add to firebase/trailer_slots.json");
const trucks = require("../add to firebase/PNEU/trucks.json");
//const truckSlots = require("../add to firebase/truck_slots.json");
const predefinedServices = require("../add to firebase/FLOTILA/predefined_services.json");
const vehiclesKm = require("../add to firebase/OTHER/vehicles_km.json");

// Load vehicles (separated by category) from FLOTILA directory
const vehiclesCars = require("../add to firebase/FLOTILA/vehicles_cars.json");
const vehiclesTrucks = require("../add to firebase/FLOTILA/vehicles_trucks.json");
const vehiclesTrailers = require("../add to firebase/FLOTILA/vehicles_trailers.json");
const vehiclesOther = require("../add to firebase/FLOTILA/vehicles_other.json");
function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }

  const accountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    path.resolve(__dirname, "..", "serviceAccountKey.json");

  if (!fs.existsSync(accountPath)) {
    throw new Error(
      "Missing service account. Provide FIREBASE_SERVICE_ACCOUNT env JSON or FIREBASE_SERVICE_ACCOUNT_PATH pointing to the service account key."
    );
  }

  return JSON.parse(fs.readFileSync(accountPath, "utf8"));
}

const serviceAccount = loadServiceAccount();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Normalize license plate (remove spaces) to match database format
function normalizeLicensePlate(plate) {
  if (!plate) return plate;
  return plate.toString().replace(/\s+/g, '').toUpperCase();
}

async function importMapToSubcollection(label, pathSegments, dataMap, normalizeIds = false) {
  const entries = Object.entries(dataMap || {});
  if (!entries.length) {
    console.log(`Skipping ${label} (no records)`);
    return;
  }

  console.log(`Importing ${entries.length} documents into ${label}...`);

  const pathPrefix = pathSegments.join("/");
  let batch = db.batch();
  let batchSize = 0;
  let committedBatches = 0;

  for (const [id, payload] of entries) {
    // Normalize ID if needed (for vehicles, normalize license plate)
    const normalizedId = normalizeIds ? normalizeLicensePlate(id) : id;
    const docRef = db.doc(`${pathPrefix}/${normalizedId}`);
    batch.set(docRef, payload);
    batchSize += 1;

    if (batchSize === 450) {
      await batch.commit();
      committedBatches += 1;
      batch = db.batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
    committedBatches += 1;
  }

  console.log(
    `✔ Imported ${entries.length} docs into ${label} across ${committedBatches} batch(es)`
  );
}

async function importSingleDocument(label, pathSegments, dataMap) {
  console.log(`Importing data as single document into ${label}...`);
  
  // Convert the map to a single object where keys become fields
  const docData = {};
  for (const [key, value] of Object.entries(dataMap || {})) {
    // Extract kilometers from the value object if it exists
    docData[key] = value.kilometers !== undefined ? value.kilometers : value;
  }
  
  const pathPrefix = pathSegments.join("/");
  const docRef = db.doc(pathPrefix);
  await docRef.set(docData, { merge: true });
  
  console.log(`✔ Imported ${Object.keys(docData).length} fields into ${label}`);
}

async function importAll() {
  console.log('Starting import...');
  try {
    // await importMapToSubcollection(
    //   "TIRES/storage/items",
    //   ["TIRES", "storage", "items"],
    //   tires
    // );
    // await importMapToSubcollection(
    //   "TIRES/history_tires/items",
    //   ["TIRES", "history_tires", "items"],
    //   tireHistory
    // );
    // Import trucks to TIRES/trucks/items (subcollection structure)
    await importMapToSubcollection(
      "TIRES/trucks/items",
      ["TIRES", "trucks", "items"],
      trucks,
      true // normalize license plates
    );
    // Import trailers to TIRES/trailers/items (subcollection structure)
    await importMapToSubcollection(
      "TIRES/trailers/items",
      ["TIRES", "trailers", "items"],
      trailers,
      true // normalize license plates
    );
    // await importMapToSubcollection(
    //   "TIRES/truck_slots/items",
    //   ["TIRES", "truck_slots", "items"],
    //   truckSlots
    // );
    // await importMapToSubcollection(
    //   "TIRES/trailer_slots/items",
    //   ["TIRES", "trailer_slots", "items"],
    //   trailerSlots
    // );
    await importMapToSubcollection(
      "FLOTILA/predefined_services/items",
      ["FLOTILA", "predefined_services", "items"],
      predefinedServices
    );
    await importSingleDocument(
      "SHARED/vehicles_km",
      ["SHARED", "vehicles_km"],
      vehiclesKm
    );

    // Import vehicles to FLOTILA collection
    // Note: normalizeIds=true to remove spaces from license plates (e.g., "AA 466 SN" -> "AA466SN")
    // Cars go to FLOTILA/cars/items
    await importMapToSubcollection(
      "FLOTILA/cars/items",
      ["FLOTILA", "cars", "items"],
      vehiclesCars,
      true // normalize license plates
    );
    
    // Trucks go to FLOTILA/trucks/items
    await importMapToSubcollection(
      "FLOTILA/trucks/items",
      ["FLOTILA", "trucks", "items"],
      vehiclesTrucks,
      true // normalize license plates
    );
    
    // Trailers go to FLOTILA/trailers/items
    await importMapToSubcollection(
      "FLOTILA/trailers/items",
      ["FLOTILA", "trailers", "items"],
      vehiclesTrailers,
      true // normalize license plates
    );
    
    // Other vehicles go to FLOTILA/other/items
    await importMapToSubcollection(
      "FLOTILA/other/items",
      ["FLOTILA", "other", "items"],
      vehiclesOther,
      true // normalize license plates
    );

    console.log("✅ All Firestore imports finished!");
  } catch (err) {
    console.error("Import failed:", err);
    process.exitCode = 1;
  }
}

importAll().then(() => {
  console.log('Script completed successfully');
  process.exit(0);
}).catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
