// Debug function to test services loading
async function debugServices() {
  try {
    console.log('Testing services loading...');
    
    // Test if we can load services
    const response = await fetch('../servis_data/services.json');
    if (!response.ok) {
      console.error('Cannot load services.json:', response.status);
      return;
    }
    
    const data = await response.json();
    console.log('Services loaded successfully:', Object.keys(data).length, 'vehicles');
    
    const aa466Services = data['AA 466 SN'];
    if (aa466Services) {
      console.log('AA 466 SN has', aa466Services.length, 'services');
      console.log('First service:', aa466Services[0]);
    } else {
      console.log('No services found for AA 466 SN');
    }
    
    // Test database connection
    if (typeof window.db !== 'undefined') {
      console.log('Database connection available');
      
      // Try to read existing services
      const servicesRef = window.db.collection('vehicles').doc('AA 466 SN').collection('services');
      const snapshot = await servicesRef.get();
      console.log('Existing services in database:', snapshot.size);
      
    } else {
      console.error('Database connection not available');
    }
    
  } catch (error) {
    console.error('Debug error:', error);
  }
}

// Make it available globally
window.debugServices = debugServices;
console.log('Debug function created. Run: debugServices()');
