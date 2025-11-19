const LOW_THRESHOLD = 50;
const CATEGORY_DEFINITIONS = [
    { id: 'motorove', title: 'Motorové oleje' },
    { id: 'prevodove', title: 'Prevodové oleje' },
    { id: 'diferencial', title: 'Diferenciálne oleje' },
    { id: 'chladiaca', title: 'Chladiaca kvapalina' }
];

const elements = {
    container: document.getElementById('oil-sections'),
    modal: document.getElementById('adjust-modal'),
    modalTitle: document.getElementById('modal-title'),
    amountInput: document.getElementById('adjust-amount'),
    form: document.getElementById('adjust-form'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    quickButtons: document.querySelectorAll('.chip-row button'),
    createForm: document.getElementById('create-oil-form'),
    createMessage: document.getElementById('create-oil-message'),
    createButton: document.getElementById('create-oil-submit'),
    createModal: document.getElementById('create-modal'),
    closeCreateModalBtn: document.getElementById('close-create-modal'),
    openCreateModalBtn: document.getElementById('open-create-modal')
};

let oils = [];
let activeOil = null;

function getCategoryTitle(categoryId) {
    return CATEGORY_DEFINITIONS.find(cat => cat.id === categoryId)?.title || categoryId;
}

function normaliseOil(doc) {
    return {
        ...doc,
        quantity: typeof doc.quantity === 'number' ? doc.quantity : 0,
        category: doc.category || 'motorove'
    };
}

async function subscribeToOils() {
    if (!window.DatabaseService || typeof window.DatabaseService.onOilsUpdate !== 'function') {
        console.error('DatabaseService pre oleje nie je dostupný.');
        elements.container.innerHTML = `<div class="empty-state">Chýba pripojenie k databáze. Skontrolujte načítanie súboru <code>oil-database.js</code>.</div>`;
        return;
    }

    await window.DatabaseService.onOilsUpdate(snapshot => {
        oils = snapshot.map(normaliseOil);
        renderSections();
    });
}

function renderSections() {
    if (!oils.length) {
        elements.container.innerHTML = `<div class="empty-state">V databáze zatiaľ nemáte žiadne položky. Kliknite na tlačidlo „Pridať olej“ a doplňte prvú zásobu.</div>`;
        return;
    }

    const grouped = CATEGORY_DEFINITIONS.map(category => {
        const items = oils.filter(oil => oil.category === category.id);
        return { ...category, items };
    });

    elements.container.innerHTML = grouped.map(group => {
        const cards = group.items.length
            ? group.items.map(renderOilCard).join('')
            : `<div class="empty-state">V tejto kategórii zatiaľ nič nie je.</div>`;

        return `
            <article class="section-card">
                <div class="section-header">
                    <h2>${group.title}</h2>
                </div>
                <div class="oil-list">
                    ${cards}
                </div>
            </article>
        `;
    }).join('');

    elements.container.querySelectorAll('.oil-card').forEach(card => {
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

function renderOilCard(item) {
    const isLow = item.quantity < LOW_THRESHOLD;
    return `
        <div class="oil-card ${isLow ? 'low' : ''}" data-id="${item.id}">
            <div class="oil-info">
                <h3>${item.name}</h3>
                <span class="status-pill ${isLow ? 'low' : 'ok'}">
                    ${isLow ? 'Nedostatok' : 'Dostatok'}
                </span>
            </div>
            <div class="quantity-badge">
                ${item.quantity.toFixed(1)} L
            </div>
        </div>
    `;
}

function openModal(oilId) {
    activeOil = oils.find(oil => oil.id === oilId);
    if (!activeOil) return;
    elements.modalTitle.textContent = activeOil.name;
    elements.amountInput.value = '';
    elements.modal.classList.add('active');
    elements.modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
    elements.modal.classList.remove('active');
    elements.modal.setAttribute('aria-hidden', 'true');
    activeOil = null;
}

async function applyAdjustment(amount, type) {
    if (!activeOil || !window.DatabaseService?.adjustOilQuantity) return;
    
    const normalized = Math.max(0, amount);
    const delta = type === 'remove' ? -normalized : normalized;
    try {
        await window.DatabaseService.adjustOilQuantity(activeOil.id, activeOil.category, delta);
    } catch (error) {
        console.error('Chyba pri úprave zásoby:', error);
        if (error.message === 'AUTH_REQUIRED') {
            alert('Chyba pri autentifikácii. Skúste to znova.');
        } else {
            alert('Úprava zásoby zlyhala. Skúste to znova.');
        }
    }
}

async function handleCreateOil(event) {
    event.preventDefault();
    if (!elements.createForm) return;

    if (!window.DatabaseService?.createOil) {
        setCreateMessage('Chýba napojenie na databázu. Skontrolujte konfiguráciu.', 'error');
        return;
    }

    const formData = new FormData(elements.createForm);
    const name = (formData.get('name') || '').trim();
    const category = (formData.get('category') || 'motorove').trim();
    const quantityValue = parseFloat(formData.get('quantity'));

    if (!name) {
        setCreateMessage('Zadajte názov položky.', 'error');
        return;
    }

    if (isNaN(quantityValue)) {
        setCreateMessage('Zadajte platné množstvo.', 'error');
        return;
    }

    setCreateMessage('');
    setCreateLoading(true);

    try {
        await window.DatabaseService.createOil({
            name,
            category,
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
}

function closeCreateModal() {
    if (!elements.createModal) return;
    elements.createModal.classList.remove('active');
    elements.createModal.setAttribute('aria-hidden', 'true');
    setCreateMessage('');
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
        const amount = parseFloat(elements.amountInput.value);
        if (isNaN(amount)) {
            alert('Zadajte množstvo v litroch.');
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
            const amount = parseFloat(button.dataset.amount);
            elements.amountInput.value = amount;
            elements.form.querySelector('input[value="remove"]').checked = true;
        });
    });

    if (elements.createForm) {
        elements.createForm.addEventListener('submit', handleCreateOil);
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
    try {
        await waitForAuthenticatedUser();
    } catch (error) {
        console.error('Chyba pri čakaní na autentifikáciu:', error);
        return;
    }
    await subscribeToOils();
});

