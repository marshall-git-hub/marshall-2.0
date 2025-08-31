// Script to populate Firebase with initial flotila data
// Run this script once to set up the initial vehicle data

const initialVehicleData = {
  // Trucks
  "AA466SN": {
    vin: "AA466SNVIN",
    kilometers: 34238,
    trailer: "ZC 206 YD",
    type: "Mercedes Actros",
    vehicleType: "truck",
    services: [
      {
        name: "Výmena oleja v motore",
        type: "km",
        interval: 50000,
        reminderKm: 15000,
        lastService: {
          date: new Date('2024-01-15'),
          km: 25000
        }
      },
      {
        name: "Výmena filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000,
        lastService: {
          date: new Date('2024-02-01'),
          km: 30000
        }
      },
      {
        name: "Kontrola bŕzd",
        type: "date",
        interval: 365, // days
        reminderDays: 30,
        lastService: {
          date: new Date('2023-12-15'),
          km: 20000
        }
      },
      {
        name: "Kontrola klimatizácie",
        type: "date",
        interval: 180, // days
        reminderDays: 14,
        lastService: {
          date: new Date('2023-11-20'),
          km: 18000
        }
      }
    ]
  },
  "AA732GJ": {
    vin: "AA732GJVIN",
    kilometers: 36358,
    trailer: "ZC 212 YC",
    type: "Schwazmüller",
    vehicleType: "truck",
    services: [
      {
        name: "Výmena oleja v motore",
        type: "km",
        interval: 50000,
        reminderKm: 15000,
        lastService: {
          date: new Date('2024-01-20'),
          km: 30000
        }
      },
      {
        name: "Výmena filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000,
        lastService: {
          date: new Date('2024-02-10'),
          km: 34000
        }
      },
      {
        name: "Kontrola bŕzd",
        type: "date",
        interval: 365,
        reminderDays: 30,
        lastService: {
          date: new Date('2023-12-10'),
          km: 25000
        }
      }
    ]
  },
  "ZC153BL": {
    vin: "ZC153BLVIN",
    kilometers: 828513,
    trailer: null,
    type: "Mercedes Sprinter",
    vehicleType: "truck",
    services: [
      {
        name: "Výmena oleja v motore",
        type: "km",
        interval: 30000,
        reminderKm: 10000,
        lastService: {
          date: new Date('2023-10-01'),
          km: 800000
        }
      },
      {
        name: "Výmena filtrov",
        type: "km",
        interval: 15000,
        reminderKm: 5000,
        lastService: {
          date: new Date('2023-11-15'),
          km: 815000
        }
      },
      {
        name: "Kontrola bŕzd",
        type: "date",
        interval: 365,
        reminderDays: 30,
        lastService: {
          date: new Date('2023-11-05'),
          km: 810000
        }
      }
    ]
  },
  "ZC328BL": {
    vin: "ZC328BLVIN",
    kilometers: 0,
    trailer: null,
    type: "Mercedes Actros",
    vehicleType: "truck",
    services: [
      {
        name: "Výmena oleja v motore",
        type: "km",
        interval: 50000,
        reminderKm: 15000
      },
      {
        name: "Výmena filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000
      }
    ]
  },
  "ZC352BP": {
    vin: "ZC352BPVIN",
    kilometers: 0,
    trailer: "ZC 235 YC",
    type: "Schwazmüller",
    vehicleType: "truck",
    services: [
      {
        name: "Výmena oleja v motore",
        type: "km",
        interval: 50000,
        reminderKm: 15000
      },
      {
        name: "Výmena filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000
      }
    ]
  },
  "ZC383BL": {
    vin: "ZC383BLVIN",
    kilometers: 0,
    trailer: null,
    type: "Mercedes Actros",
    vehicleType: "truck",
    services: [
      {
        name: "Výmena oleja v motore",
        type: "km",
        interval: 50000,
        reminderKm: 15000
      },
      {
        name: "Výmena filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000
      }
    ]
  },
  "ZC441BV": {
    vin: "ZC441BVVIN",
    kilometers: 0,
    trailer: null,
    type: "Mercedes Sprinter",
    vehicleType: "truck",
    services: [
      {
        name: "Výmena oleja v motore",
        type: "km",
        interval: 30000,
        reminderKm: 10000
      },
      {
        name: "Výmena filtrov",
        type: "km",
        interval: 15000,
        reminderKm: 5000
      }
    ]
  },
  "ZC449BV": {
    vin: "ZC449BVVIN",
    kilometers: 0,
    trailer: null,
    type: "Mercedes Actros",
    vehicleType: "truck",
    services: [
      {
        name: "Výmena oleja v motore",
        type: "km",
        interval: 50000,
        reminderKm: 15000
      },
      {
        name: "Výmena filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000
      }
    ]
  },
  "ZC465BS": {
    vin: "ZC465BSVIN",
    kilometers: 0,
    trailer: null,
    type: "Schwazmüller",
    vehicleType: "truck",
    services: [
      {
        name: "Výmena oleja v motore",
        type: "km",
        interval: 50000,
        reminderKm: 15000
      },
      {
        name: "Výmena filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000
      }
    ]
  },
  "ZC469BS": {
    vin: "ZC469BSVIN",
    kilometers: 0,
    trailer: null,
    type: "Mercedes Actros",
    vehicleType: "truck",
    services: [
      {
        name: "Výmena oleja v motore",
        type: "km",
        interval: 50000,
        reminderKm: 15000
      },
      {
        name: "Výmena filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000
      }
    ]
  },

  // Trailers
  "ZC 206 YD": {
    vin: "ZC206YDVIN",
    kilometers: 20660,
    type: "Schwazmüller",
    vehicleType: "trailer",
    services: [
      {
        name: "Kontrola oleja",
        type: "km",
        interval: 50000,
        reminderKm: 15000,
        lastService: {
          date: new Date('2024-01-10'),
          km: 15000
        }
      },
      {
        name: "Kontrola filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000,
        lastService: {
          date: new Date('2024-02-05'),
          km: 18000
        }
      }
    ]
  },
  "ZC 212 YC": {
    vin: "ZC212YCVIN",
    kilometers: 0,
    type: "Schwazmüller",
    vehicleType: "trailer",
    services: [
      {
        name: "Kontrola oleja",
        type: "km",
        interval: 50000,
        reminderKm: 15000
      },
      {
        name: "Kontrola filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000
      }
    ]
  },
  "ZC 235 YC": {
    vin: "ZC235YCVIN",
    kilometers: 0,
    type: "Schwazmüller",
    vehicleType: "trailer",
    services: [
      {
        name: "Kontrola oleja",
        type: "km",
        interval: 50000,
        reminderKm: 15000
      },
      {
        name: "Kontrola filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000
      }
    ]
  },
  "ZC 237 YC": {
    vin: "ZC237YCVIN",
    kilometers: 0,
    type: "Schwazmüller",
    vehicleType: "trailer",
    services: [
      {
        name: "Kontrola oleja",
        type: "km",
        interval: 50000,
        reminderKm: 15000
      },
      {
        name: "Kontrola filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000
      }
    ]
  },
  "ZC 278 YC": {
    vin: "ZC278YCVIN",
    kilometers: 0,
    type: "Schwazmüller",
    vehicleType: "trailer",
    services: [
      {
        name: "Kontrola oleja",
        type: "km",
        interval: 50000,
        reminderKm: 15000
      },
      {
        name: "Kontrola filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000
      }
    ]
  },
  "ZC 291 YD": {
    vin: "ZC291YDVIN",
    kilometers: 0,
    type: "Schwazmüller",
    vehicleType: "trailer",
    services: [
      {
        name: "Kontrola oleja",
        type: "km",
        interval: 50000,
        reminderKm: 15000
      },
      {
        name: "Kontrola filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000
      }
    ]
  },
  "ZC 336 YD": {
    vin: "ZC336YDVIN",
    kilometers: 0,
    type: "Schwazmüller",
    vehicleType: "trailer",
    services: [
      {
        name: "Kontrola oleja",
        type: "km",
        interval: 50000,
        reminderKm: 15000
      },
      {
        name: "Kontrola filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000
      }
    ]
  },
  "ZC 388 YC": {
    vin: "ZC388YCVIN",
    kilometers: 0,
    type: "Schwazmüller",
    vehicleType: "trailer",
    services: [
      {
        name: "Kontrola oleja",
        type: "km",
        interval: 50000,
        reminderKm: 15000
      },
      {
        name: "Kontrola filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000
      }
    ]
  },
  "ZC 390 YC": {
    vin: "ZC390YCVIN",
    kilometers: 0,
    type: "Schwazmüller",
    vehicleType: "trailer",
    services: [
      {
        name: "Kontrola oleja",
        type: "km",
        interval: 50000,
        reminderKm: 15000
      },
      {
        name: "Kontrola filtrov",
        type: "km",
        interval: 25000,
        reminderKm: 10000
      }
    ]
  }
};

