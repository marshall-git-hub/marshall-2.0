const LOW_THRESHOLD = 5;
const SECTION_DEFINITIONS = [
    {
        id: 'olejove',
        title: 'Olejové filtre',
        subcategories: [
            { id: 'olejove', title: 'Olejové filtre' }
        ]
    },
    {
        id: 'vzduchove',
        title: 'Vzduchové filtre',
        subcategories: [
            { id: 'vzduchove', title: 'Vzduchové filtre' }
        ]
    },
    {
        id: 'naftove',
        title: 'Naftové filtre',
        subcategories: [
            { id: 'naftove', title: 'Naftové filtre' }
        ]
    },
    {
        id: 'kabinove',
        title: 'Kabínové filtre',
        subcategories: [
            { id: 'kabinove', title: 'Kabínové filtre' }
        ]
    },
    {
        id: 'adblue',
        title: 'Adblue filtre',
        subcategories: [
            { id: 'adblue', title: 'Adblue filtre' }
        ]
    },
    {
        id: 'vysusac-vzduchu',
        title: 'Vysušače vzduchu',
        subcategories: [
            { id: 'vysusac-vzduchu', title: 'Vysušače vzduchu' }
        ]
    },
    {
        id: 'brzd-platnicky',
        title: 'Brzdové platničky',
        subcategories: [
            { id: 'brzd-platnicky', title: 'Brzdové platničky' }
        ]
    },
    {
        id: 'brzd-kotuce',
        title: 'Brzdové kotúče',
        subcategories: [
            { id: 'brzd-kotuce', title: 'Brzdové kotúče' }
        ]
    },
    {
        id: 'brzd-valce',
        title: 'Brzdové valce',
        subcategories: [
            { id: 'brzd-valce', title: 'Brzdové valce' }
        ]
    },
    {
        id: 'ostatne',
        title: 'Ostatné',
        subcategories: [
            { id: 'ostnane', title: 'Ostatné' },
            { id: 'ostatne', title: 'Ostatné' }
        ]
    }
];

