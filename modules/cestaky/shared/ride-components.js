/**
 * Cestaky Shared Ride Components
 * Common UI rendering functions for both driver and admin views
 */

/**
 * Format date string to Slovak format
 * @param {string} dateStr 
 * @returns {string}
 */
function formatDate(dateStr) {
    if (!dateStr) return 'Neznámy dátum';
    try {
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr;
    }
}

/**
 * Format date and time together
 * @param {string} dateStr 
 * @param {string} timeStr 
 * @returns {string}
 */
function formatDateTime(dateStr, timeStr) {
    const date = formatDate(dateStr);
    if (!timeStr) return date;
    return `${date} ${timeStr}`;
}

/**
 * Calculate total km from odometer readings
 * @param {number} start 
 * @param {number} end 
 * @returns {string}
 */
function calculateTotalKm(start, end) {
    const startOdo = parseFloat(start);
    const endOdo = parseFloat(end);
    if (isNaN(startOdo) || isNaN(endOdo) || endOdo < startOdo) return '-';
    return (endOdo - startOdo).toFixed(1) + ' km';
}

/**
 * Render a ride card for history list
 * @param {Object} ride 
 * @param {Object} options 
 * @returns {HTMLElement}
 */
function renderRideCard(ride, options = {}) {
    const { onClick, showDriver = true } = options;
    const isCompleted = ride.completed === true;
    const header = ride.header || {};
    
    const startDate = header.startDate || ride.id.split('_')[0] || 'Neznámy dátum';
    const endDate = header.endDate || null;
    const driver = header.driver || ride.driverName || 'Vodič';
    const vehicle = header.vehiclePlate || '-';
    const trailer = header.trailerPlate || '-';
    const distance = calculateTotalKm(header.startOdometer, header.endOdometer);
    const startTime = header.startTime || '';
    const endTime = header.endTime || '';
    const timeRange = startTime || endTime ? `${startTime || '-'}${endTime ? ' - ' + endTime : ''}` : '-';
    const driveId = ride.displayDriveId || null;
    
    // Format date range
    let dateRange = formatDate(startDate);
    if (endDate) {
        dateRange += ' - ' + formatDate(endDate);
    } else if (!isCompleted) {
        dateRange += ' - prebieha';
    }
    
    const item = document.createElement('div');
    item.className = 'history-item';
    if (onClick) {
        item.onclick = () => onClick(ride);
        item.style.cursor = 'pointer';
    }
    
    item.innerHTML = `
        <div class="history-item-header">
            <div class="history-item-title">
                <div class="history-item-id">${driveId ? driveId : dateRange}</div>
                <div class="history-item-dates">${dateRange}</div>
            </div>
            <div class="history-item-status ${isCompleted ? 'completed' : 'in-progress'}">
                ${isCompleted ? 'Dokončené' : 'Prebieha'}
            </div>
        </div>
        <div class="history-item-body">
            <div class="history-item-column">
                ${showDriver ? `
                <div class="history-item-row">
                    <span class="material-symbols-outlined history-item-icon">person</span>
                    <span class="history-item-value">${driver}</span>
                </div>
                ` : ''}
                <div class="history-item-row">
                    <span class="material-symbols-outlined history-item-icon">schedule</span>
                    <span class="history-item-value">${timeRange}</span>
                </div>
                <div class="history-item-row">
                    <span class="material-symbols-outlined history-item-icon">straighten</span>
                    <span class="history-item-value">${distance}</span>
                </div>
            </div>
            <div class="history-item-column history-item-column-right">
                <div class="history-item-row">
                    <span class="material-symbols-outlined history-item-icon">directions_car</span>
                    <span class="history-item-value">${vehicle}</span>
                </div>
                ${trailer !== '-' ? `
                <div class="history-item-row">
                    <span class="material-symbols-outlined history-item-icon">local_shipping</span>
                    <span class="history-item-value">${trailer}</span>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    
    return item;
}

/**
 * Render a driver card for admin view
 * @param {Object} driver 
 * @param {Object} options 
 * @returns {HTMLElement}
 */
function renderDriverCard(driver, options = {}) {
    const { onClick } = options;
    
    const card = document.createElement('div');
    card.className = 'driver-card';
    if (onClick) {
        card.onclick = () => onClick(driver);
        card.style.cursor = 'pointer';
    }
    
    // Get latest ride info
    const latestRide = driver.latestRide;
    let latestInfo = 'Žiadne jazdy';
    if (latestRide) {
        const date = latestRide.startDate || latestRide.header?.startDate;
        latestInfo = date ? formatDate(date) : 'Neznámy dátum';
    }
    
    card.innerHTML = `
        <div class="driver-card-header">
            <div class="driver-card-avatar">
                <span class="material-symbols-outlined">person</span>
            </div>
            <div class="driver-card-info">
                <div class="driver-card-name">${driver.name}</div>
                <div class="driver-card-stats">
                    <span class="stat-badge completed">${driver.completedRides} dokončených</span>
                    ${driver.inProgressRides > 0 ? `<span class="stat-badge in-progress">${driver.inProgressRides} prebieha</span>` : ''}
                </div>
            </div>
        </div>
        <div class="driver-card-footer">
            <span class="material-symbols-outlined">history</span>
            <span>Posledná jazda: ${latestInfo}</span>
        </div>
    `;
    
    return card;
}

/**
 * Render read-only fields for ride view
 * @param {Object} data 
 * @param {Array} fields 
 * @returns {string}
 */
