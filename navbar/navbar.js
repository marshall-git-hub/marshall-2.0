// Navbar functionality - Load navbar dynamically and highlight current page


// Function to load navbar and highlight current page
function loadNavbar() {
  console.log('🔄 Loading navbar...');
  
  // Determine the correct path to navbar.html based on current location
  let navbarPath = 'navbar/navbar.html';
  if (window.location.pathname.includes('/servis/') || 
      window.location.pathname.includes('/flotila/') || 
      window.location.pathname.includes('/pneu/')) {
    navbarPath = '../navbar/navbar.html';
  }
  
  console.log('📁 Loading navbar from:', navbarPath);
  
  fetch(navbarPath)
    .then(res => res.text())
    .then(html => {
      console.log('✅ Navbar HTML loaded');
      document.getElementById("navbar").innerHTML = html;
      
      // Highlight current page
      const links = document.querySelectorAll("#navbar .nav-btn");
      const currentUrl = window.location.href;
      console.log('🔍 Current URL:', currentUrl);
      console.log('🔍 Found nav links:', links.length);
      
      links.forEach(link => {
        console.log('🔗 Checking link:', link.href);
        if (link.href === currentUrl) {
          console.log('✅ Found matching link, adding active class');
          link.classList.add("active");
        }
      });
      
      // Add logout functionality
      setupLogoutButton();
    })
    .catch(error => {
      console.error("❌ Error loading navbar:", error);
    });
}

// Function to setup logout button functionality
function setupLogoutButton() {
  const logoutBtn = document.getElementById('navbar-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function() {
      try {
        // Check if Firebase auth is available
        if (typeof firebase !== 'undefined' && firebase.auth) {
          await firebase.auth().signOut();
          console.log('User logged out successfully');
        }
        
        // Redirect to main page after logout
        window.location.href = '/index.html';
      } catch (error) {
        console.error('Logout error:', error);
        // Fallback: redirect to main page anyway
        window.location.href = '/index.html';
      }
    });
  }
}

// Load navbar when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  loadNavbar();
});