const elements = {
    container: document.getElementById('diely-sections'),
    modal: document.getElementById('adjust-modal'),
    modalTitle: document.getElementById('modal-title'),
    amountInput: document.getElementById('adjust-amount'),
    form: document.getElementById('adjust-form'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    quickButtons: document.querySelectorAll('.chip-row button'),
    createForm: document.getElementById('create-diel-form'),
    createMessage: document.getElementById('create-diel-message'),
    createButton: document.getElementById('create-diel-submit'),
    createModal: document.getElementById('create-modal'),
    closeCreateModalBtn: document.getElementById('close-create-modal'),
    openCreateModalBtn: document.getElementById('open-create-modal')
};

let diely = [];
let activeDiel = null;

function getSectionTitle(sectionId) {
    return SECTION_DEFINITIONS.find(sec => sec.id === sectionId)?.title || sectionId;
}

function getSubcategoryTitle(sectionId, subcategoryId) {
    const section = SECTION_DEFINITIONS.find(sec => sec.id === sectionId);
    if (!section) return subcategoryId;
    const subcategory = section.subcategories.find(sub => sub.id === subcategoryId);
    return subcategory?.title || subcategoryId;
}

function normaliseDiel(doc) {
    return {
        ...doc,
        quantity: typeof doc.quantity === 'number' ? doc.quantity : 0,
        category: doc.category || 'olejove'
    };
}

function getSectionForCategory(categoryId) {
    for (const section of SECTION_DEFINITIONS) {
        if (section.subcategories.some(sub => sub.id === categoryId)) {
            return section.id;
        }
    }
    // If category doesn't match any known section, return 'ostatne'
    return 'ostatne';
}

async function subscribeToDiely() {
    if (!window.DatabaseService || typeof window.DatabaseService.onDielyUpdate !== 'function') {
        console.error('DatabaseService pre diely nie je dostupný.');
        elements.container.innerHTML = `<div class="empty-state">Chýba pripojenie k databáze. Skontrolujte načítanie súboru <code>diely-database.js</code>.</div>`;
        return;
    }

    await window.DatabaseService.onDielyUpdate(snapshot => {
        diely = snapshot.map(normaliseDiel);
        renderSections();
    });
}

function renderSections() {
    if (!diely.length) {
        elements.container.innerHTML = `<div class="empty-state">V databáze zatiaľ nemáte žiadne položky. Kliknite na tlačidlo „Pridať diel" a doplňte prvú zásobu.</div>`;
        return;
    }

    // Get all known category IDs for filtering
    const knownCategories = new Set();
    SECTION_DEFINITIONS.forEach(section => {
        section.subcategories.forEach(sub => {
            knownCategories.add(sub.id);
        });
    });

    const sectionsHtml = SECTION_DEFINITIONS.map(section => {
        // Collect all items for this section
        const sectionItems = [];
        
        if (section.id === 'ostatne') {
            // For "ostatne" section, include items that don't match any known category
            // or are specifically marked as "ostnane" or "ostatne"
            diely.forEach(diel => {
                if (!knownCategories.has(diel.category) || 
                    diel.category === 'ostnane' || 
                    diel.category === 'ostatne') {
                    sectionItems.push(diel);
                }
            });
        } else {
            // For regular sections, find items matching any subcategory in this section
            diely.forEach(diel => {
                if (section.subcategories.some(sub => sub.id === diel.category)) {
                    sectionItems.push(diel);
                }
            });
        }

        // Remove duplicates by ID
        const uniqueItems = Array.from(new Map(sectionItems.map(item => [item.id, item])).values());

        const cards = uniqueItems.length
            ? uniqueItems.map(renderDielCard).join('')
            : `<div class="empty-state">V tejto sekcii zatiaľ nič nie je.</div>`;

        return `
            <article class="section-card">
                <div class="section-header">
                    <h2>${section.title}</h2>
                </div>
                <div class="diel-list">
                    ${cards}
                </div>
            </article>
        `;
    }).join('');

    elements.container.innerHTML = sectionsHtml;

    elements.container.querySelectorAll('.diel-card').forEach(card => {
        card.addEventListener('click', () => openModal(card.dataset.id));
    });
}

function setCreateMessage(text, variant = 'success') {
    if (!elements.createMessage) return;
    if (!text) {
        elements.createMessage.hidden = true;
        return;
    }
    elements.createMessage.hidden = false;
    elements.createMessage.dataset.variant = variant;
    elements.createMessage.textContent = text;
}

function setCreateLoading(isLoading) {
    if (!elements.createButton) return;
    if (!elements.createButton.dataset.defaultLabel) {
        elements.createButton.dataset.defaultLabel = elements.createButton.textContent.trim();
    }
    elements.createButton.disabled = isLoading;
    elements.createButton.textContent = isLoading ? 'Ukladám...' : elements.createButton.dataset.defaultLabel;
}

function renderDielCard(item) {
    const isLow = item.quantity < LOW_THRESHOLD;
    return `
        <div class="diel-card ${isLow ? 'low' : ''}" data-id="${item.id}">
            <div class="diel-info">
                <h3>${item.name}</h3>
                <span class="status-pill ${isLow ? 'low' : 'ok'}">
                    ${isLow ? 'Nedostatok' : 'Dostatok'}
                </span>
            </div>
            <div class="quantity-badge">
                ${item.quantity} ks
            </div>
        </div>
    `;
}

function openModal(dielId) {
    activeDiel = diely.find(diel => diel.id === dielId);
    if (!activeDiel) return;
    elements.modalTitle.textContent = activeDiel.name;
    elements.amountInput.value = '';
    elements.modal.classList.add('active');
    elements.modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
    elements.modal.classList.remove('active');
    elements.modal.setAttribute('aria-hidden', 'true');
    activeDiel = null;
}

async function applyAdjustment(amount, type) {
    if (!activeDiel || !window.DatabaseService?.adjustDielQuantity) return;
    
    const normalized = Math.max(0, Math.floor(amount)); // Round down for pieces
    const delta = type === 'remove' ? -normalized : normalized;
    try {
        await window.DatabaseService.adjustDielQuantity(activeDiel.id, activeDiel.category, delta);
    } catch (error) {
        console.error('Chyba pri úprave zásoby:', error);
        if (error.message === 'AUTH_REQUIRED') {
            alert('Chyba pri autentifikácii. Skúste to znova.');
        } else {
            alert('Úprava zásoby zlyhala. Skúste to znova.');
        }
    }
}

async function handleCreateDiel(event) {
    event.preventDefault();
    if (!elements.createForm) return;

    if (!window.DatabaseService?.createDiel) {
        setCreateMessage('Chýba napojenie na databázu. Skontrolujte konfiguráciu.', 'error');
        return;
    }

    const formData = new FormData(elements.createForm);
    const name = (formData.get('name') || '').trim();
    const subcategory = (formData.get('subcategory') || 'olejove').trim();
    
    // Note: subcategory is now the category ID directly
    const quantityValue = parseInt(formData.get('quantity'), 10);

    if (!name) {
        setCreateMessage('Zadajte názov položky.', 'error');
        return;
    }

    if (isNaN(quantityValue) || quantityValue < 0) {
        setCreateMessage('Zadajte platné množstvo.', 'error');
        return;
    }

    setCreateMessage('');
    setCreateLoading(true);

    try {
        await window.DatabaseService.createDiel({
            name,
            category: subcategory,
            quantity: Math.max(0, quantityValue)
        });
        elements.createForm.reset();
        setCreateMessage('Položka bola pridaná.', 'success');
        closeCreateModal();
    } catch (error) {
        console.error('Chyba pri vytváraní položky:', error);
        if (error.message === 'AUTH_REQUIRED') {
            setCreateMessage('Chyba pri autentifikácii. Skúste to znova.', 'error');
        } else {
            setCreateMessage('Nepodarilo sa uložiť položku. Skúste to znova.', 'error');
        }
    } finally {
        setCreateLoading(false);
    }
}

function openCreateModal() {
    if (!elements.createModal) return;
    elements.createModal.classList.add('active');
    elements.createModal.setAttribute('aria-hidden', 'false');
    setCreateMessage('');
    updateSubcategoryOptions();
}

function closeCreateModal() {
    if (!elements.createModal) return;
    elements.createModal.classList.remove('active');
    elements.createModal.setAttribute('aria-hidden', 'true');
    setCreateMessage('');
}

function updateSubcategoryOptions() {
    // No longer needed since we removed the section dropdown
    // All categories are now directly selectable
    const subcategorySelect = document.getElementById('diel-subcategory');
    if (!subcategorySelect) return;
    
    // Build options from all sections
    const allCategories = [];
    SECTION_DEFINITIONS.forEach(section => {
        section.subcategories.forEach(sub => {
            if (!allCategories.find(cat => cat.id === sub.id)) {
                allCategories.push({ id: sub.id, title: sub.title });
            }
        });
    });
    
    subcategorySelect.innerHTML = allCategories.map(cat => 
        `<option value="${cat.id}">${cat.title}</option>`
    ).join('');
}

async function waitForAuthenticatedUser() {
    // If user is already authenticated, return immediately
    if (window.auth && window.auth.currentUser) {
        return;
    }
    
    // Wait for user to be authenticated (HTML already redirects if not)
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('AUTH_TIMEOUT'));
        }, 10000); // 10 second timeout
        
        const unsubscribe = window.auth.onAuthStateChanged((user) => {
            if (user) {
                clearTimeout(timeout);
                unsubscribe();
                resolve();
            }
        });
    });
}

