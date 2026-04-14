// ==========================================
// PICAM v4.0 - inventario.js
// Inventario tri-modale con UX migliorata:
// highlight riga, lente ingrandimento, ritorno posizione
// ==========================================

APP.invMode = 'selector';
APP.invTabellareData = [];
APP.invTabellareType = '';
APP.invFocusIndex = -1;
APP.invTabellareScrollPos = 0;

APP.openInventario = function() {
    APP.currentContext = 'inventario';
    APP.showScreen('inventario');
    APP.updateHeaderQueueCount('inv');
    APP.renderHistory();
    APP.showModeSelector();
};

APP.showModeSelector = function() {
    APP.invMode = 'selector';
    APP.invFocusIndex = -1;
    document.getElementById('inv-mode-selector').style.display = 'block';
    document.getElementById('inv-scansione-mode').style.display = 'none';
    document.getElementById('inv-tabellare-mode').style.display = 'none';
    APP.hideMagnifier();
};

APP.setInvMode = function(mode) {
    APP.invMode = mode;
    document.getElementById('inv-mode-selector').style.display = 'none';
    if (mode === 'scansione') {
        document.getElementById('inv-scansione-mode').style.display = 'block';
        document.getElementById('inv-tabellare-mode').style.display = 'none';
    }
};

APP.showLocazioneSelector = async function() {
    APP.invMode = 'locazione';
    APP.invTabellareType = 'locazione';
    APP.invFocusIndex = -1;
    document.getElementById('inv-mode-selector').style.display = 'none';
    document.getElementById('inv-scansione-mode').style.display = 'none';
    document.getElementById('inv-tabellare-mode').style.display = 'block';
    document.getElementById('inv-tab-info').innerHTML = `<span class="info-icon">📍</span><span>Inventario per Locazione</span>`;
    const select = document.getElementById('inv-tab-select');
    select.innerHTML = '<option value="">-- Seleziona Locazione --</option>';
    try {
        const locazioni = await DB.getAllLocazioni();
        locazioni.forEach(loc => {
            select.innerHTML += `<option value="${loc.codice}">${loc.codice}</option>`;
        });
    } catch(e) {}
    document.getElementById('inv-tab-tbody').innerHTML = '';
    document.getElementById('inv-tab-actions').style.display = 'none';
};

APP.showGruppoSelector = async function() {
    APP.invMode = 'gruppo';
    APP.invTabellareType = 'gruppo';
    APP.invFocusIndex = -1;
    document.getElementById('inv-mode-selector').style.display = 'none';
    document.getElementById('inv-scansione-mode').style.display = 'none';
    document.getElementById('inv-tabellare-mode').style.display = 'block';
    document.getElementById('inv-tab-info').innerHTML = `<span class="info-icon">📦</span><span>Inventario per Gruppo Merceologico</span>`;
    const select = document.getElementById('inv-tab-select');
    select.innerHTML = '<option value="">-- Seleziona Gruppo --</option>';
    try {
        const gruppi = await DB.getAllGruppiMerceologici();
        gruppi.forEach(g => {
            select.innerHTML += `<option value="${g.codice}">${g.codice} - ${g.descrizione}</option>`;
        });
    } catch(e) {}
    document.getElementById('inv-tab-tbody').innerHTML = '';
    document.getElementById('inv-tab-actions').style.display = 'none';
};

APP.loadArticoliTabellare = async function() {
    const select = document.getElementById('inv-tab-select');
    const value = select.value;
    const tbody = document.getElementById('inv-tab-tbody');
    const actions = document.getElementById('inv-tab-actions');
    APP.invFocusIndex = -1;
    APP.hideMagnifier();
    if (!value) { tbody.innerHTML = ''; actions.style.display = 'none'; return; }
    try {
        let articoli = [];
        if (APP.invTabellareType === 'locazione') {
            articoli = await DB.getArticoliByLocazione(value);
        } else if (APP.invTabellareType === 'gruppo') {
            articoli = await DB.getArticoliByGruppo(value);
        }
        APP.invTabellareData = articoli.map(art => ({ ...art, qtyInventario: 0 }));
        APP.renderTabellareArticoli();
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="5" class="inv-tab-empty">Errore caricamento</td></tr>';
    }
};

