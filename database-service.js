// DatabaseService and AuthService global definitions for all pages
// Requires firebase-config.js to be loaded first

window.DatabaseService = {
  // Tires
  async getTires() {
    const snapshot = await window.db.collection('tires').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },
  onTiresUpdate(callback) {
    window.db.collection('tires').onSnapshot(snapshot => {
      const tires = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(tires);
    });
  },
  async updateTire(id, data) {
    await window.db.collection('tires').doc(id).update(data);
  },

  // Trucks
  async getTrucks() {
    const snapshot = await window.db.collection('trucks').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },
  onTrucksUpdate(callback) {
    window.db.collection('trucks').onSnapshot(snapshot => {
      const trucks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(trucks);
    });
  },

  // Trailers
  async getTrailers() {
    const snapshot = await window.db.collection('trailers').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },
  onTrailersUpdate(callback) {
    window.db.collection('trailers').onSnapshot(snapshot => {
      const trailers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(trailers);
    });
  },

  // Vehicle KMs
  async getAllVehicleKms() {
  const snapshot = await window.db.collection('vehicles_km').get();
  // Return as object for fast lookup
  const kms = {};
  snapshot.docs.forEach(doc => { kms[doc.id] = doc.data().kilometers; });
  return kms;
  },
  onAllVehicleKmsUpdate(callback) {
    window.db.collection('vehicles_km').onSnapshot(snapshot => {
      const kms = {};
      snapshot.docs.forEach(doc => { kms[doc.id] = doc.data().kilometers; });
      callback(kms);
    });
  },
  async getVehicleKm(vehicleId) {
  const doc = await window.db.collection('vehicles_km').doc(vehicleId).get();
  return doc.exists ? doc.data().kilometers : null;
  },
  onVehicleKmUpdate(vehicleId, callback) {
    window.db.collection('vehicles_km').doc(vehicleId).onSnapshot(doc => {
      const data = doc.data();
      callback(data ? data.kilometers : null);
    });
  },

  // Tire Slots
  async getAllTireSlots(type) {
    const snapshot = await window.db.collection(type + '_slots').get();
    // Return as object for fast lookup
    const slots = {};
    snapshot.docs.forEach(doc => { slots[doc.id] = doc.data().slots; });
    return slots;
  },
  async getTireSlots(type, id) {
    const doc = await window.db.collection(type + '_slots').doc(id).get();
    return doc.exists ? doc.data().slots : null;
  },
  onTireSlotsUpdate(type, id, callback) {
    window.db.collection(type + '_slots').doc(id).onSnapshot(doc => {
      const data = doc.data();
      callback(data ? data.slots : []);
    });
  },
  async updateTireSlots(type, id, slots) {
    await window.db.collection(type + '_slots').doc(id).set({ slots });
  },

    async logTireHistory({ vehicleId, position, removedTire, installedTire, vehicleKm }) {
      await window.db.collection('tire_history').add({
        vehicleId,
        position,
        removedTire,
        installedTire,
        vehicleKm,
        date: new Date().toISOString()
      });
    },

  // Add methods for history page as needed
  async getTireChangeHistory(vehicleId) {
    const snapshot = await window.db.collection('tire_history').where('vehicleId', '==', vehicleId).get();
    return snapshot.docs.map(doc => doc.data());
  },
  async addTruck(data) {
    await window.db.collection('trucks').add(data);
  },
  async addTrailer(data) {
    await window.db.collection('trailers').add(data);
  },

  // Flotila Management System - Vehicle Services
  async getVehicleInfo(licensePlate) {
    try {
      const doc = await window.db.collection('vehicles')
        .doc(licensePlate)
        .collection('info')
        .doc('basic')
        .get();
      
      if (doc.exists) {
        return doc.data();
      }
      return null;
    } catch (error) {
      console.error('Error getting vehicle info:', error);
      throw error;
    }
  },

  async getVehicleHistory(licensePlate) {
    try {
      const snapshot = await window.db.collection('vehicles')
        .doc(licensePlate)
        .collection('history')
        .orderBy('date', 'desc')
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error getting vehicle history:', error);
      throw error;
    }
  },

  async getUpcomingServices(licensePlate) {
    try {
      const snapshot = await window.db.collection('vehicles')
        .doc(licensePlate)
        .collection('upcoming')
        .orderBy('createdAt', 'desc')
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error getting upcoming services:', error);
      throw error;
    }
  },

  async getDiagnostics(licensePlate) {
    try {
      const snapshot = await window.db.collection('vehicles')
        .doc(licensePlate)
        .collection('diagnostics')
        .orderBy('date', 'desc')
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error getting diagnostics:', error);
      throw error;
    }
  },

  async saveVehicleInfo(licensePlate, vehicleData) {
    try {
      await window.db.collection('vehicles')
        .doc(licensePlate)
        .collection('info')
        .doc('basic')
        .set(vehicleData);
      
      return true;
    } catch (error) {
      console.error('Error saving vehicle info:', error);
      throw error;
    }
  },

  async addHistoryEntry(licensePlate, historyData) {
    try {
      const docRef = await window.db.collection('vehicles')
        .doc(licensePlate)
        .collection('history')
        .add({
          ...historyData,
          date: new Date(),
          createdAt: new Date()
        });
      
      return docRef.id;
    } catch (error) {
      console.error('Error adding history entry:', error);
      throw error;
    }
  },

  async addUpcomingService(licensePlate, serviceData) {
    try {
      const docRef = await window.db.collection('vehicles')
        .doc(licensePlate)
        .collection('upcoming')
        .add({
          ...serviceData,
          createdAt: new Date()
        });
      
      return docRef.id;
    } catch (error) {
      console.error('Error adding upcoming service:', error);
      throw error;
    }
  },

  async updateUpcomingService(licensePlate, serviceId, serviceData) {
    try {
      await window.db.collection('vehicles')
        .doc(licensePlate)
        .collection('upcoming')
        .doc(serviceId)
        .update({
          ...serviceData,
          updatedAt: new Date()
        });
      
      return true;
    } catch (error) {
      console.error('Error updating upcoming service:', error);
      throw error;
    }
  },

  async deleteUpcomingService(licensePlate, serviceId) {
    try {
      await window.db.collection('vehicles')
        .doc(licensePlate)
        .collection('upcoming')
        .doc(serviceId)
        .delete();
      
      return true;
    } catch (error) {
      console.error('Error deleting upcoming service:', error);
      throw error;
    }
  },

  async addDiagnosticEntry(licensePlate, diagnosticData) {
    try {
      const docRef = await window.db.collection('vehicles')
        .doc(licensePlate)
        .collection('diagnostics')
        .add({
          ...diagnosticData,
          date: new Date(),
          createdAt: new Date()
        });
      
      return docRef.id;
    } catch (error) {
      console.error('Error adding diagnostic entry:', error);
      throw error;
    }
  },

  async getAllVehicles() {
    try {
      const snapshot = await window.db.collection('vehicles').get();
      const vehicles = {};
      
      for (const doc of snapshot.docs) {
        const licensePlate = doc.id;
        const infoDoc = await window.db.collection('vehicles')
          .doc(licensePlate)
          .collection('info')
          .doc('basic')
          .get();
        
        if (infoDoc.exists) {
          vehicles[licensePlate] = {
            licensePlate,
            ...infoDoc.data()
          };
        }
      }
      
      return vehicles;
    } catch (error) {
      console.error('Error getting all vehicles:', error);
      throw error;
    }
  },

  calculateNextService(lastService, interval, currentKm, type) {
    if (type === 'km') {
      const lastKm = lastService.km || 0;
      const nextKm = lastKm + interval;
      const remainingKm = nextKm - currentKm;
      
      return {
        nextKm,
        remainingKm,
        status: remainingKm <= 0 ? 'overdue' : (remainingKm <= 5000 ? 'urgent' : 'pending'),
        value: remainingKm > 0 ? `+${remainingKm}` : `${remainingKm}`
      };
    } else if (type === 'date') {
      const lastDate = new Date(lastService.date);
      const nextDate = new Date(lastDate.getTime() + (interval * 24 * 60 * 60 * 1000)); // interval in days
      const today = new Date();
      const daysRemaining = Math.ceil((nextDate - today) / (24 * 60 * 60 * 1000));
      
      return {
        nextDate,
        daysRemaining,
        status: daysRemaining <= 0 ? 'overdue' : (daysRemaining <= 30 ? 'urgent' : 'pending'),
        value: daysRemaining > 0 ? `+${daysRemaining}d` : `${daysRemaining}d`
      };
    }
    
    return null;
  },

  async getServicesWithCalculations(licensePlate) {
    try {
      const vehicleInfo = await this.getVehicleInfo(licensePlate);
      if (!vehicleInfo || !vehicleInfo.services) {
        return [];
      }

      const currentKm = vehicleInfo.kilometers || 0;
      const servicesWithCalculations = [];

      for (const service of vehicleInfo.services) {
        if (service.lastService) {
          const calculation = this.calculateNextService(
            service.lastService,
            service.interval,
            currentKm,
            service.type
          );
          
          servicesWithCalculations.push({
            ...service,
            ...calculation
          });
        } else {
          // If no last service, show as pending with interval
          servicesWithCalculations.push({
            ...service,
            status: 'pending',
            value: service.type === 'km' ? `+${service.interval}` : `+${service.interval}d`
          });
        }
      }

      return servicesWithCalculations;
    } catch (error) {
      console.error('Error getting services with calculations:', error);
      throw error;
    }
  },

  async updateVehicleKilometers(licensePlate, kilometers) {
    try {
      await window.db.collection('vehicles')
        .doc(licensePlate)
        .collection('info')
        .doc('basic')
        .update({
          kilometers: kilometers,
          updatedAt: new Date()
        });
      
      return true;
    } catch (error) {
      console.error('Error updating vehicle kilometers:', error);
      throw error;
    }
  },

  async completeService(licensePlate, serviceName, completedData) {
    try {
      // Add to history
      await this.addHistoryEntry(licensePlate, {
        serviceName,
        ...completedData
      });

      // Update the last service in vehicle info
      const vehicleInfo = await this.getVehicleInfo(licensePlate);
      if (vehicleInfo && vehicleInfo.services) {
        const serviceIndex = vehicleInfo.services.findIndex(s => s.name === serviceName);
        if (serviceIndex !== -1) {
          vehicleInfo.services[serviceIndex].lastService = {
            date: new Date(),
            km: completedData.kilometers || vehicleInfo.kilometers
          };
          
          await this.saveVehicleInfo(licensePlate, vehicleInfo);
        }
      }

      return true;
    } catch (error) {
      console.error('Error completing service:', error);
      throw error;
    }
  }
};

window.AuthService = {
  login(email, password) {
    return window.auth.signInWithEmailAndPassword(email, password);
  },
  logout() {
    return window.auth.signOut();
  },
  onAuthStateChanged(callback) {
    return window.auth.onAuthStateChanged(callback);
  },
  getCurrentUser() {
    return window.auth.currentUser;
  }
};
