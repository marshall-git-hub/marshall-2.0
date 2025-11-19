(function initMarshallLogin(){
  const loginForm = document.getElementById('loginForm');
  const companyForm = document.getElementById('companyForm');
  const loginMessage = document.getElementById('loginMessage');
  const companyMessage = document.getElementById('companyMessage');
  const toggleButtons = document.querySelectorAll('[data-pane-target]');
  const panes = document.querySelectorAll('.login-pane[data-pane]');

  function setMessage(el, text, variant = 'error') {
    if (!el) return;
    el.textContent = text || '';
    el.dataset.variant = variant;
    el.hidden = !text;
  }

  function activatePane(target) {
    if (!target) return;
    toggleButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.paneTarget === target);
    });
    panes.forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.pane === target);
    });
  }

  if (toggleButtons.length) {
    toggleButtons.forEach((button) => {
      button.addEventListener('click', () => activatePane(button.dataset.paneTarget));
    });
    activatePane('email');
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage(loginMessage, '');
      const email = (loginForm.email?.value || '').trim();
      const password = (loginForm.password?.value || '').trim();

      if (!email || !password) {
        setMessage(loginMessage, 'Zadajte email aj heslo.');
        return;
      }

      if (!window.AuthService) {
        setMessage(loginMessage, 'Autentifikačná služba nie je pripravená.');
        return;
      }

      try {
        await window.AuthService.login(email, password);
        sessionStorage.removeItem('marshallCompanySession');
        setMessage(loginMessage, 'Prihlásenie úspešné. Presmerovanie...', 'success');
        setTimeout(() => {
          window.location.href = '../dashboard/index.html';
        }, 800);
      } catch (error) {
        console.error('Email login failed', error);
        const msg = error?.message || 'Prihlásenie zlyhalo. Skúste znova.';
        setMessage(loginMessage, msg);
      }
    });
  }

  if (companyForm) {
    companyForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage(companyMessage, '');
      const code = companyForm.companyCode.value.trim();

      try {
        const session = await window.CompanyCodeAccess.verify(code);

        const payload = {
          token: session.token,
          code: session.code,
          module: session.module,
          driver: session.driver,
          truck_spz: session.truck_spz,
          trailer_spz: session.trailer_spz,
          issuedAt: Date.now()
        };

        sessionStorage.setItem('marshallCompanySession', JSON.stringify(payload));
        setMessage(companyMessage, 'Prístup udelený. Presmerovanie...', 'success');
        setTimeout(() => {
          window.location.href = '../../modules/cestaky/ui/index.html';
        }, 600);
      } catch (error) {
        console.error('Company code error', error);
        let message = 'Nesprávny alebo expirovaný kód.';

        if (error.message === 'EMPTY_CODE') {
          message = 'Zadajte prístupový kód.';
        } else if (error.message === 'MODULE_NOT_ALLOWED') {
          message = 'Tento kód nepovoľuje modul Cestáky.';
        }

        setMessage(companyMessage, message);
      }
    });
  }
})();