// Function to populate the database
async function populateFlotilaData() {
  try {
    let processedCount = 0;
    let errorCount = 0;
    
    for (const [licensePlate, vehicleData] of Object.entries(initialVehicleData)) {
      try {
        // First, create the main vehicle document
        await window.db.collection('vehicles').doc(licensePlate).set({
          licensePlate: licensePlate,
          createdAt: new Date()
        });
        
        // Then save vehicle info in the info subcollection
        await window.db.collection('vehicles')
          .doc(licensePlate)
          .collection('info')
          .doc('basic')
          .set(vehicleData);
        
        // Add some sample history entries for vehicles with lastService data
        if (vehicleData.services) {
          for (const service of vehicleData.services) {
            if (service.lastService) {
              await window.db.collection('vehicles')
                .doc(licensePlate)
                .collection('history')
                .add({
                  serviceName: service.name,
                  kilometers: service.lastService.km,
                  date: service.lastService.date,
                  description: `Posledná výmena: ${service.name}`,
                  cost: Math.floor(Math.random() * 500) + 100, // Random cost between 100-600
                  mechanic: "Servis Bratislava",
                  createdAt: new Date()
                });
            }
          }
        }
        
        processedCount++;
        
      } catch (vehicleError) {
        errorCount++;
        console.error(`Error processing vehicle ${licensePlate}:`, vehicleError);
      }
    }
    
    if (errorCount === 0) {
      alert(`Flotila data has been populated successfully! Processed ${processedCount} vehicles.`);
    } else {
      alert(`Flotila data populated with errors! Processed: ${processedCount}, Errors: ${errorCount}. Check console for details.`);
    }
    
  } catch (error) {
    console.error('Error populating flotila data:', error);
    alert('Error populating flotila data: ' + error.message);
  }
}

