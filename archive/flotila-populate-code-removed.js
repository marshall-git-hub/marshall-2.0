// REMOVED CODE FROM flotila.js - populateRealData method
// This code was removed but saved here for potential future use
// Date removed: 2025-11-05

// Event listener in bindEvents() method (around line 192):
/*
    document.getElementById('populate-real-data-btn')?.addEventListener('click', () => {
      this.populateRealData();
    });
*/

// Method definition (originally around lines 3826-3880):
async populateRealData() {
  try {
    // Show confirmation dialog
    const confirmed = confirm(
      'Táto akcia naplní databázu skutočnými dátami z ccc.xls súboru.\n\n' +
      'Toto môže prepísať existujúce dáta. Chcete pokračovať?'
    );
    
    if (!confirmed) {
      return;
    }

    // Disable button during processing
    const button = document.getElementById('populate-real-data-btn');
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Spracovávam...';

    // Check if the populate function is available; if not, try to load it dynamically
    if (typeof window.populateRealFlotilaData !== 'function') {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.defer = true;
          script.src = '../populate-flotila-data.js?v=3';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Nepodarilo sa načítať skript populate-flotila-data.js'));
          document.head.appendChild(script);
        });
      } catch (e) {
        throw e;
      }
    }

    if (typeof window.populateRealFlotilaData === 'function') {
      await window.populateRealFlotilaData();
      // Invalidate cache after populating new data
      this.cache.lastUpdated = null;
      await this.loadDataAndRender();
      alert('Databáza bola úspešne naplnená skutočnými dátami!');
    } else {
      throw new Error('Populate function not available. Skúste obnoviť stránku (Ctrl+F5).');
    }
    
  } catch (error) {
    console.error('Error populating real data:', error);
    alert('Chyba pri naplňovaní databázy: ' + error.message);
  } finally {
    // Re-enable button
    const button = document.getElementById('populate-real-data-btn');
    if (button) {
      button.disabled = false;
      // originalText is defined earlier in this function scope
      button.innerHTML = originalText;
    }
  }
}

// HTML Button to remove from flotila/index.html (around line 87-96):
/*
                <button id="populate-real-data-btn" class="populate-data-btn" title="Naplniť databázu skutočnými dátami z ccc.xls">
                  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10,9 9,9 8,9"/>
                  </svg>
                  Naplniť databázu
                </button>
*/

// Script reference to remove from flotila/index.html (around line 21):
/*
  <script defer src="../populate-flotila-data.js?v=4"></script>
*/