APP.renderTabellareArticoli = function() {
    const tbody   = document.getElementById('inv-tab-tbody');
    const actions = document.getElementById('inv-tab-actions');
    const countEl = document.getElementById('inv-tab-count');

    if (APP.invTabellareData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="inv-tab-empty"><div class="inv-tab-empty-icon">📭</div><p>Nessun articolo trovato</p></div></td></tr>`;
        actions.style.display = 'none';
        return;
    }

    let html = '';
    APP.invTabellareData.forEach((art, index) => {
        const hasQty = art.qtyInventario > 0;
        const isFocus = index === APP.invFocusIndex;
        html += `
            <tr class="inv-tab-row${isFocus ? ' inv-row-focus' : ''}" data-idx="${index}"
                onclick="APP.tapTabellareRow(${index})">
                <td class="cell-code">${art.codice}</td>
                <td class="cell-desc" title="${art.des1 || ''}">${art.des1 || ''}</td>
                <td class="cell-loc">${art.locazione || '-'}</td>
                <td>
                    <input type="number"
                           class="input-qty ${hasQty ? 'has-value' : ''}"
                           value="${art.qtyInventario || ''}"
                           placeholder="0" min="0"
                           data-index="${index}"
                           onclick="event.stopPropagation()"
                           onchange="APP.updateTabellareQty(${index}, this.value)"
                           onfocus="event.stopPropagation(); APP.focusTabellareRow(${index}); this.select()">
                </td>
                <td>
                    <button class="btn-quick-add"
                            onclick="event.stopPropagation(); APP.quickAddTabellare(${index})"
                            ${hasQty ? 'disabled' : ''} title="Aggiungi 1">+</button>
                </td>
            </tr>`;
    });
    tbody.innerHTML = html;

    const countWithQty = APP.invTabellareData.filter(a => a.qtyInventario > 0).length;
    countEl.textContent = countWithQty;
    actions.style.display = countWithQty > 0 ? 'block' : 'none';

    // Ripristina focus se era impostato
    if (APP.invFocusIndex >= 0) {
        setTimeout(() => APP.highlightTabellareRow(APP.invFocusIndex), 50);
    }
};

// Imposta focus visivo su una riga
APP.focusTabellareRow = function(index) {
    APP.invFocusIndex = index;
    APP.highlightTabellareRow(index);
    // Mostra lente solo in modalità tabellare
    if (APP.invMode === 'locazione' || APP.invMode === 'gruppo') {
        APP.showMagnifier(index);
    }
};

APP.highlightTabellareRow = function(index) {
    document.querySelectorAll('.inv-tab-row').forEach(r => r.classList.remove('inv-row-focus'));
    const row = document.querySelector(`.inv-tab-row[data-idx="${index}"]`);
    if (row) {
        row.classList.add('inv-row-focus');
        // Scroll in view se fuori viewport
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
};

// Mostra la lente di ingrandimento con i dati dell'articolo
APP.showMagnifier = function(index) {
    const art = APP.invTabellareData[index];
    if (!art) return;

    let mag = document.getElementById('inv-magnifier');
    if (!mag) {
        mag = document.createElement('div');
        mag.id = 'inv-magnifier';
        mag.className = 'inv-magnifier';
        document.body.appendChild(mag);
    }

    mag.innerHTML = `
        <div class="mag-code">${art.codice}</div>
        <div class="mag-desc">${art.des1 || ''}</div>
        ${art.des2 ? `<div class="mag-desc2">${art.des2}</div>` : ''}
        <div class="mag-info">
            📍 ${art.locazione || '-'} &nbsp;|&nbsp;
            📦 Giac: ${art.giacenza || 0} &nbsp;|&nbsp;
            💶 ${APP.formatCurrency(art.prezzoVendita || art.prezzo)}
        </div>
        <div class="mag-hint">Tocca di nuovo per inserire quantità</div>
    `;
    mag.classList.add('visible');

    if (APP._magTimer) clearTimeout(APP._magTimer);
    APP._magTimer = setTimeout(() => APP.hideMagnifier(), 4000);
};

APP.hideMagnifier = function() {
    const mag = document.getElementById('inv-magnifier');
    if (mag) mag.classList.remove('visible');
};

// Doppio tap su riga focalizzata → apri modal qty
APP._lastTapTime = 0;
APP._lastTapIdx = -1;
APP.tapTabellareRow = function(index) {
    const now = Date.now();
    if (APP._lastTapIdx === index && (now - APP._lastTapTime) < 500) {
        // Doppio tap → inserisci quantità
        APP._lastTapTime = 0; APP._lastTapIdx = -1;
        APP.selectedArticolo = APP.invTabellareData[index];
        APP.qtyContext = 'inv';
        APP.currentContext = 'inventario';
        APP.openQtyModal();
    } else {
        APP._lastTapTime = now;
        APP._lastTapIdx = index;
        APP.focusTabellareRow(index);
    }
};

APP.updateTabellareQty = function(index, value) {
    const qty = parseInt(value) || 0;
    APP.invTabellareData[index].qtyInventario = qty;
    const input = document.querySelector(`input[data-index="${index}"]`);
    if (input) input.classList.toggle('has-value', qty > 0);
    const btn = input?.parentElement?.nextElementSibling?.querySelector('button');
    if (btn) btn.disabled = qty > 0;
    const countWithQty = APP.invTabellareData.filter(a => a.qtyInventario > 0).length;
    document.getElementById('inv-tab-count').textContent = countWithQty;
    document.getElementById('inv-tab-actions').style.display = countWithQty > 0 ? 'block' : 'none';
};

APP.quickAddTabellare = function(index) {
    APP.invTabellareData[index].qtyInventario = 1;
    const input = document.querySelector(`input[data-index="${index}"]`);
    if (input) { input.value = 1; input.classList.add('has-value'); }
    const btn = input?.parentElement?.nextElementSibling?.querySelector('button');
    if (btn) btn.disabled = true;
    const countWithQty = APP.invTabellareData.filter(a => a.qtyInventario > 0).length;
    document.getElementById('inv-tab-count').textContent = countWithQty;
    document.getElementById('inv-tab-actions').style.display = 'block';
    APP.showToast(`${APP.invTabellareData[index].codice} +1`, 'success');
};

APP.confirmAllInventario = async function() {
    const articoliConQty = APP.invTabellareData.filter(a => a.qtyInventario > 0);
    if (articoliConQty.length === 0) { APP.showToast('Nessun articolo con quantità', 'error'); return; }
    if (!confirm(`Confermi l'inventariazione di ${articoliConQty.length} articoli?`)) return;
    for (const art of articoliConQty) {
        await APP.addToInventarioQueue(art, art.qtyInventario);
    }
    APP.showToast(`${articoliConQty.length} articoli aggiunti alla coda`, 'success');
    APP.invTabellareData = APP.invTabellareData.map(a => ({ ...a, qtyInventario: 0 }));
    APP.invFocusIndex = -1;
    APP.renderTabellareArticoli();
    APP.updateHeaderQueueCount('inv');
};

APP.addToInventarioQueue = async function(articolo, qty, locazione = null) {
    const item = {
        codice: articolo.codice,
        des1: articolo.des1,
        des2: articolo.des2 || '',
        um: articolo.um || '',
        giacenza: articolo.giacenza || 0,
        locazione: locazione || articolo.locazione || '',
        gruppo: articolo.gruppo || '',
        qty,
        timestamp: Date.now()
    };
    await DB.addToQueue('queueInventario', item);
};