// Export the function for use in browser console
window.populateFlotilaData = populateFlotilaData;

// Test function to check Firebase connection
window.testFirebaseConnection = async function() {
  try {
    console.log('Testing Firebase connection...');
    console.log('Firebase object:', window.firebase);
    console.log('DatabaseService object:', window.DatabaseService);
    
    // Check what methods are available in DatabaseService
    console.log('DatabaseService methods:', Object.keys(window.DatabaseService));
    console.log('saveVehicleInfo available:', typeof window.DatabaseService.saveVehicleInfo);
    console.log('addHistoryEntry available:', typeof window.DatabaseService.addHistoryEntry);
    
    // Test if we can read from existing collections
    try {
      const tiresSnapshot = await window.db.collection('tires').limit(1).get();
      console.log('Can read from tires collection:', tiresSnapshot.docs.length > 0);
    } catch (readError) {
      console.log('Cannot read from tires collection:', readError.message);
    }
    
    // Test if we can write to vehicles collection
    try {
      const testDoc = await window.db.collection('vehicles').doc('test-vehicle').set({
        test: true,
        timestamp: new Date()
      });
      console.log('Can write to vehicles collection');
      
      // Clean up test document
      await window.db.collection('vehicles').doc('test-vehicle').delete();
      console.log('Test document cleaned up');
      
    } catch (writeError) {
      console.log('Cannot write to vehicles collection:', writeError.message);
    }
    
    alert('Firebase connection test completed! Check console for details.');
    
  } catch (error) {
    console.error('Firebase connection test failed:', error);
    alert('Firebase connection test failed: ' + error.message);
  }
};

// Wait for DatabaseService to be available
function waitForDatabaseService() {
  if (typeof window !== 'undefined' && window.DatabaseService) {
    // Script loaded successfully
  } else {
    // Wait a bit and try again
    setTimeout(waitForDatabaseService, 100);
  }
}

// Start waiting for DatabaseService
waitForDatabaseService();

