// Navbar functionality - Load navbar dynamically and highlight current page


// Function to load navbar and highlight current page
function loadNavbar() {
  
  // Determine the correct path to navbar.html based on current location
  let navbarPath = 'navbar/navbar.html';
  const pathname = window.location.pathname;
  
  // Handle different module paths
  if (pathname.includes('/modules/servis/')) {
    navbarPath = '../../../shared/ui/navbar/navbar.html';
  } else if (pathname.includes('/modules/flotila/')) {
    navbarPath = '../../../shared/ui/navbar/navbar.html';
  } else if (pathname.includes('/modules/pnue/')) {
    navbarPath = '../../../shared/ui/navbar/navbar.html';
  } else if (pathname.includes('/servis/') || 
      pathname.includes('/flotila/') || 
      pathname.includes('/pneu/')) {
    navbarPath = '../navbar/navbar.html';
  }
  
  
  fetch(navbarPath)
    .then(res => res.text())
    .then(html => {
      document.getElementById("navbar").innerHTML = html;
      
      // Highlight current page
      const links = document.querySelectorAll("#navbar .nav-btn");
      const currentUrl = window.location.href;
      
      links.forEach(link => {
        if (link.href === currentUrl) {
          link.classList.add("active");
        }
      });
      
      // Add logout functionality
      setupLogoutButton();
    })
    .catch(error => {
      // Error loading navbar
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
        }
        
        // Redirect to main page after logout
        window.location.href = '/index.html';
      } catch (error) {
        // Logout error
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

