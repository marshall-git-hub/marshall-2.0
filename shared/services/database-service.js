// Central DatabaseService implementation using Firestore
// NOTE: All tire/truck/trailer data lives under the "TIRES" collection in Firestore
// and shared vehicle kilometers live in document "SHARED/vehicles_km"
const DatabaseService = {
  // --- Helpers ---
  _tiresCollection() {
    return db.collection('TIRES').doc('storage').collection('items');
  },
  _trucksCollection() {
    return db.collection('TIRES').doc('trucks').collection('items');
  },
  _trailersCollection() {
    return db.collection('TIRES').doc('trailers').collection('items');
  },
  _truckSlotsCollection() {
    return db.collection('TIRES').doc('truck_slots').collection('items');
  },
  _trailerSlotsCollection() {
    return db.collection('TIRES').doc('trailer_slots').collection('items');
  },
  _tireHistoryCollection() {
    return db.collection('TIRES').doc('history_tires').collection('items');
  },
  _vehiclesKmDoc() {
    return db.collection('SHARED').doc('vehicles_km');
  },

  // --- TIRES (storage) ---
  async getTires() {
    const snapshot = await this._tiresCollection().get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  onTiresUpdate(callback) {
    return this._tiresCollection().onSnapshot(snapshot => {
      const tires = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(tires);
    });
  },

  async updateTire(id, data) {
    await this._tiresCollection().doc(id).update(data);
  },

  async addTire(data) {
    await this._tiresCollection().add(data);
  },

  async deleteTire(id) {
    await this._tiresCollection().doc(id).delete();
  },

  // --- VEHICLE KILOMETERS (SHARED/vehicles_km) ---
  async getAllVehicleKms() {
    const doc = await this._vehiclesKmDoc().get();
    if (!doc.exists) return {};
    const data = doc.data() || {};
    return data;
  },

  async getVehicleKm(vehicleId) {
    const kms = await this.getAllVehicleKms();
    return kms[vehicleId] ?? null;
  },

  onAllVehicleKmsUpdate(callback) {
    return this._vehiclesKmDoc().onSnapshot(snapshot => {
      if (!snapshot.exists) {
        callback({});
        return;
      }
      callback(snapshot.data() || {});
    });
  },

  onVehicleKmUpdate(vehicleId, callback) {
    return this._vehiclesKmDoc().onSnapshot(snapshot => {
      if (!snapshot.exists) {
        callback(null);
        return;
      }
      const data = snapshot.data() || {};
      callback(data[vehicleId] ?? null);
    });
  },

  async _setVehicleKm(vehicleId, kilometers) {
    await this._vehiclesKmDoc().set({ [vehicleId]: kilometers }, { merge: true });
  },

  // --- TRUCKS & TRAILERS (basic info) ---
  async getTrucks() {
    const snapshot = await this._trucksCollection().get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getTrailers() {
    const snapshot = await this._trailersCollection().get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  onTrucksUpdate(callback) {
    return this._trucksCollection().onSnapshot(snapshot => {
      const trucks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(trucks);
    });
  },

  onTrailersUpdate(callback) {
    return this._trailersCollection().onSnapshot(snapshot => {
      const trailers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(trailers);
    });
  },

  // Utility – normalize license plate / id (remove spaces)
  _normalizeId(licensePlateOrId) {
    return (licensePlateOrId || '').replace(/\s+/g, '');
  },

  async addTruck({ licensePlate, km = 0, tires = {} }) {
    const id = this._normalizeId(licensePlate);
    await this._trucksCollection().doc(id).set({
      licensePlate,
      totalTires: 6,
      tiresAssigned: 0,
      status: 'good',
      tires
    }, { merge: true });
    await this._setVehicleKm(id, km);
  },

  async addTrailer({ licensePlate, km = 0, tires = {} }) {
    const id = this._normalizeId(licensePlate);
    await this._trailersCollection().doc(id).set({
      licensePlate,
      totalTires: 6,
      tiresAssigned: 0,
      status: 'good',
      tires
    }, { merge: true });
    await this._setVehicleKm(id, km);
  },

  // --- TIRE SLOTS (truck & trailer) ---
  async getAllTireSlots(type) {
    const collection = type === 'trailer'
      ? this._trailerSlotsCollection()
      : this._truckSlotsCollection();
    const snapshot = await collection.get();
    const result = {};
    snapshot.docs.forEach(doc => {
      const data = doc.data() || {};
      result[doc.id] = data.slots || [];
    });
    return result;
  },

  async getTireSlots(type, vehicleId) {
    const collection = type === 'trailer'
      ? this._trailerSlotsCollection()
      : this._truckSlotsCollection();
    const doc = await collection.doc(vehicleId).get();
    if (!doc.exists) return [];
    const data = doc.data() || {};
    return data.slots || [];
  },

  async updateTireSlots(type, vehicleId, slots) {
    const collection = type === 'trailer'
      ? this._trailerSlotsCollection()
      : this._truckSlotsCollection();
    await collection.doc(vehicleId).set({ slots }, { merge: true });
  },

  onTireSlotsUpdate(type, vehicleId, callback) {
    const collection = type === 'trailer'
      ? this._trailerSlotsCollection()
      : this._truckSlotsCollection();
    return collection.doc(vehicleId).onSnapshot(doc => {
      if (!doc.exists) {
        callback([]);
        return;
      }
      const data = doc.data() || {};
      callback(data.slots || []);
    });
  },

  // --- TIRE HISTORY ---
  async logTireHistory(entry) {
    const payload = {
      ...entry,
      date: entry.date || new Date().toISOString()
    };
    await this._tireHistoryCollection().add(payload);
  },

  async getTireChangeHistory(vehicleId) {
    const snapshot = await this._tireHistoryCollection()
      .where('vehicleId', '==', vehicleId)
      .orderBy('date', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // --- FLOTILA VEHICLES (for servis module) ---
  _flotilaCarsCollection() {
    return db.collection('FLOTILA').doc('cars').collection('items');
  },

  _flotilaTrucksCollection() {
    return db.collection('FLOTILA').doc('trucks').collection('items');
  },

  _flotilaTrailersCollection() {
    return db.collection('FLOTILA').doc('trailers').collection('items');
  },

  _flotilaOtherCollection() {
    return db.collection('FLOTILA').doc('other').collection('items');
  },

  // Get all vehicles from FLOTILA collection
  async getAllVehicles() {
    try {
      const [carsSnapshot, trucksSnapshot, trailersSnapshot, otherSnapshot] = await Promise.all([
        this._flotilaCarsCollection().get(),
        this._flotilaTrucksCollection().get(),
        this._flotilaTrailersCollection().get(),
        this._flotilaOtherCollection().get()
      ]);

      const vehiclesMap = {};
      
      // Process cars
      carsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const licensePlate = data.licensePlate || doc.id;
        const normalizedPlate = this._normalizeId(licensePlate);
        vehiclesMap[normalizedPlate] = {
          id: normalizedPlate,
          licensePlate: licensePlate,
          ...data,
          type: data.vehicleType || data.type || 'vehicle',
          collectionSource: 'cars'
        };
      });
      
      // Process trucks
      trucksSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const licensePlate = data.licensePlate || doc.id;
        const normalizedPlate = this._normalizeId(licensePlate);
        vehiclesMap[normalizedPlate] = {
          id: normalizedPlate,
          licensePlate: licensePlate,
          ...data,
          type: data.vehicleType || data.type || 'vehicle',
          collectionSource: 'trucks'
        };
      });
      
      // Process trailers
      trailersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const licensePlate = data.licensePlate || doc.id;
        const normalizedPlate = this._normalizeId(licensePlate);
        vehiclesMap[normalizedPlate] = {
          id: normalizedPlate,
          licensePlate: licensePlate,
          ...data,
          type: data.vehicleType || data.type || 'vehicle',
          collectionSource: 'trailers'
        };
      });
      
      // Process other
      otherSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const licensePlate = data.licensePlate || doc.id;
        const normalizedPlate = this._normalizeId(licensePlate);
        vehiclesMap[normalizedPlate] = {
          id: normalizedPlate,
          licensePlate: licensePlate,
          ...data,
          type: data.vehicleType || data.type || 'vehicle',
          collectionSource: 'other'
        };
      });

      return vehiclesMap;
    } catch (error) {
      console.error('Error getting all vehicles:', error);
      return {};
    }
  },

  // Get vehicle info by license plate
  async getVehicleInfo(licensePlate) {
    if (!licensePlate) return null;
    
    const normalizedPlate = this._normalizeId(licensePlate);
    
    try {
      // Try each collection
      const collections = [
        { name: 'cars', ref: this._flotilaCarsCollection() },
        { name: 'trucks', ref: this._flotilaTrucksCollection() },
        { name: 'trailers', ref: this._flotilaTrailersCollection() },
        { name: 'other', ref: this._flotilaOtherCollection() }
      ];

      for (const { name, ref } of collections) {
        const doc = await ref.doc(normalizedPlate).get();
        if (doc.exists) {
          const data = doc.data();
          // Get current kilometers
          const kms = await this.getAllVehicleKms();
          return {
            ...data,
            licensePlate: data.licensePlate || normalizedPlate,
            kilometers: kms[normalizedPlate] || data.kilometers || data.currentKm || 0,
            services: data.services || [],
            collectionSource: name
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting vehicle info:', error);
      return null;
    }
  },

  // Calculate next service date/km based on last service, interval, current km, and type
  // timeUnit parameter: 'years', 'months', 'days' (optional, defaults based on type)
  calculateNextService(lastService, interval, currentKm, type, timeUnit = null) {
    if (!lastService) return null;

    // Normalize type - can be 'km', 'date', 'specificDate', or old format 'unit' values
    const serviceType = (type || '').toLowerCase();
    const isKmBased = serviceType === 'km';
    const isSpecificDate = serviceType === 'specificdate';
    
    if (isKmBased) {
      // KM-based service
      if (!interval) return null;
      
      const lastKm = (typeof lastService === 'object' && lastService.km !== undefined) 
        ? lastService.km 
        : (typeof lastService === 'number' ? lastService : 0);
      
      const intervalNum = typeof interval === 'number' ? interval : parseInt(interval) || 0;
      const nextKm = lastKm + intervalNum;
      const remainingKm = nextKm - (currentKm || 0);
      
      return {
        nextKm: nextKm,
        remainingKm: remainingKm,
        isOverdue: remainingKm < 0
      };
    } else {
      // Date-based service
      let targetDate = null;
      
      if (isSpecificDate) {
        // For specificDate, the lastService.date is the target date itself
        if (typeof lastService === 'object' && lastService.date) {
          targetDate = new Date(lastService.date);
        } else if (typeof lastService === 'string') {
          targetDate = new Date(lastService);
        } else if (lastService instanceof Date) {
          targetDate = lastService;
        }
      } else {
        // For regular date-based services, calculate from lastDate + interval
        if (!interval) return null;
        
        let lastDate = null;
        if (typeof lastService === 'object' && lastService.date) {
          lastDate = new Date(lastService.date);
        } else if (typeof lastService === 'string') {
          lastDate = new Date(lastService);
        } else if (lastService instanceof Date) {
          lastDate = lastService;
        }

        if (!lastDate || isNaN(lastDate.getTime())) {
          return null;
        }

        // Determine timeUnit from parameter or infer from type
        let finalTimeUnit = timeUnit;
        if (!finalTimeUnit) {
          if (serviceType === 'year' || serviceType.includes('year')) {
            finalTimeUnit = 'years';
          } else if (serviceType === 'month' || serviceType.includes('month')) {
            finalTimeUnit = 'months';
          } else if (serviceType === 'day' || serviceType.includes('day')) {
            finalTimeUnit = 'days';
          } else {
            finalTimeUnit = 'days'; // Default to days
          }
        }

        const intervalNum = typeof interval === 'number' ? interval : parseInt(interval) || 0;
        if (isNaN(intervalNum) || intervalNum <= 0) {
          return null;
        }

        // Use proper date arithmetic based on timeUnit (like Flotila module does)
        targetDate = new Date(lastDate);
        if (finalTimeUnit === 'years') {
          targetDate.setFullYear(targetDate.getFullYear() + intervalNum);
        } else if (finalTimeUnit === 'months') {
          targetDate.setMonth(targetDate.getMonth() + intervalNum);
        } else {
          // days (default)
          targetDate.setDate(targetDate.getDate() + intervalNum);
        }
      }
      
      if (!targetDate || isNaN(targetDate.getTime())) {
        return null;
      }
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const targetDateOnly = new Date(targetDate);
      targetDateOnly.setHours(0, 0, 0, 0);
      
      const diffTime = targetDateOnly - today;
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return {
        nextDate: targetDate,
        daysRemaining: daysRemaining,
        isOverdue: daysRemaining < 0
      };
    }
  }
};

// Expose on window so other modules can reuse it
if (!window.DatabaseService) {
  window.DatabaseService = DatabaseService;
} else {
  // Merge in case something else already created partial DatabaseService
  Object.assign(window.DatabaseService, DatabaseService);
}

