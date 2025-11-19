(function setupCompanyCodeAccess() {
  if (window.CompanyCodeAccess) {
    return;
  }

  const COLLECTION = 'DRIVERS_LOG';
  const DOCUMENT = 'accessCodes';
  const DRIVERS_COLLECTION = 'drivers';
  const DEFAULT_MODULE = 'cestaky';

  function ensureFirebase() {
    if (!window.firebaseInitialized || !window.db || !window.auth) {
      throw new Error('FIREBASE_NOT_READY');
    }
  }

  function normalizeCode(code) {
    return (code || '').trim();
  }

  function normalizePassword(value) {
    return (value || '').toString().trim().toUpperCase();
  }

  async function fetchDriverEntries() {
    ensureFirebase();
    if (!window.AuthService || !window.AuthService.ensureAnonymousSession) {
      throw new Error('AUTH_SERVICE_MISSING');
    }

    await window.AuthService.ensureAnonymousSession();

    const snapshot = await window.db
      .collection(COLLECTION)
      .doc(DOCUMENT)
      .collection(DRIVERS_COLLECTION)
      .get();

    if (snapshot.empty) {
      throw new Error('ACCESS_CODES_MISSING');
    }

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
  }

  async function verify(code) {
    const trimmedCode = normalizeCode(code);
    if (!trimmedCode) {
      throw new Error('EMPTY_CODE');
    }

    const normalizedCode = normalizePassword(trimmedCode);
    const entries = await fetchDriverEntries();
    const entry = entries.find((item) => normalizePassword(item.password) === normalizedCode);

    if (!entry) {
      throw new Error('INVALID_CODE');
    }

    return {
      code: normalizedCode,
      module: DEFAULT_MODULE,
      token: entry.token || normalizedCode,
      driver: entry.driver || entry.id || entry.name || entry.driver_name || 'NEZNAMY_VODIC',
      truck_spz: entry.truck_spz || null,
      trailer_spz: entry.trailer_spz || null,
      issuedAt: Date.now()
    };
  }

  window.CompanyCodeAccess = {
    verify
  };
})();