// Test login function
window.testLogin = async function(email, password) {
  try {
    console.log('=== TESTING LOGIN ===');
    console.log('Attempting login with:', email);
    
    const userCredential = await window.auth.signInWithEmailAndPassword(email, password);
    console.log('Login successful!');
    console.log('User:', userCredential.user);
    
    // Test data access after login
    setTimeout(() => {
      testFlotilaData();
    }, 1000);
    
  } catch (error) {
    console.error('Login failed:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
  }
};

// Simple test function to check data structure
window.testFlotilaData = async function() {
  try {
    console.log('=== TESTING FLOTILA DATA STRUCTURE ===');
    
    // Check authentication first
    console.log('Auth object:', !!window.auth);
    console.log('Current user:', window.auth.currentUser);
    console.log('User authenticated:', !!window.auth.currentUser);
    
    if (!window.auth.currentUser) {
      console.log('No authenticated user - this is why data access fails');
      return;
    }
    
    // Check if we can read from vehicles collection
    const vehiclesSnapshot = await window.db.collection('vehicles').get();
    console.log('Total vehicles found:', vehiclesSnapshot.docs.length);
    
    if (vehiclesSnapshot.docs.length > 0) {
      // Check first vehicle structure
      const firstVehicle = vehiclesSnapshot.docs[0];
      console.log('First vehicle ID:', firstVehicle.id);
      
      // Check if it has info subcollection
      const infoSnapshot = await window.db.collection('vehicles')
        .doc(firstVehicle.id)
        .collection('info')
        .get();
      
      console.log('Info documents found:', infoSnapshot.docs.length);
      
      if (infoSnapshot.docs.length > 0) {
        const infoDoc = infoSnapshot.docs[0];
        console.log('Info document ID:', infoDoc.id);
        console.log('Info document data:', infoDoc.data());
      }
    }
    
    console.log('=== END TEST ===');
    
  } catch (error) {
    console.error('Test error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
  }
};

// Debug function to check what's in the database
window.debugDatabase = async function() {
  try {
    console.log('=== DEBUGGING DATABASE ===');
    
    // Check if we're connected to the right project
    console.log('Firebase app:', window.firebase.app().name);
    console.log('Firebase project ID:', window.firebase.app().options.projectId);
    
    // Check all collections
    const collections = ['vehicles', 'trucks', 'trailers', 'tires'];
    
    for (const collectionName of collections) {
      try {
        const snapshot = await window.db.collection(collectionName).get();
        console.log(`${collectionName} collection has ${snapshot.docs.length} documents`);
        if (snapshot.docs.length > 0) {
          console.log(`  - Document IDs:`, snapshot.docs.map(doc => doc.id));
        }
      } catch (error) {
        console.log(`${collectionName} collection error:`, error.message);
      }
    }
    
    // Check vehicles collection specifically
    const vehiclesSnapshot = await window.db.collection('vehicles').get();
    console.log('\nVehicles collection has', vehiclesSnapshot.docs.length, 'documents');
    console.log('Vehicle IDs found:', vehiclesSnapshot.docs.map(doc => doc.id));
    
    if (vehiclesSnapshot.docs.length > 0) {
      // Check first vehicle in detail
      const firstVehicle = vehiclesSnapshot.docs[0];
      console.log(`\nChecking first vehicle: ${firstVehicle.id}`);
      
      // Check info subcollection
      const infoSnapshot = await window.db.collection('vehicles').doc(firstVehicle.id).collection('info').get();
      console.log(`  - Info subcollection has ${infoSnapshot.docs.length} documents`);
      
      for (const infoDoc of infoSnapshot.docs) {
        console.log(`  - Info doc ID: ${infoDoc.id}, exists: ${infoDoc.exists}`);
        if (infoDoc.exists) {
          console.log(`  - Data:`, infoDoc.data());
        }
      }
      
      // Check history subcollection
      const historySnapshot = await window.db.collection('vehicles').doc(firstVehicle.id).collection('history').get();
      console.log(`  - History subcollection has ${historySnapshot.docs.length} documents`);
    } else {
      console.log('\nNo vehicles found. Let\'s check if data is in trucks/trailers collections instead...');
      
      // Check trucks collection
      const trucksSnapshot = await window.db.collection('trucks').get();
      console.log(`Trucks collection has ${trucksSnapshot.docs.length} documents`);
      
      // Check trailers collection
      const trailersSnapshot = await window.db.collection('trailers').get();
      console.log(`Trailers collection has ${trailersSnapshot.docs.length} documents`);
    }
    
    console.log('=== END DEBUG ===');
    
  } catch (error) {
    console.error('Debug error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
  }
};