function renderReadonlyFields(data, fields) {
    let html = '';
    fields.forEach(field => {
        let value = data[field.key];
        if (field.format && value != null) {
            value = field.format(value);
        }
        const isEmpty = value == null || value === '';
        html += `
            <div class="readonly-field">
                <div class="readonly-field-label">${field.label}</div>
                <div class="readonly-field-value ${isEmpty ? 'empty' : ''}">${isEmpty ? '-' : value}</div>
            </div>
        `;
    });
    return html;
}

/**
 * Render read-only entry (fuel/border/stop)
 * @param {string} title 
 * @param {Array} rows 
 * @returns {string}
 */
function renderReadonlyEntry(title, rows) {
    let html = `<div class="readonly-entry"><div class="readonly-entry-title">${title}</div>`;
    rows.forEach(row => {
        const isEmpty = row.value == null || row.value === '';
        html += `
            <div class="readonly-field">
                <div class="readonly-field-label">${row.label}</div>
                <div class="readonly-field-value ${isEmpty ? 'empty' : ''}">${isEmpty ? '-' : row.value}</div>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

/**
 * Render complete ride view (read-only)
 * @param {Object} rideData 
 * @returns {string}
 */
function renderRideView(rideData) {
    const header = rideData.header || {};
    const fuel = rideData.fuel || [];
    const borders = rideData.borders || [];
    const stops = rideData.stops || [];

    let html = '';

    // Header section
    html += '<div class="view-ride-section">';
    html += '<div class="view-ride-section-title"><span class="material-symbols-outlined">description</span>Hlavička jazdy</div>';
    html += renderReadonlyFields(header, [
        { key: 'startDate', label: 'Dátum začiatku' },
        { key: 'startTime', label: 'Čas začiatku' },
        { key: 'endDate', label: 'Dátum konca' },
        { key: 'endTime', label: 'Čas konca' },
        { key: 'startOdometer', label: 'Začiatočný stav (km)', format: (v) => v != null ? v.toFixed(1) : null },
        { key: 'endOdometer', label: 'Konečný stav (km)', format: (v) => v != null ? v.toFixed(1) : null },
    ]);
    html += '</div>';

    // Fuel section
    if (fuel.length > 0) {
        html += '<div class="view-ride-section">';
        html += '<div class="view-ride-section-title"><span class="material-symbols-outlined">local_gas_station</span>Tankovania</div>';
        
        const paymentLabels = {
            'eurowag': 'Eurowag',
            'as24': 'AS24',
            'benzina': 'Benzina',
            'cash': 'Hotovosť'
        };

        fuel.forEach((f, i) => {
            html += renderReadonlyEntry(`Tankovanie #${i + 1}`, [
                { label: 'Dátum a čas', value: formatDateTime(f.date, f.time) },
                { label: 'Miesto', value: f.location },
                { label: 'Množstvo', value: f.amount != null ? `${f.amount} l` : null },
                { label: 'Cena', value: f.totalPrice != null ? `${f.totalPrice} €` : null },
                { label: 'Tachometer', value: f.odometer != null ? `${f.odometer} km` : null },
                { label: 'Platba', value: paymentLabels[f.payment] || f.payment },
            ]);
        });
        html += '</div>';
    }

    // Borders section
    if (borders.length > 0) {
        html += '<div class="view-ride-section">';
        html += '<div class="view-ride-section-title"><span class="material-symbols-outlined">public</span>Prechody hraníc</div>';
        
        const countryNames = window.CestakyFirebase?.countryNames || {};

        borders.forEach((b, i) => {
            const fromName = countryNames[b.from] || b.from;
            const toName = countryNames[b.to] || b.to;
            html += renderReadonlyEntry(`Prechod #${i + 1}`, [
                { label: 'Dátum a čas', value: formatDateTime(b.date, b.time) },
                { label: 'Z krajiny', value: fromName },
                { label: 'Do krajiny', value: toName },
                { label: 'Tachometer', value: b.odometer != null ? `${b.odometer} km` : null },
            ]);
        });
        html += '</div>';
    }

    // Stops section
    if (stops.length > 0) {
        html += '<div class="view-ride-section">';
        html += '<div class="view-ride-section-title"><span class="material-symbols-outlined">pin_drop</span>Zastávky</div>';

        stops.forEach((s, i) => {
            const arrivalDT = formatDateTime(s.arrivalDate, s.arrival);
            const departureDT = s.departure ? formatDateTime(s.departureDate, s.departure) : null;
            html += renderReadonlyEntry(`Zastávka #${i + 1}`, [
                { label: 'Miesto', value: s.location },
                { label: 'Príchod', value: arrivalDT },
                { label: 'Odchod', value: departureDT },
                { label: 'Tachometer', value: s.odometer != null ? `${s.odometer} km` : null },
                { label: 'Naložené', value: s.loaded },
                { label: 'Vyložené', value: s.unloaded },
                { label: 'Poznámka', value: s.note },
            ]);
        });
        html += '</div>';
    }

    return html;
}

/**
 * Render loading state
 * @param {string} message 
 * @returns {string}
 */
function renderLoading(message = 'Načítavam...') {
    return `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>${message}</p>
        </div>
    `;
}

/**
 * Render empty state
 * @param {string} message 
 * @returns {string}
 */
function renderEmptyState(message) {
    return `<p class="empty-state">${message}</p>`;
}

/**
 * Render error state
 * @param {string} message 
 * @returns {string}
 */
function renderErrorState(message) {
    return `<p class="empty-state error-state">${message}</p>`;
}

// Export for use in other modules
window.CestakyComponents = {
    formatDate,
    formatDateTime,
    calculateTotalKm,
    renderRideCard,
    renderDriverCard,
    renderReadonlyFields,
    renderReadonlyEntry,
    renderRideView,
    renderLoading,
    renderEmptyState,
    renderErrorState
};

