// Optional: Highlight active nav button based on current path
const navLinks = document.querySelectorAll('.sidebar-nav .nav-btn');
const current = window.location.pathname;
navLinks.forEach(link => {
  if (link.getAttribute('href') && current.includes(link.getAttribute('href').replace('..',''))) {
    link.classList.add('active');
  }
  
  // Prevent navigation to current page
  link.addEventListener('click', (e) => {
    const href = link.getAttribute('href');
    if (href && current.includes(href.replace('..',''))) {
      e.preventDefault();
      return false;
    }
  });
});