function bindEvents() {
    elements.form.addEventListener('submit', async event => {
        event.preventDefault();
        const amount = parseInt(elements.amountInput.value, 10);
        if (isNaN(amount) || amount < 0) {
            alert('Zadajte množstvo v kusoch.');
            return;
        }
        const type = elements.form.querySelector('input[name="adjust-type"]:checked').value;
        await applyAdjustment(amount, type);
        closeModal();
    });

    elements.closeModalBtn.addEventListener('click', closeModal);
    elements.modal.addEventListener('click', event => {
        if (event.target === elements.modal) closeModal();
    });

    elements.quickButtons.forEach(button => {
        button.addEventListener('click', () => {
            const amount = parseInt(button.dataset.amount, 10);
            elements.amountInput.value = amount;
            elements.form.querySelector('input[value="remove"]').checked = true;
        });
    });

    if (elements.createForm) {
        elements.createForm.addEventListener('submit', handleCreateDiel);
    }

    elements.openCreateModalBtn?.addEventListener('click', () => {
        elements.createForm?.reset();
        openCreateModal();
    });

    elements.closeCreateModalBtn?.addEventListener('click', closeCreateModal);
    elements.createModal?.addEventListener('click', (event) => {
        if (event.target === elements.createModal) {
            closeCreateModal();
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    // Initialize subcategory options
    updateSubcategoryOptions();
    try {
        await waitForAuthenticatedUser();
    } catch (error) {
        console.error('Chyba pri čakaní na autentifikáciu:', error);
        return;
    }
    await subscribeToDiely();
});
