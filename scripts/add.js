const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// Load data from "add to firebase" folder
const tires = require("../add to firebase/tires.json");
const tireHistory = require("../add to firebase/tire_history.json");
const trailers = require("../add to firebase/trailers.json");
const trailerSlots = require("../add to firebase/trailer_slots.json");
const trucks = require("../add to firebase/trucks.json");
const truckSlots = require("../add to firebase/truck_slots.json");

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

async function importMapToSubcollection(label, pathSegments, dataMap) {
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
    const docRef = db.doc(`${pathPrefix}/${id}`);
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

async function importAll() {
  try {
    await importMapToSubcollection(
      "TIRES/storage/items",
      ["TIRES", "storage", "items"],
      tires
    );
    await importMapToSubcollection(
      "TIRES/history_tires/items",
      ["TIRES", "history_tires", "items"],
      tireHistory
    );
    await importMapToSubcollection(
      "TIRES/trucks/items",
      ["TIRES", "trucks", "items"],
      trucks
    );
    await importMapToSubcollection(
      "TIRES/trailers/items",
      ["TIRES", "trailers", "items"],
      trailers
    );
    await importMapToSubcollection(
      "TIRES/truck_slots/items",
      ["TIRES", "truck_slots", "items"],
      truckSlots
    );
    await importMapToSubcollection(
      "TIRES/trailer_slots/items",
      ["TIRES", "trailer_slots", "items"],
      trailerSlots
    );

    console.log("✅ All Firestore imports finished!");
  } catch (err) {
    console.error("Import failed:", err);
    process.exitCode = 1;
  }
}

importAll();
